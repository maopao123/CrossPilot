import { RawTextItem, VocSourceType } from '@crosspilot/shared';

export interface FirecrawlSearchItem {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
  metadata?: Record<string, unknown>;
}

export interface FirecrawlSearchResponse {
  success: boolean;
  data?: FirecrawlSearchItem[];
  error?: string;
  id?: string;
  creditsUsed?: number;
}

export interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

export interface FirecrawlClientConfig {
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
}

export interface FirecrawlVocQueryInput {
  asin?: string;
  keyword?: string;
  marketplace?: string;
  category?: string;
  limit?: number;
}
