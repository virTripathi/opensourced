import { Observable } from 'rxjs';
import { ServerSentEvent } from '@opensourced/common/types';

export interface LlmExecutionOptions {
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  signal?: AbortSignal;
}

export interface ILlmProviderStrategy {
  readonly providerName: string;

  /**
   * Generates a direct completion for prompts
   */
  generateCompletion(prompt: string, options?: LlmExecutionOptions): Promise<string>;

  /**
   * Executes a multi-turn agentic tool calling loop, streaming progress events
   */
  executeToolLoop(
    prompt: string,
    executeTool: (name: string, args: Record<string, any>) => Promise<any>,
    options?: LlmExecutionOptions
  ): Observable<ServerSentEvent>;
}
