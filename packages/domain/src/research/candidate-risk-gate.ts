import { CandidateRisk } from '@crosspilot/shared';

export interface RiskGateEvaluation {
  gatePassed: boolean;
  blocked: boolean;
  hasUnverified: boolean;
  blockers: string[];
  unverifiedItems: string[];
  reasons: string[];
}

export class CandidateRiskGate {
  /**
   * Hard Risk Gate evaluation:
   * 1. Any HIGH severity risk with status 'FAIL' immediately sets blocked = true and gatePassed = false.
   * 2. Any risk with status 'UNVERIFIED' sets hasUnverified = true (needs manual validation).
   * 3. 'UNVERIFIED' does NOT mean 'FAIL', nor does it mean 'PASS'. It represents uncompleted diligence.
   */
  static evaluate(risks: CandidateRisk[]): RiskGateEvaluation {
    const blockers: string[] = [];
    const unverifiedItems: string[] = [];
    const reasons: string[] = [];

    for (const risk of risks) {
      if (risk.status === 'FAIL') {
        if (risk.severity === 'HIGH' || risk.category === 'PATENT' || risk.category === 'COMPLIANCE') {
          blockers.push(`[${risk.category}] ${risk.title}`);
          reasons.push(`严重风险拦截: ${risk.title} (分类: ${risk.category}, 严重度: ${risk.severity})`);
        } else {
          reasons.push(`中轻度风险异常: ${risk.title}`);
        }
      } else if (risk.status === 'UNVERIFIED') {
        unverifiedItems.push(`[${risk.category}] ${risk.title}`);
        reasons.push(`风险待核验: ${risk.title} (尚未进行法律/专利/供应链核验)`);
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
    };
  }
}
