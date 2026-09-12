/**
 * Advertising Efficiency Diagnosis Pattern (Epic 3 Phase 4)
 *
 * Diagnoses root causes of advertising anomalies:
 * - High ACOS / Target breach (R-ADS-01)
 * - Spend surged without sales growth (R-ADS-02)
 * - Zero-conversion search term budget waste (R-ADS-03)
 *
 * Strict boundary: Load != Detect != Diagnose != Recommend
 * Pure diagnosis only. NO action recommendations (e.g. no "add negative keyword").
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

import { roundMoney, roundMargin } from '../../../profit/profit-calculation.service.js';
import { IDiagnosisPattern, DiagnosisExecutionOptions } from '../diagnosis.types.js';

export class AdvertisingEfficiencyPattern implements IDiagnosisPattern {
  public readonly patternId = 'ADVERTISING_EFFICIENCY_PATTERN';
  public readonly targetRuleIds = ['R-ADS-01', 'R-ADS-02', 'R-ADS-03'] as const;
  public readonly targetSignalCodes = [
    'ACOS_SPIKE',
    'AD_SPEND_INEFFICIENT',
    'ZERO_CONVERSION_SPEND',
  ] as const;

  public canDiagnose(context: Sku360BusinessContext, signals: BusinessSignal[]): boolean {
    return signals.some(
      (s) => s.domain === 'ADVERTISING' || this.targetSignalCodes.includes(s.code as any)
    );
  }

  public diagnose(
    context: Sku360BusinessContext,
    signals: BusinessSignal[],
    _options?: DiagnosisExecutionOptions
  ): DiagnosisResult | null {
    const adCtx = context.advertising;
    const targetSignals = signals.filter(
      (s) => s.domain === 'ADVERTISING' || this.targetSignalCodes.includes(s.code as any)
    );
    const targetSignalIds = targetSignals.map((s) => s.signalId);

    // 1. Data Availability Check
    if (!adCtx || adCtx.availability === 'UNAVAILABLE') {
      const emptyDriver: DiagnosisDriver = {
        domain: 'ADVERTISING',
        metric: 'spend',
        direction: 'UP',
        causalStrength: 'UNKNOWN',
        description: '广告数据不可用。',
      };

      return {
        diagnosisId: `DIAG-ADS-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: '广告异常？遥测数据缺失',
        summary: '广告遥测标记为 UNAVAILABLE，无法核验搜索词与 ACOS 归因。',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['ADVERTISING'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['广告遥测为 UNAVAILABLE；无法核验搜索词与广告活动表现。'],
        calculatedAt: new Date().toISOString(),
      };
    }

    const curSpend = roundMoney(adCtx.spend.current);
    const curSales = roundMoney(adCtx.sales.current);
    const curAcos = adCtx.acos.current;
    const baseAcos = adCtx.acos.baseline;
    const targetAcos = adCtx.targetAcos ?? 0.30;
    const searchTerms = adCtx.searchTerms ?? [];

    // 2. Identify Zero-Conversion Search Term Waste
    const zeroConversionTerms = searchTerms
      .filter((t) => t.clicks >= 15 && t.orders === 0 && t.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const totalWastedSpend = roundMoney(
      zeroConversionTerms.reduce((sum, t) => sum + t.spend, 0)
    );
    const wasteRatio = curSpend > 0 ? roundMargin(totalWastedSpend / curSpend) : 0;

    // 3. Identify ACOS Dilution / Target Breach
    const excessSpend = Math.max(0, roundMoney(curSpend - curSales * targetAcos));

    // 4. Identify Decoupled Spend Surge
    const spendDeltaPct = adCtx.spend.deltaPct;
    const salesDeltaPct = adCtx.sales.deltaPct;
    const isDecoupled = spendDeltaPct > 0.20 && salesDeltaPct <= 0.05;

    // 5. Build Candidate Drivers
    const candidateDrivers: DiagnosisDriver[] = [];

    if (totalWastedSpend > 0) {
      const topTerm = zeroConversionTerms[0];
      const relatedSig = targetSignals.filter((s) => s.code === 'ZERO_CONVERSION_SPEND').map((s) => s.signalId);
      candidateDrivers.push({
        domain: 'ADVERTISING',
        metric: 'zeroConversionSearchTermSpend',
        impactAmount: -totalWastedSpend,
        impactType: 'MEASURED',
        contributionRatio: wasteRatio,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: relatedSig,
        description: `${zeroConversionTerms.length} 个零转化搜索词消耗 $${totalWastedSpend.toFixed(2)}（占广告预算 ${(wasteRatio * 100).toFixed(1)}%）。最大浪费："${topTerm.searchTerm}"（$${topTerm.spend.toFixed(2)}，${topTerm.clicks} 次点击，0 订单）。`,
      });
    }

    if (curAcos > targetAcos) {
      const relatedSig = targetSignals.filter((s) => s.code === 'ACOS_SPIKE').map((s) => s.signalId);
      candidateDrivers.push({
        domain: 'ADVERTISING',
        metric: 'acosExpansion',
        impactAmount: -excessSpend,
        impactType: 'ESTIMATED',
        contributionRatio: curSpend > 0 ? roundMargin(excessSpend / curSpend) : 0,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: relatedSig,
        description: `ACOS 扩张至 ${(curAcos * 100).toFixed(1)}%（基准：${(baseAcos * 100).toFixed(1)}%，目标：${(targetAcos * 100).toFixed(1)}%），产生 $${excessSpend.toFixed(2)} 的超目标花费。`,
      });
    }

    if (isDecoupled) {
      const relatedSig = targetSignals.filter((s) => s.code === 'AD_SPEND_INEFFICIENT').map((s) => s.signalId);
      candidateDrivers.push({
        domain: 'ADVERTISING',
        metric: 'spendDecoupledFromSales',
        impactAmount: -roundMoney(adCtx.spend.delta),
        impactType: 'MEASURED',
        contributionRatio: 0.5,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: relatedSig,
        description: `广告花费增长 ${(spendDeltaPct * 100).toFixed(1)}%（+$${adCtx.spend.delta.toFixed(2)}），而归因销售仅变动 ${(salesDeltaPct * 100).toFixed(1)}%，证实边际回报递减。`,
      });
    }

    // Fallback if no specific condition met but signal triggered
    if (candidateDrivers.length === 0) {
      candidateDrivers.push({
        domain: 'ADVERTISING',
        metric: 'adSpendInefficiency',
        impactAmount: -curSpend,
        contributionRatio: 1.0,
        direction: 'DOWN',
        causalStrength: 'INDICATIVE',
        relatedSignalIds: targetSignalIds,
        description: `广告表现偏离目标阈值，当期花费 $${curSpend.toFixed(2)}。`,
      });
    }

    // 6. Rank Drivers
    candidateDrivers.sort((a, b) => Math.abs(b.impactAmount ?? 0) - Math.abs(a.impactAmount ?? 0));
    const primaryDriver = candidateDrivers[0];
    const secondaryDrivers = candidateDrivers.slice(1);

    // 7. Formulate Root Cause Code & Narrative
    let rootCauseCode = 'AD_ACOS_EXPANSION';
    let title = `ACOS 飙升至 ${(curAcos * 100).toFixed(1)}%，超过 ${(targetAcos * 100).toFixed(1)}% 目标`;

    if (primaryDriver.metric === 'zeroConversionSearchTermSpend' || totalWastedSpend >= 30) {
      rootCauseCode = 'AD_EFFICIENCY_SEARCH_TERM_WASTE';
      title = `广告低效：$${totalWastedSpend.toFixed(2)} 浪费于零转化搜索词`;
    } else if (primaryDriver.metric === 'spendDecoupledFromSales' || isDecoupled) {
      rootCauseCode = 'AD_SPEND_DECOUPLED_FROM_SALES';
      title = `广告花费激增 ${(spendDeltaPct * 100).toFixed(1)}%，销售未见相应增长`;
    }

    const summary = `${title}。主要驱动：${primaryDriver.description}`;

    // 8. Evidence Gate & Unknowns
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (adCtx.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('广告遥测为 PARTIAL；部分广告活动指标为汇总值。');
    }
    if (searchTerms.length === 0) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('缺少搜索词报告；无法逐项列出具体搜索查询浪费。');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-ADS-DIAG-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: '广告效果归因',
        content: `当期花费：$${curSpend.toFixed(2)}，销售额：$${curSales.toFixed(2)}，ACOS：${(curAcos * 100).toFixed(1)}%（目标：${(targetAcos * 100).toFixed(1)}%）。搜索词浪费花费：$${totalWastedSpend.toFixed(2)}。`,
        source: 'AdOptimizerService',
        sourceId: 'analyzeSearchTerms',
        capturedAt: new Date().toISOString(),
        metadata: {
          currentSpend: curSpend,
          currentSales: curSales,
          currentAcos: curAcos,
          wastedSpend: totalWastedSpend,
          wasteRatio,
          zeroConversionCount: zeroConversionTerms.length,
        },
      },
    ];

    return {
      diagnosisId: `DIAG-ADS-${context.identity.skuId}-${context.currentPeriod.to.slice(0, 10).replace(/-/g, '')}`,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      title,
      summary,
      primaryDriver,
      secondaryDrivers,
      confidence: gateStatus === 'SUPPORTED' ? 0.94 : 0.72,
      evidence,
      affectedDomains: ['ADVERTISING'],
      affectedSkus: [context.identity.skuId],
      gateStatus,
      targetSignalIds,
      rootCauseCode,
      unknowns: unknowns.length > 0 ? unknowns : undefined,
      calculatedAt: new Date().toISOString(),
    };
  }
}
