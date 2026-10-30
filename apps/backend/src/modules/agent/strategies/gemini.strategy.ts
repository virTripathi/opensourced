import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Observable, Subject } from 'rxjs';
import { ILlmProviderStrategy, LlmExecutionOptions } from './llm-strategy.interface';
import { McpRegistryService } from '../../mcp/mcp-registry.service';
import { ServerSentEvent } from '@opensourced/common';
import { AppJsonLoggerService } from '../../logger/app-json-logger.service';

import { DEFAULT_GEMINI_MODEL } from '../../../config';

@Injectable()
export class GeminiProviderStrategy implements ILlmProviderStrategy {
  readonly providerName = 'GEMINI';
  private readonly logger = new Logger(GeminiProviderStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpRegistry: McpRegistryService,
    @Optional() private readonly jsonLogger?: AppJsonLoggerService
  ) { }

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
        systemInstruction: options?.systemInstruction,
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const durationMs = Date.now() - startTime;

      this.jsonLogger?.logThirdPartyResponse({
        target: 'GOOGLE_GEMINI',
        method: 'generateContent',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`,
        statusCode: 200,
        durationMs,
        responseSnippet: { responseLength: text.length },
      });

      return text;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.jsonLogger?.logThirdPartyResponse({
        target: 'GOOGLE_GEMINI',
        method: 'generateContent',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}`,
        statusCode: 500,
        durationMs,
        responseSnippet: { error: err.message },
      });
      throw err;
    }
  }

  /**
   * Executes a multi-turn tool calling loop targeting structured synthesis
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
        temperature: 0.1, // Near greedy decoding for low variance
        topP: 0.95,
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
        result = await model.generateContent({ contents });
      } catch (err: any) {
        const durationMs = Date.now() - turnStartTime;
        this.jsonLogger?.logGeminiResponse({
          model: modelName,
          turn: turns,
          durationMs,
          statusCode: err.status || 500,
          error: err.message,
        });

        if (err.message?.includes('429') || err.message?.includes('Quota') || err.status === 429) {
          this.logger.warn(`Gemini rate limit 429 encountered: ${err.message}`);
          onEvent({
            type: 'PIPELINE_ERROR',
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Gemini free-tier rate limit reached (15 RPM). Please retry after 1 minute.',
            recoverable: true,
          });
          throw new HttpException('Gemini free tier rate limit reached (15 RPM). Please retry after 1 minute.', HttpStatus.TOO_MANY_REQUESTS);
        }
        throw err;
      }

      const durationMs = Date.now() - turnStartTime;
      const candidate = result.response.candidates?.[0];
      const functionCalls = result.response.functionCalls();

      this.jsonLogger?.logGeminiResponse({
        model: modelName,
        turn: turns,
        durationMs,
        statusCode: 200,
        candidateCount: result.response.candidates?.length || 0,
        functionCalls: functionCalls?.map((f) => ({ name: f.name, args: (f.args as Record<string, any>) || {} })),
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
              ? toolResult.slice(0, 150)
              : JSON.stringify(toolResult).slice(0, 150),
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
      const finalResult = await model.generateContent({ contents });
      const finalDurationMs = Date.now() - finalStartTime;
      const finalCandidate = finalResult.response.candidates?.[0];
      const textParts = finalCandidate?.content?.parts
        ?.filter((p: any) => typeof p.text === 'string')
        ?.map((p: any) => p.text) || [];
      const finalText = textParts.join('\n') || 'Analysis completed.';

      this.jsonLogger?.logGeminiResponse({
        model: modelName,
        turn: turns + 1,
        durationMs: finalDurationMs,
        statusCode: 200,
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

      if (err.message?.includes('429') || err.message?.includes('Quota') || err.status === 429) {
        this.logger.warn(`Gemini rate limit 429 encountered: ${err.message}`);
        onEvent({
          type: 'PIPELINE_ERROR',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Gemini free-tier rate limit reached (15 RPM). Please retry after 1 minute.',
          recoverable: true,
        });
        throw new HttpException('Gemini free tier rate limit reached (15 RPM). Please retry after 1 minute.', HttpStatus.TOO_MANY_REQUESTS);
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
          message: `Gemini Tool Loop Error: ${err.message}`,
          recoverable: true,
        });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }
}
