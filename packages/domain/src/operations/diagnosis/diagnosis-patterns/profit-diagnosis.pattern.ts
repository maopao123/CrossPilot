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
        description: 'Net profit telemetry is unavailable; variance decomposition cannot be performed.',
      };

      return {
        diagnosisId: `DIAG-PROFIT-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: 'Net Profit Decline ? Missing Telemetry',
        summary: 'Profit telemetry is marked UNAVAILABLE. Cannot perform causal waterfall attribution.',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['PROFIT'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['Profit financial telemetry is UNAVAILABLE; exact waterfall attribution cannot be closed.'],
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
        description: `Advertising expenditure variance impacted net profit by $${wfResult.breakdown.advertising.toFixed(2)}.`,
        relatedSignalCodes: ['ACOS_SPIKE', 'AD_SPEND_INEFFICIENT', 'ZERO_CONVERSION_SPEND'],
      },
      {
        domain: 'RETURNS',
        metric: 'returnLossVariance',
        impact: wfResult.breakdown.returns,
        direction: wfResult.breakdown.returns < 0 ? 'DOWN' : 'UP',
        description: `Customer returns and refund processing variance impacted net profit by $${wfResult.breakdown.returns.toFixed(2)}.`,
        relatedSignalCodes: ['RETURN_RATE_SPIKE'],
      },
      {
        domain: 'INVENTORY',
        metric: 'inventoryCostVariance',
        impact: wfResult.breakdown.inventory,
        direction: wfResult.breakdown.inventory < 0 ? 'DOWN' : 'UP',
        description: `Inventory carrying, storage fees, and stockout disruption impacted net profit by $${wfResult.breakdown.inventory.toFixed(2)}.`,
        relatedSignalCodes: ['STOCKOUT_IMMINENT', 'OUT_OF_STOCK', 'EXCESS_INVENTORY'],
      },
      {
        domain: 'SALES',
        metric: 'priceAndVolumeVariance',
        impact: wfResult.breakdown.price,
        direction: wfResult.breakdown.price < 0 ? 'DOWN' : 'UP',
        description: `Selling price realization and sales volume changes impacted net profit by $${wfResult.breakdown.price.toFixed(2)}.`,
        relatedSignalCodes: ['COMPETITOR_PRICE_DROP'],
      },
      {
        domain: 'PROFIT',
        metric: 'cogsAndAmazonFeesVariance',
        impact: wfResult.breakdown.other,
        direction: wfResult.breakdown.other < 0 ? 'DOWN' : 'UP',
        description: `COGS, FBA fulfillment fees, and commission variances impacted net profit by $${wfResult.breakdown.other.toFixed(2)}.`,
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
      title = 'Topline Revenue Growth Masked by Severe Profit Dilution';
      const salesGrowthStr = `${((context.sales?.revenue?.deltaPct ?? 0) * 100).toFixed(1)}%`;
      summary = `Topline revenue grew by +${salesGrowthStr}, but net profit plunged by -$${absTotalVariance.toFixed(2)} (${dropPctStr}). Cost inflation in ${primaryDriver.domain} (-$${Math.abs(primaryDriver.impactAmount ?? 0).toFixed(2)}) and secondary cost drivers outpaced revenue expansion, severely compressing margins.`;
    } else {
      title = `Net Profit Declined $${absTotalVariance.toFixed(2)} (${dropPctStr})`;
      summary = `Net profit fell from $${profit.netProfit.baseline.toFixed(2)} to $${profit.netProfit.current.toFixed(2)}. Mathematical waterfall attribution proves ${primaryDriver.domain} is the primary causal driver (-$${Math.abs(primaryDriver.impactAmount ?? 0).toFixed(2)}, ${((primaryDriver.contributionRatio ?? 0) * 100).toFixed(1)}%), followed by secondary drivers.`;
    }

    // 6. Evidence Gate Status
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (profit.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Profit telemetry is PARTIAL; some cost components were estimated.');
    }
    if (!wfResult.isExactMatch) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push(`Waterfall attribution has an unexplained residual of $${wfResult.residual.toFixed(2)}.`);
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-PROFIT-WF-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: 'Mathematical Profit Waterfall Closure',
        content: `Exact decomposition: ${wfResult.formulaString}. Residual: $${wfResult.residual.toFixed(2)} (Exact match: ${wfResult.isExactMatch}).`,
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
