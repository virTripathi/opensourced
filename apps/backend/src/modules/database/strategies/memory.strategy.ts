import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { IDatabaseStrategy, UserSession } from '../database.strategy';
import { User, UserReport } from '../../auth/user.repository';

@Injectable()
export class MemoryDatabaseStrategy implements IDatabaseStrategy {
  readonly strategyName = 'memory';
  private readonly logger = new Logger(MemoryDatabaseStrategy.name);

  private readonly users = new Map<string, User>();
  private readonly sessions = new Map<string, UserSession>();
  private readonly reports = new Map<string, UserReport>();

  async connect(): Promise<void> {
    this.logger.log('MemoryDatabaseStrategy initialized');
  }

  async disconnect(): Promise<void> {
    this.users.clear();
    this.sessions.clear();
    this.reports.clear();
  }

  // ============================================================================
  // User Management
  // ============================================================================

  async findUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async findUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  async findUserByOAuth(provider: 'github' | 'google', providerId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (u) => u.provider === provider && u.providerId === providerId
    );
  }

  async upsertUser(userPartial: Partial<User> & { id: string }): Promise<User> {
    const existing = this.users.get(userPartial.id);
    const now = new Date();

    const user: User = {
      id: userPartial.id,
      username: userPartial.username || existing?.username || `user-${userPartial.id.slice(0, 8)}`,
      displayName: userPartial.displayName ?? existing?.displayName,
      email: userPartial.email ?? existing?.email,
      avatarUrl: userPartial.avatarUrl ?? existing?.avatarUrl ?? 'https://github.com/identicons/guest.png',
      isGuest: userPartial.isGuest ?? existing?.isGuest ?? false,
      provider: userPartial.provider || existing?.provider || 'guest',
      providerId: userPartial.providerId ?? existing?.providerId,
      githubAccessToken: userPartial.githubAccessToken ?? existing?.githubAccessToken,
      githubRefreshToken: userPartial.githubRefreshToken ?? existing?.githubRefreshToken,
      githubTokenExpiresAt: userPartial.githubTokenExpiresAt ?? existing?.githubTokenExpiresAt,
      githubTokenType: userPartial.githubTokenType ?? existing?.githubTokenType,
      googleAccessToken: userPartial.googleAccessToken ?? existing?.googleAccessToken,
      googleRefreshToken: userPartial.googleRefreshToken ?? existing?.googleRefreshToken,
      pat: userPartial.pat ?? existing?.pat,
      roles: userPartial.roles ?? existing?.roles ?? ['user'],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    return user;
  }

  // ============================================================================
  // Session & Instant Token Revocation (OWASP A07 Defense)
  // ============================================================================

  async createSession(sessionId: string, userId: string, expiresAt: Date): Promise<UserSession> {
    const now = new Date();
    const session: UserSession = {
      id: sessionId,
      userId,
      isRevoked: false,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async findSessionById(sessionId: string): Promise<UserSession | undefined> {
    return this.sessions.get(sessionId);
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    if (session.isRevoked) return true;
    if (new Date() > session.expiresAt) return true;
    return false;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isRevoked = true;
      session.updatedAt = new Date();
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.isRevoked = true;
        session.updatedAt = new Date();
      }
    }
  }

  // ============================================================================
  // IDOR-Protected Report Management (OWASP A01 Defense)
  // ============================================================================

  async createReport(
    userId: string,
    data: { title: string; repo: string; action: string; content: string }
  ): Promise<UserReport> {
    const id = `rep_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    const report: UserReport = {
      id,
      userId,
      title: data.title,
      repo: data.repo,
      action: data.action,
      content: data.content,
      createdAt: now,
      updatedAt: now,
    };

    this.reports.set(id, report);
    return report;
  }

  async findReportsByUserId(userId: string): Promise<UserReport[]> {
    return Array.from(this.reports.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findReportByIdAndUserId(reportId: string, userId: string): Promise<UserReport | undefined> {
    const report = this.reports.get(reportId);
    if (!report) return undefined;

    if (report.userId !== userId) {
      this.logger.warn(
        `🚨 IDOR ATTEMPT BLOCKED: User '${userId}' attempted to access report '${reportId}' owned by '${report.userId}'`
      );
      return undefined;
    }

    return report;
  }

  async deleteReportByIdAndUserId(reportId: string, userId: string): Promise<boolean> {
    const report = this.reports.get(reportId);
    if (!report) return false;

    if (report.userId !== userId) {
      this.logger.warn(
        `🚨 IDOR DELETION BLOCKED: User '${userId}' attempted to delete report '${reportId}' owned by '${report.userId}'`
      );
      return false;
    }

    this.reports.delete(reportId);
    return true;
  }

  // ============================================================================
  // ACID Transactions Support
  // ============================================================================

  async transaction<T>(fn: (strategy: IDatabaseStrategy) => Promise<T>): Promise<T> {
    // In-memory operations are executed sequentially
    return fn(this);
  }
}
