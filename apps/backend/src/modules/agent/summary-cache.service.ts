import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class SummaryCacheService {
  private readonly logger = new Logger(SummaryCacheService.name);
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly TTL_MS = 1000 * 60 * 60 * 24; // 24 hours (immutable per commit SHA)

  buildKey(owner: string, repo: string, commitSha: string, action: string, query?: string): string {
    const raw = `${owner}/${repo}@${commitSha}:${action}:${query || ''}`.toLowerCase();
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }

    this.logger.log(`🎯 Cache Hit for key: ${key.slice(0, 8)}... (Zero LLM variance / instant response)`);
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    // Keep max 500 items in memory
    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { data, timestamp: Date.now() });
    this.logger.log(`💾 Cached analysis for key: ${key.slice(0, 8)}...`);
  }
}
