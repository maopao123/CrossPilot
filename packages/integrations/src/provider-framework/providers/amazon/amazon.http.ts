import { assertAmazonReadOnly } from './amazon.allowlist.js';
import { AMAZON_SP_API_ENDPOINTS, AmazonRegion } from './amazon.config.js';
import { mapAmazonHttpError } from './amazon.errors.js';

export interface AmazonHttpClientOptions {
  region: AmazonRegion;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

export class AmazonHttpClient {
  constructor(private readonly options: AmazonHttpClientOptions) {}

  async getJson<T = any>(pathWithQuery: string): Promise<T> {
    assertAmazonReadOnly('GET', pathWithQuery);
    const base = AMAZON_SP_API_ENDPOINTS[this.options.region];
    const url = `${base}${pathWithQuery}`;
    const token = await this.options.getAccessToken();
    const fetchFn = this.options.fetchImpl || fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs || 20000);
    try {
      const res = await fetchFn(url, {
        method: 'GET',
        headers: {
          host: new URL(base).host,
          'x-amz-access-token': token,
          'x-amz-date': new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
          'user-agent': this.options.userAgent || 'CrossPilot/9.1 (Language=JavaScript/Node)',
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        const mapped = mapAmazonHttpError(res.status, text);
        const err: any = new Error(mapped.message);
        err.code = mapped.code;
        err.details = mapped.details;
        err.retryable = mapped.retryable;
        throw err;
      }
      return text ? (JSON.parse(text) as T) : ({} as T);
    } finally {
      clearTimeout(timer);
    }
  }
}
