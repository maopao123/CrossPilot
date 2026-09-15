import { CandidateRisk } from '@crosspilot/shared';

export interface RiskGateEvaluation {
  gatePassed: boolean;
  blocked: boolean;
  hasUnverified: boolean;
  blockers: string[];
  unverifiedItems: string[];
  reasons: string[];
  downgradedRisks: string[];
}

export class CandidateRiskGate {
  /**
   * Hard Risk Gate evaluation:
   * 1. Any HIGH severity risk with status 'FAIL' immediately sets blocked = true and gatePassed = false.
   * 2. Any risk with status 'UNVERIFIED' sets hasUnverified = true (needs manual validation).
   * 3. 'PASS' requires verified evidence:
   *    If a PATENT or COMPLIANCE risk is marked as 'PASS' but has empty evidenceIds,
   *    or references evidence not in availableEvidenceIds, it is automatically downgraded to 'UNVERIFIED'.
   */
  static evaluate(
    risks: CandidateRisk[],
    availableEvidenceIds?: Set<string> | string[],
  ): RiskGateEvaluation {
    const blockers: string[] = [];
    const unverifiedItems: string[] = [];
    const reasons: string[] = [];
    const downgradedRisks: string[] = [];

    const evidenceSet = availableEvidenceIds
      ? availableEvidenceIds instanceof Set
        ? availableEvidenceIds
        : new Set(availableEvidenceIds)
      : undefined;

    for (const risk of risks) {
      // Check PASS evidence integrity for high-stakes categories (PATENT, COMPLIANCE)
      if (risk.status === 'PASS' && (risk.category === 'PATENT' || risk.category === 'COMPLIANCE')) {
        const hasEvidence =
          Array.isArray(risk.evidenceIds) &&
          risk.evidenceIds.length > 0 &&
          (!evidenceSet || risk.evidenceIds.some((id) => evidenceSet.has(id)));

        if (!hasEvidence) {
          downgradedRisks.push(`[${risk.category}] ${risk.title}`);
          unverifiedItems.push(`[${risk.category}] ${risk.title}`);
          reasons.push(
            `风险核验不完整: [${risk.category}] "${risk.title}" 声明为 PASS 但缺乏真实有效凭证 ID，自动降级为 UNVERIFIED`,
          );
          continue;
        }
      }

      if (risk.status === 'FAIL') {
        if (risk.severity === 'HIGH' || risk.category === 'PATENT' || risk.category === 'COMPLIANCE') {
          blockers.push(`[${risk.category}] ${risk.title}`);
          reasons.push(`严重风险拦截: ${risk.title} (分类: ${risk.category}, 严重度: ${risk.severity})`);
        } else {
          reasons.push(`中轻度风险异常: ${risk.title}`);
        }
      } else if (risk.status === 'UNVERIFIED') {
        unverifiedItems.push(`[${risk.category}] ${risk.title}`);
        reasons.push(`风险待核验: ${risk.title} (尚未进行法律/专利/供应链尽调)`);
      }
    }

    const blocked = blockers.length > 0;
    const hasUnverified = unverifiedItems.length > 0;
    const gatePassed = !blocked;

    return {
      gatePassed,
      blocked,
      hasUnverified,
      blockers,
      unverifiedItems,
      reasons,
      downgradedRisks,
    };
  }
}
