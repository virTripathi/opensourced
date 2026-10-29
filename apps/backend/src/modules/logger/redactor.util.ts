/**
 * Deep Redaction Utility for OpenSourced Backend
 * Ensures all tokens, secrets, encryption keys, and sensitive credentials
 * are thoroughly scrubbed before being written to app.log.json.
 */

const SENSITIVE_KEY_REGEX =
  /^(client_?id|client_?secret|encryption_?key|.*token.*|.*secret.*|.*password.*|.*key$|api_?key|gemini.*key|authorization|cookie|set-cookie|pat|code_verifier|private_?key)$/i;

const SENSITIVE_VALUE_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'BEARER_TOKEN', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  { name: 'GITHUB_TOKEN', regex: /gh[pousr]_[A-Za-z0-9_]{20,255}/g },
  { name: 'JWT_TOKEN', regex: /eyJ[A-Za-z0-9-_=]{10,}\.[A-Za-z0-9-_=]{10,}\.?[A-Za-z0-9-_.+/=]*/g },
  { name: 'PRIVATE_KEY', regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----[\s\S]*?-----END[^\n]*/g },
  { name: 'GENERIC_KEY', regex: /(?:key|secret|token|password)=([^\s&]+)/gi },
];

/**
 * Checks whether an object property name corresponds to sensitive credentials
 */
export function isSensitiveKey(key: string): boolean {
  if (!key) return false;
  return SENSITIVE_KEY_REGEX.test(key.trim());
}

/**
 * Masks query string parameters in URLs (e.g., ?client_secret=xyz -> ?client_secret=[REDACTED])
 */
export function maskUrlQueryParams(url: string): string {
  if (!url || typeof url !== 'string') return url;

  try {
    // If it's a relative URL or absolute URL
    const isAbsolute = url.startsWith('http://') || url.startsWith('https://');
    const parsed = new URL(url, 'http://localhost');

    let modified = false;
    for (const [key] of parsed.searchParams.entries()) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    }

    if (!modified) return url;

    if (isAbsolute) {
      return parsed.toString();
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Fallback regex masking for non-standard URL strings
    return url.replace(/([?&](?:client_secret|client_id|token|access_token|key|api_key|secret)=)([^&]+)/gi, '$1[REDACTED]');
  }
}

/**
 * Masks sensitive substrings in a plain string (Bearer tokens, GitHub PATs, JWTs)
 */
export function maskStringContent(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;
  for (const { name, regex } of SENSITIVE_VALUE_PATTERNS) {
    if (name === 'BEARER_TOKEN') {
      result = result.replace(regex, 'Bearer [REDACTED]');
    } else if (name === 'GENERIC_KEY') {
      result = result.replace(regex, (match, val) => match.replace(val, '[REDACTED]'));
    } else {
      result = result.replace(regex, `[REDACTED_${name}]`);
    }
  }

  return result;
}

/**
 * Recursively scans and redacts any sensitive keys or values in arbitrary objects/arrays.
 * Handles circular references safely via WeakSet and limits traversal depth.
 */
export function redactSensitiveData(target: any, depth = 0, visited = new WeakSet()): any {
  if (target === null || target === undefined) return target;

  if (typeof target === 'string') {
    return maskStringContent(target);
  }

  if (typeof target !== 'object') {
    return target;
  }

  // Prevent infinite loops on circular objects
  if (visited.has(target)) {
    return '[CIRCULAR]';
  }
  visited.add(target);

  // Depth guard
  if (depth > 8) {
    return '[MAX_DEPTH_REACHED]';
  }

  // Handle Arrays
  if (Array.isArray(target)) {
    return target.map((item) => redactSensitiveData(item, depth + 1, visited));
  }

  // Handle Error instances
  if (target instanceof Error) {
    return {
      name: target.name,
      message: maskStringContent(target.message),
      stack: target.stack ? maskStringContent(target.stack) : undefined,
    };
  }

  // Handle plain objects
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(target)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'cookie') {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = redactSensitiveData(value, depth + 1, visited);
    }
  }

  return sanitized;
}

/**
 * Specifically scrubs HTTP header objects (case-insensitive)
 */
export function redactHttpHeaders(headers: Record<string, any> | undefined): Record<string, any> {
  if (!headers) return {};

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (
      lower === 'authorization' ||
      lower === 'cookie' ||
      lower === 'set-cookie' ||
      lower === 'x-api-key' ||
      lower === 'client-secret' ||
      lower === 'token'
    ) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = typeof v === 'string' ? maskStringContent(v) : redactSensitiveData(v);
    }
  }
  return clean;
}
