import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from '../user.repository';
import { DEFAULT_GOOGLE_CALLBACK_URL } from '../../../config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userRepo: UserRepository
  ) {
    const clientID =
      configService.get<string>('google.clientId') ||
      configService.get<string>('GOOGLE_CLIENT_ID') ||
      'not-configured';
    const clientSecret =
      configService.get<string>('google.clientSecret') ||
      configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      'not-configured';
    const callbackURL =
      configService.get<string>('google.callbackUrl') ||
      configService.get<string>('GOOGLE_CALLBACK_URL') ||
      configService.get<string>('GOOGLE_REDIRECT_URI') ||
      DEFAULT_GOOGLE_CALLBACK_URL;

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['https://www.googleapis.com/auth/drive.file', 'profile', 'email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback
  ): Promise<any> {
    const providerId = String(profile.id);
    const email = profile.emails?.[0]?.value;
    const username = email ? email.split('@')[0] : `google_${providerId}`;
    const avatarUrl = profile.photos?.[0]?.value || `https://github.com/identicons/${username}.png`;

    const user = this.userRepo.upsertUser({
      id: `google_${providerId}`,
      username,
      displayName: profile.displayName || username,
      email,
      avatarUrl,
      provider: 'google',
      providerId,
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      isGuest: false,
    });

    this.logger.log(`Google OAuth successful for user '${username}' (id: ${user.id})`);
    done(null, user);
  }
}
