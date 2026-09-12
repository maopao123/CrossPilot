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
        title: 'Product Quality & VOC Telemetry',
        content: `Return Rate: ${(returnRate * 100).toFixed(1)}%, Rating: ${rating.toFixed(1)}★, Top Pain Point: "${primaryPainPoint}".`,
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
      title: `Investigate Product Physical Fit & Defect Concentration: "${primaryPainPoint}"`,
      reason: `Return rate surged to ${(returnRate * 100).toFixed(1)}% and buyer reviews deteriorated (${rating.toFixed(1)}★). Structured VOC identifies customer friction around "${primaryPainPoint}".`,
      evidence,
      expectedImpact: `Identifies whether root defect stems from physical manufacturing batch variance or buyer expectation mismatch.`,
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
        title: `Review Listing Specification Bullets and Sizing Diagram`,
        reason: `Customer feedback highlights "${primaryPainPoint}". Audit listing bullet points and dimensional graphics to ensure exact product compatibility is explicitly stated.`,
        evidence,
        expectedImpact: `Reduces expectation mismatch returns by clarifying compatible device models before purchase.`,
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
