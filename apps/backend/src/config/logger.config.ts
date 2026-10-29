import { registerAs } from '@nestjs/config';

export const loggerConfig = registerAs('logger', () => ({
  filePath: process.env.LOG_FILE_PATH || '',
}));

export type LoggerConfig = ReturnType<typeof loggerConfig>;
