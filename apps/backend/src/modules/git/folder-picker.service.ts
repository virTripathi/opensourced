import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { FolderPickerResponse } from '@opensourced/common/types';

const execFileAsync = promisify(execFile);

@Injectable()
export class FolderPickerService {
  private readonly logger = new Logger(FolderPickerService.name);
  private activeDialogPromise: Promise<FolderPickerResponse> | null = null;

  /**
   * Triggers a native OS folder selection dialog safely.
   * OWASP A03 Defense: Uses execFile (not shell exec) with sanitized arguments to eliminate command injection.
   * IDEMPOTENCY: Shares the active in-flight dialog promise to prevent opening multiple overlapping OS popups.
   */
  openFolderDialog(defaultRepoName = 'my-project'): Promise<FolderPickerResponse> {
    if (this.activeDialogPromise) {
      this.logger.log('Native folder picker dialog already active; sharing in-flight dialog session');
      return this.activeDialogPromise;
    }

    this.activeDialogPromise = this.executeOpenFolderDialog(defaultRepoName).finally(() => {
      this.activeDialogPromise = null;
    });

    return this.activeDialogPromise;
  }

  private async executeOpenFolderDialog(defaultRepoName = 'my-project'): Promise<FolderPickerResponse> {
    const platform = os.platform();

    // Sanitize repo name: allow only alphanumeric, dots, hyphens, and underscores
    const safeRepoName = (defaultRepoName || 'my-project').replace(/[^a-zA-Z0-9._-]/g, '');
    const defaultPath = path.join(os.homedir(), 'Projects', safeRepoName);

    try {
      if (platform === 'darwin') {
        // macOS AppleScript folder picker via execFile (no shell execution)
        const promptText = `Select directory to clone ${safeRepoName} into:`;
        const appleScript = `POSIX path of (choose folder with prompt "${promptText}")`;

        const { stdout } = await execFileAsync('osascript', ['-e', appleScript]);
        const selected = stdout.trim();
        return {
          selectedPath: selected ? path.join(selected, safeRepoName) : defaultPath,
          cancelled: false,
          defaultPath,
        };
      } else if (platform === 'linux') {
        // Linux Zenity folder picker via execFile (no shell execution)
        const titleText = `Select directory to clone ${safeRepoName} into`;
        const { stdout } = await execFileAsync('zenity', [
          '--file-selection',
          '--directory',
          `--title=${titleText}`,
        ]);
        const selected = stdout.trim();
        return {
          selectedPath: selected ? path.join(selected, safeRepoName) : defaultPath,
          cancelled: false,
          defaultPath,
        };
      } else if (platform === 'win32') {
        // Windows PowerShell FolderBrowserDialog via execFile (no shell execution)
        const psCommand =
          '& { Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq "OK") { $f.SelectedPath } }';
        const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psCommand]);
        const selected = stdout.trim();
        return {
          selectedPath: selected ? path.join(selected, safeRepoName) : defaultPath,
          cancelled: false,
          defaultPath,
        };
      }
    } catch (err: unknown) {
      // User cancelled dialog or dialog not supported
      const isCancelled =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 1;
      return {
        selectedPath: isCancelled ? null : defaultPath,
        cancelled: isCancelled,
        defaultPath,
      };
    }

    return {
      selectedPath: defaultPath,
      cancelled: false,
      defaultPath,
    };
  }
}
