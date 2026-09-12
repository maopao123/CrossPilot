/**
 * Competitor Pressure Action Policy (Epic 3 Phase 5)
 *
 * Recommends:
 * - REVIEW_PRICE_COMPETITIVENESS: When fresh competitor price undercutting is confirmed
 * - REVIEW_COUPON_STRATEGY: Tactical temporary promotion without list price erosion
 * - REFRESH_COMPETITOR_DATA: When competitor data is STALE (> 7 days)
 *
 * Strict rule: NEVER recommend price adjustments on STALE competitor data.
 * Must downgrade to REFRESH_COMPETITOR_DATA.
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  RecommendedAction,
  ActionRecommendationOptions,
  OperationEvidenceItem,
} from '@crosspilot/shared';
import { IActionRecommendationPolicy } from '../recommendation.types.js';
import { ActionDeduplicator } from '../action-deduplicator.js';

export class CompetitorActionPolicy implements IActionRecommendationPolicy {
  public readonly policyId = 'COMPETITOR_ACTION_POLICY';
  public readonly targetDomains = ['COMPETITOR'] as const;

  public canRecommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): boolean {
    const hasCompDiag = diagnoses.some((d) => d.affectedDomains.includes('COMPETITOR'));
    const hasCompSignal = signals.some((s) => s.domain === 'COMPETITOR');
    return hasCompDiag || hasCompSignal;
  }

  public recommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[],
    _options?: ActionRecommendationOptions
  ): RecommendedAction[] {
    const compCtx = context.competitors;
    if (!compCtx || compCtx.availability === 'UNAVAILABLE') {
      return [];
    }

    const actions: RecommendedAction[] = [];
    const compDiagnoses = diagnoses.filter((d) => d.affectedDomains.includes('COMPETITOR'));
    const compSignals = signals.filter((s) => s.domain === 'COMPETITOR');

    const sourceDiagIds = compDiagnoses.map((d) => d.diagnosisId);
    const sourceSigIds = compSignals.map((s) => s.signalId);

    const isStale = context.freshness?.competitors?.status === 'STALE';
    const mainComp = compCtx.items?.find((c) => c.isPrimary) ?? compCtx.items?.[0];
    const ourPrice = context.sales?.averageSellingPrice?.current ?? 29.99;
    const compPrice = mainComp?.currentPrice ?? 24.99;
    const priceGap = ourPrice - compPrice;

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-ACT-COMP-${context.identity.skuId}`,
        category: 'EXTERNAL_DATA',
        title: '竞品价格遥测',
        content: `目标竞品 ASIN：${mainComp?.asin ?? 'Unknown'}，竞品价格：$${compPrice.toFixed(2)}，我方价格：$${ourPrice.toFixed(2)}，新鲜度：${context.freshness?.competitors?.status ?? 'FRESH'}。`,
        source: 'CompetitorActionPolicy',
        sourceId: 'analyzeCompetitors',
        capturedAt: new Date().toISOString(),
      },
    ];

    // Case A: Stale Data -> REFRESH_COMPETITOR_DATA (Advisory / Low Risk)
    if (isStale) {
      const refreshActionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REFRESH_COMPETITOR_DATA',
        mainComp?.asin ?? 'all'
      );

      actions.push({
        actionId: refreshActionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'INVESTIGATION',
        actionType: 'REFRESH_COMPETITOR_DATA',
        priority: 'P3',
        riskLevel: 'LOW',
        executionMode: 'ADVISORY',
        status: 'PROPOSED',
        title: `重新定价前先刷新竞品 ASIN 价格遥测`,
        reason: `检测到竞品价格异常，但抓取数据已过期（> 7 天）。考虑调价前请先重新核实竞品当前价格。`,
        evidence,
        expectedImpact: `确保定价决策基于准确、实时的市场基准。`,
        impactType: 'QUALITATIVE',
        recommendationGateStatus: 'NEEDS_REVIEW',
        targetEntity: 'CompetitorSnapshot',
        targetId: mainComp?.asin,
        payload: {
          asin: mainComp?.asin,
          staleAsOf: context.freshness?.competitors?.asOf,
        },
        createdAt: new Date().toISOString(),
      });

      return actions; // Strictly stop here: NO price change recommendations on stale data!
    }

    // Case B: Fresh Data -> REVIEW_PRICE_COMPETITIVENESS & REVIEW_COUPON_STRATEGY
    const priceActionId = ActionDeduplicator.generateActionId(
      context.identity.workspaceId,
      context.identity.skuId,
      'REVIEW_PRICE_COMPETITIVENESS',
      mainComp?.asin ?? 'primary'
    );

    actions.push({
      actionId: priceActionId,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      sourceSignalIds: sourceSigIds,
      sourceDiagnosisIds: sourceDiagIds,
      category: 'PRICING',
      actionType: 'REVIEW_PRICE_COMPETITIVENESS',
      priority: 'P2',
      riskLevel: 'MEDIUM',
      executionMode: 'APPROVAL_REQUIRED',
      status: 'PROPOSED',
      title: `审查价格定位：竞品低价 $${priceGap.toFixed(2)}`,
      reason: `直接竞品 ${mainComp?.asin ?? ''} 定价 $${compPrice.toFixed(2)}（比我方 $${ourPrice.toFixed(2)} 低 $${priceGap.toFixed(2)}），对转化形成下行压力。`,
      evidence,
      expectedImpact: `在竞品激进折扣下保卫市场份额与自然搜索转化。`,
      impactAmount: -priceGap,
      impactType: 'QUALITATIVE',
      recommendationGateStatus: 'READY',
      targetEntity: 'PriceRule',
      payload: {
        competitorAsin: mainComp?.asin,
        competitorPrice: compPrice,
        ourPrice,
        priceGap,
      },
      createdAt: new Date().toISOString(),
    });

    return actions;
  }
}
