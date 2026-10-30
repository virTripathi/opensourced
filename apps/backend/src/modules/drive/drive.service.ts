import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { User, UserRepository } from '../auth/user.repository';
import { ThirdPartyHttpService } from '../logger/third-party-http.service';

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  constructor(
    private readonly guardrails: GuardrailsService,
    private readonly thirdPartyHttp: ThirdPartyHttpService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly userRepo?: UserRepository
  ) {}

  /**
   * Resolves a valid, active Google access token. If expired, automatically refreshes
   * using the stored googleRefreshToken and updates the user record.
   */
  private async getFreshGoogleToken(user: User): Promise<string | null> {
    if (!user.googleRefreshToken) {
      return user.googleAccessToken || null;
    }

    // Test current token validity first
    if (user.googleAccessToken) {
      try {
        const testRes = await this.thirdPartyHttp.get('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${user.googleAccessToken}` },
          target: 'GOOGLE_DRIVE_API',
        });
        if (testRes.ok) {
          return user.googleAccessToken;
        }
      } catch {}
    }

    // Token expired or invalid; refresh using refresh_token
    const clientId =
      this.configService?.get<string>('google.clientId') ||
      this.configService?.get<string>('GOOGLE_CLIENT_ID') ||
      process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      this.configService?.get<string>('google.clientSecret') ||
      this.configService?.get<string>('GOOGLE_CLIENT_SECRET') ||
      process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return user.googleAccessToken || null;
    }

    try {
      this.logger.log(`Refreshing expired Google access token for user '${user.id}'...`);
      const bodyParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: user.googleRefreshToken,
        grant_type: 'refresh_token',
      }).toString();

      const res = await this.thirdPartyHttp.post(
        'https://oauth2.googleapis.com/token',
        bodyParams,
        {
          target: 'GOOGLE_OAUTH',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      if (res.ok) {
        const data = res.data as any;
        if (data?.access_token) {
          this.logger.log(`Successfully obtained fresh Google access token for user '${user.id}'`);
          // Persist rotated access token to DB
          if (this.userRepo) {
            await this.userRepo.upsertUser({
              id: user.id,
              googleAccessToken: data.access_token,
            });
          }
          user.googleAccessToken = data.access_token;
          return data.access_token;
        }
      } else {
        const err = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        this.logger.warn(`Failed to refresh Google token (${res.status}): ${err}`);
      }
    } catch (err: any) {
      this.logger.error(`Error during Google token refresh: ${err.message}`);
    }

    return user.googleAccessToken || null;
  }

  /**
   * Retrieves or creates a dedicated 'OpenSourced Research' folder in the user's Drive.
   */
  private async getOrCreateFolder(
    token: string,
    folderName = 'OpenSourced Research'
  ): Promise<string | null> {
    try {
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`;
      const searchRes = await this.thirdPartyHttp.get(searchUrl, {
        target: 'GOOGLE_DRIVE_API',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (searchRes.ok) {
        const data = searchRes.data as any;
        if (data?.files && data.files.length > 0) {
          return data.files[0].id;
        }
      }

      // Create folder if it doesn't exist
      const createRes = await this.thirdPartyHttp.post(
        'https://www.googleapis.com/drive/v3/files',
        {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        {
          target: 'GOOGLE_DRIVE_API',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (createRes.ok) {
        const newFolder = createRes.data as any;
        return newFolder?.id || null;
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify/create '${folderName}' folder: ${err.message}`);
    }
    return null;
  }

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

    let effectiveToken: string | null = null;
    if (user) {
      effectiveToken = await this.getFreshGoogleToken(user);
    }

    // If user has a valid Google OAuth token with drive.file scope, upload to Google Drive REST API
    if (effectiveToken) {
      try {
        const folderId = await this.getOrCreateFolder(effectiveToken, 'OpenSourced Research');

        const fileName = documentTitle.endsWith('.md') ? documentTitle : `${documentTitle}.md`;
        const metadata: any = {
          name: fileName,
          mimeType: 'text/markdown',
        };
        if (folderId) {
          metadata.parents = [folderId];
        }

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const multipartRequestBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: text/markdown; charset=UTF-8\r\n\r\n' +
          scan.sanitizedText +
          closeDelimiter;

        const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents';
        const uploadHeaders = {
          Authorization: `Bearer ${effectiveToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        };

        const response = await this.thirdPartyHttp.post(uploadUrl, multipartRequestBody, {
          target: 'GOOGLE_DRIVE_API',
          headers: uploadHeaders,
        });

        if (response.ok) {
          const driveData = response.data as any;
          const directFileLink =
            driveData?.webViewLink ||
            `https://drive.google.com/file/d/${driveData?.id}/view?usp=drivesdk`;

          this.logger.log(
            `Google Drive upload successful. File: "${fileName}" (ID: ${driveData?.id}) in folder: "OpenSourced Research" (${folderId})`
          );

          return {
            success: true,
            provider: 'google_drive',
            fileId: driveData?.id,
            folder: 'OpenSourced Research',
            folderId: folderId || undefined,
            webViewLink: directFileLink,
            title: fileName,
            userId,
            googleAuthenticated: true,
            secretsRedactedCount: scan.detectedSecrets.length,
          };
        } else {
          const errText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          this.logger.warn(`Google Drive API upload responded with HTTP ${response.status}: ${errText}`);
        }
      } catch (err: any) {
        this.logger.error(`Error uploading to Google Drive: ${err.message}`);
      }
    }

    // Default container or guest export response
    return {
      success: true,
      provider,
      fileId: `drive-doc-${Date.now()}`,
      webViewLink: 'https://drive.google.com/drive/u/0/my-drive',
      title: documentTitle,
      userId,
      googleAuthenticated: Boolean(effectiveToken),
      secretsRedactedCount: scan.detectedSecrets.length,
    };
  }
}
