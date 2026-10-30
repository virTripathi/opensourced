import { Injectable, Logger } from '@nestjs/common';
import {
  sanitizeGitHubContent,
  wrapInUntrustedBoundary,
  scanAndRedactSecrets,
  SanitizationResult,
  SecretScanResult,
} from '@opensourced/common';

/**
 * Detects whether a path represents a harmless template, example, or sample config.
 * These files contain placeholder keys and should never be blocked from model reasoning
 * or falsely flagged as active credential leaks.
 */
export function isTemplateConfigFile(path: string): boolean {
  const lower = path.toLowerCase();
  return /(example|sample|template|defaults?|dist|fixtures?)/i.test(lower);
}

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.[^/]+)?$/i,
  /(^|\/)id_rsa(\.pub)?$/i,
  /(^|\/)id_ed25519(\.pub)?$/i,
  /\.(pem|key|p12|pfx|pkcs12)$/i,
  /(^|\/)(credentials|service-account.*|client_secrets.*)\.json$/i,
  /(^|\/)[^/]*secret[^/]*\.(ya?ml|json|env)$/i,
];

@Injectable()
export class GuardrailsService {
  private readonly logger = new Logger(GuardrailsService.name);

  sanitizeContent(rawText: string): SanitizationResult {
    const result = sanitizeGitHubContent(rawText);
    if (result.injectionDetected) {
      this.logger.warn(`Prompt injection pattern neutralized: ${result.neutralizedPatterns.join(', ')}`);
    }
    return result;
  }

  wrapUntrusted(tag: string, content: string): string {
    return wrapInUntrustedBoundary(tag, content);
  }

  scanAndRedact(text: string): SecretScanResult {
    const result = scanAndRedactSecrets(text);
    if (result.hasSecrets) {
      this.logger.warn(`Secrets redacted before export: ${result.detectedSecrets.map((s) => s.type).join(', ')}`);
    }
    return result;
  }

  /**
   * Scans full repository file tree for committed credentials, keys, and private env files.
   * Universal exemption for template and example configuration files.
   */
  scanRepoTreeForSecrets(filePaths: string[]): { hasCommittedSecrets: boolean; flaggedFiles: string[] } {
    const flaggedFiles: string[] = [];

    for (const path of filePaths) {
      if (this.isBlockedSensitivePath(path)) {
        flaggedFiles.push(path);
      }
    }

    if (flaggedFiles.length > 0) {
      this.logger.warn(`⚠️ High-Risk Credential Leak Detected in Repo Tree: ${flaggedFiles.join(', ')}`);
    }

    return {
      hasCommittedSecrets: flaggedFiles.length > 0,
      flaggedFiles,
    };
  }

  /**
   * Checks if a target file path is sensitive/blocked from model ingestion.
   * Exempts all template, example, sample, default, and dist configuration files.
   */
  isBlockedSensitivePath(path: string): boolean {
    if (isTemplateConfigFile(path)) {
      return false;
    }
    return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(path));
  }

  /**
   * Scans package manifest content (e.g. package.json) for suspicious/dangerous lifecycle hooks
   * (e.g., preinstall / postinstall running curl/wget pipe to bash, eval, obfuscated commands).
   */
  scanManifestForSuspiciousScripts(manifestContent: string): { hasSuspiciousScripts: boolean; findings: string[] } {
    const findings: string[] = [];
    if (!manifestContent) return { hasSuspiciousScripts: false, findings };

    const dangerousPatterns = [
      { pattern: /(curl|wget)\s+[^|]+\|\s*(ba)?sh/i, description: 'Remote script execution via curl/wget pipe to shell' },
      { pattern: /powershell(\.exe)?\s+(-enc|-encodedcommand)/i, description: 'Obfuscated PowerShell encoded command' },
      { pattern: /eval\s*\(\s*Buffer\.from/i, description: 'Obfuscated base64 eval execution in package script' },
      { pattern: /rm\s+-rf\s+(\/|~|\$HOME|\.\.)/i, description: 'Destructive filesystem deletion command in script' },
    ];

    for (const { pattern, description } of dangerousPatterns) {
      if (pattern.test(manifestContent)) {
        findings.push(description);
      }
    }

    if (findings.length > 0) {
      this.logger.warn(`⚠️ High-Risk Script Hook Detected in Manifest: ${findings.join(', ')}`);
    }

    return {
      hasSuspiciousScripts: findings.length > 0,
      findings,
    };
  }
}
