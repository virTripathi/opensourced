/**
 * Sanitizes untrusted GitHub issue content and community comments
 * to prevent prompt injection and context poisoning attacks.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
  /system\s+prompt\s+override/gi,
  /you\s+are\s+now\s+(in\s+)?(developer\s+mode|dan|jailbreak)/gi,
  /disregard\s+(all\s+)?safety\s+guidelines/gi,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
];

export interface SanitizationResult {
  sanitizedText: string;
  injectionDetected: boolean;
  neutralizedPatterns: string[];
}

export function sanitizeGitHubContent(rawContent: string): SanitizationResult {
  if (!rawContent) {
    return { sanitizedText: '', injectionDetected: false, neutralizedPatterns: [] };
  }

  let text = rawContent;
  const neutralizedPatterns: string[] = [];

  // 1. Remove hidden HTML comments and zero-width characters
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 2. Scan and neutralize prompt injection keywords
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      neutralizedPatterns.push(pattern.source);
      text = text.replace(pattern, '[REMOVED_POTENTIAL_INJECTION]');
    }
  }

  return {
    sanitizedText: text.trim(),
    injectionDetected: neutralizedPatterns.length > 0,
    neutralizedPatterns,
  };
}

/**
 * Wraps external content in typed delimiter tags for strict system prompt boundary isolation
 */
export function wrapInUntrustedBoundary(
  tag: string,
  content: string
): string {
  const { sanitizedText } = sanitizeGitHubContent(content);
  return `<untrusted_${tag}>\n${sanitizedText}\n</untrusted_${tag}>`;
}
