import { Injectable, Logger } from '@nestjs/common';
import {
  sanitizeGitHubContent,
  wrapInUntrustedBoundary,
  scanAndRedactSecrets,
  SanitizationResult,
  SecretScanResult,
} from '@worksmarter/common';

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
}
