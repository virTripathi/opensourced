import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { DriveService } from './drive.service';
import { ExportDocumentDto } from './dto/drive.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/user.repository';

@ApiTags('Google Drive Export')
@ApiBearerAuth('JWT-auth')
@Controller('api/drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post('export')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Export Research & Architecture Notes to Google Drive',
    description:
      'Compiles the session research report and saves it directly to Google Drive under drive.file scope, bound to the authenticated user.',
  })
  @ApiBody({ type: ExportDocumentDto })
  @ApiResponse({ status: 200, description: 'Google Drive file web view link and file ID' })
  async exportDocument(
    @Body() body: ExportDocumentDto,
    @CurrentUser() user?: User
  ) {
    return this.driveService.exportAnalysis(body.title, body.content, user);
  }
}
