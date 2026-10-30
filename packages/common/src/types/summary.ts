import { z } from 'zod';

// ============================================================================
// 1. Universal Ecosystem & Language Definitions
// ============================================================================

export const SupportedEcosystemSchema = z.enum([
  'javascript',
  'typescript',
  'golang',
  'rust',
  'python',
  'cpp',
  'c',
  'java',
  'kotlin',
  'ruby',
  'php',
  'generic',
]);

export type SupportedEcosystem = z.infer<typeof SupportedEcosystemSchema>;

export interface EcosystemRule {
  ecosystem: SupportedEcosystem;
  displayName: string;
  manifestFiles: string[];
  lockFiles: string[];
  entrypointGlobs: string[];
  testFileGlobs: string[];
  defaultCommands: {
    install: string;
    build?: string;
    devOrRun: string;
    test?: string;
  };
}

export const UNIVERSAL_ECOSYSTEM_REGISTRY: Record<SupportedEcosystem, EcosystemRule> = {
  typescript: {
    ecosystem: 'typescript',
    displayName: 'TypeScript / Node.js',
    manifestFiles: ['package.json', 'tsconfig.json'],
    lockFiles: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'],
    entrypointGlobs: ['src/index.ts', 'src/main.ts', 'index.ts', 'server.ts', 'app.ts', 'pages/_app.tsx', 'app/layout.tsx'],
    testFileGlobs: ['**/*.spec.ts', '**/*.test.ts', '**/tests/**/*.ts'],
    defaultCommands: {
      install: 'npm install',
      build: 'npm run build',
      devOrRun: 'npm run dev',
      test: 'npm test',
    },
  },
  javascript: {
    ecosystem: 'javascript',
    displayName: 'JavaScript / Node.js',
    manifestFiles: ['package.json'],
    lockFiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    entrypointGlobs: ['src/index.js', 'src/main.js', 'index.js', 'server.js', 'app.js', 'bin/index.js'],
    testFileGlobs: ['**/*.spec.js', '**/*.test.js', '**/tests/**/*.js'],
    defaultCommands: {
      install: 'npm install',
      devOrRun: 'npm start',
      test: 'npm test',
    },
  },
  golang: {
    ecosystem: 'golang',
    displayName: 'Go',
    manifestFiles: ['go.mod', 'go.work'],
    lockFiles: ['go.sum'],
    entrypointGlobs: ['main.go', 'cmd/**/main.go', 'cmd/**/app.go'],
    testFileGlobs: ['**/*_test.go'],
    defaultCommands: {
      install: 'go mod download',
      build: 'go build -v ./...',
      devOrRun: 'go run .',
      test: 'go test -v ./...',
    },
  },
  rust: {
    ecosystem: 'rust',
    displayName: 'Rust',
    manifestFiles: ['Cargo.toml'],
    lockFiles: ['Cargo.lock'],
    entrypointGlobs: ['src/main.rs', 'src/lib.rs', 'src/bin/*.rs'],
    testFileGlobs: ['tests/**/*.rs', 'src/**/*test*.rs'],
    defaultCommands: {
      install: 'cargo check',
      build: 'cargo build --release',
      devOrRun: 'cargo run',
      test: 'cargo test',
    },
  },
  python: {
    ecosystem: 'python',
    displayName: 'Python',
    manifestFiles: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
    lockFiles: ['poetry.lock', 'Pipfile.lock'],
    entrypointGlobs: ['app.py', 'main.py', 'wsgi.py', 'manage.py', '**/__main__.py', 'run.py'],
    testFileGlobs: ['test_*.py', '*_test.py', 'tests/**/*.py'],
    defaultCommands: {
      install: 'pip install -r requirements.txt',
      devOrRun: 'python main.py',
      test: 'pytest',
    },
  },
  cpp: {
    ecosystem: 'cpp',
    displayName: 'C / C++',
    manifestFiles: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    lockFiles: [],
    entrypointGlobs: ['main.cpp', 'main.c', 'src/main.cpp', 'src/main.c', 'app/main.cpp'],
    testFileGlobs: ['tests/**/*.cpp', 'test/**/*.c'],
    defaultCommands: {
      install: 'cmake -B build',
      build: 'cmake --build build',
      devOrRun: './build/main',
      test: 'ctest --test-dir build',
    },
  },
  c: {
    ecosystem: 'c',
    displayName: 'C',
    manifestFiles: ['Makefile', 'CMakeLists.txt', 'configure.ac'],
    lockFiles: [],
    entrypointGlobs: ['main.c', 'src/main.c'],
    testFileGlobs: ['test_*.c'],
    defaultCommands: {
      install: './configure || make',
      build: 'make',
      devOrRun: './bin/app || ./a.out',
    },
  },
  java: {
    ecosystem: 'java',
    displayName: 'Java',
    manifestFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    lockFiles: [],
    entrypointGlobs: ['**/Application.java', '**/Main.java'],
    testFileGlobs: ['**/*Test.java'],
    defaultCommands: {
      install: './mvnw clean install || ./gradlew build',
      devOrRun: './mvnw spring-boot:run || ./gradlew bootRun',
      test: './mvnw test || ./gradlew test',
    },
  },
  kotlin: {
    ecosystem: 'kotlin',
    displayName: 'Kotlin',
    manifestFiles: ['build.gradle.kts', 'build.gradle', 'pom.xml'],
    lockFiles: [],
    entrypointGlobs: ['**/Application.kt', '**/Main.kt'],
    testFileGlobs: ['**/*Test.kt'],
    defaultCommands: {
      install: './gradlew build',
      devOrRun: './gradlew run',
      test: './gradlew test',
    },
  },
  ruby: {
    ecosystem: 'ruby',
    displayName: 'Ruby',
    manifestFiles: ['Gemfile'],
    lockFiles: ['Gemfile.lock'],
    entrypointGlobs: ['config.ru', 'app.rb', 'bin/rails'],
    testFileGlobs: ['spec/**/*_spec.rb', 'test/**/*_test.rb'],
    defaultCommands: {
      install: 'bundle install',
      devOrRun: 'bundle exec rails s || ruby app.rb',
      test: 'bundle exec rspec',
    },
  },
  php: {
    ecosystem: 'php',
    displayName: 'PHP',
    manifestFiles: ['composer.json'],
    lockFiles: ['composer.lock'],
    entrypointGlobs: ['public/index.php', 'index.php', 'artisan'],
    testFileGlobs: ['tests/**/*Test.php'],
    defaultCommands: {
      install: 'composer install',
      devOrRun: 'php -S localhost:8000 -t public',
      test: './vendor/bin/phpunit',
    },
  },
  generic: {
    ecosystem: 'generic',
    displayName: 'Universal Codebase',
    manifestFiles: ['README.md'],
    lockFiles: [],
    entrypointGlobs: [],
    testFileGlobs: [],
    defaultCommands: {
      install: '# Inspect README.md for setup instructions',
      devOrRun: '# Inspect README.md for run instructions',
    },
  },
};

// ============================================================================
// 2. Request Contracts
// ============================================================================

export const SummariseRepoRequestSchema = z.object({
  action: z.literal('summarise'),
  owner: z.string().min(1, 'Repository owner is required'),
  repo: z.string().min(1, 'Repository name is required'),
  branch: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
  authSource: z.enum(['oauth_session', 'pat', 'guest']).default('oauth_session'),
  customPat: z.string().optional(),
});

export type SummariseRepoRequest = z.infer<typeof SummariseRepoRequestSchema>;

export const SummariseFeatureRequestSchema = z.object({
  action: z.literal('summarise-feature'),
  owner: z.string().min(1, 'Repository owner is required'),
  repo: z.string().min(1, 'Repository name is required'),
  branch: z.string().optional(),
  featureQuery: z.string().min(2, 'Feature description or name is required (e.g. "OAuth login flow")'),
  hintPaths: z.array(z.string()).optional(),
  linkedIssueNumber: z.number().int().positive().optional(),
  authSource: z.enum(['oauth_session', 'pat', 'guest']).default('oauth_session'),
  customPat: z.string().optional(),
});

export type SummariseFeatureRequest = z.infer<typeof SummariseFeatureRequestSchema>;

// ============================================================================
// 3. Structured Outputs
// ============================================================================

export const SecurityFindingSchema = z.object({
  category: z.string().describe('e.g. Hardcoded Secret, Insecure Dependency, Missing Auth Guard, Malicious Script Hook'),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']),
  fileOrLocation: z.string().describe('File path or configuration where risk exists'),
  description: z.string().describe('Explanation of the vulnerability or risk'),
  remediation: z.string().describe('Concrete recommendation or code fix to resolve'),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityAssessmentSchema = z.object({
  overallRating: z.enum(['SECURE', 'LOW_RISK', 'MODERATE_RISK', 'INSECURE', 'CLEAN', 'NEEDS_ATTENTION', 'HIGH_RISK']),
  leakedCredentialsDetected: z.boolean(),
  flaggedFiles: z.array(z.string()).default([]),
  suspiciousScripts: z.array(z.string()).default([]),
  findings: z.array(SecurityFindingSchema),
});

export type SecurityAssessment = z.infer<typeof SecurityAssessmentSchema>;

// Purpose & Authenticity Verification: README Claims vs. Code Reality
export const RepoClaimVsRealitySchema = z.object({
  claim: z.string().describe('Key feature or claim asserted in README'),
  reality: z.string().describe('Actual code implementation state found in repository'),
  status: z.enum(['CONFIRMED', 'DISCREPANCY', 'UNVERIFIED']),
});

export type RepoClaimVsReality = z.infer<typeof RepoClaimVsRealitySchema>;

export const RepoAuthenticitySchema = z.object({
  verdict: z.enum(['VERIFIED_REAL', 'PARTIALLY_IMPLEMENTED', 'POTENTIAL_STUB_OR_ABANDONED']),
  summary: z.string(),
  claimsVsReality: z.array(RepoClaimVsRealitySchema).default([]),
});

export type RepoAuthenticity = z.infer<typeof RepoAuthenticitySchema>;

export const SetupCommandSchema = z.object({
  step: z.string(),
  command: z.string(),
  description: z.string(),
});

export type SetupCommand = z.infer<typeof SetupCommandSchema>;

export const LocalSetupGuideSchema = z.object({
  prerequisites: z.array(z.string()),
  envSetup: z.object({
    sampleEnvFile: z.string().nullable(),
    requiredVariables: z.array(z.string()),
  }),
  quickstartCommands: z.array(SetupCommandSchema),
  commonGotchas: z.array(z.string()).default([]),
});

export type LocalSetupGuide = z.infer<typeof LocalSetupGuideSchema>;

export const EntryFileSchema = z.object({
  path: z.string(),
  description: z.string(),
  keyExportsOrSymbols: z.array(z.string()).default([]),
});

export type EntryFile = z.infer<typeof EntryFileSchema>;

// Output 1: Full Repository Summary
export const RepoSummaryOutputSchema = z.object({
  type: z.literal('repo_summary'),
  metadata: z.object({
    repo: z.string(),
    primaryLanguage: z.string(),
    ecosystem: SupportedEcosystemSchema,
    techStack: z.array(z.string()),
    license: z.string().nullable(),
    isMonorepo: z.boolean(),
    commitSha: z.string().optional(),
  }),
  purpose: z.string().describe('What purpose it serves and core problem it solves'),
  targetAudience: z.object({
    primaryBeneficiaries: z.array(z.string()),
    useCases: z.array(z.string()),
  }),
  architecture: z.object({
    overview: z.string(),
    mermaidDiagram: z.string().describe('Valid Mermaid component or architecture diagram'),
    coreComponents: z.array(
      z.object({
        name: z.string(),
        path: z.string(),
        role: z.string(),
        dependencies: z.array(z.string()).default([]),
      })
    ),
  }),
  entryFiles: z.array(EntryFileSchema),
  authenticity: RepoAuthenticitySchema.optional(),
  securityAssessment: SecurityAssessmentSchema,
  localSetup: LocalSetupGuideSchema,
});

export type RepoSummaryOutput = z.infer<typeof RepoSummaryOutputSchema>;

// Output 2: Feature-Specific Summary (Omits purpose and audience)
export const FeatureEntrypointSchema = z.object({
  filePath: z.string(),
  lineRange: z.string().optional(),
  symbolName: z.string(),
  symbolType: z.enum(['function', 'class', 'route_handler', 'component', 'middleware', 'struct', 'trait']),
  roleInFeature: z.string(),
});

export type FeatureEntrypoint = z.infer<typeof FeatureEntrypointSchema>;

export const FeatureSummaryOutputSchema = z.object({
  type: z.literal('feature_summary'),
  featureName: z.string(),
  summary: z.string(),
  entrypoints: z.array(FeatureEntrypointSchema),
  mermaidDiagram: z.string().describe('Valid Mermaid sequence or data flow diagram illustrating feature execution'),
  dependencies: z.object({
    internalModules: z.array(z.string()),
    externalPackages: z.array(z.string()),
    databaseTablesOrEntities: z.array(z.string()).optional(),
  }),
  securityAssessment: z.object({
    findings: z.array(
      z.object({
        risk: z.string(),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
        file: z.string(),
        suggestedFix: z.string(),
      })
    ),
  }),
  localVerification: z.object({
    existingTestFiles: z.array(z.string()),
    howToTriggerLocally: z.string(),
    testCommands: z.array(z.string()),
  }),
});

export type FeatureSummaryOutput = z.infer<typeof FeatureSummaryOutputSchema>;
