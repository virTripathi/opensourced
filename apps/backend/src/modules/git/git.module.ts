import { Module } from '@nestjs/common';
import { GitController } from './git.controller';
import { GitService } from './git.service';
import { FolderPickerService } from './folder-picker.service';

@Module({
  controllers: [GitController],
  providers: [GitService, FolderPickerService],
  exports: [GitService, FolderPickerService],
})
export class GitModule {}
