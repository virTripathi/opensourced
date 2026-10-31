import { GitHubContext } from '../types/index.js';

/**
 * Parses a GitHub URL into repository coordinates and issue details
 */
export function parseGitHubUrl(urlStr: string): GitHubContext | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname !== 'github.com') {
      return null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const [owner, repo, type, id] = segments;

    const isIssue = type === 'issues' && !!id;
    const isPr = type === 'pull' && !!id;

    const issueNumber = isIssue || isPr ? parseInt(id, 10) : undefined;

    return {
      owner,
      repo,
      issueNumber: Number.isNaN(issueNumber) ? undefined : issueNumber,
      isIssue: isIssue || isPr,
      url: urlStr,
      labels: [],
    };
  } catch {
    return null;
  }
}
