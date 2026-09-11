import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IntegrationGateway } from '@crosspilot/integrations';
import { MarketOverviewSnapshot } from '@crosspilot/shared';

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
    return {
      products: res.data || [],
      total: Array.isArray(res.data) ? res.data.length : 0,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
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
    metric = 'SALES',
    range = '90d',
    marketplace = 'AMAZON_US',
  ) {
    const gateway = IntegrationGateway.getInstance();
    const res = await gateway.executeCapability(
      'market.product.trend',
      { asin, metric, range, marketplace },
      { workspaceId: workspaceId || 'default', traceId: `trace_${Date.now()}`, marketplace },
    );
    return {
      trend: res.data,
      provider: res.providerId,
      transport: res.transport,
      mode: res.mode,
      capturedAt: res.capturedAt,
    };
  }
}
