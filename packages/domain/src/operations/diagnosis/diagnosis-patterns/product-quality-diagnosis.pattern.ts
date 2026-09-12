/**
 * Product Quality Diagnosis Pattern (Epic 3 Phase 4)
 *
 * Implements cross-domain correlation across Returns (R-RET-01), Reviews (R-REV-01),
 * and VOC complaint clusters to diagnose physical defects and listing specification mismatches.
 *
 * Strict boundary: Load != Detect != Diagnose != Recommend
 * Pure diagnosis only. NO action recommendations (e.g. no "update listing dimensions").
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

export class ProductQualityIssuePattern implements IDiagnosisPattern {
  public readonly patternId = 'PRODUCT_QUALITY_PATTERN';
  public readonly targetRuleIds = ['R-RET-01', 'R-REV-01'] as const;
  public readonly targetSignalCodes = ['RETURN_RATE_SPIKE', 'RATING_DETERIORATION'] as const;

  public canDiagnose(context: Sku360BusinessContext, signals: BusinessSignal[]): boolean {
    return signals.some(
      (s) =>
        s.domain === 'RETURNS' ||
        s.domain === 'REVIEWS' ||
        this.targetSignalCodes.includes(s.code as any)
    );
  }

  public diagnose(
    context: Sku360BusinessContext,
    signals: BusinessSignal[],
    _options?: DiagnosisExecutionOptions
  ): DiagnosisResult | null {
    const ret = context.returns;
    const rev = context.reviews;

    const targetSignals = signals.filter(
      (s) =>
        s.domain === 'RETURNS' ||
        s.domain === 'REVIEWS' ||
        this.targetSignalCodes.includes(s.code as any)
    );
    const targetSignalIds = targetSignals.map((s) => s.signalId);

    // 1. Data Availability Check
    const retAvailable = ret && ret.availability !== 'UNAVAILABLE';
    const revAvailable = rev && rev.availability !== 'UNAVAILABLE';

    if (!retAvailable && !revAvailable) {
      const emptyDriver: DiagnosisDriver = {
        domain: 'RETURNS',
        metric: 'returnRate',
        direction: 'DOWN',
        causalStrength: 'UNKNOWN',
        description: 'Returns and reviews telemetry are unavailable.',
      };

      return {
        diagnosisId: `DIAG-QUALITY-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: 'Product Quality Anomaly ? Missing Telemetry',
        summary: 'Neither return telemetry nor review VOC data is available to evaluate quality defects.',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['RETURNS', 'REVIEWS'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['Return records and review text are both UNAVAILABLE.'],
        calculatedAt: new Date().toISOString(),
      };
    }

    const curReturnRate = ret?.returnRate?.current ?? 0;
    const baseReturnRate = ret?.returnRate?.baseline ?? 0;
    const returnDeltaPct = ret?.returnRate?.deltaPct ?? 0;
    const returnCostDelta = ret?.returnCost?.delta ?? 0;
    const topReason = ret?.topReturnReasons?.[0]?.reason ?? 'Defective / Not as described';
    const topReasonPct = ret?.topReturnReasons?.[0]?.percentage ?? 0.40;

    const overallRating = rev?.overallRating ?? 5.0;
    const negRatio = rev?.negativeReviewRatio ?? 0;
    const topPainPoint = rev?.topPainPoints?.[0]?.topicName ?? 'Product sizing or defect';
    const topPainPointPct = rev?.topPainPoints?.[0]?.percentage ?? 0.35;

    const isReturnSpike = curReturnRate >= 0.05 && (returnDeltaPct >= 0.40 || curReturnRate >= baseReturnRate * 1.4);
    const isRatingDrop = overallRating < 4.3 || negRatio >= 0.20;

    let rootCauseCode: string;
    let title: string;
    let summary: string;
    let primaryDriver: DiagnosisDriver;
    const secondaryDrivers: DiagnosisDriver[] = [];
    const affectedDomains: SignalDomain[] = [];

    // 2. Cross-Domain Multi-Signal Synthesis
    if (isReturnSpike && isRatingDrop) {
      // High Returns + Low Rating + VOC Cluster = Definite Physical/Specification Defect
      rootCauseCode = 'PRODUCT_QUALITY_PHYSICAL_DEFECT';
      affectedDomains.push('RETURNS', 'REVIEWS');
      title = `Product Quality Defect: Return Spike to ${(curReturnRate * 100).toFixed(1)}% & Rating Decline to ${overallRating.toFixed(1)}?`;

      primaryDriver = {
        domain: 'RETURNS',
        metric: 'returnRate',
        impactAmount: -roundMoney(returnCostDelta),
        contributionRatio: 0.60,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RETURN_RATE_SPIKE').map((s) => s.signalId),
        description: `Return rate surged ${(returnDeltaPct * 100).toFixed(1)}% from ${(baseReturnRate * 100).toFixed(1)}% to ${(curReturnRate * 100).toFixed(1)}% (+$${returnCostDelta.toFixed(2)} refund cost). Top return reason: "${topReason}" (${(topReasonPct * 100).toFixed(0)}% of returns).`,
      };

      secondaryDrivers.push({
        domain: 'REVIEWS',
        metric: 'negativeReviewRatio',
        impactAmount: 0,
        contributionRatio: 0.40,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RATING_DETERIORATION').map((s) => s.signalId),
        description: `Customer rating declined to ${overallRating.toFixed(1)}? with ${(negRatio * 100).toFixed(1)}% negative reviews. Top customer complaint cluster: "${topPainPoint}" (${(topPainPointPct * 100).toFixed(0)}% of complaints).`,
      });

      summary = `Simultaneous return rate surge and customer review deterioration corroborate a physical product defect or dimensional mismatch. Customers frequently cite "${topPainPoint}" in reviews and "${topReason}" upon return.`;
    } else if (isReturnSpike) {
      // Returns only
      rootCauseCode = 'PRODUCT_RETURN_RATE_ANOMALY';
      affectedDomains.push('RETURNS');
      title = `Return Rate Spike to ${(curReturnRate * 100).toFixed(1)}%`;

      primaryDriver = {
        domain: 'RETURNS',
        metric: 'returnRate',
        impactAmount: -roundMoney(returnCostDelta),
        contributionRatio: 1.0,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RETURN_RATE_SPIKE').map((s) => s.signalId),
        description: `Return rate surged to ${(curReturnRate * 100).toFixed(1)}% over baseline (${(baseReturnRate * 100).toFixed(1)}%), generating $${returnCostDelta.toFixed(2)} in refund losses. Primary reason: "${topReason}".`,
      };

      if (revAvailable) {
        secondaryDrivers.push({
          domain: 'REVIEWS',
          metric: 'overallRating',
          direction: 'STABLE',
          causalStrength: 'INDICATIVE',
          description: `Current customer star rating remains at ${overallRating.toFixed(1)}?; return spike precedes full rating impact.`,
        });
      }

      summary = `Return rate spiked significantly above baseline, driven primarily by customer return reason "${topReason}".`;
    } else {
      // Reviews only
      rootCauseCode = 'PRODUCT_REVIEW_RATING_DETERIORATION';
      affectedDomains.push('REVIEWS');
      title = `Customer Rating Deterioration to ${overallRating.toFixed(1)}?`;

      primaryDriver = {
        domain: 'REVIEWS',
        metric: 'overallRating',
        impactAmount: 0,
        contributionRatio: 1.0,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RATING_DETERIORATION').map((s) => s.signalId),
        description: `Star rating deteriorated to ${overallRating.toFixed(1)}? with ${(negRatio * 100).toFixed(1)}% recent negative reviews. Top complaint: "${topPainPoint}".`,
      };

      if (retAvailable) {
        secondaryDrivers.push({
          domain: 'RETURNS',
          metric: 'returnRate',
          direction: 'STABLE',
          causalStrength: 'INDICATIVE',
          description: `Return rate currently at ${(curReturnRate * 100).toFixed(1)}%.`,
        });
      }

      summary = `Customer satisfaction deteriorated with negative feedback centered on "${topPainPoint}".`;
    }

    // 3. Evidence Gate & Unknowns
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (ret?.availability === 'PARTIAL' || rev?.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Returns or reviews data is PARTIAL; some categories were sampled.');
    }
    if (!ret?.topReturnReasons || ret.topReturnReasons.length === 0) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Granular return reason breakdown missing; return causes estimated.');
    }
    if (!rev?.topPainPoints || rev.topPainPoints.length === 0) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('Structured VOC text clustering missing; complaint topics estimated.');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-QUAL-DIAG-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: 'Return Rate & VOC Sentiment Correlation',
        content: `Return rate: ${(curReturnRate * 100).toFixed(1)}% (cost delta: +$${returnCostDelta.toFixed(2)}). Rating: ${overallRating.toFixed(1)}?, Negative review ratio: ${(negRatio * 100).toFixed(1)}%. Top return reason: "${topReason}". Top VOC topic: "${topPainPoint}".`,
        source: 'ReviewProductHealthTool',
        sourceId: 'analyzeProductHealth',
        capturedAt: new Date().toISOString(),
        metadata: {
          curReturnRate,
          baseReturnRate,
          overallRating,
          negRatio,
          topReason,
          topPainPoint,
        },
      },
    ];

    return {
      diagnosisId: `DIAG-QUAL-${context.identity.skuId}-${context.currentPeriod.to.slice(0, 10).replace(/-/g, '')}`,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      title,
      summary,
      primaryDriver,
      secondaryDrivers,
      confidence: gateStatus === 'SUPPORTED' ? 0.93 : 0.70,
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
