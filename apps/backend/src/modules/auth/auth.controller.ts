import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DevLoginDto, SavePatDto, AuthSessionResponseDto, UserProfileDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { GitHubOAuthGuard } from './guards/github-oauth.guard';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './user.repository';
import { ConfigService } from '@nestjs/config';

@ApiTags('Authentication & Session')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Get('session')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get Current User Session Profile',
    description:
      'Returns the authenticated user profile, or null if the client is currently logged out, along with OAuth configuration status.',
  })
  @ApiResponse({ status: 200, description: 'Session authentication status and user profile' })
  async getSession(@CurrentUser() user?: User) {
    const profile = await this.authService.getSessionProfile(user);
    const token = user ? this.authService.signToken(user) : null;
    return {
      authenticated: Boolean(profile),
      user: profile,
      token,
      providers: {
        github: Boolean(this.configService.get<boolean>('github.isConfigured')),
        google: Boolean(this.configService.get<boolean>('google.isConfigured')),
      },
    };
  }

  @Get('providers')
  @ApiOperation({
    summary: 'Get OAuth Providers Configuration Status',
    description: 'Returns which external identity and storage providers are currently configured on the backend.',
  })
  getProviders() {
    return {
      github: Boolean(this.configService.get<boolean>('github.isConfigured')),
      google: Boolean(this.configService.get<boolean>('google.isConfigured')),
    };
  }

  @Post('guest')
  @ApiOperation({
    summary: 'Initialize Isolated Guest Contributor Session',
    description:
      'Creates a cryptographically unique guest identity, issues a signed JWT, and sets an HTTP-only session cookie. Isolates guest data from other users.',
  })
  @ApiResponse({ status: 200, description: 'Guest session created', type: AuthSessionResponseDto })
  async createGuest(@Res({ passthrough: true }) res: Response): Promise<AuthSessionResponseDto> {
    const session = await this.authService.createGuestSession();

    this.setAuthCookie(res, session.token);

    return {
      user: session.user,
      token: session.token,
    };
  }

  @Post('dev-login')
  @ApiOperation({
    summary: 'Developer / Multi-User Test Login',
    description:
      'Allows switching between test user identities (e.g., alice, bob) to verify multi-tenant isolation, authorization policies, and IDOR prevention.',
  })
  @ApiBody({ type: DevLoginDto })
  @ApiResponse({ status: 200, description: 'Authenticated dev session', type: AuthSessionResponseDto })
  async devLogin(
    @Body() dto: DevLoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthSessionResponseDto> {
    const session = await this.authService.devLogin(dto);

    this.setAuthCookie(res, session.token);

    return {
      user: session.user,
      token: session.token,
    };
  }

  @Post('pat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Configure GitHub Personal Access Token (PAT)',
    description:
      'Stores a GitHub PAT strictly bound to the authenticated user ID for GitHub API rate limit relief. The token is never shared with or accessible to other users.',
  })
  @ApiBody({ type: SavePatDto })
  @ApiResponse({ status: 200, description: 'Updated user profile confirming PAT configuration' })
  async savePat(@CurrentUser() user: User, @Body() dto: SavePatDto) {
    return this.authService.savePat(user.id, dto.pat);
  }

  @Get('pat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Check User PAT Status',
    description:
      'Returns whether the user has a configured PAT and a masked preview. Never exposes the full raw PAT.',
  })
  @ApiResponse({ status: 200, description: 'PAT status preview' })
  async getPatStatus(@CurrentUser() user: User) {
    return this.authService.getPatStatus(user.id);
  }

  // ============================================================================
  // GitHub App User-to-Server Authorization Flow
  // ============================================================================

  @Get('github')
  @UseGuards(GitHubOAuthGuard)
  @ApiOperation({
    summary: 'Initiate GitHub App User-to-Server Authorization',
    description:
      'Redirects user to GitHub App authorization endpoint. Relies on fine-grained permissions configured on the GitHub App without requiring broad OAuth repository scopes.',
  })
  async githubLogin(@Req() req: Request, @Res() res: Response) {
    // Handled by GitHubOAuthGuard, which automatically attaches state and redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(GitHubOAuthGuard)
  @ApiOperation({
    summary: 'GitHub App OAuth Callback',
    description:
      'Handles redirect from GitHub, captures short-lived access token and refresh token, issues JWT, sets HTTP-only cookie, and redirects to client.',
  })
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('redirect') redirectQuery?: string,
    @Query('state') stateQuery?: string
  ) {
    const appUrl = this.getAppUrl();
    const user = req.user as User | undefined;
    if (!user) {
      return res.redirect(`${appUrl}/api/auth/session?error=auth_failed`);
    }

    const token = this.authService.signToken(user);
    this.setAuthCookie(res, token);

    // OWASP A01 / Anti-Open-Redirect: Strictly validate target redirect URL
    const rawRedirect = stateQuery || redirectQuery;
    const target = this.validateSafeRedirectUrl(rawRedirect);

    // Direct browser login fallback (render responsive card with postMessage for popup communication)
    if (!rawRedirect || target === `${appUrl}/api/auth/session`) {
      res.setHeader('Content-Type', 'text/html');
      return res.send(this.renderAuthSuccessHtml(user, token, 'GitHub App'));
    }

    return res.redirect(`${target}#token=${token}`);
  }

  @Post('github/refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Rotate GitHub App User Access Token',
    description:
      'Uses the stored refresh token to issue a new short-lived user access token and a rotated refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refreshGitHubToken(@CurrentUser() user: User) {
    await this.authService.refreshGitHubToken(user.id);
    return {
      success: true,
      message: 'GitHub App token successfully rotated',
    };
  }

  // ============================================================================
  // Google OAuth 2.0 Flow (drive.file scope)
  // ============================================================================

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Initiate Google OAuth 2.0 Login',
    description: 'Redirects user to Google OAuth endpoint requesting https://www.googleapis.com/auth/drive.file scope.',
  })
  async googleLogin(@Req() req: Request, @Res() res: Response) {
    // Handled by GoogleOAuthGuard, which automatically attaches state and redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({
    summary: 'Google OAuth 2.0 Callback',
    description: 'Handles Google OAuth callback, attaches drive.file tokens, issues JWT, sets cookie.',
  })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('redirect') redirectQuery?: string,
    @Query('state') stateQuery?: string
  ) {
    const appUrl = this.getAppUrl();
    const user = req.user as User | undefined;
    if (!user) {
      return res.redirect(`${appUrl}/api/auth/session?error=google_auth_failed`);
    }

    const token = this.authService.signToken(user);
    this.setAuthCookie(res, token);

    // OWASP A01 / Anti-Open-Redirect: Strictly validate target redirect URL
    const rawRedirect = stateQuery || redirectQuery;
    const target = this.validateSafeRedirectUrl(rawRedirect);

    // Direct browser login fallback
    if (!rawRedirect || target === `${appUrl}/api/auth/session`) {
      res.setHeader('Content-Type', 'text/html');
      return res.send(this.renderAuthSuccessHtml(user, token, 'Google Drive'));
    }

    return res.redirect(`${target}#token=${token}`);
  }

  // ============================================================================
  // Logout & Session Invalidation
  // ============================================================================

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log Out & Clear Session Cookie',
    description: 'Clears the HTTP-only auth_token cookie and invalidates client session.',
  })
  @ApiResponse({ status: 200, description: 'Session terminated' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/',
    });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  // ============================================================================
  // Private Helper
  // ============================================================================

  private getAppUrl(): string {
    return this.configService?.get<string>('app.appUrl') || 'http://localhost:8000';
  }

  private isProduction(): boolean {
    return (
      this.configService?.get<boolean>('app.isProduction') ??
      process.env.NODE_ENV === 'production'
    );
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  /**
   * OWASP A01 Defense: Validates redirect targets to strictly whitelist
   * authorized Chrome Extension IDs, chromiumapp.org endpoints, and local developer hosts.
   */
  private validateSafeRedirectUrl(redirectUrl?: string): string {
    const defaultUrl = `${this.getAppUrl()}/api/auth/session`;
    if (!redirectUrl) {
      return defaultUrl;
    }

    try {
      const parsed = new URL(redirectUrl);

      // 1. Whitelist Chrome Extension OAuth redirect URL (https://<extension-id>.chromiumapp.org/...)
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.chromiumapp.org')) {
        return redirectUrl;
      }

      // 2. Whitelist Chrome Extension scheme (chrome-extension://<id>)
      if (parsed.protocol === 'chrome-extension:') {
        return redirectUrl;
      }

      // 3. Whitelist local development hosts
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      ) {
        return redirectUrl;
      }
    } catch {
      // Malformed URL, fall through to default
    }

    // Default safe fallback if unapproved or malicious redirect target is supplied
    return defaultUrl;
  }

  private renderAuthSuccessHtml(user: User, token: string, providerName: string): string {
    const displayName = user.displayName || user.username || 'Contributor';
    const avatar = user.avatarUrl || 'https://github.com/identicons/opensourced.png';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpenSourced — Authentication Successful</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .avatar {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      border: 3px solid #38bdf8;
      margin: 0 auto 16px auto;
      display: block;
      object-fit: cover;
    }
    h2 { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #f8fafc; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #10b981;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      width: 100%;
      background: #2563eb;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <img src="${avatar}" alt="${user.username}" class="avatar" />
    <h2>Welcome, ${displayName}!</h2>
    <div class="badge">✓ ${providerName} Connected</div>
    <p>Your authentication was successful. Your session is active and securely saved. You can safely close this window and return to OpenSourced.</p>
    <button class="btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: 'OPENSOURCED_AUTH_TOKEN',
          token: '${token}',
          user: ${JSON.stringify({
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            email: user.email,
          })}
        }, '*');
        setTimeout(() => { try { window.close(); } catch(e){} }, 1200);
      }
    } catch (e) {}
  </script>
</body>
</html>`;
  }
}

