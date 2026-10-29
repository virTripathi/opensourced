import { Injectable, Logger } from '@nestjs/common';
import {
  sanitizeGitHubContent,
  wrapInUntrustedBoundary,
  scanAndRedactSecrets,
  SanitizationResult,
  SecretScanResult,
} from '@opensourced/common';

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.(?!example|sample|template)[^/]+)?$/i,
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
   */
  isBlockedSensitivePath(path: string): boolean {
    return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(path));
  }
}
