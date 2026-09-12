/**
 * CrossPilot V9 Action Recommendation Service (Epic 3 Phase 5)
 *
 * Answers: "What should be done now?"
 *
 * Input: Sku360BusinessContext + BusinessSignal[] + DiagnosisResult[]
 * Output: RecommendedAction[]
 *
 * Strict Axiom:
 * Load != Detect != Diagnose != Recommend != Execute
 *
 * Pure code determination of action candidate eligibility, priorities, and risk.
 * Recommends actions only. NEVER mutates external systems.
 */

import {
  ActionRecommendationInput,
  ActionRecommendationResponse,
  RecommendedAction,
  ActionPriority,
} from '@crosspilot/shared';

import { IActionRecommendationPolicy } from './recommendation.types.js';
import { ActionPriorityScorer } from './action-priority.scorer.js';
import { ActionRiskClassifier } from './action-risk.classifier.js';
import { ActionDeduplicator } from './action-deduplicator.js';
import { ActionConflictDetector } from './action-conflict.detector.js';

import { AdvertisingActionPolicy } from './recommendation-policies/advertising-action.policy.js';
import { InventoryActionPolicy } from './recommendation-policies/inventory-action.policy.js';
import { ProfitActionPolicy } from './recommendation-policies/profit-action.policy.js';
import { ProductQualityActionPolicy } from './recommendation-policies/product-quality-action.policy.js';
import { CompetitorActionPolicy } from './recommendation-policies/competitor-action.policy.js';

export class ActionRecommendationService {
  private static readonly policies: IActionRecommendationPolicy[] = [
    new AdvertisingActionPolicy(),
    new InventoryActionPolicy(),
    new ProfitActionPolicy(),
    new ProductQualityActionPolicy(),
    new CompetitorActionPolicy(),
  ];

  /**
   * Deterministically evaluates diagnoses and context to generate prioritized recommended actions.
   */
  public static recommend(input: ActionRecommendationInput): ActionRecommendationResponse {
    const { context, signals, diagnoses, options } = input;
    const executedAt = options?.asOf ?? new Date().toISOString();

    // 1. Healthy / Zero-Anomaly Interception (D8)
    if ((!signals || signals.length === 0) && (!diagnoses || diagnoses.length === 0)) {
      return {
        workspaceId: context.identity.workspaceId,
        skuId: context.identity.skuId,
        asin: context.identity.asin,
        actions: [],
        summary: {
          totalActions: 0,
          p1Count: 0,
          p2Count: 0,
          p3Count: 0,
          advisoryCount: 0,
          approvalRequiredCount: 0,
          conflictsDetected: 0,
        },
        evaluatedDiagnosisCount: 0,
        evaluatedSignalCount: 0,
        executedAt,
      };
    }

    // 2. Action Eligibility Gate: Check diagnosis evidence support
    const eligibleDiagnoses = diagnoses.filter((d) => {
      // INSUFFICIENT diagnoses cannot generate high-certainty operational actions
      if (d.gateStatus === 'INSUFFICIENT') {
        return false;
      }
      return true;
    });

    // 3. Execute Policies to generate candidate actions
    const candidateActions: RecommendedAction[] = [];

    for (const policy of this.policies) {
      if (policy.canRecommend(context, eligibleDiagnoses, signals)) {
        const policyActions = policy.recommend(context, eligibleDiagnoses, signals, options);
        candidateActions.push(...policyActions);
      }
    }

    // 4. Action Eligibility Gate Filtering for PARTIALLY_SUPPORTED diagnoses
    const gatedActions = candidateActions.filter((action) => {
      const relatedDiag = diagnoses.find((d) =>
        action.sourceDiagnosisIds?.includes(d.diagnosisId)
      );

      if (relatedDiag?.gateStatus === 'PARTIALLY_SUPPORTED') {
        // Only INVESTIGATION or REVIEW class actions allowed
        const isSafeReview =
          action.actionType?.startsWith('INVESTIGATE_') ||
          action.actionType?.startsWith('REVIEW_') ||
          action.actionType?.startsWith('REFRESH_');

        if (!isSafeReview) {
          return false; // Suppress concrete operational directives like PREPARE_REPLENISHMENT
        }

        action.recommendationGateStatus = 'NEEDS_REVIEW';
      }

      return true;
    });

    // 5. Deduplicate and Merge Actions
    const mergedActions =
      options?.dedup === false
        ? gatedActions
        : ActionDeduplicator.dedupAndMerge(gatedActions);

    // 6. Recalculate deterministic priority & risk classification
    for (const action of mergedActions) {
      const priorityResult = ActionPriorityScorer.score(action, context, diagnoses, signals);
      action.priority = priorityResult.priority;

      const riskResult = ActionRiskClassifier.classify(action);
      action.riskLevel = riskResult.riskLevel;
      action.executionMode = riskResult.executionMode;
    }

    // 7. Conflict Detection
    const evaluatedActions =
      options?.detectConflicts === false
        ? mergedActions
        : ActionConflictDetector.detectConflicts(mergedActions);

    // 8. Priority Sorting (P1 -> P2 -> P3, then impactAmount desc, then actionId asc)
    const priorityWeight: Record<ActionPriority, number> = {
      P1: 1,
      P2: 2,
      P3: 3,
    };

    evaluatedActions.sort((a, b) => {
      const pDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (pDiff !== 0) return pDiff;

      const aImpact = Math.abs(a.impactAmount ?? 0);
      const bImpact = Math.abs(b.impactAmount ?? 0);
      if (bImpact !== aImpact) return bImpact - aImpact;

      return a.actionId.localeCompare(b.actionId);
    });

    // 9. Filter by minPriority if requested
    let finalActions = evaluatedActions;
    if (options?.minPriority) {
      const maxAllowed = priorityWeight[options.minPriority];
      finalActions = evaluatedActions.filter((a) => priorityWeight[a.priority] <= maxAllowed);
    }

    // 10. Summary Metrics
    const p1Count = finalActions.filter((a) => a.priority === 'P1').length;
    const p2Count = finalActions.filter((a) => a.priority === 'P2').length;
    const p3Count = finalActions.filter((a) => a.priority === 'P3').length;
    const advisoryCount = finalActions.filter((a) => a.executionMode === 'ADVISORY').length;
    const approvalRequiredCount = finalActions.filter(
      (a) => a.executionMode === 'APPROVAL_REQUIRED'
    ).length;
    const conflictsDetected = finalActions.filter((a) => a.conflictDetected).length;

    return {
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      actions: finalActions,
      summary: {
        totalActions: finalActions.length,
        p1Count,
        p2Count,
        p3Count,
        advisoryCount,
        approvalRequiredCount,
        conflictsDetected,
      },
      evaluatedDiagnosisCount: diagnoses.length,
      evaluatedSignalCount: signals.length,
      executedAt,
    };
  }
}
