import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || '8000'}`,
}));

export type AppConfig = ReturnType<typeof appConfig>;
