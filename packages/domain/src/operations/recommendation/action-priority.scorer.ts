/**
 * Action Priority Scorer (Epic 3 Phase 5)
 *
 * Deterministically computes P1 / P2 / P3 priority based on:
 * - Severity of operational condition
 * - Financial impact (measured vs estimated)
 * - Urgency / stockout runout horizon
 * - Causal strength & Evidence Gate status
 * - Data freshness
 *
 * Strict rule: Pure code determination. NO LLM guessing of priorities.
 */

import {
  RecommendedAction,
  Sku360BusinessContext,
  DiagnosisResult,
  BusinessSignal,
  ActionPriority,
} from '@crosspilot/shared';
import { PriorityScoreResult } from './recommendation.types.js';

export class ActionPriorityScorer {
  /**
   * Deterministically calculates priority score and assigns P1 / P2 / P3.
   */
  public static score(
    action: Partial<RecommendedAction>,
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): PriorityScoreResult {
    let baseScore = 40;
    let impactBonus = 0;
    let urgencyBonus = 0;
    let causalModifier = 0;
    let evidenceModifier = 0;
    let freshnessPenalty = 0;

    const actionType = action.actionType;
    const relatedDiagnoses = diagnoses.filter(
      (d) => action.sourceDiagnosisIds?.includes(d.diagnosisId)
    );
    const relatedSignals = signals.filter(
      (s) => action.sourceSignalIds?.includes(s.signalId)
    );

    // 1. Base Score from Action Type & Operational Severity
    switch (actionType) {
      case 'INVESTIGATE_STOCKOUT':
      case 'PREPARE_REPLENISHMENT': {
        const fulfillable = context.inventory?.fulfillableQuantity ?? 1;
        const daysCover = context.inventory?.daysCover ?? 999;
        const leadTime = context.inventory?.leadTimeDays ?? 14;

        if (fulfillable === 0) {
          // Active out of stock is highest priority
          baseScore = 85;
          urgencyBonus += 15;
        } else if (daysCover <= 7) {
          baseScore = 80;
          urgencyBonus += 10;
        } else if (daysCover <= leadTime) {
          baseScore = 70;
          urgencyBonus += 5;
        } else {
          baseScore = 50;
        }
        break;
      }

      case 'REVIEW_REORDER_PLAN': {
        const daysCover = context.inventory?.daysCover ?? 999;
        const leadTime = context.inventory?.leadTimeDays ?? 14;
        if (daysCover <= leadTime) {
          baseScore = 70;
          urgencyBonus += 5;
        } else {
          baseScore = 45;
        }
        break;
      }

      case 'REVIEW_NEGATIVE_KEYWORD':
      case 'INVESTIGATE_SEARCH_TERM': {
        const measuredSpend = Math.abs(action.impactAmount ?? 0);
        if (measuredSpend >= 100) {
          baseScore = 75;
        } else if (measuredSpend >= 40) {
          baseScore = 65;
        } else {
          baseScore = 50;
        }
        break;
      }

      case 'REVIEW_AD_SPEND':
      case 'REVIEW_BID': {
        const hasSevereProfitDrop = relatedSignals.some((s) => s.code === 'PROFIT_DROP' && s.severity === 'CRITICAL');
        baseScore = hasSevereProfitDrop ? 75 : 60;
        break;
      }

      case 'INVESTIGATE_PRODUCT_FIT':
      case 'REVIEW_RETURN_REASON':
      case 'REVIEW_LISTING_SPECIFICATION': {
        const returnSpike = relatedSignals.some((s) => s.code === 'RETURN_RATE_SPIKE');
        const ratingDrop = relatedSignals.some((s) => s.code === 'RATING_DETERIORATION');
        baseScore = returnSpike && ratingDrop ? 65 : 55;
        break;
      }

      case 'REVIEW_PRICE_COMPETITIVENESS':
      case 'REVIEW_COUPON_STRATEGY': {
        const compFreshness = context.freshness?.competitors?.status ?? 'FRESH';
        if (compFreshness === 'STALE') {
          baseScore = 35;
        } else {
          baseScore = 55;
        }
        break;
      }

      case 'REFRESH_COMPETITOR_DATA': {
        baseScore = 30; // Data maintenance is P3
        break;
      }

      case 'INVESTIGATE_PROFIT_DRIVER': {
        baseScore = 60;
        break;
      }

      case 'NO_ACTION_REQUIRED':
      default:
        baseScore = 20;
        break;
    }

    // 2. Financial Impact Bonus
    const impactAmount = Math.abs(action.impactAmount ?? 0);
    if (action.impactType === 'MEASURED') {
      if (impactAmount >= 500) {
        impactBonus += 15;
      } else if (impactAmount >= 100) {
        impactBonus += 10;
      } else if (impactAmount >= 20) {
        impactBonus += 5;
      }
    } else if (action.impactType === 'ESTIMATED') {
      if (impactAmount >= 300) {
        impactBonus += 8;
      } else if (impactAmount >= 100) {
        impactBonus += 5;
      }
    }

    // 3. Causal Strength Modifier
    const primaryCausal = relatedDiagnoses[0]?.primaryDriver?.causalStrength;
    if (primaryCausal === 'PROVEN') {
      causalModifier += 5;
    } else if (primaryCausal === 'STRONG') {
      causalModifier += 3;
    } else if (primaryCausal === 'INDICATIVE') {
      causalModifier -= 5;
    } else if (primaryCausal === 'UNKNOWN') {
      causalModifier -= 15;
    }

    // 4. Evidence Gate Modifier
    const gateStatus = relatedDiagnoses[0]?.gateStatus;
    if (gateStatus === 'SUPPORTED') {
      evidenceModifier += 5;
    } else if (gateStatus === 'PARTIALLY_SUPPORTED') {
      evidenceModifier -= 10;
    } else if (gateStatus === 'INSUFFICIENT') {
      evidenceModifier -= 25;
    }

    // 5. Data Freshness Penalty
    if (action.category === 'PRICING' && context.freshness?.competitors?.status === 'STALE') {
      freshnessPenalty = 20;
    }

    // 6. Aggregate Total Score
    const totalScore = Math.max(
      0,
      Math.min(
        100,
        baseScore + impactBonus + urgencyBonus + causalModifier + evidenceModifier - freshnessPenalty
      )
    );

    // 7. Deterministic Priority Mapping
    let priority: ActionPriority = 'P3';
    if (totalScore >= 75) {
      priority = 'P1';
    } else if (totalScore >= 50) {
      priority = 'P2';
    } else {
      priority = 'P3';
    }

    const reason = `Score ${totalScore} (Base: ${baseScore}, Impact: +${impactBonus}, Urgency: +${urgencyBonus}, Causal: ${causalModifier >= 0 ? '+' : ''}${causalModifier}, Evidence: ${evidenceModifier >= 0 ? '+' : ''}${evidenceModifier}, FreshnessPenalty: -${freshnessPenalty}) -> Priority ${priority}`;

    return {
      priority,
      score: totalScore,
      breakdown: {
        baseScore,
        impactBonus,
        urgencyBonus,
        causalModifier,
        evidenceModifier,
        freshnessPenalty,
      },
      reason,
    };
  }
}
