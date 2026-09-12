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
        title: '利润瀑布分解证据',
        content: `净利润：$${profit.netProfit.current.toFixed(2)}（变动：$${profit.netProfit.delta.toFixed(2)}，${(profit.netProfit.deltaPct * 100).toFixed(1)}%）。主要驱动：${primaryDriver?.metric ?? 'general'}。`,
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
        title: `审查广告花费：净利润下跌的主要驱动（-$${absImpact.toFixed(2)}）`,
        reason: `瀑布归因显示广告成本是利润泄漏的主要因素（对净利润影响 -$${absImpact.toFixed(2)}）。`,
        evidence,
        expectedImpact: `控制广告花费，使经营净利率恢复至基准水平。`,
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
        title: `审查退货原因：退货损失侵蚀利润（-$${absImpact.toFixed(2)}）`,
        reason: `买家退货与退款处理费侵蚀净利润 -$${absImpact.toFixed(2)}。`,
        evidence,
        expectedImpact: `改善头部退货缺陷，保护底部利润。`,
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
        title: `审查售价实现：价格压缩稀释利润`,
        reason: `平均售价实现下滑，在销量存在的情况下仍使净利润减少 -$${absImpact.toFixed(2)}。`,
        evidence,
        expectedImpact: `恢复价格或减少折扣，避免利润率稀释。`,
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
        title: `核查单位经济性：费用与成本差异影响利润率`,
        reason: `COGS、Amazon FBA 费用附加或头程运费变动，导致利润率变化 -$${absImpact.toFixed(2)}。`,
        evidence,
        expectedImpact: `核验供应商发票与 Amazon 配送费档位的准确性。`,
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
