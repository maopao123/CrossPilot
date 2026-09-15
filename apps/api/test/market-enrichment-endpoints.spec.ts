import { MarketService } from '../src/modules/market/market.service.js';
import { IntegrationGateway } from '@crosspilot/integrations';
import type { CandidateDraft } from '@crosspilot/shared';

describe('MarketService Phase 2B Enrichment Endpoints', () => {
  let service: MarketService;
  const mockPrisma: any = {
    marketResearchProject: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const draft: CandidateDraft = {
    id: 'draft-amazon_us-toothbrush-holder',
    marketplace: 'AMAZON_US',
    title: 'Toothbrush Holder',
    productType: 'Toothbrush Holder',
    clusterId: 'cluster-th',
    primaryKeyword: 'toothbrush holder',
    supportingKeywords: [],
    representativeAsins: ['B0BFGNSXYL'],
    discoveryMetrics: {
      demand: { value: 27057, source: 'FACT' },
      keywordCount: 1,
      asinSampleSize: 1,
    },
    evidenceIds: ['evi-kw-seed'],
    discoveryReasons: [],
    missingRequirements: [],
    status: 'READY_FOR_ENRICHMENT',
    dedupKey: 'AMAZON_US:toothbrush holder',
  };

  beforeEach(() => {
    service = new MarketService(mockPrisma);
  });

  it('runs enrichment against mocked gateway without fabricating prices', async () => {
    const gateway = IntegrationGateway.getInstance();
    jest.spyOn(gateway, 'hasCapability').mockReturnValue(true);
    jest.spyOn(gateway, 'getCapabilityCost').mockReturnValue(1);
    jest.spyOn(gateway, 'executeCapability').mockImplementation(async (capabilityId: string, input: any) => {
      if (capabilityId === 'market.product.detail') {
        return {
          success: true,
          data: { asin: input.asin, title: 'GFWARE Holder', price: 9.99, rating: 4.6, reviewCount: 100 },
          providerId: 'xydc',
          transport: 'MCP',
          remoteToolName: 'get_asin_info',
          capabilityId,
          durationMs: 1,
          mode: 'LIVE',
          capturedAt: '2026-09-15T00:00:00Z',
        } as any;
      }
      if (capabilityId === 'voc.product.analyze') {
        return {
          success: true,
          data: { vocSourceType: 'EXTERNAL_VOC', painPoints: [], analyzedReviewCount: 0 },
          providerId: 'firecrawl',
          transport: 'HTTP',
          capabilityId,
          durationMs: 1,
          mode: 'LIVE',
          capturedAt: '2026-09-15T00:00:00Z',
        } as any;
      }
      return {
        success: true,
        data: { asin: input.asin, averageRating: 4.6, totalReviewCount: 100, analyzedReviewCount: null },
        providerId: 'xydc',
        transport: 'MCP',
        capabilityId,
        durationMs: 1,
        mode: 'LIVE',
        capturedAt: '2026-09-15T00:00:00Z',
      } as any;
    });

    const run = await service.runEnrichment({
      draft,
      marketplace: 'AMAZON_US',
      extraEvidence: [
        {
          id: 'evi-kw-seed',
          scope: 'KEYWORD',
          subjectId: 'kw-amazon_us-toothbrush-holder',
          source: 'xydc',
          content: 'demand 27057',
        },
      ],
      options: { maxCompetitors: 1, enableTextVoc: true, enableProductTrend: false },
    });

    expect(run.enriched.competitorSample.actualSampleSize).toBe(1);
    expect(run.enriched.competitors[0].price?.value).toBe(9.99);
    expect(run.enriched.voc.sourceType).toBe('UNAVAILABLE');
    expect(run.enriched.pricePositioning.suggestedTargetPrice?.source).not.toBe('FACT');

    const handed = service.handoffEnrichment(run);
    expect(handed.decision).toBe('NEEDS_VALIDATION');
    expect(handed.risks.every((r) => r.status === 'UNVERIFIED')).toBe(true);
  });
});
