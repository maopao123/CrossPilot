/**
 * Profit Drop Diagnosis Pattern (Epic 3 Phase 4)
 *
 * Implements deterministic waterfall profit variance decomposition:
 * Total Variance = Advertising + Returns + Inventory + Price + Other (Residual = 0).
 *
 * Handles:
 * - R-PROF-01: PROFIT_DROP
 * - R-PROF-02: CRITICAL_MARGIN
 * - D10: Conflicting signals (Sales up, Profit down -> Margin Dilution / Unprofitable Growth)
 *
 * Strict boundary: Load != Detect != Diagnose != Recommend
 * Pure diagnosis only. NO action recommendations.
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  DiagnosisDriver,
  DiagnosisEvidenceGateStatus,
  OperationEvidenceItem,
  SignalDomain,
} from '@crosspilot/shared';

import {
  VarianceAttributionService,
  VarianceAttributionResult,
} from '../../../variance/variance-attribution.service.js';

import { roundMoney, roundMargin } from '../../../profit/profit-calculation.service.js';
import { IDiagnosisPattern, DiagnosisExecutionOptions } from '../diagnosis.types.js';

export class ProfitDropPattern implements IDiagnosisPattern {
  public readonly patternId = 'PROFIT_DROP_PATTERN';
  public readonly targetRuleIds = ['R-PROF-01', 'R-PROF-02'] as const;
  public readonly targetSignalCodes = ['PROFIT_DROP', 'CRITICAL_MARGIN'] as const;

  public canDiagnose(context: Sku360BusinessContext, signals: BusinessSignal[]): boolean {
    return signals.some(
      (s) => s.domain === 'PROFIT' || this.targetSignalCodes.includes(s.code as any)
    );
  }

  public diagnose(
    context: Sku360BusinessContext,
    signals: BusinessSignal[],
    _options?: DiagnosisExecutionOptions
  ): DiagnosisResult | null {
    const profit = context.profit;
    const targetSignals = signals.filter(
      (s) => s.domain === 'PROFIT' || this.targetSignalCodes.includes(s.code as any)
    );
    const targetSignalIds = targetSignals.map((s) => s.signalId);

    // 1. Data Availability & Gate Check
    if (!profit || profit.availability === 'UNAVAILABLE') {
      const emptyDriver: DiagnosisDriver = {
        domain: 'PROFIT',
        metric: 'netProfit',
        direction: 'DOWN',
        causalStrength: 'UNKNOWN',
        description: '净利润数据不可用，无法执行差异瀑布分解。',
      };

      return {
        diagnosisId: `DIAG-PROFIT-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: '净利润下跌？遥测数据缺失',
        summary: '利润遥测标记为 UNAVAILABLE，无法执行因果瀑布归因。',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['PROFIT'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['利润财务遥测为 UNAVAILABLE；无法闭合瀑布归因。'],
        calculatedAt: new Date().toISOString(),
      };
    }

    // 2. Perform or Retrieve Deterministic Waterfall Breakdown
    let wfResult: VarianceAttributionResult;
    if (profit.waterfallAttribution) {
      wfResult = {
        previousProfit: profit.netProfit.baseline,
        currentProfit: profit.netProfit.current,
        totalVariance: profit.waterfallAttribution.totalVariance,
        isExactMatch: profit.waterfallAttribution.isExactMatch,
        residual: profit.waterfallAttribution.residual,
        breakdown: {
          advertising: profit.waterfallAttribution.advertisingImpact,
          returns: profit.waterfallAttribution.returnsImpact,
          inventory: profit.waterfallAttribution.inventoryImpact,
          price: profit.waterfallAttribution.priceImpact,
          other: profit.waterfallAttribution.otherImpact,
        },
        relativeContributions: {
          advertisingPercent: 0,
          returnsPercent: 0,
          inventoryPercent: 0,
          pricePercent: 0,
          otherPercent: 0,
        },
        formulaString: profit.waterfallAttribution.formulaString,
      };
    } else {
      // Calculate attribution on the fly from context deltas
      const currentProfit = profit.netProfit.current;
      const previousProfit = profit.netProfit.baseline;
      const adsImpact = -roundMoney(profit.adsCost.delta); // increase in ads reduces profit
      const returnsImpact = -roundMoney(profit.returnLoss.delta); // increase in return loss reduces profit
      const priceImpact = roundMoney(profit.revenue.delta - (profit.cogs.delta + profit.amazonFees.delta + profit.fbaFee.delta));
      const inventoryImpact = 0; // default unless separately provided
      const otherImpact = roundMoney((currentProfit - previousProfit) - (adsImpact + returnsImpact + priceImpact + inventoryImpact));

      wfResult = VarianceAttributionService.attributeVariance({
        currentProfit,
        previousProfit,
        advertisingImpact: adsImpact,
        returnsImpact,
        inventoryImpact,
        priceImpact,
        otherImpact,
      });
    }

    // 3. Build Candidate Drivers from Mathematical Waterfall
    const rawDrivers: Array<{
      domain: SignalDomain;
      metric: string;
      impact: number;
      direction: 'DOWN' | 'UP';
      description: string;
      relatedSignalCodes: string[];
    }> = [
      {
        domain: 'ADVERTISING',
        metric: 'advertisingCostVariance',
        impact: wfResult.breakdown.advertising,
        direction: wfResult.breakdown.advertising < 0 ? 'DOWN' : 'UP',
        description: `广告费用差异使净利润变动 $${wfResult.breakdown.advertising.toFixed(2)}。`,
        relatedSignalCodes: ['ACOS_SPIKE', 'AD_SPEND_INEFFICIENT', 'ZERO_CONVERSION_SPEND'],
      },
      {
        domain: 'RETURNS',
        metric: 'returnLossVariance',
        impact: wfResult.breakdown.returns,
        direction: wfResult.breakdown.returns < 0 ? 'DOWN' : 'UP',
        description: `买家退货与退款处理差异使净利润变动 $${wfResult.breakdown.returns.toFixed(2)}。`,
        relatedSignalCodes: ['RETURN_RATE_SPIKE'],
      },
      {
        domain: 'INVENTORY',
        metric: 'inventoryCostVariance',
        impact: wfResult.breakdown.inventory,
        direction: wfResult.breakdown.inventory < 0 ? 'DOWN' : 'UP',
        description: `库存持有、仓储费与断货扰动使净利润变动 $${wfResult.breakdown.inventory.toFixed(2)}。`,
        relatedSignalCodes: ['STOCKOUT_IMMINENT', 'OUT_OF_STOCK', 'EXCESS_INVENTORY'],
      },
      {
        domain: 'SALES',
        metric: 'priceAndVolumeVariance',
        impact: wfResult.breakdown.price,
        direction: wfResult.breakdown.price < 0 ? 'DOWN' : 'UP',
        description: `售价实现与销售量的变化使净利润变动 $${wfResult.breakdown.price.toFixed(2)}。`,
        relatedSignalCodes: ['COMPETITOR_PRICE_DROP'],
      },
      {
        domain: 'PROFIT',
        metric: 'cogsAndAmazonFeesVariance',
        impact: wfResult.breakdown.other,
        direction: wfResult.breakdown.other < 0 ? 'DOWN' : 'UP',
        description: `COGS、FBA 配送费与佣金差异使净利润变动 $${wfResult.breakdown.other.toFixed(2)}。`,
        relatedSignalCodes: ['CRITICAL_MARGIN'],
      },
    ];

    // Compute total absolute negative impact for normalized contribution ratios
    const negativeDrivers = rawDrivers.filter((d) => d.impact < 0);
    const totalNegativeImpact = negativeDrivers.reduce((sum, d) => sum + Math.abs(d.impact), 0);

    const drivers: DiagnosisDriver[] = rawDrivers.map((d) => {
      const matchingSignals = signals.filter(
        (s) => s.domain === d.domain || d.relatedSignalCodes.includes(s.code)
      );
      const ratio =
        d.impact < 0 && totalNegativeImpact > 0
          ? roundMargin(Math.abs(d.impact) / totalNegativeImpact)
          : 0;

      return {
        domain: d.domain,
        metric: d.metric,
        impactAmount: d.impact,
        impactType: 'MEASURED',
        contributionRatio: ratio,
        direction: d.direction,
        causalStrength: 'PROVEN',
        relatedSignalIds: matchingSignals.map((s) => s.signalId),
        description: d.description,
      };
    });

    // 4. Deterministic Driver Ranking by absolute negative impact
    drivers.sort((a, b) => {
      const aVal = (a.impactAmount ?? 0) < 0 ? Math.abs(a.impactAmount ?? 0) : 0;
      const bVal = (b.impactAmount ?? 0) < 0 ? Math.abs(b.impactAmount ?? 0) : 0;
      return bVal - aVal;
    });

    const primaryDriver = drivers[0];
    const secondaryDrivers = drivers.slice(1).filter((d) => Math.abs(d.impactAmount ?? 0) > 0.01);

    // 5. Conflicting Signal Detection (D10: Sales up, Profit down)
    const isSalesGrowing =
      (context.sales?.revenue?.deltaPct ?? 0) > 0.01 || (context.sales?.unitsSold?.deltaPct ?? 0) > 0.01;
    const isProfitPlummeting =
      (profit.netProfit?.deltaPct ?? 0) < -0.10 || (profit.netMargin?.current ?? 0) < 0.05;

    let rootCauseCode = 'PROFIT_EROSION_WATERFALL_ATTRIBUTED';
    let title: string;
    let summary: string;

    const absTotalVariance = Math.abs(wfResult.totalVariance);
    const dropPctStr = `${(Math.abs(profit.netProfit.deltaPct) * 100).toFixed(1)}%`;

    if (isSalesGrowing && isProfitPlummeting) {
      rootCauseCode = 'PROFIT_DILUTION_UNPROFITABLE_GROWTH';
      title = '收入增长被严重利润稀释掩盖';
      const salesGrowthStr = `${((context.sales?.revenue?.deltaPct ?? 0) * 100).toFixed(1)}%`;
      summary = `收入增长 +${salesGrowthStr}，但净利润下跌 -$${absTotalVariance.toFixed(2)}（${dropPctStr}）。${primaryDriver.domain} 成本上涨（-$${Math.abs(primaryDriver.impactAmount ?? 0).toFixed(2)}）及次要成本驱动超过收入扩张，严重压缩利润率。`;
    } else {
      title = `净利润下跌 $${absTotalVariance.toFixed(2)}（${dropPctStr}）`;
      summary = `净利润从 $${profit.netProfit.baseline.toFixed(2)} 下跌至 $${profit.netProfit.current.toFixed(2)}。数学瀑布归因证明 ${primaryDriver.domain} 是主要因果驱动（-$${Math.abs(primaryDriver.impactAmount ?? 0).toFixed(2)}，占比 ${((primaryDriver.contributionRatio ?? 0) * 100).toFixed(1)}%），次要驱动紧随其后。`;
    }

    // 6. Evidence Gate Status
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (profit.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('利润遥测为 PARTIAL；部分成本成分为估算值。');
    }
    if (!wfResult.isExactMatch) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push(`瀑布归因存在 $${wfResult.residual.toFixed(2)} 的未解释残差。`);
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-PROFIT-WF-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: '数学利润瀑布闭合验证',
        content: `精确分解：${wfResult.formulaString}。残差：$${wfResult.residual.toFixed(2)}（精确匹配：${wfResult.isExactMatch}）。`,
        source: 'VarianceAttributionService',
        sourceId: 'attributeVariance',
        capturedAt: new Date().toISOString(),
        metadata: {
          totalVariance: wfResult.totalVariance,
          breakdown: wfResult.breakdown,
          residual: wfResult.residual,
          isExactMatch: wfResult.isExactMatch,
        },
      },
    ];

    const affectedDomains: SignalDomain[] = ['PROFIT'];

    return {
      diagnosisId: `DIAG-PROF-${context.identity.skuId}-${context.currentPeriod.to.slice(0, 10).replace(/-/g, '')}`,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      title,
      summary,
      primaryDriver,
      secondaryDrivers,
      confidence: gateStatus === 'SUPPORTED' ? 0.96 : 0.75,
      evidence,
      affectedDomains,
      affectedSkus: [context.identity.skuId],
      gateStatus,
      targetSignalIds,
      rootCauseCode,
      unknowns: unknowns.length > 0 ? unknowns : undefined,
      calculatedAt: new Date().toISOString(),
      metadata: {
        formulaString: wfResult.formulaString,
        residual: wfResult.residual,
        isExactMatch: wfResult.isExactMatch,
      },
    };
  }
}
