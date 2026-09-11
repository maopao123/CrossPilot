import {
  CapabilityBinding,
  IntegrationProviderDefinition,
  ProviderAdapter,
  ProviderExecutionContext,
  ProviderExecutionResult,
  ProviderHealth,
} from '../../core/provider.types.js';
import {
  KeywordMetric,
  MarketOverviewSnapshot,
  MarketProduct,
  MarketTrend,
} from '@crosspilot/shared';

export const MOCK_PROVIDER_ID = 'mock';

export const MOCK_PROVIDER_DEFINITION: IntegrationProviderDefinition = {
  id: MOCK_PROVIDER_ID,
  name: '系统内置确定性数据源 (Mock)',
  category: 'MARKET_DATA',
  transport: 'NATIVE',
  enabled: true,
  priority: 10,
  timeoutMs: 1000,
  metadata: {
    isMock: true,
    description: '用于离线测试、断网兜底与开发演示的确定性基准数据源',
  },
};

export const MOCK_CAPABILITY_BINDINGS: CapabilityBinding[] = [
  {
    capabilityId: 'market.product.search',
    providerId: MOCK_PROVIDER_ID,
    transport: 'NATIVE',
    enabled: true,
    priority: 10,
  },
  {
    capabilityId: 'market.product.detail',
    providerId: MOCK_PROVIDER_ID,
    transport: 'NATIVE',
    enabled: true,
    priority: 10,
  },
  {
    capabilityId: 'market.market.overview',
    providerId: MOCK_PROVIDER_ID,
    transport: 'NATIVE',
    enabled: true,
    priority: 10,
  },
  {
    capabilityId: 'market.keyword.search',
    providerId: MOCK_PROVIDER_ID,
    transport: 'NATIVE',
    enabled: true,
    priority: 10,
  },
  {
    capabilityId: 'market.product.trend',
    providerId: MOCK_PROVIDER_ID,
    transport: 'NATIVE',
    enabled: true,
    priority: 10,
  },
];

export class MockMarketProvider implements ProviderAdapter {
  readonly providerId = MOCK_PROVIDER_ID;
  readonly transport = 'NATIVE';

  async checkHealth(): Promise<ProviderHealth> {
    return {
      providerId: this.providerId,
      status: 'HEALTHY',
      latencyMs: 1,
      lastCheckedAt: new Date().toISOString(),
      message: 'Mock provider always responsive',
    };
  }

  async execute(
    capabilityId: string,
    binding: CapabilityBinding,
    input: any,
    context: ProviderExecutionContext,
  ): Promise<ProviderExecutionResult<any>> {
    const startTime = Date.now();
    const marketplace = context.marketplace || 'AMAZON_US';
    const keyword = input?.keyword || input?.seedKeyword || 'marble toothbrush holder';

    let data: any;

    switch (capabilityId) {
      case 'market.product.search': {
        const mockProducts: MarketProduct[] = [
          {
            source: 'MOCK',
            marketplace,
            externalId: 'B08XYZ1234',
            asin: 'B08XYZ1234',
            title: 'LuxStone Heavy Natural Resin Toothbrush Caddy',
            brand: 'LuxStone Home',
            category: 'Home & Kitchen > Bath',
            price: 27.99,
            monthlySales: 1100,
            monthlyRevenue: 30789,
            rating: 4.3,
            reviewCount: 850,
            bsr: 4200,
            sourceUrl: 'https://www.amazon.com/dp/B08XYZ1234',
            capturedAt: new Date().toISOString(),
          },
          {
            source: 'MOCK',
            marketplace,
            externalId: 'B09ABC5678',
            asin: 'B09ABC5678',
            title: 'KES Heavy Marble Base Toothbrush Stand SUS304',
            brand: 'KES Home',
            category: 'Home & Kitchen > Bath',
            price: 34.99,
            monthlySales: 1650,
            monthlyRevenue: 57733,
            rating: 4.6,
            reviewCount: 1420,
            bsr: 2300,
            sourceUrl: 'https://www.amazon.com/dp/B09ABC5678',
            capturedAt: new Date().toISOString(),
          },
          {
            source: 'MOCK',
            marketplace,
            externalId: 'B0C7M8W101',
            asin: 'B0C7M8W101',
            title: 'POLEGAS Natural Marble Toothbrush Holder 1.5" Wide Slots',
            brand: 'POLEGAS',
            category: 'Home & Kitchen > Bath',
            price: 29.99,
            monthlySales: 980,
            monthlyRevenue: 29390,
            rating: 4.5,
            reviewCount: 420,
            bsr: 3800,
            sourceUrl: 'https://www.amazon.com/dp/B0C7M8W101',
            capturedAt: new Date().toISOString(),
          },
        ];
        data = mockProducts;
        break;
      }

      case 'market.product.detail': {
        const asin = input?.asin || 'B08XYZ1234';
        const mockProduct: MarketProduct = {
          source: 'MOCK',
          marketplace,
          externalId: asin,
          asin,
          title: 'LuxStone Heavy Natural Resin Toothbrush Caddy',
          brand: 'LuxStone Home',
          category: 'Home & Kitchen > Bath',
          price: 27.99,
          monthlySales: 1100,
          monthlyRevenue: 30789,
          rating: 4.3,
          reviewCount: 850,
          bsr: 4200,
          sourceUrl: `https://www.amazon.com/dp/${asin}`,
          capturedAt: new Date().toISOString(),
        };
        data = mockProduct;
        break;
      }

      case 'market.market.overview': {
        const overview: MarketOverviewSnapshot = {
          seedKeyword: keyword,
          category: 'Home & Kitchen > Bath > Bathroom Accessories',
          marketplace,
          searchVolumeMonthly: 48500,
          avgPrice: 30.5,
          avgRating: 4.42,
          avgReviewCount: 1120,
          competitorCount: 12,
          opportunityScore: 8.8,
          competitionScore: 6.5,
          trendingKeywords: [
            { keyword: 'marble toothbrush holder', volume: 22000, growth: '+18%' },
            { keyword: 'heavy stone toothbrush stand', volume: 14500, growth: '+25%' },
            { keyword: 'electric toothbrush caddy wide slots', volume: 12000, growth: '+45%' },
          ],
          source: 'MOCK',
          mode: 'MOCK',
          capturedAt: new Date().toISOString(),
          evidence: [
            {
              evidenceId: `ev_mock_${Date.now()}`,
              source: 'MOCK',
              providerId: this.providerId,
              type: 'MARKET_METRIC',
              sourceId: keyword,
              title: `基准市场大盘数据 - ${keyword}`,
              content: `月度检索量 48,500，均价 $30.50，平均评分 4.42，选品机会评分 8.8。`,
              mode: 'MOCK',
              capturedAt: new Date().toISOString(),
            },
          ],
        };
        data = overview;
        break;
      }

      case 'market.keyword.search': {
        const keywords: KeywordMetric[] = [
          {
            source: 'MOCK',
            marketplace,
            keyword: 'marble toothbrush holder',
            searchVolume: 22000,
            competition: 0.65,
            relevance: 0.98,
            cpc: 1.45,
            growth: '+18%',
            capturedAt: new Date().toISOString(),
          },
          {
            source: 'MOCK',
            marketplace,
            keyword: 'heavy stone toothbrush stand',
            searchVolume: 14500,
            competition: 0.52,
            relevance: 0.92,
            cpc: 1.2,
            growth: '+25%',
            capturedAt: new Date().toISOString(),
          },
          {
            source: 'MOCK',
            marketplace,
            keyword: 'electric toothbrush caddy wide slots',
            searchVolume: 12000,
            competition: 0.45,
            relevance: 0.88,
            cpc: 1.1,
            growth: '+45%',
            capturedAt: new Date().toISOString(),
          },
        ];
        data = keywords;
        break;
      }

      case 'market.product.trend': {
        const trend: MarketTrend = {
          source: 'MOCK',
          marketplace,
          subjectId: input?.asin || 'B08XYZ1234',
          metric: 'SALES',
          points: [
            { date: '2026-06-01', value: 920 },
            { date: '2026-07-01', value: 1050 },
            { date: '2026-08-01', value: 1240 },
            { date: '2026-09-01', value: 1380 },
          ],
        };
        data = trend;
        break;
      }

      default:
        data = { message: 'Mock response', input };
    }

    return {
      success: true,
      data,
      providerId: this.providerId,
      transport: this.transport,
      capabilityId,
      durationMs: Date.now() - startTime,
      mode: 'MOCK',
      capturedAt: new Date().toISOString(),
    };
  }
}
