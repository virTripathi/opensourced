import { z } from 'zod';

// ============================================================================
// 1. GitHub Context
// ============================================================================

export const GitHubContextSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.number().int().positive().optional(),
  isIssue: z.boolean().default(true),
  url: z.string().url(),
  title: z.string().optional(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export type GitHubContext = z.infer<typeof GitHubContextSchema>;

// ============================================================================
// 2. Git Clone Subsystem
// ============================================================================

export const CloneRequestSchema = z.object({
  repoUrl: z.string().url(),
  owner: z.string(),
  repo: z.string(),
  destinationPath: z.string().optional(),
  autoOpenVsCode: z.boolean().default(true),
});

export type CloneRequest = z.infer<typeof CloneRequestSchema>;

export const CloneProgressEventSchema = z.object({
  type: z.literal('CLONE_PROGRESS'),
  percent: z.number().min(0).max(100),
  statusText: z.string(),
  rawOutput: z.string().optional(),
});

export type CloneProgressEvent = z.infer<typeof CloneProgressEventSchema>;

export const CloneResultSchema = z.object({
  success: z.boolean(),
  targetPath: z.string(),
  vsCodeUri: z.string(),
  message: z.string().optional(),
});

export type CloneResult = z.infer<typeof CloneResultSchema>;

export const FolderPickerResponseSchema = z.object({
  selectedPath: z.string().nullable(),
  cancelled: z.boolean(),
  defaultPath: z.string(),
});

export type FolderPickerResponse = z.infer<typeof FolderPickerResponseSchema>;

// ============================================================================
// 3. AST & Entrypoint Discovery
// ============================================================================

export const SymbolTypeSchema = z.enum([
  'function',
  'class',
  'method',
  'interface',
  'type',
  'variable',
  'file',
]);

export type SymbolType = z.infer<typeof SymbolTypeSchema>;

export const SuggestedActionSchema = z.enum([
  'modify',
  'inspect',
  'add_test',
  'refactor',
]);

export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

export const CodeEntrypointSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  symbolName: z.string().optional(),
  symbolType: SymbolTypeSchema.default('function'),
  signature: z.string().optional(),
  relevanceRationale: z.string(),
  suggestedAction: SuggestedActionSchema.default('modify'),
});

export type CodeEntrypoint = z.infer<typeof CodeEntrypointSchema>;

export const IssueAnalysisResultSchema = z.object({
  issueNumber: z.number(),
  repo: z.string(),
  summary: z.string(),
  rootCauseHypothesis: z.string(),
  entrypoints: z.array(CodeEntrypointSchema),
  dependencyMatrix: z.record(z.string(), z.array(z.string())).optional(),
});

export type IssueAnalysisResult = z.infer<typeof IssueAnalysisResultSchema>;

// ============================================================================
// 4. OWASP Security Audit
// ============================================================================

export const OwaspSeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFORMATIONAL',
]);

export type OwaspSeverity = z.infer<typeof OwaspSeveritySchema>;

export const OwaspSecurityFindingSchema = z.object({
  owaspCategory: z.string(),
  cweId: z.string(),
  severity: OwaspSeveritySchema,
  targetFile: z.string(),
  affectedLines: z.string(),
  vulnerabilityDescription: z.string(),
  secureCodeRemediation: z.string(),
});

export type OwaspSecurityFinding = z.infer<typeof OwaspSecurityFindingSchema>;

export const SecurityAuditReportSchema = z.object({
  issueNumber: z.number(),
  repo: z.string(),
  passed: z.boolean(),
  criticalCount: z.number().default(0),
  findings: z.array(OwaspSecurityFindingSchema),
  complianceNotes: z.string(),
});

export type SecurityAuditReport = z.infer<typeof SecurityAuditReportSchema>;

// ============================================================================
// 5. Automated PR Description Generation
// ============================================================================

export const PullRequestDraftSchema = z.object({
  title: z.string(),
  summary: z.string(),
  linkedIssue: z.string(),
  entrypointsCovered: z.array(z.string()),
  breakingChanges: z.boolean().default(false),
  verificationSteps: z.array(z.string()),
  markdownBody: z.string(),
});

export type PullRequestDraft = z.infer<typeof PullRequestDraftSchema>;

// ============================================================================
// 6. Server-Sent Events (SSE) Protocol
// ============================================================================

export type ServerSentEvent =
  | { type: 'PIPELINE_START'; action: string; timestamp: number }
  | { type: 'TOOL_CALL'; tool: string; params: Record<string, unknown> }
  | { type: 'TOOL_RESULT'; tool: string; summary: string }
  | { type: 'TOKEN_DELTA'; text: string }
  | { type: 'CLONE_PROGRESS'; percent: number; statusText: string }
  | { type: 'CLONE_COMPLETE'; targetPath: string; vsCodeUri: string }
  | { type: 'ENTRYPOINTS_FOUND'; result: IssueAnalysisResult }
  | { type: 'SECURITY_AUDIT_COMPLETE'; result: SecurityAuditReport }
  | { type: 'PR_DRAFT_COMPLETE'; result: PullRequestDraft }
  | { type: 'PIPELINE_COMPLETE'; action: string; result: unknown }
  | { type: 'PIPELINE_ERROR'; message: string; recoverable: boolean };

// ============================================================================
// 7. Wispr Flow Audio & Voice Commands
// ============================================================================

export type AudioState = 'idle' | 'listening' | 'transcribing' | 'executed' | 'error';

export type VoiceCommandIntent =
  | 'CLONE_REPO'
  | 'SCAN_ISSUE'
  | 'AUDIT_SECURITY'
  | 'DRAFT_PR'
  | 'EXPORT_DRIVE'
  | 'DICTATION';

export interface VoiceCommandMatch {
  intent: VoiceCommandIntent;
  rawTranscript: string;
  confidence: number;
  extractedParameters?: Record<string, string>;
}

// ============================================================================
// 8. User Auth & Session
// ============================================================================

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl?: string;
  githubConnected: boolean;
  googleConnected: boolean;
}
