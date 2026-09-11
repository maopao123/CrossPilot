/**
 * SecretProvider & Redaction Utilities
 * Provides governed, decoupled access to environment/vault credentials
 * and enforces strict redaction across logs, traces, and error payloads.
 */

export class SecretProvider {
  private static inMemoryOverrides: Map<string, string> = new Map();

  /**
   * Set runtime secret override (e.g. for testing)
   */
  static setSecret(key: string, value: string): void {
    this.inMemoryOverrides.set(key, value);
  }

  /**
   * Clear runtime secret overrides
   */
  static clearOverrides(): void {
    this.inMemoryOverrides.clear();
  }

  /**
   * Safe getter for secret credentials
   */
  static getSecret(key: string, defaultValue?: string): string | undefined {
    if (this.inMemoryOverrides.has(key)) {
      return this.inMemoryOverrides.get(key);
    }
    return process.env[key] || defaultValue;
  }

  /**
   * Mask a secret/token string for safe display (e.g., 'xydc_abc12345' -> 'xydc_****2345')
   */
  static maskToken(token?: string): string {
    if (!token) return '[NOT_SET]';
    if (token.length <= 8) return '****';
    const prefix = token.slice(0, 4);
    const suffix = token.slice(-4);
    return `${prefix}****${suffix}`;
  }

  /**
   * Recursively redact sensitive keys (token, secret, password, key, auth) from any object/string
   */
  static redact<T = any>(input: T): T {
    if (!input) return input;

    if (typeof input === 'string') {
      // Redact known token patterns if found in string
      let sanitized: string = input;
      const xydcToken = process.env.XYDC_MCP_TOKEN || this.inMemoryOverrides.get('XYDC_MCP_TOKEN');
      if (xydcToken && xydcToken.length > 5) {
        sanitized = sanitized.split(xydcToken).join('[REDACTED_TOKEN]');
      }
      return sanitized as unknown as T;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.redact(item)) as unknown as T;
    }

    if (typeof input === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(input)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('token') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('auth') ||
          lowerKey.includes('authorization') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('api_key')
        ) {
          result[key] = typeof value === 'string' ? this.maskToken(value) : '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.redact(value);
        } else if (typeof value === 'string') {
          result[key] = this.redact(value);
        } else {
          result[key] = value;
        }
      }
      return result as unknown as T;
    }

    return input;
  }
}
