/**
 * Shannon Entropy and Credential Secret Scanner
 * Prevents accidental leakage of tokens, keys, and private credentials.
 */

const SECRET_REGEX_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g },
  { name: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24}/g },
  { name: 'Slack Bot Token', regex: /xoxb-[0-9]{11}-[0-9]{11}-[0-9a-zA-Z]{24}/g },
  { name: 'Generic Private Key', regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----[\s\S]*?-----END/g },
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g },
];

/**
 * Calculates Shannon entropy of a string (bits per symbol)
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const frequencies: Record<string, number> = {};
  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const count of Object.values(frequencies)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

export interface SecretScanResult {
  hasSecrets: boolean;
  sanitizedText: string;
  detectedSecrets: { type: string; match: string }[];
}

export function scanAndRedactSecrets(text: string): SecretScanResult {
  let sanitized = text;
  const detectedSecrets: { type: string; match: string }[] = [];

  // 1. Regex Pattern Matching
  for (const { name, regex } of SECRET_REGEX_PATTERNS) {
    const matches = text.match(regex);
    if (matches) {
      for (const match of matches) {
        detectedSecrets.push({ type: name, match: `${match.slice(0, 4)}...${match.slice(-4)}` });
        sanitized = sanitized.replaceAll(match, `[REDACTED_${name.toUpperCase().replace(/\s+/g, '_')}]`);
      }
    }
  }

  // 2. High entropy token detection on words longer than 28 chars
  const words = sanitized.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanWord.length > 28) {
      // Exclude standard git commit SHAs (40 hex characters) or SHA-256 hashes
      const isPureHexHash = /^[0-9a-f]{32,64}$/i.test(cleanWord);
      if (isPureHexHash) continue;

      const entropy = calculateShannonEntropy(cleanWord);
      if (entropy > 4.75) {
        detectedSecrets.push({ type: 'High-Entropy Secret Token', match: `${cleanWord.slice(0, 4)}...` });
        sanitized = sanitized.replaceAll(cleanWord, '[REDACTED_HIGH_ENTROPY_TOKEN]');
      }
    }
  }

  return {
    hasSecrets: detectedSecrets.length > 0,
    sanitizedText: sanitized,
    detectedSecrets,
  };
}
