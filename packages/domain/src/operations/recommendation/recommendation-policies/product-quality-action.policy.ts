/**
 * Product Quality & Customer Experience Action Policy (Epic 3 Phase 5)
 *
 * Recommends:
 * - INVESTIGATE_PRODUCT_FIT: Physical batch quality & sizing inspection
 * - REVIEW_LISTING_SPECIFICATION: Bullet points & visual expectation alignment
 * - REVIEW_RETURN_REASON: Detailed return categorization
 *
 * Strict rule: If evidence cannot conclusively prove whether the defect is
 * physical design flaw vs listing expectation mismatch, MUST suggest
 * INVESTIGATE_PRODUCT_FIT first.
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

export class ProductQualityActionPolicy implements IActionRecommendationPolicy {
  public readonly policyId = 'PRODUCT_QUALITY_ACTION_POLICY';
  public readonly targetDomains = ['RETURNS', 'REVIEWS'] as const;

  public canRecommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): boolean {
    const hasQualityDiag = diagnoses.some(
      (d) =>
        d.affectedDomains.includes('RETURNS') ||
        d.affectedDomains.includes('REVIEWS') ||
        d.rootCauseCode === 'PRODUCT_QUALITY_DEFECT_CONFIRMED'
    );
    const hasQualitySignal = signals.some(
      (s) => s.code === 'RETURN_RATE_SPIKE' || s.code === 'RATING_DETERIORATION'
    );
    return hasQualityDiag || hasQualitySignal;
  }

  public recommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[],
    _options?: ActionRecommendationOptions
  ): RecommendedAction[] {
    const actions: RecommendedAction[] = [];
    const qualityDiagnoses = diagnoses.filter(
      (d) =>
        d.affectedDomains.includes('RETURNS') ||
        d.affectedDomains.includes('REVIEWS') ||
        d.rootCauseCode === 'PRODUCT_QUALITY_DEFECT_CONFIRMED'
    );
    const qualitySignals = signals.filter(
      (s) => s.code === 'RETURN_RATE_SPIKE' || s.code === 'RATING_DETERIORATION'
    );

    const sourceDiagIds = qualityDiagnoses.map((d) => d.diagnosisId);
    const sourceSigIds = qualitySignals.map((s) => s.signalId);

    const returnsCtx = context.returns;
    const reviewsCtx = context.reviews;

    const returnRate = returnsCtx?.returnRate?.current ?? 0;
    const rating = reviewsCtx?.overallRating ?? 5.0;
    const topPainPoints = reviewsCtx?.topPainPoints ?? [];
    const primaryPainPoint = topPainPoints[0]?.topicName ?? 'Dimension / compatibility issue';

    const evidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EV-ACT-QUAL-${context.identity.skuId}`,
        category: 'CALCULATED_METRIC',
        title: '产品质量与 VOC 遥测',
        content: `退货率：${(returnRate * 100).toFixed(1)}%，评分：${rating.toFixed(1)}★，首要痛点："${primaryPainPoint}"。`,
        source: 'ProductQualityActionPolicy',
        sourceId: 'analyzeQuality',
        capturedAt: new Date().toISOString(),
      },
    ];

    // 1. Primary Recommendation: INVESTIGATE_PRODUCT_FIT (Advisory / Low Risk)
    const fitActionId = ActionDeduplicator.generateActionId(
      context.identity.workspaceId,
      context.identity.skuId,
      'INVESTIGATE_PRODUCT_FIT',
      'voc'
    );

    actions.push({
      actionId: fitActionId,
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      sourceSignalIds: sourceSigIds,
      sourceDiagnosisIds: sourceDiagIds,
      category: 'INVESTIGATION',
      actionType: 'INVESTIGATE_PRODUCT_FIT',
      priority: 'P2',
      riskLevel: 'LOW',
      executionMode: 'ADVISORY',
      status: 'PROPOSED',
      title: `排查产品实物适配与缺陷集中点："${primaryPainPoint}"`,
      reason: `退货率飙升至 ${(returnRate * 100).toFixed(1)}%，买家评论恶化（${rating.toFixed(1)}★）。结构化 VOC 显示买家痛点集中于 "${primaryPainPoint}"。`,
      evidence,
      expectedImpact: `确认根因缺陷来自生产批次质量差异还是买家预期不匹配。`,
      impactType: 'QUALITATIVE',
      recommendationGateStatus: 'READY',
      targetEntity: 'ProductBatch',
      payload: {
        primaryPainPoint,
        returnRate,
        rating,
      },
      createdAt: new Date().toISOString(),
    });

    // 2. Secondary Recommendation: REVIEW_LISTING_SPECIFICATION (Approval Required / Medium Risk)
    // If pain point mentions dimensional compatibility (hole size, slot, dimension, etc.)
    const isDimensionOrFitIssue = topPainPoints.some((p) =>
      /hole|size|fit|slot|dimension|diameter|small|tight/i.test(p.topicName)
    );

    if (isDimensionOrFitIssue) {
      const listingActionId = ActionDeduplicator.generateActionId(
        context.identity.workspaceId,
        context.identity.skuId,
        'REVIEW_LISTING_SPECIFICATION',
        'dimension'
      );

      actions.push({
        actionId: listingActionId,
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        sourceSignalIds: sourceSigIds,
        sourceDiagnosisIds: sourceDiagIds,
        category: 'LISTING',
        actionType: 'REVIEW_LISTING_SPECIFICATION',
        priority: 'P2',
        riskLevel: 'MEDIUM',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        title: `审查 Listing 规格要点与尺寸示意图`,
        reason: `买家反馈突出 "${primaryPainPoint}"。请核查 listing 要点与尺寸图，确保明确标注产品的实际适配兼容性。`,
        evidence,
        expectedImpact: `在购前明确兼容机型，减少预期不符导致的退货。`,
        impactType: 'QUALITATIVE',
        recommendationGateStatus: 'READY',
        targetEntity: 'ListingDraft',
        payload: {
          targetDimension: primaryPainPoint,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return actions;
  }
}
