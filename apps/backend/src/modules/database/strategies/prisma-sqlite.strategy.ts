import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { IDatabaseStrategy, UserSession } from '../database.strategy';
import { User, UserReport } from '../../auth/user.repository';
import { TokenCryptor } from '../crypto.util';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaSqliteStrategy implements IDatabaseStrategy {
  readonly strategyName = 'sqlite';
  private readonly logger = new Logger(PrismaSqliteStrategy.name);
  private readonly cryptor: TokenCryptor;

  constructor(
    @Inject(PrismaService) private readonly prisma: any,
    @Optional() configService?: ConfigService
  ) {
    const key =
      configService?.get<string>('auth.encryptionKey') ||
      process.env.ENCRYPTION_KEY ||
      configService?.get<string>('auth.jwtSecret') ||
      process.env.JWT_SECRET;
    this.cryptor = new TokenCryptor(key);
  }

  async connect(): Promise<void> {
    if ('$connect' in this.prisma) {
      await (this.prisma as PrismaService).$connect();
    }
  }

  async disconnect(): Promise<void> {
    if ('$disconnect' in this.prisma) {
      await (this.prisma as PrismaService).$disconnect();
    }
  }

  // ============================================================================
  // User Management
  // ============================================================================

  async findUserById(id: string): Promise<User | undefined> {
    const record = await this.prisma.user.findUnique({
      where: { id },
    });
    return record ? this.mapToDomainUser(record) : undefined;
  }

  async findUserByUsername(username: string): Promise<User | undefined> {
    const record = await this.prisma.user.findFirst({
      where: {
        username: {
          equals: username,
        },
      },
    });
    return record ? this.mapToDomainUser(record) : undefined;
  }

  async findUserByOAuth(provider: 'github' | 'google', providerId: string): Promise<User | undefined> {
    const record = await this.prisma.user.findFirst({
      where: {
        provider,
        providerId,
      },
    });
    return record ? this.mapToDomainUser(record) : undefined;
  }

  async upsertUser(userPartial: Partial<User> & { id: string }): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userPartial.id },
    });

    const username = userPartial.username || existing?.username || `user-${userPartial.id.slice(0, 8)}`;
    const roles = userPartial.roles || (existing ? JSON.parse(existing.roles) : ['user']);

    // OWASP A02: Encrypt sensitive tokens before writing to disk
    const encGithubToken = userPartial.githubAccessToken !== undefined
      ? this.cryptor.encrypt(userPartial.githubAccessToken)
      : existing?.githubAccessToken;

    const encGithubRefreshToken = userPartial.githubRefreshToken !== undefined
      ? this.cryptor.encrypt(userPartial.githubRefreshToken)
      : existing?.githubRefreshToken;

    const encGoogleToken = userPartial.googleAccessToken !== undefined
      ? this.cryptor.encrypt(userPartial.googleAccessToken)
      : existing?.googleAccessToken;

    const encGoogleRefreshToken = userPartial.googleRefreshToken !== undefined
      ? this.cryptor.encrypt(userPartial.googleRefreshToken)
      : existing?.googleRefreshToken;

    const encPat = userPartial.pat !== undefined
      ? this.cryptor.encrypt(userPartial.pat)
      : existing?.pat;

    const record = await this.prisma.user.upsert({
      where: { id: userPartial.id },
      create: {
        id: userPartial.id,
        username,
        displayName: userPartial.displayName ?? username,
        email: userPartial.email ?? null,
        avatarUrl: userPartial.avatarUrl ?? 'https://github.com/identicons/guest.png',
        isGuest: userPartial.isGuest ?? false,
        provider: userPartial.provider || 'guest',
        providerId: userPartial.providerId ?? null,
        githubAccessToken: encGithubToken ?? null,
        githubRefreshToken: encGithubRefreshToken ?? null,
        githubTokenExpiresAt: userPartial.githubTokenExpiresAt ?? null,
        githubTokenType: userPartial.githubTokenType ?? null,
        googleAccessToken: encGoogleToken ?? null,
        googleRefreshToken: encGoogleRefreshToken ?? null,
        pat: encPat ?? null,
        roles: JSON.stringify(roles),
      },
      update: {
        username,
        displayName: userPartial.displayName !== undefined ? userPartial.displayName : existing?.displayName,
        email: userPartial.email !== undefined ? userPartial.email : existing?.email,
        avatarUrl: userPartial.avatarUrl !== undefined ? userPartial.avatarUrl : existing?.avatarUrl,
        isGuest: userPartial.isGuest !== undefined ? userPartial.isGuest : existing?.isGuest,
        provider: userPartial.provider !== undefined ? userPartial.provider : existing?.provider,
        providerId: userPartial.providerId !== undefined ? userPartial.providerId : existing?.providerId,
        githubAccessToken: encGithubToken ?? null,
        githubRefreshToken: encGithubRefreshToken ?? null,
        githubTokenExpiresAt: userPartial.githubTokenExpiresAt !== undefined ? userPartial.githubTokenExpiresAt : existing?.githubTokenExpiresAt,
        githubTokenType: userPartial.githubTokenType !== undefined ? userPartial.githubTokenType : existing?.githubTokenType,
        googleAccessToken: encGoogleToken ?? null,
        googleRefreshToken: encGoogleRefreshToken ?? null,
        pat: encPat ?? null,
        roles: JSON.stringify(roles),
      },
    });

    return this.mapToDomainUser(record);
  }

  // ============================================================================
  // Session & Instant Token Revocation (OWASP A07 Defense)
  // ============================================================================

  async createSession(sessionId: string, userId: string, expiresAt: Date): Promise<UserSession> {
    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        expiresAt,
        isRevoked: false,
      },
    });

    return {
      id: session.id,
      userId: session.userId,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async findSessionById(sessionId: string): Promise<UserSession | undefined> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) return undefined;

    return {
      id: session.id,
      userId: session.userId,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    // If session doesn't exist or is flagged revoked or has expired, it is revoked
    if (!session) return true;
    if (session.isRevoked) return true;
    if (new Date() > session.expiresAt) return true;

    return false;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
    this.logger.log(`Session revoked: '${sessionId}'`);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
    this.logger.log(`All sessions revoked for user: '${userId}'`);
  }

  // ============================================================================
  // IDOR-Protected Report Management (OWASP A01 Defense)
  // ============================================================================

  async createReport(
    userId: string,
    data: { title: string; repo: string; action: string; content: string }
  ): Promise<UserReport> {
    const id = `rep_${crypto.randomBytes(8).toString('hex')}`;

    const report = await this.prisma.report.create({
      data: {
        id,
        userId,
        title: data.title,
        repo: data.repo,
        action: data.action,
        content: data.content,
      },
    });

    this.logger.log(`Created report '${id}' owned strictly by user '${userId}' in SQLite`);

    return {
      id: report.id,
      userId: report.userId,
      title: report.title,
      repo: report.repo,
      action: report.action,
      content: report.content,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  async findReportsByUserId(userId: string): Promise<UserReport[]> {
    const records = await this.prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      repo: r.repo,
      action: r.action,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async findReportByIdAndUserId(reportId: string, userId: string): Promise<UserReport | undefined> {
    // IDOR Prevention: Only match if BOTH reportId AND userId match
    const record = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        userId,
      },
    });

    if (!record) {
      // Check if the report actually exists under another user to log IDOR attempt
      const existsElsewhere = await this.prisma.report.findUnique({
        where: { id: reportId },
      });
      if (existsElsewhere) {
        this.logger.warn(
          `🚨 IDOR ATTEMPT BLOCKED: User '${userId}' attempted to access report '${reportId}' owned by '${existsElsewhere.userId}'`
        );
      }
      return undefined;
    }

    return {
      id: record.id,
      userId: record.userId,
      title: record.title,
      repo: record.repo,
      action: record.action,
      content: record.content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async deleteReportByIdAndUserId(reportId: string, userId: string): Promise<boolean> {
    // IDOR check before deleting
    const existing = await this.prisma.report.findFirst({
      where: { id: reportId, userId },
    });

    if (!existing) {
      const existsElsewhere = await this.prisma.report.findUnique({
        where: { id: reportId },
      });
      if (existsElsewhere) {
        this.logger.warn(
          `🚨 IDOR DELETION BLOCKED: User '${userId}' attempted to delete report '${reportId}' owned by '${existsElsewhere.userId}'`
        );
      }
      return false;
    }

    await this.prisma.report.delete({
      where: { id: reportId },
    });

    this.logger.log(`Deleted report '${reportId}' by owner '${userId}' from SQLite`);
    return true;
  }

  // ============================================================================
  // ACID Transactions Support
  // ============================================================================

  async transaction<T>(fn: (strategy: IDatabaseStrategy) => Promise<T>): Promise<T> {
    if (!('$transaction' in this.prisma)) {
      return fn(this);
    }

    return (this.prisma as PrismaClient).$transaction(async (tx) => {
      const txStrategy = new PrismaSqliteStrategy(tx);
      return fn(txStrategy);
    });
  }

  // ============================================================================
  // Private Helper
  // ============================================================================

  private mapToDomainUser(record: any): User {
    let roles: string[] = ['user'];
    try {
      if (record.roles) {
        roles = JSON.parse(record.roles);
      }
    } catch {}

    return {
      id: record.id,
      username: record.username,
      displayName: record.displayName ?? undefined,
      email: record.email ?? undefined,
      avatarUrl: record.avatarUrl ?? undefined,
      isGuest: Boolean(record.isGuest),
      provider: record.provider as any,
      providerId: record.providerId ?? undefined,
      githubAccessToken: this.cryptor.decrypt(record.githubAccessToken) ?? undefined,
      githubRefreshToken: this.cryptor.decrypt(record.githubRefreshToken) ?? undefined,
      githubTokenExpiresAt: record.githubTokenExpiresAt ?? undefined,
      githubTokenType: record.githubTokenType ?? undefined,
      googleAccessToken: this.cryptor.decrypt(record.googleAccessToken) ?? undefined,
      googleRefreshToken: this.cryptor.decrypt(record.googleRefreshToken) ?? undefined,
      pat: this.cryptor.decrypt(record.pat) ?? undefined,
      roles,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
