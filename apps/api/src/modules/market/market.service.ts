import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegrationGateway, XydcMapper } from '@crosspilot/integrations';
import {
  CandidateComparisonEngine,
  CandidateDecisionEngine,
  CandidateEconomicsService,
  OpportunityScoreEngine,
  ProductDiscoveryService,
  CandidateHandoffService,
  CandidateEnrichmentService,
  EnrichedCandidateHandoffService,
  CapabilityExecutor,
  SpecificationManager,
  RfqGeneratorService,
  SupplierQuoteService,
  InitialCashService,
  RiskApplicabilityPolicy,
  NextBestActionEngine,
  DecisionPacketService,
  ProfitCalculationService,
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
  CandidateEnrichmentRequest,
  CandidateEnrichmentRun,
  ProductSpecification,
  SupplierQuote,
  GeneratedRfq,
  InitialCashRequirement,
  OnePageDecisionPacket,
  ResearchAnalyticsEvent,
  ResearchTask,
  ResearchTaskStage,
  ResearchTaskSummary,
  CreateResearchTaskDto,
  UpdateResearchTaskDto,
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
    if (!request.seed?.keyword?.trim()) {
      throw new BadRequestException('Seed keyword is required for Auto Discovery');
    }

    const isDemo =
      request.isDemo === true ||
      request.seed.keyword.toLowerCase().includes('demo');

    if (isDemo) {
      return this.getDemoDiscovery();
    }

    try {
      const executor = this.createDiscoveryExecutor();
      const discoveryService = new ProductDiscoveryService(executor);
      return await discoveryService.runDiscovery(request);
    } catch (e) {
      // Degraded fallback if gateway not initialized in test environment
      const discoveryService = new ProductDiscoveryService();
      return await discoveryService.runDiscovery(request);
    }
  }

  previewDiscovery(request: ProductDiscoveryRequest): DiscoveryDryRunPreview {
    try {
      const executor = this.createDiscoveryExecutor();
      return new ProductDiscoveryService(executor).previewDiscovery(request);
    } catch {
      return new ProductDiscoveryService().previewDiscovery(request);
    }
  }

  private createDiscoveryExecutor(): CapabilityExecutor {
    const gateway = IntegrationGateway.getInstance();
    return {
      execute: async <TInput, TOutput>(capabilityId: string, input: TInput, marketplace: string) => {
        const result = await gateway.executeCapability<TInput, TOutput>(capabilityId, input, {
          workspaceId: 'default-workspace',
          traceId: `req-disc-${Date.now()}`,
          marketplace,
          source: 'AUTO_DISCOVERY',
          metadata: { skipProviderFallback: true },
        });
        return {
          success: result.success,
          data: result.data,
          providerId: result.providerId,
          costCredits: result.credits,
          error: result.error,
        };
      },
      hasCapability: (capId: string) => {
        try {
          return gateway.hasCapability(capId);
        } catch {
          return false;
        }
      },
      getCapabilityCost: (capId: string) => {
        try {
          return gateway.getCapabilityCost(capId);
        } catch {
          return null;
        }
      },
    };
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

  handoffDiscovery(drafts: CandidateDraft[], allEvidence: EvidenceItem[] = []): ProductCandidate[] {
    const candidates = CandidateHandoffService.handoffToV2(drafts, allEvidence);
    return candidates.map((c) => {
      const detail = CandidateDecisionEngine.evaluate(c);
      return {
        ...c,
        decision: detail.verdict,
        decisionDetail: detail,
      };
    });
  }

  async runEnrichment(request: CandidateEnrichmentRequest): Promise<CandidateEnrichmentRun> {
    if (!request?.draft?.id) {
      throw new BadRequestException('Candidate draft is required for enrichment');
    }
    try {
      const executor = this.createDiscoveryExecutor();
      return await new CandidateEnrichmentService(executor).enrich(request);
    } catch {
      return await new CandidateEnrichmentService().enrich(request);
    }
  }

  handoffEnrichment(run: CandidateEnrichmentRun): ProductCandidate {
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(
      run.enriched,
      run.evidence,
      run.request?.manualInputs,
    );
    const detail = CandidateDecisionEngine.evaluate(candidate);
    return {
      ...candidate,
      decision: detail.verdict,
      decisionDetail: detail,
    };
  }

  // ==========================================================================
  // Single Product Research V1 Methods (V1 最终冻结版 · 工程增强修订)
  // ==========================================================================

  /**
   * 黄金验收案例样本 (玻璃水果盒 + 沥水篮)
   */
  getDemoFruitBoxCandidate(): ProductCandidate {
    const candidateId = 'cand-glass-fruit-box-001';
    const spec = SpecificationManager.createDraftSpecification(candidateId, {
      material: '高硼硅玻璃主体 + 食品级 PP 沥水篮',
      capacity: '约 1.5L',
      dimensions: '25 × 15 × 10 cm',
      targetSellingPrice: 29.99,
      specialRequirements: ['可拆卸沥水篮', '易清洁无死角结构', '耐温差 -20℃ ~ 120℃'],
    });

    const frozenSpec = SpecificationManager.freezeSpecification(spec);

    const quoteA: SupplierQuote = {
      id: 'quote-a',
      candidateId,
      specVersionId: frozenSpec.id,
      supplierName: 'A厂 (浙江某工贸一体模具制品厂)',
      status: 'ACTIVE',
      unitPrice: 42,
      packagingCost: { value: 3, source: 'FACT' },
      logoCost: { value: 1, source: 'FACT' },
      moq: 500,
      sampleCost: 100,
      toolingCost: 0,
      leadTimeDays: 25,
      captureMethod: 'MANUAL',
      sourceChannel: '1688',
      currency: 'CNY',
      capturedAt: new Date().toISOString(),
      returnedSpecs: {
        netWeight: 650,
        packagingDimensions: '26 × 16 × 11 cm',
        packagedWeight: 780,
        unitsPerCarton: 16,
        cartonDimensions: '54 × 34 × 46 cm',
        cartonGrossWeight: 13.5,
      },
    };

    const quoteB: SupplierQuote = {
      id: 'quote-b',
      candidateId,
      specVersionId: frozenSpec.id,
      supplierName: 'B厂 (广东潮州高硼硅玻璃厂)',
      status: 'ACTIVE',
      unitPrice: 45,
      packagingCost: { value: 2, source: 'FACT' },
      logoCost: { value: 1, source: 'FACT' },
      moq: 300,
      sampleCost: 150,
      toolingCost: 0,
      leadTimeDays: 30,
      captureMethod: 'MANUAL',
      sourceChannel: 'WECHAT',
      currency: 'CNY',
      capturedAt: new Date().toISOString(),
    };

    const quoteC: SupplierQuote = {
      id: 'quote-c',
      candidateId,
      specVersionId: frozenSpec.id,
      supplierName: 'C厂 (江苏南通外贸日用品厂)',
      status: 'ACTIVE',
      unitPrice: 39,
      packagingCost: { value: 4, source: 'FACT' },
      logoCost: { value: 1, source: 'FACT' },
      moq: 1000,
      sampleCost: 80,
      toolingCost: 0,
      leadTimeDays: 20,
      captureMethod: 'MANUAL',
      sourceChannel: 'ALIBABA',
      currency: 'CNY',
      capturedAt: new Date().toISOString(),
    };

    const backfilledSpec = SpecificationManager.backfillFromQuote(
      frozenSpec,
      quoteA.returnedSpecs!,
    );

    let candidate: ProductCandidate = {
      id: candidateId,
      title: '玻璃水果保鲜盒 + 沥水篮',
      marketplace: 'amazon-us',
      category: 'Home & Kitchen > Kitchen & Dining > Storage & Organization > Food Storage',
      concept: {
        productType: '玻璃水果保鲜盒 + 沥水篮',
        targetCustomer: '重视食品健康、追求高品质蔬果保鲜与极简收纳的北美家庭',
        useCase: '洗净沥水、冰箱保鲜冷藏、餐桌健康伺服三合一',
        targetPrice: 29.99,
        specifications: {
          material: '高硼硅玻璃 + 食品级 PP',
          capacity: '1.5L',
          dimensions: '25 × 15 × 10 cm',
        },
        differentiationHypotheses: [
          '高硼硅玻璃耐酸耐碱无异味，彻底解决塑料水果盒易泛黄、吸附异味的痛点',
          '悬空滤水篮结构洗完直接放冰箱，避免底部泡水腐烂',
        ],
      },
      specifications: [backfilledSpec],
      activeSpecVersionId: backfilledSpec.id,
      supplierQuotes: [quoteA, quoteB, quoteC],
      primaryQuoteId: 'quote-a',
      fxSnapshot: {
        currencyPair: 'CNY_USD',
        rate: 0.14,
        source: 'PBOC_BENCHMARK',
        capturedAt: new Date().toISOString(),
      },
      marketResearch: {
        seedKeyword: 'glass fruit container with colander',
        searchVolumeMonthly: 28500,
        competitiveDifficulty: 42,
        opportunityScore: 78,
        representativeAsin: 'B08FRUIT01',
      },
      economics: {
        status: 'COMPLETE',
        currency: 'USD',
        inputs: {
          sellingPrice: { value: 29.99, source: 'FACT' },
          productCost: { value: 6.44, source: 'FACT', basis: 'PRIMARY_QUOTE_A厂_CNY_46' },
          referralFeeRate: { value: 0.15, source: 'FACT' },
          fbaFeePerUnit: { value: 4.8, source: 'ESTIMATE' },
          freightPerUnit: { value: 1.8, source: 'ESTIMATE' },
          dutyPerUnit: { value: 0.4, source: 'ESTIMATE' },
          adsCostPerUnit: { value: 3.0, source: 'ESTIMATE' },
          returnRate: { value: 0.05, source: 'ASSUMPTION' },
          returnLossPerUnit: { value: 4.8, source: 'ESTIMATE' },
          storageFeePerUnit: { value: 0.17, source: 'ESTIMATE' },
          otherCostsPerUnit: { value: 0, source: 'FACT' },
        },
        scenarios: {
          conservative: {} as any,
          base: {} as any,
          optimistic: {} as any,
        },
        missingInputs: [],
      },
      risks: [],
      evidence: [
        {
          id: 'evi-market-fruit-saver',
          scope: 'KEYWORD',
          subjectId: 'glass fruit container with colander',
          source: 'XYDC_ABA',
          content: 'ABA 周搜索量 6,800，月度预估 28,500，主流价格带 $26.99 ~ $32.99',
        },
      ],
      assumptions: [],
      missingRequirements: [],
      decision: 'INSUFFICIENT_DATA',
    };

    // 重新计算经济模型
    candidate.economics = CandidateEconomicsService.calculateEconomics(
      candidate.economics.inputs,
      'USD',
    );

    // 计算启动资金 (MOQ 500 * ¥46.00 + 样品 ¥100 + 首批头程海运 500件*($1.8/0.14)≈¥6,429 = ¥29,529)
    candidate.initialCash = InitialCashService.calculateInitialCash({
      moq: 500,
      productCostPerUnit: 46.0,
      sampleCost: 100,
      firstFreightCost: 6429,
      toolingCost: 0,
      currency: 'CNY',
    });

    // 映射适用风险
    const { applicableRisks, assumptions } = RiskApplicabilityPolicy.determineApplicability(
      candidate.concept,
      candidate.category,
    );
    candidate.risks = applicableRisks;
    candidate.assumptions = assumptions;

    // 决策门禁评估
    const decisionDetail = CandidateDecisionEngine.evaluate(candidate);
    candidate.decision = decisionDetail.verdict;
    candidate.decisionDetail = decisionDetail;

    // 组装一页决策结论包
    candidate.decisionPacket = DecisionPacketService.buildDecisionPacket(candidate);

    return candidate;
  }

  /**
   * 初始化单产品候选对象 (支持多入口)
   */
  initSingleProductCandidate(params: {
    title: string;
    marketplace?: string;
    category?: string;
    targetSellingPrice?: number;
    material?: string;
    capacity?: string;
    dimensions?: string;
    entryPoint?: string;
  }): ProductCandidate {
    const candidateId = `cand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const marketplace = params.marketplace || 'amazon-us';
    const title = params.title || '新产品企划';

    const spec = SpecificationManager.createDraftSpecification(candidateId, {
      material: params.material || '待定材质',
      capacity: params.capacity || '待定规格',
      dimensions: params.dimensions || '待定尺寸',
      targetSellingPrice: params.targetSellingPrice || 29.99,
      specialRequirements: [],
    });

    const candidate: ProductCandidate = {
      id: candidateId,
      title,
      marketplace,
      category: params.category || 'General',
      concept: {
        productType: title,
        targetPrice: params.targetSellingPrice || 29.99,
        specifications: {
          material: spec.material,
          capacity: spec.capacity,
          dimensions: spec.dimensions,
        },
      },
      specifications: [spec],
      activeSpecVersionId: spec.id,
      supplierQuotes: [],
      fxSnapshot: {
        currencyPair: 'CNY_USD',
        rate: 0.14,
        source: 'SYSTEM_DEFAULT',
        capturedAt: new Date().toISOString(),
      },
      economics: {
        status: 'INCOMPLETE',
        currency: 'USD',
        inputs: {
          sellingPrice: { value: params.targetSellingPrice || 29.99, source: 'FACT' },
          productCost: { value: null, source: 'UNKNOWN' },
          referralFeeRate: { value: 0.15, source: 'FACT' },
          fbaFeePerUnit: { value: null, source: 'UNKNOWN' },
          freightPerUnit: { value: null, source: 'UNKNOWN' },
          dutyPerUnit: { value: null, source: 'UNKNOWN' },
          adsCostPerUnit: { value: null, source: 'UNKNOWN' },
          returnRate: { value: null, source: 'UNKNOWN' },
          returnLossPerUnit: { value: null, source: 'UNKNOWN' },
          storageFeePerUnit: { value: null, source: 'UNKNOWN' },
          otherCostsPerUnit: { value: 0, source: 'FACT' },
        },
        scenarios: {
          conservative: {} as any,
          base: {} as any,
          optimistic: {} as any,
        },
        missingInputs: ['productCost', 'fbaFeePerUnit', 'freightPerUnit'],
      },
      risks: [],
      evidence: [],
      assumptions: [],
      missingRequirements: [],
      decision: 'INSUFFICIENT_DATA',
    };

    // 映射适用风险
    const { applicableRisks, assumptions } = RiskApplicabilityPolicy.determineApplicability(
      candidate.concept,
      candidate.category,
    );
    candidate.risks = applicableRisks;
    candidate.assumptions = assumptions;

    candidate.decisionPacket = DecisionPacketService.buildDecisionPacket(candidate);
    return candidate;
  }

  /**
   * 冻结规格
   */
  freezeSingleProductSpec(
    candidate: ProductCandidate,
    spec: ProductSpecification,
  ): ProductCandidate {
    const frozen = SpecificationManager.freezeSpecification(spec);
    const specs = (candidate.specifications || []).map((s) => (s.id === frozen.id ? frozen : s));
    if (!specs.some((s) => s.id === frozen.id)) {
      specs.push(frozen);
    }

    const updated = {
      ...candidate,
      specifications: specs,
      activeSpecVersionId: frozen.id,
    };
    updated.decisionPacket = DecisionPacketService.buildDecisionPacket(updated);
    return updated;
  }

  /**
   * 生成询价单
   */
  generateSingleProductRfq(
    candidate: ProductCandidate,
    specId?: string,
  ): GeneratedRfq {
    const targetSpecId = specId || candidate.activeSpecVersionId;
    const spec = candidate.specifications?.find((s) => s.id === targetSpecId);
    if (!spec) {
      throw new BadRequestException('未找到对应规格版本');
    }
    return RfqGeneratorService.generateRfq(candidate, spec);
  }

  /**
   * 保存工厂报价
   */
  saveSingleProductQuote(
    candidate: ProductCandidate,
    quote: Partial<SupplierQuote>,
  ): ProductCandidate {
    const validation = SupplierQuoteService.validateDraft(quote);
    if (!validation.valid) {
      throw new BadRequestException(`报价草稿不合法: ${validation.errors.join(', ')}`);
    }

    const specId = quote.specVersionId || candidate.activeSpecVersionId!;
    const quoteId = quote.id || `quote-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;

    const fullQuote: SupplierQuote = {
      id: quoteId,
      candidateId: candidate.id,
      specVersionId: specId,
      supplierName: quote.supplierName || '新供应商',
      status: quote.status || 'ACTIVE',
      unitPrice: Number(quote.unitPrice),
      packagingCost: quote.packagingCost || { value: null, source: 'UNKNOWN' },
      logoCost: quote.logoCost || { value: null, source: 'UNKNOWN' },
      moq: Number(quote.moq),
      sampleCost: quote.sampleCost ?? null,
      toolingCost: quote.toolingCost ?? null,
      leadTimeDays: quote.leadTimeDays ?? null,
      returnedSpecs: quote.returnedSpecs,
      captureMethod: quote.captureMethod || 'MANUAL',
      sourceChannel: quote.sourceChannel || '1688',
      currency: quote.currency || 'CNY',
      capturedAt: quote.capturedAt || new Date().toISOString(),
      notes: quote.notes,
    };

    let quotes = candidate.supplierQuotes || [];
    const index = quotes.findIndex((q) => q.id === quoteId);
    if (index >= 0) {
      quotes[index] = fullQuote;
    } else {
      quotes = [...quotes, fullQuote];
    }

    let updatedSpecs = candidate.specifications || [];
    if (fullQuote.returnedSpecs) {
      const activeSpec = updatedSpecs.find((s) => s.id === specId);
      if (activeSpec) {
        const backfilled = SpecificationManager.backfillFromQuote(activeSpec, fullQuote.returnedSpecs);
        updatedSpecs = updatedSpecs.map((s) => (s.id === backfilled.id ? backfilled : s));
      }
    }

    const updated: ProductCandidate = {
      ...candidate,
      supplierQuotes: quotes,
      specifications: updatedSpecs,
    };

    updated.decisionPacket = DecisionPacketService.buildDecisionPacket(updated);
    return updated;
  }

  /**
   * 选择主选算账工厂
   */
  selectSingleProductPrimaryQuote(
    candidate: ProductCandidate,
    quoteId: string,
    confirmedUnknownCharges?: { packagingCost?: number; logoCost?: number },
  ): ProductCandidate {
    const result = SupplierQuoteService.selectPrimaryQuote(
      candidate,
      quoteId,
      confirmedUnknownCharges,
    );

    const updated = result.candidate;
    // 重新计算经济模型
    updated.economics = CandidateEconomicsService.calculateEconomics(
      updated.economics.inputs,
      'USD',
    );

    // 重新核算现金 (保留已有头程或待录入)
    const existingFreight = updated.initialCash?.firstFreightCost ?? undefined;
    updated.initialCash = InitialCashService.calculateInitialCash({
      moq: result.primaryQuote.moq,
      productCostPerUnit: result.productCostQuoteCurrency,
      sampleCost: result.primaryQuote.sampleCost,
      firstFreightCost: existingFreight,
      currency: result.primaryQuote.currency,
    });

    const detail = CandidateDecisionEngine.evaluate(updated);
    updated.decision = detail.verdict;
    updated.decisionDetail = detail;

    updated.decisionPacket = DecisionPacketService.buildDecisionPacket(updated);
    return updated;
  }

  /**
   * 测算闭环
   */
  evaluateSingleProduct(
    candidate: ProductCandidate,
    feeInputs?: Partial<ProductCandidate['economics']['inputs']>,
    initialCashParams?: {
      sampleCost?: number;
      firstFreightCost?: number;
      toolingCost?: number;
      packagingSetupCost?: number;
    },
  ): ProductCandidate {
    let updated = { ...candidate };

    if (feeInputs) {
      updated.economics = CandidateEconomicsService.calculateEconomics(
        {
          ...updated.economics.inputs,
          ...feeInputs,
        },
        'USD',
      );
    }

    if (updated.primaryQuoteId) {
      const primaryQuote = updated.supplierQuotes?.find((q) => q.id === updated.primaryQuoteId);
      if (primaryQuote) {
        // P0-3: 校验包装费与 Logo 费是否已确认，禁止 UNKNOWN 偷偷变成 0
        const isPackagingUnknown =
          primaryQuote.packagingCost?.source === 'UNKNOWN' ||
          primaryQuote.packagingCost?.value === null ||
          primaryQuote.packagingCost?.value === undefined;
        const isLogoUnknown =
          primaryQuote.logoCost?.source === 'UNKNOWN' ||
          primaryQuote.logoCost?.value === null ||
          primaryQuote.logoCost?.value === undefined;

        let unitCost: number | null = null;
        if (!isPackagingUnknown && !isLogoUnknown && primaryQuote.unitPrice > 0) {
          unitCost = ProfitCalculationService.roundMoney(
            primaryQuote.unitPrice + primaryQuote.packagingCost.value! + primaryQuote.logoCost.value!,
          );
        }

        if (unitCost !== null) {
          if (primaryQuote.currency === 'USD') {
            updated.economics.inputs.productCost = { value: unitCost, source: 'FACT' };
          } else if (primaryQuote.currency === 'CNY') {
            if (updated.fxSnapshot && typeof updated.fxSnapshot.rate === 'number' && updated.fxSnapshot.rate > 0) {
              const costUsd = ProfitCalculationService.roundMoney(unitCost * updated.fxSnapshot.rate);
              const fxSrc = updated.fxSnapshot.source as string;
              const isFactFx = fxSrc === 'FACT' || fxSrc === 'PBOC' || fxSrc === 'PBOC_BENCHMARK';
              updated.economics.inputs.productCost = {
                value: costUsd,
                source: isFactFx ? 'FACT' : 'ESTIMATE',
              };
            } else {
              updated.economics.inputs.productCost = { value: null, source: 'UNKNOWN' };
            }
          }
        } else {
          updated.economics.inputs.productCost = { value: null, source: 'UNKNOWN' };
        }

        updated.initialCash = InitialCashService.calculateInitialCash({
          moq: primaryQuote.moq,
          productCostPerUnit: unitCost,
          sampleCost:
            initialCashParams?.sampleCost !== undefined
              ? initialCashParams.sampleCost
              : primaryQuote.sampleCost,
          firstFreightCost:
            initialCashParams?.firstFreightCost !== undefined
              ? initialCashParams.firstFreightCost
              : updated.initialCash?.firstFreightCost,
          toolingCost:
            initialCashParams?.toolingCost !== undefined
              ? initialCashParams.toolingCost
              : primaryQuote.toolingCost,
          packagingSetupCost:
            initialCashParams?.packagingSetupCost !== undefined
              ? initialCashParams.packagingSetupCost
              : updated.initialCash?.packagingSetupCost,
          currency: primaryQuote.currency,
        });
      }
    }

    const detail = CandidateDecisionEngine.evaluate(updated);
    updated.decision = detail.verdict;
    updated.decisionDetail = detail;
    updated.decisionPacket = DecisionPacketService.buildDecisionPacket(updated);

    return updated;
  }

  // ==========================================================================
  // Single-Product Research Analytics Tracking (DEV_TELEMETRY - Spec §35 & §38)
  // 注意：此为开发态内存遥测，重启丢失，非生产级持久化 Product Analytics。
  // 严格强制 Workspace 隔离，禁止跨 Workspace 读取。
  // ==========================================================================
  private analyticsEvents: (ResearchAnalyticsEvent & { workspaceId: string })[] = [];

  trackAnalyticsEvent(workspaceId: string, event: ResearchAnalyticsEvent) {
    const tracked = {
      ...event,
      workspaceId,
      timestamp: event.timestamp || new Date().toISOString(),
    };
    this.analyticsEvents.push(tracked);
    return { success: true, event: tracked, totalEvents: this.analyticsEvents.length };
  }

  getAnalyticsEvents(workspaceId: string, candidateId?: string) {
    return this.analyticsEvents.filter((e) => {
      if (e.workspaceId !== workspaceId) return false;
      if (candidateId && e.candidateId !== candidateId) return false;
      return true;
    });
  }

  // ==========================================================================
  // Single-Product Research Task Workflow Persistence (Phase 1 & 2)
  // ==========================================================================

  private inMemoryTasks = new Map<string, ResearchTask>();

  async createResearchTask(
    workspaceId: string,
    dto: { title: string; candidateData: ProductCandidate; currentStage?: ResearchTaskStage },
  ): Promise<ResearchTask> {
    if (!dto.title || !dto.title.trim()) {
      throw new BadRequestException('任务名称不能为空');
    }
    if (!dto.candidateData) {
      throw new BadRequestException('候选产品数据不能为空');
    }

    const stage: ResearchTaskStage = dto.currentStage || 'CREATED';
    const now = new Date().toISOString();

    if (this.prisma && (this.prisma as any).researchTask) {
      try {
        const record = await (this.prisma as any).researchTask.create({
          data: {
            workspaceId,
            title: dto.title.trim(),
            currentStage: stage,
            candidateData: dto.candidateData as any,
          },
        });
        const task: ResearchTask = {
          id: record.id,
          workspaceId: record.workspaceId,
          title: record.title,
          currentStage: record.currentStage as ResearchTaskStage,
          candidateData: record.candidateData as ProductCandidate,
          createdAt: record.createdAt?.toISOString ? record.createdAt.toISOString() : String(record.createdAt),
          updatedAt: record.updatedAt?.toISOString ? record.updatedAt.toISOString() : String(record.updatedAt),
        };
        this.inMemoryTasks.set(task.id, task);
        return task;
      } catch (err) {
        console.warn('Prisma researchTask.create failed, falling back to memory store:', err);
      }
    }

    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const task: ResearchTask = {
      id,
      workspaceId,
      title: dto.title.trim(),
      currentStage: stage,
      candidateData: dto.candidateData,
      createdAt: now,
      updatedAt: now,
    };
    this.inMemoryTasks.set(id, task);
    return task;
  }

  async listResearchTasks(workspaceId: string): Promise<ResearchTaskSummary[]> {
    if (this.prisma && (this.prisma as any).researchTask) {
      try {
        const records = await (this.prisma as any).researchTask.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            workspaceId: true,
            title: true,
            currentStage: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return records.map((r: any) => ({
          id: r.id,
          workspaceId: r.workspaceId,
          title: r.title,
          currentStage: r.currentStage as ResearchTaskStage,
          createdAt: r.createdAt?.toISOString ? r.createdAt.toISOString() : String(r.createdAt),
          updatedAt: r.updatedAt?.toISOString ? r.updatedAt.toISOString() : String(r.updatedAt),
        }));
      } catch (err) {
        console.warn('Prisma researchTask.findMany failed, falling back to memory store:', err);
      }
    }

    return Array.from(this.inMemoryTasks.values())
      .filter((t) => t.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((t) => ({
        id: t.id,
        workspaceId: t.workspaceId,
        title: t.title,
        currentStage: t.currentStage,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
  }

  async getResearchTask(workspaceId: string, id: string): Promise<ResearchTask> {
    if (this.prisma && (this.prisma as any).researchTask) {
      try {
        const record = await (this.prisma as any).researchTask.findFirst({
          where: { id, workspaceId },
        });
        if (record) {
          return {
            id: record.id,
            workspaceId: record.workspaceId,
            title: record.title,
            currentStage: record.currentStage as ResearchTaskStage,
            candidateData: record.candidateData as ProductCandidate,
            createdAt: record.createdAt?.toISOString ? record.createdAt.toISOString() : String(record.createdAt),
            updatedAt: record.updatedAt?.toISOString ? record.updatedAt.toISOString() : String(record.updatedAt),
          };
        }
      } catch (err) {
        console.warn('Prisma researchTask.findFirst failed, falling back to memory store:', err);
      }
    }

    const memTask = this.inMemoryTasks.get(id);
    if (memTask && memTask.workspaceId === workspaceId) {
      return memTask;
    }

    throw new NotFoundException(`未找到 ID 为 ${id} 的选品任务`);
  }

  async updateResearchTask(
    workspaceId: string,
    id: string,
    dto: { title?: string; candidateData?: ProductCandidate; currentStage?: ResearchTaskStage },
  ): Promise<ResearchTask> {
    const existing = await this.getResearchTask(workspaceId, id);
    const now = new Date().toISOString();
    const updatedTitle = dto.title?.trim() || existing.title;
    const updatedStage = dto.currentStage || existing.currentStage;
    const updatedCandidate = dto.candidateData || existing.candidateData;

    if (this.prisma && (this.prisma as any).researchTask) {
      try {
        const record = await (this.prisma as any).researchTask.update({
          where: { id },
          data: {
            title: updatedTitle,
            currentStage: updatedStage,
            candidateData: updatedCandidate as any,
          },
        });
        const task: ResearchTask = {
          id: record.id,
          workspaceId: record.workspaceId,
          title: record.title,
          currentStage: record.currentStage as ResearchTaskStage,
          candidateData: record.candidateData as ProductCandidate,
          createdAt: record.createdAt?.toISOString ? record.createdAt.toISOString() : String(record.createdAt),
          updatedAt: record.updatedAt?.toISOString ? record.updatedAt.toISOString() : String(record.updatedAt),
        };
        this.inMemoryTasks.set(id, task);
        return task;
      } catch (err) {
        console.warn('Prisma researchTask.update failed, falling back to memory store:', err);
      }
    }

    const updatedTask: ResearchTask = {
      ...existing,
      title: updatedTitle,
      currentStage: updatedStage,
      candidateData: updatedCandidate,
      updatedAt: now,
    };
    this.inMemoryTasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteResearchTask(workspaceId: string, id: string): Promise<{ success: boolean }> {
    if (this.prisma && (this.prisma as any).researchTask) {
      try {
        await (this.prisma as any).researchTask.deleteMany({
          where: { id, workspaceId },
        });
      } catch (err) {
        console.warn('Prisma researchTask.deleteMany failed, falling back to memory store:', err);
      }
    }
    this.inMemoryTasks.delete(id);
    return { success: true };
  }
}



