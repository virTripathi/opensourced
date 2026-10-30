import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Observable, Subject } from 'rxjs';
import { ILlmProviderStrategy, LlmExecutionOptions } from './llm-strategy.interface';
import { McpRegistryService } from '../../mcp/mcp-registry.service';
import { ServerSentEvent } from '@opensourced/common';
import { AppJsonLoggerService } from '../../logger/app-json-logger.service';
import { GeminiQuotaSchedulerService } from './gemini-quota-scheduler.service';

import { DEFAULT_GEMINI_MODEL } from '../../../config';

@Injectable()
export class GeminiProviderStrategy implements ILlmProviderStrategy {
  readonly providerName = 'GEMINI';
  private readonly logger = new Logger(GeminiProviderStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly quotaScheduler: GeminiQuotaSchedulerService,
    @Optional() private readonly jsonLogger?: AppJsonLoggerService
  ) {}

  private getModelName(): string {
    return (
      this.configService.get<string>('ai.geminiModel') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      DEFAULT_GEMINI_MODEL
    );
  }

  private getClient(apiKeyOverride?: string): GoogleGenerativeAI | null {
    const key =
      apiKeyOverride ||
      this.configService.get<string>('ai.geminiApiKey') ||
      this.configService.get<string>('GEMINI_API_KEY');
    if (!key || key === 'mock-key' || key.includes('your_gemini')) {
      return null;
    }
    return new GoogleGenerativeAI(key);
  }

  /**
   * Robust retry wrapper executing transient operations with bounded exponential backoff and jitter.
   * Recognizes 429 rate limits, 503 service unavailable, and network timeouts. Never retries non-retryable 4xx errors.
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    contextName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (err: any) {
        attempt++;
        const isRetryable = this.isRetryableError(err);
        if (!isRetryable || attempt > maxRetries) {
          throw err;
        }

        this.quotaScheduler.recordRetry();
        const baseDelay = this.extractRetryDelayMs(err) || Math.min(8000, 1000 * Math.pow(2, attempt - 1));
        const jitter = Math.random() * 500;
        const delayMs = baseDelay + jitter;

        this.logger.warn(
          `[${contextName}] Transient upstream error (${err.status || err.message}). Attempt ${attempt}/${maxRetries}. Retrying in ${Math.round(delayMs)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private isRetryableError(err: any): boolean {
    const status = err.status || err.statusCode;
    if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504) {
      return true;
    }
    const msg = (err.message || '').toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('resourceexhausted') ||
      msg.includes('503') ||
      msg.includes('unavailable') ||
      msg.includes('overloaded') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout')
    );
  }

  private extractRetryDelayMs(err: any): number | undefined {
    if (err.retryAfterSeconds) return err.retryAfterSeconds * 1000;
    if (err.message) {
      const match = err.message.match(/retry\s+in\s+([0-9.]+)\s*s/i) || err.message.match(/retryDelay[:=]\s*([0-9.]+)/i);
      if (match && match[1]) {
        return Math.ceil(parseFloat(match[1]) * 1000);
      }
    }
    return undefined;
  }

  async generateCompletion(prompt: string, options?: LlmExecutionOptions): Promise<string> {
    const genAI = this.getClient(options?.apiKey);
    if (!genAI) {
      throw new Error('Google Gemini API Key is not configured. Please set GEMINI_API_KEY in your environment or provide an API key.');
    }

    const modelName = this.getModelName();
    const startTime = Date.now();

    this.jsonLogger?.logThirdPartyRequest({
      target: 'GOOGLE_GEMINI',
      method: 'generateContent',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`,
      body: { model: modelName, promptLength: prompt.length },
    });

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options?.temperature ?? 0.1,
          maxOutputTokens: options?.maxOutputTokens ?? 8192,
        },
        systemInstruction: options?.systemInstruction,
      });

      const result = await this.quotaScheduler.schedule(
        () => this.executeWithRetry(() => model.generateContent(prompt), 'generateCompletion'),
        { signal: options?.signal }
      );

      const text = result.response.text();
      const durationMs = Date.now() - startTime;
      const usage = result.response.usageMetadata;

      this.quotaScheduler.recordTokenUsage(usage);

      this.jsonLogger?.logThirdPartyResponse({
        target: 'GOOGLE_GEMINI',
        method: 'generateContent',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`,
        statusCode: 200,
        durationMs,
        responseSnippet: { responseLength: text.length, tokens: usage?.totalTokenCount },
      });

      return text;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.jsonLogger?.logThirdPartyResponse({
        target: 'GOOGLE_GEMINI',
        method: 'generateContent',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`,
        statusCode: err.status || 500,
        durationMs,
        responseSnippet: { error: err.message },
      });
      throw err;
    }
  }

  /**
   * Executes a multi-turn tool calling loop targeting structured synthesis under bounded concurrency and rate limits
   */
  async executeStructuredToolLoop(
    prompt: string,
    executeTool: (name: string, args: Record<string, any>) => Promise<any>,
    onEvent: (event: ServerSentEvent) => void,
    options?: LlmExecutionOptions
  ): Promise<string> {
    const genAI = this.getClient(options?.apiKey);

    if (!genAI) {
      throw new Error('Google Gemini API Key is not configured. Please set GEMINI_API_KEY in your environment or provide an API key.');
    }

    const modelName = this.getModelName();
    const systemInstruction = options?.systemInstruction || 'You are OpenSourced, an open-source technical intelligence engine.';

    // Live Gemini Execution
    const tools = [{ functionDeclarations: this.mcpRegistry.getFunctionDeclarations() }];
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools,
      generationConfig: {
        temperature: options?.temperature ?? 0.1, // Near greedy decoding for low variance
        topP: 0.95,
        maxOutputTokens: options?.maxOutputTokens ?? 8192,
      },
      systemInstruction,
    });

    const contents: Array<{ role: string; parts: any[] }> = [
      { role: 'user', parts: [{ text: prompt }] },
    ];

    let turns = 0;
    while (turns < 6) {
      turns++;
      let result;
      const turnStartTime = Date.now();

      this.jsonLogger?.logGeminiPrompt({
        model: modelName,
        turn: turns,
        prompt: turns === 1 ? prompt : undefined,
        contents,
        options: { systemInstruction },
      });

      try {
        result = await this.quotaScheduler.schedule(
          () => this.executeWithRetry(() => model.generateContent({ contents }), `ToolLoop-Turn-${turns}`),
          {
            signal: options?.signal,
            onWait: (pos, estSec) => {
              onEvent({
                type: 'PIPELINE_START',
                action: `Quota Scheduler: Turn ${turns} queued (position ${pos}, estimated wait ${estSec}s)`,
                timestamp: Date.now(),
              });
            },
          }
        );
      } catch (err: any) {
        const durationMs = Date.now() - turnStartTime;
        this.jsonLogger?.logGeminiResponse({
          model: modelName,
          turn: turns,
          durationMs,
          statusCode: err.status || 500,
          error: err.message,
        });

        const isRateLimit = err.message?.includes('429') || err.message?.includes('Quota') || err.status === 429;
        const isServiceUnavailable = err.status === 503 || err.message?.includes('503') || err.message?.includes('overloaded');

        if (isRateLimit) {
          const retryAfter = this.quotaScheduler.getRetryAfterSeconds();
          this.logger.warn(`Gemini rate limit 429 encountered: ${err.message}. Retry-After: ${retryAfter}s`);
          onEvent({
            type: 'PIPELINE_ERROR',
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Gemini API rate limit reached. Please retry in ${retryAfter} seconds.`,
            recoverable: true,
          });
          const httpErr = new HttpException(
            `Gemini rate limit reached. Please retry in ${retryAfter} seconds.`,
            HttpStatus.TOO_MANY_REQUESTS
          );
          (httpErr as any).retryAfter = retryAfter;
          throw httpErr;
        }

        if (isServiceUnavailable) {
          this.logger.warn(`Gemini service unavailable (503): ${err.message}`);
          onEvent({
            type: 'PIPELINE_ERROR',
            code: 'SERVICE_UNAVAILABLE',
            message: 'Gemini service is temporarily overloaded. Please retry in a few moments.',
            recoverable: true,
          });
          throw new HttpException('Gemini service temporarily overloaded. Please retry shortly.', HttpStatus.SERVICE_UNAVAILABLE);
        }

        throw err;
      }

      const durationMs = Date.now() - turnStartTime;
      const candidate = result.response.candidates?.[0];
      const functionCalls = result.response.functionCalls();
      const usage = result.response.usageMetadata;

      this.quotaScheduler.recordTokenUsage(usage);

      this.jsonLogger?.logGeminiResponse({
        model: modelName,
        turn: turns,
        durationMs,
        statusCode: 200,
        candidateCount: result.response.candidates?.length || 0,
        functionCalls: functionCalls?.map((f) => ({ name: f.name, args: (f.args as Record<string, any>) || {} })),
        usageMetadata: usage
          ? {
              promptTokenCount: usage.promptTokenCount,
              candidatesTokenCount: usage.candidatesTokenCount,
              totalTokenCount: usage.totalTokenCount,
            }
          : undefined,
        textSnippet: candidate?.content?.parts
          ?.filter((p: any) => typeof p.text === 'string')
          ?.map((p: any) => p.text)
          ?.join('\n')
          ?.slice(0, 300),
      });

      if (!candidate || !candidate.content) break;

      contents.push(candidate.content);

      if (!functionCalls || functionCalls.length === 0) {
        // No further tool calls: model returned final synthesis
        const textParts = candidate.content.parts
          ?.filter((p: any) => typeof p.text === 'string')
          ?.map((p: any) => p.text) || [];
        return textParts.join('\n');
      }

      // Execute all tool calls for this turn
      const responseParts: any[] = [];
      for (const call of functionCalls) {
        const toolStartTime = Date.now();
        const callArgs = (call.args as Record<string, any>) || {};

        this.jsonLogger?.logGeminiToolCall({
          tool: call.name,
          turn: turns,
          params: callArgs,
        });

        onEvent({
          type: 'TOOL_CALL',
          tool: call.name,
          params: callArgs,
        });

        let toolResult: any;
        let toolError: string | undefined;

        try {
          toolResult = await executeTool(call.name, callArgs);
        } catch (tErr: any) {
          toolError = tErr.message || 'Tool execution failure';
          toolResult = { error: toolError };
        }

        const toolDurationMs = Date.now() - toolStartTime;

        this.jsonLogger?.logGeminiToolResult({
          tool: call.name,
          turn: turns,
          durationMs: toolDurationMs,
          result: toolResult,
          error: toolError,
        });

        onEvent({
          type: 'TOOL_RESULT',
          tool: call.name,
          summary:
            typeof toolResult === 'string'
              ? toolResult.slice(0, 200)
              : JSON.stringify(toolResult).slice(0, 200),
        });

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        });
      }

      // Append all tool responses with role: 'user' (satisfying Gemini API v1beta specification)
      contents.push({
        role: 'user',
        parts: responseParts,
      });
    }

    // If max turns reached, do one final synthesis prompt
    contents.push({
      role: 'user',
      parts: [{ text: 'Based on all the tools and findings gathered above, please provide your final structured analysis.' }],
    });

    const finalStartTime = Date.now();
    this.jsonLogger?.logGeminiPrompt({
      model: modelName,
      turn: turns + 1,
      prompt: 'Based on all the tools and findings gathered above, please provide your final structured analysis.',
      contents,
    });

    try {
      const finalResult = await this.quotaScheduler.schedule(
        () => this.executeWithRetry(() => model.generateContent({ contents }), 'FinalSynthesisTurn'),
        { signal: options?.signal }
      );
      const finalDurationMs = Date.now() - finalStartTime;
      const finalCandidate = finalResult.response.candidates?.[0];
      const textParts = finalCandidate?.content?.parts
        ?.filter((p: any) => typeof p.text === 'string')
        ?.map((p: any) => p.text) || [];
      const finalText = textParts.join('\n') || 'Analysis completed.';
      const usage = finalResult.response.usageMetadata;

      this.quotaScheduler.recordTokenUsage(usage);

      this.jsonLogger?.logGeminiResponse({
        model: modelName,
        turn: turns + 1,
        durationMs: finalDurationMs,
        statusCode: 200,
        usageMetadata: usage
          ? {
              promptTokenCount: usage.promptTokenCount,
              candidatesTokenCount: usage.candidatesTokenCount,
              totalTokenCount: usage.totalTokenCount,
            }
          : undefined,
        textSnippet: finalText.slice(0, 300),
      });

      return finalText;
    } catch (err: any) {
      const finalDurationMs = Date.now() - finalStartTime;
      this.jsonLogger?.logGeminiResponse({
        model: modelName,
        turn: turns + 1,
        durationMs: finalDurationMs,
        statusCode: err.status || 500,
        error: err.message,
      });

      const isRateLimit = err.message?.includes('429') || err.message?.includes('Quota') || err.status === 429;
      if (isRateLimit) {
        const retryAfter = this.quotaScheduler.getRetryAfterSeconds();
        this.logger.warn(`Gemini rate limit 429 encountered: ${err.message}. Retry-After: ${retryAfter}s`);
        onEvent({
          type: 'PIPELINE_ERROR',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Gemini API rate limit reached. Please retry in ${retryAfter} seconds.`,
          recoverable: true,
        });
        const httpErr = new HttpException(
          `Gemini rate limit reached. Please retry in ${retryAfter} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS
        );
        (httpErr as any).retryAfter = retryAfter;
        throw httpErr;
      }
      throw err;
    }
  }

  executeToolLoop(
    prompt: string,
    executeTool: (name: string, args: Record<string, any>) => Promise<any>,
    options?: LlmExecutionOptions
  ): Observable<ServerSentEvent> {
    const subject = new Subject<ServerSentEvent>();

    (async () => {
      try {
        subject.next({ type: 'PIPELINE_START', action: 'Tool Calling Loop', timestamp: Date.now() });

        const finalText = await this.executeStructuredToolLoop(
          prompt,
          executeTool,
          (ev) => subject.next(ev),
          options
        );

        // Stream final report progressively in readable chunks
        const chunkSize = 120;
        for (let i = 0; i < finalText.length; i += chunkSize) {
          subject.next({ type: 'TOKEN_DELTA', text: finalText.slice(i, i + chunkSize) });
        }

        subject.next({ type: 'PIPELINE_COMPLETE', action: 'Tool Loop Finished', result: finalText });
        subject.complete();
      } catch (err: any) {
        this.logger.error(`Error in Gemini tool loop: ${err.message}`);
        subject.next({
          type: 'PIPELINE_ERROR',
          code: err.status === 429 ? 'RATE_LIMIT_EXCEEDED' : err.status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
          message: `Gemini Pipeline Error: ${err.message}`,
          recoverable: err.status === 429 || err.status === 503,
        });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }
}
