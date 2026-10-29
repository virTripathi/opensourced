import { registerAs } from '@nestjs/config';

export const DEFAULT_JWT_EXPIRES_IN = '7d';

export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
  encryptionKey: process.env.ENCRYPTION_KEY || '',
}));

export type AuthConfig = ReturnType<typeof authConfig>;
