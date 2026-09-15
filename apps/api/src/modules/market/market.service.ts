import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegrationGateway, XydcMapper } from '@crosspilot/integrations';
import {
  CandidateComparisonEngine,
  CandidateDecisionEngine,
  CandidateEconomicsService,
  OpportunityScoreEngine,
} from '@crosspilot/domain';
import {
  CandidateComparisonResult,
  MarketOverviewSnapshot,
  MarketProduct,
  ProductCandidate,
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
        sellingPrice: { value: 29.99, source: 'FACT', basis: 'Amazon target price point' },
        productCost: { value: 6.2, source: 'FACT', basis: 'Supplier verified invoice quote' },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE', basis: 'Amazon 15% standard commission' },
        fbaFeePerUnit: { value: 5.2, source: 'ESTIMATE', basis: 'FBA large standard tier' },
        freightPerUnit: { value: 2.1, source: 'ESTIMATE', basis: 'Sea freight DDP per unit' },
        dutyPerUnit: { value: 0.6, source: 'ESTIMATE', basis: 'Tariff classification 7%' },
        adsCostPerUnit: { value: 3.5, source: 'ASSUMPTION', basis: 'Target PPC ACOS ~11.6%' },
        returnRate: { value: 0.02, source: 'ASSUMPTION', basis: 'Category fabric box return benchmark 2%' },
        returnLossPerUnit: { value: 7.0, source: 'ESTIMATE', basis: 'Inspection and repack loss' },
        storageFeePerUnit: { value: 0.35, source: 'ESTIMATE', basis: 'Standard monthly inventory fee' },
        otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE', basis: 'Custom barcode and polybag' },
      },
      'USD',
    );

    const cand2Economics = CandidateEconomicsService.calculateEconomics(
      {
        sellingPrice: { value: 34.99, source: 'FACT', basis: 'Amazon premium desktop pricing' },
        productCost: { value: 9.8, source: 'FACT', basis: 'Acrylic factory quotation' },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE', basis: 'Amazon 15% standard commission' },
        fbaFeePerUnit: { value: 6.8, source: 'ESTIMATE', basis: 'FBA oversize standard tier' },
        freightPerUnit: { value: 3.6, source: 'ESTIMATE', basis: 'Rigid protective freight' },
        dutyPerUnit: { value: 0.8, source: 'ESTIMATE', basis: 'Tariff classification' },
        adsCostPerUnit: { value: 5.25, source: 'ASSUMPTION', basis: 'PPC target ACOS 15%' },
        returnRate: { value: 0.06, source: 'ASSUMPTION', basis: 'Fragile acrylic return benchmark 6%' },
        returnLossPerUnit: { value: 12.0, source: 'ESTIMATE', basis: 'Cracked returns non-resellable loss' },
        storageFeePerUnit: { value: 0.45, source: 'ESTIMATE', basis: 'Standard storage tier' },
        otherCostsPerUnit: { value: 0.8, source: 'ESTIMATE', basis: 'Bubble wrap pack' },
      },
      'USD',
    );

    const cand3Economics = CandidateEconomicsService.calculateEconomics(
      {
        sellingPrice: { value: 42.99, source: 'FACT', basis: 'Amazon retail target' },
        productCost: { value: 21.0, source: 'FACT', basis: 'Metal fabrication quotation' },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE', basis: 'Amazon standard fee' },
        fbaFeePerUnit: { value: 11.5, source: 'ESTIMATE', basis: 'Heavy oversize FBA tier' },
        freightPerUnit: { value: 8.5, source: 'ESTIMATE', basis: 'Heavyweight ocean freight' },
        dutyPerUnit: { value: 1.5, source: 'ESTIMATE', basis: 'Steel goods tariff classification' },
        adsCostPerUnit: { value: 6.0, source: 'ASSUMPTION', basis: 'PPC ad allocation' },
        returnRate: { value: 0.03, source: 'ASSUMPTION', basis: 'Return rate benchmark 3%' },
        returnLossPerUnit: { value: 18.0, source: 'ESTIMATE', basis: 'Oversize return fee' },
        storageFeePerUnit: { value: 1.2, source: 'ESTIMATE', basis: 'Oversize cubic storage' },
        otherCostsPerUnit: { value: 1.0, source: 'ESTIMATE', basis: 'Caster assembly box' },
      },
      'USD',
    );

    const defaultCandidates: ProductCandidate[] = [
      {
        id: 'cand-linen-box',
        title: 'Foldable Linen Storage File Box with Lid & Wood Handles',
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
          seedKeyword: 'linen file box',
          searchVolumeMonthly: 28000,
          competitiveDifficulty: 38,
          opportunityScore: 78,
          competitorSampleSize: 5,
          representativeAsin: 'B08XY12345',
        },
        economics: cand1Economics,
        risks: [
          {
            riskId: 'cand-linen-risk-patent',
            category: 'PATENT',
            title: 'Handle & folding joint patent clearance',
            status: 'PASS',
            severity: 'HIGH',
            evidenceIds: ['evi-linen-patent'],
          },
        ],
        evidence: [
          {
            id: 'evi-linen-quote',
            scope: 'PRODUCT',
            subjectId: 'cand-linen-box',
            source: 'SUPPLIER_OFFICIAL_QUOTE',
            content: '1688 verified factory quote FOB Ningbo $6.20/unit with lid',
            capturedAt: '2026-09-15T00:00:00Z',
          },
          {
            id: 'evi-linen-kw',
            scope: 'KEYWORD',
            subjectId: 'linen file box',
            source: 'XYDC_ABA',
            content: 'Monthly search volume 28,000, steady growth YoY',
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
        title: 'Crystal Clear Acrylic Desktop File Organizer with Gold Brackets',
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
          seedKeyword: 'acrylic file organizer',
          searchVolumeMonthly: 16500,
          competitiveDifficulty: 52,
          opportunityScore: 64,
          competitorSampleSize: 4,
          representativeAsin: 'B09ZZ87654',
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
            id: 'evi-acrylic-quote',
            scope: 'PRODUCT',
            subjectId: 'cand-acrylic-box',
            source: 'SUPPLIER_OFFICIAL_QUOTE',
            content: 'Acrylic injection molding factory quote $9.80/unit',
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
        title: 'Rolling Heavy-Duty Steel Mesh Hanging File Cart with Wheels',
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
          seedKeyword: 'rolling file cart',
          searchVolumeMonthly: 12000,
          competitiveDifficulty: 65,
          opportunityScore: 48,
          competitorSampleSize: 3,
          representativeAsin: 'B07AA11223',
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
            id: 'evi-steel-quote',
            scope: 'PRODUCT',
            subjectId: 'cand-steel-cart',
            source: 'SUPPLIER_OFFICIAL_QUOTE',
            content: 'Metal welding factory quotation $21.00/unit EXW',
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

  getDefaultCandidates(): { candidates: ProductCandidate[]; comparison: CandidateComparisonResult } {
    const candidates = this.buildDefaultCandidates();
    const comparison = CandidateComparisonEngine.compare(candidates);
    return {
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
}


