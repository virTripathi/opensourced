import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// 1. Request DTOs
// ============================================================================

export class SummariseRepoDto {
  @ApiProperty({
    description: 'Repository owner or organization name (e.g., facebook, calcom, vercel)',
    example: 'facebook',
  })
  owner!: string;

  @ApiProperty({
    description: 'Repository name (e.g., react, cal.com, next.js)',
    example: 'react',
  })
  repo!: string;

  @ApiPropertyOptional({
    description: 'Target git branch or commit reference (defaults to default_branch, usually main/master)',
    example: 'main',
  })
  branch?: string;

  @ApiPropertyOptional({
    description: 'Optional focus areas to prioritize in the architectural summary',
    example: ['compiler', 'concurrency', 'reconciler'],
    type: [String],
  })
  focusAreas?: string[];

  @ApiPropertyOptional({
    description: 'Optional personal access token for higher GitHub rate limits or private repositories',
    example: 'ghp_exampleToken1234567890abcdef',
  })
  customPat?: string;
}

export class SummariseFeatureDto {
  @ApiProperty({
    description: 'Repository owner or organization name',
    example: 'calcom',
  })
  owner!: string;

  @ApiProperty({
    description: 'Repository name',
    example: 'cal.com',
  })
  repo!: string;

  @ApiProperty({
    description: 'Natural language description or exact name of the feature to analyze',
    example: 'Stripe subscription webhook and billing sync',
  })
  featureQuery!: string;

  @ApiPropertyOptional({
    description: 'Target git branch or commit reference',
    example: 'main',
  })
  branch?: string;

  @ApiPropertyOptional({
    description: 'Optional path hints where the feature code is suspected to reside',
    example: ['packages/features/ee/billing', 'packages/app-store/stripepayment'],
    type: [String],
  })
  hintPaths?: string[];

  @ApiPropertyOptional({
    description: 'Optional GitHub issue number if the feature relates to an open ticket',
    example: 14280,
  })
  linkedIssueNumber?: number;

  @ApiPropertyOptional({
    description: 'Optional GitHub Personal Access Token',
    example: 'ghp_exampleToken1234567890abcdef',
  })
  customPat?: string;
}

// ============================================================================
// 2. Response DTOs: Repository Summary
// ============================================================================

export class RepoMetadataDto {
  @ApiProperty({ example: 'facebook/react', description: 'Canonical repository identifier' })
  repo!: string;

  @ApiProperty({ example: 'JavaScript', description: 'Primary language declared by GitHub' })
  primaryLanguage!: string;

  @ApiProperty({ example: 'typescript', description: 'Detected ecosystem identifier' })
  ecosystem!: string;

  @ApiProperty({ example: ['React', 'Next.js', 'Turborepo'], description: 'Detected frameworks and libraries' })
  techStack!: string[];

  @ApiProperty({ example: 'MIT License', nullable: true, description: 'Software license name' })
  license!: string | null;

  @ApiProperty({ example: true, description: 'Whether the project is structured as a monorepo' })
  isMonorepo!: boolean;

  @ApiPropertyOptional({ example: '16a1d5d780b9cbbe2e1ac5f3dc6db8df6e7983ec', description: 'Verified Git commit SHA' })
  commitSha?: string;
}

export class TargetAudienceDto {
  @ApiProperty({
    example: ['Frontend Engineers', 'Full-stack Developers', 'Open-source Contributors'],
    description: 'Who gets benefitted and directly uses this project',
  })
  primaryBeneficiaries!: string[];

  @ApiProperty({
    example: [
      'Building reactive single-page client applications',
      'Developing cross-platform UI components',
      'Contributing to core compiler logic',
    ],
    description: 'Top practical scenarios where this project is used',
  })
  useCases!: string[];
}

export class CoreComponentDto {
  @ApiProperty({ example: 'react_compiler', description: 'Name of subsystem or package' })
  name!: string;

  @ApiProperty({ example: 'compiler/crates/react_compiler/src/lib.rs', description: 'Root file or directory path' })
  path!: string;

  @ApiProperty({ example: 'Transforms React components into optimized low-level instructions', description: 'Role in architecture' })
  role!: string;

  @ApiProperty({ example: ['rustc', 'syn'], description: 'Immediate package dependencies' })
  dependencies!: string[];
}

export class ArchitectureDto {
  @ApiProperty({
    example: 'Modular monorepo architecture separating the core reconciler, DOM renderer, and compiler.',
    description: 'High-level architectural pattern',
  })
  overview!: string;

  @ApiProperty({
    example: 'graph TB\n  Client["Client Tier (React DOM)"] --> Reconciler["Fiber Reconciler"]\n  Reconciler --> Compiler["React Compiler Engine"]',
    description: 'Valid, sanitized Mermaid diagram code ready for rendering',
  })
  mermaidDiagram!: string;

  @ApiProperty({
    example: 'First, client components trigger reconciliation actions that pass through the reconciler before compiling into optimized render instructions.',
    description: 'Conversational audio walkthrough of the architecture diagram for voice dictation',
    required: false,
  })
  diagramExplanation?: string;

  @ApiProperty({ type: [CoreComponentDto], description: 'Key components and modules comprising the system' })
  coreComponents!: CoreComponentDto[];
}

export class EntryFileDto {
  @ApiProperty({ example: 'packages/react/src/index.js', description: 'Relative file path from repository root' })
  path!: string;

  @ApiProperty({ example: 'Main package entrypoint exporting public Hooks and Component APIs', description: 'Why this file is critical' })
  description!: string;

  @ApiProperty({ example: ['useState', 'useEffect', 'useMemo', 'Component'], description: 'Key exports or classes' })
  keyExportsOrSymbols!: string[];
}

export class SecurityFindingDto {
  @ApiProperty({ example: 'Hardcoded Secret / Leaked Credential', description: 'Vulnerability category' })
  category!: string;

  @ApiProperty({ example: 'CRITICAL', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'] })
  severity!: string;

  @ApiProperty({ example: 'fixtures/nesting/.env', description: 'File path or line location of vulnerability' })
  fileOrLocation!: string;

  @ApiProperty({ example: 'Sensitive credential file found committed to repository tree.', description: 'Vulnerability details' })
  description!: string;

  @ApiProperty({ example: 'Add file to .gitignore, purge from git history, and rotate exposed credentials.', description: 'Remediation advice' })
  remediation!: string;
}

export class SecurityAssessmentDto {
  @ApiProperty({ example: 'INSECURE', enum: ['SECURE', 'LOW_RISK', 'MODERATE_RISK', 'INSECURE'] })
  overallRating!: string;

  @ApiProperty({ example: true, description: 'Whether committed credentials or private keys were found in the tree' })
  leakedCredentialsDetected!: boolean;

  @ApiProperty({ example: ['fixtures/nesting/.env'], description: 'List of sensitive files flagged' })
  flaggedFiles!: string[];

  @ApiProperty({ type: [SecurityFindingDto], description: 'Detailed security findings' })
  findings!: SecurityFindingDto[];
}

export class SetupCommandDto {
  @ApiProperty({ example: '1. Install Dependencies', description: 'Step name' })
  step!: string;

  @ApiProperty({ example: 'npm install', description: 'Shell command line to execute' })
  command!: string;

  @ApiProperty({ example: 'Install all workspace dependencies via npm', description: 'Purpose of command' })
  description!: string;
}

export class EnvSetupDto {
  @ApiProperty({ example: '.env.example', nullable: true, description: 'Template environment file path' })
  sampleEnvFile!: string | null;

  @ApiProperty({ example: ['DATABASE_URL', 'AUTH_SECRET'], description: 'Required environment variable names' })
  requiredVariables!: string[];
}

export class LocalSetupGuideDto {
  @ApiProperty({ example: ['Node.js >= 20', 'pnpm >= 9'], description: 'Required development runtimes' })
  prerequisites!: string[];

  @ApiProperty({ type: EnvSetupDto, description: 'Environment variables configuration' })
  envSetup!: EnvSetupDto;

  @ApiProperty({ type: [SetupCommandDto], description: 'Ordered setup and startup commands' })
  quickstartCommands!: SetupCommandDto[];

  @ApiProperty({ example: ['Run commands from workspace root'], description: 'Common troubleshooting gotchas' })
  commonGotchas!: string[];
}

export class RepoSummaryResponseDto {
  @ApiProperty({ example: 'repo_summary', description: 'Discriminator type' })
  type!: string;

  @ApiProperty({ type: RepoMetadataDto })
  metadata!: RepoMetadataDto;

  @ApiProperty({
    example: 'React is a library for web and native user interfaces, allowing developers to build composable UI components.',
    description: 'What purpose the repository serves',
  })
  purpose!: string;

  @ApiProperty({ type: TargetAudienceDto })
  targetAudience!: TargetAudienceDto;

  @ApiProperty({ type: ArchitectureDto })
  architecture!: ArchitectureDto;

  @ApiProperty({ type: [EntryFileDto] })
  entryFiles!: EntryFileDto[];

  @ApiProperty({ type: SecurityAssessmentDto })
  securityAssessment!: SecurityAssessmentDto;

  @ApiProperty({ type: LocalSetupGuideDto })
  localSetup!: LocalSetupGuideDto;
}

// ============================================================================
// 3. Response DTOs: Feature-Specific Summary
// ============================================================================

export class FeatureEntrypointDto {
  @ApiProperty({ example: 'packages/app-store/stripepayment/api/webhook.ts', description: 'Entrypoint file path' })
  filePath!: string;

  @ApiPropertyOptional({ example: '35-90', description: 'Line span where feature logic executes' })
  lineRange?: string;

  @ApiProperty({ example: 'handleStripeWebhook', description: 'Function, route, or class symbol name' })
  symbolName!: string;

  @ApiProperty({
    example: 'route_handler',
    enum: ['function', 'class', 'route_handler', 'component', 'middleware', 'struct', 'trait'],
  })
  symbolType!: string;

  @ApiProperty({
    example: 'Validates Stripe webhook signature and updates team subscription status in database',
    description: 'Specific responsibility in this feature flow',
  })
  roleInFeature!: string;
}

export class FeatureDependenciesDto {
  @ApiProperty({ example: ['packages/features/ee/billing', 'packages/prisma'], description: 'Internal workspace modules' })
  internalModules!: string[];

  @ApiProperty({ example: ['stripe', '@prisma/client'], description: 'External third-party packages' })
  externalPackages!: string[];

  @ApiPropertyOptional({ example: ['User', 'Subscription', 'PaymentIntent'], description: 'Related database entities' })
  databaseTablesOrEntities?: string[];
}

export class FeatureSecurityFindingDto {
  @ApiProperty({ example: 'Unverified Webhook Signature', description: 'Risk description' })
  risk!: string;

  @ApiProperty({ example: 'HIGH', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] })
  severity!: string;

  @ApiProperty({ example: 'packages/app-store/stripepayment/api/webhook.ts', description: 'Affected file' })
  file!: string;

  @ApiProperty({ example: 'Verify event signature using stripe.webhooks.constructEvent()', description: 'Suggested fix' })
  suggestedFix!: string;
}

export class FeatureSecurityAssessmentDto {
  @ApiProperty({ type: [FeatureSecurityFindingDto], description: 'Security findings specific to this feature' })
  findings!: FeatureSecurityFindingDto[];
}

export class FeatureLocalVerificationDto {
  @ApiProperty({ example: ['packages/app-store/stripepayment/api/webhook.spec.ts'], description: 'Associated test files' })
  existingTestFiles!: string[];

  @ApiProperty({
    example: 'Forward test events using Stripe CLI: stripe listen --forward-to localhost:8000/api/webhooks/stripe',
    description: 'How to trigger or exercise this feature locally',
  })
  howToTriggerLocally!: string;

  @ApiProperty({ example: ['pnpm test webhook.spec.ts'], description: 'Exact test commands' })
  testCommands!: string[];
}

export class FeatureSummaryResponseDto {
  @ApiProperty({ example: 'feature_summary', description: 'Discriminator type' })
  type!: string;

  @ApiProperty({ example: 'Stripe Billing & Webhook Synchronization', description: 'Name of the analyzed feature' })
  featureName!: string;

  @ApiProperty({
    example: 'Asynchronous event-driven webhook pipeline that receives Stripe events, validates cryptographic signatures, and persists customer subscription tiers.',
    description: 'Detailed feature summary (note: general purpose and audience are omitted)',
  })
  summary!: string;

  @ApiProperty({ type: [FeatureEntrypointDto], description: 'Exact code entrypoints powering this feature' })
  entrypoints!: FeatureEntrypointDto[];

  @ApiProperty({
    example: 'sequenceDiagram\n  autonumber\n  actor Stripe\n  participant Webhook as /api/webhooks/stripe\n  participant DB as PostgreSQL\n  Stripe->>Webhook: POST invoice.payment_succeeded\n  Webhook->>Webhook: Verify Signature\n  Webhook->>DB: UPDATE Subscription SET status="active"',
    description: 'Valid Mermaid sequence or data flow diagram illustrating feature execution',
  })
  mermaidDiagram!: string;

  @ApiProperty({
    example: 'When Stripe triggers a webhook event, the HTTP handler verifies the cryptographic signature before asynchronously writing the subscription status into PostgreSQL.',
    description: 'Conversational audio walkthrough of the feature execution flow for voice dictation',
    required: false,
  })
  diagramExplanation?: string;

  @ApiProperty({ type: FeatureDependenciesDto })
  dependencies!: FeatureDependenciesDto;

  @ApiProperty({ type: FeatureSecurityAssessmentDto })
  securityAssessment!: FeatureSecurityAssessmentDto;

  @ApiProperty({ type: FeatureLocalVerificationDto })
  localVerification!: FeatureLocalVerificationDto;
}
