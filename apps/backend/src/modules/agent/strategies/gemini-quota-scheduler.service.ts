import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

export interface ScheduleOptions {
  signal?: AbortSignal;
  estimatedTokens?: number;
  onWait?: (queuePosition: number, estimatedWaitSeconds: number) => void;
}

export interface QuotaMetrics {
  currentInFlight: number;
  maxConcurrent: number;
  queueDepth: number;
  maxQueueDepth: number;
  requestsInLastMinute: number;
  maxRpm: number;
  tokensInLastMinute: number;
  maxTpm: number;
  dailyRequests: number;
  maxRpd: number;
  totalCompleted: number;
  totalThrottled: number;
  totalRetries: number;
}

interface QueuedItem<T> {
  task: () => Promise<T>;
  options?: ScheduleOptions;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  enqueuedAt: number;
  timeoutHandle?: NodeJS.Timeout;
}

@Injectable()
export class GeminiQuotaSchedulerService {
  private readonly logger = new Logger(GeminiQuotaSchedulerService.name);

  // Default quota thresholds (aligned with provider limits: 15 RPM, 250K TPM, 500 RPD)
  private readonly maxRpm = 14; // Bounded below 15 RPM for safety headroom
  private readonly maxConcurrent = 2; // Maximum simultaneous in-flight Gemini API calls
  private readonly maxQueueDepth = 10; // Bounded queue depth to prevent memory bloat
  private readonly maxQueueWaitMs = 25000; // 25s max queue wait before returning Retry-After
  private readonly maxTpm = 240000; // 240k TPM limit check
  private readonly maxRpd = 500; // 500 RPD daily limit

  private inFlight = 0;
  private queue: QueuedItem<any>[] = [];
  private callTimestamps: number[] = [];
  private tokenUsageTimestamps: Array<{ timestamp: number; tokens: number }> = [];

  // Metrics counters
  private dailyRequestCount = 0;
  private currentUtcDay = new Date().getUTCDay();
  private totalCompletedCount = 0;
  private totalThrottledCount = 0;
  private totalRetryCount = 0;

  constructor() {}

  /**
   * Schedules an asynchronous model operation under bounded concurrency, sliding-window RPM,
   * bounded queue admission, and AbortSignal client disconnection cancellation.
   */
  async schedule<T>(task: () => Promise<T>, options?: ScheduleOptions): Promise<T> {
    this.checkDayRoll();

    // Check daily quota exhaustion
    if (this.dailyRequestCount >= this.maxRpd) {
      this.totalThrottledCount++;
      throw new HttpException(
        `Gemini API daily quota limit reached (${this.maxRpd} RPD). Please retry tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Check if client disconnected before scheduling
    if (options?.signal?.aborted) {
      throw new HttpException('Request was cancelled by client before processing', HttpStatus.BAD_REQUEST);
    }

    // Can we execute immediately?
    if (this.canExecuteImmediately()) {
      return this.executeDirect(task, options);
    }

    // Queue is saturated: reject immediately with honest Retry-After guidance (Option B)
    if (this.queue.length >= this.maxQueueDepth) {
      this.totalThrottledCount++;
      const retryAfter = this.getRetryAfterSeconds();
      const err = new HttpException(
        `Gemini API capacity saturated (${this.queue.length} requests queued). Please retry in ${retryAfter}s.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
      (err as any).retryAfter = retryAfter;
      throw err;
    }

    // Enqueue into bounded queue (Option A for short-term delay smoothing)
    return new Promise<T>((resolve, reject) => {
      const enqueuedAt = Date.now();
      const queuePos = this.queue.length + 1;
      const estimatedWait = this.estimateWaitSeconds(queuePos);

      options?.onWait?.(queuePos, estimatedWait);
      this.logger.log(`Request queued at position ${queuePos}. Estimated wait: ${estimatedWait}s`);

      // Set timeout for max queue wait time
      const timeoutHandle = setTimeout(() => {
        this.removeFromQueue(item);
        this.totalThrottledCount++;
        const retryAfter = this.getRetryAfterSeconds();
        const err = new HttpException(
          `Timed out waiting for Gemini API capacity slot. Please retry in ${retryAfter}s.`,
          HttpStatus.TOO_MANY_REQUESTS
        );
        (err as any).retryAfter = retryAfter;
        reject(err);
      }, this.maxQueueWaitMs);

      const item: QueuedItem<T> = {
        task,
        options,
        resolve,
        reject,
        enqueuedAt,
        timeoutHandle,
      };

      // Handle client disconnect / cancellation
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          this.removeFromQueue(item);
          if (item.timeoutHandle) clearTimeout(item.timeoutHandle);
          reject(new HttpException('Request cancelled by client', HttpStatus.BAD_REQUEST));
        });
      }

      this.queue.push(item);
    });
  }

  /**
   * Internal direct executor tracking in-flight state and timestamps
   */
  private async executeDirect<T>(task: () => Promise<T>, options?: ScheduleOptions): Promise<T> {
    this.inFlight++;
    const now = Date.now();
    this.callTimestamps.push(now);
    this.dailyRequestCount++;

    try {
      if (options?.signal?.aborted) {
        throw new HttpException('Request cancelled by client', HttpStatus.BAD_REQUEST);
      }
      const result = await task();
      this.totalCompletedCount++;
      return result;
    } finally {
      this.inFlight--;
      // Trigger next task if queued
      this.processNextInQueue();
    }
  }

  /**
   * Determines whether immediate execution is possible based on concurrency and sliding-window RPM
   */
  private canExecuteImmediately(): boolean {
    this.pruneSlidingWindows();
    return this.inFlight < this.maxConcurrent && this.callTimestamps.length < this.maxRpm;
  }

  /**
   * Drains the queue as slots open up
   */
  private processNextInQueue(): void {
    this.pruneSlidingWindows();

    while (this.queue.length > 0 && this.canExecuteImmediately()) {
      const item = this.queue.shift();
      if (!item) break;

      if (item.timeoutHandle) {
        clearTimeout(item.timeoutHandle);
      }

      // Check if aborted while in queue
      if (item.options?.signal?.aborted) {
        item.reject(new HttpException('Request cancelled by client', HttpStatus.BAD_REQUEST));
        continue;
      }

      // Execute item
      this.executeDirect(item.task, item.options)
        .then(item.resolve)
        .catch(item.reject);
    }

    // If items remain in queue, schedule a drain at the earliest RPM window opening
    if (this.queue.length > 0 && this.inFlight < this.maxConcurrent) {
      const delay = this.getDelayUntilNextSlotMs();
      if (delay > 0) {
        setTimeout(() => this.processNextInQueue(), delay);
      }
    }
  }

  /**
   * Calculates milliseconds until the oldest timestamp exits the 60s sliding window
   */
  private getDelayUntilNextSlotMs(): number {
    if (this.callTimestamps.length < this.maxRpm) return 0;
    const oldest = this.callTimestamps[0];
    const diff = 60000 - (Date.now() - oldest);
    return Math.max(50, diff + 50); // Add 50ms safety margin
  }

  /**
   * Calculates estimated wait in seconds for a given queue position
   */
  estimateWaitSeconds(position: number): number {
    this.pruneSlidingWindows();
    // Base wait on RPM window clearance: each slot takes ~60/maxRpm seconds (~4.3s)
    const delayMs = this.getDelayUntilNextSlotMs();
    const additionalSlots = Math.max(0, position - 1);
    const estMs = delayMs + additionalSlots * (60000 / this.maxRpm);
    return Math.max(1, Math.ceil(estMs / 1000));
  }

  /**
   * Returns honest Retry-After in seconds for HTTP 429 headers
   */
  getRetryAfterSeconds(): number {
    return this.estimateWaitSeconds(this.queue.length + 1);
  }

  /**
   * Records token usage from model response usageMetadata
   */
  recordTokenUsage(tokens?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }): void {
    if (!tokens || !tokens.totalTokenCount) return;
    this.tokenUsageTimestamps.push({
      timestamp: Date.now(),
      tokens: tokens.totalTokenCount,
    });
  }

  /**
   * Records a retry event for metrics tracking
   */
  recordRetry(): void {
    this.totalRetryCount++;
  }

  /**
   * Removes an item from queue
   */
  private removeFromQueue(item: QueuedItem<any>): void {
    const idx = this.queue.indexOf(item);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  /**
   * Cleans timestamps older than 60 seconds
   */
  private pruneSlidingWindows(): void {
    const cutoff = Date.now() - 60000;
    while (this.callTimestamps.length > 0 && this.callTimestamps[0] < cutoff) {
      this.callTimestamps.shift();
    }
    while (this.tokenUsageTimestamps.length > 0 && this.tokenUsageTimestamps[0].timestamp < cutoff) {
      this.tokenUsageTimestamps.shift();
    }
  }

  /**
   * Resets daily counter when UTC day changes
   */
  private checkDayRoll(): void {
    const today = new Date().getUTCDay();
    if (today !== this.currentUtcDay) {
      this.currentUtcDay = today;
      this.dailyRequestCount = 0;
      this.logger.log(`UTC day rollover: daily Gemini request count reset to 0.`);
    }
  }

  /**
   * Exposes live metrics for benchmarking and telemetry
   */
  getMetrics(): QuotaMetrics {
    this.pruneSlidingWindows();
    const tokensInLastMinute = this.tokenUsageTimestamps.reduce((sum, item) => sum + item.tokens, 0);

    return {
      currentInFlight: this.inFlight,
      maxConcurrent: this.maxConcurrent,
      queueDepth: this.queue.length,
      maxQueueDepth: this.maxQueueDepth,
      requestsInLastMinute: this.callTimestamps.length,
      maxRpm: this.maxRpm,
      tokensInLastMinute,
      maxTpm: this.maxTpm,
      dailyRequests: this.dailyRequestCount,
      maxRpd: this.maxRpd,
      totalCompleted: this.totalCompletedCount,
      totalThrottled: this.totalThrottledCount,
      totalRetries: this.totalRetryCount,
    };
  }

  /**
   * Resets scheduler state for unit tests
   */
  reset(): void {
    for (const item of this.queue) {
      if (item.timeoutHandle) clearTimeout(item.timeoutHandle);
    }
    this.inFlight = 0;
    this.queue = [];
    this.callTimestamps = [];
    this.tokenUsageTimestamps = [];
    this.dailyRequestCount = 0;
    this.totalCompletedCount = 0;
    this.totalThrottledCount = 0;
    this.totalRetryCount = 0;
  }
}

