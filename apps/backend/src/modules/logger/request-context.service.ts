import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  traceId: string;
  userId?: string;
  startTime: number;
  method?: string;
  url?: string;
}

@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestStore>();

  /**
   * Runs the given callback within an isolated request context
   */
  static run<T>(store: RequestStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  /**
   * Gets the active store, or undefined if outside a request scope
   */
  static getStore(): RequestStore | undefined {
    return this.storage.getStore();
  }

  /**
   * Retrieves the current traceId, or a default traceId if outside a request scope
   */
  static getTraceId(): string {
    const store = this.storage.getStore();
    return store?.traceId || 'trc_system';
  }

  /**
   * Retrieves the current userId if available in the context
   */
  static getUserId(): string | undefined {
    const store = this.storage.getStore();
    return store?.userId;
  }

  /**
   * Non-static instance wrappers for standard NestJS dependency injection
   */
  getTraceId(): string {
    return RequestContextService.getTraceId();
  }

  getUserId(): string | undefined {
    return RequestContextService.getUserId();
  }

  getStore(): RequestStore | undefined {
    return RequestContextService.getStore();
  }

  run<T>(store: RequestStore, callback: () => T): T {
    return RequestContextService.run(store, callback);
  }
}
