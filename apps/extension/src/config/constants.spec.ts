import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  resolveBackendUrl,
  PRODUCTION_BACKEND_URL,
  LOCAL_BACKEND_URL,
} from './constants.ts';

describe('Backend URL Resolution & Guardrails', () => {
  // Scenario 1: Production build defaults to Render production URL when no env vars provided
  test('Scenario 1: Production build defaults to production Render URL when env vars missing', () => {
    const url = resolveBackendUrl({
      MODE: 'production',
      DEV: false,
      PROD: true,
      VITE_BACKEND_URL: undefined,
      VITE_API_URL: undefined,
    });
    assert.strictEqual(url, PRODUCTION_BACKEND_URL);
    assert.strictEqual(url, 'https://opensourced-backend.onrender.com');
  });

  // Scenario 2: Production build with valid custom HTTPS URL uses that URL
  test('Scenario 2: Production build with valid custom HTTPS URL uses provided URL', () => {
    const customUrl = 'https://custom-backend.onrender.com';
    const url = resolveBackendUrl({
      MODE: 'production',
      DEV: false,
      PROD: true,
      VITE_BACKEND_URL: customUrl,
    });
    assert.strictEqual(url, customUrl);
  });

  // Scenario 3: Production build rejects localhost URLs
  test('Scenario 3: Production build throws explicit error when localhost URL is supplied', () => {
    assert.throws(
      () => {
        resolveBackendUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_BACKEND_URL: 'http://localhost:8000',
        });
      },
      (err: Error) => {
        return (
          err.message.includes('[OpenSourced Security Error]') &&
          err.message.includes('HTTPS')
        );
      }
    );

    // Also test HTTPS localhost
    assert.throws(
      () => {
        resolveBackendUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_BACKEND_URL: 'https://localhost:8000',
        });
      },
      (err: Error) => {
        return (
          err.message.includes('[OpenSourced Security Error]') &&
          err.message.includes('localhost/loopback')
        );
      }
    );

    // Test loopback IP 127.0.0.1
    assert.throws(
      () => {
        resolveBackendUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_BACKEND_URL: 'https://127.0.0.1:8000',
        });
      },
      (err: Error) => {
        return (
          err.message.includes('[OpenSourced Security Error]') &&
          err.message.includes('localhost/loopback')
        );
      }
    );
  });

  // Scenario 4: Production build rejects insecure HTTP URLs
  test('Scenario 4: Production build throws explicit error when insecure HTTP URL is supplied', () => {
    assert.throws(
      () => {
        resolveBackendUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_BACKEND_URL: 'http://opensourced-backend.onrender.com',
        });
      },
      (err: Error) => {
        return (
          err.message.includes('[OpenSourced Security Error]') &&
          err.message.includes('must use HTTPS')
        );
      }
    );
  });

  // Scenario 5: Local development build defaults to http://localhost:8000
  test('Scenario 5: Local development build defaults to http://localhost:8000', () => {
    const url = resolveBackendUrl({
      MODE: 'development',
      DEV: true,
      PROD: false,
      VITE_BACKEND_URL: undefined,
      VITE_API_URL: undefined,
    });
    assert.strictEqual(url, LOCAL_BACKEND_URL);
    assert.strictEqual(url, 'http://localhost:8000');
  });

  // Scenario 6: Local development build with custom dev URL
  test('Scenario 6: Local development build accepts custom development URL', () => {
    const url = resolveBackendUrl({
      MODE: 'development',
      DEV: true,
      PROD: false,
      VITE_BACKEND_URL: 'http://localhost:3001',
    });
    assert.strictEqual(url, 'http://localhost:3001');
  });

  // Scenario 7: URL sanitization trims trailing slashes and whitespace
  test('Scenario 7: Trailing slashes and whitespace are cleanly trimmed', () => {
    const url = resolveBackendUrl({
      MODE: 'production',
      DEV: false,
      PROD: true,
      VITE_BACKEND_URL: '  https://opensourced-backend.onrender.com///  ',
    });
    assert.strictEqual(url, 'https://opensourced-backend.onrender.com');
  });

  // Scenario 8: Production rejects embedded credentials in URLs
  test('Scenario 8: Production build rejects URLs containing embedded credentials', () => {
    assert.throws(
      () => {
        resolveBackendUrl({
          MODE: 'production',
          DEV: false,
          PROD: true,
          VITE_BACKEND_URL: 'https://user:pass@opensourced-backend.onrender.com',
        });
      },
      (err: Error) => {
        return (
          err.message.includes('[OpenSourced Security Error]') &&
          err.message.includes('credentials')
        );
      }
    );
  });
});
