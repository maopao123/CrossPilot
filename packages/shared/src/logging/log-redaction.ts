/**
 * Log redaction & sanitization utilities for CrossPilot Automation Runtime.
 * Implements double-layer defense against leaking secrets, tokens, passwords, and sensitive credentials.
 */

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Normalized list of sensitive key names (case-insensitive, ignoring dashes/underscores).
 */
const EXACT_SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwd',
  'secret',
  'clientsecret',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'payloadenc',
  'credential',
  'credentials',
  'privatekey',
  'session',
  'sessionid',
]);

/**
 * Regex for patterns that definitely represent secret tokens or passwords inside strings.
 */
const CONNECTION_STRING_PASSWORD_REGEX =
  /((?:postgres|postgresql|redis|rediss|mysql|mongodb|mongodb\+srv):\/\/[^:\s/]*:)([^@\s]+)(@)/gi;
const BEARER_TOKEN_REGEX = /(Bearer\s+)[A-Za-z0-9_\-\.\:\=\+\/]+/gi;
const BASIC_AUTH_REGEX = /(Basic\s+)[A-Za-z0-9+/=]+/gi;
const SHOPIFY_ACCESS_TOKEN_REGEX = /(shpat_|shpca_)[A-Za-z0-9]+/gi;

/**
 * Determines whether a given object key should be redacted.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const normalized = key.toLowerCase().replace(/[-_]/g, '');

  if (EXACT_SENSITIVE_KEYS.has(normalized)) {
    return true;
  }

  // Suffix checks (e.g. shopifyAccessToken, clientSecret, adminPassword)
  // Exclude benign meta properties like tokenCount, tokenType, tokensRemaining, tokenStatus
  const benignSuffixes = ['count', 'type', 'remaining', 'total', 'status', 'id', 'exchanger', 'mode'];
  const hasBenignSuffix = benignSuffixes.some((s) => normalized.endsWith(s));
  if (hasBenignSuffix) {
    return false;
  }

  const sensitiveSuffixes = ['password', 'secret', 'token', 'credential', 'apikey', 'privatekey'];
  return sensitiveSuffixes.some((s) => normalized.endsWith(s));
}

/**
 * Sanitizes arbitrary string content against embedded secrets (URLs with passwords, Bearer tokens, etc.)
 */
export function sanitizeString(val: string): string {
  if (!val || typeof val !== 'string') return val;
  return val
    .replace(CONNECTION_STRING_PASSWORD_REGEX, `$1${REDACTED_PLACEHOLDER}$3`)
    .replace(BEARER_TOKEN_REGEX, `$1${REDACTED_PLACEHOLDER}`)
    .replace(BASIC_AUTH_REGEX, `$1${REDACTED_PLACEHOLDER}`)
    .replace(SHOPIFY_ACCESS_TOKEN_REGEX, `$1${REDACTED_PLACEHOLDER}`);
}

/**
 * Recursively traverses and sanitizes objects, arrays, and primitives.
 * Automatically breaks circular references and clamps to a maximum traversal depth.
 */
export function sanitizeLogData(
  data: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (depth > 8) {
    return '[TRUNCATED_DEPTH]';
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean' || typeof data === 'bigint') {
    return data;
  }

  if (typeof data === 'function') {
    return '[Function]';
  }

  if (typeof data === 'object') {
    if (seen.has(data)) {
      return '[CIRCULAR]';
    }
    seen.add(data);

    if (Array.isArray(data)) {
      return data.map((item) => sanitizeLogData(item, depth + 1, seen));
    }

    if (data instanceof Date) {
      return data.toISOString();
    }

    if (data instanceof RegExp) {
      return data.toString();
    }

    if (data instanceof Error) {
      return {
        name: data.name,
        message: sanitizeString(data.message),
        ...(process.env.NODE_ENV !== 'production' && data.stack
          ? { stack: sanitizeString(data.stack) }
          : {}),
      };
    }

    const output: Record<string, unknown> = {};
    const record = data as Record<string, unknown>;

    for (const [key, value] of Object.entries(record)) {
      if (isSensitiveKey(key)) {
        if (
          key.toLowerCase() === 'credentials' &&
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          output[key] = sanitizeLogData(value, depth + 1, seen);
        } else {
          output[key] = REDACTED_PLACEHOLDER;
        }
      } else {
        output[key] = sanitizeLogData(value, depth + 1, seen);
      }
    }

    return output;
  }

  return String(data);
}

/**
 * Creates a safe, non-sensitive summary of an execution payload.
 * Avoids logging full raw business parameters.
 */
export function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return { payloadType: typeof payload };
  }

  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  const safeKeys = keys.filter((k) => !isSensitiveKey(k));

  return {
    actionType: record.actionType ?? record.type,
    targetId: record.targetId ?? record.skuCode ?? record.sku ?? record.id,
    fieldNames: safeKeys,
    ...(record.payloadHash ? { payloadHash: record.payloadHash } : {}),
  };
}
