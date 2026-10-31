import { registerAs } from '@nestjs/config';

export const DEFAULT_GOOGLE_CALLBACK_URL = 'http://localhost:8000/api/auth/google/callback';
export const DEFAULT_STORAGE_PROVIDER = 'google_drive';

export function normalizeGoogleCallbackUrl(rawUrl?: string): string {
  if (!rawUrl) return DEFAULT_GOOGLE_CALLBACK_URL;
  const clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean.includes('/api/auth/google/callback')) {
    return `${clean}/api/auth/google/callback`;
  }
  return clean;
}

export const googleConfig = registerAs('google', () => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const isConfigured = Boolean(
    clientId &&
    clientSecret &&
    !clientId.includes('your_google_oauth_client_id')
  );

  return {
    clientId: clientId || undefined,
    clientSecret: clientSecret || undefined,
    callbackUrl: normalizeGoogleCallbackUrl(
      process.env.GOOGLE_CALLBACK_URL || process.env.GOOGLE_REDIRECT_URI
    ),
    defaultStorageProvider: process.env.DEFAULT_STORAGE_PROVIDER || DEFAULT_STORAGE_PROVIDER,
    isConfigured,
  };
});

export type GoogleConfig = ReturnType<typeof googleConfig>;
