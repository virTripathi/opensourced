import { registerAs } from '@nestjs/config';

export const DEFAULT_GITHUB_APP_NAME = 'opensourced-official';
export const DEFAULT_GITHUB_CALLBACK_URL = 'http://localhost:8000/api/auth/github/callback';

export function normalizeGitHubCallbackUrl(rawUrl?: string): string {
  if (!rawUrl) return DEFAULT_GITHUB_CALLBACK_URL;
  const clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean.includes('/api/auth/github/callback')) {
    return `${clean}/api/auth/github/callback`;
  }
  return clean;
}

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
    callbackUrl: normalizeGitHubCallbackUrl(process.env.GITHUB_CALLBACK_URL),
    tokenFallback: process.env.GITHUB_TOKEN || undefined,
    isConfigured,
  };
});

export type GithubConfig = ReturnType<typeof githubConfig>;
