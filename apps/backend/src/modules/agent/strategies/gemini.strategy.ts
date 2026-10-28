import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Observable, Subject } from 'rxjs';
import { ILlmProviderStrategy, LlmExecutionOptions } from './llm-strategy.interface';
import { McpRegistryService } from '../../mcp/mcp-registry.service';
import { ServerSentEvent } from '@worksmarter/common/types';

@Injectable()
export class GeminiProviderStrategy implements ILlmProviderStrategy {
  readonly providerName = 'GEMINI';
  private readonly logger = new Logger(GeminiProviderStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpRegistry: McpRegistryService
  ) {}

  private getClient(apiKeyOverride?: string): GoogleGenerativeAI {
    const key = apiKeyOverride || this.configService.get<string>('GEMINI_API_KEY') || 'mock-key';
    return new GoogleGenerativeAI(key);
  }

  async generateCompletion(prompt: string, options?: LlmExecutionOptions): Promise<string> {
    const genAI = this.getClient(options?.apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: options?.systemInstruction,
    });

    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  executeToolLoop(
    prompt: string,
    executeTool: (name: string, args: Record<string, any>) => Promise<any>,
    options?: LlmExecutionOptions
  ): Observable<ServerSentEvent> {
    const subject = new Subject<ServerSentEvent>();

    (async () => {
      try {
        const apiKey = options?.apiKey || this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
          subject.next({
            type: 'TOKEN_DELTA',
            text: '⚠️ GEMINI_API_KEY not configured. Running in simulated fallback mode for demo...\n\n',
          });
        }

        const genAI = this.getClient(apiKey);
        const tools = [{ functionDeclarations: this.mcpRegistry.getFunctionDeclarations() }];

        const model = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          tools,
          systemInstruction: options?.systemInstruction || 'You are Worksmarter, an open-source onboarding AI.',
        });

        const chat = model.startChat();
        subject.next({ type: 'PIPELINE_START', action: 'Tool Calling Loop', timestamp: Date.now() });

        let result = await chat.sendMessage(prompt);
        let response = result.response;

        // Loop up to 4 times for tool calls
        let turns = 0;
        while (response.functionCalls() && response.functionCalls()!.length > 0 && turns < 4) {
          turns++;
          const functionCalls = response.functionCalls()!;

          for (const call of functionCalls) {
            subject.next({
              type: 'TOOL_CALL',
              tool: call.name,
              params: call.args as Record<string, unknown>,
            });

            const toolResult = await executeTool(call.name, call.args as Record<string, any>);

            subject.next({
              type: 'TOOL_RESULT',
              tool: call.name,
              summary: typeof toolResult === 'string' ? toolResult.slice(0, 150) : JSON.stringify(toolResult).slice(0, 150),
            });

            // Send tool result back to model
            result = await chat.sendMessage([
              {
                functionResponse: {
                  name: call.name,
                  response: { result: toolResult },
                },
              },
            ]);
            response = result.response;
          }
        }

        const finalText = response.text();
        subject.next({ type: 'TOKEN_DELTA', text: finalText });
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
