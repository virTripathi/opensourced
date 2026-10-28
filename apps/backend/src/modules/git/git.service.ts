import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Observable, Subject } from 'rxjs';
import { CloneRequest, ServerSentEvent } from '@worksmarter/common/types';

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);

  /**
   * Executes git clone and returns an Observable stream of progress events
   */
  cloneRepository(request: CloneRequest): Observable<ServerSentEvent> {
    const subject = new Subject<ServerSentEvent>();

    const repoName = request.repo.replace(/\.git$/, '');
    const targetDir = request.destinationPath
      ? request.destinationPath.replace(/^~(?=$|\/|\\)/, os.homedir())
      : path.join(os.homedir(), 'Projects', repoName);

    // Ensure parent directory exists
    const parentDir = path.dirname(targetDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      subject.next({
        type: 'PIPELINE_ERROR',
        message: `Target directory already exists and is not empty: ${targetDir}`,
        recoverable: true,
      });
      subject.complete();
      return subject.asObservable();
    }

    this.logger.log(`Cloning ${request.repoUrl} into ${targetDir}`);

    subject.next({
      type: 'CLONE_PROGRESS',
      percent: 5,
      statusText: `Initializing clone for ${request.owner}/${repoName}...`,
    });

    const gitProcess = spawn('git', ['clone', '--progress', request.repoUrl, targetDir]);

    // git writes progress to stderr
    gitProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();

      // Example outputs:
      // "Receiving objects:  45% (1200/2666)"
      // "Resolving deltas:  90% (800/888)"
      const percentMatch = output.match(/(\d+)%/);
      const percent = percentMatch ? parseInt(percentMatch[1], 10) : 50;

      subject.next({
        type: 'CLONE_PROGRESS',
        percent: Math.min(Math.max(percent, 5), 98),
        statusText: output.trim(),
      });
    });

    gitProcess.on('close', (code: number) => {
      if (code === 0) {
        this.logger.log(`Successfully cloned ${repoName} to ${targetDir}`);
        const vsCodeUri = `vscode://file/${targetDir}`;

        subject.next({
          type: 'CLONE_COMPLETE',
          targetPath: targetDir,
          vsCodeUri,
        });
        subject.complete();
      } else {
        subject.next({
          type: 'PIPELINE_ERROR',
          message: `Git clone failed with exit code ${code}`,
          recoverable: false,
        });
        subject.complete();
      }
    });

    gitProcess.on('error', (err: Error) => {
      this.logger.error(`Error spawning git process: ${err.message}`);
      subject.next({
        type: 'PIPELINE_ERROR',
        message: `Failed to execute git command: ${err.message}`,
        recoverable: false,
      });
      subject.complete();
    });

    return subject.asObservable();
  }
}
