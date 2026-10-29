import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { ReportsController } from './reports.controller';
import { AuthService } from './auth.service';
import { ReportsService } from './reports.service';
import { UserRepository } from './user.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GitHubOAuthGuard } from './guards/github-oauth.guard';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';

import { DEFAULT_JWT_EXPIRES_IN } from '../../config';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('auth.jwtSecret') ||
          config.get<string>('JWT_SECRET') ||
          'opensourced_dev_jwt_secret',
        signOptions: {
          expiresIn:
            config.get<string>('auth.jwtExpiresIn') ||
            config.get<string>('JWT_EXPIRES_IN') ||
            DEFAULT_JWT_EXPIRES_IN,
        },
      }),
    }),
  ],
  controllers: [AuthController, ReportsController],
  providers: [
    AuthService,
    ReportsService,
    UserRepository,
    JwtStrategy,
    GithubStrategy,
    GoogleStrategy,
    GitHubOAuthGuard,
    GoogleOAuthGuard,
  ],
  exports: [
    AuthService,
    ReportsService,
    UserRepository,
    JwtModule,
    PassportModule,
    GitHubOAuthGuard,
    GoogleOAuthGuard,
  ],
})
export class AuthModule {}
