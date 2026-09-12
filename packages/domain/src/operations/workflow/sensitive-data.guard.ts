/**
 * Sensitive Data Persistence Guard (Epic 3 Phase 6.2)
 *
 * Sanitizes sensitive credentials, API keys, tokens, and secrets from
 * workflow state, traces, and metadata before persistent storage to
 * Postgres (AgentTask / AgentStep / Approval) or disk.
 */

const SENSITIVE_KEY_REGEX =
  /(api[-_]?key|secret|token|password|auth|authorization|bearer|cookie|credential)/i;

export class SensitiveDataGuard {
  /**
   * Deeply scrubs sensitive fields from any object or array.
   * Returns a sanitized copy without modifying the original input.
   */
  public static scrub<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input !== 'object') {
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => SensitiveDataGuard.scrub(item)) as unknown as T;
    }

    const scrubbed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        scrubbed[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        scrubbed[key] = SensitiveDataGuard.scrub(value);
      } else {
        scrubbed[key] = value;
      }
    }

    return scrubbed as T;
  }

  /**
   * Checks if an object contains any unredacted sensitive keys with values.
   */
  public static hasSensitiveData(input: unknown): boolean {
    if (input === null || input === undefined || typeof input !== 'object') {
      return false;
    }

    if (Array.isArray(input)) {
      return input.some((item) => SensitiveDataGuard.hasSensitiveData(item));
    }

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        if (typeof value === 'string' && value !== '[REDACTED]' && value.trim() !== '') {
          return true;
        }
      }
      if (typeof value === 'object' && value !== null) {
        if (SensitiveDataGuard.hasSensitiveData(value)) {
          return true;
        }
      }
    }

    return false;
  }
}
