import { Injectable, Logger, Optional } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { EcosystemDetectorService, EcosystemAnalysisResult } from './ecosystem-detector.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ThirdPartyHttpService } from '../logger/third-party-http.service';

const EXCLUDED_DIR_PATTERNS = [
  /(^|\/)(node_modules|\.git|\.turbo|\.next|dist|build|vendor|target|__pycache__|\.cache|\.venv|venv|\.idea|\.vscode)($|\/)/i,
  /\.(png|jpe?g|gif|svg|ico|webp|mp4|webm|zip|tar|gz|woff2?|eot|ttf|otf|pdf|exe|dll|so|dylib|bin)$/i,
];

import { ConfigService } from '@nestjs/config';

@Injectable()
export class McpRegistryService {
  private readonly logger = new Logger(McpRegistryService.name);
  private octokit: Octokit;
  private currentAuthToken?: string;
  private treeCache = new Map<string, { treePaths: string[]; commitSha: string; timestamp: number }>();

  constructor(
    private readonly ecosystemDetector: EcosystemDetectorService,
    private readonly guardrails: GuardrailsService,
    @Optional() private readonly thirdPartyHttp?: ThirdPartyHttpService,
    @Optional() private readonly configService?: ConfigService
  ) {
    this.octokit = this.createOctokitInstance();
  }

  private createOctokitInstance(token?: string): Octokit {
    const customFetch = this.thirdPartyHttp
      ? this.thirdPartyHttp.createWrappedFetch('GitHub_Octokit')
      : undefined;

    const fallbackToken =
      this.configService?.get<string>('github.tokenFallback') ||
      this.configService?.get<string>('GITHUB_TOKEN');
    const effectiveToken = token || this.currentAuthToken || fallbackToken;

    return new Octokit({
      auth: effectiveToken || undefined,
      request: customFetch ? { fetch: customFetch } : undefined,
    });
  }

  setAuthToken(token?: string) {
    if (token) {
      this.currentAuthToken = token;
      this.octokit = this.createOctokitInstance(token);
    }
  }

  /**
   * Fetches and caches the full Git Tree in a single API call (~350ms).
   */
  async fetchRepoTreePaths(
    owner: string,
    repo: string,
    branch?: string
  ): Promise<{ treePaths: string[]; commitSha: string }> {
    const cacheKey = `${owner}/${repo}/${branch || 'default'}`;
    const cached = this.treeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 10) {
      return { treePaths: cached.treePaths, commitSha: cached.commitSha };
    }

    try {
      // 1. Get branch ref / commit SHA
      const repoDetails = await this.octokit.rest.repos.get({ owner, repo });
      const targetBranch = branch || repoDetails.data.default_branch || 'main';

      const branchRef = await this.octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: targetBranch,
      });
      const commitSha = branchRef.data.commit.sha;

      // 2. Fetch full tree recursively
      const treeResponse = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: commitSha,
        recursive: 'true',
      });

      const treePaths = (treeResponse.data.tree || [])
        .filter((item) => item.type === 'blob' && item.path)
        .map((item) => item.path as string);

      this.treeCache.set(cacheKey, { treePaths, commitSha, timestamp: Date.now() });
      return { treePaths, commitSha };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch git tree via Octokit: ${err.message}. Using fallback root scan.`);
      return { treePaths: [], commitSha: 'unknown-sha' };
    }
  }

  /**
   * Gemini Function Declarations for model-driven tool calling
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'get_repo_overview',
        description:
          'Fetches repository metadata, README excerpt, detected manifests, license, and stars in one consolidated call.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'get_filtered_file_tree',
        description:
          'Returns a clean, compact file tree of the repository, excluding lockfiles, node_modules, and binary assets.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            maxDepth: { type: SchemaType.NUMBER, description: 'Optional max folder depth (default: 3)' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'read_file_slice',
        description:
          'Reads a specific line range (e.g. lines 1-100) of a target file. Automatically blocks sensitive credential files and redacts secrets.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            path: { type: SchemaType.STRING, description: 'Relative file path within repository' },
            startLine: { type: SchemaType.NUMBER, description: '1-indexed start line' },
            endLine: { type: SchemaType.NUMBER, description: '1-indexed end line' },
          },
          required: ['owner', 'repo', 'path'],
        },
      },
      {
        name: 'search_code_symbols',
        description:
          'Searches the repository for specific functions, classes, routes, or keywords (e.g. "auth", "checkout", "webhook").',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            query: { type: SchemaType.STRING, description: 'Identifier, symbol, or keyword to find' },
            path: { type: SchemaType.STRING, description: 'Optional subfolder path filter' },
          },
          required: ['owner', 'repo', 'query'],
        },
      },
      {
        name: 'detect_ecosystem_and_setup',
        description:
          'Deterministically detects the primary programming language, framework, build system, verified entrypoints, and exact setup commands.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'get_issue_details',
        description:
          'Fetches the title, body description, author, labels, and status of a GitHub issue or pull request.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            issueNumber: { type: SchemaType.NUMBER, description: 'Issue or PR number' },
          },
          required: ['owner', 'repo', 'issueNumber'],
        },
      },
    ];
  }

  /**
   * Dispatches and executes tool calls over HTTPS
   */
  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    this.logger.log(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);

    try {
      switch (name) {
        case 'get_repo_overview': {
          const { owner, repo } = args;
          const repoDetails = await this.octokit.rest.repos.get({ owner, repo });

          // Attempt to fetch README
          let readmeSnippet = 'No README.md found.';
          try {
            const readmeRes = await this.octokit.rest.repos.getReadme({ owner, repo });
            if ('content' in readmeRes.data && typeof readmeRes.data.content === 'string') {
              const decoded = Buffer.from(readmeRes.data.content, 'base64').toString('utf-8');
              readmeSnippet = this.guardrails.scanAndRedact(decoded.slice(0, 3000)).sanitizedText;
            }
          } catch {
            // README may not exist, continue
          }

          // Check ecosystem and manifest
          const { treePaths, commitSha } = await this.fetchRepoTreePaths(owner, repo);
          const ecoAnalysis = this.ecosystemDetector.detectEcosystem(treePaths);

          return {
            name: repoDetails.data.full_name,
            description: repoDetails.data.description || 'No description provided.',
            language: repoDetails.data.language,
            stars: repoDetails.data.stargazers_count,
            license: repoDetails.data.license?.name || 'Unlicensed / Not specified',
            commitSha,
            ecosystem: ecoAnalysis.displayName,
            isMonorepo: ecoAnalysis.isMonorepo,
            monorepoTool: ecoAnalysis.monorepoTool,
            verifiedEntrypoints: ecoAnalysis.verifiedEntrypoints,
            readmeExcerpt: readmeSnippet,
          };
        }

        case 'get_filtered_file_tree': {
          const { owner, repo, maxDepth = 3 } = args;
          const { treePaths } = await this.fetchRepoTreePaths(owner, repo);

          const filtered = treePaths.filter((path) => {
            if (EXCLUDED_DIR_PATTERNS.some((pat) => pat.test(path))) return false;
            const depth = path.split('/').length;
            return depth <= maxDepth;
          });

          return {
            totalFiles: treePaths.length,
            visibleArchitecturalFiles: filtered.slice(0, 100),
          };
        }

        case 'read_file_slice': {
          const { owner, repo, path, startLine = 1, endLine = 100 } = args;

          // Security check: Block sensitive files from being read
          if (this.guardrails.isBlockedSensitivePath(path)) {
            return `[ACCESS_BLOCKED] Guardrail Policy: '${path}' is classified as a sensitive credential or secret file. Read access is prohibited.`;
          }

          const res = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path,
          });

          if ('content' in res.data && typeof res.data.content === 'string') {
            const decoded = Buffer.from(res.data.content, 'base64').toString('utf-8');
            const sanitized = this.guardrails.scanAndRedact(decoded).sanitizedText;
            const lines = sanitized.split('\n');

            const start = Math.max(1, startLine) - 1;
            const end = Math.min(lines.length, Math.max(startLine, endLine));

            const sliced = lines
              .slice(start, end)
              .map((line, idx) => `${start + idx + 1}: ${line}`)
              .join('\n');

            return sliced || 'Empty file or range out of bounds';
          }
          return 'Unable to decode file content';
        }

        case 'search_code_symbols': {
          const { owner, repo, query = '', path } = args;
          const queryStr = String(query || '').trim();
          const q = `${queryStr} repo:${owner}/${repo} ${path ? `path:${path}` : ''}`.trim();
          try {
            const res = await this.octokit.rest.search.code({ q });
            return (res.data.items || []).slice(0, 5).map((item) => ({
              name: item.name,
              path: item.path,
              url: item.html_url,
            }));
          } catch (err: any) {
            // If Code Search rate-limited, search through cached tree paths
            this.logger.warn(`Search code API rate limit or error: ${err.message}. Falling back to tree lookup.`);
            const { treePaths } = await this.fetchRepoTreePaths(owner, repo);
            const lowerQuery = queryStr.toLowerCase();
            const matchedPaths = treePaths
              .filter((p) => p.toLowerCase().includes(lowerQuery))
              .slice(0, 8)
              .map((p) => ({ path: p, reason: 'Matched in file tree hierarchy' }));
            return matchedPaths;
          }
        }

        case 'detect_ecosystem_and_setup': {
          const { owner, repo } = args;
          const { treePaths } = await this.fetchRepoTreePaths(owner, repo);
          return this.ecosystemDetector.detectEcosystem(treePaths);
        }

        case 'get_issue_details': {
          const { owner, repo, issueNumber } = args;
          const num = Number(issueNumber);
          if (!num) return { error: 'Valid issueNumber is required' };
          try {
            const res = await this.octokit.rest.issues.get({
              owner,
              repo,
              issue_number: num,
            });
            return {
              number: res.data.number,
              title: res.data.title,
              state: res.data.state,
              user: res.data.user?.login,
              labels: (res.data.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
              body: this.guardrails.scanAndRedact((res.data.body || '').slice(0, 4000)).sanitizedText,
            };
          } catch (err: any) {
            return { error: `Failed to fetch issue #${num}: ${err.message}` };
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      this.logger.error(`Error executing tool ${name}: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Helper to fetch issue title and body for prompt enrichment
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<{ title: string; body: string }> {
    try {
      const res = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });
      return {
        title: res.data.title || '',
        body: res.data.body || '',
      };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch issue #${issueNumber} via Octokit: ${err.message}`);
      return { title: '', body: '' };
    }
  }
}
