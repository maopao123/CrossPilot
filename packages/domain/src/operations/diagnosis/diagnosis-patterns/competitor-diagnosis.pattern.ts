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
        description: 'Competitor telemetry is unavailable.',
      };

      return {
        diagnosisId: `DIAG-COMP-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: 'Competitor Anomaly ? Missing Telemetry',
        summary: 'Competitor price and review telemetry is marked UNAVAILABLE. Market price movements cannot be tracked.',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['COMPETITOR'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['Competitor benchmark telemetry is UNAVAILABLE.'],
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
      title = `Competitor Price Undercut: ${primaryComp.asin || primaryComp.competitorId} Cut Price ${dropPctStr}`;

      primaryDriver = {
        domain: 'COMPETITOR',
        metric: 'competitorPrice',
        impactAmount: priceDelta,
        contributionRatio: 0.70,
        direction: 'DOWN',
        causalStrength,
        relatedSignalIds: targetSignals.filter((s) => s.code === 'COMPETITOR_PRICE_DROP').map((s) => s.signalId),
        description: `Primary competitor (${primaryComp.asin || primaryComp.competitorId}) lowered price from $${compBasePrice.toFixed(2)} to $${compPrice.toFixed(2)} (-${dropPctStr}), creating a $${(ourPrice - compPrice).toFixed(2)} price disadvantage against our $${ourPrice.toFixed(2)} ASP.`,
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
          description: `Our listing orders dropped ${(Math.abs(ordersDeltaPct) * 100).toFixed(1)}% concurrently with competitor price reduction.`,
        });
      }

      summary = `Primary competitor price cut has introduced pricing headwind. Competitor currently sells at $${compPrice.toFixed(2)} vs our $${ourPrice.toFixed(2)}.`;
    } else {
      rootCauseCode = 'COMPETITOR_RATING_ADVANTAGE';
      title = `Competitor Quality Advantage: ${primaryComp.asin || primaryComp.competitorId} at ${compRating.toFixed(1)}?`;

      primaryDriver = {
        domain: 'COMPETITOR',
        metric: 'competitorRating',
        impactAmount: 0,
        contributionRatio: 1.0,
        direction: 'UP',
        causalStrength: 'INDICATIVE',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'COMPETITOR_ADVANTAGE').map((s) => s.signalId),
        description: `Competitor maintains a ${compRating.toFixed(1)}? customer rating advantage (${primaryComp.reviewCount ?? 0} reviews).`,
      };

      summary = `Competitor rating superiority is creating social proof advantage in organic search placement.`;
    }

    // 2. Evidence Gate & Unknowns
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (isStale) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Competitor benchmark data is STALE (> 48h old); price and inventory state may have shifted.');
    }
    if (compCtx.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Competitor telemetry is PARTIAL; only primary competitor was captured.');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-COMP-DIAG-${context.identity.skuId}`,
        category: 'EXTERNAL_DATA',
        title: 'Competitor Benchmark Telemetry',
        content: `Competitor ${primaryComp.asin || primaryComp.competitorId}: Price $${compPrice.toFixed(2)} (delta: $${priceDelta.toFixed(2)}, ${(priceDeltaPct * 100).toFixed(1)}%), Rating: ${compRating.toFixed(1)}?. Our ASP: $${ourPrice.toFixed(2)}.`,
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
