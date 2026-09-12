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
        title: 'Advertising Performance Snapshot',
        content: `Spend: $${adCtx.spend.current.toFixed(2)}, ACOS: ${(adCtx.acos.current * 100).toFixed(1)}%, Target: ${((adCtx.targetAcos ?? 0.30) * 100).toFixed(0)}%, Clicks: ${adCtx.clicks.current}, Orders: ${adCtx.orders.current}.`,
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
        title: `Review Search Term "${topTerm.searchTerm}" for Negative Exact Targeting`,
        reason: `Search term consumed ${topTerm.clicks} clicks with 0 orders and $${wasteSpend.toFixed(2)} in wasted ad spend.`,
        evidence,
        expectedImpact: `Up to $${wasteSpend.toFixed(2)} of observed spend is associated with zero-conversion traffic in this period.`,
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
        title: `Review Ad Spend Efficiency: Budget Expanded with Diminishing Sales`,
        reason: `Ad spend increased ${(spendDeltaPct * 100).toFixed(1)}% (+$${spendDelta.toFixed(2)}) while attributed sales moved only ${(salesDeltaPct * 100).toFixed(1)}%.`,
        evidence,
        expectedImpact: `Re-allocating inefficient campaign budgets protects against margin dilution.`,
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
        title: `Review Keyword Bids to Curb ACOS Expansion`,
        reason: `ACOS expanded to ${(adCtx.acos.current * 100).toFixed(1)}% (baseline: ${(adCtx.acos.baseline * 100).toFixed(1)}%, target: ${(targetAcos * 100).toFixed(0)}%).`,
        evidence,
        expectedImpact: `Calibrating bids towards target ACOS could save an estimated $${excessSpend.toFixed(2)} in above-target spend.`,
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
