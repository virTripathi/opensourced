import { Injectable, Logger, Optional } from '@nestjs/common';
import { Observable } from 'rxjs';
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

/**
 * Defensive normalizer ensuring raw LLM outputs (whether camelCase or snake_case)
 * conform strictly to the FeatureSummaryOutput interface.
 */
export function normalizeFeatureSummary(raw: any): FeatureSummaryOutput {
  const featureName = raw?.featureName || raw?.feature_name || raw?.name || raw?.title || 'Target Feature';
  const summary = raw?.summary || raw?.feature_summary || raw?.overview || raw?.description || '';

  const rawEntrypoints = Array.isArray(raw?.entrypoints)
    ? raw.entrypoints
    : Array.isArray(raw?.verifiedEntrypoints)
    ? raw.verifiedEntrypoints
    : [];

  const entrypoints = rawEntrypoints.map((ep: any) => ({
    filePath: ep?.filePath || ep?.file_path || ep?.path || '',
    lineRange: typeof ep?.lineRange === 'string' ? ep.lineRange : typeof ep?.line_range === 'string' ? ep.line_range : undefined,
    symbolName: ep?.symbolName || ep?.symbol_name || ep?.name || 'handler',
    symbolType: (['function', 'class', 'route_handler', 'component', 'middleware', 'struct', 'trait'].includes(ep?.symbolType || ep?.symbol_type)
      ? (ep?.symbolType || ep?.symbol_type)
      : 'function') as any,
    roleInFeature: ep?.roleInFeature || ep?.role_in_feature || ep?.role || ep?.description || 'Core logic entrypoint',
  }));

  const mermaidDiagram = raw?.mermaidDiagram || raw?.mermaid_diagram || raw?.diagram || raw?.architectureDiagram || '';

  const rawDeps = raw?.dependencies || {};
  const dependencies = {
    internalModules: Array.isArray(rawDeps?.internalModules)
      ? rawDeps.internalModules
      : Array.isArray(rawDeps?.internal_modules)
      ? rawDeps.internal_modules
      : Array.isArray(rawDeps?.internal)
      ? rawDeps.internal
      : [],
    externalPackages: Array.isArray(rawDeps?.externalPackages)
      ? rawDeps.externalPackages
      : Array.isArray(rawDeps?.external_packages)
      ? rawDeps.external_packages
      : Array.isArray(rawDeps?.external)
      ? rawDeps.external
      : [],
    databaseTablesOrEntities: Array.isArray(rawDeps?.databaseTablesOrEntities)
      ? rawDeps.databaseTablesOrEntities
      : Array.isArray(rawDeps?.database_tables_or_entities)
      ? rawDeps.database_tables_or_entities
      : undefined,
  };

  const rawSec = raw?.securityAssessment || raw?.security_assessment || {};
  const rawFindings = Array.isArray(rawSec?.findings) ? rawSec.findings : [];
  const findings = rawFindings.map((f: any) => ({
    risk: f?.risk || f?.category || f?.name || 'Security Consideration',
    severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(f?.severity?.toUpperCase()) ? f.severity.toUpperCase() : 'MEDIUM') as any,
    file: f?.file || f?.fileOrLocation || f?.location || 'codebase',
    suggestedFix: f?.suggestedFix || f?.suggested_fix || f?.remediation || 'Follow safe coding conventions.',
  }));

  const rawVerify = raw?.localVerification || raw?.local_verification || {};
  const localVerification = {
    existingTestFiles: Array.isArray(rawVerify?.existingTestFiles)
      ? rawVerify.existingTestFiles
      : Array.isArray(rawVerify?.existing_test_files)
      ? rawVerify.existing_test_files
      : [],
    howToTriggerLocally: rawVerify?.howToTriggerLocally || rawVerify?.how_to_trigger_locally || raw?.testingInstructions || '',
    testCommands: Array.isArray(rawVerify?.testCommands)
      ? rawVerify.testCommands
      : Array.isArray(rawVerify?.test_commands)
      ? rawVerify.test_commands
      : [],
  };

  return {
    type: 'feature_summary',
    featureName,
    summary,
    entrypoints,
    mermaidDiagram,
    dependencies,
    securityAssessment: { findings },
    localVerification,
  };
}

/**
 * Defensive normalizer ensuring raw LLM outputs (whether camelCase or snake_case)
 * conform strictly to the RepoSummaryOutput interface.
 */
export function normalizeRepoSummary(
  raw: any,
  eco: any,
  owner: string,
  repo: string,
  commitSha?: string
): RepoSummaryOutput {
  const meta = raw?.metadata || {};
  const metadata = {
    repo: meta.repo || `${owner}/${repo}`,
    primaryLanguage: meta.primaryLanguage || meta.primary_language || eco.displayName,
    ecosystem: meta.ecosystem || eco.ecosystem,
    techStack: Array.isArray(meta.techStack)
      ? meta.techStack
      : Array.isArray(meta.tech_stack)
      ? meta.tech_stack
      : [eco.displayName],
    license: meta.license !== undefined ? meta.license : 'Open Source',
    isMonorepo: meta.isMonorepo !== undefined ? !!meta.isMonorepo : meta.is_monorepo !== undefined ? !!meta.is_monorepo : !!eco.isMonorepo,
    commitSha: meta.commitSha || meta.commit_sha || commitSha,
  };

  const purpose = raw?.purpose || raw?.description || raw?.overview || `Software repository built with ${eco.displayName}.`;
  const rawAudience = raw?.targetAudience || raw?.target_audience || {};
  const targetAudience = {
    primaryBeneficiaries: Array.isArray(rawAudience.primaryBeneficiaries)
      ? rawAudience.primaryBeneficiaries
      : Array.isArray(rawAudience.primary_beneficiaries)
      ? rawAudience.primary_beneficiaries
      : ['Software Engineers'],
    useCases: Array.isArray(rawAudience.useCases)
      ? rawAudience.useCases
      : Array.isArray(rawAudience.use_cases)
      ? rawAudience.use_cases
      : ['Development and Contribution'],
  };

  const rawArch = raw?.architecture || {};
  const architecture = {
    overview: rawArch.overview || `${eco.displayName} architectural structure.`,
    mermaidDiagram: rawArch.mermaidDiagram || rawArch.mermaid_diagram || rawArch.diagram || 'graph TB\n  App["Application Core"]',
    coreComponents: Array.isArray(rawArch.coreComponents)
      ? rawArch.coreComponents
      : Array.isArray(rawArch.core_components)
      ? rawArch.core_components
      : [],
  };

  const rawEntries = Array.isArray(raw?.entryFiles)
    ? raw.entryFiles
    : Array.isArray(raw?.entry_files)
    ? raw.entry_files
    : [];
  const entryFiles = rawEntries.map((ef: any) => ({
    path: ef?.path || ef?.filePath || ef?.file_path || '',
    description: ef?.description || 'Core entry file',
    keyExportsOrSymbols: Array.isArray(ef?.keyExportsOrSymbols)
      ? ef.keyExportsOrSymbols
      : Array.isArray(ef?.key_exports_or_symbols)
      ? ef.key_exports_or_symbols
      : [],
  }));

  const rawSec = raw?.securityAssessment || raw?.security_assessment || {};
  const securityAssessment = {
    overallRating: rawSec.overallRating || rawSec.overall_rating || 'CLEAN',
    leakedCredentialsDetected: !!(rawSec.leakedCredentialsDetected || rawSec.leaked_credentials_detected),
    flaggedFiles: Array.isArray(rawSec.flaggedFiles) ? rawSec.flaggedFiles : Array.isArray(rawSec.flagged_files) ? rawSec.flagged_files : [],
    suspiciousScripts: Array.isArray(rawSec.suspiciousScripts) ? rawSec.suspiciousScripts : Array.isArray(rawSec.suspicious_scripts) ? rawSec.suspicious_scripts : [],
    findings: Array.isArray(rawSec.findings) ? rawSec.findings : [],
  };

  const localSetup = raw?.localSetup || raw?.local_setup || eco.setupGuide;

  return {
    type: 'repo_summary',
    metadata,
    purpose,
    targetAudience,
    architecture,
    entryFiles,
    authenticity: raw?.authenticity,
    securityAssessment,
    localSetup,
  };
}

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
    return new Observable<ServerSentEvent>((subscriber) => {
      const abortController = new AbortController();

      (async () => {
        try {
          this.logger.log(`Dispatching action: '${action}' for ${context.owner}/${context.repo}`);

          // Request-scoped token resolution: avoids singleton mutation and cross-tenant leakage
          let userToken: string | undefined;
          if (user && this.authService) {
            try {
              userToken = (await this.authService.getValidGitHubToken(user.id)) || undefined;
            } catch (err: any) {
              this.logger.warn(`Could not resolve valid GitHub token for user '${user.id}': ${err.message}`);
            }
          }

          if (action === 'summarise' || action === 'summarise_repo') {
            this.summariseRepo(context.owner, context.repo, undefined, undefined, userToken).subscribe({
              next: (ev) => subscriber.next(ev),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
            return;
          }

          if (action === 'summarise_feature' || action === 'summarise-feature') {
            const featureQuery = context.title || context.body || 'Core application flow';
            this.summariseFeature(context.owner, context.repo, featureQuery, undefined, undefined, userToken).subscribe({
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
              const issueData = await this.mcpRegistry.getIssue(context.owner, context.repo, context.issueNumber, userToken);
              if (issueData.title && !context.title) context.title = issueData.title;
              if (issueData.body && (!context.body || context.body === 'No issue body provided')) {
                context.body = issueData.body;
                issueBodyWithDiscussion = issueData.body;
              }
            }

            // Eagerly fetch discussion comments so analysis is grounded in real community/maintainer consensus
            try {
              const comments = await this.mcpRegistry.getIssueComments(context.owner, context.repo, context.issueNumber, 8, userToken);
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
            (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner: context.owner, repo: context.repo }, userToken),
            { systemInstruction, signal: abortController.signal, maxOutputTokens: 8192 }
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

      // Teardown: cancel in-flight or queued work when client disconnects
      return () => {
        abortController.abort();
      };
    });
  }

  /**
   * Action 1: Summarise a Full Repository with task-appropriate context and bounded model calls
   */
  summariseRepo(
    owner: string,
    repo: string,
    branch?: string,
    focusAreas?: string[],
    tokenOverride?: string
  ): Observable<ServerSentEvent> {
    return new Observable<ServerSentEvent>((subscriber) => {
      const abortController = new AbortController();

      (async () => {
        try {
          subscriber.next({ type: 'PIPELINE_START', action: 'summarise', timestamp: Date.now() });

          // Step 1: Ingest Git Tree
          const { treePaths, commitSha } = await this.mcpRegistry.fetchRepoTreePaths(owner, repo, branch, tokenOverride);

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
          let manifestSnippet = '';
          if (eco.manifestFile) {
            try {
              const manifestContent = await this.mcpRegistry.getManifestContent(owner, repo, eco.manifestFile, tokenOverride);
              if (manifestContent) {
                const scriptCheck = this.guardrails.scanManifestForSuspiciousScripts(manifestContent);
                suspiciousScripts = scriptCheck.findings;
                manifestSnippet = manifestContent.slice(0, 2000);
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

          // Step 4: Check SHA-keyed cache (deterministic reuse - 0 LLM calls!)
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

          // Step 4b: Eagerly fetch repository overview & README (eliminating 2 redundant LLM turns!)
          let readmeExcerpt = 'No README available.';
          let repoMetaSnippet = '';
          try {
            const overview = await this.mcpRegistry.getRepoOverview(owner, repo, tokenOverride);
            readmeExcerpt = overview.readmeExcerpt;
            repoMetaSnippet = `Repository: ${overview.fullName}\nDescription: ${overview.description}\nStars: ${overview.stars}\nPrimary Language: ${overview.language || eco.displayName}`;
          } catch (err: any) {
            this.logger.warn(`Could not pre-fetch repo overview for ${owner}/${repo}: ${err.message}`);
          }

          // Step 4c: Filter key architectural paths (up to 150 files) to include directly in prompt
          const architecturalTree = treePaths
            .filter((p) => !/(^|\/)(node_modules|\.git|\.turbo|\.next|dist|build|vendor|target|__pycache__|\.cache|\.venv|venv)($|\/)/i.test(p))
            .filter((p) => !/\.(png|jpe?g|gif|svg|ico|webp|mp4|webm|zip|tar|gz|woff2?|eot|ttf|otf|pdf|bin)$/i.test(p))
            .slice(0, 150);

          // Step 5: Construct Grounded Analysis Prompt with useful token context
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

${repoMetaSnippet ? `Metadata:\n${repoMetaSnippet}\n` : ''}
Key Architectural File Tree (first ${architecturalTree.length} files):
${architecturalTree.join('\n')}

${manifestSnippet ? `Manifest Excerpt (${eco.manifestFile}):\n${manifestSnippet}\n` : ''}
README Excerpt:
${readmeExcerpt}

Based on these grounding facts, README, and codebase structure, generate the structured JSON summary.
(You may optionally call 'read_file_slice' if you need deeper line-level verification of entrypoints).`;

          const rawOutput = await this.geminiStrategy.executeStructuredToolLoop(
            prompt,
            (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner, repo }, tokenOverride),
            (event) => subscriber.next(event),
            { systemInstruction, signal: abortController.signal, maxOutputTokens: 8192 }
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
              const repaired = await this.geminiStrategy.generateCompletion(repairPrompt, {
                signal: abortController.signal,
                maxOutputTokens: 8192,
              });
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

          // Apply defensive normalizer mapping snake_case -> camelCase
          parsed = normalizeRepoSummary(parsed, eco, owner, repo, commitSha);

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

      // Teardown
      return () => {
        abortController.abort();
      };
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
    hintPaths?: string[],
    tokenOverride?: string
  ): Observable<ServerSentEvent> {
    return new Observable<ServerSentEvent>((subscriber) => {
      const abortController = new AbortController();

      (async () => {
        try {
          subscriber.next({ type: 'PIPELINE_START', action: 'summarise-feature', timestamp: Date.now() });

          const { treePaths, commitSha } = await this.mcpRegistry.fetchRepoTreePaths(owner, repo, branch, tokenOverride);
          const eco = this.ecosystemDetector.detectEcosystem(treePaths);

          // Check SHA-keyed cache (0 LLM calls!)
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

          // Pre-filter candidate files from git tree matching query keywords to reduce exploratory tool turns
          const queryWords = featureQuery
            .toLowerCase()
            .split(/[\s,._/-]+/)
            .filter((w) => w.length > 2 && !['and', 'the', 'for', 'with', 'what', 'how', 'this', 'that', 'from'].includes(w));
          const candidateFiles = treePaths
            .filter((p) => queryWords.some((qw) => p.toLowerCase().includes(qw)))
            .slice(0, 20);

          const candidateHints = [
            ...(hintPaths || []),
            ...(candidateFiles.length > 0 ? candidateFiles : []),
          ];

          const systemInstruction = `You are OpenSourced, an elite open-source technical intelligence engine.
Analyze repository ${owner}/${repo} specifically for the requested feature or implementation question.

CRITICAL REPORTING STANDARDS:
1. FOCUS: Do NOT include generic repository purpose or target audience summaries. Focus 100% on the specific feature and code requested.
2. TECHNICAL DEPTH & ARCHITECTURE: Structure the "summary" field as an authoritative, multi-stage technical report:
   - High-Level Architecture & Rationale: Explain the system components, data lifecycle, and why specific data stores or pipelines are used (e.g. why PostgreSQL is used for durable persistence before indexing into OpenSearch).
   - Step-by-Step Execution Lifecycle: Walk through each concrete stage of execution (e.g. Stage 1: Setup & Healthcheck, Stage 2: Fetch & Parsing, Stage 3: Chunking & Embedding, Stage 4: Indexing & Reporting).
   - Concrete Code Citations: Quote key code snippets directly from the inspected files with their exact paths and function/class signatures (e.g. \`dag = DAG(...)\`, \`def setup_environment():\`, \`index_papers\`).
3. MERMAID DIAGRAM:
   - For ANY multi-step pipeline, workflow, ETL DAG, search router, or multi-service interaction, YOU MUST PROVIDE A HIGH-LEVEL MERMAID DIAGRAM (e.g. \`graph LR\` or \`graph TD\` or \`sequenceDiagram\`).
   - Ground the diagram in the actual components, services, and storage engines inspected (e.g. \`arXiv API --> Fetch[fetch_daily_papers] --> Postgres[(PostgreSQL)] --> Index[index_papers] --> OpenSearch[(OpenSearch)]\`).
   - If the feature is strictly a single isolated function without multi-component flow, set "mermaidDiagram" to "". NEVER output generic placeholders like "User -> System -> User".
4. ENTRYPOINTS:
   - Identify the primary entrypoint files that orchestrate or define this feature (e.g. DAG definitions, API routes/endpoints, CLI commands, primary worker handlers).
   - For each entrypoint, specify: "filePath", "lineRange" (e.g. "15-60"), "symbolName" (e.g. "dag", "search_hybrid", "IngestionWorker"), "symbolType" ("function" | "class" | "route_handler" | "component" | "middleware"), and "roleInFeature".
5. HONESTY & MINIMALISM:
   - If no security vulnerabilities exist, leave "findings" as [].
   - If no specific test commands exist, leave "testCommands" as [].
   - If no dedicated test files exist, leave "existingTestFiles" as [].

You MUST output a single valid JSON object strictly matching this schema structure without markdown fences:
{
  "type": "feature_summary",
  "featureName": "Concrete title of the feature or implementation",
  "summary": "Rich multi-stage technical breakdown with architectural rationale and code citations",
  "entrypoints": [
    {
      "filePath": "src/path/to/file.ext",
      "lineRange": "10-50",
      "symbolName": "symbol_name",
      "symbolType": "function",
      "roleInFeature": "Description of its role in the feature flow"
    }
  ],
  "mermaidDiagram": "graph LR\\n  A[Step 1] --> B[(Store)]\\n  B --> C[Step 2]",
  "dependencies": {
    "internalModules": ["path/to/internal/module.py"],
    "externalPackages": ["package-name"]
  },
  "securityAssessment": {
    "findings": []
  },
  "localVerification": {
    "existingTestFiles": [],
    "howToTriggerLocally": "Command or script to execute this locally if applicable",
    "testCommands": []
  }
}`;

          const hintPrompt = candidateHints.length ? `Candidate paths to inspect:\n${candidateHints.join('\n')}` : '';
          const prompt = `Analyze feature: "${featureQuery}" in repository ${owner}/${repo}.
Ecosystem: ${eco.displayName}
${hintPrompt}

Read the relevant files using 'read_file_slice' or search using available tools to understand the complete execution flow, key symbols, and architecture.
Synthesize an authoritative technical report with code citations and a high-level architectural diagram, then output the structured feature JSON.`;

          const rawOutput = await this.geminiStrategy.executeStructuredToolLoop(
            prompt,
            (tool, args) => this.mcpRegistry.executeTool(tool, { ...args, owner, repo }, tokenOverride),
            (event) => subscriber.next(event),
            { systemInstruction, signal: abortController.signal, maxOutputTokens: 8192 }
          );

          let parsed: FeatureSummaryOutput;
          const cleanJson = rawOutput.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          try {
            parsed = JSON.parse(cleanJson);
          } catch (err: any) {
            this.logger.warn(`Failed to parse feature JSON: ${err.message}. Attempting 1-turn repair prompt.`);
            try {
              const repairPrompt = `Fix the following invalid JSON so that it strictly parses with JSON.parse. Output ONLY the valid JSON, no markdown fences or prose:\n\n${cleanJson}`;
              const repaired = await this.geminiStrategy.generateCompletion(repairPrompt, {
                signal: abortController.signal,
                maxOutputTokens: 8192,
              });
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

          // Apply defensive normalizer mapping snake_case -> camelCase
          parsed = normalizeFeatureSummary(parsed);

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

      // Teardown
      return () => {
        abortController.abort();
      };
    });
  }
}
