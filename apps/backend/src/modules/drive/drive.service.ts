import { Injectable, Logger } from '@nestjs/common';
import { GuardrailsService } from '../guardrails/guardrails.service';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  constructor(private readonly guardrails: GuardrailsService) {}

  async exportAnalysis(documentTitle: string, markdownContent: string) {
    // 1. Scan for secrets before saving
    const scan = this.guardrails.scanAndRedact(markdownContent);
    this.logger.log(`Exporting document: "${documentTitle}" to Google Drive (drive.file scope)`);

    // In local dev without credentials, return formatted link
    return {
      success: true,
      fileId: 'mock-drive-file-id',
      webViewLink: 'https://drive.google.com/drive/u/0/my-drive',
      title: documentTitle,
      secretsRedactedCount: scan.detectedSecrets.length,
    };
  }
}
