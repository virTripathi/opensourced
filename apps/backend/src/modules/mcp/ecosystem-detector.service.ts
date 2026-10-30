import { Injectable, Logger } from '@nestjs/common';
import {
  SupportedEcosystem,
  UNIVERSAL_ECOSYSTEM_REGISTRY,
  SetupCommand,
  LocalSetupGuide,
} from '@opensourced/common';

export interface EcosystemAnalysisResult {
  ecosystem: SupportedEcosystem;
  displayName: string;
  isMonorepo: boolean;
  monorepoTool?: string;
  manifestFile?: string;
  verifiedEntrypoints: string[];
  sampleEnvFile?: string;
  setupGuide: LocalSetupGuide;
}

@Injectable()
export class EcosystemDetectorService {
  private readonly logger = new Logger(EcosystemDetectorService.name);

  /**
   * Analyzes raw repository tree paths to deterministically deduce the
   * ecosystem, build system, monorepo setup, and guaranteed entrypoints.
   */
  detectEcosystem(filePaths: string[]): EcosystemAnalysisResult {
    const fileSet = new Set(filePaths);
    let detectedEcosystem: SupportedEcosystem = 'generic';
    let matchedManifest: string | undefined;

    // 1. Check ecosystems in priority order (specific to generic)
    const priorityOrder: SupportedEcosystem[] = [
      'rust',
      'golang',
      'typescript',
      'javascript',
      'python',
      'cpp',
      'c',
      'kotlin',
      'java',
      'ruby',
      'php',
    ];

    // 1a. First Pass: Check for ROOT-level manifests (e.g. package.json, Cargo.toml at repo root)
    for (const eco of priorityOrder) {
      const rule = UNIVERSAL_ECOSYSTEM_REGISTRY[eco];
      const foundRootManifest = rule.manifestFiles.find((m) => fileSet.has(m));
      if (foundRootManifest) {
        detectedEcosystem = eco;
        matchedManifest = foundRootManifest;
        break;
      }
    }

    // 1b. Second Pass: If no root manifest matched, check nested subfolder paths
    if (detectedEcosystem === 'generic') {
      for (const eco of priorityOrder) {
        const rule = UNIVERSAL_ECOSYSTEM_REGISTRY[eco];
        const foundNestedManifest = rule.manifestFiles.find((m) =>
          filePaths.some((p) => p.endsWith('/' + m))
        );
        if (foundNestedManifest) {
          detectedEcosystem = eco;
          matchedManifest = foundNestedManifest;
          break;
        }
      }
    }

    const rule = UNIVERSAL_ECOSYSTEM_REGISTRY[detectedEcosystem];

    // 2. Monorepo detection
    let isMonorepo = false;
    let monorepoTool: string | undefined;
    if (fileSet.has('turbo.json')) {
      isMonorepo = true;
      monorepoTool = 'Turborepo';
    } else if (fileSet.has('pnpm-workspace.yaml')) {
      isMonorepo = true;
      monorepoTool = 'pnpm workspaces';
    } else if (fileSet.has('lerna.json')) {
      isMonorepo = true;
      monorepoTool = 'Lerna';
    } else if (fileSet.has('nx.json')) {
      isMonorepo = true;
      monorepoTool = 'Nx';
    } else if (fileSet.has('go.work')) {
      isMonorepo = true;
      monorepoTool = 'Go Workspaces';
    }

    // 3. Guaranteed Entrypoints from actual tree
    const verifiedEntrypoints: string[] = [];
    for (const glob of rule.entrypointGlobs) {
      if (glob.includes('*')) {
        // Simple wildcard pattern match
        const regexStr = '^' + glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]+') + '$';
        const regex = new RegExp(regexStr);
        for (const p of filePaths) {
          if (regex.test(p)) {
            verifiedEntrypoints.push(p);
          }
        }
      } else if (fileSet.has(glob)) {
        verifiedEntrypoints.push(glob);
      } else {
        // Also check if any file ends with this entrypoint name (e.g. apps/web/src/main.ts)
        const nestedMatch = filePaths.find((p) => p.endsWith('/' + glob));
        if (nestedMatch && !verifiedEntrypoints.includes(nestedMatch)) {
          verifiedEntrypoints.push(nestedMatch);
        }
      }
    }

    // 4. Sample environment file detection (including modern dist, template, and monorepo conventions)
    const sampleEnvFile = filePaths.find((p) => {
      const lower = p.toLowerCase();
      const base = lower.split('/').pop() || lower;
      return (
        base === '.env.example' ||
        base === '.env.sample' ||
        base === '.env.template' ||
        base === '.env.dist' ||
        base === '.env.defaults' ||
        base === 'env.example' ||
        base === 'secrets.example.yaml' ||
        base === 'secrets.example.json' ||
        base === 'config.example.json' ||
        base === 'config.example.yaml'
      );
    });

    // 5. Build deterministic setup commands
    const quickstartCommands: SetupCommand[] = [
      {
        step: '1. Install Dependencies',
        command: rule.defaultCommands.install,
        description: `Install packages using the native ${rule.displayName} package manager`,
      },
    ];

    if (rule.defaultCommands.build) {
      quickstartCommands.push({
        step: '2. Build / Compile',
        command: rule.defaultCommands.build,
        description: `Compile project binaries or bundle assets`,
      });
    }

    quickstartCommands.push({
      step: `${quickstartCommands.length + 1}. Run Development Server / Application`,
      command: rule.defaultCommands.devOrRun,
      description: `Start local execution or development mode`,
    });

    if (rule.defaultCommands.test) {
      quickstartCommands.push({
        step: `${quickstartCommands.length + 1}. Run Test Suite`,
        command: rule.defaultCommands.test,
        description: `Execute automated test suites`,
      });
    }

    const commonGotchas: string[] = [];
    if (sampleEnvFile) {
      commonGotchas.push(`Ensure you copy '${sampleEnvFile}' to '.env' and populate credentials before launching.`);
    }
    if (isMonorepo) {
      commonGotchas.push(`This is a ${monorepoTool} monorepo. Commands are typically run from the root workspace.`);
    }

    this.logger.log(
      `Detected Ecosystem: ${rule.displayName} (Manifest: ${matchedManifest || 'None'}, Monorepo: ${isMonorepo})`
    );

    return {
      ecosystem: detectedEcosystem,
      displayName: rule.displayName,
      isMonorepo,
      monorepoTool,
      manifestFile: matchedManifest,
      verifiedEntrypoints: verifiedEntrypoints.slice(0, 8),
      sampleEnvFile,
      setupGuide: {
        prerequisites: [rule.displayName, isMonorepo ? `${monorepoTool} CLI` : ''].filter(Boolean),
        envSetup: {
          sampleEnvFile: sampleEnvFile || null,
          requiredVariables: [],
        },
        quickstartCommands,
        commonGotchas,
      },
    };
  }
}
