/**
 * Action Recommendation Types & Contracts (Epic 3 Phase 5)
 *
 * Strict boundary: Load != Detect != Diagnose != Recommend != Execute
 * Phase 5 only generates recommendations. NO execution / mutations.
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  RecommendedAction,
  ActionRecommendationOptions,
  SignalDomain,
} from '@crosspilot/shared';

export interface IActionRecommendationPolicy {
  readonly policyId: string;
  readonly targetDomains: readonly SignalDomain[];
  readonly targetDiagnosisRootCodes?: readonly string[];

  canRecommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[]
  ): boolean;

  recommend(
    context: Sku360BusinessContext,
    diagnoses: DiagnosisResult[],
    signals: BusinessSignal[],
    options?: ActionRecommendationOptions
  ): RecommendedAction[];
}

export interface PriorityScoreResult {
  priority: 'P1' | 'P2' | 'P3';
  score: number;
  breakdown: {
    baseScore: number;
    impactBonus: number;
    urgencyBonus: number;
    causalModifier: number;
    evidenceModifier: number;
    freshnessPenalty: number;
  };
  reason: string;
}

export interface RiskClassificationResult {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  executionMode: 'ADVISORY' | 'APPROVAL_REQUIRED';
  reason: string;
}

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictingActionIds: string[];
  reason?: string;
}
