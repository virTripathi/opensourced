import { Injectable, ExecutionContext, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isConfigured = Boolean(this.configService.get<boolean>('google.isConfigured'));

    if (!isConfigured) {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();

      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        res.status(HttpStatus.OK).setHeader('Content-Type', 'text/html').send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Google Drive Not Configured</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; color: #1a1a1a; }
              .box { max-width: 420px; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #e5e5e5; text-align: center; }
              h2 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
              p { font-size: 13px; color: #666; line-height: 1.5; margin: 0 0 20px; }
              button { background: #111; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 500; }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Google Drive is not configured yet</h2>
              <p>GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET have not been configured on the server environment.</p>
              <button onclick="window.close()">Close Window</button>
            </div>
          </body>
          </html>
        `);
        return false;
      }

      res.status(HttpStatus.NOT_IMPLEMENTED).json({
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        error: 'Not Configured',
        message: 'Google Drive connection is not configured yet.',
      });
      return false;
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const redirect = req.query?.redirect || req.query?.state;
    if (redirect) {
      return {
        state: String(redirect),
        accessType: 'offline',
        prompt: 'consent',
      };
    }
    return {
      accessType: 'offline',
      prompt: 'consent',
    };
  }
}
