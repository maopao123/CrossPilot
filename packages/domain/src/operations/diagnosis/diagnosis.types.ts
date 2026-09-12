/**
 * Cross-Domain Diagnosis Types & Interfaces (Epic 3 Phase 4)
 *
 * Defines strategy contracts for deterministic diagnosis patterns,
 * execution options, and response structures.
 *
 * Strict boundary: Load != Detect != Diagnose != Recommend
 * Pure diagnosis only. NO action recommendations or execution directives.
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
} from '@crosspilot/shared';

export interface DiagnosisExecutionOptions {
  minConfidenceThreshold?: number;
  includeLLMSummary?: boolean;
  asOf?: string;
}

export interface IDiagnosisPattern {
  readonly patternId: string;
  readonly targetRuleIds: readonly string[];
  readonly targetSignalCodes: readonly string[];

  /**
   * Checks whether this pattern is applicable given current SKU context and detected signals.
   */
  canDiagnose(context: Sku360BusinessContext, signals: BusinessSignal[]): boolean;

  /**
   * Executes deterministic causal attribution and returns a typed DiagnosisResult,
   * or null if no anomaly requires diagnosis under this pattern.
   */
  diagnose(
    context: Sku360BusinessContext,
    signals: BusinessSignal[],
    options?: DiagnosisExecutionOptions
  ): DiagnosisResult | null;
}
