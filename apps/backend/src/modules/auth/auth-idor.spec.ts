import assert from 'assert';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from './user.repository';
import { AuthService } from './auth.service';
import { ReportsService } from './reports.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

async function runAuthAndIdorTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting OpenSourced Auth & IDOR Protection Test Suite');
  console.log('🧪 ========================================================\n');

  const configService = new ConfigService({
    JWT_SECRET: 'test-secure-jwt-secret-key-32charslong!!',
  });

  const jwtService = new JwtService({
    secret: 'test-secure-jwt-secret-key-32charslong!!',
    signOptions: { expiresIn: '1h' },
  });

  const userRepo = new UserRepository();
  const authService = new AuthService(userRepo, jwtService, configService);
  const reportsService = new ReportsService(userRepo);
  const jwtStrategy = new JwtStrategy(configService, userRepo);

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => Promise<void> | void) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ❌ [FAIL] ${name}:`, err.message);
            failed++;
          });
      } else {
        console.log(`  ✅ [PASS] ${name}`);
        passed++;
      }
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // Test 1: Guest Session Creation & JWT Generation
  // --------------------------------------------------------------------------
  await test('Guest session creates unique tenant ID and signed JWT', async () => {
    const session1 = await authService.createGuestSession();
    const session2 = await authService.createGuestSession();

    assert.ok(session1.token, 'Session 1 should have a JWT token');
    assert.ok(session2.token, 'Session 2 should have a JWT token');
    assert.notStrictEqual(session1.user.id, session2.user.id, 'Each guest must have an isolated user ID');
    assert.strictEqual(session1.user.isGuest, true, 'User should be marked as guest');
  });

  // --------------------------------------------------------------------------
  // Test 2: Token Verification & User Extraction
  // --------------------------------------------------------------------------
  await test('JwtStrategy verifies token and resolves authenticated user', async () => {
    const { token, user: guestUser } = await authService.createGuestSession();
    const decoded = jwtService.verify(token);

    const validatedUser = await jwtStrategy.validate(decoded);
    assert.strictEqual(validatedUser.id, guestUser.id, 'Validated user ID must match JWT subject');
  });

  // --------------------------------------------------------------------------
  // Test 3: Zero-Leakage in UserProfile Serialization
  // --------------------------------------------------------------------------
  await test('UserProfile serialization never exposes raw access tokens or secrets', async () => {
    const userWithTokens = await userRepo.upsertUser({
      id: 'usr_secret_leak_test',
      username: 'security-tester',
      provider: 'github',
      githubAccessToken: 'gho_extremely_secret_token_12345',
      googleAccessToken: 'ya29.extremely_secret_google_token_67890',
      googleRefreshToken: '1//refresh_token_very_secret',
      pat: 'ghp_personal_access_token_super_secret',
    });

    const profile = authService.toProfile(userWithTokens);

    assert.strictEqual((profile as any).githubAccessToken, undefined, 'githubAccessToken must not be in UserProfile');
    assert.strictEqual((profile as any).googleAccessToken, undefined, 'googleAccessToken must not be in UserProfile');
    assert.strictEqual((profile as any).googleRefreshToken, undefined, 'googleRefreshToken must not be in UserProfile');
    assert.strictEqual((profile as any).pat, undefined, 'Raw PAT must never be exposed in UserProfile');
    assert.strictEqual(profile.githubConnected, true, 'githubConnected should be true');
    assert.strictEqual(profile.googleConnected, true, 'googleConnected should be true');
    assert.strictEqual(profile.hasPat, true, 'hasPat indicator should be true');
  });

  // --------------------------------------------------------------------------
  // Test 4: Dev Login Multi-User Simulation
  // --------------------------------------------------------------------------
  const aliceSession = await authService.devLogin({ username: 'alice' });
  const bobSession = await authService.devLogin({ username: 'bob' });

  await test('Alice and Bob have separate, isolated accounts', () => {
    assert.notStrictEqual(aliceSession.user.id, bobSession.user.id);
    assert.strictEqual(aliceSession.user.username, 'alice');
    assert.strictEqual(bobSession.user.username, 'bob');
  });

  // --------------------------------------------------------------------------
  // Test 5: Resource Creation Bound Strictly to User
  // --------------------------------------------------------------------------
  const aliceReport1 = await reportsService.createReport(aliceSession.user.id, {
    title: 'Cal.com OAuth Expiration Analysis',
    repo: 'calcom/cal.com',
    action: 'scan_issue',
    content: 'Identified entrypoints in packages/core/auth.ts lines 45-80',
  });

  const aliceReport2 = await reportsService.createReport(aliceSession.user.id, {
    title: 'Supabase OWASP Pre-Flight Check',
    repo: 'supabase/supabase',
    action: 'owasp_check',
    content: 'Security rating: SECURE. No SSRF or Injection found.',
  });

  await test('Alice reports are bound to Alice user ID', () => {
    assert.strictEqual(aliceReport1.userId, aliceSession.user.id);
    assert.strictEqual(aliceReport2.userId, aliceSession.user.id);
  });

  // --------------------------------------------------------------------------
  // Test 6: Alice Can Access Her Own Reports
  // --------------------------------------------------------------------------
  await test('Alice can list and retrieve her own reports', async () => {
    const list = await reportsService.listUserReports(aliceSession.user.id);
    assert.strictEqual(list.length, 2, 'Alice should see exactly 2 reports');

    const fetched = await reportsService.getReportById(aliceReport1.id, aliceSession.user.id);
    assert.strictEqual(fetched.id, aliceReport1.id);
    assert.strictEqual(fetched.title, 'Cal.com OAuth Expiration Analysis');
  });

  // --------------------------------------------------------------------------
  // Test 7: IDOR Attack Prevention 1 (Horizontal Cross-Tenant Read)
  // Bob attempts to fetch Alice's report using its ID
  // --------------------------------------------------------------------------
  await test('🚨 IDOR DEFENSE: Bob is BLOCKED from reading Alice report by ID', async () => {
    let errorThrown: any = null;
    try {
      // Bob passes aliceReport1.id with bobSession.user.id
      await reportsService.getReportById(aliceReport1.id, bobSession.user.id);
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'System must reject Bob access to Alice report');
    assert.ok(
      errorThrown instanceof NotFoundException,
      'System must throw NotFoundException to prevent ID enumeration attacks'
    );
  });

  // --------------------------------------------------------------------------
  // Test 8: IDOR Attack Prevention 2 (List Isolation)
  // Bob lists reports - must see 0 reports, NEVER Alice's reports
  // --------------------------------------------------------------------------
  await test('🚨 IDOR DEFENSE: Bob listing reports sees zero of Alice reports', async () => {
    const bobReports = await reportsService.listUserReports(bobSession.user.id);
    assert.strictEqual(bobReports.length, 0, 'Bob must have 0 reports');
  });

  // --------------------------------------------------------------------------
  // Test 9: IDOR Attack Prevention 3 (Cross-Tenant Deletion)
  // Bob attempts to delete Alice's report
  // --------------------------------------------------------------------------
  await test('🚨 IDOR DEFENSE: Bob is BLOCKED from deleting Alice report', async () => {
    let errorThrown: any = null;
    try {
      await reportsService.deleteReportById(aliceReport1.id, bobSession.user.id);
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Deletion attempt by non-owner must be rejected');
    assert.ok(errorThrown instanceof NotFoundException);

    // Verify Alice's report was NOT deleted
    const stillExists = await reportsService.getReportById(aliceReport1.id, aliceSession.user.id);
    assert.ok(stillExists, "Alice's report must remain intact after unauthorized delete attempt");
  });

  // --------------------------------------------------------------------------
  // Test 10: Legitimate Deletion by Owner
  // --------------------------------------------------------------------------
  await test('Alice can legitimately delete her own report', async () => {
    const res = await reportsService.deleteReportById(aliceReport2.id, aliceSession.user.id);
    assert.strictEqual(res.success, true);

    const aliceReportsNow = await reportsService.listUserReports(aliceSession.user.id);
    assert.strictEqual(aliceReportsNow.length, 1);
  });

  // --------------------------------------------------------------------------
  // Test 11: Multi-Tenant PAT Isolation
  // --------------------------------------------------------------------------
  await test('PAT configuration is strictly tenant-scoped and masked', async () => {
    await authService.savePat(aliceSession.user.id, 'ghp_aliceSecretPat1234567890');

    const alicePat = await authService.getPatStatus(aliceSession.user.id);
    assert.strictEqual(alicePat.hasPat, true);
    assert.strictEqual(alicePat.maskedPat, 'ghp_...7890', 'PAT must be masked in preview');

    const bobPat = await authService.getPatStatus(bobSession.user.id);
    assert.strictEqual(bobPat.hasPat, false, 'Bob must have no PAT');
    assert.strictEqual(bobPat.maskedPat, undefined);
  });

  // --------------------------------------------------------------------------
  // Test 12: Invalid JWT Subject Rejection
  // --------------------------------------------------------------------------
  await test('JwtStrategy rejects token with missing subject', async () => {
    let err: any = null;
    try {
      await jwtStrategy.validate({} as any);
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof UnauthorizedException);
  });

  // --------------------------------------------------------------------------
  // Test 13: OWASP A01 / Anti-Open-Redirect Defense
  // --------------------------------------------------------------------------
  await test('🚨 OWASP A01 DEFENSE: Open redirect attempts are blocked and normalized to safe origins', () => {
    const authController = new (require('./auth.controller').AuthController)(authService, configService);
    const validate = (url: string) => (authController as any).validateSafeRedirectUrl(url);

    // Malicious attacker URLs must be rejected and normalized to default safe target
    assert.strictEqual(
      validate('https://evil-attacker.com/steal-token'),
      'http://localhost:8000/api/auth/session',
      'Attacker external URL must be rejected'
    );
    assert.strictEqual(
      validate('javascript:alert(1)'),
      'http://localhost:8000/api/auth/session',
      'Javascript pseudo-protocol must be rejected'
    );

    // Approved extension origins must be permitted
    const extOAuthUrl = 'https://abcdefghijklmnop.chromiumapp.org/oauth';
    assert.strictEqual(validate(extOAuthUrl), extOAuthUrl, 'Chrome Extension OAuth redirect URL must be permitted');

    const extDirectUrl = 'chrome-extension://abcdefghijklmnop/index.html';
    assert.strictEqual(validate(extDirectUrl), extDirectUrl, 'Chrome Extension direct URL must be permitted');

    const localUrl = 'http://localhost:3000/callback';
    assert.strictEqual(validate(localUrl), localUrl, 'Local developer redirect must be permitted');
  });

  // --------------------------------------------------------------------------
  // Test 14: OWASP A03 / Git Option Injection Defense
  // --------------------------------------------------------------------------
  await test('🚨 OWASP A03 DEFENSE: Git clone rejects malicious option flag URLs', () => {
    return new Promise<void>((resolve, reject) => {
      const gitService = new (require('../git/git.service').GitService)();

      gitService
        .cloneRepository({
          repoUrl: '--upload-pack=malicious_cmd',
          owner: 'attacker',
          repo: 'pwn',
          autoOpenVsCode: false,
        })
        .subscribe((event: any) => {
          if (event.type === 'PIPELINE_ERROR') {
            try {
              assert.ok(
                event.message.includes('Invalid or unsafe repository URL'),
                'Must block URLs starting with -'
              );
              resolve();
            } catch (e) {
              reject(e);
            }
          }
        });
    });
  });

  // --------------------------------------------------------------------------
  // Test 15: OWASP A01 / Path Traversal Defense
  // --------------------------------------------------------------------------
  await test('🚨 OWASP A01 DEFENSE: Git clone blocks destination path traversal into system directories', () => {
    return new Promise<void>((resolve, reject) => {
      const gitService = new (require('../git/git.service').GitService)();

      gitService
        .cloneRepository({
          repoUrl: 'https://github.com/calcom/cal.com.git',
          owner: 'calcom',
          repo: 'cal.com',
          destinationPath: '/etc',
          autoOpenVsCode: false,
        })
        .subscribe((event: any) => {
          if (event.type === 'PIPELINE_ERROR') {
            try {
              assert.ok(
                event.message.includes('restricted system path'),
                'Must block cloning into /etc'
              );
              resolve();
            } catch (e) {
              reject(e);
            }
          }
        });
    });
  });

  // --------------------------------------------------------------------------
  // Test 16: GitHub App Token Lifecycle & Persistence
  // --------------------------------------------------------------------------
  await test('GitHub App token lifecycle: stores short-lived access token, refresh token & metadata', async () => {
    const expiresAt = new Date(Date.now() + 28800 * 1000); // 8 hours
    const user = await userRepo.upsertUser({
      id: 'gh_999999',
      username: 'octo-contributor',
      provider: 'github',
      providerId: '999999',
      githubAccessToken: 'ghu_fake_user_access_token_123',
      githubRefreshToken: 'ghr_fake_refresh_token_456',
      githubTokenExpiresAt: expiresAt,
      githubTokenType: 'user_to_server',
    });

    assert.strictEqual(user.githubAccessToken, 'ghu_fake_user_access_token_123');
    assert.strictEqual(user.githubRefreshToken, 'ghr_fake_refresh_token_456');
    assert.strictEqual(user.githubTokenType, 'user_to_server');
    assert.strictEqual(user.githubTokenExpiresAt?.getTime(), expiresAt.getTime());

    // Profile serialization must NEVER expose githubAccessToken or githubRefreshToken
    const profile = authService.toProfile(user);
    assert.strictEqual(profile.githubConnected, true);
    assert.strictEqual((profile as any).githubAccessToken, undefined);
    assert.strictEqual((profile as any).githubRefreshToken, undefined);
  });

  // --------------------------------------------------------------------------
  // Test 17: getValidGitHubToken returns active token & respects PAT precedence
  // --------------------------------------------------------------------------
  await test('getValidGitHubToken: returns valid token and respects PAT priority', async () => {
    // Active token with plenty of time remaining
    const token = await authService.getValidGitHubToken('gh_999999');
    assert.strictEqual(token, 'ghu_fake_user_access_token_123');

    // If user sets a PAT, PAT takes priority over GitHub App user token
    await userRepo.upsertUser({
      id: 'gh_999999',
      pat: 'ghp_custom_personal_access_token',
    });

    const patToken = await authService.getValidGitHubToken('gh_999999');
    assert.strictEqual(patToken, 'ghp_custom_personal_access_token');
  });

  console.log('\n========================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthAndIdorTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
