import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { FolderPickerResponse } from '@worksmarter/common/types';

const execAsync = promisify(exec);

@Injectable()
export class FolderPickerService {
  /**
   * Triggers a native OS folder selection dialog
   */
  async openFolderDialog(defaultRepoName = 'my-project'): Promise<FolderPickerResponse> {
    const platform = os.platform();
    const defaultPath = path.join(os.homedir(), 'Projects', defaultRepoName);

    try {
      if (platform === 'darwin') {
        // macOS AppleScript folder picker
        const script = `osascript -e 'POSIX path of (choose folder with prompt "Select directory to clone ${defaultRepoName} into:")'`;
        const { stdout } = await execAsync(script);
        const selected = stdout.trim();
        return {
          selectedPath: selected ? path.join(selected, defaultRepoName) : defaultPath,
          cancelled: false,
          defaultPath,
        };
      } else if (platform === 'linux') {
        // Linux Zenity folder picker
        const { stdout } = await execAsync(`zenity --file-selection --directory --title="Select directory to clone ${defaultRepoName} into"`);
        const selected = stdout.trim();
        return {
          selectedPath: selected ? path.join(selected, defaultRepoName) : defaultPath,
          cancelled: false,
          defaultPath,
        };
      } else if (platform === 'win32') {
        // Windows PowerShell FolderBrowserDialog
        const psScript = `powershell -NoProfile -Command "& { Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath } }"`;
        const { stdout } = await execAsync(psScript);
        const selected = stdout.trim();
        return {
          selectedPath: selected ? path.join(selected, defaultRepoName) : defaultPath,
          cancelled: false,
          defaultPath,
        };
      }
    } catch (err: unknown) {
      // User cancelled dialog or dialog not supported
      const isCancelled = typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 1;
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
