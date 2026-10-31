/**
 * Centralized Configuration for OpenSourced Chrome Extension
 */

export const PRODUCTION_BACKEND_URL = 'https://opensourced-backend.onrender.com';
export const LOCAL_BACKEND_URL = 'http://localhost:8000';

export interface BackendResolutionEnv {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
  VITE_BACKEND_URL?: string;
  VITE_API_URL?: string;
}

/**
 * Resolves and validates the backend URL based on build mode and environment variables.
 *
 * Rules:
 * - In production mode (MODE === 'production' or !DEV):
 *   - Defaults to `PRODUCTION_BACKEND_URL` (Render).
 *   - If overridden via VITE_BACKEND_URL or VITE_API_URL, must use HTTPS and cannot target localhost/loopback.
 *   - NEVER silently falls back to localhost.
 * - In development mode (MODE === 'development' or DEV):
 *   - Defaults to `LOCAL_BACKEND_URL` (http://localhost:8000).
 *   - Overridable via VITE_BACKEND_URL / VITE_API_URL.
 */
export function resolveBackendUrl(customEnv?: BackendResolutionEnv): string {
  const env: BackendResolutionEnv = customEnv || {
    MODE: typeof import.meta !== 'undefined' ? import.meta.env?.MODE : undefined,
    DEV: typeof import.meta !== 'undefined' ? import.meta.env?.DEV : undefined,
    PROD: typeof import.meta !== 'undefined' ? import.meta.env?.PROD : undefined,
    VITE_BACKEND_URL: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_BACKEND_URL : undefined,
    VITE_API_URL: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined,
  };

  const isDev = env.DEV === true || env.MODE === 'development';
  const rawUrl =
    env.VITE_BACKEND_URL ||
    env.VITE_API_URL ||
    (isDev ? LOCAL_BACKEND_URL : PRODUCTION_BACKEND_URL);

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('[OpenSourced Config Error] Backend URL is missing or invalid.');
  }

  const cleanUrl = rawUrl.trim().replace(/\/+$/, '');

  if (!isDev) {
    // Production validation
    if (!cleanUrl.startsWith('https://')) {
      throw new Error(
        `[OpenSourced Security Error] Production extension backend URL must use HTTPS. Received: "${cleanUrl}"`
      );
    }

    try {
      const parsed = new URL(cleanUrl);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.local')
      ) {
        throw new Error(
          `[OpenSourced Security Error] Production extension backend URL cannot target localhost/loopback. Received: "${cleanUrl}"`
        );
      }
      if (parsed.username || parsed.password) {
        throw new Error(
          '[OpenSourced Security Error] Production extension backend URL cannot include credentials.'
        );
      }
    } catch (e: any) {
      if (e.message?.includes('[OpenSourced Security Error]')) {
        throw e;
      }
      throw new Error(`[OpenSourced Config Error] Invalid backend URL format: "${cleanUrl}"`);
    }
  }

  return cleanUrl;
}

const apiBase = resolveBackendUrl();

// Emit diagnostic trace in browser environments
if (typeof window !== 'undefined') {
  const mode = typeof import.meta !== 'undefined' ? import.meta.env?.MODE || 'unknown' : 'unknown';
  console.info(`[OpenSourced] Active backend: ${apiBase} (mode: ${mode})`);
}

export const EXTENSION_CONFIG = {
  apiBase,
  defaultProjectsDir: '~/Projects',
};
