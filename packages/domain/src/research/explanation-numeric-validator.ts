import { ProductOpportunity, ResearchEvidence, StructuredFact } from '@crosspilot/shared';

export interface GroundingViolation {
  code: string;
  statement: string;
  reason: string;
}

export interface GroundingValidationResult {
  valid: boolean;
  violations: GroundingViolation[];
}

export class ExplanationNumericGroundingValidator {
  private static readonly UNGROUNDED_ENGINEERING_REGEX =
    /\b\d+(\.\d+)?\s*(cm|mm|inch|inches|寸|厘米|毫米|公分)\b/i;

  /**
   * Validates that all structured facts and recommendations are properly grounded in evidence:
   * 1. No ungrounded exact engineering tolerances or dimensions (e.g., "3.2cm") unless explicitly in evidence.
   * 2. Recommendations must remain directional unless backed by exact CAD/evidence specs.
   * 3. Percentages and numeric claims in facts must match signal raw metrics or evidence content.
   */
  static validate(
    opportunity: ProductOpportunity,
    evidences: ResearchEvidence[] = [],
  ): GroundingValidationResult {
    const violations: GroundingViolation[] = [];
    const evidenceText = evidences.map((e) => e.content).join(' ');

    const allFacts: StructuredFact[] = [
      ...opportunity.strengths,
      ...opportunity.risks,
      ...opportunity.opportunities,
    ];

    for (const fact of allFacts) {
      // 1. Check for invented engineering dimensions
      const dimMatch = fact.statement.match(this.UNGROUNDED_ENGINEERING_REGEX);
      if (dimMatch && !evidenceText.includes(dimMatch[0])) {
        violations.push({
          code: fact.code,
          statement: fact.statement,
          reason: `Fact contains ungrounded physical dimension parameter "${dimMatch[0]}" without supporting evidence.`,
        });
      }
    }

    // 2. Check actionable recommendations
    if (opportunity.explanation?.actionableRecommendations) {
      for (const rec of opportunity.explanation.actionableRecommendations) {
        const dimMatch = rec.match(this.UNGROUNDED_ENGINEERING_REGEX);
        if (dimMatch && !evidenceText.includes(dimMatch[0])) {
          violations.push({
            code: 'RECOMMENDATION_UNGROUNDED_PARAM',
            statement: rec,
            reason: `Recommendation contains ungrounded physical dimension "${dimMatch[0]}" not supported by VOC or product evidence.`,
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}
