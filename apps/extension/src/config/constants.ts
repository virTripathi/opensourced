/**
 * Centralized Configuration for Chrome Extension
 */
export const EXTENSION_CONFIG = {
  // Base URL for backend intelligence server
  apiBase: (typeof process !== 'undefined' && process.env?.VITE_API_URL) || 'http://localhost:8000',
  defaultProjectsDir: '~/Projects',
};
