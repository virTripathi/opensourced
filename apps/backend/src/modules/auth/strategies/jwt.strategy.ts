import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserRepository, User } from '../user.repository';

export interface JwtPayload {
  sub: string;
  username: string;
  provider: 'github' | 'google' | 'guest' | 'dev';
  isGuest?: boolean;
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly userRepo: UserRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          return request?.cookies?.auth_token || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('auth.jwtSecret') ||
        configService.get<string>('JWT_SECRET') ||
        'opensourced_dev_jwt_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid JWT payload: missing subject identifier');
    }

    // OWASP A07: Verify session revocation status if session ID is attached
    if (payload.sid) {
      const isRevoked = await this.userRepo.isSessionRevoked(payload.sid);
      if (isRevoked) {
        throw new UnauthorizedException('Session has been revoked or expired');
      }
    }

    let user = await this.userRepo.findUserById(payload.sub);

    // If user record is not yet in persistent storage, re-register user from verified JWT
    if (!user) {
      user = await this.userRepo.upsertUser({
        id: payload.sub,
        username: payload.username,
        provider: payload.provider || 'guest',
        isGuest: payload.isGuest ?? false,
      });
    }

    if (payload.sid && user) {
      (user as any).sessionId = payload.sid;
    }

    return user;
  }
}
