import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

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

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  // In-memory tenant-isolated stores
  private readonly users = new Map<string, User>();
  private readonly reports = new Map<string, UserReport>();

  constructor() {
    // Seed a default local developer account
    this.upsertUser({
      id: 'local-dev-user',
      username: 'opensource-developer',
      displayName: 'OpenSource Developer',
      avatarUrl: 'https://github.com/identicons/opensourced.png',
      provider: 'dev',
      isGuest: false,
      roles: ['user'],
    });
  }

  // ============================================================================
  // User Management
  // ============================================================================

  findUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  findUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  findUserByOAuth(provider: 'github' | 'google', providerId: string): User | undefined {
    return Array.from(this.users.values()).find(
      (u) => u.provider === provider && u.providerId === providerId
    );
  }

  upsertUser(userPartial: Partial<User> & { id: string }): User {
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
  // IDOR-Protected User Resource Storage
  // ============================================================================

  /**
   * Save a user-scoped analysis report.
   * Cryptographically generates a report ID and binds it strictly to the requesting userId.
   */
  createReport(
    userId: string,
    reportData: { title: string; repo: string; action: string; content: string }
  ): UserReport {
    const id = `rep_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    const report: UserReport = {
      id,
      userId,
      title: reportData.title,
      repo: reportData.repo,
      action: reportData.action,
      content: reportData.content,
      createdAt: now,
      updatedAt: now,
    };

    this.reports.set(id, report);
    this.logger.log(`Created report '${id}' owned strictly by user '${userId}'`);
    return report;
  }

  /**
   * List all reports owned by a given user.
   * Completely filters out other users' records to prevent IDOR data leakage.
   */
  findReportsByUserId(userId: string): UserReport[] {
    return Array.from(this.reports.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Fetch a single report by ID with STRICT user ownership verification.
   * IDOR PREVENTION:
   * Returns undefined if report does not exist OR if report.userId !== requesting userId.
   */
  findReportByIdAndUserId(reportId: string, userId: string): UserReport | undefined {
    const report = this.reports.get(reportId);
    if (!report) {
      return undefined;
    }

    // IDOR Check: Ensure the requesting user actually owns this report
    if (report.userId !== userId) {
      this.logger.warn(
        `🚨 IDOR ATTEMPT BLOCKED: User '${userId}' attempted to access report '${reportId}' owned by '${report.userId}'`
      );
      return undefined; // Handled as 404 in controller to avoid enumeration
    }

    return report;
  }

  /**
   * Delete a report with strict ownership check.
   * IDOR PREVENTION:
   * Returns false if report does not exist OR does not belong to the requesting user.
   */
  deleteReportByIdAndUserId(reportId: string, userId: string): boolean {
    const report = this.reports.get(reportId);
    if (!report) {
      return false;
    }

    if (report.userId !== userId) {
      this.logger.warn(
        `🚨 IDOR DELETION BLOCKED: User '${userId}' attempted to delete report '${reportId}' owned by '${report.userId}'`
      );
      return false;
    }

    this.reports.delete(reportId);
    this.logger.log(`Deleted report '${reportId}' by owner '${userId}'`);
    return true;
  }
}
