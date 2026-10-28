import { Controller, Post, Body } from '@nestjs/common';
import { DriveService } from './drive.service';

@Controller('api/drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post('export')
  async exportDocument(
    @Body('title') title: string,
    @Body('content') content: string
  ) {
    return this.driveService.exportAnalysis(title, content);
  }
}
