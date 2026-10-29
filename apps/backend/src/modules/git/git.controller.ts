import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GitService } from './git.service';
import { FolderPickerService } from './folder-picker.service';
import { OpenFolderPickerDto, CloneRepositoryRequestDto } from './dto/git.dto';

@ApiTags('Local Git & Workspace Engine')
@Controller('api/git')
export class GitController {
  constructor(
    private readonly gitService: GitService,
    private readonly folderPickerService: FolderPickerService
  ) {}

  @Post('picker')
  @ApiOperation({
    summary: 'Open Native OS Folder Picker',
    description: 'Triggers a native desktop directory chooser dialog (osascript on macOS, zenity on Linux, powershell on Windows) for selecting a clone target path.',
  })
  @ApiBody({ type: OpenFolderPickerDto })
  @ApiResponse({ status: 200, description: 'Selected directory path or cancellation flag' })
  async openFolderPicker(@Body() body: OpenFolderPickerDto) {
    return this.folderPickerService.openFolderDialog(body.repoName);
  }

  @Post('clone')
  @Sse('clone-stream')
  @ApiOperation({
    summary: 'Clone Repository Locally with Progress Stream',
    description: 'Executes git clone into the selected local target directory and streams real-time stdout/stderr percentage events via Server-Sent Events.',
  })
  @ApiBody({ type: CloneRepositoryRequestDto })
  @ApiResponse({ status: 200, description: 'Streaming git clone progress events' })
  cloneStream(@Body() request: CloneRepositoryRequestDto): Observable<MessageEvent> {
    return this.gitService
      .cloneRepository({
        ...request,
        autoOpenVsCode: request.autoOpenVsCode ?? true,
      })
      .pipe(
        map((event) => ({
          data: event,
        }))
      );
  }

  @Post('cancel')
  @ApiOperation({
    summary: 'Stop Ongoing Git Clone and Clean Up Files',
    description:
      'Terminates active git clone child process and deletes any partially downloaded files from disk to prevent orphaned files.',
  })
  @ApiResponse({ status: 200, description: 'Confirmation that clone was cancelled and files cleaned up' })
  async cancelClone(@Body() body: any) {
    return this.gitService.cancelClone({
      targetPath: body?.targetPath,
      repoUrl: body?.repoUrl,
      repo: body?.repo,
    });
  }
}
