import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Observable } from 'rxjs';
import { CloneRequest, ServerSentEvent } from '@opensourced/common/types';

interface ActiveCloneJob {
  process: ChildProcess;
  targetDir: string;
  repoUrl: string;
  aborted: boolean;
}

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name);
  private readonly activeClones = new Map<string, ActiveCloneJob>();

  /**
   * Executes git clone with real-time SSE progress streaming, error classification,
   * and automatic file cleanup on cancellation or failure.
   */
  cloneRepository(request: CloneRequest): Observable<ServerSentEvent> {
    return new Observable<ServerSentEvent>((subscriber) => {
      // 1. Validate repoUrl against injection flags
      const trimmedUrl = request.repoUrl.trim();
      if (trimmedUrl.startsWith('-') || !/^https?:\/\/[a-zA-Z0-9_.-]+/.test(trimmedUrl)) {
        subscriber.next({
          type: 'PIPELINE_ERROR',
          message: `Invalid or unsafe repository URL provided: ${trimmedUrl}`,
          recoverable: false,
          code: 'INVALID_URL',
        });
        subscriber.complete();
        return;
      }

      const repoName = request.repo.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.git$/, '');
      const rawTarget = request.destinationPath
        ? request.destinationPath.replace(/^~(?=$|\/|\\)/, os.homedir())
        : path.join(os.homedir(), 'Projects', repoName);

      const targetDir = path.resolve(rawTarget);

      // 2. Path Traversal & System Root Protection
      const forbiddenPaths = ['/', '/etc', '/bin', '/usr', '/sbin', '/System', '/var', '/private', 'C:\\', 'C:\\Windows'];
      if (forbiddenPaths.includes(targetDir) || targetDir === os.homedir()) {
        subscriber.next({
          type: 'PIPELINE_ERROR',
          message: `Cloning into restricted system path '${targetDir}' is blocked for security.`,
          recoverable: false,
          code: 'RESTRICTED_PATH',
        });
        subscriber.complete();
        return;
      }

      // 3. Ensure parent directory exists
      const parentDir = path.dirname(targetDir);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // 3b. Verify in-flight clone mutex (Idempotency Guard)
      if (this.activeClones.has(targetDir)) {
        subscriber.next({
          type: 'PIPELINE_ERROR',
          message: `A clone operation is already in progress for target directory: ${targetDir}`,
          recoverable: false,
          code: 'CLONE_IN_PROGRESS',
        });
        subscriber.complete();
        return;
      }

      // 4. Verify destination conflict
      if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
        subscriber.next({
          type: 'PIPELINE_ERROR',
          message: `Target directory already exists and is not empty: ${targetDir}`,
          recoverable: true,
          code: 'DESTINATION_EXISTS',
          canRetry: true,
        });
        subscriber.complete();
        return;
      }

      this.logger.log(`Starting clone: ${trimmedUrl} -> ${targetDir}`);

      subscriber.next({
        type: 'CLONE_PROGRESS',
        percent: 5,
        statusText: `Initializing clone for ${request.owner}/${repoName}...`,
      });

      // 5. Spawn git process safely with positional argument delimiter
      const gitProcess = spawn('git', ['clone', '--progress', '--', trimmedUrl, targetDir]);

      const job: ActiveCloneJob = {
        process: gitProcess,
        targetDir,
        repoUrl: trimmedUrl,
        aborted: false,
      };

      this.activeClones.set(targetDir, job);
      let stderrAccumulator = '';

      // Git writes progress to stderr
      gitProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        stderrAccumulator += output;

        const percentMatch = output.match(/(\d+)%/);
        const percent = percentMatch ? parseInt(percentMatch[1], 10) : 50;

        subscriber.next({
          type: 'CLONE_PROGRESS',
          percent: Math.min(Math.max(percent, 5), 98),
          statusText: output.trim(),
        });
      });

      gitProcess.on('close', (code: number) => {
        this.activeClones.delete(targetDir);

        // A. If cancelled by user midway
        if (job.aborted) {
          this.cleanupTargetDirectory(targetDir);
          subscriber.next({
            type: 'CLONE_CANCELLED',
            message: `Cloning was stopped. Partial files in '${targetDir}' were removed.`,
            targetPath: targetDir,
          });
          subscriber.complete();
          return;
        }

        // B. Success
        if (code === 0) {
          this.logger.log(`Successfully cloned ${repoName} to ${targetDir}`);
          const vsCodeUri = `vscode://file/${targetDir}`;

          subscriber.next({
            type: 'CLONE_COMPLETE',
            targetPath: targetDir,
            vsCodeUri,
          });
          subscriber.complete();
        } else {
          // C. Failure - Clean up partial files so destination doesn't get corrupted
          this.cleanupTargetDirectory(targetDir);

          let errorMessage = `Git clone failed with exit code ${code}`;
          let errorCode = 'CLONE_FAILED';

          // Detect if repository was deleted or not found
          if (
            stderrAccumulator.includes('not found') ||
            stderrAccumulator.includes('Repository not found') ||
            stderrAccumulator.includes('404')
          ) {
            errorMessage = `Repository '${request.owner}/${repoName}' not found or was deleted on GitHub. Please check if the repository exists or was made private.`;
            errorCode = 'REPO_NOT_FOUND';
          } else if (stderrAccumulator.includes('already exists and is not an empty directory')) {
            errorMessage = `Target folder already exists and is not empty. Choose a different folder.`;
            errorCode = 'DESTINATION_EXISTS';
          } else if (
            stderrAccumulator.includes('Authentication failed') ||
            stderrAccumulator.includes('could not read Username')
          ) {
            errorMessage = `Access denied to '${request.owner}/${repoName}'. If this is private, authorize with GitHub.`;
            errorCode = 'AUTH_REQUIRED';
          }

          this.logger.warn(`Git clone error (${errorCode}): ${errorMessage}`);

          subscriber.next({
            type: 'PIPELINE_ERROR',
            message: errorMessage,
            recoverable: true,
            code: errorCode,
            canRetry: true,
          });
          subscriber.complete();
        }
      });

      gitProcess.on('error', (err: Error) => {
        this.activeClones.delete(targetDir);
        this.cleanupTargetDirectory(targetDir);
        this.logger.error(`Error spawning git process: ${err.message}`);

        subscriber.next({
          type: 'PIPELINE_ERROR',
          message: `Failed to execute git command: ${err.message}`,
          recoverable: false,
          code: 'SPAWN_ERROR',
        });
        subscriber.complete();
      });

      // Teardown logic if client disconnects or aborts observable
      return () => {
        if (!gitProcess.killed) {
          this.logger.log(`Client disconnected during clone. Terminating git process for ${targetDir}`);
          job.aborted = true;
          gitProcess.kill('SIGTERM');
          this.cleanupTargetDirectory(targetDir);
        }
      };
    });
  }

  /**
   * Stops an ongoing clone operation and deletes partially downloaded files from disk.
   */
  cancelClone(query: { targetPath?: string; repoUrl?: string; repo?: string }): {
    success: boolean;
    message: string;
    cleanedPath?: string;
  } {
    let matchedJob: ActiveCloneJob | undefined;

    if (query.targetPath) {
      const resolved = path.resolve(query.targetPath.replace(/^~(?=$|\/|\\)/, os.homedir()));
      matchedJob = this.activeClones.get(resolved);
    }

    if (!matchedJob && query.repoUrl) {
      matchedJob = Array.from(this.activeClones.values()).find((j) => j.repoUrl === query.repoUrl);
    }

    if (!matchedJob && query.repo) {
      const cleanName = query.repo.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.git$/, '');
      matchedJob = Array.from(this.activeClones.values()).find((j) =>
        j.targetDir.endsWith(cleanName)
      );
    }

    // If no specific match, check if there's any active clone running
    if (!matchedJob && this.activeClones.size === 1) {
      matchedJob = this.activeClones.values().next().value;
    }

    if (!matchedJob) {
      return {
        success: false,
        message: 'No active clone job found to cancel.',
      };
    }

    matchedJob.aborted = true;
    const targetPath = matchedJob.targetDir;

    try {
      matchedJob.process.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!matchedJob!.process.killed) matchedJob!.process.kill('SIGKILL');
        } catch {}
      }, 500);
    } catch (err: any) {
      this.logger.warn(`Could not kill git process: ${err.message}`);
    }

    this.activeClones.delete(targetPath);
    this.cleanupTargetDirectory(targetPath);

    this.logger.log(`Cancelled clone and cleaned up files at: ${targetPath}`);

    return {
      success: true,
      message: `Cloning stopped. Partially cloned files at '${targetPath}' were deleted.`,
      cleanedPath: targetPath,
    };
  }

  /**
   * Helper to safely remove partial directory if it exists
   */
  private cleanupTargetDirectory(targetDir: string) {
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up partial directory: ${targetDir}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not clean up directory ${targetDir}: ${err.message}`);
    }
  }
}
