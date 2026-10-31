import { Injectable, Logger, Inject, Optional, OnModuleInit } from '@nestjs/common';
import { DATABASE_STRATEGY, IDatabaseStrategy, UserSession } from '../database/database.strategy';
import { MemoryDatabaseStrategy } from '../database/strategies/memory.strategy';

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  isGuest?: boolean;
  provider: 'github' | 'google' | 'guest' | 'dev';
  providerId?: string;
  githubAccessToken?: string;
  githubRefreshToken?: string;
  githubTokenExpiresAt?: Date;
  githubTokenType?: 'user_to_server' | 'installation';
  googleAccessToken?: string;
  googleRefreshToken?: string;
  pat?: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserReport {
  id: string;
  userId: string;
  title: string;
  repo: string;
  action: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type { UserSession };

@Injectable()
export class UserRepository implements OnModuleInit {
  private readonly logger = new Logger(UserRepository.name);
  private readonly db: IDatabaseStrategy;

  constructor(
    @Optional() @Inject(DATABASE_STRATEGY) injectedDb?: IDatabaseStrategy
  ) {
    this.db = injectedDb || new MemoryDatabaseStrategy();
  }

  async onModuleInit() {
    await this.db.connect();
    // Seed default developer account
    try {
      await this.upsertUser({
        id: 'local-dev-user',
        username: 'opensource-developer',
        displayName: 'OpenSource Developer',
        avatarUrl: 'https://github.com/identicons/opensourced.png',
        provider: 'dev',
        isGuest: false,
        roles: ['user'],
      });
      this.logger.log(`Initialized UserRepository with '${this.db.strategyName}' strategy`);
    } catch (err: any) {
      this.logger.warn(`Could not seed default developer account: ${err.message}`);
    }
  }

  getStrategy(): IDatabaseStrategy {
    return this.db;
  }

  // ============================================================================
  // User Management
  // ============================================================================

  async findUserById(id: string): Promise<User | undefined> {
    return this.db.findUserById(id);
  }

  async findUserByUsername(username: string): Promise<User | undefined> {
    return this.db.findUserByUsername(username);
  }

  async findUserByOAuth(provider: 'github' | 'google', providerId: string): Promise<User | undefined> {
    return this.db.findUserByOAuth(provider, providerId);
  }

  async upsertUser(userPartial: Partial<User> & { id: string }): Promise<User> {
    return this.db.upsertUser(userPartial);
  }

  // ============================================================================
  // Session & Instant Token Revocation (Security Defense)
  // ============================================================================

  async createSession(sessionId: string, userId: string, expiresAt: Date): Promise<UserSession> {
    return this.db.createSession(sessionId, userId, expiresAt);
  }

  async findSessionById(sessionId: string): Promise<UserSession | undefined> {
    return this.db.findSessionById(sessionId);
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    return this.db.isSessionRevoked(sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    return this.db.revokeSession(sessionId);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    return this.db.revokeAllUserSessions(userId);
  }

  // ============================================================================
  // IDOR-Protected Report Management (Security Defense)
  // ============================================================================

  async createReport(
    userId: string,
    reportData: { title: string; repo: string; action: string; content: string }
  ): Promise<UserReport> {
    return this.db.createReport(userId, reportData);
  }

  async findReportsByUserId(userId: string): Promise<UserReport[]> {
    return this.db.findReportsByUserId(userId);
  }

  async findReportByIdAndUserId(reportId: string, userId: string): Promise<UserReport | undefined> {
    return this.db.findReportByIdAndUserId(reportId, userId);
  }

  async deleteReportByIdAndUserId(reportId: string, userId: string): Promise<boolean> {
    return this.db.deleteReportByIdAndUserId(reportId, userId);
  }

  // ============================================================================
  // ACID Transactions Support
  // ============================================================================

  async transaction<T>(fn: (strategy: IDatabaseStrategy) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
}
