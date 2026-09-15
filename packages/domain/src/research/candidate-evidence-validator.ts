import { EvidenceItem, EvidenceScope } from '@crosspilot/shared';

export interface SubjectConsistencyViolation {
  evidenceId: string;
  scope: EvidenceScope;
  subjectId: string;
  expectedSubjectId: string;
  reason: string;
}

export interface EvidenceValidationResult {
  valid: boolean;
  validEvidences: EvidenceItem[];
  rejectedEvidences: EvidenceItem[];
  violations: SubjectConsistencyViolation[];
}

export class CandidateEvidenceValidator {
  /**
   * Validates evidence subject consistency and scope integrity:
   * 1. PRODUCT evidence MUST have subjectId matching the target candidateId or candidate's ASIN.
   *    Candidate B's PRODUCT evidence CANNOT be attributed to Candidate A.
   * 2. CATEGORY evidence supports category-level conclusions, but CANNOT impersonate a single product's reviews
   *    (e.g. phrases like "该商品买家", "该ASIN用户", "本产品评论").
   * 3. KEYWORD evidence supports keyword market conclusions.
   * 4. MARKET evidence supports marketplace-level conclusions.
   */
  static validateCandidateEvidence(
    candidateId: string,
    candidateAsin: string | undefined,
    evidences: EvidenceItem[],
  ): EvidenceValidationResult {
    const validEvidences: EvidenceItem[] = [];
    const rejectedEvidences: EvidenceItem[] = [];
    const violations: SubjectConsistencyViolation[] = [];

    const allowedSubjectIds = new Set<string>();
    if (candidateId) allowedSubjectIds.add(candidateId.trim());
    if (candidateAsin && candidateAsin.trim()) allowedSubjectIds.add(candidateAsin.trim());

    for (const evi of evidences) {
      // 1. PRODUCT scope subject consistency
      if (evi.scope === 'PRODUCT') {
        const sub = (evi.subjectId || '').trim();
        if (!allowedSubjectIds.has(sub)) {
          const violation: SubjectConsistencyViolation = {
            evidenceId: evi.id,
            scope: 'PRODUCT',
            subjectId: evi.subjectId,
            expectedSubjectId: Array.from(allowedSubjectIds).join(' or '),
            reason: `PRODUCT-level evidence with subjectId "${evi.subjectId}" cannot be attributed to Candidate "${candidateId}". Cross-candidate evidence injection is forbidden.`,
          };
          violations.push(violation);
          rejectedEvidences.push(evi);
          continue;
        }
      }

      // 2. CATEGORY scope impersonation check
      if (evi.scope === 'CATEGORY') {
        const impersonationViolation = this.checkCategoryImpersonation(evi);
        if (impersonationViolation) {
          violations.push(impersonationViolation);
          rejectedEvidences.push(evi);
          continue;
        }
      }

      // Valid evidence for candidate
      validEvidences.push(evi);
    }

    return {
      valid: violations.length === 0,
      validEvidences,
      rejectedEvidences,
      violations,
    };
  }

  /**
   * Asserts that CATEGORY scope evidence does not impersonate single-product review evidence.
   */
  static checkCategoryImpersonation(evidence: EvidenceItem): SubjectConsistencyViolation | null {
    if (evidence.scope !== 'CATEGORY') return null;
    const lower = (evidence.content || '').toLowerCase();
    const prohibitedPhrases = [
      '该商品买家',
      '该asin用户',
      '本产品评论',
      '单品评价',
      '该商品买家评价',
      '该商品用户',
      '该单品用户',
    ];

    for (const phrase of prohibitedPhrases) {
      if (lower.includes(phrase)) {
        return {
          evidenceId: evidence.id,
          scope: 'CATEGORY',
          subjectId: evidence.subjectId,
          expectedSubjectId: 'CATEGORY_LEVEL_BENCHMARK',
          reason: `CATEGORY 作用域证据文案含有冒充单品买家原声表述 ("${phrase}")，禁止将品类原声伪装为该商品的直接评价。`,
        };
      }
    }
    return null;
  }

  /**
   * @deprecated Kept for backwards compatibility
   */
  static assertCategoryVocNotImpersonatingProduct(evidence: EvidenceItem): boolean {
    return this.checkCategoryImpersonation(evidence) === null;
  }
}
