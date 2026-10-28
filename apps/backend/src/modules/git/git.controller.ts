import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GitService } from './git.service';
import { FolderPickerService } from './folder-picker.service';
import { CloneRequest } from '@worksmarter/common/types';

@Controller('api/git')
export class GitController {
  constructor(
    private readonly gitService: GitService,
    private readonly folderPickerService: FolderPickerService
  ) {}

  @Post('picker')
  async openFolderPicker(@Body('repoName') repoName: string) {
    return this.folderPickerService.openFolderDialog(repoName);
  }

  @Post('clone')
  @Sse('clone-stream')
  cloneStream(@Body() request: CloneRequest): Observable<MessageEvent> {
    return this.gitService.cloneRepository(request).pipe(
      map((event) => ({
        data: event,
      }))
    );
  }
}
