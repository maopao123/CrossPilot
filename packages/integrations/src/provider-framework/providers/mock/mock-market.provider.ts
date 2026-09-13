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
  ResearchEvidence,
  VocProductAnalysisResult,
  ProductReviewHealthResult,
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
  {
    capabilityId: 'review.product.health',
    providerId: MOCK_PROVIDER_ID,
    transport: 'NATIVE',
    enabled: true,
    priority: 10,
  },
  {
    capabilityId: 'voc.product.analyze',
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
        const isFileBox = keyword.toLowerCase().includes('file') || keyword.toLowerCase().includes('box');
        const mockProducts: MarketProduct[] = isFileBox
          ? [
              {
                source: 'MOCK',
                marketplace,
                externalId: 'B0D8CNX88V',
                asin: 'B0D8CNX88V',
                title: 'Staples File Folder Tote, Portable Filing Box for Letter Size Hanging Files',
                brand: 'Staples',
                category: 'Office Products > Office & School Supplies > Filing Products',
                price: 16.99,
                monthlySales: 2100,
                monthlyRevenue: 35679,
                rating: 4.3,
                reviewCount: 3072,
                bsr: 1850,
                sourceUrl: 'https://www.amazon.com/dp/B0D8CNX88V',
                imageUrl: 'https://m.media-amazon.com/images/I/51x6hBdspOL._AC_UY512_.jpg',
                capturedAt: new Date().toISOString(),
              },
              {
                source: 'MOCK',
                marketplace,
                externalId: 'B0CFTQ4418',
                asin: 'B0CFTQ4418',
                title: 'BALEINE File Organizer Box with Lid, Collapsible Hanging File Storage Box',
                brand: 'BALEINE',
                category: 'Office Products > Office & School Supplies > Filing Products',
                price: 16.99,
                monthlySales: 1850,
                monthlyRevenue: 31431,
                rating: 4.5,
                reviewCount: 1971,
                bsr: 2100,
                sourceUrl: 'https://www.amazon.com/dp/B0CFTQ4418',
                imageUrl: 'https://m.media-amazon.com/images/I/81bbib0eJRL._AC_UY512_.jpg',
                capturedAt: new Date().toISOString(),
              },
              {
                source: 'MOCK',
                marketplace,
                externalId: 'B09P66C658',
                asin: 'B09P66C658',
                title: 'File Organizer Box with Lids, Collapsible File Folder Organizer Bin',
                brand: 'Collapsible Home',
                category: 'Office Products > Office & School Supplies > Filing Products',
                price: 16.99,
                monthlySales: 3200,
                monthlyRevenue: 54368,
                rating: 4.4,
                reviewCount: 6962,
                bsr: 1400,
                sourceUrl: 'https://www.amazon.com/dp/B09P66C658',
                imageUrl: 'https://m.media-amazon.com/images/I/81lZwsI658L._AC_UY512_.jpg',
                capturedAt: new Date().toISOString(),
              },
            ]
          : [
              {
                source: 'MOCK',
                marketplace,
                externalId: 'B08XYZ1234',
                asin: 'B08XYZ1234',
                title: `Premium Quality Heavy Duty ${keyword} Organizer`,
                brand: 'CoreBrand Pro',
                category: 'Home & Kitchen > Storage & Organization',
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
                title: `Modern Multi-Slot Durable ${keyword} Stand`,
                brand: 'KES Home',
                category: 'Home & Kitchen > Storage & Organization',
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
                title: `Universal Compatible Compact ${keyword} Caddy`,
                brand: 'POLEGAS',
                category: 'Home & Kitchen > Storage & Organization',
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
        const mockKeywordMetric: KeywordMetric = {
          source: 'MOCK',
          marketplace,
          keyword,
          searchVolume: isFileBox ? 65500 : 48500,
          competition: isFileBox ? 0.74 : 0.65,
          cpc: isFileBox ? 1.98 : 1.25,
          abaRank: isFileBox ? 8724 : 3200,
          relevance: null,
          growth: null,
          topAsins: isFileBox ? ['B0D8CNX88V', 'B0CFTQ4418', 'B09P66C658'] : ['B08XYZ1234', 'B09ABC5678', 'B0C7M8W101'],
          capturedAt: new Date().toISOString(),
        };
        const mockEvidences: ResearchEvidence[] = [
          {
            evidenceId: `evi_kw_mock_${Date.now()}`,
            source: 'MOCK',
            providerId: 'mock',
            transport: 'NATIVE',
            mode: 'MOCK',
            type: 'KEYWORD',
            sourceId: keyword,
            title: `Mock Keyword Intelligence: ${keyword}`,
            content: `Search Volume: 48,500 | ABA Rank: #3,200 | CPC: $1.25 | Competition: 0.65`,
            capturedAt: new Date().toISOString(),
          },
          ...mockProducts.map((p) => ({
            evidenceId: `evi_prod_mock_${p.asin}_${Date.now()}`,
            source: 'MOCK',
            providerId: 'mock',
            transport: 'NATIVE',
            mode: 'MOCK' as const,
            type: 'MARKET_PRODUCT' as const,
            sourceId: p.asin,
            title: `Mock Product: ${p.asin}`,
            content: `${p.title} | Price: $${p.price} | Rating: ${p.rating} (${p.reviewCount} reviews)`,
            capturedAt: new Date().toISOString(),
          })),
        ];
        data = {
          query: { keyword, marketplace },
          keywordMetric: mockKeywordMetric,
          products: mockProducts,
          evidence: mockEvidences,
          provider: {
            providerId: 'mock',
            transport: 'NATIVE',
            mode: 'MOCK',
          },
        };
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
        const isFileBox = keyword.toLowerCase().includes('file') || keyword.toLowerCase().includes('box');
        const defaultCat = isFileBox
          ? 'Office Products > Office & School Supplies > Filing Products'
          : keyword.toLowerCase().includes('toothbrush')
            ? 'Home & Kitchen > Bath > Bathroom Accessories'
            : 'Home & Kitchen > Storage & Organization';
        const defaultTrending = isFileBox
          ? [
              { keyword: `${keyword} organizer`, volume: 28000, growth: '+28%' },
              { keyword: `decorative ${keyword}`, volume: 18400, growth: '+20%' },
              { keyword: `${keyword} with lock`, volume: 14200, growth: '+42%' },
            ]
          : [
              { keyword: `${keyword} organizer`, volume: 22000, growth: '+18%' },
              { keyword: `portable ${keyword}`, volume: 14500, growth: '+25%' },
              { keyword: `heavy duty ${keyword}`, volume: 12000, growth: '+35%' },
            ];
        const searchVol = isFileBox ? 65500 : 48500;
        const avgP = isFileBox ? 16.99 : 30.5;
        const avgR = isFileBox ? 4.4 : 4.42;
        const oppScore = isFileBox ? 8.5 : 8.8;

        const overview: MarketOverviewSnapshot = {
          seedKeyword: keyword,
          category: defaultCat,
          marketplace,
          searchVolumeMonthly: searchVol,
          avgPrice: avgP,
          avgRating: avgR,
          avgReviewCount: isFileBox ? 4001 : 1120,
          competitorCount: 12,
          opportunityScore: oppScore,
          competitionScore: isFileBox ? 7.4 : 6.5,
          trendingKeywords: defaultTrending,
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
              content: `月度检索量 ${searchVol.toLocaleString()}，均价 $${avgP.toFixed(2)}，平均评分 ${avgR}，选品机会评分 ${oppScore}。`,
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

      case 'review.product.health': {
        const asin = input?.asin || 'B0BFGNSXYL';
        const reviewHealthResult: ProductReviewHealthResult = {
          asin,
          marketplace,
          averageRating: 4.6,
          totalReviewCount: 5147,
          analyzedReviewCount: null,
          ratingDistribution: {
            '5_star': 78,
            '4_star': 12,
            '3_star': 4,
            '2_star': 2,
            '1_star': 4,
          },
          summary:
            '当前公开累计评价数：5,147，平均星级：4.6。当前 Provider 未提供单条 Review 文本，因此尚未进行文本级 VOC 分析。',
          supportedDimensions: [
            'averageRating',
            'totalReviewCount',
            'ratingTrend',
            'reviewCountTrend',
          ],
          unsupportedDimensions: [
            'painPoints',
            'praisePoints',
            'buyerMotivations',
            'negativeFeedback',
            'reviewTextExtraction',
          ],
          evidenceNotice:
            '商品评价与口碑指标基于平台公开数据，非物理工程质检结论。当前数据源未提供单条 Review 文本挖掘工具。',
        };
        data = reviewHealthResult;
        break;
      }

      case 'voc.product.analyze': {
        const asin = input?.asin || 'B0BFGNSXYL';
        const vocResult: VocProductAnalysisResult = {
          asin,
          marketplace,
          totalReviewCount: 5147,
          analyzedReviewCount: 5147,
          totalReviewsAnalyzed: 5147,
          averageRating: 4.6,
          ratingDistribution: {
            '5_star': 78,
            '4_star': 12,
            '3_star': 4,
            '2_star': 2,
            '1_star': 4,
          },
          painPoints: [
            {
              topic: 'Slot size too tight for larger electric toothbrush handles',
              category: 'PRODUCT_DESIGN',
              frequency: 45,
              percentage: 8.7,
              severity: 'HIGH',
              quotes: [
                {
                  quoteText:
                    'The hole is slightly too narrow for Philips Sonicare DiamondClean handle, scratches the silicone base.',
                  reviewDate: '2026-08-15',
                  rating: 2,
                  reviewer: 'Amazon Customer',
                },
                {
                  quoteText: 'Fits standard manual brushes fine, but electric heads are tight.',
                  reviewDate: '2026-07-28',
                  rating: 3,
                  reviewer: 'Sarah M.',
                },
              ],
            },
            {
              topic: 'Bottom water drainage requires frequent cleaning',
              category: 'MAINTENANCE',
              frequency: 31,
              percentage: 6.0,
              severity: 'MEDIUM',
              quotes: [
                {
                  quoteText: 'Water pools at the bottom bamboo insert if not dried weekly.',
                  reviewDate: '2026-08-02',
                  rating: 3,
                  reviewer: 'David K.',
                },
              ],
            },
          ],
          praisePoints: [
            {
              topic: 'Heavy marble resin material prevents tipping over',
              category: 'BUILD_QUALITY',
              frequency: 184,
              percentage: 35.7,
              quotes: [
                {
                  quoteText:
                    'Very sturdy and heavy enough that it never tips over when taking out toothbrushes.',
                  reviewDate: '2026-08-20',
                  rating: 5,
                  reviewer: 'Jennifer L.',
                },
              ],
            },
            {
              topic: 'Elegant aesthetic fits modern bathroom decor',
              category: 'AESTHETICS',
              frequency: 142,
              percentage: 27.6,
              quotes: [
                {
                  quoteText: 'Looks like real marble, matches my countertop vanity perfectly.',
                  reviewDate: '2026-08-11',
                  rating: 5,
                  reviewer: 'Michael P.',
                },
              ],
            },
          ],
          buyerMotivations: [
            {
              motivation: 'Bathroom countertop organization and clutter reduction',
              percentage: 42.0,
            },
            {
              motivation: 'Matching modern marble/minimalist bathroom decor',
              percentage: 31.5,
            },
            {
              motivation: 'Upgrading from plastic cup holders',
              percentage: 18.2,
            },
          ],
          summary:
            'Overall strong satisfaction (4.6★) driven by solid weight, elegant faux-marble appearance, and multi-slot utility. Primary customer friction point relates to slot width constraints on wider electric toothbrush models.',
          evidenceNotice:
            '买家原声数据基于用户评价观察采样，属于买家主观体验与反馈，非物理工程质检结论。',
        };
        data = vocResult;
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
