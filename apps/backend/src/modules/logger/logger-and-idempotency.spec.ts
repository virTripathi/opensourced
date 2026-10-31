import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  redactSensitiveData,
  redactHttpHeaders,
  maskUrlQueryParams,
  maskStringContent,
  isSensitiveKey,
} from './redactor.util';
import { RequestContextService } from './request-context.service';
import { AppJsonLoggerService } from './app-json-logger.service';
import { ThirdPartyHttpService } from './third-party-http.service';
import { UserRepository } from '../auth/user.repository';
import { ReportsService } from '../auth/reports.service';
import { FolderPickerService } from '../git/folder-picker.service';

async function runLoggerAndIdempotencyTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting OpenSourced Logging & Idempotency Test Suite');
  console.log('🧪 ========================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // Group 1: Redaction Engine Verification (Zero Credential Leakage)
  // --------------------------------------------------------------------------
  await test('Redactor identifies all sensitive key patterns', () => {
    assert.strictEqual(isSensitiveKey('client_id'), true);
    assert.strictEqual(isSensitiveKey('clientId'), true);
    assert.strictEqual(isSensitiveKey('client_secret'), true);
    assert.strictEqual(isSensitiveKey('clientSecret'), true);
    assert.strictEqual(isSensitiveKey('encryption_key'), true);
    assert.strictEqual(isSensitiveKey('encryptionKey'), true);
    assert.strictEqual(isSensitiveKey('access_token'), true);
    assert.strictEqual(isSensitiveKey('accessToken'), true);
    assert.strictEqual(isSensitiveKey('refresh_token'), true);
    assert.strictEqual(isSensitiveKey('refreshToken'), true);
    assert.strictEqual(isSensitiveKey('token'), true);
    assert.strictEqual(isSensitiveKey('pat'), true);
    assert.strictEqual(isSensitiveKey('apiKey'), true);
    assert.strictEqual(isSensitiveKey('gemini_api_key'), true);
    assert.strictEqual(isSensitiveKey('password'), true);
    assert.strictEqual(isSensitiveKey('authorization'), true);
    assert.strictEqual(isSensitiveKey('cookie'), true);

    // Non-sensitive keys must NOT be redacted
    assert.strictEqual(isSensitiveKey('owner'), false);
    assert.strictEqual(isSensitiveKey('repo'), false);
    assert.strictEqual(isSensitiveKey('username'), false);
    assert.strictEqual(isSensitiveKey('action'), false);
  });

  await test('Redactor scrubs sensitive keys from nested objects and arrays', () => {
    const rawPayload = {
      owner: 'calcom',
      repo: 'cal.com',
      client_id: 'gh_client_12345',
      client_secret: 'super_secret_shhh',
      encryption_key: 'aes-256-gcm-master-key',
      auth: {
        token: 'gho_1234567890abcdefghijklmnopqrstuvwxyz',
        refresh_token: 'ghr_abcdefghijklmnopqrstuvwxyz123456',
        nested: {
          pat: 'ghp_secretPersonalAccessTokenHere987654321',
          apiKey: 'AIzaSySecretGeminiApiKey',
        },
      },
      tags: ['open-source', 'typescript'],
    };

    const sanitized = redactSensitiveData(rawPayload);

    assert.strictEqual(sanitized.owner, 'calcom');
    assert.strictEqual(sanitized.repo, 'cal.com');
    assert.strictEqual(sanitized.client_id, '[REDACTED]');
    assert.strictEqual(sanitized.client_secret, '[REDACTED]');
    assert.strictEqual(sanitized.encryption_key, '[REDACTED]');
    assert.strictEqual(sanitized.auth.token, '[REDACTED]');
    assert.strictEqual(sanitized.auth.refresh_token, '[REDACTED]');
    assert.strictEqual(sanitized.auth.nested.pat, '[REDACTED]');
    assert.strictEqual(sanitized.auth.nested.apiKey, '[REDACTED]');
    assert.deepStrictEqual(sanitized.tags, ['open-source', 'typescript']);
  });

  await test('Redactor masks sensitive query parameters in URL strings', () => {
    const rawUrl = 'https://api.github.com/login/oauth/access_token?client_id=123&client_secret=secretKey99&state=xyz';
    const masked = maskUrlQueryParams(rawUrl);

    assert.ok(!masked.includes('secretKey99'), 'Client secret must not be in masked URL');
    assert.ok(masked.includes('client_secret=%5BREDACTED%5D') || masked.includes('client_secret=[REDACTED]'));
  });

  await test('Redactor handles Bearer tokens and JWTs in arbitrary strings', () => {
    const textWithBearer = 'Connecting with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID';
    const masked = maskStringContent(textWithBearer);

    assert.ok(!masked.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Raw JWT must be redacted');
    assert.ok(masked.includes('Bearer [REDACTED]') || masked.includes('[REDACTED_JWT_TOKEN]'));
  });

  await test('Redactor safely handles circular references without throwing', () => {
    const circular: any = { name: 'test-obj' };
    circular.self = circular;

    assert.doesNotThrow(() => {
      const result = redactSensitiveData(circular);
      assert.strictEqual(result.name, 'test-obj');
      assert.strictEqual(result.self, '[CIRCULAR]');
    });
  });

  await test('Redactor scrubs sensitive HTTP headers', () => {
    const headers = {
      'content-type': 'application/json',
      Authorization: 'Bearer gho_test12345',
      Cookie: 'auth_token=jwt.token.here; session=xyz',
      'X-Trace-Id': 'trc_12345',
      'Client-Secret': 'github-secret',
    };

    const clean = redactHttpHeaders(headers);

    assert.strictEqual(clean['content-type'], 'application/json');
    assert.strictEqual(clean['X-Trace-Id'], 'trc_12345');
    assert.strictEqual(clean.Authorization, '[REDACTED]');
    assert.strictEqual(clean.Cookie, '[REDACTED]');
    assert.strictEqual(clean['Client-Secret'], '[REDACTED]');
  });

  // --------------------------------------------------------------------------
  // Group 2: Async Local Storage & Tracing Context
  // --------------------------------------------------------------------------
  await test('RequestContextService isolates traceId across async boundaries', async () => {
    const traceA = 'trc_session_aaa';
    const traceB = 'trc_session_bbb';

    let capturedInA = '';
    let capturedInB = '';

    await Promise.all([
      new Promise<void>((resolve) => {
        RequestContextService.run({ traceId: traceA, startTime: Date.now() }, async () => {
          await new Promise((r) => setTimeout(r, 10));
          capturedInA = RequestContextService.getTraceId();
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        RequestContextService.run({ traceId: traceB, startTime: Date.now() }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          capturedInB = RequestContextService.getTraceId();
          resolve();
        });
      }),
    ]);

    assert.strictEqual(capturedInA, traceA);
    assert.strictEqual(capturedInB, traceB);
  });

  // --------------------------------------------------------------------------
  // Group 3: Laravel-Style JSON File Logger (app.log.json)
  // --------------------------------------------------------------------------
  await test('AppJsonLoggerService writes parseable redacted JSON lines to app.log.json', async () => {
    const testLogPath = path.resolve(process.cwd(), 'logs', 'test-app.log.json');
    process.env.LOG_FILE_PATH = testLogPath;

    // Clean up test file if exists
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }

    const logger = new AppJsonLoggerService();

    RequestContextService.run({ traceId: 'trc_test_999', userId: 'usr_charlie', startTime: Date.now() }, () => {
      logger.logIncomingRequest({
        method: 'POST',
        url: '/api/auth/dev-login?token=sensitive-query-token',
        body: {
          username: 'charlie',
          client_secret: 'shh_dont_log_this',
          encryption_key: 'my-aes-key',
        },
      });

      logger.logThirdPartyRequest({
        target: 'GITHUB_OAUTH',
        method: 'POST',
        url: 'https://github.com/login/oauth/access_token',
        body: {
          client_id: 'gh_app_123',
          client_secret: 'gh_app_secret_456',
        },
      });

      logger.logThirdPartyResponse({
        target: 'GITHUB_OAUTH',
        method: 'POST',
        url: 'https://github.com/login/oauth/access_token',
        statusCode: 200,
        durationMs: 142,
        responseSnippet: {
          access_token: 'ghu_shortLivedUserToken789',
          scope: 'read:user',
        },
      });
    });

    // Wait a brief moment for stream write
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(fs.existsSync(testLogPath), 'Log file must be created on disk');
    const content = fs.readFileSync(testLogPath, 'utf8');
    const lines = content.trim().split('\n');

    assert.strictEqual(lines.length, 3, 'Must have recorded 3 log entries');

    // Parse each line as valid JSON
    for (const line of lines) {
      const entry = JSON.parse(line);
      assert.strictEqual(entry.traceId, 'trc_test_999');
      assert.strictEqual(entry.client?.userId, 'usr_charlie');
      assert.ok(entry.timestamp, 'Entry must have timestamp');

      // CRITICAL: Ensure zero leaks in log file
      assert.ok(!line.includes('shh_dont_log_this'), 'Sensitive client_secret leaked into log file!');
      assert.ok(!line.includes('my-aes-key'), 'Sensitive encryption_key leaked into log file!');
      assert.ok(!line.includes('gh_app_secret_456'), 'GitHub OAuth secret leaked into log file!');
      assert.ok(!line.includes('ghu_shortLivedUserToken789'), 'Access token leaked into log file!');
    }

    // Clean up test file
    fs.unlinkSync(testLogPath);
    delete process.env.LOG_FILE_PATH;
  });

  // --------------------------------------------------------------------------
  // Group 4: ThirdPartyHttpService & Retries
  // --------------------------------------------------------------------------
  await test('ThirdPartyHttpService propagates traceId in headers', async () => {
    const logger = new AppJsonLoggerService();
    const httpService = new ThirdPartyHttpService(logger);

    // Mock global fetch to inspect headers
    const originalFetch = global.fetch;
    let interceptedHeaders: Headers | undefined;

    (global as any).fetch = async (url: string, init?: RequestInit) => {
      interceptedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    try {
      await RequestContextService.run({ traceId: 'trc_http_outbound_test', startTime: Date.now() }, async () => {
        await httpService.get('https://api.github.com/zen');
      });

      assert.ok(interceptedHeaders, 'Outgoing fetch must be called');
      assert.strictEqual(
        interceptedHeaders.get('x-trace-id'),
        'trc_http_outbound_test',
        'Outbound HTTP request must include X-Trace-Id header'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('AppJsonLoggerService logs Gemini prompt, response, tool call, and tool result with redaction', async () => {
    const testLogPath = path.resolve(__dirname, '../../../test-gemini-logging.log.json');
    if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);
    process.env.LOG_FILE_PATH = testLogPath;

    const logger = new AppJsonLoggerService();

    await RequestContextService.run({ traceId: 'trc_gemini_test_1', startTime: Date.now() }, async () => {
      logger.logGeminiPrompt({
        model: 'gemini-1.5-flash',
        turn: 1,
        prompt: 'Analyze repo with api_key=superSecretKey123',
        contents: [{ role: 'user', parts: [{ text: 'secret token=ghp_secretTokenHere1234567890' }] }],
      });

      logger.logGeminiResponse({
        model: 'gemini-1.5-flash',
        turn: 1,
        durationMs: 350,
        functionCalls: [{ name: 'get_repo_overview', args: { token: 'ghp_secretTokenHere1234567890' } }],
      });

      logger.logGeminiToolCall({
        tool: 'get_repo_overview',
        turn: 1,
        params: { client_secret: 'shh_secret_param' },
      });

      logger.logGeminiToolResult({
        tool: 'get_repo_overview',
        turn: 1,
        durationMs: 45,
        result: { name: 'cal.com', authorization: 'Bearer secret_token_xyz' },
      });
    });

    await new Promise((r) => setTimeout(r, 50));

    assert.ok(fs.existsSync(testLogPath), 'Log file must be created on disk');
    const content = fs.readFileSync(testLogPath, 'utf8');
    const lines = content.trim().split('\n');

    assert.strictEqual(lines.length, 4, 'Must have recorded 4 Gemini structured log entries');

    const [promptEntry, respEntry, toolCallEntry, toolResultEntry] = lines.map((l) => JSON.parse(l));

    assert.strictEqual(promptEntry.event, 'GEMINI_PROMPT_OUTGOING');
    assert.strictEqual(respEntry.event, 'GEMINI_RESPONSE_INCOMING');
    assert.strictEqual(toolCallEntry.event, 'GEMINI_TOOL_CALL');
    assert.strictEqual(toolResultEntry.event, 'GEMINI_TOOL_RESULT');

    for (const line of lines) {
      assert.ok(!line.includes('superSecretKey123'), 'Sensitive api_key leaked in Gemini logs!');
      assert.ok(!line.includes('ghp_secretTokenHere1234567890'), 'Sensitive GitHub token leaked in Gemini logs!');
      assert.ok(!line.includes('shh_secret_param'), 'Sensitive client_secret leaked in tool call logs!');
      assert.ok(!line.includes('secret_token_xyz'), 'Bearer token leaked in tool result logs!');
    }

    fs.unlinkSync(testLogPath);
    delete process.env.LOG_FILE_PATH;
  });

  // --------------------------------------------------------------------------
  // Group 5: Concurrency & Idempotency Guards
  // --------------------------------------------------------------------------
  await test('ReportsService idempotently deduplicates rapid duplicate submissions', async () => {
    const userRepo = new UserRepository();
    const reportsService = new ReportsService(userRepo);

    const dto = {
      title: 'Security Check',
      repo: 'calcom/cal.com',
      action: 'security_check',
      content: 'No major security vulnerabilities detected in target entrypoint.',
    };

    // First submission
    const report1 = await reportsService.createReport('usr_alice', dto);
    // Duplicate submission within 1 second (e.g. double click)
    const report2 = await reportsService.createReport('usr_alice', dto);

    assert.strictEqual(report1.id, report2.id, 'Duplicate rapid submission must return identical report ID');

    const aliceReports = await reportsService.listUserReports('usr_alice');
    assert.strictEqual(aliceReports.length, 1, 'Only one report record should exist in repository');
  });

  await test('FolderPickerService shares in-flight dialog promise', async () => {
    const pickerService = new FolderPickerService();

    // Stub executeOpenFolderDialog to test in-flight promise deduplication headlessly
    (pickerService as any).executeOpenFolderDialog = async (repoName: string) => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        selectedPath: `/mock/path/${repoName}`,
        cancelled: false,
        defaultPath: `/mock/path/${repoName}`,
      };
    };

    // Trigger two dialog requests simultaneously
    const promise1 = pickerService.openFolderDialog('my-repo');
    const promise2 = pickerService.openFolderDialog('my-repo');

    // Both should refer to the exact same in-flight Promise instance
    assert.strictEqual(promise1, promise2, 'Concurrent picker requests must share the active promise instance');

    const res1 = await promise1;
    const res2 = await promise2;
    assert.strictEqual(res1.defaultPath, res2.defaultPath);
  });

  console.log('\n========================================================');
  console.log(`📊 Logging & Idempotency Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLoggerAndIdempotencyTests();
