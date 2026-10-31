import { Injectable, Logger, NotFoundException, UnauthorizedException, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRepository, User } from './user.repository';
import { UserProfile } from '@opensourced/common/types';
import { DevLoginDto } from './dto/auth.dto';
import { ThirdPartyHttpService } from '../logger/third-party-http.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly activeRefreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly userRepo: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly thirdPartyHttp?: ThirdPartyHttpService
  ) {}

  /**
   * Generates a signed JWT token bound to the user's unique identity
   * and registers an active session record in persistent storage for instant revocation.
   */
  async signToken(user: User): Promise<string> {
    const sid = `sid_${crypto.randomBytes(12).toString('hex')}`;
    const expiresInMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const expiresAt = new Date(Date.now() + expiresInMs);

    // Register active session in persistent database strategy
    await this.userRepo.createSession(sid, user.id, expiresAt);

    const payload = {
      sub: user.id,
      username: user.username,
      provider: user.provider,
      isGuest: user.isGuest ?? false,
      sid,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Revoke an active session (Security: Identification and Authentication Failures)
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.userRepo.revokeSession(sessionId);
    this.logger.log(`Session revoked: ${sessionId}`);
  }

  /**
   * Revoke all sessions for a user (e.g. password change, security breach)
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.userRepo.revokeAllUserSessions(userId);
    this.logger.log(`All sessions revoked for user: ${userId}`);
  }

  /**
   * Transforms internal User entity to sanitized, leak-safe public UserProfile
   * Strictly prevents leaking OAuth access tokens, refresh tokens, or raw PATs.
   */
  toProfile(user: User): UserProfile {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      isGuest: user.isGuest,
      githubConnected: Boolean(user.githubAccessToken || user.provider === 'github'),
      googleConnected: Boolean(user.googleAccessToken || user.provider === 'google'),
      hasPat: Boolean(user.pat),
    };
  }

  /**
   * Retrieves the current user's profile, or null if not authenticated
   */
  async getSessionProfile(user?: User): Promise<UserProfile | null> {
    if (user) {
      const refreshed = await this.userRepo.findUserById(user.id);
      return this.toProfile(refreshed || user);
    }

    // Unauthenticated state: return null
    return null;
  }

  /**
   * Creates an isolated zero-friction guest session.
   * Generates a cryptographically random guest ID so guest data cannot collide or leak across users.
   */
  async createGuestSession(): Promise<{ user: UserProfile; token: string }> {
    const guestId = `guest_${crypto.randomBytes(6).toString('hex')}`;
    const user = await this.userRepo.upsertUser({
      id: guestId,
      username: `guest-${guestId.slice(6, 12)}`,
      displayName: 'Guest Contributor',
      avatarUrl: `https://github.com/identicons/${guestId}.png`,
      provider: 'guest',
      isGuest: true,
      roles: ['guest'],
    });

    const token = await this.signToken(user);
    this.logger.log(`Created guest session: '${user.id}'`);

    return {
      user: this.toProfile(user),
      token,
    };
  }

  /**
   * Developer / Simulation login for testing multi-user isolation and IDOR defenses.
   */
  async devLogin(dto: DevLoginDto): Promise<{ user: UserProfile; token: string }> {
    const username = dto.username.trim().toLowerCase();
    const existing = await this.userRepo.findUserByUsername(username);

    const user = await this.userRepo.upsertUser({
      id: existing ? existing.id : `usr_${username.replace(/[^a-z0-9_-]/g, '')}`,
      username,
      displayName: dto.displayName || dto.username,
      avatarUrl: dto.avatarUrl || `https://github.com/identicons/${username}.png`,
      provider: 'dev',
      isGuest: false,
      roles: ['user'],
    });

    const token = await this.signToken(user);
    this.logger.log(`Dev login for user: '${user.username}' (id: ${user.id})`);

    return {
      user: this.toProfile(user),
      token,
    };
  }

  /**
   * Associating GitHub Personal Access Token (PAT) strictly with the authenticated user.
   * IDOR PREVENTION: The PAT is strictly saved against the verified userId.
   */
  async savePat(userId: string, pat: string): Promise<UserProfile> {
    const user = await this.userRepo.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`User '${userId}' not found`);
    }

    const updated = await this.userRepo.upsertUser({
      ...user,
      pat: pat.trim(),
    });

    this.logger.log(`Updated PAT for user '${userId}'`);
    return this.toProfile(updated);
  }

  /**
   * Retrieve masked PAT status for the authenticated user.
   * Never exposes raw PAT in plain text.
   */
  async getPatStatus(userId: string): Promise<{ hasPat: boolean; maskedPat?: string }> {
    const user = await this.userRepo.findUserById(userId);
    if (!user || !user.pat) {
      return { hasPat: false };
    }

    const raw = user.pat;
    const masked = raw.length > 8 ? `${raw.slice(0, 4)}...${raw.slice(-4)}` : '****';
    return {
      hasPat: true,
      maskedPat: masked,
    };
  }

  /**
   * Refreshes an expiring GitHub App user access token using the refresh token.
   * GitHub rotates tokens: issues a new access token (ghu_) and a new refresh token (ghr_).
   * SINGLEFLIGHT IDEMPOTENCY: Concurrent calls share the same in-flight promise to prevent race conditions.
   */
  async refreshGitHubToken(userId: string): Promise<string> {
    const existing = this.activeRefreshes.get(userId);
    if (existing) {
      this.logger.log(`Reusing in-flight token refresh promise for user '${userId}'`);
      return existing;
    }

    const refreshPromise = this.executeRefreshGitHubToken(userId).finally(() => {
      this.activeRefreshes.delete(userId);
    });

    this.activeRefreshes.set(userId, refreshPromise);
    return refreshPromise;
  }

  private async executeRefreshGitHubToken(userId: string): Promise<string> {
    const user = await this.userRepo.findUserById(userId);
    if (!user || !user.githubRefreshToken) {
      throw new UnauthorizedException('No GitHub refresh token available for user');
    }

    const clientId =
      this.configService.get<string>('github.clientId') ||
      this.configService.get<string>('GITHUB_CLIENT_ID');
    const clientSecret =
      this.configService.get<string>('github.clientSecret') ||
      this.configService.get<string>('GITHUB_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('GitHub App credentials (CLIENT_ID / CLIENT_SECRET) not configured');
    }

    try {
      const payload = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: user.githubRefreshToken,
      };

      let data: any;

      if (this.thirdPartyHttp) {
        // Use resilient wrapper with retries and redacted logging
        const response = await this.thirdPartyHttp.post(
          'https://github.com/login/oauth/access_token',
          payload,
          {
            target: 'GITHUB_OAUTH',
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new UnauthorizedException(`GitHub token refresh HTTP error: ${response.status}`);
        }
        data = response.data;
      } else {
        const response = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new UnauthorizedException(`GitHub token refresh HTTP error: ${response.status}`);
        }
        data = await response.json();
      }

      if (data.error || !data.access_token) {
        throw new UnauthorizedException(
          `GitHub token refresh rejected: ${data.error_description || data.error || 'Unknown error'}`
        );
      }

      const expiresIn = Number(data.expires_in) || 28800; // 8 hours default
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      await this.userRepo.upsertUser({
        id: user.id,
        githubAccessToken: data.access_token,
        githubRefreshToken: data.refresh_token || user.githubRefreshToken,
        githubTokenExpiresAt: expiresAt,
        githubTokenType: 'user_to_server',
      });

      this.logger.log(
        `Successfully rotated GitHub App token for user '${user.id}'. New token valid for ${expiresIn}s.`
      );
      return data.access_token;
    } catch (err: any) {
      this.logger.error(`Failed to refresh GitHub App token for user '${userId}': ${err.message}`);
      throw new UnauthorizedException(`GitHub App token refresh failed: ${err.message}`);
    }
  }

  /**
   * Returns a valid, non-expired GitHub token for the given user.
   * Prioritizes PAT if configured, then checks GitHub App token with proactive auto-refresh
   * when within 5 minutes of expiration.
   */
  async getValidGitHubToken(userId: string): Promise<string | undefined> {
    const user = await this.userRepo.findUserById(userId);
    if (!user) return undefined;

    // 1. Personal Access Token (PAT) override takes precedence if user provided one
    if (user.pat) {
      return user.pat;
    }

    if (!user.githubAccessToken) {
      return undefined;
    }

    // 2. Proactive GitHub App token rotation if nearing expiration (< 5 minutes remaining)
    if (user.githubTokenExpiresAt && user.githubRefreshToken) {
      const fiveMinutesMs = 5 * 60 * 1000;
      const timeRemaining = user.githubTokenExpiresAt.getTime() - Date.now();

      if (timeRemaining < fiveMinutesMs) {
        this.logger.log(
          `GitHub token for user '${userId}' expires in ${Math.round(timeRemaining / 1000)}s. Auto-refreshing...`
        );
        try {
          return await this.refreshGitHubToken(userId);
        } catch (err: any) {
          this.logger.warn(`Proactive token refresh failed: ${err.message}. Falling back to existing token.`);
          return user.githubAccessToken;
        }
      }
    }

    return user.githubAccessToken;
  }
}
