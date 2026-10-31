import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isDev = mode === 'development';
  const backendUrl =
    env.VITE_BACKEND_URL ||
    env.VITE_API_URL ||
    (isDev ? 'http://localhost:8000' : 'https://opensourced-backend.onrender.com');

  // Build-time validation: Prevent accidental localhost in production builds
  if (!isDev) {
    const cleanUrl = backendUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('https://')) {
      throw new Error(
        `[OpenSourced Build Error] Production build requires HTTPS backend URL. Received: "${cleanUrl}"`
      );
    }
    const hostname = new URL(cleanUrl).hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local')
    ) {
      throw new Error(
        `[OpenSourced Build Error] Production build cannot target localhost/loopback. Received: "${cleanUrl}"`
      );
    }
  }

  // Adjust host permissions based on build mode
  const hostPermissions = [
    'https://github.com/*',
    'https://opensourced-backend.onrender.com/*',
    ...(isDev ? ['http://localhost:8000/*'] : []),
  ];

  const dynamicManifest = {
    ...manifest,
    host_permissions: hostPermissions,
  };

  return {
    plugins: [
      react(),
      crx({ manifest: dynamicManifest }),
    ],
    resolve: {
      alias: {
        '@opensourced/common': path.resolve(__dirname, '../../packages/common/src/index.ts'),
        '@opensourced/common/types': path.resolve(__dirname, '../../packages/common/src/types/index.ts'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
