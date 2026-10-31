import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User, UserReport } from './user.repository';

@ApiTags('User Reports & Research History')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Save Generated Analysis / Research Report',
    description:
      'Persists a research artifact (issue analysis, entrypoints, security check, PR draft) strictly bound to the authenticated user ID. Prevents IDOR across users.',
  })
  @ApiBody({ type: CreateReportDto })
  @ApiResponse({ status: 201, description: 'Report successfully saved and associated with user' })
  async createReport(
    @CurrentUser() user: User,
    @Body() dto: CreateReportDto
  ): Promise<UserReport> {
    return this.reportsService.createReport(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List Authenticated User Reports',
    description:
      'Retrieves all analysis and research reports owned exclusively by the authenticated user. Never exposes reports belonging to other users.',
  })
  @ApiResponse({ status: 200, description: 'List of reports owned by current user' })
  async listReports(@CurrentUser() user: User): Promise<UserReport[]> {
    return this.reportsService.listUserReports(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Specific Report by ID (IDOR Protected)',
    description:
      'Fetches a single report by ID. STRICT AUTHORIZATION: Enforces that the requesting user owns the report. If another user attempts to access this report, returns 404 to avoid enumeration and IDOR data leaks.',
  })
  @ApiParam({ name: 'id', description: 'Report ID (e.g. rep_abc123)' })
  @ApiResponse({ status: 200, description: 'Report details' })
  @ApiResponse({ status: 404, description: 'Report not found or not owned by user' })
  async getReport(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<UserReport> {
    return this.reportsService.getReportById(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete Report by ID (IDOR Protected)',
    description:
      'Deletes a report by ID. Strictly verifies that the requesting user is the owner before deleting. Cross-user deletion attempts are blocked.',
  })
  @ApiParam({ name: 'id', description: 'Report ID to delete' })
  @ApiResponse({ status: 200, description: 'Report successfully deleted' })
  @ApiResponse({ status: 404, description: 'Report not found or not owned by user' })
  async deleteReport(
    @CurrentUser() user: User,
    @Param('id') id: string
  ): Promise<{ success: boolean; message: string }> {
    return this.reportsService.deleteReportById(id, user.id);
  }
}
