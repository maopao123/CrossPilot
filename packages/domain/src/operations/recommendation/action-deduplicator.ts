/**
 * Action Deduplicator & Merging Engine (Epic 3 Phase 5)
 *
 * Enforces:
 * - Deterministic, idempotent action IDs
 * - Merges multiple diagnoses pointing to the same action into a single primary action
 * - Aggregates sourceDiagnosisIds, sourceSignalIds, and evidence items
 * - Preserves highest priority and highest risk level
 */

import {
  ActionType,
  ActionPriority,
  ActionRiskLevel,
  ActionExecutionMode,
  RecommendedAction,
  OperationEvidenceItem,
} from '@crosspilot/shared';

export class ActionDeduplicator {
  /**
   * Deterministically generates an idempotent action ID.
   */
  public static generateActionId(
    workspaceId: string,
    skuId: string,
    actionType: ActionType,
    targetSuffix?: string
  ): string {
    const cleanType = actionType.replace(/_/g, '-').toLowerCase();
    const cleanTarget = targetSuffix
      ? `-${targetSuffix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`
      : '';
    return `ACT-${workspaceId}-${skuId}-${cleanType}${cleanTarget}`;
  }

  /**
   * Deduplicates and merges candidate actions sharing the same actionType and target entity.
   */
  public static dedupAndMerge(actions: RecommendedAction[]): RecommendedAction[] {
    if (actions.length <= 1) {
      return [...actions];
    }

    const priorityRank: Record<ActionPriority, number> = {
      P1: 3,
      P2: 2,
      P3: 1,
    };

    const riskRank: Record<ActionRiskLevel, number> = {
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    const groups = new Map<string, RecommendedAction[]>();

    for (const act of actions) {
      const groupKey = `${act.workspaceId}:${act.skuId ?? 'all'}:${act.actionType ?? act.category}:${act.targetEntity ?? 'none'}:${act.targetId ?? 'none'}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(act);
    }

    const mergedList: RecommendedAction[] = [];

    for (const group of groups.values()) {
      if (group.length === 1) {
        mergedList.push(group[0]);
        continue;
      }

      // Merge multiple actions into the primary one
      const base = { ...group[0] };

      const allDiagnosisIds = new Set<string>(base.sourceDiagnosisIds ?? []);
      const allSignalIds = new Set<string>(base.sourceSignalIds ?? []);
      const evidenceMap = new Map<string, OperationEvidenceItem>();

      for (const e of base.evidence ?? []) {
        evidenceMap.set(e.evidenceId, e);
      }

      let highestPriority: ActionPriority = base.priority;
      let highestRisk: ActionRiskLevel = base.riskLevel;
      let highestExecutionMode: ActionExecutionMode = base.executionMode;
      const reasons: string[] = [base.reason];
      let totalImpactAmount = base.impactAmount ?? 0;

      for (let i = 1; i < group.length; i++) {
        const item = group[i];

        // Diagnosis & Signal IDs
        item.sourceDiagnosisIds?.forEach((id) => allDiagnosisIds.add(id));
        item.sourceSignalIds?.forEach((id) => allSignalIds.add(id));

        // Evidence
        item.evidence?.forEach((e) => {
          if (!evidenceMap.has(e.evidenceId)) {
            evidenceMap.set(e.evidenceId, e);
          }
        });

        // Priority
        if (priorityRank[item.priority] > priorityRank[highestPriority]) {
          highestPriority = item.priority;
        }

        // Risk Level
        if (riskRank[item.riskLevel] > riskRank[highestRisk]) {
          highestRisk = item.riskLevel;
        }

        // Execution Mode
        if (item.executionMode === 'APPROVAL_REQUIRED') {
          highestExecutionMode = 'APPROVAL_REQUIRED';
        }

        // Reasons
        if (item.reason && !reasons.includes(item.reason)) {
          reasons.push(item.reason);
        }

        // Impact Amount
        if (item.impactAmount && item.impactType === base.impactType) {
          totalImpactAmount = Math.max(totalImpactAmount, item.impactAmount);
        }

        // Merge payload
        if (item.payload) {
          base.payload = { ...(base.payload ?? {}), ...item.payload };
        }
      }

      base.sourceDiagnosisIds = Array.from(allDiagnosisIds);
      base.sourceSignalIds = Array.from(allSignalIds);
      base.evidence = Array.from(evidenceMap.values());
      base.priority = highestPriority;
      base.riskLevel = highestRisk;
      base.executionMode = highestExecutionMode;
      base.reason = reasons.join(' | ');
      base.impactAmount = totalImpactAmount !== 0 ? totalImpactAmount : base.impactAmount;

      mergedList.push(base);
    }

    return mergedList;
  }
}
