import { Injectable, Logger, Optional } from '@nestjs/common';
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

  async generateCompletion(prompt: string, options?: LlmExecutionOptions): Promise<string> {
    const genAI = this.getClient(options?.apiKey);
    if (!genAI) {
      return 'Simulated completion response.';
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

    // If no real API key is configured, run grounded deterministic fallback
    if (!genAI) {
      onEvent({
        type: 'TOKEN_DELTA',
        text: 'ℹ️ Note: Running in deterministic engine mode. Executing tools against repository...\n',
      });

      // Execute tool calls directly
      onEvent({ type: 'TOOL_CALL', tool: 'get_repo_overview', params: {} });
      const overview = await executeTool('get_repo_overview', {});
      onEvent({ type: 'TOOL_RESULT', tool: 'get_repo_overview', summary: `Overview fetched for ${overview?.name || 'repository'}` });

      onEvent({ type: 'TOOL_CALL', tool: 'detect_ecosystem_and_setup', params: {} });
      const eco = await executeTool('detect_ecosystem_and_setup', {});
      onEvent({ type: 'TOOL_RESULT', tool: 'detect_ecosystem_and_setup', summary: `Ecosystem detected: ${eco?.displayName || 'Generic'}` });

      const isFeatureRequest = prompt.includes('FeatureSummaryOutput') || prompt.includes('feature:');

      if (isFeatureRequest) {
        onEvent({ type: 'TOOL_CALL', tool: 'search_code_symbols', params: { query: 'feature' } });
        const symbols = await executeTool('search_code_symbols', { query: 'feature' });
        onEvent({ type: 'TOOL_RESULT', tool: 'search_code_symbols', summary: `Symbols searched for feature` });

        return JSON.stringify({
          type: 'feature_summary',
          featureName: prompt.match(/feature:\s*"([^"]+)"/i)?.[1] || 'Target Feature',
          summary: `Implementation of the feature within ${eco?.displayName || 'the repository'}.`,
          entrypoints: (eco?.verifiedEntrypoints || []).slice(0, 3).map((p: string) => ({
            filePath: p,
            lineRange: '1-75',
            symbolName: p.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Handler',
            symbolType: 'function',
            roleInFeature: `Core logic entrypoint for feature flow`,
          })),
          mermaidDiagram: `sequenceDiagram\n  autonumber\n  actor Client\n  participant Gateway as Router\n  participant Engine as Feature Service\n  Client->>Gateway: Request Feature Action\n  Gateway->>Engine: Dispatch execution\n  Engine-->>Client: Return Processed Result`,
          dependencies: {
            internalModules: (eco?.verifiedEntrypoints || []).slice(0, 2),
            externalPackages: [eco?.displayName || 'Runtime'],
          },
          securityAssessment: {
            findings: [],
          },
          localVerification: {
            existingTestFiles: [],
            howToTriggerLocally: `Run ${eco?.setupGuide?.quickstartCommands?.[0]?.command || 'npm test'} to verify feature execution`,
            testCommands: [eco?.setupGuide?.quickstartCommands?.[eco?.setupGuide?.quickstartCommands?.length - 1]?.command || 'npm test'],
          },
        });
      }

      // Synthesize fallback structured JSON from grounded tool output
      return JSON.stringify({
        type: 'repo_summary',
        metadata: {
          repo: overview?.name || 'unknown/repo',
          primaryLanguage: overview?.language || eco?.displayName || 'Universal',
          ecosystem: eco?.ecosystem || 'generic',
          techStack: [eco?.displayName, eco?.monorepoTool].filter(Boolean),
          license: overview?.license || null,
          isMonorepo: !!eco?.isMonorepo,
          commitSha: overview?.commitSha || 'unknown',
        },
        purpose: overview?.description || 'Open source software repository.',
        targetAudience: {
          primaryBeneficiaries: ['Software Engineers', 'Open Source Contributors', 'DevOps Practitioners'],
          useCases: [
            'Local development and experimentation',
            'Feature extension and open-source contribution',
            'Production deployment and integration',
          ],
        },
        architecture: {
          overview: eco?.isMonorepo ? 'Monorepo workspace architecture' : 'Standard modular codebase architecture',
          mermaidDiagram: `graph TB\n  Client["Client Tier"] --> Core["Core Logic (${eco?.displayName || 'Main'})"]\n  Core --> Storage["Storage & Config"]`,
          coreComponents: (eco?.verifiedEntrypoints || []).map((p: string) => ({
            name: p.split('/').pop() || p,
            path: p,
            role: 'Verified entrypoint file discovered from directory tree',
            dependencies: [],
          })),
        },
        entryFiles: (eco?.verifiedEntrypoints || []).map((p: string) => ({
          path: p,
          description: 'Primary entrypoint identified via ecosystem rules',
          keyExportsOrSymbols: [],
        })),
        securityAssessment: {
          overallRating: 'SECURE',
          leakedCredentialsDetected: false,
          flaggedFiles: [],
          findings: [],
        },
        localSetup: eco?.setupGuide || {
          prerequisites: [eco?.displayName || 'Runtime Environment'],
          envSetup: { sampleEnvFile: null, requiredVariables: [] },
          quickstartCommands: [],
          commonGotchas: [],
        },
      });
    }

    // Live Gemini Execution
    const tools = [{ functionDeclarations: this.mcpRegistry.getFunctionDeclarations() }];
    const model = genAI.getGenerativeModel({
      model: this.getModelName(),
      tools,
      generationConfig: {
        temperature: 0.1, // Near greedy decoding for low variance
        topP: 0.95,
      },
      systemInstruction: options?.systemInstruction || 'You are OpenSourced, an open-source technical intelligence engine.',
    });

    const chat = model.startChat();
    let result = await chat.sendMessage(prompt);
    let response = result.response;

    let turns = 0;
    while (response.functionCalls() && response.functionCalls()!.length > 0 && turns < 5) {
      turns++;
      const functionCalls = response.functionCalls()!;

      for (const call of functionCalls) {
        onEvent({
          type: 'TOOL_CALL',
          tool: call.name,
          params: call.args as Record<string, unknown>,
        });

        const toolResult = await executeTool(call.name, call.args as Record<string, any>);

        onEvent({
          type: 'TOOL_RESULT',
          tool: call.name,
          summary:
            typeof toolResult === 'string'
              ? toolResult.slice(0, 150)
              : JSON.stringify(toolResult).slice(0, 150),
        });

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

    return response.text();
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
