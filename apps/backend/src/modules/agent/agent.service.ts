import { Injectable, Logger, Optional } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { GeminiProviderStrategy } from './strategies/gemini.strategy';
import { McpRegistryService } from '../mcp/mcp-registry.service';
import { EcosystemDetectorService } from '../mcp/ecosystem-detector.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { GroundingValidatorService } from './grounding-validator.service';
import { SummaryCacheService } from './summary-cache.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../auth/user.repository';
import {
  ServerSentEvent,
  GitHubContext,
  RepoSummaryOutput,
  FeatureSummaryOutput,
} from '@opensourced/common';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly geminiStrategy: GeminiProviderStrategy,
    private readonly mcpRegistry: McpRegistryService,
    private readonly ecosystemDetector: EcosystemDetectorService,
    private readonly guardrails: GuardrailsService,
    private readonly groundingValidator: GroundingValidatorService,
    private readonly summaryCache: SummaryCacheService,
    @Optional() private readonly authService?: AuthService
  ) {}

  /**
   * Action dispatcher routing incoming requests to corresponding pipelines
   */
  dispatchAction(action: string, context: GitHubContext, user?: User): Observable<ServerSentEvent> {
    this.logger.log(`Dispatching action: '${action}' for ${context.owner}/${context.repo}`);

    // If authenticated user has a valid GitHub token (GitHub App user token or PAT), bind it to MCP Octokit
    if (user && this.authService) {
      this.authService.getValidGitHubToken(user.id).then((token) => {
        if (token) {
          this.mcpRegistry.setAuthToken(token);
        }
      }).catch((err) => {
        this.logger.warn(`Could not resolve valid GitHub token for user '${user.id}': ${err.message}`);
      });
    }

    if (action === 'summarise' || action === 'summarise_repo') {
      return this.summariseRepo(context.owner, context.repo);
    }

    if (action === 'summarise_feature' || action === 'summarise-feature') {
      const featureQuery = context.title || context.body || 'Core application flow';
      return this.summariseFeature(context.owner, context.repo, featureQuery);
    }

    // Default legacy issue actions (scan_issue, owasp_check, draft_pr)
    const sanitizedBody = this.guardrails.wrapUntrusted('issue_body', context.body || 'No issue body provided');
    let prompt = '';
    let systemInstruction = '';

    switch (action) {
      case 'scan_issue':
        systemInstruction =
          'You are an expert open-source onboarding AI. Analyze the issue, invoke search_code_symbols and read_file_slice tools to pinpoint exact files and line numbers where changes are required.';
        prompt = `Analyze repository ${context.owner}/${context.repo} issue #${context.issueNumber} (${context.title || ''}):\n\n${sanitizedBody}\n\nSearch the codebase and find the concrete entrypoints (file path, line range, function name) to fix this issue.`;
        break;

      case 'owasp_check':
        systemInstruction =
          'You are an OWASP application security auditor. Audit the identified candidate code areas for OWASP Top 10 vulnerabilities (Injection, Broken Access Control, SSRF, Auth failures). Provide concrete remediation code.';
        prompt = `Audit candidate fix areas for issue #${context.issueNumber} in ${context.owner}/${context.repo} against OWASP Top 10 vulnerabilities:\n\n${sanitizedBody}`;
        break;

      case 'draft_pr':
        systemInstruction =
          'You are an open-source maintainer assistant. Write a clean, professional GitHub PR description with: Summary of changes, fixes issue reference, verification steps, and testing checklist.';
        prompt = `Draft a pull request description for resolving issue #${context.issueNumber} in ${context.owner}/${context.repo}:\n\n${sanitizedBody}`;
        break;

      default:
        prompt = `Analyze ${context.owner}/${context.repo}:\n\n${sanitizedBody}`;
    }

    return this.geminiStrategy.executeToolLoop(
      prompt,
      (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner: context.owner, repo: context.repo }),
      { systemInstruction }
    );
  }

  /**
   * Action 1: Summarise a Full Repository
   */
  summariseRepo(owner: string, repo: string, branch?: string, focusAreas?: string[]): Observable<ServerSentEvent> {
    return new Observable<ServerSentEvent>((subscriber) => {
      (async () => {
        try {
          subscriber.next({ type: 'PIPELINE_START', action: 'summarise', timestamp: Date.now() });

          // Step 1: Ingest Git Tree
          const { treePaths, commitSha } = await this.mcpRegistry.fetchRepoTreePaths(owner, repo, branch);

          // Step 2: Credential Leak Scan on Repo Tree
          const secretScan = this.guardrails.scanRepoTreeForSecrets(treePaths);
          subscriber.next({
            type: 'CREDENTIAL_SCAN_RESULT',
            clean: !secretScan.hasCommittedSecrets,
            flaggedFiles: secretScan.flaggedFiles,
          });

          // Step 3: Universal Ecosystem Detection & Setup Grounding
          const eco = this.ecosystemDetector.detectEcosystem(treePaths);
          subscriber.next({
            type: 'TREE_ANALYZED',
            ecosystem: eco.displayName,
            verifiedEntrypoints: eco.verifiedEntrypoints,
            manifestFound: eco.manifestFile,
          });

          // Step 4: Check SHA-keyed cache (deterministic reuse)
          const cacheKey = this.summaryCache.buildKey(owner, repo, commitSha, 'summarise');
          const cached = this.summaryCache.get<RepoSummaryOutput>(cacheKey);
          if (cached) {
            subscriber.next({
              type: 'TOKEN_DELTA',
              text: `🎯 Deterministic Cache Hit for commit ${commitSha.slice(0, 7)}. Loaded verified repo summary.\n`,
            });
            subscriber.next({ type: 'REPO_SUMMARY_COMPLETE', result: cached });
            subscriber.next({ type: 'PIPELINE_COMPLETE', action: 'summarise', result: cached });
            subscriber.complete();
            return;
          }

        // Step 5: Construct Grounded Analysis Prompt
        const focusPrompt = focusAreas?.length ? `Focus specifically on: ${focusAreas.join(', ')}.` : '';
        const systemInstruction = `You are OpenSourced, an elite open-source codebase analyst.
Your task is to analyze repository ${owner}/${repo} and output ONLY a valid JSON object matching the RepoSummaryOutput schema.
Requirements:
1. Explain what purpose it serves and whom it caters (target audience).
2. Produce a valid Mermaid diagram (graph TB) illustrating high-level architectural components.
3. List the primary entry files and why they matter.
4. List potential security vulnerabilities or confirm security posture.
5. Provide step-by-step local setup instructions.

Format your entire response as a pure JSON object without markdown fences.`;

        const prompt = `Perform a comprehensive technical summarisation of ${owner}/${repo}.
Grounding Facts:
- Detected Ecosystem: ${eco.displayName}
- Manifest: ${eco.manifestFile || 'None'}
- Monorepo: ${eco.isMonorepo ? `Yes (${eco.monorepoTool})` : 'No'}
- Verified Entrypoints Discovered: ${eco.verifiedEntrypoints.join(', ') || 'Root files'}
- Sample Env File: ${eco.sampleEnvFile || 'None'}
${focusPrompt}

Call the 'get_repo_overview' tool to inspect the README and metadata, then output the structured JSON summary.`;

        const rawOutput = await this.geminiStrategy.executeStructuredToolLoop(
          prompt,
          (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner, repo }),
          (event) => subscriber.next(event),
          { systemInstruction }
        );

        // Step 6: Parse and Validate Structured Output
        let parsed: RepoSummaryOutput;
        try {
          const cleanJson = rawOutput.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          parsed = JSON.parse(cleanJson);
        } catch (err: any) {
          this.logger.warn(`Failed to parse model output as JSON: ${err.message}. Synthesizing from eco facts.`);
          parsed = {
            type: 'repo_summary',
            metadata: {
              repo: `${owner}/${repo}`,
              primaryLanguage: eco.displayName,
              ecosystem: eco.ecosystem,
              techStack: [eco.displayName, eco.monorepoTool].filter(Boolean) as string[],
              license: 'Open Source',
              isMonorepo: eco.isMonorepo,
              commitSha,
            },
            purpose: `Software repository built with ${eco.displayName}.`,
            targetAudience: {
              primaryBeneficiaries: ['Software Engineers', 'Open Source Contributors'],
              useCases: ['Local development', 'Contribution', 'Production deployment'],
            },
            architecture: {
              overview: `${eco.displayName} architectural structure.`,
              mermaidDiagram: 'graph TB\n  Client["Client Tier"] --> App["Application Core"]\n  App --> DB["Database / Services"]',
              coreComponents: eco.verifiedEntrypoints.map((p) => ({
                name: p.split('/').pop() || p,
                path: p,
                role: 'Entry file',
                dependencies: [],
              })),
            },
            entryFiles: eco.verifiedEntrypoints.map((p) => ({
              path: p,
              description: 'Primary entry file',
              keyExportsOrSymbols: [],
            })),
            securityAssessment: {
              overallRating: secretScan.hasCommittedSecrets ? 'INSECURE' : 'SECURE',
              leakedCredentialsDetected: secretScan.hasCommittedSecrets,
              flaggedFiles: secretScan.flaggedFiles,
              findings: secretScan.flaggedFiles.map((file) => ({
                category: 'Hardcoded Secret / Leaked Credential',
                severity: 'CRITICAL',
                fileOrLocation: file,
                description: `Committed credential or environment file detected in tree: ${file}`,
                remediation: `Add '${file}' to .gitignore and rotate any exposed keys immediately.`,
              })),
            },
            localSetup: eco.setupGuide,
          };
        }

        // Apply Grounding Validation & Pruning
        const validated = this.groundingValidator.validateRepoSummary(parsed, treePaths);

        // Inject committed secrets if found
        if (secretScan.hasCommittedSecrets) {
          validated.securityAssessment.leakedCredentialsDetected = true;
          validated.securityAssessment.overallRating = 'INSECURE';
          for (const file of secretScan.flaggedFiles) {
            if (!validated.securityAssessment.findings.some((f) => f.fileOrLocation === file)) {
              validated.securityAssessment.findings.unshift({
                category: 'Leaked Credential File',
                severity: 'CRITICAL',
                fileOrLocation: file,
                description: `Sensitive credential file found committed to repository tree: ${file}`,
                remediation: `Remove file from git tracking, add to .gitignore, and immediately rotate any keys.`,
              });
            }
          }
        }

        // Cache for future deterministic calls
        this.summaryCache.set(cacheKey, validated);

        subscriber.next({ type: 'REPO_SUMMARY_COMPLETE', result: validated });
        subscriber.next({ type: 'PIPELINE_COMPLETE', action: 'summarise', result: validated });
        subscriber.complete();
      } catch (err: any) {
        this.logger.error(`Error in summariseRepo pipeline: ${err.message}`);
        subscriber.next({ type: 'PIPELINE_ERROR', message: err.message, recoverable: false });
        subscriber.complete();
      }
    })();
  });
  }

  /**
   * Action 2: Summarise a Feature in a Repository
   */
  summariseFeature(
    owner: string,
    repo: string,
    featureQuery: string,
    branch?: string,
    hintPaths?: string[]
  ): Observable<ServerSentEvent> {
    return new Observable<ServerSentEvent>((subscriber) => {
      (async () => {
        try {
          subscriber.next({ type: 'PIPELINE_START', action: 'summarise-feature', timestamp: Date.now() });

          const { treePaths, commitSha } = await this.mcpRegistry.fetchRepoTreePaths(owner, repo, branch);
          const eco = this.ecosystemDetector.detectEcosystem(treePaths);

          // Check SHA-keyed cache
          const cacheKey = this.summaryCache.buildKey(owner, repo, commitSha, 'summarise-feature', featureQuery);
          const cached = this.summaryCache.get<FeatureSummaryOutput>(cacheKey);
          if (cached) {
            subscriber.next({
              type: 'TOKEN_DELTA',
              text: `🎯 Deterministic Cache Hit for feature '${featureQuery}' (commit ${commitSha.slice(0, 7)}).\n`,
            });
            subscriber.next({ type: 'FEATURE_SUMMARY_COMPLETE', result: cached });
            subscriber.next({ type: 'PIPELINE_COMPLETE', action: 'summarise-feature', result: cached });
            subscriber.complete();
            return;
          }

          const systemInstruction = `You are OpenSourced, an open-source technical intelligence engine.
Analyze repository ${owner}/${repo} specifically for the requested feature.
IMPORTANT INSTRUCTION:
Do NOT include general repository purpose or whom it caters to.
Focus 100% on the feature implementation details:
1. Feature summary & execution lifecycle.
2. Concrete entrypoints (filePath, lineRange, symbolName, symbolType, roleInFeature).
3. Valid Mermaid diagram (sequenceDiagram or graph TD) showing the end-to-end data flow of this feature.
4. Internal & external dependencies.
5. Feature-specific security vulnerabilities (auth bypass, validation).
6. How to test or trigger this specific feature locally.

Output ONLY a valid JSON object matching the FeatureSummaryOutput schema without markdown fences.`;

          const hintPrompt = hintPaths?.length ? `Candidate paths to inspect: ${hintPaths.join(', ')}.` : '';
          const prompt = `Analyze feature: "${featureQuery}" in repository ${owner}/${repo}.
Ecosystem: ${eco.displayName}
${hintPrompt}

Search for relevant symbols and inspect file slices, then output the structured feature JSON.`;

          const rawOutput = await this.geminiStrategy.executeStructuredToolLoop(
            prompt,
            (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner, repo }),
            (event) => subscriber.next(event),
            { systemInstruction }
          );

          let parsed: FeatureSummaryOutput;
          try {
            const cleanJson = rawOutput.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            parsed = JSON.parse(cleanJson);
          } catch (err: any) {
            this.logger.warn(`Failed to parse feature JSON: ${err.message}. Synthesizing feature fallback.`);
            parsed = {
              type: 'feature_summary',
              featureName: featureQuery,
              summary: `Implementation of ${featureQuery} in ${eco.displayName}.`,
              entrypoints: eco.verifiedEntrypoints.slice(0, 3).map((p) => ({
                filePath: p,
                lineRange: '1-50',
                symbolName: featureQuery.replace(/\s+/g, ''),
                symbolType: 'function',
                roleInFeature: `Discovered entry file related to ${featureQuery}`,
              })),
              mermaidDiagram: `sequenceDiagram\n  autonumber\n  actor User\n  participant API as Endpoint\n  participant Core as ${featureQuery}\n  User->>API: Trigger Request\n  API->>Core: Process Logic\n  Core-->>User: Response`,
              dependencies: {
                internalModules: eco.verifiedEntrypoints.slice(0, 2),
                externalPackages: [eco.displayName],
              },
              securityAssessment: {
                findings: [],
              },
              localVerification: {
                existingTestFiles: [],
                howToTriggerLocally: `Run application and execute tests or request endpoints associated with ${featureQuery}`,
                testCommands: [eco.setupGuide.quickstartCommands[eco.setupGuide.quickstartCommands.length - 1]?.command || 'npm test'],
              },
            };
          }

          const validated = this.groundingValidator.validateFeatureSummary(parsed, treePaths);
          this.summaryCache.set(cacheKey, validated);

          subscriber.next({ type: 'FEATURE_SUMMARY_COMPLETE', result: validated });
          subscriber.next({ type: 'PIPELINE_COMPLETE', action: 'summarise-feature', result: validated });
          subscriber.complete();
        } catch (err: any) {
          this.logger.error(`Error in summariseFeature pipeline: ${err.message}`);
          subscriber.next({ type: 'PIPELINE_ERROR', message: err.message, recoverable: false });
          subscriber.complete();
        }
      })();
    });
  }
}
