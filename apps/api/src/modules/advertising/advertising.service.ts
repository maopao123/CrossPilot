import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdOptimizerService } from '@crosspilot/domain';

@Injectable()
export class AdvertisingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaigns(workspaceId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId },
      include: {
        adTargets: true,
        adMetricsDaily: {
          orderBy: { metricDate: 'desc' },
          take: 30,
        },
      },
    });

    return campaigns.map((c) => {
      const totalSpend = c.adMetricsDaily.reduce((acc, m) => acc + Number(m.spend), 0);
      const totalSales = c.adMetricsDaily.reduce((acc, m) => acc + Number(m.sales), 0);
      const totalClicks = c.adMetricsDaily.reduce((acc, m) => acc + m.clicks, 0);
      const totalImpressions = c.adMetricsDaily.reduce((acc, m) => acc + m.impressions, 0);
      const totalOrders = c.adMetricsDaily.reduce((acc, m) => acc + m.orders, 0);

      const acos = totalSales > 0 ? totalSpend / totalSales : 0;
      const roas = totalSpend > 0 ? totalSales / totalSpend : 0;

      return {
        id: c.id,
        name: c.name,
        campaignType: c.campaignType,
        targetingType: c.targetingType,
        budget: Number(c.budget),
        status: c.status,
        startDate: c.startDate,
        targetsCount: c.adTargets.length,
        metrics30d: {
          impressions: totalImpressions,
          clicks: totalClicks,
          spend: Math.round(totalSpend * 100) / 100,
          sales: Math.round(totalSales * 100) / 100,
          orders: totalOrders,
          acos: Math.round(acos * 10000) / 10000,
          roas: Math.round(roas * 100) / 100,
        },
      };
    });
  }

  async getSearchTerms(workspaceId: string, campaignId?: string) {
    const terms = await this.prisma.searchTermMetricDaily.findMany({
      where: {
        campaign: { workspaceId },
        ...(campaignId ? { campaignId } : {}),
      },
      orderBy: { spend: 'desc' },
    });

    return terms.map((t) => ({
      id: t.id,
      campaignId: t.campaignId,
      skuId: t.skuId,
      searchTerm: t.searchTerm,
      impressions: t.impressions,
      clicks: t.clicks,
      spend: Number(t.spend),
      orders: t.orders,
      sales: Number(t.sales),
      acos: Number(t.acos),
      analysis: AdOptimizerService.analyzeSearchTerm({
        searchTerm: t.searchTerm,
        impressions: t.impressions,
        clicks: t.clicks,
        spend: Number(t.spend),
        orders: t.orders,
        sales: Number(t.sales),
      }),
    }));
  }

  async getNegativeRecommendations(workspaceId: string) {
    const terms = await this.prisma.searchTermMetricDaily.findMany({
      where: {
        campaign: { workspaceId },
      },
    });
    const recommendations = [];

    for (const term of terms) {
      const analysis = AdOptimizerService.analyzeSearchTerm({
        searchTerm: term.searchTerm,
        impressions: term.impressions,
        clicks: term.clicks,
        spend: Number(term.spend),
        orders: term.orders,
        sales: Number(term.sales),
      });

      if (analysis.action === 'ADD_NEGATIVE_EXACT') {
        recommendations.push({
          searchTerm: term.searchTerm,
          campaignId: term.campaignId,
          skuId: term.skuId,
          spend: Number(term.spend),
          sales: Number(term.sales),
          acos: Number(term.acos),
          reason: analysis.reason,
          action: 'ADD_NEGATIVE_EXACT',
          savingsProjectedMonthly: Math.round(Number(term.spend) * 4 * 100) / 100,
        });
      }
    }

    return recommendations;
  }

  async applyNegativeKeyword(payload: {
    campaignId: string;
    searchTerm: string;
    workspaceId: string;
  }) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: payload.campaignId, workspaceId: payload.workspaceId },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${payload.campaignId} not found in workspace`);
    }

    const existing = await this.prisma.adTarget.findFirst({
      where: {
        campaignId: payload.campaignId,
        targetValue: payload.searchTerm,
        matchType: 'NEGATIVE_EXACT',
      },
    });

    if (existing) {
      return {
        success: true,
        appliedTargetId: existing.id,
        targetValue: existing.targetValue,
        matchType: existing.matchType,
        message: `Negative exact keyword "${payload.searchTerm}" is already applied.`,
      };
    }

    const target = await this.prisma.adTarget.create({
      data: {
        campaignId: payload.campaignId,
        targetType: 'KEYWORD',
        targetValue: payload.searchTerm,
        matchType: 'NEGATIVE_EXACT',
        bid: 0,
        status: 'ENABLED',
      },
    });

    return {
      success: true,
      appliedTargetId: target.id,
      targetValue: target.targetValue,
      matchType: target.matchType,
      message: `Negative exact keyword "${payload.searchTerm}" successfully added to campaign.`,
    };
  }
}
