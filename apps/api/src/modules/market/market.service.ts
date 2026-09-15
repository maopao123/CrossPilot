import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegrationGateway, XydcMapper } from '@crosspilot/integrations';
import {
  CandidateComparisonEngine,
  CandidateDecisionEngine,
  CandidateEconomicsService,
  OpportunityScoreEngine,
  ProductDiscoveryService,
  CandidateHandoffService,
  CapabilityExecutor,
} from '@crosspilot/domain';
import {
  CandidateComparisonResult,
  CandidateDefaultsResponse,
  MarketOverviewSnapshot,
  MarketProduct,
  ProductCandidate,
  ProductOpportunity,
  ProductReviewHealthResult,
  ResearchCostBudget,
  ResearchEvidence,
  TrendSummary,
  VocProductAnalysisResult,
  ProductDiscoveryRequest,
  ProductDiscoveryRun,
  DiscoveryDryRunPreview,
  CandidateDraft,
  EvidenceItem,
  KeywordNode,
  AsinNode,
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

    const isFileBox = seedKeyword.toLowerCase().includes('file') || seedKeyword.toLowerCase().includes('box');
    const fallbackCategory = isFileBox
      ? 'Office Products > Office & School Supplies > Filing Products'
      : seedKeyword.toLowerCase().includes('toothbrush')
        ? 'Home & Kitchen > Bath > Bathroom Accessories'
        : 'Home & Kitchen > Storage & Organization';
    const fallbackTrending = isFileBox
      ? [
          { keyword: `${seedKeyword} organizer`, volume: 28000, growth: '+28%' },
          { keyword: `decorative ${seedKeyword}`, volume: 18400, growth: '+20%' },
          { keyword: `${seedKeyword} with lock`, volume: 14200, growth: '+42%' },
        ]
      : [
          { keyword: `${seedKeyword} organizer`, volume: 22000, growth: '+18%' },
          { keyword: `portable ${seedKeyword}`, volume: 14500, growth: '+25%' },
          { keyword: `heavy duty ${seedKeyword}`, volume: 12000, growth: '+35%' },
        ];
    const fallbackMonthly = isFileBox ? 65500 : 48500;
    const fallbackPrice = isFileBox ? 16.99 : 30.5;
    const fallbackRating = isFileBox ? 4.4 : 4.42;
    const fallbackReviews = isFileBox ? 4001 : 1120;
    const fallbackOppScore = isFileBox ? 8.5 : 8.8;
    const fallbackCompScore = isFileBox ? 7.4 : 6.5;

    try {
      const gateway = IntegrationGateway.getInstance();
      const searchRes = await gateway.executeCapability(
        'market.product.search',
        { keyword: seedKeyword, marketplace, limit: 5 },
        { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
      );

      if (searchRes.success && searchRes.data) {
        const rawData = searchRes.data as any;

        if (typeof XydcMapper !== 'undefined' && rawData?.overview) {
          return XydcMapper.toMarketOverview(rawData.overview, marketplace, searchRes.mode);
        }

        const kwMetric = rawData.keywordMetric;
        const prods = rawData.products || [];

        const prices = prods
          .map((p: any) => Number(p.price))
          .filter((p: number) => !isNaN(p) && p >= 0);
        const avgPrice =
          prices.length > 0
            ? Number((prices.reduce((a: number, b: number) => a + b, 0) / prices.length).toFixed(2))
            : null;

        const ratings = prods
          .map((p: any) => Number(p.rating))
          .filter((r: number) => !isNaN(r) && r >= 0);
        const avgRating =
          ratings.length > 0
            ? Number((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(2))
            : null;

        const reviews = prods
          .map((p: any) => Number(p.reviewCount))
          .filter((r: number) => !isNaN(r) && r >= 0);
        const avgReviewCount =
          reviews.length > 0
            ? Math.round(reviews.reduce((a: number, b: number) => a + b, 0) / reviews.length)
            : null;

        let searchVolumeMonthly: number | null = null;
        if (kwMetric?.searchVolume != null && Number.isFinite(Number(kwMetric.searchVolume))) {
          searchVolumeMonthly = Math.round(Number(kwMetric.searchVolume) * 4.3);
        } else if (
          kwMetric?.abaReport?.weeklySearchVolume != null &&
          Number.isFinite(Number(kwMetric.abaReport.weeklySearchVolume))
        ) {
          searchVolumeMonthly = Math.round(Number(kwMetric.abaReport.weeklySearchVolume) * 4.3);
        }

        let competitionScore: number | null = null;
        let opportunityScore: number | null = null;
        if (kwMetric?.competition != null && Number.isFinite(Number(kwMetric.competition))) {
          const comp = Number(kwMetric.competition);
          competitionScore = Number((comp * 10).toFixed(1));
          opportunityScore = Number(Math.max(1, 10 - comp * 6).toFixed(1));
        } else if (
          kwMetric?.competitiveDifficulty != null &&
          Number.isFinite(Number(kwMetric.competitiveDifficulty))
        ) {
          const comp = Number(kwMetric.competitiveDifficulty) / 100;
          competitionScore = Number((comp * 10).toFixed(1));
          opportunityScore = Number(Math.max(1, 10 - comp * 6).toFixed(1));
        }

        const derivedCategory =
          prods[0]?.category && String(prods[0].category).trim() !== ''
            ? String(prods[0].category).trim()
            : null;

        const competitorCount = Array.isArray(prods) ? prods.length : null;

        const trendingKeywords: Array<{ keyword: string; volume: number | null; growth: string | null }> = [];
        if (Array.isArray(rawData.trendingKeywords)) {
          for (const k of rawData.trendingKeywords) {
            const vol =
              typeof k.volume === 'number' && Number.isFinite(k.volume)
                ? k.volume
                : typeof k.vol === 'number' && Number.isFinite(k.vol)
                  ? k.vol
                  : null;
            const growthStr =
              typeof k.growth === 'string' && k.growth.trim() !== ''
                ? k.growth.trim()
                : typeof k.growth_rate === 'string' && k.growth_rate.trim() !== ''
                  ? k.growth_rate.trim()
                  : null;
            trendingKeywords.push({
              keyword: String(k.keyword || k.kw || '').trim(),
              volume: vol,
              growth: growthStr,
            });
          }
        }

        return {
          seedKeyword,
          category: derivedCategory,
          searchVolumeMonthly,
          avgPrice,
          avgRating,
          avgReviewCount,
          competitorCount,
          opportunityScore,
          competitionScore,
          trendingKeywords,
          provider: searchRes.providerId,
          transport: searchRes.transport,
          mode: searchRes.mode,
          capturedAt: searchRes.capturedAt,
          evidence: rawData.evidence || [],
        };
      }
    } catch (err) {
      // Graceful fallback to dynamic snapshot if gateway encounters issue
    }

    return {
      seedKeyword,
      category: fallbackCategory,
      searchVolumeMonthly: fallbackMonthly,
      avgPrice: fallbackPrice,
      avgRating: fallbackRating,
      avgReviewCount: fallbackReviews,
      competitorCount: 12,
      opportunityScore: fallbackOppScore,
      competitionScore: fallbackCompScore,
      trendingKeywords: fallbackTrending,
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

  async getProductOpportunities(workspaceId: string, keyword?: string) {
    const where: any = { workspaceId };
    if (keyword && keyword.trim()) {
      const kw = keyword.trim();
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { problemSummary: { contains: kw, mode: 'insensitive' } },
        { recommendedPositioning: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const opportunities = await this.prisma.productOpportunity.findMany({
      where,
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

    // 2. Select representative ASIN (strictly from user input or search results, never hardcoded fallback)
    const targetAsin = (asin && asin.trim()) || (products[0]?.asin && products[0].asin.trim()) || undefined;

    // 3. Fetch Trend for representative ASIN (only when valid ASIN exists)
    let topAsinTrend: TrendSummary | null = null;
    let trendEvidences: ResearchEvidence[] = [];
    if (targetAsin) {
      totalRequests++;
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
    }

    // 4. Fetch Review Health for representative ASIN (only when valid ASIN exists)
    let productReviewHealth: ProductReviewHealthResult | null = null;
    let reviewEvidences: ResearchEvidence[] = [];
    if (targetAsin) {
      totalRequests++;
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
    }

    // 5. Fetch External VOC for representative ASIN (only when valid ASIN exists)
    let vocAnalysis: VocProductAnalysisResult | null = null;
    let vocEvidences: ResearchEvidence[] = [];
    if (targetAsin) {
      totalRequests++;
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

  buildDefaultCandidates(): ProductCandidate[] {
    const cand1Economics = CandidateEconomicsService.calculateEconomics(
      {
        sellingPrice: { value: 29.99, source: 'DEMO', basis: 'Built-in demo fixture for Product Research V2 UI' },
        productCost: { value: 6.2, source: 'DEMO', basis: 'Built-in demo fixture for Product Research V2 UI' },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE', basis: 'Amazon 15% standard commission tier' },
        fbaFeePerUnit: { value: 5.2, source: 'ESTIMATE', basis: 'FBA large standard tier' },
        freightPerUnit: { value: 2.1, source: 'ESTIMATE', basis: 'Estimated sea freight DDP per unit' },
        dutyPerUnit: { value: 0.6, source: 'ESTIMATE', basis: 'Estimated tariff 7%' },
        adsCostPerUnit: { value: 3.5, source: 'ASSUMPTION', basis: 'Demo ad budget allocation' },
        returnRate: { value: 0.02, source: 'ASSUMPTION', basis: 'Demo return rate benchmark' },
        returnLossPerUnit: { value: 7.0, source: 'ESTIMATE', basis: 'Estimated inspection and repack loss' },
        storageFeePerUnit: { value: 0.35, source: 'ESTIMATE', basis: 'Estimated monthly inventory fee' },
        otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE', basis: 'Estimated barcode and polybag' },
      },
      'USD',
    );

    const cand2Economics = CandidateEconomicsService.calculateEconomics(
      {
        sellingPrice: { value: 34.99, source: 'DEMO', basis: 'Built-in demo fixture for Product Research V2 UI' },
        productCost: { value: 9.8, source: 'DEMO', basis: 'Built-in demo fixture for Product Research V2 UI' },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE', basis: 'Amazon 15% standard commission tier' },
        fbaFeePerUnit: { value: 6.8, source: 'ESTIMATE', basis: 'FBA oversize standard tier' },
        freightPerUnit: { value: 3.6, source: 'ESTIMATE', basis: 'Estimated protective freight' },
        dutyPerUnit: { value: 0.8, source: 'ESTIMATE', basis: 'Estimated tariff' },
        adsCostPerUnit: { value: 5.25, source: 'ASSUMPTION', basis: 'Demo ad budget allocation' },
        returnRate: { value: 0.06, source: 'ASSUMPTION', basis: 'Demo return rate benchmark' },
        returnLossPerUnit: { value: 12.0, source: 'ESTIMATE', basis: 'Estimated return loss' },
        storageFeePerUnit: { value: 0.45, source: 'ESTIMATE', basis: 'Estimated standard storage' },
        otherCostsPerUnit: { value: 0.8, source: 'ESTIMATE', basis: 'Estimated protective wrap' },
      },
      'USD',
    );

    const cand3Economics = CandidateEconomicsService.calculateEconomics(
      {
        sellingPrice: { value: 42.99, source: 'DEMO', basis: 'Built-in demo fixture for Product Research V2 UI' },
        productCost: { value: 21.0, source: 'DEMO', basis: 'Built-in demo fixture for Product Research V2 UI' },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE', basis: 'Amazon standard fee' },
        fbaFeePerUnit: { value: 11.5, source: 'ESTIMATE', basis: 'Heavy oversize FBA tier' },
        freightPerUnit: { value: 8.5, source: 'ESTIMATE', basis: 'Heavyweight ocean freight' },
        dutyPerUnit: { value: 1.5, source: 'ESTIMATE', basis: 'Steel tariff classification' },
        adsCostPerUnit: { value: 6.0, source: 'ASSUMPTION', basis: 'Demo ad budget allocation' },
        returnRate: { value: 0.03, source: 'ASSUMPTION', basis: 'Demo return rate benchmark' },
        returnLossPerUnit: { value: 18.0, source: 'ESTIMATE', basis: 'Estimated oversize return fee' },
        storageFeePerUnit: { value: 1.2, source: 'ESTIMATE', basis: 'Estimated oversize cubic storage' },
        otherCostsPerUnit: { value: 1.0, source: 'ESTIMATE', basis: 'Estimated caster assembly' },
      },
      'USD',
    );

    const defaultCandidates: ProductCandidate[] = [
      {
        id: 'cand-linen-box',
        title: 'Foldable Linen Storage File Box with Lid (Demo)',
        marketplace: 'AMAZON_US',
        category: 'Home & Kitchen > Storage & Organization',
        concept: {
          productType: 'Collapsible Storage Box',
          targetCustomer: 'Home office organizers seeking clean aesthetics',
          useCase: 'Letter/Legal document and stationery organization',
          targetPrice: 29.99,
          differentiationHypotheses: ['Solid wood handles', 'Non-woven fabric reinforcement', 'Lid with label tag'],
        },
        marketResearch: {
          seedKeyword: 'linen file box (demo)',
          searchVolumeMonthly: 28000,
          competitiveDifficulty: 38,
          opportunityScore: 78,
          competitorSampleSize: 5,
          representativeAsin: 'DEMO-ASIN-01',
          evidenceIds: ['evi-demo-linen-kw'],
        },
        economics: cand1Economics,
        risks: [
          {
            riskId: 'cand-linen-risk-patent',
            category: 'PATENT',
            title: 'Handle & folding joint clearance (Demo)',
            status: 'PASS',
            severity: 'HIGH',
            evidenceIds: ['evi-demo-linen-patent'],
          },
        ],
        evidence: [
          {
            id: 'evi-demo-linen-quote',
            scope: 'PRODUCT',
            subjectId: 'cand-linen-box',
            source: 'DEMO_FIXTURE',
            content: 'Demo fixture product cost quote $6.20/unit with lid',
            capturedAt: '2026-09-15T00:00:00Z',
          },
          {
            id: 'evi-demo-linen-kw',
            scope: 'KEYWORD',
            subjectId: 'linen file box (demo)',
            source: 'DEMO_FIXTURE',
            content: 'Demo fixture search volume metric 28,000',
            capturedAt: '2026-09-15T00:00:00Z',
          },
          {
            id: 'evi-demo-linen-patent',
            scope: 'PRODUCT',
            subjectId: 'cand-linen-box',
            source: 'DEMO_FIXTURE',
            content: 'Demo patent search clearance report fixture',
            capturedAt: '2026-09-15T00:00:00Z',
          },
        ],
        assumptions: [
          {
            id: 'asm-linen-ads',
            field: 'adsCostPerUnit',
            description: 'Mature phase PPC cost estimated at $3.50/unit (~11.6% ACOS)',
            assumedValue: 3.5,
            sourceReason: 'Based on category average CPC and 20% conversion rate',
            impactLevel: 'MEDIUM',
            validated: true,
          },
        ],
        missingRequirements: [],
        decision: 'INSUFFICIENT_DATA',
      },
      {
        id: 'cand-acrylic-box',
        title: 'Crystal Clear Acrylic Desktop File Organizer (Demo)',
        marketplace: 'AMAZON_US',
        category: 'Office Products > Filing Products',
        concept: {
          productType: 'Acrylic File Organizer',
          targetCustomer: 'Executive desks and beauty studio owners',
          useCase: 'Luxury document & file folder display on desktop',
          targetPrice: 34.99,
          differentiationHypotheses: ['Scratch-resistant coating', 'Brushed brass bracket handles'],
        },
        marketResearch: {
          seedKeyword: 'acrylic file organizer (demo)',
          searchVolumeMonthly: 16500,
          competitiveDifficulty: 52,
          opportunityScore: 64,
          competitorSampleSize: 4,
          representativeAsin: 'DEMO-ASIN-02',
          evidenceIds: ['evi-demo-acrylic-kw'],
        },
        economics: cand2Economics,
        risks: [
          {
            riskId: 'cand-acrylic-risk-patent',
            category: 'PATENT',
            title: 'Side bracket structural patent search pending',
            status: 'UNVERIFIED',
            severity: 'MEDIUM',
            evidenceIds: [],
          },
          {
            riskId: 'cand-acrylic-risk-fragile',
            category: 'QUALITY',
            title: 'Transit crack & scratch risk during FBA delivery',
            status: 'UNVERIFIED',
            severity: 'MEDIUM',
            evidenceIds: [],
          },
        ],
        evidence: [
          {
            id: 'evi-demo-acrylic-quote',
            scope: 'PRODUCT',
            subjectId: 'cand-acrylic-box',
            source: 'DEMO_FIXTURE',
            content: 'Demo fixture acrylic quote $9.80/unit',
            capturedAt: '2026-09-15T00:00:00Z',
          },
          {
            id: 'evi-demo-acrylic-kw',
            scope: 'KEYWORD',
            subjectId: 'acrylic file organizer (demo)',
            source: 'DEMO_FIXTURE',
            content: 'Demo fixture search volume metric 16,500',
            capturedAt: '2026-09-15T00:00:00Z',
          },
        ],
        assumptions: [
          {
            id: 'asm-acrylic-ret',
            field: 'returnRate',
            description: 'Return rate projected at 6% due to fragile acrylic shipping defects',
            assumedValue: 0.06,
            sourceReason: 'Category return benchmark for rigid transparent plastics',
            impactLevel: 'HIGH',
            validated: false,
          },
        ],
        missingRequirements: [
          {
            id: 'req-acrylic-drop-test',
            dimension: 'RISK',
            field: 'dropTestReport',
            description: 'Supplier ISTA-1A drop test verification report required before mass production',
            blockingDecision: false,
          },
        ],
        decision: 'INSUFFICIENT_DATA',
      },
      {
        id: 'cand-steel-cart',
        title: 'Rolling Heavy-Duty Steel Mesh Hanging File Cart (Demo)',
        marketplace: 'AMAZON_US',
        category: 'Office Products > Filing Products',
        concept: {
          productType: 'Steel Mesh File Cart',
          targetCustomer: 'Commercial offices, CPA firms and clinics',
          useCase: 'High-capacity rolling legal file cart with bottom shelf',
          targetPrice: 42.99,
          differentiationHypotheses: ['Lockable swivel casters', 'Heavy-gauge steel frame'],
        },
        marketResearch: {
          seedKeyword: 'rolling file cart (demo)',
          searchVolumeMonthly: 12000,
          competitiveDifficulty: 65,
          opportunityScore: 48,
          competitorSampleSize: 3,
          representativeAsin: 'DEMO-ASIN-03',
          evidenceIds: ['evi-demo-steel-kw'],
        },
        economics: cand3Economics,
        risks: [
          {
            riskId: 'cand-steel-risk-margin',
            category: 'SUPPLY_CHAIN',
            title: 'Oversize FBA and ocean freight produce negative contribution margin',
            status: 'FAIL',
            severity: 'HIGH',
            evidenceIds: [],
          },
        ],
        evidence: [
          {
            id: 'evi-demo-steel-quote',
            scope: 'PRODUCT',
            subjectId: 'cand-steel-cart',
            source: 'DEMO_FIXTURE',
            content: 'Demo fixture steel fabrication quote $21.00/unit EXW',
            capturedAt: '2026-09-15T00:00:00Z',
          },
          {
            id: 'evi-demo-steel-kw',
            scope: 'KEYWORD',
            subjectId: 'rolling file cart (demo)',
            source: 'DEMO_FIXTURE',
            content: 'Demo fixture search volume metric 12,000',
            capturedAt: '2026-09-15T00:00:00Z',
          },
        ],
        assumptions: [],
        missingRequirements: [],
        decision: 'INSUFFICIENT_DATA',
      },
    ];

    return defaultCandidates.map((c) => {
      const detail = CandidateDecisionEngine.evaluate(c);
      return {
        ...c,
        decision: detail.verdict,
        decisionDetail: detail,
      };
    });
  }

  getDefaultCandidates(): CandidateDefaultsResponse {
    const candidates = this.buildDefaultCandidates();
    const comparison = CandidateComparisonEngine.compare(candidates);
    return {
      mode: 'DEMO',
      dataSource: 'BUILT_IN_FIXTURE',
      isRealData: false,
      disclaimer:
        '当前候选仅用于演示 V2 比较能力，不代表真实 Amazon 市场、供应商报价或选品建议。',
      candidates,
      comparison,
    };
  }

  compareCandidates(rawCandidates: ProductCandidate[]): {
    candidates: ProductCandidate[];
    comparison: CandidateComparisonResult;
  } {
    const evaluatedCandidates = rawCandidates.map((c) => {
      const detail = CandidateDecisionEngine.evaluate(c);
      return {
        ...c,
        decision: detail.verdict,
        decisionDetail: detail,
      };
    });
    const comparison = CandidateComparisonEngine.compare(evaluatedCandidates);
    return {
      candidates: evaluatedCandidates,
      comparison,
    };
  }

  /**
   * Product Research Phase 2A — Auto Discovery MVP
   */
  async runDiscovery(request: ProductDiscoveryRequest): Promise<ProductDiscoveryRun> {
    const isDemo =
      !request.seed?.keyword ||
      request.seed.keyword.toLowerCase().includes('demo') ||
      request.seed.keyword.toLowerCase().includes('glass food storage');

    if (isDemo) {
      return this.getDemoDiscovery();
    }

    try {
      const gateway = IntegrationGateway.getInstance();
      const executor: CapabilityExecutor = {
        execute: async <TInput, TOutput>(capabilityId: string, input: TInput, marketplace: string) => {
          const result = await gateway.executeCapability<TInput, TOutput>(capabilityId, input, {
            workspaceId: 'default-workspace',
            traceId: `req-disc-${Date.now()}`,
            marketplace,
            source: 'AUTO_DISCOVERY',
          });
          return {
            success: result.success,
            data: result.data,
            providerId: result.providerId,
            costCredits: result.credits,
            error: result.error,
          };
        },
        hasCapability: (capId: string) => true,
      };

      const discoveryService = new ProductDiscoveryService(executor);
      return await discoveryService.runDiscovery(request);
    } catch (e) {
      // Degraded fallback if gateway not initialized in test environment
      const discoveryService = new ProductDiscoveryService();
      return await discoveryService.runDiscovery(request);
    }
  }

  previewDiscovery(request: ProductDiscoveryRequest): DiscoveryDryRunPreview {
    const discoveryService = new ProductDiscoveryService();
    return discoveryService.previewDiscovery(request);
  }

  async getDemoDiscovery(): Promise<ProductDiscoveryRun> {
    const demoKeywords: Partial<KeywordNode>[] = [
      {
        id: 'kw-amazon_us-glass-food-storage',
        rawKeyword: 'glass food storage',
        origin: 'SEED',
        representativeAsins: ['B08FRUIT01', 'B09MEAL01'],
        evidenceIds: ['evi-kw-seed-demo'],
        metrics: {
          searchVolume: { value: 32500, source: 'DEMO', evidenceId: 'evi-kw-seed-demo' },
          abaRank: { value: 420, source: 'DEMO', evidenceId: 'evi-kw-seed-demo' },
          cpc: { value: 1.25, source: 'DEMO', evidenceId: 'evi-kw-seed-demo' },
          growth: { value: null, source: 'UNKNOWN' },
        },
      },
      {
        id: 'kw-amazon_us-glass-berry-keeper',
        rawKeyword: 'glass berry keeper',
        origin: 'KEYWORD_EXPANSION',
        representativeAsins: ['B08FRUIT01', 'B08FRUIT02', 'B08FRUIT03'],
        evidenceIds: ['evi-kw-berry-demo'],
        metrics: {
          searchVolume: { value: 8400, source: 'DEMO', evidenceId: 'evi-kw-berry-demo' },
          abaRank: { value: 1850, source: 'DEMO', evidenceId: 'evi-kw-berry-demo' },
          cpc: { value: 0.95, source: 'DEMO', evidenceId: 'evi-kw-berry-demo' },
          growth: { value: null, source: 'UNKNOWN' },
        },
      },
      {
        id: 'kw-amazon_us-glass-meal-prep-container',
        rawKeyword: 'glass meal prep container',
        origin: 'KEYWORD_EXPANSION',
        representativeAsins: ['B09MEAL01', 'B09MEAL02'],
        evidenceIds: ['evi-kw-meal-demo'],
        metrics: {
          searchVolume: { value: 24000, source: 'DEMO', evidenceId: 'evi-kw-meal-demo' },
          abaRank: { value: 610, source: 'DEMO', evidenceId: 'evi-kw-meal-demo' },
          cpc: { value: 1.4, source: 'DEMO', evidenceId: 'evi-kw-meal-demo' },
          growth: { value: null, source: 'UNKNOWN' },
        },
      },
      {
        id: 'kw-amazon_us-glass-flour-and-sugar-container',
        rawKeyword: 'glass flour and sugar container',
        origin: 'KEYWORD_EXPANSION',
        representativeAsins: ['B07PANTRY01', 'B07PANTRY02'],
        evidenceIds: ['evi-kw-pantry-demo'],
        metrics: {
          searchVolume: { value: 11200, source: 'DEMO', evidenceId: 'evi-kw-pantry-demo' },
          abaRank: { value: 1240, source: 'DEMO', evidenceId: 'evi-kw-pantry-demo' },
          cpc: { value: 1.1, source: 'DEMO', evidenceId: 'evi-kw-pantry-demo' },
          growth: { value: null, source: 'UNKNOWN' },
        },
      },
      {
        id: 'kw-amazon_us-glass-baking-dish-with-lid',
        rawKeyword: 'glass baking dish with lid',
        origin: 'KEYWORD_EXPANSION',
        representativeAsins: ['B06BAKE01', 'B06BAKE02'],
        evidenceIds: ['evi-kw-baking-demo'],
        metrics: {
          searchVolume: { value: 9800, source: 'DEMO', evidenceId: 'evi-kw-baking-demo' },
          abaRank: { value: 1420, source: 'DEMO', evidenceId: 'evi-kw-baking-demo' },
          cpc: { value: 1.05, source: 'DEMO', evidenceId: 'evi-kw-baking-demo' },
          growth: { value: null, source: 'UNKNOWN' },
        },
      },
      {
        id: 'kw-amazon_us-glass-baby-food-storage-jars',
        rawKeyword: 'glass baby food storage jars',
        origin: 'KEYWORD_EXPANSION',
        representativeAsins: ['B05BABY01', 'B05BABY02'],
        evidenceIds: ['evi-kw-baby-demo'],
        metrics: {
          searchVolume: { value: 7600, source: 'DEMO', evidenceId: 'evi-kw-baby-demo' },
          abaRank: { value: 1980, source: 'DEMO', evidenceId: 'evi-kw-baby-demo' },
          cpc: { value: 0.85, source: 'DEMO', evidenceId: 'evi-kw-baby-demo' },
          growth: { value: null, source: 'UNKNOWN' },
        },
      },
    ];

    const demoAsins: Partial<AsinNode>[] = [
      { asin: 'B08FRUIT01', evidenceIds: ['evi-asin-b08fruit01-demo'], sourceKeywords: ['glass food storage', 'glass berry keeper'] },
      { asin: 'B08FRUIT02', evidenceIds: ['evi-asin-b08fruit02-demo'], sourceKeywords: ['glass berry keeper'] },
      { asin: 'B08FRUIT03', evidenceIds: ['evi-asin-b08fruit03-demo'], sourceKeywords: ['glass berry keeper'] },
      { asin: 'B09MEAL01', evidenceIds: ['evi-asin-b09meal01-demo'], sourceKeywords: ['glass food storage', 'glass meal prep container'] },
      { asin: 'B09MEAL02', evidenceIds: ['evi-asin-b09meal02-demo'], sourceKeywords: ['glass meal prep container'] },
      { asin: 'B07PANTRY01', evidenceIds: ['evi-asin-b07pantry01-demo'], sourceKeywords: ['glass flour and sugar container'] },
      { asin: 'B07PANTRY02', evidenceIds: ['evi-asin-b07pantry02-demo'], sourceKeywords: ['glass flour and sugar container'] },
      { asin: 'B06BAKE01', evidenceIds: ['evi-asin-b06bake01-demo'], sourceKeywords: ['glass baking dish with lid'] },
      { asin: 'B06BAKE02', evidenceIds: ['evi-asin-b06bake02-demo'], sourceKeywords: ['glass baking dish with lid'] },
      { asin: 'B05BABY01', evidenceIds: ['evi-asin-b05baby01-demo'], sourceKeywords: ['glass baby food storage jars'] },
      { asin: 'B05BABY02', evidenceIds: ['evi-asin-b05baby02-demo'], sourceKeywords: ['glass baby food storage jars'] },
    ];

    const demoEvidence: EvidenceItem[] = [
      { id: 'evi-kw-seed-demo', scope: 'KEYWORD', subjectId: 'kw-amazon_us-glass-food-storage', source: 'DEMO_FIXTURE', content: 'Demo fixture search volume 32,500', confidence: 0.95 },
      { id: 'evi-kw-berry-demo', scope: 'KEYWORD', subjectId: 'kw-amazon_us-glass-berry-keeper', source: 'DEMO_FIXTURE', content: 'Demo fixture search volume 8,400', confidence: 0.95 },
      { id: 'evi-kw-meal-demo', scope: 'KEYWORD', subjectId: 'kw-amazon_us-glass-meal-prep-container', source: 'DEMO_FIXTURE', content: 'Demo fixture search volume 24,000', confidence: 0.95 },
      { id: 'evi-kw-pantry-demo', scope: 'KEYWORD', subjectId: 'kw-amazon_us-glass-flour-and-sugar-container', source: 'DEMO_FIXTURE', content: 'Demo fixture search volume 11,200', confidence: 0.95 },
      { id: 'evi-kw-baking-demo', scope: 'KEYWORD', subjectId: 'kw-amazon_us-glass-baking-dish-with-lid', source: 'DEMO_FIXTURE', content: 'Demo fixture search volume 9,800', confidence: 0.95 },
      { id: 'evi-kw-baby-demo', scope: 'KEYWORD', subjectId: 'kw-amazon_us-glass-baby-food-storage-jars', source: 'DEMO_FIXTURE', content: 'Demo fixture search volume 7,600', confidence: 0.95 },
      { id: 'evi-asin-b08fruit01-demo', scope: 'PRODUCT', subjectId: 'B08FRUIT01', source: 'DEMO_FIXTURE', content: 'Demo fixture fruit keeper ASIN', confidence: 0.9 },
      { id: 'evi-asin-b08fruit02-demo', scope: 'PRODUCT', subjectId: 'B08FRUIT02', source: 'DEMO_FIXTURE', content: 'Demo fixture berry keeper ASIN', confidence: 0.9 },
      { id: 'evi-asin-b08fruit03-demo', scope: 'PRODUCT', subjectId: 'B08FRUIT03', source: 'DEMO_FIXTURE', content: 'Demo fixture fruit saver ASIN', confidence: 0.9 },
      { id: 'evi-asin-b09meal01-demo', scope: 'PRODUCT', subjectId: 'B09MEAL01', source: 'DEMO_FIXTURE', content: 'Demo fixture meal prep ASIN', confidence: 0.9 },
      { id: 'evi-asin-b09meal02-demo', scope: 'PRODUCT', subjectId: 'B09MEAL02', source: 'DEMO_FIXTURE', content: 'Demo fixture bento ASIN', confidence: 0.9 },
      { id: 'evi-asin-b07pantry01-demo', scope: 'PRODUCT', subjectId: 'B07PANTRY01', source: 'DEMO_FIXTURE', content: 'Demo fixture pantry canister ASIN', confidence: 0.9 },
      { id: 'evi-asin-b07pantry02-demo', scope: 'PRODUCT', subjectId: 'B07PANTRY02', source: 'DEMO_FIXTURE', content: 'Demo fixture storage canister ASIN', confidence: 0.9 },
      { id: 'evi-asin-b06bake01-demo', scope: 'PRODUCT', subjectId: 'B06BAKE01', source: 'DEMO_FIXTURE', content: 'Demo fixture baking dish ASIN', confidence: 0.9 },
      { id: 'evi-asin-b06bake02-demo', scope: 'PRODUCT', subjectId: 'B06BAKE02', source: 'DEMO_FIXTURE', content: 'Demo fixture lasagna pan ASIN', confidence: 0.9 },
      { id: 'evi-asin-b05baby01-demo', scope: 'PRODUCT', subjectId: 'B05BABY01', source: 'DEMO_FIXTURE', content: 'Demo fixture baby food jar ASIN', confidence: 0.9 },
      { id: 'evi-asin-b05baby02-demo', scope: 'PRODUCT', subjectId: 'B05BABY02', source: 'DEMO_FIXTURE', content: 'Demo fixture freezer pot ASIN', confidence: 0.9 },
    ];

    const discoveryService = new ProductDiscoveryService();
    return await discoveryService.runDiscovery(
      {
        marketplace: 'AMAZON_US',
        seed: { keyword: 'glass food storage (demo)' },
      },
      {
        keywords: demoKeywords,
        asins: demoAsins,
        evidence: demoEvidence,
      },
    );
  }

  handoffDiscovery(drafts: CandidateDraft[]): ProductCandidate[] {
    const candidates = CandidateHandoffService.handoffToV2(drafts);
    return candidates.map((c) => {
      const detail = CandidateDecisionEngine.evaluate(c);
      return {
        ...c,
        decision: detail.verdict,
        decisionDetail: detail,
      };
    });
  }
}


