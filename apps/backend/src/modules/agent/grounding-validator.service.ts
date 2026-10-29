import { Injectable, Logger } from '@nestjs/common';
import { RepoSummaryOutput, FeatureSummaryOutput } from '@opensourced/common';
import { GuardrailsService } from '../guardrails/guardrails.service';

@Injectable()
export class GroundingValidatorService {
  private readonly logger = new Logger(GroundingValidatorService.name);

  constructor(private readonly guardrails: GuardrailsService) {}

  /**
   * Cleans, sanitizes, and verifies that candidate entrypoints exist in the real Git Tree.
   */
  validateRepoSummary(summary: RepoSummaryOutput, verifiedTreePaths: string[]): RepoSummaryOutput {
    const treeSet = new Set(verifiedTreePaths);

    // 1. Prune hallucinated entry files if tree is populated
    if (treeSet.size > 0 && Array.isArray(summary.entryFiles)) {
      const originalCount = summary.entryFiles.length;
      summary.entryFiles = summary.entryFiles.filter((entry) => {
        const cleanPath = entry.path.replace(/^\.\//, '');
        const exists = treeSet.has(cleanPath) || verifiedTreePaths.some((p) => p.endsWith(cleanPath));
        if (!exists) {
          this.logger.warn(`Pruned hallucinated entrypoint not in git tree: ${entry.path}`);
        }
        return exists;
      });

      // If all were pruned, keep at least verified entrypoints from tree
      if (summary.entryFiles.length === 0 && originalCount > 0) {
        summary.entryFiles = verifiedTreePaths.slice(0, 3).map((p) => ({
          path: p,
          description: 'Core repository file detected from repository root',
          keyExportsOrSymbols: [],
        }));
      }
    }

    // 2. Sanitize and normalize Mermaid diagram syntax
    if (summary.architecture && summary.architecture.mermaidDiagram) {
      summary.architecture.mermaidDiagram = this.normalizeMermaidSyntax(summary.architecture.mermaidDiagram);
    }

    // 3. Scan output for accidental secret leaks
    const jsonStr = JSON.stringify(summary);
    const secretScan = this.guardrails.scanAndRedact(jsonStr);
    if (secretScan.hasSecrets) {
      this.logger.warn('Redacted sensitive token from final repo summary output');
      return JSON.parse(secretScan.sanitizedText);
    }

    return summary;
  }

  /**
   * Validates feature-specific summary output.
   */
  validateFeatureSummary(summary: FeatureSummaryOutput, verifiedTreePaths: string[]): FeatureSummaryOutput {
    const treeSet = new Set(verifiedTreePaths);

    if (treeSet.size > 0 && Array.isArray(summary.entrypoints)) {
      summary.entrypoints = summary.entrypoints.filter((entry) => {
        const cleanPath = entry.filePath.replace(/^\.\//, '');
        const exists = treeSet.has(cleanPath) || verifiedTreePaths.some((p) => p.endsWith(cleanPath));
        if (!exists) {
          this.logger.warn(`Pruned hallucinated feature entrypoint: ${entry.filePath}`);
        }
        return exists;
      });
    }

    if (summary.mermaidDiagram) {
      summary.mermaidDiagram = this.normalizeMermaidSyntax(summary.mermaidDiagram);
    }

    const jsonStr = JSON.stringify(summary);
    const secretScan = this.guardrails.scanAndRedact(jsonStr);
    if (secretScan.hasSecrets) {
      return JSON.parse(secretScan.sanitizedText);
    }

    return summary;
  }

  /**
   * Normalizes Mermaid code to guarantee error-free rendering in UI.
   */
  normalizeMermaidSyntax(raw: string): string {
    let diagram = raw.trim();

    // Remove markdown code fences if present
    diagram = diagram.replace(/^```(mermaid)?/i, '').replace(/```$/i, '').trim();

    // Ensure valid Mermaid diagram header
    const validHeaders = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram'];
    const hasHeader = validHeaders.some((h) => diagram.startsWith(h));

    if (!hasHeader) {
      diagram = `graph TB\n${diagram}`;
    }

    // Fix unquoted parentheses or brackets inside node labels e.g. A[Auth (v1)] -> A["Auth (v1)"]
    diagram = diagram.replace(/\[([^"\]\n]*\([^"\]\n]*\)[^"\]\n]*)\]/g, '["$1"]');

    return diagram;
  }
}
