import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegrationGateway } from '@crosspilot/integrations';
import { OpportunityScoreEngine } from '@crosspilot/domain';
import {
  MarketOverviewSnapshot,
  MarketProduct,
  ProductOpportunity,
  ProductReviewHealthResult,
  ResearchCostBudget,
  ResearchEvidence,
  TrendSummary,
  VocProductAnalysisResult,
} from '@crosspilot/shared';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async getMarketSnapshot(workspaceId?: string, keyword?: string, marketplace = 'AMAZON_US') {
    let seedKeyword = keyword || 'marble toothbrush holder';
    let category = 'Home & Kitchen > Bath > Bathroom Accessories';

    if (workspaceId) {
      const project = await this.prisma.marketResearchProject.findFirst({
        where: { workspaceId },
        include: { snapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 } },
      });
      if (project) {
        seedKeyword = keyword || project.seedKeyword;
        category = project.category || category;
      }
    }

    try {
      const gateway = IntegrationGateway.getInstance();
      const res = await gateway.executeCapability(
        'market.market.overview',
        { keyword: seedKeyword, category, marketplace },
        {
          workspaceId: workspaceId || 'default',
          traceId: `trace_${Date.now()}`,
          marketplace,
        },
      );

      const data = res.data as MarketOverviewSnapshot;
      if (data) {
        return {
          seedKeyword: data.seedKeyword || seedKeyword,
          category: data.category || category,
          searchVolumeMonthly: data.searchVolumeMonthly || 48500,
          avgPrice: data.avgPrice || 30.5,
          avgRating: data.avgRating || 4.42,
          avgReviewCount: data.avgReviewCount || 1120,
          competitorCount: data.competitorCount || 3,
          opportunityScore: data.opportunityScore || 8.8,
          competitionScore: data.competitionScore || 6.5,
          trendingKeywords: data.trendingKeywords || [
            { keyword: 'marble toothbrush holder', volume: 22000, growth: '+18%' },
            { keyword: 'heavy stone toothbrush stand', volume: 14500, growth: '+25%' },
            { keyword: 'electric toothbrush caddy wide slots', volume: 12000, growth: '+45%' },
          ],
          provider: res.providerId,
          transport: res.transport,
          mode: res.mode,
          capturedAt: res.capturedAt,
          evidence: data.evidence || [],
        };
      }
    } catch (err) {
      // Graceful fallback to default snapshot if gateway encounters issue
    }

    return {
      seedKeyword,
      category,
      searchVolumeMonthly: 48500,
      avgPrice: 30.50,
      avgRating: 4.42,
      avgReviewCount: 1120,
      competitorCount: 3,
      opportunityScore: 8.8,
      competitionScore: 6.5,
      trendingKeywords: [
        { keyword: 'marble toothbrush holder', volume: 22000, growth: '+18%' },
        { keyword: 'heavy stone toothbrush stand', volume: 14500, growth: '+25%' },
        { keyword: 'electric toothbrush caddy wide slots', volume: 12000, growth: '+45%' },
      ],
      provider: 'mock',
      transport: 'NATIVE',
      mode: 'MOCK',
      capturedAt: new Date().toISOString(),
      evidence: [],
    };
  }

  async getCompetitors(workspaceId: string) {
    const competitors = await this.prisma.competitor.findMany({
      where: { workspaceId },
      include: {
        snapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 },
      },
    });

    return competitors.map((c) => ({
      id: c.id,
      asin: c.asin,
      brand: c.brand,
      title: c.title,
      category: c.category,
      imageUrl: c.imageUrl,
      price: c.snapshots[0] ? Number(c.snapshots[0].price) : 29.99,
      rating: c.snapshots[0] ? Number(c.snapshots[0].rating) : 4.4,
      reviewCount: c.snapshots[0] ? c.snapshots[0].reviewCount : 800,
      estimatedSales: c.snapshots[0] ? c.snapshots[0].estimatedSales : 1200,
      estimatedRevenue: c.snapshots[0] ? Number(c.snapshots[0].estimatedRevenue) : 36000,
      bsr: c.snapshots[0] ? c.snapshots[0].bsr : 3500,
    }));
  }

  async getVocTopics(workspaceId: string) {
    const topics = await this.prisma.vocTopic.findMany({
      where: { analysisRun: { workspaceId } },
      include: {
        analysisRun: true,
        topicReviews: {
          include: { review: true },
          take: 3,
        },
      },
      orderBy: { percentage: 'desc' },
    });

    return topics.map((t) => ({
      id: t.id,
      topicName: t.topicName,
      topicType: t.topicType,
      sentiment: t.sentiment,
      reviewCount: t.reviewCount,
      percentage: Number(t.percentage),
      severityScore: Number(t.severityScore),
      summary: t.summary,
      evidenceQuotes: t.topicReviews.map((tr) => ({
        reviewId: tr.reviewId,
        quote: tr.evidenceText,
        reviewer: tr.review.reviewerName,
        rating: tr.review.rating,
      })),
    }));
  }

  async getTopicEvidence(topicId: string, workspaceId: string) {
    const topic = await this.prisma.vocTopic.findFirst({
      where: {
        id: topicId,
        analysisRun: { workspaceId },
      },
      include: {
        topicReviews: {
          include: { review: true },
        },
      },
    });

    if (!topic) throw new NotFoundException(`Topic ${topicId} not found in workspace`);

    return {
      topicId: topic.id,
      topicName: topic.topicName,
      sentiment: topic.sentiment,
      percentage: Number(topic.percentage),
      evidenceCount: topic.topicReviews.length,
      evidenceReviews: topic.topicReviews.map((tr) => ({
        id: tr.review.id,
        reviewerName: tr.review.reviewerName,
        rating: tr.review.rating,
        reviewDate: tr.review.reviewDate,
        title: tr.review.title,
        content: tr.review.content,
        highlightedEvidence: tr.evidenceText,
        relevanceScore: Number(tr.relevanceScore),
      })),
    };
  }

  async getProductOpportunities(workspaceId: string) {
    const opportunities = await this.prisma.productOpportunity.findMany({
      where: { workspaceId },
      orderBy: { opportunityScore: 'desc' },
    });

    return opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      problemSummary: o.problemSummary,
      targetCustomer: o.targetCustomer,
      recommendedPositioning: o.recommendedPositioning,
      opportunityScore: Number(o.opportunityScore),
      confidenceLevel: Number(o.confidenceLevel),
      evidenceSummary: o.evidenceSummary,
      status: o.status,
    }));
  }

  async searchProducts(
    workspaceId: string,
    keyword: string,
    category?: string,
    marketplace = 'AMAZON_US',
    limit = 20,
  ) {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'market.product.search',
      { keyword, category, marketplace, limit },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    const rawData = res.data;
    const products = Array.isArray(rawData) ? rawData : rawData?.products || [];
    const keywordMetric = rawData?.keywordMetric || null;
    const query = rawData?.query || { keyword, marketplace };
    const evidence = rawData?.evidence || [];

    return {
      query,
      keywordMetric,
      products,
      total: products.length,
      evidence,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      compositeTrace: (res as any).compositeTrace,
      capturedAt: res.capturedAt,
    };
  }

  async getProductDetail(workspaceId: string, asin: string, marketplace = 'AMAZON_US') {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'market.product.detail',
      { asin, marketplace },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    return {
      product: res.data,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      capturedAt: res.capturedAt,
    };
  }

  async searchKeywords(
    workspaceId: string,
    keyword: string,
    marketplace = 'AMAZON_US',
    limit = 20,
  ) {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'market.keyword.search',
      { keyword, marketplace, limit },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    return {
      keywords: res.data || [],
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      capturedAt: res.capturedAt,
    };
  }

  async getProductTrend(
    workspaceId: string,
    asin: string,
    metric = 'ALL',
    range = '30d',
    marketplace = 'AMAZON_US',
  ) {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'market.product.trend',
      { asin, metric, range, marketplace },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    const trends = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
    return {
      trend: trends.length > 0 ? trends[0] : null,
      trends,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      capturedAt: res.capturedAt,
      metadata: res.metadata,
      evidence: res.metadata?.evidence || [],
    };
  }

  async getProductReviewHealth(
    workspaceId: string,
    asin: string,
    marketplace = 'AMAZON_US',
    skipCache = false,
  ) {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'review.product.health',
      { asin, marketplace, skipCache },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    return {
      health: res.data,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      capturedAt: res.capturedAt,
      metadata: res.metadata,
      evidence: res.metadata?.evidence || res.data?.evidence || [],
    };
  }

  async getProductVoc(
    workspaceId: string,
    asin: string,
    marketplace = 'AMAZON_US',
    skipCache = false,
  ) {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'voc.product.analyze',
      { asin, marketplace, skipCache },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    return {
      voc: res.data,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      capturedAt: res.capturedAt,
      metadata: res.metadata,
      evidence: res.metadata?.evidence || res.data?.evidence || [],
    };
  }

  async calculateOpportunity(
    workspaceId: string,
    keyword: string,
    asin?: string,
    marketplace = 'AMAZON_US',
    skipCache = false,
  ): Promise<ProductOpportunity> {
    const traceId = `trace_opp_${Date.now()}`;
    const gateway = IntegrationGateway.getInstance();

    let xydcCredits = 0;
    let firecrawlCredits = 0;
    let totalRequests = 0;
    let cacheHits = 0;

    // 1. Search products and get composite keyword metrics
    totalRequests++;
    let products: MarketProduct[] = [];
    let keywordMetric: any = null;
    let searchEvidences: ResearchEvidence[] = [];

    try {
      const searchRes = await gateway.executeCapability(
        'market.product.search',
        { keyword, marketplace, limit: 10 },
        { workspaceId: workspaceId || 'default', traceId, marketplace },
      );
      if (searchRes.mode === 'CACHED') cacheHits++;
      else xydcCredits += 1;

      const rawSearch = searchRes.data;
      products = Array.isArray(rawSearch) ? rawSearch : rawSearch?.products || [];
      keywordMetric = rawSearch?.keywordMetric || null;
      searchEvidences = rawSearch?.evidence || [];
    } catch (err) {
      // Graceful fallback
    }

    // 2. Select representative ASIN (provided asin, or top 1 from search results, or default)
    const targetAsin = asin || products[0]?.asin || 'B0BFGNSXYL';

    // 3. Fetch Trend for representative ASIN
    totalRequests++;
    let topAsinTrend: TrendSummary | null = null;
    let trendEvidences: ResearchEvidence[] = [];
    try {
      const trendRes = await gateway.executeCapability(
        'market.product.trend',
        { asin: targetAsin, metric: 'ALL', range: '30d', marketplace },
        { workspaceId: workspaceId || 'default', traceId, marketplace },
      );
      if (trendRes.mode === 'CACHED') cacheHits++;
      else xydcCredits += 1;

      const trends = Array.isArray(trendRes.data) ? trendRes.data : trendRes.data ? [trendRes.data] : [];
      if (trends.length > 0 && trends[0]?.summary) {
        topAsinTrend = trends[0].summary;
      }
      trendEvidences = trendRes.metadata?.evidence || [];
    } catch (err) {
      // Graceful fallback
    }

    // 4. Fetch Review Health for representative ASIN
    totalRequests++;
    let productReviewHealth: ProductReviewHealthResult | null = null;
    let reviewEvidences: ResearchEvidence[] = [];
    try {
      const healthRes = await gateway.executeCapability(
        'review.product.health',
        { asin: targetAsin, marketplace, skipCache },
        { workspaceId: workspaceId || 'default', traceId, marketplace },
      );
      if (healthRes.mode === 'CACHED') cacheHits++;
      else xydcCredits += 1;

      productReviewHealth = healthRes.data;
      reviewEvidences = healthRes.metadata?.evidence || healthRes.data?.evidence || [];
    } catch (err) {
      // Graceful fallback
    }

    // 5. Fetch External VOC for representative ASIN
    totalRequests++;
    let vocAnalysis: VocProductAnalysisResult | null = null;
    let vocEvidences: ResearchEvidence[] = [];
    try {
      const vocRes = await gateway.executeCapability(
        'voc.product.analyze',
        { asin: targetAsin, marketplace, skipCache },
        { workspaceId: workspaceId || 'default', traceId, marketplace },
      );
      if (vocRes.mode === 'CACHED') cacheHits++;
      else firecrawlCredits += 5;

      vocAnalysis = vocRes.data;
      vocEvidences = vocRes.metadata?.evidence || vocRes.data?.evidence || [];
    } catch (err) {
      // Graceful fallback
    }

    // Aggregate all unique evidences
    const allEvidences = [
      ...searchEvidences,
      ...trendEvidences,
      ...reviewEvidences,
      ...vocEvidences,
    ];

    // Compute Cost Budget (Strictly null USD without verified provider billing API)
    const costBudget: ResearchCostBudget = {
      xydcCredits,
      firecrawlCredits,
      totalRequests,
      cacheHits,
      estimatedCostUsd: null,
      costDisclaimer: '当前 Provider (XYDC / Firecrawl) 尚未接入官方实时计费账单接口，不虚构估算美元金额。',
    };

    // 6. Execute OpportunityScoreEngine
    return OpportunityScoreEngine.evaluate({
      keyword,
      marketplace,
      representativeAsin: targetAsin,
      keywordMetric,
      products,
      topAsinTrend,
      productReviewHealth,
      vocAnalysis,
      evidences: allEvidences,
      costBudget,
    });
  }
}

