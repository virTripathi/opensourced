import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GeminiProviderStrategy } from './strategies/gemini.strategy';
import { McpRegistryService } from '../mcp/mcp-registry.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ServerSentEvent, GitHubContext } from '@worksmarter/common/types';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly geminiStrategy: GeminiProviderStrategy,
    private readonly mcpRegistry: McpRegistryService,
    private readonly guardrails: GuardrailsService
  ) {}

  dispatchAction(action: string, context: GitHubContext): Observable<ServerSentEvent> {
    this.logger.log(`Dispatching action: ${action} for ${context.owner}/${context.repo} #${context.issueNumber}`);

    // Wrap external untrusted input
    const sanitizedBody = this.guardrails.wrapUntrusted('issue_body', context.body || 'No issue body provided');

    let prompt = '';
    let systemInstruction = '';

    switch (action) {
      case 'scan_issue':
        systemInstruction =
          'You are an expert open-source onboarding AI. Analyze the issue, invoke search_code and read_file_slice tools to pinpoint exact files and line numbers where changes are required. Explain why each entrypoint is relevant.';
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
}
