/**
 * Platform utilities designed for universal compatibility across:
 * 1. Chrome Extension Sidepanel / Popup
 * 2. Next.js / Vite / React Standalone Web Applications
 */

export function isChromeExtension(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
}

/**
 * Opens a popout / expansive reader window.
 * In a Chrome extension, opens a dedicated chrome popup window.
 * In a Web application, opens a standard browser window popup or tab.
 */
export function openPopoutWindow(url: string, title = 'OpenSourced Report', width = 960, height = 820): void {
  if (isChromeExtension() && chrome.windows?.create) {
    chrome.windows.create({
      url,
      type: 'popup',
      width,
      height,
      focused: true,
    });
    return;
  }

  // Fallback for Web App / standard browser environment
  const left = window.screenLeft !== undefined ? window.screenLeft + (window.outerWidth - width) / 2 : 100;
  const top = window.screenTop !== undefined ? window.screenTop + (window.outerHeight - height) / 2 : 100;

  window.open(
    url,
    title,
    `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no`
  );
}

/**
 * Formats a timestamp into human-friendly relative time (e.g. "just now", "4m ago", "2h ago")
 */
export function formatRelativeTime(timestamp: string | number | Date): string {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Recently';

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 30) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}
