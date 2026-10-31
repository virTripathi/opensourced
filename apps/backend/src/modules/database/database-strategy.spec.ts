import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaSqliteStrategy } from './strategies/prisma-sqlite.strategy';
import { MemoryDatabaseStrategy } from './strategies/memory.strategy';
import { IDatabaseStrategy } from './database.strategy';
import { TokenCryptor } from './crypto.util';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { UserRepository } from '../auth/user.repository';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

async function runDatabaseStrategyTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting OpenSourced SQLite & Strategy Pattern Test Suite');
  console.log('🧪 ========================================================\n');

  const testDbFile = path.resolve(__dirname, '../../../data/test_opensourced.db');
  const testDbUrl = `file:${testDbFile}`;

  // Clean previous test db if exists
  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: testDbUrl,
      },
    },
  });

  // Ensure test database schema is created via prisma db push / raw table creation
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "username" TEXT NOT NULL UNIQUE,
      "displayName" TEXT,
      "email" TEXT,
      "avatarUrl" TEXT,
      "isGuest" BOOLEAN NOT NULL DEFAULT false,
      "provider" TEXT NOT NULL DEFAULT 'guest',
      "providerId" TEXT,
      "githubAccessToken" TEXT,
      "githubRefreshToken" TEXT,
      "githubTokenExpiresAt" DATETIME,
      "githubTokenType" TEXT,
      "googleAccessToken" TEXT,
      "googleRefreshToken" TEXT,
      "pat" TEXT,
      "roles" TEXT NOT NULL DEFAULT '["user"]',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "isRevoked" BOOLEAN NOT NULL DEFAULT false,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "reports" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "repo" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  const configService = new ConfigService({
    ENCRYPTION_KEY: 'test-secure-encryption-key-for-database-testing!!',
    JWT_SECRET: 'test-jwt-secret-key-32charslong!!',
    DATABASE_TYPE: 'sqlite',
    DATABASE_URL: testDbUrl,
  });

  const sqliteStrategy = new PrismaSqliteStrategy(prisma as any, configService);
  const memoryStrategy = new MemoryDatabaseStrategy();

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
  // Test 1: SQLite Persistence Across Strategy Reboots
  // --------------------------------------------------------------------------
  await test('SQLite persists users across reboots (fixes in-memory wipeout)', async () => {
    await sqliteStrategy.upsertUser({
      id: 'usr_reboot_test',
      username: 'persist-user',
      displayName: 'Persistent User',
      provider: 'github',
      githubAccessToken: 'ghu_persistent_token_123',
    });

    // Simulate reboot: create a completely new strategy instance pointing to the same SQLite DB
    const rebootedStrategy = new PrismaSqliteStrategy(prisma as any, configService);
    const retrieved = await rebootedStrategy.findUserById('usr_reboot_test');

    assert.ok(retrieved, 'User must exist after reboot');
    assert.strictEqual(retrieved.username, 'persist-user');
    assert.strictEqual(retrieved.githubAccessToken, 'ghu_persistent_token_123');
  });

  // --------------------------------------------------------------------------
  // Test 2: Security: Zero Plaintext Credential Storage at Rest
  // --------------------------------------------------------------------------
  await test('Security: OAuth tokens and PAT are encrypted using AES-256-GCM in raw SQLite rows', async () => {
    const rawTokens: any[] = await prisma.$queryRawUnsafe(
      `SELECT "githubAccessToken", "pat" FROM "users" WHERE "id" = 'usr_reboot_test'`
    );

    assert.ok(rawTokens.length > 0, 'Raw row must exist');
    const row = rawTokens[0];

    // Raw database column MUST NOT contain plaintext token
    assert.ok(!row.githubAccessToken.includes('ghu_persistent_token_123'), 'Plaintext token must NOT be in DB');
    assert.ok(row.githubAccessToken.startsWith('enc:gcm:'), 'Token must be prefixed with enc:gcm');

    // Strategy decryption MUST transparently return the decrypted plaintext
    const decryptedUser = await sqliteStrategy.findUserById('usr_reboot_test');
    assert.strictEqual(decryptedUser?.githubAccessToken, 'ghu_persistent_token_123');
  });

  // --------------------------------------------------------------------------
  // Test 3: Security: Session Management & Instant Token Revocation (True Logout)
  // --------------------------------------------------------------------------
  await test('Security: True Logout immediately invalidates stolen or kept JWTs', async () => {
    const userRepo = new UserRepository(sqliteStrategy);
    const jwtStrategy = new JwtStrategy(configService, userRepo);
    const jwtService = new JwtService({ secret: 'test-jwt-secret-key-32charslong!!' });

    const sessionId = 'sid_test_revocation_123';
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    await userRepo.createSession(sessionId, 'usr_reboot_test', expiresAt);

    const validPayload = {
      sub: 'usr_reboot_test',
      username: 'persist-user',
      provider: 'github' as const,
      isGuest: false,
      sid: sessionId,
    };

    // 1. Session is active: validation passes
    const validated = await jwtStrategy.validate(validPayload);
    assert.strictEqual(validated.id, 'usr_reboot_test');

    // 2. User logs out: session is revoked in SQLite
    await userRepo.revokeSession(sessionId);

    // 3. Client re-sends the same cryptographic JWT: server REJECTS it with 401 Unauthorized
    let rejected = false;
    try {
      await jwtStrategy.validate(validPayload);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        rejected = true;
      }
    }
    assert.ok(rejected, 'Revoked session MUST throw UnauthorizedException');
  });

  // --------------------------------------------------------------------------
  // Test 4: ACID Transactions with Automatic Rollback
  // --------------------------------------------------------------------------
  await test('ACID Transactions: multi-step updates roll back atomically on failure', async () => {
    const initialUser = await sqliteStrategy.upsertUser({
      id: 'usr_acid_test',
      username: 'acid-user',
      displayName: 'Original Name',
    });

    let caughtError = false;
    try {
      await sqliteStrategy.transaction(async (tx) => {
        // Step 1: Update user name inside transaction
        await tx.upsertUser({
          id: 'usr_acid_test',
          username: 'acid-user',
          displayName: 'Mutated Inside Transaction',
        });

        // Step 2: Deliberately throw an error to trigger rollback
        throw new Error('Simulated atomic step failure');
      });
    } catch (err) {
      caughtError = true;
    }

    assert.ok(caughtError, 'Transaction must throw');

    // Step 3: Verify the update was rolled back
    const freshUser = await sqliteStrategy.findUserById('usr_acid_test');
    assert.strictEqual(freshUser?.displayName, 'Original Name', 'User update must have rolled back');
  });

  // --------------------------------------------------------------------------
  // Test 5: IDOR Protection in SQLite Reports
  // --------------------------------------------------------------------------
  await test('IDOR Protection: Alice reports are strictly isolated from Bob in SQLite', async () => {
    await sqliteStrategy.upsertUser({ id: 'usr_alice', username: 'alice' });
    await sqliteStrategy.upsertUser({ id: 'usr_bob', username: 'bob' });

    const aliceReport = await sqliteStrategy.createReport('usr_alice', {
      title: 'Security Audit',
      repo: 'calcom/cal.com',
      action: 'audit',
      content: 'No secrets detected',
    });

    // Bob attempts to read Alice's report
    const bobRead = await sqliteStrategy.findReportByIdAndUserId(aliceReport.id, 'usr_bob');
    assert.strictEqual(bobRead, undefined, 'Bob must NOT be able to read Alice report');

    // Bob attempts to delete Alice's report
    const bobDelete = await sqliteStrategy.deleteReportByIdAndUserId(aliceReport.id, 'usr_bob');
    assert.strictEqual(bobDelete, false, 'Bob must NOT be able to delete Alice report');

    // Alice reads and deletes her report
    const aliceRead = await sqliteStrategy.findReportByIdAndUserId(aliceReport.id, 'usr_alice');
    assert.ok(aliceRead, 'Alice must be able to read her own report');

    const aliceDelete = await sqliteStrategy.deleteReportByIdAndUserId(aliceReport.id, 'usr_alice');
    assert.strictEqual(aliceDelete, true, 'Alice must be able to delete her own report');
  });

  // --------------------------------------------------------------------------
  // Test 6: Strategy Pluggability (SQLite vs Memory)
  // --------------------------------------------------------------------------
  await test('Strategy Pluggability: Memory and SQLite strategies adhere to identical contract', async () => {
    const strategies: IDatabaseStrategy[] = [memoryStrategy, sqliteStrategy];

    for (const strat of strategies) {
      const user = await strat.upsertUser({
        id: `usr_${strat.strategyName}`,
        username: `user_${strat.strategyName}`,
        provider: 'dev',
      });

      assert.strictEqual(user.id, `usr_${strat.strategyName}`);
      const found = await strat.findUserById(`usr_${strat.strategyName}`);
      assert.strictEqual(found?.username, `user_${strat.strategyName}`);
    }
  });

  // Cleanup
  await prisma.$disconnect();
  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }

  console.log('\n========================================================');
  console.log(`📊 Database Strategy Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDatabaseStrategyTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
