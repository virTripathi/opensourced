import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { UserRepository, User } from '../user.repository';
import { DEFAULT_GITHUB_CALLBACK_URL } from '../../../config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github', 5) {
  private readonly logger = new Logger(GithubStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userRepo: UserRepository
  ) {
    const clientID =
      configService.get<string>('github.clientId') ||
      configService.get<string>('GITHUB_CLIENT_ID') ||
      'not-configured';
    const clientSecret =
      configService.get<string>('github.clientSecret') ||
      configService.get<string>('GITHUB_CLIENT_SECRET') ||
      'not-configured';
    const callbackURL =
      configService.get<string>('github.callbackUrl') ||
      configService.get<string>('GITHUB_CALLBACK_URL') ||
      DEFAULT_GITHUB_CALLBACK_URL;

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['read:user'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    paramsOrProfile: any,
    profileOrDone?: any
  ): Promise<User> {
    let tokenParams: any = {};
    let profile: any = paramsOrProfile;

    if (profileOrDone && typeof profileOrDone === 'object' && profileOrDone.id) {
      tokenParams = paramsOrProfile || {};
      profile = profileOrDone;
    } else if (paramsOrProfile && paramsOrProfile.id) {
      profile = paramsOrProfile;
    }

    const providerId = String(profile.id);
    const username = profile.username || profile.displayName || `gh_${providerId}`;
    const avatarUrl = profile.photos?.[0]?.value || `https://github.com/identicons/${username}.png`;
    const email = profile.emails?.[0]?.value;

    const expiresInSeconds = tokenParams.expires_in ? Number(tokenParams.expires_in) : 28800;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const user = await this.userRepo.upsertUser({
      id: `gh_${providerId}`,
      username,
      displayName: profile.displayName || username,
      avatarUrl,
      email,
      provider: 'github',
      providerId,
      githubAccessToken: accessToken,
      githubRefreshToken: refreshToken || tokenParams.refresh_token || undefined,
      githubTokenExpiresAt: expiresAt,
      githubTokenType: 'user_to_server',
      isGuest: false,
    });

    this.logger.log(
      `GitHub App user authorization successful for '${username}' (id: ${user.id}). Token expires in ${expiresInSeconds}s.`
    );
    return user;
  }
}
