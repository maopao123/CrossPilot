/**
 * Profit Action Policy (Epic 3 Phase 5)
 *
 * Direct Driver-to-Action Mapping:
 * - Ads Driver -> REVIEW_AD_SPEND
 * - Returns Driver -> REVIEW_RETURN_REASON
 * - Inventory Driver -> REVIEW_REORDER_PLAN
 * - Price Driver -> REVIEW_PRICE_COMPETITIVENESS
 * - Cost Driver -> INVESTIGATE_PROFIT_DRIVER
 *
 * Strict rule: NEVER generate generic "improve profit" recommendations.
 * Every action must be bound to a mathematical waterfall attribution driver.
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

export class ProfitActionPolicy implements IActionRecommendationPolicy {
  public readonly policyId = 'PROFIT_ACTION_POLICY';
  public readonly targetDomains = ['PROFIT'] as const;

  public canRecommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): boolean {
    const hasProfitDiagnosis = diagnoses.some((d) => d.affectedDomains.includes('PROFIT'));
    const hasProfitSignal = signals.some((s) => s.domain === 'PROFIT');
    return hasProfitDiagnosis || hasProfitSignal;
  }

  public recommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[],
    _options?: ActionRecommendationOptions
  ): RecommendedAction[] {
    const profit = context.profit;
    if (!profit || profit.availability === 'UNAVAILABLE') {
      return [];
    }

    const actions: RecommendedAction[] = [];
    const profitDiagnoses = diagnoses.filter((d) => d.affectedDomains.includes('PROFIT'));
    const profitSignals = signals.filter((s) => s.domain === 'PROFIT');

    if (profitDiagnoses.length === 0 && profitSignals.length === 0) {
      return [];
    }

    const sourceDiagIds = profitDiagnoses.map((d) => d.diagnosisId);
    const sourceSigIds = profitSignals.map((s) => s.signalId);

    const primaryDiagnosis = profitDiagnoses[0];
    const primaryDriver = primaryDiagnosis?.primaryDriver;

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-ACT-PROF-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: 'Profit Waterfall Decomposition Evidence',
        content: `Net Profit: $${profit.netProfit.current.toFixed(2)} (Delta: $${profit.netProfit.delta.toFixed(2)}, ${(profit.netProfit.deltaPct * 100).toFixed(1)}%). Primary driver: ${primaryDriver?.metric ?? 'general'}.`,
        source: 'ProfitActionPolicy',
        sourceId: 'attributeVariance',
        capturedAt: new Date().toISOString(),
      },
    ];

    if (!primaryDriver) {
      return [];
    }

    const absImpact = Math.abs(primaryDriver.impactAmount ?? 0);

    // 1. Ads Driver -> REVIEW_AD_SPEND
    if (primaryDriver.domain === 'ADVERTISING' || primaryDriver.metric.toLowerCase().includes('ad')) {
      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_AD_SPEND',
        'profit-driver'
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
        priority: absImpact >= 500 ? 'P1' : 'P2',
        riskLevel: 'MEDIUM',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `Review Ad Spend: Primary Driver of Net Profit Drop (-$${absImpact.toFixed(2)})`,
        reason: `Waterfall attribution identifies advertising cost as the primary profit leakage factor (-$${absImpact.toFixed(2)} impact on net margin).`,
        evidence,
        expectedImpact: `Reining in ad spend restores operating net margin towards baseline level.`,
        impactAmount: -absImpact,
        impactType: 'MEASURED',
        recommendationGateStatus: 'READY',
        targetEntity: 'CampaignBudget',
        payload: {
          driverDomain: 'ADVERTISING',
          impactAmount: primaryDriver.impactAmount,
        },
        createdAt: new Date().toISOString(),
      });
    }
    // 2. Returns Driver -> REVIEW_RETURN_REASON
    else if (primaryDriver.domain === 'RETURNS' || primaryDriver.metric.toLowerCase().includes('return')) {
      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_RETURN_REASON',
        'profit-driver'
      );

      actions.push({
        actionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'REVIEW',
        actionType: 'REVIEW_RETURN_REASON',
        priority: 'P2',
        riskLevel: 'LOW',
        executionMode: 'ADVISORY',
        status: 'PROPOSED',
        title: `Review Return Reasons: Return Losses Driving Profit Erosion (-$${absImpact.toFixed(2)})`,
        reason: `Customer returns and refund processing fees eroded net profit by -$${absImpact.toFixed(2)}.`,
        evidence,
        expectedImpact: `Mitigating top return defects protects bottom-line profitability.`,
        impactAmount: -absImpact,
        impactType: 'MEASURED',
        recommendationGateStatus: 'READY',
        targetEntity: 'ReturnReason',
        payload: {
          driverDomain: 'RETURNS',
          impactAmount: primaryDriver.impactAmount,
        },
        createdAt: new Date().toISOString(),
      });
    }
    // 3. Price Variance Driver -> REVIEW_PRICE_COMPETITIVENESS
    else if (primaryDriver.metric === 'priceRealizationVariance') {
      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_PRICE_COMPETITIVENESS',
        'profit-driver'
      );

      actions.push({
        actionId,
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
        title: `Review Selling Price Realization: Price Compression Diluting Profit`,
        reason: `Average selling price realization declined, impacting net profit by -$${absImpact.toFixed(2)} despite sales volume.`,
        evidence,
        expectedImpact: `Restoring price points or reducing discounting avoids margin dilution.`,
        impactAmount: -absImpact,
        impactType: 'MEASURED',
        recommendationGateStatus: 'READY',
        targetEntity: 'PricingPolicy',
        payload: {
          driverDomain: 'PRICE',
          impactAmount: primaryDriver.impactAmount,
        },
        createdAt: new Date().toISOString(),
      });
    }
    // 4. Default / COGS / Fees -> INVESTIGATE_PROFIT_DRIVER
    else {
      const actionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'INVESTIGATE_PROFIT_DRIVER',
        'cost-variance'
      );

      actions.push({
        actionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'INVESTIGATION',
        actionType: 'INVESTIGATE_PROFIT_DRIVER',
        priority: 'P2',
        riskLevel: 'LOW',
        executionMode: 'ADVISORY',
        status: 'PROPOSED',
        title: `Investigate Unit Economics: Fee & Cost Variance Impacting Margin`,
        reason: `COGS, Amazon FBA fee surcharges, or inbound shipping costs shifted, driving -$${absImpact.toFixed(2)} margin change.`,
        evidence,
        expectedImpact: `Validates supplier invoicing and Amazon fulfillment tier accuracy.`,
        impactAmount: -absImpact,
        impactType: 'MEASURED',
        recommendationGateStatus: 'READY',
        targetEntity: 'FinancialAccounting',
        payload: {
          driverDomain: 'PROFIT',
          impactAmount: primaryDriver.impactAmount,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return actions;
  }
}
