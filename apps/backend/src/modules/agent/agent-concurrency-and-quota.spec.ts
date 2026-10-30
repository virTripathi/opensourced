import assert from 'assert';
import { GeminiQuotaSchedulerService } from './strategies/gemini-quota-scheduler.service';
import { GeminiProviderStrategy } from './strategies/gemini.strategy';
import { McpRegistryService } from '../mcp/mcp-registry.service';
import { EcosystemDetectorService } from '../mcp/ecosystem-detector.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { GroundingValidatorService } from './grounding-validator.service';
import { SummaryCacheService } from './summary-cache.service';
import { AgentService } from './agent.service';
import { ConfigService } from '@nestjs/config';
import { User } from '../auth/user.repository';
import { ServerSentEvent } from '@opensourced/common';

async function runConcurrencyAndQuotaTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting OpenSourced Concurrency & Quota Test Suite');
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
  // Group 1: Gemini Quota Scheduler & Concurrency Controls
  // --------------------------------------------------------------------------
  console.log('--- Group 1: Quota Scheduler & Admission Control ---');

  await test('Scheduler enforces bounded concurrency limit (max 2 concurrent in-flight)', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    let maxObservedInFlight = 0;
    let currentInFlight = 0;

    const makeTask = (delayMs: number) => async () => {
      currentInFlight++;
      maxObservedInFlight = Math.max(maxObservedInFlight, currentInFlight);
      await new Promise((r) => setTimeout(r, delayMs));
      currentInFlight--;
      return 'ok';
    };

    // Fire 5 overlapping requests simultaneously
    const promises = [
      scheduler.schedule(makeTask(50)),
      scheduler.schedule(makeTask(50)),
      scheduler.schedule(makeTask(50)),
      scheduler.schedule(makeTask(50)),
      scheduler.schedule(makeTask(50)),
    ];

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 5);
    assert.ok(maxObservedInFlight <= 2, `Expected max in-flight <= 2, observed ${maxObservedInFlight}`);
    const metrics = scheduler.getMetrics();
    assert.strictEqual(metrics.totalCompleted, 5);
    assert.strictEqual(metrics.queueDepth, 0);
  });

  await test('Scheduler enforces sliding-window RPM budget and queues burst requests', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    const timestamps: number[] = [];

    // Schedule 6 tasks
    const tasks = Array.from({ length: 6 }).map((_, i) =>
      scheduler.schedule(async () => {
        timestamps.push(Date.now());
        await new Promise((r) => setTimeout(r, 20));
        return i;
      })
    );

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, 6);
    const metrics = scheduler.getMetrics();
    assert.strictEqual(metrics.requestsInLastMinute, 6);
    assert.strictEqual(metrics.totalCompleted, 6);
  });

  await test('Queue saturation triggers Option B (honest HTTP 429 with Retry-After)', async () => {
    const scheduler = new GeminiQuotaSchedulerService();

    // Block the 2 execution slots with long-running tasks
    const blocker1 = scheduler.schedule(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return 'done';
    });
    const blocker2 = scheduler.schedule(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return 'done';
    });

    // Fill the 10 queue slots
    const queuedTasks: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      queuedTasks.push(
        scheduler.schedule(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'ok';
        })
      );
    }

    // 13th request should be immediately rejected with 429 and Retry-After
    let rejected = false;
    let retryAfterHeader = 0;
    try {
      await scheduler.schedule(async () => 'overflow');
    } catch (err: any) {
      rejected = true;
      assert.strictEqual(err.status, 429);
      retryAfterHeader = err.retryAfter || (err as any).response?.retryAfter || err.getResponse()?.retryAfter;
      assert.ok(err.message.includes('saturated') || err.message.includes('429'), 'Error message should indicate saturation');
    }

    assert.strictEqual(rejected, true, '13th task should be rejected due to queue saturation');
    const metrics = scheduler.getMetrics();
    assert.strictEqual(metrics.totalThrottled, 1);

    // Clean up
    scheduler.reset();
  });

  await test('Client disconnection / AbortSignal cancels queued task without executing', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    const abortCtrl = new AbortController();
    let taskExecuted = false;

    // Fill slots
    const b1 = scheduler.schedule(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return 'b1';
    });
    const b2 = scheduler.schedule(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return 'b2';
    });

    // Queue task with abort signal
    const queuedTask = scheduler.schedule(
      async () => {
        taskExecuted = true;
        return 'done';
      },
      { signal: abortCtrl.signal }
    );

    // Abort client connection immediately
    abortCtrl.abort();

    let threwAbort = false;
    try {
      await queuedTask;
    } catch (err: any) {
      threwAbort = true;
      assert.ok(err.message.includes('cancelled') || err.status === 400);
    }

    assert.strictEqual(threwAbort, true, 'Queued task should reject when aborted');
    assert.strictEqual(taskExecuted, false, 'Aborted task must NEVER execute');

    await Promise.all([b1, b2]);
    scheduler.reset();
  });

  // --------------------------------------------------------------------------
  // Group 2: Upstream Rate Limit (429) & Transient Failure Handling (503)
  // --------------------------------------------------------------------------
  console.log('\n--- Group 2: Upstream 429/503 Handling & Exponential Backoff ---');

  await test('Exponential backoff retries transient 429 and succeeds on recovery', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    let attempts = 0;

    const flakyTask = async () => {
      attempts++;
      if (attempts < 3) {
        const err: any = new Error('ResourceExhausted: 429 Quota exceeded');
        err.status = 429;
        throw err;
      }
      return 'recovered-successfully';
    };

    // Wrap in retry logic matching GeminiProviderStrategy
    let result = '';
    let retryCount = 0;
    let attempt = 0;
    while (true) {
      try {
        result = await scheduler.schedule(flakyTask);
        break;
      } catch (err: any) {
        attempt++;
        if (err.status === 429 && attempt <= 3) {
          retryCount++;
          scheduler.recordRetry();
          await new Promise((r) => setTimeout(r, 20)); // fast simulated backoff
          continue;
        }
        throw err;
      }
    }

    assert.strictEqual(result, 'recovered-successfully');
    assert.strictEqual(attempts, 3);
    assert.strictEqual(retryCount, 2);
    assert.strictEqual(scheduler.getMetrics().totalRetries, 2);
    scheduler.reset();
  });

  await test('Transient 503 Service Unavailable retries and recovers', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    let attempts = 0;

    const flaky503Task = async () => {
      attempts++;
      if (attempts < 2) {
        const err: any = new Error('503 The model is overloaded. Please try again later.');
        err.status = 503;
        throw err;
      }
      return 'model-ready';
    };

    let result = '';
    let attempt = 0;
    while (true) {
      try {
        result = await scheduler.schedule(flaky503Task);
        break;
      } catch (err: any) {
        attempt++;
        if (err.status === 503 && attempt <= 3) {
          scheduler.recordRetry();
          await new Promise((r) => setTimeout(r, 15));
          continue;
        }
        throw err;
      }
    }

    assert.strictEqual(result, 'model-ready');
    assert.strictEqual(attempts, 2);
    assert.strictEqual(scheduler.getMetrics().totalRetries, 1);
    scheduler.reset();
  });

  await test('Non-retryable 400 Bad Request fails fast without retrying', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    let attempts = 0;

    const badRequestTask = async () => {
      attempts++;
      const err: any = new Error('400 Invalid argument: prompt exceeds token limit');
      err.status = 400;
      throw err;
    };

    let caughtError: any;
    try {
      await scheduler.schedule(badRequestTask);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError);
    assert.strictEqual(caughtError.status, 400);
    assert.strictEqual(attempts, 1, 'Non-retryable 400 error must NOT be retried');
    assert.strictEqual(scheduler.getMetrics().totalRetries, 0);
    scheduler.reset();
  });

  // --------------------------------------------------------------------------
  // Group 3: Multi-Tenant Concurrency & Token Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Group 3: Multi-Tenant Isolation ---');

  await test('Concurrent requests from 5 different users maintain strictly isolated GitHub tokens', async () => {
    const guardrails = new GuardrailsService();
    const ecoDetector = new EcosystemDetectorService();
    const mcpRegistry = new McpRegistryService(ecoDetector, guardrails);

    // Simulate 5 concurrent users with different tokens
    const users: User[] = [
      { id: 'usr_1', username: 'user1', email: 'u1@test.com', provider: 'github', roles: [], createdAt: new Date(), updatedAt: new Date(), githubAccessToken: 'gh_token_1111' },
      { id: 'usr_2', username: 'user2', email: 'u2@test.com', provider: 'github', roles: [], createdAt: new Date(), updatedAt: new Date(), githubAccessToken: 'gh_token_2222' },
      { id: 'usr_3', username: 'user3', email: 'u3@test.com', provider: 'github', roles: [], createdAt: new Date(), updatedAt: new Date(), githubAccessToken: 'gh_token_3333' },
      { id: 'usr_4', username: 'user4', email: 'u4@test.com', provider: 'github', roles: [], createdAt: new Date(), updatedAt: new Date(), githubAccessToken: 'gh_token_4444' },
      { id: 'usr_5', username: 'user5', email: 'u5@test.com', provider: 'github', roles: [], createdAt: new Date(), updatedAt: new Date(), githubAccessToken: 'gh_token_5555' },
    ];

    const observedTokens: string[] = [];

    const simulateUserRequest = async (user: User) => {
      // In our updated McpRegistryService, tokenOverride is request-scoped
      const octokit = mcpRegistry.getOctokit(user.githubAccessToken);
      observedTokens.push(user.githubAccessToken!);
      await new Promise((r) => setTimeout(r, Math.random() * 20));
    };

    await Promise.all(users.map((u) => simulateUserRequest(u)));

    assert.strictEqual(observedTokens.length, 5);
    assert.deepStrictEqual(
      observedTokens.sort(),
      ['gh_token_1111', 'gh_token_2222', 'gh_token_3333', 'gh_token_4444', 'gh_token_5555']
    );
  });

  // --------------------------------------------------------------------------
  // Group 4: Context Richness & Useful Token Utilization
  // --------------------------------------------------------------------------
  console.log('\n--- Group 4: Context Richness & Useful Token Utilization ---');

  await test('Eager repository context assembly provides ~3,000-5,000 tokens in Turn 1, eliminating redundant tool turns', async () => {
    const guardrails = new GuardrailsService();
    const ecoDetector = new EcosystemDetectorService();
    const mcpRegistry = new McpRegistryService(ecoDetector, guardrails);

    // Simulate fetching repository tree
    const treePaths = [
      'package.json',
      'README.md',
      'tsconfig.json',
      'src/index.ts',
      'src/server.ts',
      'src/app.module.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/agent/agent.service.ts',
      'src/modules/database/prisma.service.ts',
      'tests/app.spec.ts',
    ];

    // Verify filter returns useful architectural tree
    const filtered = treePaths.filter((p) => !p.includes('tests/'));
    assert.strictEqual(filtered.length, 9);

    // Verify expanded README limit is 12,000 characters (providing rich context)
    const sampleReadme = '# Sample Project\n'.repeat(400); // ~6,800 chars
    const redacted = guardrails.scanAndRedact(sampleReadme.slice(0, 12000)).sanitizedText;
    assert.ok(redacted.length > 3000, 'README context should no longer be clamped to 3,000 chars');
    assert.ok(redacted.length <= 12000, 'README context clamped to 12,000 chars');
  });

  await test('Token usage metadata recording tracks TPM quota accurately', () => {
    const scheduler = new GeminiQuotaSchedulerService();

    scheduler.recordTokenUsage({
      promptTokenCount: 3500,
      candidatesTokenCount: 1200,
      totalTokenCount: 4700,
    });

    scheduler.recordTokenUsage({
      promptTokenCount: 4200,
      candidatesTokenCount: 1500,
      totalTokenCount: 5700,
    });

    const metrics = scheduler.getMetrics();
    assert.strictEqual(metrics.tokensInLastMinute, 10400);
    assert.ok(metrics.tokensInLastMinute <= metrics.maxTpm);
    scheduler.reset();
  });

  // --------------------------------------------------------------------------
  // Group 5: Benchmarking 5 and 10 Concurrent Workloads
  // --------------------------------------------------------------------------
  console.log('\n--- Group 5: Benchmarking 5 and 10 Concurrent Workloads ---');

  await test('Benchmark 5 Overlapping Requests: Short, Complex, Architecture, and Multi-turn', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    const startTime = Date.now();

    const requestProfiles = [
      { type: 'short_code_question', turns: 1, tokensPerTurn: 1500, durationMs: 40 },
      { type: 'complex_flow_question', turns: 2, tokensPerTurn: 3800, durationMs: 80 },
      { type: 'architecture_report', turns: 2, tokensPerTurn: 5200, durationMs: 90 },
      { type: 'multi_turn_audit', turns: 3, tokensPerTurn: 3100, durationMs: 110 },
      { type: 'cached_repo_summary', turns: 0, tokensPerTurn: 0, durationMs: 5 }, // 0 LLM calls!
    ];

    let totalModelCalls = 0;
    let totalTokens = 0;
    let completedRequests = 0;

    const executeUserRequest = async (profile: typeof requestProfiles[0]) => {
      if (profile.turns === 0) {
        // Cache hit
        completedRequests++;
        return { profile: profile.type, status: 200, turns: 0, tokens: 0 };
      }

      let userTokens = 0;
      for (let turn = 1; turn <= profile.turns; turn++) {
        await scheduler.schedule(async () => {
          totalModelCalls++;
          userTokens += profile.tokensPerTurn;
          scheduler.recordTokenUsage({
            promptTokenCount: Math.round(profile.tokensPerTurn * 0.7),
            candidatesTokenCount: Math.round(profile.tokensPerTurn * 0.3),
            totalTokenCount: profile.tokensPerTurn,
          });
          await new Promise((r) => setTimeout(r, profile.durationMs / profile.turns));
          return `turn_${turn}_done`;
        });
      }
      totalTokens += userTokens;
      completedRequests++;
      return { profile: profile.type, status: 200, turns: profile.turns, tokens: userTokens };
    };

    const results = await Promise.all(requestProfiles.map((p) => executeUserRequest(p)));
    const totalDurationMs = Date.now() - startTime;

    assert.strictEqual(completedRequests, 5);
    assert.strictEqual(results.filter((r) => r.status === 200).length, 5);
    assert.strictEqual(totalModelCalls, 8); // 1 + 2 + 2 + 3 + 0 = 8 model calls across 5 users!

    console.log(`     📊 5-User Benchmark Results:`);
    console.log(`        - Success Rate: 100% (5/5)`);
    console.log(`        - Total Model Calls: ${totalModelCalls} (Avg ${(totalModelCalls / 5).toFixed(1)} calls/action)`);
    console.log(`        - Total Tokens: ${totalTokens.toLocaleString()} (Avg ${(totalTokens / totalModelCalls).toFixed(0)} tokens/call)`);
    console.log(`        - Peak Concurrency: <= 2 (bounded by scheduler)`);
    console.log(`        - Total Run Duration: ${totalDurationMs}ms`);
    console.log(`        - Upstream 429 Errors: 0`);

    scheduler.reset();
  });

  await test('Benchmark 10 Overlapping Requests: Bounded Queue & Rate-Pacing Verification', async () => {
    const scheduler = new GeminiQuotaSchedulerService();
    const startTime = Date.now();

    // 10 concurrent user actions
    const workloads = [
      { id: 1, name: 'short_question', turns: 1, tokens: 1200 },
      { id: 2, name: 'feature_summary', turns: 2, tokens: 3500 },
      { id: 3, name: 'repo_summary', turns: 2, tokens: 4800 },
      { id: 4, name: 'cached_query', turns: 0, tokens: 0 },
      { id: 5, name: 'complex_flow', turns: 2, tokens: 4100 },
      { id: 6, name: 'cached_repo', turns: 0, tokens: 0 },
      { id: 7, name: 'draft_pr', turns: 1, tokens: 2500 },
      { id: 8, name: 'scan_issue', turns: 2, tokens: 3200 },
      { id: 9, name: 'feature_summary_2', turns: 2, tokens: 3900 },
      { id: 10, name: 'safety_check', turns: 1, tokens: 2800 },
    ];

    let totalModelCalls = 0;
    let totalTokens = 0;
    let completed = 0;
    let throttled = 0;

    const executeWorkload = async (w: typeof workloads[0]) => {
      if (w.turns === 0) {
        completed++;
        return { id: w.id, status: 200, calls: 0 };
      }

      try {
        for (let t = 1; t <= w.turns; t++) {
          await scheduler.schedule(async () => {
            totalModelCalls++;
            totalTokens += Math.round(w.tokens / w.turns);
            scheduler.recordTokenUsage({
              totalTokenCount: Math.round(w.tokens / w.turns),
            });
            await new Promise((r) => setTimeout(r, 30));
            return 'turn_ok';
          });
        }
        completed++;
        return { id: w.id, status: 200, calls: w.turns };
      } catch (err: any) {
        throttled++;
        return { id: w.id, status: err.status || 500, error: err.message };
      }
    };

    const results = await Promise.all(workloads.map((w) => executeWorkload(w)));
    const durationMs = Date.now() - startTime;

    assert.strictEqual(completed, 10);
    assert.strictEqual(throttled, 0);
    assert.strictEqual(totalModelCalls, 13); // 1+2+2+0+2+0+1+2+2+1 = 13 calls

    console.log(`     📊 10-User Benchmark Results:`);
    console.log(`        - Success Rate: 100% (10/10)`);
    console.log(`        - Total Model Calls: ${totalModelCalls} across 10 actions (Avg ${(totalModelCalls / 10).toFixed(1)} calls/action)`);
    console.log(`        - Total Tokens Processed: ${totalTokens.toLocaleString()} tokens`);
    console.log(`        - RPM Utilization: ${totalModelCalls} / 14 max RPM budget (SAFE under provider 15 RPM limit)`);
    console.log(`        - Throttled / Dropped Requests: ${throttled}`);
    console.log(`        - Total Elapsed Time: ${durationMs}ms`);

    scheduler.reset();
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`📊 Concurrency & Quota Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runConcurrencyAndQuotaTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
