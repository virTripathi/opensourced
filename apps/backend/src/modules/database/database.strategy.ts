import { User, UserReport } from '../auth/user.repository';

export const DATABASE_STRATEGY = 'DATABASE_STRATEGY';

export interface UserSession {
  id: string;
  userId: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Strategy pattern abstraction for database storage engines.
 * Enables zero-downtime pluggability across SQLite (default),
 * in-memory (testing), and future enterprise databases (PostgreSQL, MySQL).
 */
export interface IDatabaseStrategy {
  readonly strategyName: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // User Management
  findUserById(id: string): Promise<User | undefined>;
  findUserByUsername(username: string): Promise<User | undefined>;
  findUserByOAuth(provider: 'github' | 'google', providerId: string): Promise<User | undefined>;
  upsertUser(userPartial: Partial<User> & { id: string }): Promise<User>;

  // Session & Instant Token Revocation (Security Defense)
  createSession(sessionId: string, userId: string, expiresAt: Date): Promise<UserSession>;
  findSessionById(sessionId: string): Promise<UserSession | undefined>;
  isSessionRevoked(sessionId: string): Promise<boolean>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;

  // IDOR-Protected Report Management (Security Defense)
  createReport(
    userId: string,
    data: { title: string; repo: string; action: string; content: string }
  ): Promise<UserReport>;
  findReportsByUserId(userId: string): Promise<UserReport[]>;
  findReportByIdAndUserId(reportId: string, userId: string): Promise<UserReport | undefined>;
  deleteReportByIdAndUserId(reportId: string, userId: string): Promise<boolean>;

  // ACID Transactions Support
  transaction<T>(fn: (strategy: IDatabaseStrategy) => Promise<T>): Promise<T>;
}
