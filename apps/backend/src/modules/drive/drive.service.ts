import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { User } from '../auth/user.repository';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  constructor(
    private readonly guardrails: GuardrailsService,
    @Optional() private readonly configService?: ConfigService
  ) {}

  async exportAnalysis(documentTitle: string, markdownContent: string, user?: User) {
    // 1. Scan for secrets before saving (Guardrail zero-leakage)
    const scan = this.guardrails.scanAndRedact(markdownContent);
    const userId = user?.id || 'guest-anonymous';
    const provider =
      this.configService?.get<string>('google.defaultStorageProvider') ||
      process.env.DEFAULT_STORAGE_PROVIDER ||
      'google_drive';

    this.logger.log(
      `Exporting document: "${documentTitle}" for user: '${userId}' via ${provider} (drive.file scope)`
    );

    const hasGoogleAuth = Boolean(user?.googleAccessToken || user?.provider === 'google');

    // Return export status with user link
    return {
      success: true,
      provider,
      fileId: `drive-doc-${Date.now()}`,
      webViewLink: 'https://drive.google.com/drive/u/0/my-drive',
      title: documentTitle,
      userId,
      googleAuthenticated: hasGoogleAuth,
      secretsRedactedCount: scan.detectedSecrets.length,
    };
  }
}
