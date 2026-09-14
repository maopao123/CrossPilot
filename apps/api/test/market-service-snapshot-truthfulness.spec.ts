import { MarketService } from '../src/modules/market/market.service.js';
import { IntegrationGateway } from '@crosspilot/integrations';

describe('BA-R1: MarketService.getMarketSnapshot Truthfulness', () => {
  let service: MarketService;
  const mockPrisma: any = {
    marketResearchProject: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(() => {
    service = new MarketService(mockPrisma);
  });

  it('proves pre-fix failure: LIVE branch with empty products/metrics must return nulls and zero fake trending keywords', async () => {
    const gateway = IntegrationGateway.getInstance();
    jest.spyOn(gateway, 'executeCapability').mockResolvedValueOnce({
      success: true,
      data: { products: [] },
      providerId: 'xydc',
      transport: 'MCP',
      mode: 'LIVE',
      capturedAt: '2026-09-14T00:00:00.000Z',
    } as any);

    const snapshot = await service.getMarketSnapshot(undefined, 'ergonomic chair', 'AMAZON_US');

    // Truthfulness assertions:
    const snap = snapshot as any;
    expect(snap.mode).toBe('LIVE');
    expect(snap.provider).toBe('xydc');
    expect(snap.avgPrice).toBeNull();
    expect(snapshot.searchVolumeMonthly).toBeNull();
    expect(snapshot.opportunityScore).toBeNull();
    expect(snapshot.competitionScore).toBeNull();
    expect(snapshot.avgRating).toBeNull();
    expect(snapshot.avgReviewCount).toBeNull();
    expect(snapshot.category).toBeNull();
    expect(snapshot.competitorCount).toBe(0);
    // trendingKeywords must NOT be fabricated from seed keyword templates
    expect(snapshot.trendingKeywords).toEqual([]);
  });

  it('proves real products are calculated correctly without fake constant fallbacks', async () => {
    const gateway = IntegrationGateway.getInstance();
    jest.spyOn(gateway, 'executeCapability').mockResolvedValueOnce({
      success: true,
      data: {
        keywordMetric: {
          searchVolume: 10000,
          competition: 0.4,
        },
        products: [
          { price: 20.0, rating: 4.5, reviewCount: 200, category: 'Office Products' },
          { price: 40.0, rating: 4.5, reviewCount: 400, category: 'Office Products' },
        ],
      },
      providerId: 'xydc',
      transport: 'MCP',
      mode: 'LIVE',
      capturedAt: '2026-09-14T00:00:00.000Z',
    } as any);

    const snapshot = await service.getMarketSnapshot(undefined, 'ergonomic chair', 'AMAZON_US');

    expect(snapshot.mode).toBe('LIVE');
    expect(snapshot.avgPrice).toBe(30.0);
    expect(snapshot.avgRating).toBe(4.5);
    expect(snapshot.avgReviewCount).toBe(300);
    expect(snapshot.searchVolumeMonthly).toBe(43000); // 10000 * 4.3
    expect(snapshot.competitionScore).toBe(4.0); // 0.4 * 10
    expect(snapshot.opportunityScore).toBe(7.6); // 10 - 0.4 * 6
    expect(snapshot.category).toBe('Office Products');
    expect(snapshot.competitorCount).toBe(2);
  });
});
