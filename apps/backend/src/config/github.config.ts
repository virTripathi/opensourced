import { registerAs } from '@nestjs/config';

export const DEFAULT_GITHUB_APP_NAME = 'opensourced-official';
export const DEFAULT_GITHUB_CALLBACK_URL = 'http://localhost:8000/api/auth/github/callback';

export const githubConfig = registerAs('github', () => {
  const clientId = process.env.GITHUB_CLIENT_ID || '';
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
  const isConfigured = Boolean(
    clientId &&
    clientSecret &&
    !clientId.includes('your_github_client_id')
  );

  return {
    appName: process.env.GITHUB_APP_NAME || DEFAULT_GITHUB_APP_NAME,
    clientId: clientId || undefined,
    clientSecret: clientSecret || undefined,
    callbackUrl: process.env.GITHUB_CALLBACK_URL || DEFAULT_GITHUB_CALLBACK_URL,
    tokenFallback: process.env.GITHUB_TOKEN || undefined,
    isConfigured,
  };
});

export type GithubConfig = ReturnType<typeof githubConfig>;
