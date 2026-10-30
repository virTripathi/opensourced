import { Injectable, LoggerService, OnApplicationShutdown, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RequestContextService } from './request-context.service';
import { redactSensitiveData, maskUrlQueryParams } from './redactor.util';

export interface StructuredLogEntry {
  timestamp?: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  traceId?: string;
  event: string;
  context?: string;
  client?: {
    ip?: string;
    userId?: string;
    userAgent?: string;
  };
  http?: {
    target?: string;
    method?: string;
    url?: string;
    statusCode?: number;
    durationMs?: number;
    attempt?: number;
  };
  payload?: any;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}

import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppJsonLoggerService implements LoggerService, OnApplicationShutdown {
  private logFilePath: string;
  private writeStream: fs.WriteStream | null = null;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.logFilePath = this.resolveLogPath();
    this.initStream();
  }

  private resolveLogPath(): string {
    const configuredPath =
      this.configService?.get<string>('logger.filePath') ||
      process.env.LOG_FILE_PATH;

    if (configuredPath) {
      return path.resolve(configuredPath);
    }

    // Determine if executing from apps/backend or monorepo root
    const cwd = process.cwd();
    const candidateSub = path.resolve(cwd, 'apps', 'backend', 'logs', 'app.log.json');
    if (fs.existsSync(path.resolve(cwd, 'apps', 'backend'))) {
      return candidateSub;
    }

    return path.resolve(cwd, 'logs', 'app.log.json');
  }

  private initStream() {
    try {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.writeStream = fs.createWriteStream(this.logFilePath, {
        flags: 'a',
        encoding: 'utf8',
      });

      this.writeStream.on('error', (err) => {
        console.error(`[AppJsonLoggerService] WriteStream error on ${this.logFilePath}:`, err);
      });
    } catch (err: any) {
      console.error(`[AppJsonLoggerService] Could not initialize log file ${this.logFilePath}:`, err.message);
    }
  }

  /**
   * Writes a structured JSON log entry to app.log.json after deep redaction
   */
  writeEntry(entry: StructuredLogEntry) {
    try {
      const traceId = entry.traceId || RequestContextService.getTraceId();
      const userId = entry.client?.userId || RequestContextService.getUserId();

      const finalRecord: StructuredLogEntry = {
        timestamp: entry.timestamp || new Date().toISOString(),
        level: entry.level,
        traceId,
        event: entry.event,
        context: entry.context || 'Application',
        client: {
          ...entry.client,
          userId: userId || entry.client?.userId,
        },
        http: entry.http
          ? {
              ...entry.http,
              url: entry.http.url ? maskUrlQueryParams(entry.http.url) : undefined,
            }
          : undefined,
        payload: entry.payload ? redactSensitiveData(entry.payload) : undefined,
        error: entry.error
          ? {
              ...entry.error,
              message: redactSensitiveData(entry.error.message),
              stack: entry.error.stack ? redactSensitiveData(entry.error.stack) : undefined,
            }
          : undefined,
        metadata: entry.metadata ? redactSensitiveData(entry.metadata) : undefined,
      };

      const line = JSON.stringify(finalRecord) + '\n';

      if (this.writeStream && this.writeStream.writable) {
        this.writeStream.write(line);
      } else {
        // Fallback synchronous append if stream was closed or unavailable
        fs.appendFileSync(this.logFilePath, line, 'utf8');
      }
    } catch (err: any) {
      console.error('[AppJsonLoggerService] Failed to write log entry:', err.message);
    }
  }

  // ============================================================================
  // Specialized Lifecycle Log Methods
  // ============================================================================

  logIncomingRequest(data: {
    method: string;
    url: string;
    ip?: string;
    userId?: string;
    userAgent?: string;
    body?: any;
    query?: any;
  }) {
    this.writeEntry({
      level: 'INFO',
      event: 'INCOMING_HTTP_REQUEST',
      context: 'HttpLoggingInterceptor',
      client: {
        ip: data.ip,
        userId: data.userId,
        userAgent: data.userAgent,
      },
      http: {
        method: data.method,
        url: data.url,
      },
      payload: {
        query: data.query,
        body: data.body,
      },
    });
  }

  logOutgoingResponse(data: {
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    userId?: string;
  }) {
    this.writeEntry({
      level: data.statusCode >= 400 ? 'WARN' : 'INFO',
      event: 'OUTGOING_HTTP_RESPONSE',
      context: 'HttpLoggingInterceptor',
      client: {
        userId: data.userId,
      },
      http: {
        method: data.method,
        url: data.url,
        statusCode: data.statusCode,
        durationMs: data.durationMs,
      },
    });
  }

  logThirdPartyRequest(data: {
    target: string;
    method: string;
    url: string;
    attempt?: number;
    body?: any;
    headers?: Record<string, any>;
  }) {
    this.writeEntry({
      level: 'INFO',
      event: 'THIRD_PARTY_REQUEST_OUTGOING',
      context: 'ThirdPartyHttpClient',
      http: {
        target: data.target,
        method: data.method,
        url: data.url,
        attempt: data.attempt || 1,
      },
      payload: {
        headers: data.headers,
        body: data.body,
      },
    });
  }

  logThirdPartyResponse(data: {
    target: string;
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    attempt?: number;
    responseSnippet?: any;
  }) {
    this.writeEntry({
      level: data.statusCode >= 400 ? 'WARN' : 'INFO',
      event: 'THIRD_PARTY_RESPONSE_INCOMING',
      context: 'ThirdPartyHttpClient',
      http: {
        target: data.target,
        method: data.method,
        url: data.url,
        statusCode: data.statusCode,
        durationMs: data.durationMs,
        attempt: data.attempt || 1,
      },
      payload: data.responseSnippet,
    });
  }

  logThirdPartyRetry(data: {
    target: string;
    attempt: number;
    nextDelayMs: number;
    reason: string;
    url: string;
  }) {
    this.writeEntry({
      level: 'WARN',
      event: 'THIRD_PARTY_RETRY',
      context: 'ThirdPartyHttpClient',
      http: {
        target: data.target,
        url: data.url,
        attempt: data.attempt,
      },
      metadata: {
        nextDelayMs: data.nextDelayMs,
        reason: data.reason,
      },
    });
  }

  logGeminiPrompt(data: {
    model: string;
    turn?: number;
    prompt?: string;
    contents?: any;
    options?: Record<string, any>;
  }) {
    this.writeEntry({
      level: 'INFO',
      event: 'GEMINI_PROMPT_OUTGOING',
      context: 'GeminiProviderStrategy',
      http: {
        target: 'GOOGLE_GEMINI',
        method: 'generateContent',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${data.model}`,
        attempt: data.turn || 1,
      },
      payload: {
        model: data.model,
        turn: data.turn,
        prompt: data.prompt,
        contents: data.contents,
        options: data.options,
      },
    });
  }

  logGeminiResponse(data: {
    model: string;
    turn?: number;
    durationMs: number;
    statusCode?: number;
    candidateCount?: number;
    functionCalls?: Array<{ name: string; args: Record<string, any> }>;
    textSnippet?: string;
    error?: string;
  }) {
    this.writeEntry({
      level: data.error || (data.statusCode && data.statusCode >= 400) ? 'ERROR' : 'INFO',
      event: 'GEMINI_RESPONSE_INCOMING',
      context: 'GeminiProviderStrategy',
      http: {
        target: 'GOOGLE_GEMINI',
        method: 'generateContent',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${data.model}`,
        statusCode: data.statusCode || (data.error ? 500 : 200),
        durationMs: data.durationMs,
        attempt: data.turn || 1,
      },
      payload: {
        model: data.model,
        turn: data.turn,
        candidateCount: data.candidateCount,
        functionCalls: data.functionCalls,
        textSnippet: data.textSnippet,
        error: data.error,
      },
      error: data.error ? { message: data.error } : undefined,
    });
  }

  logGeminiToolCall(data: {
    tool: string;
    turn: number;
    params: Record<string, any>;
  }) {
    this.writeEntry({
      level: 'INFO',
      event: 'GEMINI_TOOL_CALL',
      context: 'GeminiProviderStrategy',
      payload: {
        tool: data.tool,
        turn: data.turn,
        params: data.params,
      },
    });
  }

  logGeminiToolResult(data: {
    tool: string;
    turn: number;
    durationMs: number;
    result: any;
    error?: string;
  }) {
    this.writeEntry({
      level: data.error ? 'WARN' : 'INFO',
      event: 'GEMINI_TOOL_RESULT',
      context: 'GeminiProviderStrategy',
      payload: {
        tool: data.tool,
        turn: data.turn,
        durationMs: data.durationMs,
        result: data.result,
        error: data.error,
      },
      error: data.error ? { message: data.error } : undefined,
    });
  }

  // ============================================================================
  // NestJS LoggerService standard implementations
  // ============================================================================

  log(message: any, context?: string) {
    this.writeEntry({
      level: 'INFO',
      event: 'APP_LOG',
      context,
      payload: typeof message === 'object' ? message : { message },
    });
  }

  error(message: any, trace?: string, context?: string) {
    this.writeEntry({
      level: 'ERROR',
      event: 'APP_ERROR',
      context,
      error: {
        message: typeof message === 'string' ? message : JSON.stringify(message),
        stack: trace,
      },
    });
  }

  warn(message: any, context?: string) {
    this.writeEntry({
      level: 'WARN',
      event: 'APP_WARN',
      context,
      payload: typeof message === 'object' ? message : { message },
    });
  }

  debug(message: any, context?: string) {
    this.writeEntry({
      level: 'DEBUG',
      event: 'APP_DEBUG',
      context,
      payload: typeof message === 'object' ? message : { message },
    });
  }

  verbose(message: any, context?: string) {
    this.writeEntry({
      level: 'DEBUG',
      event: 'APP_VERBOSE',
      context,
      payload: typeof message === 'object' ? message : { message },
    });
  }

  onApplicationShutdown() {
    if (this.writeStream) {
      try {
        this.writeStream.end();
      } catch {}
    }
  }
}
