import {
  CapabilityBinding,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
  ProviderHealth,
  ProviderTransport,
} from '../../core/provider.types.js';
import { ProviderCache, buildProviderCacheKey } from '../../cache/provider-cache.js';
import { SecretProvider } from '../../secrets/secret-provider.js';
import { VocProductAnalysisResult } from '@crosspilot/shared';
import { FirecrawlClient } from './firecrawl.client.js';
import { FirecrawlMapper } from './firecrawl.mapper.js';
import { FIRECRAWL_PROVIDER_ID } from './firecrawl.config.js';
import { FirecrawlSearchItem } from './firecrawl.types.js';

export class FirecrawlVocProvider implements ProviderAdapter {
  readonly providerId = FIRECRAWL_PROVIDER_ID;
  readonly transport: ProviderTransport = 'HTTP';

  constructor(
    private readonly client: FirecrawlClient,
    private readonly cache: ProviderCache,
  ) {}

  async checkHealth(): Promise<ProviderHealth> {
    const apiKey = SecretProvider.getSecret('FIRECRAWL_API_KEY');
    return {
      providerId: this.providerId,
      status: apiKey ? 'HEALTHY' : 'DEGRADED',
      lastCheckedAt: new Date().toISOString(),
      message: apiKey ? 'Firecrawl API credentials present' : 'FIRECRAWL_API_KEY missing',
    };
  }

  async execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: any,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<VocProductAnalysisResult>> {
    const startTime = Date.now();
    const marketplace = input?.marketplace || context.marketplace || 'AMAZON_US';
    const subject = input?.asin || input?.keyword || 'B0BFGNSXYL';
    const queryKeyword = input?.keyword || input?.productTitle || 'toothbrush holder marble bathroom';

    // 1. Check Redis / Memory Shared Provider Cache
    const cacheKey = buildProviderCacheKey({
      providerId: this.providerId,
      capabilityId,
      marketplace,
      subject,
      parameters: 'default',
      version: 'v1',
    });

    try {
      const cached = await this.cache.get<VocProductAnalysisResult>(cacheKey);
      if (cached) {
        return {
          success: true,
          capabilityId,
          providerId: this.providerId,
          transport: this.transport,
          durationMs: Date.now() - startTime,
          mode: 'CACHED',
          credits: 0,
          providerUsage: {
            provider: 'firecrawl',
            requests: 0,
            pagesFetched: 0,
            creditsUsed: 0,
            providerUnits: 0,
            billingUnit: 'search_credits',
            unit: 'CREDITS',
            quantity: 0,
          },
          capturedAt: new Date().toISOString(),
          data: cached,
          metadata: {
            cacheHit: true,
            cacheKey,
            ttlSeconds: 43200,
            usage: {
              provider: 'firecrawl',
              creditsUsed: 0,
            },
          },
        };
      }
    } catch {
      // Ignore cache lookup errors, proceed to live call
    }

    // 2. Fetch Live External Texts from Firecrawl
    const allSearchItems: FirecrawlSearchItem[] = [];
    let totalCredits = 0;

    // Search query 1: broad product complaints and reviews
    const res1 = await this.client.search(`${queryKeyword} complaints reviews`, 15);
    if (res1.success && res1.data) {
      allSearchItems.push(...res1.data);
      totalCredits += res1.creditsUsed || 1;
    }

    // Search query 2: Reddit and forum discussions
    const res2 = await this.client.search(`site:reddit.com ${queryKeyword}`, 10);
    if (res2.success && res2.data) {
      allSearchItems.push(...res2.data);
      totalCredits += res2.creditsUsed || 1;
    }

    // Fallback if network issue or credentials missing
    if (allSearchItems.length === 0 && (!res1.success || !res2.success)) {
      return {
        success: false,
        capabilityId,
        providerId: this.providerId,
        transport: this.transport,
        durationMs: Date.now() - startTime,
        mode: 'DEGRADED',
        capturedAt: new Date().toISOString(),
        error: {
          code: 'EXTERNAL_VOC_FETCH_FAILED',
          message: res1.error || res2.error || 'Failed to fetch external VOC discussions from Firecrawl',
          retryable: true,
        },
      };
    }

    // 3. Normalize & Deduplicate Raw Texts with Scope classification
    const rawTexts = FirecrawlMapper.toRawTextItems(allSearchItems, subject, queryKeyword);

    // 4. Extract VOC Insights (Deterministic count and verified quotes)
    const { result } = FirecrawlMapper.extractVoc(subject, marketplace, rawTexts, 'LIVE', queryKeyword);

    // 5. Store in Cache (12 Hours TTL)
    try {
      await this.cache.set(cacheKey, result, 43200);
    } catch {
      // Non-fatal cache write error
    }

    const providerUsage = {
      provider: 'firecrawl',
      requests: (res1.success ? 1 : 0) + (res2.success ? 1 : 0),
      pagesFetched: allSearchItems.length,
      creditsUsed: totalCredits || 2,
      providerUnits: totalCredits || 2,
      billingUnit: 'search_credits',
      unit: 'CREDITS',
      quantity: totalCredits || 2,
    };

    return {
      success: true,
      capabilityId,
      providerId: this.providerId,
      transport: this.transport,
      durationMs: Date.now() - startTime,
      mode: 'LIVE',
      credits: totalCredits || 2,
      providerUsage,
      capturedAt: new Date().toISOString(),
      data: result,
      metadata: {
        cacheHit: false,
        cacheKey,
        rawItemsFetched: allSearchItems.length,
        normalizedTextsCount: rawTexts.length,
        usage: providerUsage,
      },
    };
  }
}
