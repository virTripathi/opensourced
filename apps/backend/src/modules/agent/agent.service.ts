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
  ) { }

  /**
   * Action dispatcher routing incoming requests to corresponding pipelines
   */
  dispatchAction(action: string, context: GitHubContext, user?: User): Observable<ServerSentEvent> {
    return new Observable<ServerSentEvent>((subscriber) => {
      (async () => {
        try {
          this.logger.log(`Dispatching action: '${action}' for ${context.owner}/${context.repo}`);

          // If authenticated user has a valid GitHub token (GitHub App user token or PAT), bind it to MCP Octokit
          if (user && this.authService) {
            try {
              const token = await this.authService.getValidGitHubToken(user.id);
              if (token) {
                this.mcpRegistry.setAuthToken(token);
              }
            } catch (err: any) {
              this.logger.warn(`Could not resolve valid GitHub token for user '${user.id}': ${err.message}`);
            }
          }

          if (action === 'summarise' || action === 'summarise_repo') {
            this.summariseRepo(context.owner, context.repo).subscribe({
              next: (ev) => subscriber.next(ev),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
            return;
          }

          if (action === 'summarise_feature' || action === 'summarise-feature') {
            const featureQuery = context.title || context.body || 'Core application flow';
            this.summariseFeature(context.owner, context.repo, featureQuery).subscribe({
              next: (ev) => subscriber.next(ev),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
            return;
          }

          // If issue number is present, enrich title, body, and discussion comments from GitHub API
          let issueBodyWithDiscussion = context.body || 'No issue body provided';
          if (context.issueNumber) {
            if (!context.body || context.body === 'No issue body provided' || !context.title) {
              const issueData = await this.mcpRegistry.getIssue(context.owner, context.repo, context.issueNumber);
              if (issueData.title && !context.title) context.title = issueData.title;
              if (issueData.body && (!context.body || context.body === 'No issue body provided')) {
                context.body = issueData.body;
                issueBodyWithDiscussion = issueData.body;
              }
            }

            // Eagerly fetch discussion comments so analysis is grounded in real community/maintainer consensus
            try {
              const comments = await this.mcpRegistry.getIssueComments(context.owner, context.repo, context.issueNumber, 8);
              if (comments.length > 0) {
                const discussionFormatted = comments
                  .map((c, idx) => `[Comment #${idx + 1} by @${c.author}]:\n${c.body}`)
                  .join('\n\n');
                issueBodyWithDiscussion += `\n\n--- Discussion Comments ---\n${discussionFormatted}`;
              }
            } catch (err: any) {
              this.logger.warn(`Could not fetch comments for issue #${context.issueNumber}: ${err.message}`);
            }
          }

          // Default actions (scan_issue, safety_check, draft_pr)
          const sanitizedBody = this.guardrails.wrapUntrusted('issue_context', issueBodyWithDiscussion);
          let prompt = '';
          let systemInstruction = '';

          switch (action) {
            case 'scan_issue':
              if (!context.issueNumber) {
                systemInstruction =
                  'You are an expert open-source onboarding AI. Analyze the repository architecture, invoke detect_ecosystem_and_setup, get_repo_overview, and search_code_symbols to pinpoint the primary entrypoints (file paths, line ranges, exports) and onboarding path.';
                prompt = `Analyze repository ${context.owner}/${context.repo}:\n\nFind the primary architectural entrypoints (file paths, line ranges, function/class names, module roles) to onboard and contribute to this repository.`;
              } else {
                systemInstruction =
                  'You are an expert open-source onboarding AI. Analyze the issue and discussion, invoke search_code_symbols and read_file_slice tools to pinpoint exact files and line numbers where changes are required.';
                prompt = `Analyze repository ${context.owner}/${context.repo} issue #${context.issueNumber} (${context.title || ''}):\n\n${sanitizedBody}\n\nSearch the codebase and find the concrete entrypoints (file path, line range, function name) to fix this issue based on the issue description and discussion.`;
              }
              break;

            case 'safety_check':
            case 'owasp_check':
              systemInstruction =
                'You are an expert open-source security and local hygiene auditor. Audit the repository for local developer execution safety: verify if package manifests contain dangerous or suspicious lifecycle scripts (curl pipes, obfuscated eval), check for exposed credentials, assess authentication boundaries, and verify safe local execution instructions.';
              prompt = context.issueNumber
                ? `Audit candidate fix areas and discussion for issue #${context.issueNumber} in ${context.owner}/${context.repo} for local developer safety, credential hygiene, and input validation:\n\n${sanitizedBody}`
                : `Audit repository ${context.owner}/${context.repo} for developer local safety, package lifecycle scripts, and credential hygiene. Provide concrete verification and remediation steps.`;
              break;

            case 'draft_pr':
              systemInstruction =
                'You are an open-source maintainer assistant. Write a clean, professional GitHub PR description with: Summary of changes, fixes issue reference, verification steps, and testing checklist.';
              prompt = context.issueNumber
                ? `Draft a pull request description for resolving issue #${context.issueNumber} in ${context.owner}/${context.repo}:\n\n${sanitizedBody}`
                : `Draft a pull request description template and structure for contributions to ${context.owner}/${context.repo}.`;
              break;

            default:
              prompt = `Analyze ${context.owner}/${context.repo}:\n\n${sanitizedBody}`;
          }

          this.geminiStrategy.executeToolLoop(
            prompt,
            (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner: context.owner, repo: context.repo }),
            { systemInstruction }
          ).subscribe({
            next: (ev) => subscriber.next(ev),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        } catch (err: any) {
          subscriber.next({
            type: 'PIPELINE_ERROR',
            message: `Dispatch failed: ${err.message}`,
            recoverable: false,
          });
          subscriber.complete();
        }
      })();
    });
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
          const hasTestFiles = treePaths.some(
            (p) =>
              p.includes('.test.') ||
              p.includes('.spec.') ||
              p.startsWith('tests/') ||
              p.startsWith('test/') ||
              p.includes('__tests__')
          );

          // Step 3b: Inspect Manifest for Suspicious Lifecycle Script Hooks
          let suspiciousScripts: string[] = [];
          if (eco.manifestFile) {
            try {
              const manifestContent = await this.mcpRegistry.getManifestContent(owner, repo, eco.manifestFile);
              if (manifestContent) {
                const scriptCheck = this.guardrails.scanManifestForSuspiciousScripts(manifestContent);
                suspiciousScripts = scriptCheck.findings;
              }
            } catch (err: any) {
              this.logger.warn(`Could not audit manifest '${eco.manifestFile}': ${err.message}`);
            }
          }

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
4. Verify Authenticity & Purpose: Compare the README claims against real codebase facts (manifest, tests, entrypoints, codebase).
5. Provide a pragmatic Developer Safety Assessment (committed secrets, dangerous install hooks, overall rating).
6. Provide step-by-step local setup instructions.

Format your entire response as a pure JSON object without markdown fences.`;

          const prompt = `Perform a comprehensive technical summarisation and authenticity evaluation of ${owner}/${repo}.
Grounding Facts:
- Detected Ecosystem: ${eco.displayName}
- Manifest: ${eco.manifestFile || 'None'}
- Monorepo: ${eco.isMonorepo ? `Yes (${eco.monorepoTool})` : 'No'}
- Total Tracked Files: ${treePaths.length}
- Test Files Present: ${hasTestFiles ? 'Yes' : 'No'}
- Suspicious Lifecycle Hooks: ${suspiciousScripts.length > 0 ? suspiciousScripts.join(', ') : 'None detected'}
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
          const cleanJson = rawOutput.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          try {
            parsed = JSON.parse(cleanJson);
          } catch (err: any) {
            this.logger.warn(`Failed to parse model output as JSON: ${err.message}. Attempting 1-turn repair prompt.`);
            try {
              const repairPrompt = `Fix the following invalid JSON so that it strictly parses with JSON.parse. Output ONLY the valid JSON, no markdown fences or prose:\n\n${cleanJson}`;
              const repaired = await this.geminiStrategy.generateCompletion(repairPrompt);
              const cleanRepaired = repaired.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
              parsed = JSON.parse(cleanRepaired);
            } catch (repairErr: any) {
              this.logger.error(`Model JSON repair failed: ${repairErr.message}`);
              subscriber.next({
                type: 'PIPELINE_ERROR',
                code: 'MODEL_SYNTAX_ERROR',
                message: 'Unable to parse structured model response. Please click Re-Scan to retry.',
                recoverable: true,
              });
              subscriber.complete();
              return;
            }
          }

          // Apply Grounding Validation & Pruning
          const validated = this.groundingValidator.validateRepoSummary(parsed, treePaths);

          // Defensive guard: Ensure securityAssessment exists before property mutations
          if (!validated.securityAssessment) {
            validated.securityAssessment = {
              overallRating: secretScan.hasCommittedSecrets || suspiciousScripts.length > 0 ? 'NEEDS_ATTENTION' : 'CLEAN',
              leakedCredentialsDetected: secretScan.hasCommittedSecrets,
              flaggedFiles: secretScan.flaggedFiles,
              suspiciousScripts,
              findings: [],
            };
          } else if (!Array.isArray(validated.securityAssessment.findings)) {
            validated.securityAssessment.findings = [];
          }

          // Inject suspicious scripts if found
          if (!validated.securityAssessment.suspiciousScripts) {
            validated.securityAssessment.suspiciousScripts = suspiciousScripts;
          }
          for (const scriptDesc of suspiciousScripts) {
            if (!validated.securityAssessment.findings.some((f) => f.description.includes(scriptDesc))) {
              validated.securityAssessment.findings.push({
                category: 'Suspicious Lifecycle Hook',
                severity: 'HIGH',
                fileOrLocation: eco.manifestFile || 'manifest',
                description: `Dangerous lifecycle script detected in manifest: ${scriptDesc}`,
                remediation: 'Inspect scripts in package manifest before running install or build commands locally.',
              });
              validated.securityAssessment.overallRating = 'NEEDS_ATTENTION';
            }
          }

          // Inject committed secrets if found
          if (secretScan.hasCommittedSecrets) {
            validated.securityAssessment.leakedCredentialsDetected = true;
            validated.securityAssessment.overallRating = 'INSECURE';
            validated.securityAssessment.flaggedFiles = secretScan.flaggedFiles;
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

          // Ensure authenticity object exists
          if (!validated.authenticity) {
            validated.authenticity = {
              verdict: treePaths.length > 5 && eco.verifiedEntrypoints.length > 0 ? 'VERIFIED_REAL' : 'PARTIALLY_IMPLEMENTED',
              summary: `Codebase contains ${treePaths.length} tracked files in ${eco.displayName} with verified entrypoints.`,
              claimsVsReality: [
                {
                  claim: `Implementation in ${eco.displayName}`,
                  reality: `Confirmed with manifest '${eco.manifestFile || 'detected'}' and entrypoints`,
                  status: 'CONFIRMED',
                },
                {
                  claim: 'Test suite coverage',
                  reality: hasTestFiles ? 'Test files detected in tree' : 'No dedicated test files discovered in tree',
                  status: hasTestFiles ? 'CONFIRMED' : 'DISCREPANCY',
                },
              ],
            };
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
          const cleanJson = rawOutput.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          try {
            parsed = JSON.parse(cleanJson);
          } catch (err: any) {
            this.logger.warn(`Failed to parse feature JSON: ${err.message}. Attempting 1-turn repair prompt.`);
            try {
              const repairPrompt = `Fix the following invalid JSON so that it strictly parses with JSON.parse. Output ONLY the valid JSON, no markdown fences or prose:\n\n${cleanJson}`;
              const repaired = await this.geminiStrategy.generateCompletion(repairPrompt);
              const cleanRepaired = repaired.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
              parsed = JSON.parse(cleanRepaired);
            } catch (repairErr: any) {
              this.logger.error(`Model feature JSON repair failed: ${repairErr.message}`);
              subscriber.next({
                type: 'PIPELINE_ERROR',
                code: 'MODEL_SYNTAX_ERROR',
                message: 'Unable to parse structured feature response. Please click Re-Scan to retry.',
                recoverable: true,
              });
              subscriber.complete();
              return;
            }
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
