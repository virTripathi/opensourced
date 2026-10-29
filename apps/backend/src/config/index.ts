import { appConfig } from './app.config';
import type { AppConfig } from './app.config';
import { authConfig, DEFAULT_JWT_EXPIRES_IN } from './auth.config';
import type { AuthConfig } from './auth.config';
import {
  githubConfig,
  DEFAULT_GITHUB_APP_NAME,
  DEFAULT_GITHUB_CALLBACK_URL,
} from './github.config';
import type { GithubConfig } from './github.config';
import {
  googleConfig,
  DEFAULT_GOOGLE_CALLBACK_URL,
  DEFAULT_STORAGE_PROVIDER,
} from './google.config';
import type { GoogleConfig } from './google.config';
import { aiConfig, DEFAULT_GEMINI_MODEL, DEFAULT_RANKING_PROVIDER } from './ai.config';
import type { AiConfig } from './ai.config';
import { loggerConfig } from './logger.config';
import type { LoggerConfig } from './logger.config';

import { databaseConfig, DEFAULT_DATABASE_TYPE, DEFAULT_DATABASE_URL } from './database.config';
import type { DatabaseConfig } from './database.config';

export const loadConfigs = [
  appConfig,
  authConfig,
  githubConfig,
  googleConfig,
  aiConfig,
  loggerConfig,
  databaseConfig,
];

export {
  appConfig,
  authConfig,
  DEFAULT_JWT_EXPIRES_IN,
  githubConfig,
  DEFAULT_GITHUB_APP_NAME,
  DEFAULT_GITHUB_CALLBACK_URL,
  googleConfig,
  DEFAULT_GOOGLE_CALLBACK_URL,
  DEFAULT_STORAGE_PROVIDER,
  aiConfig,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_RANKING_PROVIDER,
  loggerConfig,
  databaseConfig,
  DEFAULT_DATABASE_TYPE,
  DEFAULT_DATABASE_URL,
};

export type {
  AppConfig,
  AuthConfig,
  GithubConfig,
  GoogleConfig,
  AiConfig,
  LoggerConfig,
  DatabaseConfig,
};

export interface AppConfigRegistry {
  app: AppConfig;
  auth: AuthConfig;
  github: GithubConfig;
  google: GoogleConfig;
  ai: AiConfig;
  logger: LoggerConfig;
  database: DatabaseConfig;
}
