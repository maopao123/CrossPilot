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
   * Validates evidence subject consistency:
   * 1. PRODUCT evidence MUST have subjectId matching the target candidateId or candidate's ASIN.
   *    Candidate B's PRODUCT evidence CANNOT be attributed to Candidate A.
   * 2. CATEGORY evidence supports category-level conclusions, but cannot be treated as a single product's review.
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
   * Asserts that CATEGORY scope evidence is not being mislabeled as single-product review evidence.
   */
  static assertCategoryVocNotImpersonatingProduct(evidence: EvidenceItem): boolean {
    if (evidence.scope === 'CATEGORY') {
      const lower = evidence.content.toLowerCase();
      // If category evidence claims to be a specific ASIN's feedback, flag violation
      if (lower.includes('单品评价') || lower.includes('该商品买家评价')) {
        return false;
      }
    }
    return true;
  }
}
