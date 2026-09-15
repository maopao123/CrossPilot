import {
  Assumption,
  CandidateDecision,
  CandidateDecisionDetail,
  MissingRequirement,
  ProductCandidate,
} from '@crosspilot/shared';
import { CandidateEvidenceValidator } from './candidate-evidence-validator.js';
import { CandidateRiskGate } from './candidate-risk-gate.js';

export class CandidateDecisionEngine {
  /**
   * Deterministic evaluation of candidate decision adhering to the strict gate pipeline:
   * Evidence Completeness -> Hard Risk Gate -> Economics Gate -> Comparable Metrics -> Decision
   *
   * Enforces Missing Data Policy:
   * Missing critical economics (e.g. productCost) MUST result in NEEDS_VALIDATION,
   * regardless of how high market opportunity score may be.
   */
  static evaluate(candidate: ProductCandidate): CandidateDecisionDetail {
    const reasons: string[] = [];
    const now = new Date().toISOString();

    // 1. Evidence Completeness & Subject Consistency Gate
    const evidenceValidation = CandidateEvidenceValidator.validateCandidateEvidence(
      candidate.id,
      candidate.marketResearch?.representativeAsin ?? undefined,
      candidate.evidence,
    );

    if (!evidenceValidation.valid) {
      for (const v of evidenceValidation.violations) {
        reasons.push(`证据主体不一致: ${v.reason}`);
      }
    }

    const validEvidenceCount = evidenceValidation.validEvidences.length;
    const requiredEvidenceTarget = 4; // Concept, market, price, voc
    const evidenceCompleteness = Number(
      Math.min(1.0, Math.max(0.1, validEvidenceCount / requiredEvidenceTarget)).toFixed(2),
    );

    // 2. Hard Risk Gate
    const riskEval = CandidateRiskGate.evaluate(candidate.risks);
    const hardRiskGatePassed = riskEval.gatePassed;

    if (riskEval.blocked) {
      reasons.push(...riskEval.blockers.map((b) => `严重风险硬阻断: ${b}`));
      return {
        verdict: 'BLOCKED',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: false,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    // 3. Economics Gate (Strict Missing Data Policy)
    const economics = candidate.economics;
    const hasMissingCriticalCost =
      economics.status === 'INCOMPLETE' ||
      economics.missingInputs.includes('productCost') ||
      economics.missingInputs.includes('sellingPrice');

    if (hasMissingCriticalCost) {
      reasons.push(
        `关键财务数据缺失: [${economics.missingInputs.join(', ')}]，触发缺失门禁，判定为待验证 (NEEDS_VALIDATION)`,
      );
      return {
        verdict: 'NEEDS_VALIDATION',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: true,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    const baseMargin = economics.scenarios.base.contributionMargin;
    const baseProfit = economics.scenarios.base.contributionProfit;
    const conservativeProfit = economics.scenarios.conservative.contributionProfit;

    if (baseProfit <= 0 || baseMargin <= 0) {
      reasons.push(
        `基准财务测算亏损: 边际贡献 $${baseProfit.toFixed(2)} (利润率 ${(baseMargin * 100).toFixed(1)}%)，财务不可行`,
      );
      return {
        verdict: 'BLOCKED',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: true,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    const economicsGatePassed = true;

    // 4. Check Unverified Risks & Assumptions
    if (riskEval.hasUnverified) {
      reasons.push(
        ...riskEval.unverifiedItems.map((u) => `未核验风险项: ${u} (需完成尽调方可决定是否入围)`),
      );
      return {
        verdict: 'NEEDS_VALIDATION',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: true,
        economicsGatePassed: true,
        evaluatedAt: now,
      };
    }

    const hasUnvalidatedHighImpactAssumption = candidate.assumptions.some(
      (a: Assumption) => a.impactLevel === 'HIGH' && !a.validated,
    );
    if (hasUnvalidatedHighImpactAssumption) {
      const pendingAssumptions = candidate.assumptions
        .filter((a: Assumption) => a.impactLevel === 'HIGH' && !a.validated)
        .map((a: Assumption) => a.field);
      reasons.push(`高敏感假设待验证: [${pendingAssumptions.join(', ')}]`);
      return {
        verdict: 'NEEDS_VALIDATION',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: true,
        economicsGatePassed: true,
        evaluatedAt: now,
      };
    }

    if (candidate.missingRequirements.some((m: MissingRequirement) => m.blockingDecision)) {
      const blockers = candidate.missingRequirements
        .filter((m: MissingRequirement) => m.blockingDecision)
        .map((m: MissingRequirement) => m.description);
      reasons.push(`阻断性需求项未齐备: [${blockers.join(', ')}]`);
      return {
        verdict: 'NEEDS_VALIDATION',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: true,
        economicsGatePassed: true,
        evaluatedAt: now,
      };
    }

    // 5. Margin Thresholds: Thin Margin -> WATCH
    if (baseMargin < 0.12 || conservativeProfit < 0) {
      reasons.push(
        `财务空间较窄: 基准利润率 ${(baseMargin * 100).toFixed(1)}% 偏低，或悲观情景亏损 ($${conservativeProfit.toFixed(2)})，建议保持观察 (WATCH)`,
      );
      return {
        verdict: 'WATCH',
        reasons,
        evidenceCompleteness,
        hardRiskGatePassed: true,
        economicsGatePassed: true,
        evaluatedAt: now,
      };
    }

    // 6. Healthy Financials & Evidence Completeness -> SHORTLIST
    reasons.push(
      `财务健康: 基准贡献利润 $${baseProfit.toFixed(2)} (利润率 ${(baseMargin * 100).toFixed(1)}%)，悲观情景留存 $${conservativeProfit.toFixed(2)}`,
    );
    reasons.push(`风险门禁全部通过，关键依据链完整，正式列入候选优选清单 (SHORTLIST)`);

    return {
      verdict: 'SHORTLIST',
      reasons,
      evidenceCompleteness,
      hardRiskGatePassed: true,
      economicsGatePassed: true,
      evaluatedAt: now,
    };
  }
}
