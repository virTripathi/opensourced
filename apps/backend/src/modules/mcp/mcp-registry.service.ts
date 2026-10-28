import { Injectable, Logger } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

@Injectable()
export class McpRegistryService {
  private readonly logger = new Logger(McpRegistryService.name);
  private octokit = new Octokit();

  setAuthToken(token?: string) {
    if (token) {
      this.octokit = new Octokit({ auth: token });
    }
  }

  /**
   * Gemini Function Declarations for model-driven tool calling
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'search_code',
        description: 'Searches the target repository for specific symbols, function names, classes, or keywords.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            query: { type: SchemaType.STRING, description: 'Search term or code identifier' },
            path: { type: SchemaType.STRING, description: 'Optional subfolder path filter' },
          },
          required: ['owner', 'repo', 'query'],
        },
      },
      {
        name: 'read_file_slice',
        description: 'Reads specific line numbers of a file rather than the entire file to avoid token bloat.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            path: { type: SchemaType.STRING, description: 'File path within repository' },
            startLine: { type: SchemaType.NUMBER, description: '1-indexed start line' },
            endLine: { type: SchemaType.NUMBER, description: '1-indexed end line' },
          },
          required: ['owner', 'repo', 'path'],
        },
      },
      {
        name: 'list_directory',
        description: 'Lists files and folders at a specified directory path in the repository.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            owner: { type: SchemaType.STRING, description: 'Repository owner' },
            repo: { type: SchemaType.STRING, description: 'Repository name' },
            path: { type: SchemaType.STRING, description: 'Directory path (empty for root)' },
          },
          required: ['owner', 'repo'],
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
        case 'search_code': {
          const q = `${args.query} repo:${args.owner}/${args.repo} ${args.path ? `path:${args.path}` : ''}`;
          const res = await this.octokit.rest.search.code({ q });
          return res.data.items.slice(0, 5).map((item) => ({
            name: item.name,
            path: item.path,
            html_url: item.html_url,
          }));
        }

        case 'read_file_slice': {
          const res = await this.octokit.rest.repos.getContent({
            owner: args.owner,
            repo: args.repo,
            path: args.path,
          });

          if ('content' in res.data && typeof res.data.content === 'string') {
            const decoded = Buffer.from(res.data.content, 'base64').toString('utf-8');
            const lines = decoded.split('\n');
            const start = Math.max(1, (args.startLine || 1) - 1);
            const end = Math.min(lines.length, args.endLine || lines.length);
            return lines.slice(start, end).join('\n');
          }
          return 'Unable to decode file content';
        }

        case 'list_directory': {
          const res = await this.octokit.rest.repos.getContent({
            owner: args.owner,
            repo: args.repo,
            path: args.path || '',
          });

          if (Array.isArray(res.data)) {
            return res.data.map((item) => ({
              name: item.name,
              path: item.path,
              type: item.type,
            }));
          }
          return res.data;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      this.logger.error(`Error executing tool ${name}: ${err.message}`);
      return { error: err.message };
    }
  }
}
