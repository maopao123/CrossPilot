import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async getMarketSnapshot(workspaceId?: string) {
    const defaultMarket = {
      seedKeyword: 'marble toothbrush holder',
      category: 'Home & Kitchen > Bath > Bathroom Accessories',
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
    };

    if (!workspaceId) return defaultMarket;

    const project = await this.prisma.marketResearchProject.findFirst({
      where: { workspaceId },
      include: { snapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 } },
    });

    if (!project || project.snapshots.length === 0) return defaultMarket;

    const snap = project.snapshots[0];
    return {
      seedKeyword: project.seedKeyword,
      category: project.category,
      searchVolumeMonthly: snap.searchVolume,
      avgPrice: Number(snap.avgPrice),
      avgRating: Number(snap.avgRating),
      avgReviewCount: snap.avgReviewCount,
      competitorCount: snap.competitorCount,
      opportunityScore: Number(snap.opportunityScore),
      competitionScore: Number(snap.competitionScore),
      trendingKeywords: defaultMarket.trendingKeywords,
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
}
