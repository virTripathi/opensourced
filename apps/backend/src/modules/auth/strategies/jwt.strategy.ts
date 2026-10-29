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

    let user = this.userRepo.findUserById(payload.sub);

    // If user record is not yet in memory (e.g. server reboot), re-register user from verified JWT
    if (!user) {
      user = this.userRepo.upsertUser({
        id: payload.sub,
        username: payload.username,
        provider: payload.provider || 'guest',
        isGuest: payload.isGuest ?? false,
      });
    }

    return user;
  }
}
