import { registerAs } from '@nestjs/config';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_RANKING_PROVIDER = 'gemini';

export const aiConfig = registerAs('ai', () => {
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const isConfigured = Boolean(
    geminiApiKey &&
    !geminiApiKey.includes('your_gemini') &&
    geminiApiKey !== 'mock-key'
  );

  return {
    rankingProvider: process.env.RANKING_PROVIDER || DEFAULT_RANKING_PROVIDER,
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    isConfigured,
  };
});

export type AiConfig = ReturnType<typeof aiConfig>;
