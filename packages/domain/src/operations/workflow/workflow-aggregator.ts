/**
 * Workflow Aggregator & Cross-SKU Priority Ranking (Epic 3 Phase 6)
 *
 * Enforces:
 * - Deterministic cross-SKU priority ranking (P1 -> P2 -> P3 -> Financial Impact -> Stable Tie-Breaker)
 * - Computes DailyOperationSummary & global healthStatus (CRITICAL / NEEDS_ATTENTION / HEALTHY)
 * - Extracts top operational risks across evaluated SKUs
 */

import {
  BusinessSignal,
  RecommendedAction,
  DailyOperationSummary,
  DailyOperationTopRisk,
  DiagnosisHealthStatus,
  ActionPriority,
} from '@crosspilot/shared';

export class WorkflowAggregator {
  /**
   * Deterministically aggregates actions across all SKUs, orders by priority and impact,
   * and computes global summary metrics.
   */
  public static aggregate(params: {
    totalSkuCount: number;
    evaluatedSkuCount: number;
    failedSkuCount: number;
    signals: BusinessSignal[];
    actions: RecommendedAction[];
  }): {
    rankedActions: RecommendedAction[];
    summary: DailyOperationSummary;
    healthStatus: DiagnosisHealthStatus;
  } {
    const { totalSkuCount, evaluatedSkuCount, failedSkuCount, signals, actions } = params;

    // 1. Cross-SKU Priority Ranking
    const priorityWeight: Record<ActionPriority, number> = {
      P1: 1,
      P2: 2,
      P3: 3,
    };

    const rankedActions = [...actions].sort((a, b) => {
      const pDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (pDiff !== 0) return pDiff;

      const aImpact = Math.abs(a.impactAmount ?? 0);
      const bImpact = Math.abs(b.impactAmount ?? 0);
      if (bImpact !== aImpact) return bImpact - aImpact;

      const skuDiff = (a.skuId ?? '').localeCompare(b.skuId ?? '');
      if (skuDiff !== 0) return skuDiff;

      return a.actionId.localeCompare(b.actionId);
    });

    // 2. Metrics & Counts
    const criticalSignalCount = signals.filter((s) => s.severity === 'CRITICAL').length;
    const warningSignalCount = signals.filter((s) => s.severity === 'WARNING').length;

    const p1ActionCount = rankedActions.filter((a) => a.priority === 'P1').length;
    const p2ActionCount = rankedActions.filter((a) => a.priority === 'P2').length;
    const p3ActionCount = rankedActions.filter((a) => a.priority === 'P3').length;

    const advisoryCount = rankedActions.filter((a) => a.executionMode === 'ADVISORY').length;
    const approvalRequiredCount = rankedActions.filter(
      (a) => a.executionMode === 'APPROVAL_REQUIRED'
    ).length;

    // Affected SKUs (SKUs having at least one signal or action)
    const affectedSkuSet = new Set<string>();
    signals.forEach((s) => {
      if (s.skuId) affectedSkuSet.add(s.skuId);
    });
    rankedActions.forEach((a) => {
      if (a.skuId) affectedSkuSet.add(a.skuId);
    });
    const affectedSkuCount = affectedSkuSet.size;

    // 3. Global Health Status
    let healthStatus: DiagnosisHealthStatus = 'HEALTHY';
    if (p1ActionCount > 0 || criticalSignalCount > 0) {
      healthStatus = 'CRITICAL';
    } else if (p2ActionCount > 0 || p3ActionCount > 0 || warningSignalCount > 0) {
      healthStatus = 'NEEDS_ATTENTION';
    } else {
      healthStatus = 'HEALTHY';
    }

    // 4. Top Risks Extraction
    const topRisks: DailyOperationTopRisk[] = signals
      .filter((s) => (s.severity === 'CRITICAL' || s.severity === 'WARNING') && Boolean(s.skuId))
      .map((s) => ({
        skuId: s.skuId ?? 'UNKNOWN',
        domain: s.domain,
        title: s.title,
        severity: s.severity,
        financialExposure: Math.abs(s.currentValue),
      }))
      .sort((a, b) => {
        if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
        if (b.severity === 'CRITICAL' && a.severity !== 'CRITICAL') return 1;
        return (b.financialExposure ?? 0) - (a.financialExposure ?? 0);
      })
      .slice(0, 5);

    const summary: DailyOperationSummary = {
      healthStatus,
      totalSkuCount,
      evaluatedSkuCount,
      failedSkuCount,
      affectedSkuCount,
      criticalSignalCount,
      warningSignalCount,
      p1ActionCount,
      p2ActionCount,
      p3ActionCount,
      advisoryCount,
      approvalRequiredCount,
      topRisks,
      actions: rankedActions,
      noActionRequired: rankedActions.length === 0,
    };

    return {
      rankedActions,
      summary,
      healthStatus,
    };
  }
}
