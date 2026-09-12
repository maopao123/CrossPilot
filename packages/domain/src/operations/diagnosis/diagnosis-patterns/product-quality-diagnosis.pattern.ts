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
        description: '退货与评论数据不可用。',
      };

      return {
        diagnosisId: `DIAG-QUALITY-UNAVAILABLE-${context.identity.skuId}`,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        title: '产品质量异常？遥测数据缺失',
        summary: '退货遥测与评论 VOC 数据均不可用，无法评估质量缺陷。',
        primaryDriver: emptyDriver,
        secondaryDrivers: [],
        confidence: 0.2,
        evidence: [],
        affectedDomains: ['RETURNS', 'REVIEWS'],
        affectedSkus: [context.identity.skuId],
        gateStatus: 'INSUFFICIENT',
        targetSignalIds,
        rootCauseCode: 'ROOT_CAUSE_UNCONFIRMED',
        unknowns: ['退货记录与评论文本均为 UNAVAILABLE。'],
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
      title = `产品质量缺陷：退货率飙升至 ${(curReturnRate * 100).toFixed(1)}% 且评分降至 ${overallRating.toFixed(1)}★`;

      primaryDriver = {
        domain: 'RETURNS',
        metric: 'returnRate',
        impactAmount: -roundMoney(returnCostDelta),
        contributionRatio: 0.60,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RETURN_RATE_SPIKE').map((s) => s.signalId),
        description: `退货率从 ${(baseReturnRate * 100).toFixed(1)}% 飙升 ${(returnDeltaPct * 100).toFixed(1)}% 至 ${(curReturnRate * 100).toFixed(1)}%（退款成本 +$${returnCostDelta.toFixed(2)}）。首要退货原因："${topReason}"（占退货 ${(topReasonPct * 100).toFixed(0)}%）。`,
      };

      secondaryDrivers.push({
        domain: 'REVIEWS',
        metric: 'negativeReviewRatio',
        impactAmount: 0,
        contributionRatio: 0.40,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RATING_DETERIORATION').map((s) => s.signalId),
        description: `买家评分降至 ${overallRating.toFixed(1)}★，差评占比 ${(negRatio * 100).toFixed(1)}%。首要投诉聚类："${topPainPoint}"（占投诉 ${(topPainPointPct * 100).toFixed(0)}%）。`,
      });

      summary = `退货率飙升与评论恶化同时出现，相互印证实物产品缺陷或尺寸不匹配。买家常在评论中提及 "${topPainPoint}"、退货时选择 "${topReason}"。`;
    } else if (isReturnSpike) {
      // Returns only
      rootCauseCode = 'PRODUCT_RETURN_RATE_ANOMALY';
      affectedDomains.push('RETURNS');
      title = `退货率飙升至 ${(curReturnRate * 100).toFixed(1)}%`;

      primaryDriver = {
        domain: 'RETURNS',
        metric: 'returnRate',
        impactAmount: -roundMoney(returnCostDelta),
        contributionRatio: 1.0,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RETURN_RATE_SPIKE').map((s) => s.signalId),
        description: `退货率较基准（${(baseReturnRate * 100).toFixed(1)}%）飙升至 ${(curReturnRate * 100).toFixed(1)}%，产生 $${returnCostDelta.toFixed(2)} 退款损失。首要原因："${topReason}"。`,
      };

      if (revAvailable) {
        secondaryDrivers.push({
          domain: 'REVIEWS',
          metric: 'overallRating',
          direction: 'STABLE',
          causalStrength: 'INDICATIVE',
          description: `当前买家评分维持在 ${overallRating.toFixed(1)}★；退货飙升的全面评分影响尚未显现。`,
        });
      }

      summary = `退货率显著高于基准，主要由买家退货原因 "${topReason}" 驱动。`;
    } else {
      // Reviews only
      rootCauseCode = 'PRODUCT_REVIEW_RATING_DETERIORATION';
      affectedDomains.push('REVIEWS');
      title = `买家评分恶化至 ${overallRating.toFixed(1)}★`;

      primaryDriver = {
        domain: 'REVIEWS',
        metric: 'overallRating',
        impactAmount: 0,
        contributionRatio: 1.0,
        direction: 'DOWN',
        causalStrength: 'STRONG',
        relatedSignalIds: targetSignals.filter((s) => s.code === 'RATING_DETERIORATION').map((s) => s.signalId),
        description: `评分恶化至 ${overallRating.toFixed(1)}★，近期差评占比 ${(negRatio * 100).toFixed(1)}%。首要投诉："${topPainPoint}"。`,
      };

      if (retAvailable) {
        secondaryDrivers.push({
          domain: 'RETURNS',
          metric: 'returnRate',
          direction: 'STABLE',
          causalStrength: 'INDICATIVE',
          description: `当前退货率为 ${(curReturnRate * 100).toFixed(1)}%。`,
        });
      }

      summary = `买家满意度恶化，负面反馈集中于 "${topPainPoint}"。`;
    }

    // 3. Evidence Gate & Unknowns
    let gateStatus: DiagnosisEvidenceGateStatus = 'SUPPORTED';
    const unknowns: string[] = [];

    if (ret?.availability === 'PARTIAL' || rev?.availability === 'PARTIAL') {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('退货或评论数据为 PARTIAL；部分类别为抽样数据。');
    }
    if (!ret?.topReturnReasons || ret.topReturnReasons.length === 0) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('缺少退货原因明细；退货成分为估算。');
    }
    if (!rev?.topPainPoints || rev.topPainPoints.length === 0) {
      gateStatus = 'PARTIALLY_SUPPORTED';
      unknowns.push('缺少结构化 VOC 文本聚类；投诉主题为估算。');
    }

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-QUAL-DIAG-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: '退货率与 VOC 情绪相关性',
        content: `退货率：${(curReturnRate * 100).toFixed(1)}%（成本变动：+$${returnCostDelta.toFixed(2)}）。评分：${overallRating.toFixed(1)}★，差评占比：${(negRatio * 100).toFixed(1)}%。首要退货原因："${topReason}"。首要 VOC 主题："${topPainPoint}"。`,
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
