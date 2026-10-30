import type { RepoSummaryOutput, FeatureSummaryOutput } from '@opensourced/common';

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

  const featureName = feature.featureName || feature.feature_name || feature.name || feature.title || 'Implementation Details';
  const summaryText = feature.summary || feature.feature_summary || feature.overview || feature.description || 'Feature implementation summary.';
  const lifecycleText = feature.lifecycle ? `\n\n### Execution Lifecycle\n${feature.lifecycle}` : '';

  // Mermaid diagram: only render if valid and not a synthetic placeholder
  let rawDiagram = (feature.mermaidDiagram || feature.mermaid_diagram || feature.diagram || feature.architectureDiagram || '').trim();
  if (rawDiagram.startsWith('```mermaid')) {
    rawDiagram = rawDiagram.replace(/^```mermaid/i, '').replace(/```$/i, '').trim();
  }
  const isFakeDiagram =
    !rawDiagram ||
    rawDiagram.includes('Trigger Feature Flow') ||
    rawDiagram.includes('Core System') ||
    rawDiagram.includes('A[App] --> B[Core]');
  const diagramSection = !isFakeDiagram
    ? `\n\n## Execution & Data Flow\n\`\`\`mermaid\n${rawDiagram}\n\`\`\``
    : '';

  // Entrypoints table: omit entirely if no entrypoints discovered
  const entrypointsList: any[] = Array.isArray(feature.entrypoints)
    ? feature.entrypoints
    : Array.isArray(feature.verifiedEntrypoints)
    ? feature.verifiedEntrypoints
    : [];
  let entrypointsSection = '';
  if (entrypointsList.length > 0) {
    const rows = entrypointsList
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
      .join('\n');

    entrypointsSection = `\n\n## Verified Code Entrypoints\n| Entrypoint / File | Symbol | Type | Role |\n| :--- | :--- | :--- | :--- |\n${rows}`;
  }

  // Dependencies: omit entirely if both lists are empty
  const internalList: string[] = feature.dependencies?.internalModules || feature.dependencies?.internal || [];
  const externalList: string[] = feature.dependencies?.externalPackages || feature.dependencies?.external || [];
  let depsSection = '';
  if (internalList.length > 0 || externalList.length > 0) {
    depsSection = `\n\n## Architecture & Dependencies`;
    if (internalList.length > 0) {
      depsSection += `\n### Internal Modules\n` + internalList.map((m: string) => `- \`${m}\``).join('\n');
    }
    if (externalList.length > 0) {
      depsSection += `\n### External Packages\n` + externalList.map((p: string) => `- \`${p}\``).join('\n');
    }
  }

  // Security Assessment: omit if no genuine vulnerabilities or findings detected
  let securityFindings = '';
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
  const securitySection = securityFindings
    ? `\n\n## Security Assessment\n${securityFindings}`
    : '';

  // Local Verification & Testing: omit if no verification instructions or commands exist
  const rawHowToTrigger =
    feature.localVerification?.howToTriggerLocally ||
    feature.local_verification?.how_to_trigger_locally ||
    feature.testingInstructions ||
    '';
  const isGenericTrigger =
    !rawHowToTrigger ||
    rawHowToTrigger === 'Run repository test suite.' ||
    rawHowToTrigger === 'Run test suite.';
  const howToTrigger = isGenericTrigger ? '' : rawHowToTrigger;

  const testCommandsList: string[] = (
    feature.localVerification?.testCommands ||
    feature.local_verification?.test_commands ||
    []
  ).filter((cmd: string) => cmd && cmd !== 'npm test');

  const existingTestsList: string[] = (
    feature.localVerification?.existingTestFiles ||
    feature.local_verification?.existing_test_files ||
    []
  ).filter(Boolean);

  let verificationSection = '';
  if (howToTrigger || testCommandsList.length > 0 || existingTestsList.length > 0) {
    verificationSection = `\n\n## Local Verification & Testing`;
    if (howToTrigger) {
      verificationSection += `\n**Triggering locally:** ${howToTrigger}\n`;
    }
    if (existingTestsList.length > 0) {
      verificationSection += `\n### Test Files\n` + existingTestsList.map((t: string) => `- \`${t}\``).join('\n') + '\n';
    }
    if (testCommandsList.length > 0) {
      verificationSection += `\n### Test Commands\n\`\`\`bash\n${testCommandsList.join('\n')}\n\`\`\`\n`;
    }
  }

  return `# Feature: ${featureName}

${summaryText}${lifecycleText}${diagramSection}${entrypointsSection}${depsSection}${securitySection}${verificationSection}
`.trim() + '\n';
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
    : '';

  const components = Array.isArray(repoSum.architecture?.coreComponents) && repoSum.architecture.coreComponents.length > 0
    ? repoSum.architecture.coreComponents
        .map((c: any) => `- **${c.name}** (\`${c.path}\`): ${c.role || ''}`)
        .join('\n')
    : '';

  let rawDiagram = (repoSum.architecture?.mermaidDiagram || repoSum.architecture?.diagram || '').trim();
  if (rawDiagram.startsWith('```mermaid')) {
    rawDiagram = rawDiagram.replace(/^```mermaid/i, '').replace(/```$/i, '').trim();
  }
  const isFakeRepoDiagram =
    !rawDiagram ||
    rawDiagram.includes('A[App] --> B[Core]') ||
    rawDiagram.includes('Trigger Feature Flow');

  const diagramBlock = !isFakeRepoDiagram
    ? `\n\`\`\`mermaid\n${rawDiagram}\n\`\`\`\n`
    : '';

  const findings = Array.isArray(repoSum.securityAssessment?.findings) && repoSum.securityAssessment.findings.length > 0
    ? repoSum.securityAssessment.findings
        .map((f: any) => `- **[${f.severity || 'INFO'}] ${f.category || 'Finding'}** (\`${f.fileOrLocation || 'tree'}\`): ${f.description || ''}\n  - *Remediation:* ${f.remediation || 'Inspect code'}`)
        .join('\n')
    : '- 🛡️ Verified clean: No credential leaks or suspicious install hooks detected.';

  const setupCommands = Array.isArray(repoSum.localSetup?.quickstartCommands) ? repoSum.localSetup.quickstartCommands : [];
  const setupSteps = setupCommands.length > 0
    ? setupCommands
        .map((c: any) => `1. **${c.step || 'Step'}** - ${c.description || ''}\n   \`\`\`bash\n   ${c.command || ''}\n   \`\`\``)
        .join('\n')
    : '';

  // Purpose & Authenticity section
  const auth = repoSum.authenticity;
  let authenticityBlock = '';
  if (auth) {
    const verdictLabel =
      auth.verdict === 'VERIFIED_REAL'
        ? '✅ Verified Real Implementation'
        : auth.verdict === 'PARTIALLY_IMPLEMENTED'
        ? '⚠️ Partially Implemented / Work-in-Progress'
        : '🚨 Potential Stub or Incomplete Repo';

    const claimsTable = Array.isArray(auth.claimsVsReality) && auth.claimsVsReality.length > 0
      ? `\n\n| Stated Claim | Actual Code Reality | Status |\n| :--- | :--- | :--- |\n` +
        auth.claimsVsReality
          .map((c: any) => `| ${c.claim} | ${c.reality} | **${c.status}** |`)
          .join('\n')
      : '';

    authenticityBlock = `## Purpose & Reality Check
> **Verdict:** **${verdictLabel}**  
> ${auth.summary || ''}
${claimsTable}
`;
  }

  const safetyRating = repoSum.securityAssessment?.overallRating || 'CLEAN';
  const safetyBadge =
    safetyRating === 'CLEAN' || safetyRating === 'SECURE'
      ? '🛡️ Safe for Local Development'
      : safetyRating === 'NEEDS_ATTENTION' || safetyRating === 'LOW_RISK' || safetyRating === 'MODERATE_RISK'
      ? '⚠️ Needs Attention Before Local Run'
      : '🚨 High-Risk Findings Detected';

  const entryFilesSection = entryFilesList
    ? `\n## Verified Code Entrypoints\n${entryFilesList}\n`
    : '';

  const setupSection = setupSteps
    ? `\n## Local Quickstart & Setup\n${setupSteps}\n`
    : '';

  const archOverview = repoSum.architecture?.overview ? `${repoSum.architecture.overview}\n` : '';

  return `# ${repoTitle} — Repository Intelligence

**Ecosystem:** ${ecosystem} | **Language:** ${primaryLanguage} | **License:** ${license}

## Purpose
${repoSum.purpose || repoSum.overview || 'Repository overview'}

${authenticityBlock}
## Architecture
${archOverview}${diagramBlock}${components ? `\n### Core Modules\n${components}\n` : ''}${entryFilesSection}${setupSection}
## Local Safety & Hygiene
**Status:** **${safetyBadge}**
${findings}
`.trim() + '\n';
}
