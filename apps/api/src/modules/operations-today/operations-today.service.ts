import { Injectable } from '@nestjs/common';
import {
  DailyOperationTaskSummaryDto,
  OperationsInsightCard,
  OperationsRecommendationView,
  OperationsTodayDto,
  OperationsVocView,
} from '@crosspilot/shared';
import { VocIntelligenceEngine } from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfitService } from '../profit/profit.service.js';
import { AdvertisingService } from '../advertising/advertising.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { SimulatorService } from '../simulator/simulator.service.js';
import { DailyDiagnosisService } from '../daily-diagnosis/daily-diagnosis.service.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import {
  aggregateCampaignMetrics,
  assessInventoryHealth,
  buildHeadline,
  buildHealth,
  insightsFromDiagnosis,
  mapSimEventToInsight,
  pickCritical,
} from './operations-today.mapper.js';

@Injectable()
export class OperationsTodayService {
  private readonly vocEngine = new VocIntelligenceEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly profit: ProfitService,
    private readonly advertising: AdvertisingService,
    private readonly inventory: InventoryService,
    private readonly simulator: SimulatorService,
    private readonly diagnosis: DailyDiagnosisService,
    private readonly intel: IntelligenceService,
  ) {}

  async getInsights(workspaceId: string): Promise<{ insights: OperationsInsightCard[] }> {
    const today = await this.getToday(workspaceId);
    return { insights: today.insights };
  }

  async getToday(workspaceId: string): Promise<OperationsTodayDto> {
    const [profit, campaigns, inventory, sim, recs, facts, orderCount, latestTask, reviews] =
      await Promise.all([
        this.profit.getProfitSummary(workspaceId),
        this.advertising.getCampaigns(workspaceId),
        this.inventory.listInventory(workspaceId),
        this.simulator.getState(workspaceId),
        this.intel.listRecommendations(workspaceId),
        this.intel.listFacts(workspaceId),
        this.prisma.order.count({ where: { workspaceId } }),
        this.prisma.agentTask.findFirst({
          where: { workspaceId, taskType: 'DAILY_OPERATION_WF05' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        }),
        this.prisma.review.findMany({
          where: { workspaceId },
          orderBy: { reviewDate: 'desc' },
          take: 20,
          select: { content: true, rating: true },
        }),
      ]);

    const ads = aggregateCampaignMetrics(campaigns);
    const inv = assessInventoryHealth(inventory);
    const health = buildHealth({
      revenue: Number(profit.revenue || 0),
      profit: Number(profit.netProfit || 0),
      margin: Number(profit.margin || 0),
      adsCost: Number(profit.adsCost || 0),
      orderCount,
      ads,
      inventory: inv,
    });

    let diagnosisSummary: DailyOperationTaskSummaryDto | null = null;
    if (latestTask?.id) {
      try {
        diagnosisSummary = await this.diagnosis.getTaskSummary(
          latestTask.id,
          workspaceId,
          'actions,signals,diagnoses',
        );
      } catch {
        diagnosisSummary = null;
      }
    }

    const simEvents = ((sim as any)?.recentEvents || (sim as any)?.events || []) as Array<{
      id: string;
      code: string;
      severity: string;
      title: string;
      description: string;
      sku?: { skuCode?: string | null } | null;
    }>;
    const simInsights = simEvents.map((event) => mapSimEventToInsight(event));
    const wfInsights = insightsFromDiagnosis(diagnosisSummary);
    const insights = this.uniqueInsights([...wfInsights, ...simInsights]);
    const criticalIssues = pickCritical(insights);

    const evidence = await this.intel.listEvidence(workspaceId);
    const quoteById = new Map(evidence.map((item) => [item.id, item.quote]));
    const recommendations: OperationsRecommendationView[] = recs.map((rec) => ({
      id: rec.id,
      decision: rec.decision,
      reason: rec.reason,
      confidence: rec.confidence,
      status: rec.status,
      evidenceIds: rec.evidenceIds,
      evidenceQuotes: rec.evidenceIds.map((id) => quoteById.get(id)).filter((q): q is string => Boolean(q)),
      generatedBy: rec.playbookRunId ? 'Playbook' : 'Intelligence',
      playbookRunId: rec.playbookRunId,
      executionDispatched: rec.executionDispatched,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    }));

    const recentReviews = reviews
      .map((row) => (row.content || '').trim())
      .filter((text) => text.length >= 8);
    const voc = this.buildVoc(facts, recentReviews);

    const simState = sim as {
      initialized?: boolean;
      simDate?: string;
      dayIndex?: number;
      status?: string;
    };

    return {
      asOf: new Date().toISOString(),
      headline: buildHeadline(criticalIssues, health, simState.simDate),
      sim: {
        initialized: Boolean(simState.initialized),
        simDate: simState.simDate,
        dayIndex: simState.dayIndex,
        status: simState.status,
      },
      health,
      criticalIssues,
      insights,
      recommendations,
      voc,
      recentDecisions: recommendations
        .filter((rec) => rec.status === 'APPROVED' || rec.status === 'EXECUTED' || rec.status === 'REJECTED')
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 8)
        .map((rec) => ({
          id: rec.id,
          decision: rec.decision,
          status: rec.status,
          updatedAt: rec.updatedAt,
        })),
      diagnosis: diagnosisSummary
        ? {
            taskId: diagnosisSummary.taskId,
            status: diagnosisSummary.status,
            healthStatus: diagnosisSummary.healthStatus,
          }
        : latestTask
          ? { taskId: latestTask.id, status: 'UNKNOWN' }
          : null,
    };
  }

  private uniqueInsights(cards: OperationsInsightCard[]): OperationsInsightCard[] {
    const seen = new Set<string>();
    const out: OperationsInsightCard[] = [];
    for (const card of cards) {
      const key = `${card.source}:${card.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(card);
    }
    return out;
  }

  private buildVoc(
    facts: Array<{ id: string; factType: string; valueJson: Record<string, unknown>; observedAt: string }>,
    recentReviews: string[],
  ): OperationsVocView | null {
    const live = recentReviews.length
      ? this.vocEngine.analyze({ reviews: recentReviews })
      : null;
    const stored = facts.find((fact) => fact.factType === 'VOC');
    const outputs =
      stored && stored.valueJson.outputs && typeof stored.valueJson.outputs === 'object'
        ? (stored.valueJson.outputs as Record<string, string>)
        : undefined;
    const painPoints = live?.painPoints?.length
      ? live.painPoints
      : outputs?.productImprovement
        ? [outputs.productImprovement]
        : [];
    if (!stored && !live) return null;
    return {
      factId: stored?.id,
      painPoints,
      listingSuggestion: live?.outputs.listingImprovement || outputs?.listingImprovement,
      productImprovement: live?.outputs.productImprovement || outputs?.productImprovement,
      negativeCount: painPoints.length,
      sampleSize: live?.cleanedTexts.length || recentReviews.length,
      recentReviews: recentReviews.slice(0, 8),
    };
  }
}
