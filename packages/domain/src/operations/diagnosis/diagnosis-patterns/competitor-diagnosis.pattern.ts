/**
 * Competitor Pressure Diagnosis Pattern (Epic 3 Phase 4)
 *
 * Diagnoses external competitor market dynamics:
 * - Competitor Price Cut / Undercut (R-COMP-01)
 * - Competitor Rating / Review Advantage (R-COMP-02)
 *
 * Checks data freshness: flags STALE competitor benchmarks.
 * Strict boundary: Load != Detect != Diagnose != Recommend
 * Pure diagnosis only. NO action recommendations (e.g. no "lower price by $2").
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

export class CompetitorPressurePattern implements IDiagnosisPattern {
  public readonly patternId = 'COMPETITOR_PRESSURE_PATTERN';
  public readonly targetRuleIds = ['R-COMP-01', 'R-COMP-02'] as const;
  public readonly targetSignalCodes = ['COMPETITOR_PRICE_DROP', 'COMPETITOR_ADVANTAGE'] as const;

  public canDiagnose(context: Sku360BusinessContext, signals: BusinessSignal[]): boolean {
    return signals.some(
      (s) => s.domain === 'COMPETITOR' || this.targetSignalCodes.includes(s.code as any)
    );
  }

  public diagnose(
    context: Sku360BusinessContext,
    signals: BusinessSignal[],
    _options?: DiagnosisExecutionOptions
  ): DiagnosisResult | null {
    const compCtx = context.competitors;
    const targetSignals = signals.filter(
      (s) => s.domain === 'COMPETITOR' || this.targetSignalCodes.includes(s.code as any)
    );
    const targetSignalIds = targetSignals.map((s) => s.signalId);

    // 1. Data Availability Check
    if (!compCtx || compCtx.availability === 'UNAVAILABLE') {
      const emptyDriver: DiagnosisDriver = {
        domain: 'COMPETITOR',
        metric: 'currentPrice',
        direction: 'DOWN',
        causalStrength: 'UNKNOWN',
        description: '竞品数据不可用。',
      };

      return {
        diagnosisId: `DIAG-COMP-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: '竞品异常？遥测数据缺失',
        summary: '竞品价格与评论遥测标记为 UNAVAILABLE，无法追踪市场价格动态。',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['COMPETITOR'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['竞品基准遥测为 UNAVAILABLE。'],
        calculatedAt: new Date().toISOString(),
      };
    }

    const items = compCtx.items ?? [];
    const primaryComp = compCtx.primaryCompetitor || items[0];

    if (!primaryComp) {
      return null;
    }

    const ourPrice = context.sales?.averageSellingPrice?.current ?? 29.99;
    const compPrice = primaryComp.currentPrice;
    const compBasePrice = primaryComp.baselinePrice ?? compPrice;
    const priceDelta = roundMoney(primaryComp.priceDelta ?? compPrice - compBasePrice);
    const priceDeltaPct = primaryComp.priceDeltaPct ?? (compBasePrice > 0 ? (compPrice - compBasePrice) / compBasePrice : 0);

    const compRating = primaryComp.currentRating ?? 4.5;
    const compBaseRating = primaryComp.baselineRating ?? compRating;
    const ratingDelta = (primaryComp.ratingDelta ?? compRating - compBaseRating);

    const isPriceDrop = priceDeltaPct <= -0.10;
    const isRatingAdvantage = ratingDelta >= 0.30 || compRating >= 4.7;

    let rootCauseCode = 'COMPETITOR_PRICE_UNDERCUT';
    let title: string;
    let summary: string;
    let primaryDriver: DiagnosisDriver;
    const secondaryDrivers: DiagnosisDriver[] = [];
    const affectedDomains: SignalDomain[] = ['COMPETITOR'];

    // Check freshness
    const isStale = context.freshness?.competitors?.status === 'STALE';
    const causalStrength = isStale ? 'INDICATIVE' : 'STRONG';

    if (isPriceDrop) {
      rootCauseCode = 'COMPETITOR_PRICE_UNDERCUT';
      const dropPctStr = `${(Math.abs(priceDeltaPct) * 100).toFixed(1)}%`;
      title = `竞品降价压制：${primaryComp.asin || primaryComp.competitorId} 降价 ${dropPctStr}`;

      primaryDriver = {
        domain: 'COMPETITOR',
        metric: 'competitorPrice',
        impactAmount: priceDelta,
        contributionRatio: 0.70,
        direction: 'DOWN',
        causalStrength,
        relatedSignalIds: targetSignals.filter((s) => s.code === 'COMPETITOR_PRICE_DROP').map((s) => s.signalId),
        description: `主要竞品（${primaryComp.asin || primaryComp.competitorId}）将价格从 $${compBasePrice.toFixed(2)} 降至 $${compPrice.toFixed(2)}（-${dropPctStr}），相对我方 $${ourPrice.toFixed(2)} 的均价形成 $${(ourPrice - compPrice).toFixed(2)} 的价格劣势。`,
      };

      const ordersDeltaPct = context.sales?.ordersCount?.deltaPct ?? 0;
      if (ordersDeltaPct < -0.05) {
        affectedDomains.push('SALES');
        secondaryDrivers.push({
          domain: 'SALES',
          metric: 'ordersCount',
          impactAmount: 0,
          contributionRatio: 0.30,
          direction: 'DOWN',
          causalStrength: 'INDICATIVE',
          description: `竞品降价同期，我方 listing 订单下降 ${(Math.abs(ordersDeltaPct) * 100).toFixed(1)}%。`,
        });
      }

      summary = `主要竞品降价形成价格逆风。竞品当前售价 $${compPrice.toFixed(2)}，我方为 $${ourPrice.toFixed(2)}。`;
    } else {
      rootCauseCode = 'COMPETITOR_RATING_ADVANTAGE';
      title = `竞品质量优势：${primaryComp.asin || primaryComp.competitorId} 评分 ${compRating.toFixed(1)}★`;

      primaryDriver = {
        domain: 'COMPETITOR',
        metric: 'competitorRating',
        impactAmount: 0,
        contributionRatio: 1.0,
        direction: 'UP',
        causalStrength: 'INDICATIVE',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'COMPETITOR_ADVANTAGE').map((s) => s.signalId),
        description: `竞品保持 ${compRating.toFixed(1)}★ 评分优势（${primaryComp.reviewCount ?? 0} 条评论）。`,
      };

      summary = `竞品评分优势正在自然搜索排位中形成社会认同优势。`;
    }

    // 2. Evidence Gate & Unknowns
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (isStale) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('竞品基准数据已过期（STALE，> 48 小时）；价格与库存状态可能已变化。');
    }
    if (compCtx.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('竞品遥测为 PARTIAL；仅捕获主要竞品。');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-COMP-DIAG-${context.identity.skuId}`,
        category: 'EXTERNAL_DATA',
        title: '竞品基准遥测',
        content: `竞品 ${primaryComp.asin || primaryComp.competitorId}：价格 $${compPrice.toFixed(2)}（变动：$${priceDelta.toFixed(2)}，${(priceDeltaPct * 100).toFixed(1)}%），评分：${compRating.toFixed(1)}★。我方均价：$${ourPrice.toFixed(2)}。`,
        source: 'CompetitorTracker',
        sourceId: primaryComp.asin || primaryComp.competitorId,
        capturedAt: new Date().toISOString(),
        metadata: {
          asin: primaryComp.asin,
          competitorPrice: compPrice,
          baselinePrice: compBasePrice,
          priceDelta,
          priceDeltaPct,
          ourPrice,
          isStale,
        },
      },
    ];

    return {
      diagnosisId: `DIAG-COMP-${context.identity.skuId}-${context.currentPeriod.to.slice(0, 10).replace(/-/g, '')}`,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      title,
      summary,
      primaryDriver,
      secondaryDrivers,
      confidence: gateStatus === 'SUPPORTED' ? 0.90 : 0.68,
      evidence,
      affectedDomains,
      affectedSkus: [context.identity.skuId],
      gateStatus,
      targetSignalIds,
      rootCauseCode,
      unknowns: unknowns.length > 0 ? unknowns : undefined,
      calculatedAt: new Date().toISOString(),
    };
  }
}
