import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SecretProvider } from '../../secrets/secret-provider.js';
import {
  FirecrawlClientConfig,
  FirecrawlSearchResponse,
  FirecrawlScrapeResponse,
} from './firecrawl.types.js';

const execFileAsync = promisify(execFile);

export class FirecrawlClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config?: FirecrawlClientConfig) {
    this.endpoint = config?.endpoint || 'https://api.firecrawl.dev/v1';
    this.apiKey = config?.apiKey || SecretProvider.getSecret('FIRECRAWL_API_KEY');
    this.timeoutMs = config?.timeoutMs || 20000;
  }

  private getAuthToken(): string | undefined {
    return this.apiKey || SecretProvider.getSecret('FIRECRAWL_API_KEY');
  }

  /**
   * Search external web, forums, and reviews using Firecrawl
   */
  async search(query: string, limit = 15): Promise<FirecrawlSearchResponse> {
    const token = this.getAuthToken();
    if (!token) {
      return {
        success: false,
        error: 'FIRECRAWL_API_KEY is not configured in environment or secret provider',
      };
    }

    const url = `${this.endpoint}/search`;
    const body = JSON.stringify({ query, limit });

    try {
      const { stdout } = await execFileAsync(
        'curl.exe',
        [
          '-s',
          '-X', 'POST',
          url,
          '-H', 'Content-Type: application/json',
          '-H', `Authorization: Bearer ${token}`,
          '-d', body,
        ],
        { timeout: this.timeoutMs, encoding: 'utf8' },
      );

      const parsed: FirecrawlSearchResponse = JSON.parse(stdout);
      return parsed;
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Firecrawl search request failed',
      };
    }
  }

  /**
   * Scrape URL content to clean markdown
   */
  async scrape(targetUrl: string): Promise<FirecrawlScrapeResponse> {
    const token = this.getAuthToken();
    if (!token) {
      return {
        success: false,
        error: 'FIRECRAWL_API_KEY is not configured',
      };
    }

    const url = `${this.endpoint}/scrape`;
    const body = JSON.stringify({ url: targetUrl, formats: ['markdown'] });

    try {
      const { stdout } = await execFileAsync(
        'curl.exe',
        [
          '-s',
          '-X', 'POST',
          url,
          '-H', 'Content-Type: application/json',
          '-H', `Authorization: Bearer ${token}`,
          '-d', body,
        ],
        { timeout: this.timeoutMs, encoding: 'utf8' },
      );

      const parsed: FirecrawlScrapeResponse = JSON.parse(stdout);
      return parsed;
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Firecrawl scrape request failed',
      };
    }
  }
}
