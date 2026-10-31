import { isChromeExtension } from './platform';

export interface FileJumpTarget {
  filePath: string;
  lineHash?: string;
  url: string;
}

export interface RepoContext {
  owner?: string;
  repo?: string;
  branch?: string;
}

// Module-level fallback cache for active repo context across the extension
let globalRepoContext: RepoContext | null = null;

export function setActiveRepoContext(ctx: RepoContext | null): void {
  globalRepoContext = ctx;
}

export function getActiveRepoContext(): RepoContext | null {
  return globalRepoContext;
}

/**
 * Detects if a string or link target is a source file path within a repository.
 * Parses line ranges (:42-89, :42, #L42, #L42-L89) and constructs a direct GitHub URL.
 */
export function detectFileJumpTarget(
  textOrHref: string,
  repoContext?: RepoContext | null
): FileJumpTarget | null {
  if (!textOrHref || typeof textOrHref !== 'string') return null;

  const trimmed = textOrHref.trim();
  const effectiveContext = repoContext || globalRepoContext;

  // 1. If it's already a full GitHub blob URL, preserve it
  if (trimmed.startsWith('https://github.com/') || trimmed.startsWith('http://github.com/')) {
    const match = trimmed.match(
      /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:#(L?\d+(?:-L?\d+)?))?$/
    );
    if (match) {
      return {
        filePath: match[4],
        lineHash: match[5] ? (match[5].startsWith('#') ? match[5] : `#${match[5]}`) : undefined,
        url: trimmed,
      };
    }
    return {
      filePath: trimmed,
      url: trimmed,
    };
  }

  // Reject generic protocols other than GitHub
  if (/^[a-z]+:\/\//i.test(trimmed)) return null;

  // 2. Reject multi-word text, syntax structures, or shell commands
  if (/\s/.test(trimmed)) return null;
  if (trimmed.includes('(') || trimmed.includes(')') || trimmed.includes('{') || trimmed.includes('}')) return null;
  if (trimmed.includes(';') || trimmed.includes('<') || trimmed.includes('>') || trimmed.includes('|')) return null;
  if (trimmed.startsWith('npm') || trimmed.startsWith('git') || trimmed.startsWith('pnpm') || trimmed.startsWith('cargo')) return null;

  // Strip leading/trailing formatting (quotes, backticks, leading slashes)
  let cleaned = trimmed.replace(/^[`'"]+|[`'"]+$/g, '').replace(/^\/+/, '');

  // Extract optional line numbers: e.g. path/to/file.ts:42 or :42-89 or #L42 or #L42-L89
  let lineHash: string | undefined;
  const lineMatch = cleaned.match(/^(.*?)(?::(\d+(?:-\d+)?)|#(L?\d+(?:-L?\d+)?))$/);
  if (lineMatch) {
    cleaned = lineMatch[1];
    const rawLine = lineMatch[2] || lineMatch[3];
    if (rawLine) {
      if (rawLine.toUpperCase().startsWith('L')) {
        lineHash = `#${rawLine.toUpperCase()}`;
      } else if (rawLine.includes('-')) {
        const [start, end] = rawLine.split('-');
        lineHash = `#L${start}-L${end}`;
      } else {
        lineHash = `#L${rawLine}`;
      }
    }
  }

  // 3. Known repository filenames without extensions
  const knownFilenames = /^(Dockerfile|Makefile|LICENSE|Procfile|Gemfile|Rakefile|\.dockerignore|\.gitignore|\.env|\.env\.[a-z0-9_-]+)$/i;

  // 4. Recognized source and config file extensions
  const fileExtRegex = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|java|kt|rb|php|c|cpp|h|hpp|css|scss|sass|less|html|yaml|yml|toml|lock|sh|bash|sql|prisma|graphql|gql|txt|svg|vue|svelte)$/i;

  // Framework identifiers to ignore
  if (/^(node|next|express|react|vue|angular|nuxt|electron)\.js$/i.test(cleaned)) {
    return null;
  }

  const hasPathSlash = cleaned.includes('/');
  const hasFileExt = fileExtRegex.test(cleaned);
  const isKnownFile = knownFilenames.test(cleaned);

  if (!isKnownFile && !hasFileExt && !hasPathSlash) {
    return null;
  }

  // If no extension, ensure it has multiple directory segments and doesn't end with a slash
  if (!isKnownFile && !hasFileExt) {
    const segments = cleaned.split('/');
    if (segments.length < 2 || !segments[segments.length - 1]) return null;
  }

  const owner = effectiveContext?.owner;
  const repo = effectiveContext?.repo;
  const branch = effectiveContext?.branch || 'main';

  if (owner && repo) {
    const fullUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${cleaned}${lineHash || ''}`;
    return {
      filePath: cleaned,
      lineHash,
      url: fullUrl,
    };
  }

  return {
    filePath: cleaned,
    lineHash,
    url: `https://github.com/${cleaned}${lineHash || ''}`,
  };
}

/**
 * Jumps to a GitHub file in a single click:
 * In a Chrome Extension side panel, updates the user's active GitHub tab to the file URL.
 * Falls back to window.open for standalone / popup environments.
 */
export function jumpToGitHubFile(url: string): void {
  if (!url) return;

  if (isChromeExtension() && chrome.tabs?.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs?.[0];
      if (activeTab?.id) {
        chrome.tabs.update(activeTab.id, { url });
      } else if (chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    });
    return;
  }

  // Fallback for standalone web view
  window.open(url, '_blank');
}

