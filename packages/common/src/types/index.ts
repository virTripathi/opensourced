import { z } from 'zod';

// ============================================================================
// 1. GitHub Context
// ============================================================================

export const GitHubContextSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  branch: z.string().optional(),
  issueNumber: z.number().int().positive().optional(),
  isIssue: z.boolean().default(true),
  url: z.string().url(),
  title: z.string().optional(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export type GitHubContext = z.infer<typeof GitHubContextSchema>;

// ============================================================================
// 2. AST & Entrypoint Discovery
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
// 4. Security Check
// ============================================================================

export const SecuritySeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFORMATIONAL',
]);

export type SecuritySeverity = z.infer<typeof SecuritySeveritySchema>;

export const SecurityFindingSchema = z.object({
  category: z.string(),
  cweId: z.string().optional(),
  severity: SecuritySeveritySchema,
  targetFile: z.string(),
  affectedLines: z.string(),
  vulnerabilityDescription: z.string(),
  secureCodeRemediation: z.string(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityAuditReportSchema = z.object({
  issueNumber: z.number(),
  repo: z.string(),
  passed: z.boolean(),
  criticalCount: z.number().default(0),
  findings: z.array(SecurityFindingSchema),
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

export * from './summary.js';

// ============================================================================
// 6. Server-Sent Events (SSE) Protocol
// ============================================================================

export type ServerSentEvent =
  | { type: 'PIPELINE_START'; action: string; timestamp: number }
  | { type: 'TOOL_CALL'; tool: string; params: Record<string, unknown> }
  | { type: 'TOOL_RESULT'; tool: string; summary: string }
  | { type: 'TOKEN_DELTA'; text: string }
  | { type: 'ENTRYPOINTS_FOUND'; result: IssueAnalysisResult }
  | { type: 'SECURITY_AUDIT_COMPLETE'; result: SecurityAuditReport }
  | { type: 'PR_DRAFT_COMPLETE'; result: PullRequestDraft }
  | { type: 'CREDENTIAL_SCAN_RESULT'; clean: boolean; flaggedFiles: string[] }
  | { type: 'TREE_ANALYZED'; ecosystem: string; verifiedEntrypoints: string[]; manifestFound?: string }
  | { type: 'REPO_SUMMARY_COMPLETE'; result: import('./summary.js').RepoSummaryOutput }
  | { type: 'FEATURE_SUMMARY_COMPLETE'; result: import('./summary.js').FeatureSummaryOutput }
  | { type: 'PIPELINE_COMPLETE'; action: string; result: unknown }
  | { type: 'PIPELINE_ERROR'; message: string; recoverable: boolean; code?: string; canRetry?: boolean };

// ============================================================================
// 6. Wispr Flow Audio & Voice Commands
// ============================================================================

export type AudioState = 'idle' | 'listening' | 'transcribing' | 'executed' | 'error';

export type VoiceCommandIntent =
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
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  isGuest?: boolean;
  githubConnected: boolean;
  googleConnected: boolean;
  hasPat?: boolean;
}

export interface UserReport {
  id: string;
  userId: string;
  title: string;
  repo: string;
  action: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionResponse {
  user: UserProfile;
  token?: string;
}
