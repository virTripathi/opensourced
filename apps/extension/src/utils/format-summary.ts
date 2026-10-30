import { RepoSummaryOutput, FeatureSummaryOutput } from '@opensourced/common';

/**
 * Formats a structured FeatureSummaryOutput into rich GitHub-flavored markdown
 * with Mermaid sequence/flow diagrams, entrypoint tables, and local verification.
 */
export function formatFeatureSummaryToMarkdown(
  feature: FeatureSummaryOutput | any,
  repoContext?: { owner: string; repo: string; branch?: string }
): string {
  if (!feature) return '';

  const branch = repoContext?.branch || 'main';
  const repoBaseUrl = repoContext ? `https://github.com/${repoContext.owner}/${repoContext.repo}/blob/${branch}` : null;

  const featureName = feature.featureName || feature.name || 'Implementation Details';
  const summaryText = feature.summary || feature.overview || 'Feature implementation summary.';
  const lifecycleText = feature.lifecycle ? `\n\n### Execution Lifecycle\n${feature.lifecycle}` : '';

  // Mermaid diagram: can be feature.mermaidDiagram, feature.diagram, feature.architectureDiagram
  let rawDiagram = (feature.mermaidDiagram || feature.diagram || feature.architectureDiagram || '').trim();
  if (rawDiagram.startsWith('```mermaid')) {
    rawDiagram = rawDiagram.replace(/^```mermaid/i, '').replace(/```$/i, '').trim();
  }
  if (!rawDiagram) {
    rawDiagram = `sequenceDiagram\n  autonumber\n  actor User\n  participant Core as ${featureName}\n  User->>Core: Execute\n  Core-->>User: Result`;
  }

  // Entrypoints table
  const entrypointsList: any[] = Array.isArray(feature.entrypoints) ? feature.entrypoints : [];
  const entrypointsTable = entrypointsList.length > 0
    ? `| Entrypoint / File | Symbol | Type | Role |
| :--- | :--- | :--- | :--- |
` +
      entrypointsList
        .map((ep: any) => {
          let lineStr = '';
          if (Array.isArray(ep.lineRange)) {
            lineStr = ep.lineRange.join('-');
          } else if (typeof ep.lineRange === 'string') {
            lineStr = ep.lineRange;
          } else if (typeof ep.lineRange === 'number') {
            lineStr = String(ep.lineRange);
          }

          const firstLine = lineStr ? lineStr.split('-')[0].replace(/[^0-9]/g, '') : '';
          const lineHash = firstLine ? `#L${firstLine}` : '';
          const cleanPath = (ep.filePath || ep.path || '').replace(/^\/+/, '');
          const link = repoBaseUrl && cleanPath ? `${repoBaseUrl}/${cleanPath}${lineHash}` : cleanPath;
          const label = lineStr ? `${cleanPath}:${lineStr}` : cleanPath;
          const symName = ep.symbolName || ep.name || 'default';
          const symType = ep.symbolType || ep.type || 'module';
          const role = ep.roleInFeature || ep.role || ep.description || 'Core logic';

          return `| [\`${label}\`](${link}) | \`${symName}\` | \`${symType}\` | ${role} |`;
        })
        .join('\n')
    : '_No specific entrypoints identified._';

  // Dependencies
  const internalList: string[] = feature.dependencies?.internalModules || feature.dependencies?.internal || [];
  const internalDeps = internalList.length > 0
    ? internalList.map((m: string) => `- \`${m}\``).join('\n')
    : '- None';

  const externalList: string[] = feature.dependencies?.externalPackages || feature.dependencies?.external || [];
  const externalDeps = externalList.length > 0
    ? externalList.map((p: string) => `- \`${p}\``).join('\n')
    : '- None';

  // Security
  let securityFindings = '- No high-risk security vulnerabilities identified for this feature.';
  if (Array.isArray(feature.securityAssessment?.findings) && feature.securityAssessment.findings.length > 0) {
    securityFindings = feature.securityAssessment.findings
      .map(
        (f: any) =>
          `- **[${f.severity || 'INFO'}] ${f.risk || f.category || 'Security consideration'}** in \`${f.file || f.fileOrLocation || 'codebase'}\`\n  - *Fix:* ${f.suggestedFix || f.remediation || 'Follow secure coding practices.'}`
      )
      .join('\n');
  } else if (Array.isArray(feature.securityVulnerabilities) && feature.securityVulnerabilities.length > 0) {
    securityFindings = feature.securityVulnerabilities
      .map((vuln: string) => `- ⚠️ ${vuln}`)
      .join('\n');
  }

  // Testing & Local verification
  const howToTrigger = feature.localVerification?.howToTriggerLocally || feature.testingInstructions || 'Run repository test suite.';
  const testCommandsList: string[] = feature.localVerification?.testCommands || [];
  const testCommands = testCommandsList.length > 0
    ? `\`\`\`bash\n${testCommandsList.join('\n')}\n\`\`\``
    : '`npm test`';

  const existingTestsList: string[] = feature.localVerification?.existingTestFiles || [];
  const existingTests = existingTestsList.length > 0
    ? existingTestsList.map((t: string) => `- \`${t}\``).join('\n')
    : '- No dedicated test file found.';

  return `# Feature: ${featureName}

${summaryText}${lifecycleText}

## Execution & Data Flow
\`\`\`mermaid
${rawDiagram}
\`\`\`

## Verified Code Entrypoints
${entrypointsTable}

## Architecture & Dependencies
### Internal Modules
${internalDeps}

### External Packages
${externalDeps}

## Security Assessment
${securityFindings}

## Local Verification & Testing
**Triggering locally:** ${howToTrigger}

### Test Files
${existingTests}

### Test Commands
${testCommands}
`;
}

/**
 * Formats a structured RepoSummaryOutput into comprehensive architecture markdown.
 */
export function formatRepoSummaryToMarkdown(
  repoSum: RepoSummaryOutput | any,
  repoContext?: { owner: string; repo: string; branch?: string }
): string {
  if (!repoSum) return '';
  const branch = repoContext?.branch || 'main';
  const repoBaseUrl = repoContext ? `https://github.com/${repoContext.owner}/${repoContext.repo}/blob/${branch}` : null;

  const repoTitle = repoSum.metadata?.repo || `${repoContext?.owner}/${repoContext?.repo}` || 'Repository Intelligence';
  const ecosystem = repoSum.metadata?.ecosystem || 'Universal';
  const primaryLanguage = repoSum.metadata?.primaryLanguage || 'Unknown';
  const license = repoSum.metadata?.license || 'Not specified';

  const entryFilesList = Array.isArray(repoSum.entryFiles) && repoSum.entryFiles.length > 0
    ? repoSum.entryFiles
        .map((ef: any) => {
          const cleanPath = (ef.path || ef.filePath || '').replace(/^\/+/, '');
          const link = repoBaseUrl && cleanPath ? `${repoBaseUrl}/${cleanPath}` : cleanPath;
          const exports = Array.isArray(ef.keyExportsOrSymbols) && ef.keyExportsOrSymbols.length
            ? ` (Exports: \`${ef.keyExportsOrSymbols.join('`, `')}\`)`
            : '';
          return `- [\`${cleanPath}\`](${link}): ${ef.description || 'Entry file'}${exports}`;
        })
        .join('\n')
    : '- No entry files identified.';

  const components = Array.isArray(repoSum.architecture?.coreComponents) && repoSum.architecture.coreComponents.length > 0
    ? repoSum.architecture.coreComponents
        .map((c: any) => `- **${c.name}** (\`${c.path}\`): ${c.role || ''}`)
        .join('\n')
    : '';

  let rawDiagram = (repoSum.architecture?.mermaidDiagram || repoSum.architecture?.diagram || '').trim();
  if (rawDiagram.startsWith('```mermaid')) {
    rawDiagram = rawDiagram.replace(/^```mermaid/i, '').replace(/```$/i, '').trim();
  }
  if (!rawDiagram) {
    rawDiagram = 'graph TD\n  A[App] --> B[Core]';
  }

  const findings = Array.isArray(repoSum.securityAssessment?.findings) && repoSum.securityAssessment.findings.length > 0
    ? repoSum.securityAssessment.findings
        .map((f: any) => `- **[${f.severity || 'INFO'}] ${f.category || 'Finding'}** (\`${f.fileOrLocation || 'tree'}\`): ${f.description || ''}\n  - *Remediation:* ${f.remediation || 'Inspect code'}`)
        .join('\n')
    : '- No credential leaks or high-risk findings detected in tree scan.';

  const setupCommands = Array.isArray(repoSum.localSetup?.quickstartCommands) ? repoSum.localSetup.quickstartCommands : [];
  const setupSteps = setupCommands.length > 0
    ? setupCommands
        .map((c: any) => `1. **${c.step || 'Step'}** - ${c.description || ''}\n   \`\`\`bash\n   ${c.command || ''}\n   \`\`\``)
        .join('\n')
    : '`npm install && npm start`';

  return `# ${repoTitle} — Repository Intelligence

**Ecosystem:** ${ecosystem} | **Language:** ${primaryLanguage} | **License:** ${license}

## Purpose
${repoSum.purpose || repoSum.overview || 'Repository overview'}

## Architecture
${repoSum.architecture?.overview || ''}

\`\`\`mermaid
${rawDiagram}
\`\`\`

${components ? `### Core Modules\n${components}\n` : ''}
## Entry Files
${entryFilesList}

## Local Quickstart & Setup
${setupSteps}

## Security Assessment
${findings}
`;
}
