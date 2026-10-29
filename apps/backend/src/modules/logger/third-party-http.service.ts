import { Injectable, Logger } from '@nestjs/common';
import { AppJsonLoggerService } from './app-json-logger.service';
import { RequestContextService } from './request-context.service';
import { redactHttpHeaders, redactSensitiveData } from './redactor.util';

export interface HttpRequestOptions extends RequestInit {
  target?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

export interface HttpResponse<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  durationMs: number;
}

@Injectable()
export class ThirdPartyHttpService {
  private readonly consoleLogger = new Logger(ThirdPartyHttpService.name);

  constructor(private readonly jsonLogger: AppJsonLoggerService) {}

  /**
   * Executes an outbound HTTP request with automatic tracing, redacted JSON logging,
   * exponential backoff retries on transient errors, and timeout protection.
   */
  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const target = options.target || this.inferTarget(url);
    const method = (options.method || 'GET').toUpperCase();
    const maxRetries = options.maxRetries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 400;
    const maxDelayMs = options.maxDelayMs ?? 4000;
    const timeoutMs = options.timeoutMs ?? 15000;
    const traceId = RequestContextService.getTraceId();

    // Prepare headers with Trace ID
    const outgoingHeaders = new Headers(options.headers || {});
    if (!outgoingHeaders.has('x-trace-id')) {
      outgoingHeaders.set('x-trace-id', traceId);
    }

    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      attempt++;
      const startTime = Date.now();

      // Log Outgoing Request
      const serializedHeaders: Record<string, string> = {};
      outgoingHeaders.forEach((val, key) => {
        serializedHeaders[key] = val;
      });

      this.jsonLogger.logThirdPartyRequest({
        target,
        method,
        url,
        attempt,
        headers: redactHttpHeaders(serializedHeaders),
        body: options.body ? redactSensitiveData(this.safeParseBody(options.body)) : undefined,
      });

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          method,
          headers: outgoingHeaders,
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        // Try reading body for structured logging and return
        let parsedData: any = null;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          try {
            parsedData = await response.json();
          } catch {
            parsedData = null;
          }
        } else {
          try {
            parsedData = await response.text();
          } catch {
            parsedData = null;
          }
        }

        // Log Response
        this.jsonLogger.logThirdPartyResponse({
          target,
          method,
          url,
          statusCode: response.status,
          durationMs,
          attempt,
          responseSnippet: redactSensitiveData(
            typeof parsedData === 'object'
              ? parsedData
              : { length: typeof parsedData === 'string' ? parsedData.length : 0 }
          ),
        });

        // Check if transient error eligible for retry
        const isTransient = this.isTransientStatus(response.status);
        if (isTransient && attempt <= maxRetries) {
          const retryAfterMs = this.getRetryAfterMs(response.headers);
          const backoffMs = retryAfterMs || this.calculateBackoff(attempt, baseDelayMs, maxDelayMs);

          this.jsonLogger.logThirdPartyRetry({
            target,
            url,
            attempt,
            nextDelayMs: backoffMs,
            reason: `HTTP Status ${response.status}`,
          });

          await this.sleep(backoffMs);
          continue;
        }

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: parsedData as T,
          durationMs,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        lastError = err;

        this.jsonLogger.logThirdPartyResponse({
          target,
          method,
          url,
          statusCode: err.name === 'AbortError' ? 408 : 500,
          durationMs,
          attempt,
          responseSnippet: { error: err.message, name: err.name },
        });

        if (attempt <= maxRetries) {
          const backoffMs = this.calculateBackoff(attempt, baseDelayMs, maxDelayMs);
          this.jsonLogger.logThirdPartyRetry({
            target,
            url,
            attempt,
            nextDelayMs: backoffMs,
            reason: `Network/Timeout error: ${err.message}`,
          });

          await this.sleep(backoffMs);
          continue;
        }

        throw err;
      }
    }

    throw lastError || new Error(`Third party request to ${url} failed after ${maxRetries} attempts`);
  }

  /**
   * Helper: GET request
   */
  async get<T = any>(url: string, options?: Omit<HttpRequestOptions, 'method'>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * Helper: POST request
   */
  async post<T = any>(
    url: string,
    body?: any,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    const isJson = body && typeof body === 'object' && !(body instanceof FormData);
    const headers = new Headers(options?.headers || {});

    if (isJson && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return this.request<T>(url, {
      ...options,
      method: 'POST',
      headers,
      body: isJson ? JSON.stringify(body) : body,
    });
  }

  /**
   * Creates a standard fetch function bound to this service.
   * Enables injecting this resilient wrapper into Octokit or other SDKs that accept a custom fetch option!
   */
  createWrappedFetch(targetName = 'ThirdPartyApi') {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const res = await this.request(url, {
        ...(init || {}),
        target: targetName,
      });

      // Construct standard Web API Response
      const body =
        typeof res.data === 'object' ? JSON.stringify(res.data) : typeof res.data === 'string' ? res.data : '';

      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    };
  }

  private isTransientStatus(status: number): boolean {
    // 429 Too Many Requests, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
    const exponential = baseMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 100;
    return Math.min(maxMs, exponential + jitter);
  }

  private getRetryAfterMs(headers: Headers): number | null {
    const retryAfter = headers.get('retry-after');
    if (!retryAfter) return null;

    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    const date = new Date(retryAfter).getTime();
    if (!isNaN(date)) {
      const diff = date - Date.now();
      return diff > 0 ? diff : 1000;
    }

    return null;
  }

  private safeParseBody(body: any): any {
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }

  private inferTarget(url: string): string {
    if (url.includes('github.com') || url.includes('api.github.com')) return 'GITHUB_API';
    if (url.includes('googleapis.com')) return 'GOOGLE_API';
    return 'EXTERNAL_HTTP';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
