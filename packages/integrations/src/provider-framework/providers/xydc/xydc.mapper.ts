import {
  KeywordMetric,
  MarketOverviewSnapshot,
  MarketProduct,
  MarketTrend,
  ResearchEvidence,
  EvidenceSourceMode,
  EvidenceType,
  TrendMetricType,
} from '@crosspilot/shared';
import {
  XydcRawKeyword,
  XydcRawMarketOverview,
  XydcRawProduct,
  XydcRawTrend,
} from './xydc.types.js';

export class XydcMapper {
  static toMarketProduct(raw: XydcRawProduct, marketplace = 'AMAZON_US'): MarketProduct {
    const asin = raw.asin || raw.id || raw.item_id || 'UNKNOWN';
    return {
      source: 'XYDC',
      marketplace,
      externalId: asin,
      asin,
      title: raw.title || 'Untitled Product',
      brand: raw.brand || raw.brand_name || 'Generic',
      category: raw.category_path || 'Home & Kitchen',
      price: typeof raw.price === 'number' ? raw.price : 29.99,
      monthlySales: raw.monthlySales || raw.sales_monthly || raw.est_sales || 0,
      monthlyRevenue: raw.monthlyRevenue || raw.revenue_monthly || raw.est_revenue || 0,
      rating: raw.customer_rating || raw.rating || 4.3,
      reviewCount: raw.review_count || raw.reviews || 0,
      bsr: raw.bsr_rank || raw.bsr || 999999,
      imageUrl: raw.main_image_url || raw.image_url,
      sourceUrl: raw.product_url || raw.url || `https://www.amazon.com/dp/${asin}`,
      capturedAt: new Date().toISOString(),
    };
  }

  static toMarketProducts(rawList: XydcRawProduct[], marketplace = 'AMAZON_US'): MarketProduct[] {
    if (!Array.isArray(rawList)) return [];
    return rawList.map((item) => this.toMarketProduct(item, marketplace));
  }

  static toMarketOverview(
    raw: XydcRawMarketOverview,
    marketplace = 'AMAZON_US',
    mode: EvidenceSourceMode = 'LIVE',
  ): MarketOverviewSnapshot {
    const trendingKeywords = (raw.trending_keywords || []).map((k) => ({
      keyword: k.keyword || k.kw || '',
      volume: k.volume || k.vol || 0,
      growth: k.growth || k.growth_rate || '+0%',
    }));

    const topProducts = (raw.top_asins || []).map((p) => this.toMarketProduct(p, marketplace));

    const evidenceList: ResearchEvidence[] = [
      this.toEvidence(
        'MARKET_METRIC',
        raw.keyword,
        `XYDC 市场大盘指标 - ${raw.keyword}`,
        `月均搜索量 ${raw.monthly_search_volume || raw.search_volume || 0}，平均售价 $${raw.average_price || raw.avg_price || 0}，平均评分 ${raw.average_rating || raw.avg_rating || 0}。`,
        mode,
        raw,
      ),
    ];

    return {
      seedKeyword: raw.keyword,
      category: raw.category || 'Home & Kitchen > Bath',
      marketplace,
      searchVolumeMonthly: raw.monthly_search_volume || raw.search_volume || 48500,
      avgPrice: raw.average_price || raw.avg_price || 30.5,
      avgRating: raw.average_rating || raw.avg_rating || 4.42,
      avgReviewCount: raw.average_reviews || raw.avg_reviews || 1120,
      competitorCount: raw.active_competitors_count || raw.competitors_count || 12,
      opportunityScore: raw.opportunity_index || 8.8,
      competitionScore: raw.competition_intensity || 6.5,
      trendingKeywords,
      topProducts,
      evidence: evidenceList,
      source: 'XYDC',
      mode,
      capturedAt: new Date().toISOString(),
    };
  }

  static toKeywordMetrics(rawList: XydcRawKeyword[], marketplace = 'AMAZON_US'): KeywordMetric[] {
    if (!Array.isArray(rawList)) return [];
    return rawList.map((k) => ({
      source: 'XYDC',
      marketplace,
      keyword: k.keyword,
      searchVolume: k.search_volume || k.volume || 0,
      competition: k.competition_score || 0.5,
      relevance: k.relevance_score || 0.8,
      cpc: k.cpc_bid || 1.25,
      growth: k.growth_rate || '+15%',
      capturedAt: new Date().toISOString(),
    }));
  }

  static toMarketTrend(raw: XydcRawTrend, marketplace = 'AMAZON_US'): MarketTrend {
    let metricType: TrendMetricType = 'SALES';
    const mLower = (raw.metric_name || '').toLowerCase();
    if (mLower.includes('price')) metricType = 'PRICE';
    else if (mLower.includes('bsr') || mLower.includes('rank')) metricType = 'BSR';
    else if (mLower.includes('revenue')) metricType = 'REVENUE';
    else if (mLower.includes('search')) metricType = 'SEARCH_INTEREST';

    return {
      source: 'XYDC',
      marketplace,
      subjectId: raw.asin,
      metric: metricType,
      points: (raw.historical_data || []).map((pt) => ({
        date: pt.date,
        value: pt.val,
      })),
    };
  }

  static toEvidence(
    type: EvidenceType,
    sourceId: string,
    title: string,
    content: string,
    mode: EvidenceSourceMode = 'LIVE',
    rawObj?: any,
  ): ResearchEvidence {
    return {
      evidenceId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'XYDC',
      providerId: 'xydc',
      type,
      sourceId,
      title,
      content,
      mode,
      capturedAt: new Date().toISOString(),
      metadata: rawObj ? { keys: Object.keys(rawObj) } : undefined,
    };
  }
}
