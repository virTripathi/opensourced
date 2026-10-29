import { registerAs } from '@nestjs/config';

export const DEFAULT_DATABASE_TYPE = 'sqlite';
export const DEFAULT_DATABASE_URL = 'file:./data/opensourced.db';

export const databaseConfig = registerAs('database', () => ({
  type: (process.env.DATABASE_TYPE || DEFAULT_DATABASE_TYPE).toLowerCase(),
  url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
}));

export type DatabaseConfig = ReturnType<typeof databaseConfig>;
