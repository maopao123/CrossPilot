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
   * Deterministic evaluation of candidate decision adhering to the hardened 6-stage gate pipeline:
   * 1. Evidence Validation Gate (Subject consistency & scope impersonation)
   * 2. Critical Missing Data Gate (Anti-gaming policy for missing cost/price)
   * 3. Hard Risk Gate (Severe compliance/patent failures and unverified PASS downgrades)
   * 4. Economics Gate (Positive contribution margin & profit hurdle)
   * 5. Assumption & Unverified Due Diligence Gate
   * 6. Decision Verdict (WATCH / SHORTLIST)
   */
  static evaluate(candidate: ProductCandidate): CandidateDecisionDetail {
    const reasons: string[] = [];
    const now = new Date().toISOString();

    // 1. Evidence Validation Gate
    const evidenceValidation = CandidateEvidenceValidator.validateCandidateEvidence(
      candidate.id,
      candidate.marketResearch?.representativeAsin ?? undefined,
      candidate.evidence,
    );

    const validEvidenceIds = new Set(evidenceValidation.validEvidences.map((e) => e.id));

    // Calculate dimensional evidence coverage heuristic (Concept, Market, Economics, Risk)
    let coveredDimensions = 0;
    const hasConceptEvidence =
      candidate.concept.specifications !== undefined ||
      evidenceValidation.validEvidences.some((e) => e.scope === 'PRODUCT');
    if (hasConceptEvidence) coveredDimensions++;

    const hasMarketEvidence =
      candidate.marketResearch?.searchVolumeMonthly != null ||
      evidenceValidation.validEvidences.some((e) => e.scope === 'KEYWORD' || e.scope === 'MARKET');
    if (hasMarketEvidence) coveredDimensions++;

    const hasEconomicsEvidence =
      candidate.economics.status === 'COMPLETE' ||
      candidate.economics.inputs.productCost.source !== 'UNKNOWN';
    if (hasEconomicsEvidence) coveredDimensions++;

    const hasRiskEvidence = candidate.risks.length > 0;
    if (hasRiskEvidence) coveredDimensions++;

    const evidenceCoverageHeuristic = Number((coveredDimensions / 4).toFixed(2));

    // Enforce Evidence Integrity Gate: Validation violations MUST block SHORTLIST
    if (!evidenceValidation.valid) {
      for (const v of evidenceValidation.violations) {
        reasons.push(`证据主体范围校验未通过: ${v.reason}`);
      }

      // Check if product-level evidence was completely rejected
      const remainingProductEvidences = evidenceValidation.validEvidences.filter(
        (e) => e.scope === 'PRODUCT',
      );
      const isProductEvidenceMissing =
        candidate.evidence.some((e) => e.scope === 'PRODUCT') &&
        remainingProductEvidences.length === 0;

      const verdict: CandidateDecision = isProductEvidenceMissing
        ? 'INSUFFICIENT_DATA'
        : 'NEEDS_VALIDATION';

      return {
        verdict,
        reasons,
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
        hardRiskGatePassed: false,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    // 2. Critical Missing Data Gate (Strict Missing Data Policy)
    const economics = candidate.economics;
    const missingCriticalInputs = economics.missingInputs.filter(
      (m) =>
        m === 'sellingPrice' ||
        m === 'productCost' ||
        m === 'referralFeeRate' ||
        m === 'fbaFeePerUnit' ||
        m === 'freightPerUnit',
    );

    if (economics.status === 'INCOMPLETE' || missingCriticalInputs.length > 0) {
      const isCriticalCostOrPriceMissing =
        missingCriticalInputs.includes('productCost') ||
        missingCriticalInputs.includes('sellingPrice');

      reasons.push(
        `关键财务数据缺失: [${missingCriticalInputs.join(', ')}]，触发缺失数据门禁，判定为待验证 (NEEDS_VALIDATION)`,
      );

      return {
        verdict: isCriticalCostOrPriceMissing ? 'NEEDS_VALIDATION' : 'NEEDS_VALIDATION',
        reasons,
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
        hardRiskGatePassed: true,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    // 3. Hard Risk Gate (with PASS evidence verification)
    const riskEval = CandidateRiskGate.evaluate(candidate.risks, validEvidenceIds);
    const hardRiskGatePassed = riskEval.gatePassed;

    if (riskEval.blocked) {
      reasons.push(...riskEval.blockers.map((b) => `严重风险硬阻断: ${b}`));
      return {
        verdict: 'BLOCKED',
        reasons,
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
        hardRiskGatePassed: false,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    // Record any automatic risk downgrades
    if (riskEval.downgradedRisks.length > 0) {
      reasons.push(
        ...riskEval.downgradedRisks.map(
          (d) => `合规风险降级: ${d} 因缺乏有效核验凭证，已由 PASS 自动降级为 UNVERIFIED`,
        ),
      );
    }

    // 4. Economics Gate
    const baseMargin = economics.scenarios.base.contributionMargin;
    const baseProfit = economics.scenarios.base.contributionProfit;
    const conservativeProfit = economics.scenarios.conservative.contributionProfit;

    if (baseProfit < 0 || baseMargin < 0) {
      reasons.push(
        `基准财务测算亏损: 边际贡献 $${baseProfit.toFixed(2)} (利润率 ${(baseMargin * 100).toFixed(1)}%)，财务不可行`,
      );
      return {
        verdict: 'BLOCKED',
        reasons,
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
        hardRiskGatePassed: true,
        economicsGatePassed: false,
        evaluatedAt: now,
      };
    }

    const economicsGatePassed = true;

    // 5. Assumption & Unverified Due Diligence Gate
    if (riskEval.hasUnverified) {
      reasons.push(
        ...riskEval.unverifiedItems.map((u) => `未核验风险项: ${u} (尚未完成充分核验，需完成尽调方可决定是否入围)`),
      );
      return {
        verdict: 'NEEDS_VALIDATION',
        reasons,
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
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
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
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
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
        hardRiskGatePassed: true,
        economicsGatePassed: true,
        evaluatedAt: now,
      };
    }

    // 6. Margin Thresholds: Thin Margin -> WATCH
    if (baseMargin < 0.12 || conservativeProfit < 0) {
      reasons.push(
        `财务空间较窄: 基准利润率 ${(baseMargin * 100).toFixed(1)}% 偏低，或悲观情景亏损 ($${conservativeProfit.toFixed(2)})，建议保持观察 (WATCH)`,
      );
      return {
        verdict: 'WATCH',
        reasons,
        evidenceCoverageHeuristic,
        evidenceCompleteness: evidenceCoverageHeuristic,
        hardRiskGatePassed: true,
        economicsGatePassed: true,
        evaluatedAt: now,
      };
    }

    // 7. Healthy Financials & Evidence Integrity -> SHORTLIST
    reasons.push(
      `财务健康: 基准贡献利润 $${baseProfit.toFixed(2)} (利润率 ${(baseMargin * 100).toFixed(1)}%)，悲观情景留存 $${conservativeProfit.toFixed(2)}`,
    );
    reasons.push(`风险门禁全部通过，关键依据链完整，正式列入候选优选清单 (SHORTLIST)`);

    return {
      verdict: 'SHORTLIST',
      reasons,
      evidenceCoverageHeuristic,
      evidenceCompleteness: evidenceCoverageHeuristic,
      hardRiskGatePassed: true,
      economicsGatePassed: true,
      evaluatedAt: now,
    };
  }
}
