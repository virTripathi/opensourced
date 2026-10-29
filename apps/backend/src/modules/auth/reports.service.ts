import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRepository, UserReport } from './user.repository';
import { CreateReportDto } from './dto/auth.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly userRepo: UserRepository) {}

  /**
   * Save an analysis report for the authenticated user.
   * Cryptographically binds the report to the requesting user's identity.
   */
  async createReport(userId: string, dto: CreateReportDto): Promise<UserReport> {
    // Idempotency Guard: Prevent duplicate reports on accidental rapid double-clicks
    const existingReports = this.userRepo.findReportsByUserId(userId);
    const fifteenSecondsAgo = Date.now() - 15 * 1000;
    const duplicate = existingReports.find(
      (r) =>
        r.repo === dto.repo &&
        r.action === dto.action &&
        r.title === dto.title &&
        r.content === dto.content &&
        new Date(r.createdAt).getTime() > fifteenSecondsAgo
    );

    if (duplicate) {
      this.logger.log(
        `Idempotent duplicate submission detected for user '${userId}': returning existing report '${duplicate.id}'`
      );
      return duplicate;
    }

    const report = this.userRepo.createReport(userId, {
      title: dto.title,
      repo: dto.repo,
      action: dto.action,
      content: dto.content,
    });

    this.logger.log(`User '${userId}' saved report '${report.id}' for repo '${dto.repo}'`);
    return report;
  }

  /**
   * List all reports owned by the authenticated user.
   * IDOR PREVENTION:
   * Only returns reports where report.userId === requesting userId.
   */
  async listUserReports(userId: string): Promise<UserReport[]> {
    return this.userRepo.findReportsByUserId(userId);
  }

  /**
   * Retrieve a specific report by ID.
   * IDOR PREVENTION:
   * Strictly enforces that the report belongs to the authenticated user.
   * If the report does not exist OR belongs to another user, throws 404 NotFoundException
   * to prevent ID enumeration and data leakage.
   */
  async getReportById(reportId: string, userId: string): Promise<UserReport> {
    const report = this.userRepo.findReportByIdAndUserId(reportId, userId);
    if (!report) {
      throw new NotFoundException(`Report '${reportId}' not found`);
    }

    return report;
  }

  /**
   * Delete a specific report by ID.
   * IDOR PREVENTION:
   * Only allows deletion if the requesting user is the verified owner.
   */
  async deleteReportById(reportId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const deleted = this.userRepo.deleteReportByIdAndUserId(reportId, userId);
    if (!deleted) {
      throw new NotFoundException(`Report '${reportId}' not found`);
    }

    return {
      success: true,
      message: `Report '${reportId}' successfully deleted`,
    };
  }
}
