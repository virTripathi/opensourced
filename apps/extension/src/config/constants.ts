/**
 * Centralized Configuration for Chrome Extension
 */
export const EXTENSION_CONFIG = {
  // Base URL for backend intelligence server (defaults to local port 8000, overridable at build time via VITE_API_URL)
  apiBase:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
    'http://localhost:8000',
  defaultProjectsDir: '~/Projects',
};
