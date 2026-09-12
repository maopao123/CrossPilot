/**
 * Advertising Action Policy (Epic 3 Phase 5)
 *
 * Recommends:
 * - REVIEW_NEGATIVE_KEYWORD: for zero-conversion high-spend search terms
 * - REVIEW_AD_SPEND: for spend growth decoupled from sales
 * - REVIEW_BID: for ACOS expansion above target
 *
 * Strict boundary: Recommends review only. Does NOT write to Amazon Advertising API.
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

export class AdvertisingActionPolicy implements IActionRecommendationPolicy {
  public readonly policyId = 'ADVERTISING_ACTION_POLICY';
  public readonly targetDomains = ['ADVERTISING'] as const;

  public canRecommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): boolean {
    const hasAdDiagnosis = diagnoses.some((d) => d.affectedDomains.includes('ADVERTISING'));
    const hasAdSignal = signals.some((s) => s.domain === 'ADVERTISING');
    return hasAdDiagnosis || hasAdSignal;
  }

  public recommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[],
    _options?: ActionRecommendationOptions
  ): RecommendedAction[] {
    const adCtx = context.advertising;
    if (!adCtx || adCtx.availability === 'UNAVAILABLE') {
      return [];
    }

    const actions: RecommendedAction[] = [];
    const adDiagnoses = diagnoses.filter((d) => d.affectedDomains.includes('ADVERTISING'));
    const adSignals = signals.filter((s) => s.domain === 'ADVERTISING');

    const sourceDiagIds = adDiagnoses.map((d) => d.diagnosisId);
    const sourceSigIds = adSignals.map((s) => s.signalId);

    const searchTerms = adCtx.searchTerms ?? [];
    const zeroConversionTerms = searchTerms
      .filter((t) => t.clicks >= 15 && t.orders === 0 && t.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-ACT-AD-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: '广告效果快照',
        content: `花费：$${adCtx.spend.current.toFixed(2)}，ACOS：${(adCtx.acos.current * 100).toFixed(1)}%，目标：${((adCtx.targetAcos ?? 0.30) * 100).toFixed(0)}%，点击：${adCtx.clicks.current}，订单：${adCtx.orders.current}。`,
        source: 'AdvertisingActionPolicy',
        sourceId: 'analyzeAdvertising',
        capturedAt: new Date().toISOString(),
      },
    ];

    // 1. Zero-conversion search terms -> REVIEW_NEGATIVE_KEYWORD
    if (zeroConversionTerms.length > 0) {
      const topTerm = zeroConversionTerms[0];
      const wasteSpend = topTerm.spend;

      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_NEGATIVE_KEYWORD',
        topTerm.searchTerm
      );

      actions.push({
        actionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'ADVERTISING',
        actionType: 'REVIEW_NEGATIVE_KEYWORD',
        priority: wasteSpend >= 100 ? 'P1' : 'P2',
        riskLevel: 'LOW',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `审查搜索词 "${topTerm.searchTerm}"，考虑精准否定投放`,
        reason: `该搜索词消耗 ${topTerm.clicks} 次点击、0 订单，浪费广告花费 $${wasteSpend.toFixed(2)}。`,
        evidence,
        expectedImpact: `本期观察到的花费中最多约 $${wasteSpend.toFixed(2)} 与零转化流量相关。`,
        impactAmount: -wasteSpend,
        impactType: 'MEASURED',
        recommendationGateStatus: 'READY',
        targetEntity: 'SearchTerm',
        targetId: topTerm.searchTerm,
        payload: {
          searchTerm: topTerm.searchTerm,
          clicks: topTerm.clicks,
          spend: wasteSpend,
          suggestedMatchType: 'NEGATIVE_EXACT',
        },
        createdAt: new Date().toISOString(),
      });
    }

    // 2. Decoupled Spend Surge -> REVIEW_AD_SPEND
    const spendDeltaPct = adCtx.spend.deltaPct;
    const salesDeltaPct = adCtx.sales.deltaPct;
    if (spendDeltaPct > 0.20 && salesDeltaPct <= 0.05) {
      const spendDelta = adCtx.spend.delta;
      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_AD_SPEND',
        'decoupled'
      );

      actions.push({
        actionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'ADVERTISING',
        actionType: 'REVIEW_AD_SPEND',
        priority: 'P2',
        riskLevel: 'MEDIUM',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `审查广告花费效率：预算扩张而销售边际递减`,
        reason: `广告花费增长 ${(spendDeltaPct * 100).toFixed(1)}%（+$${spendDelta.toFixed(2)}），而归因销售仅变动 ${(salesDeltaPct * 100).toFixed(1)}%。`,
        evidence,
        expectedImpact: `重新分配低效活动预算，可防止利润率被进一步稀释。`,
        impactAmount: -spendDelta,
        impactType: 'MEASURED',
        recommendationGateStatus: 'READY',
        targetEntity: 'CampaignBudget',
        payload: {
          spendDelta,
          spendDeltaPct,
          salesDeltaPct,
        },
        createdAt: new Date().toISOString(),
      });
    }

    // 3. ACOS Expansion above Target -> REVIEW_BID
    const targetAcos = adCtx.targetAcos ?? 0.30;
    if (adCtx.acos.current > targetAcos && actions.length === 0) {
      const curSpend = adCtx.spend.current;
      const curSales = adCtx.sales.current;
      const excessSpend = Math.max(0, curSpend - curSales * targetAcos);

      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_BID',
        'acos'
      );

      actions.push({
        actionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'ADVERTISING',
        actionType: 'REVIEW_BID',
        priority: 'P2',
        riskLevel: 'MEDIUM',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `审查关键词竞价，抑制 ACOS 扩张`,
        reason: `ACOS 扩张至 ${(adCtx.acos.current * 100).toFixed(1)}%（基准：${(adCtx.acos.baseline * 100).toFixed(1)}%，目标：${(targetAcos * 100).toFixed(0)}%）。`,
        evidence,
        expectedImpact: `将竞价校准至目标 ACOS，预计可节省超目标花费约 $${excessSpend.toFixed(2)}。`,
        impactAmount: -excessSpend,
        impactType: 'ESTIMATED',
        recommendationGateStatus: 'READY',
        targetEntity: 'KeywordBids',
        payload: {
          currentAcos: adCtx.acos.current,
          targetAcos,
          excessSpend,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return actions;
  }
}
