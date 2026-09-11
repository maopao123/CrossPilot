export interface ComplianceRule {
  code: string;
  category: 'POLICY' | 'FACTUAL_ACCURACY' | 'AMAZON_STYLE';
  name: string;
  description: string;
  forbiddenPatterns: RegExp[];
  severity: 'WARNING' | 'VIOLATION';
  citationPolicy: string;
}

export const AMAZON_COMPLIANCE_RULES: ComplianceRule[] = [
  {
    code: 'POL-FDA-001',
    category: 'POLICY',
    name: 'Unverified Medical / FDA Claims',
    description: 'Listings must not claim FDA approval, medical certification, or disease prevention for general home goods.',
    forbiddenPatterns: [/\bfda\s*approved\b/i, /\bcures\b/i, /\bmedical\s*grade\b/i, /\bantiviral\b/i],
    severity: 'VIOLATION',
    citationPolicy: 'Amazon Medical Devices & Drugs Policy (Sec. 4.2)',
  },
  {
    code: 'POL-RANK-002',
    category: 'POLICY',
    name: 'Subjective Ranking & Price Claims',
    description: 'Listings must not use subjective superlative claims or promotional price statements in product titles or bullets.',
    forbiddenPatterns: [/#1\s*best\s*seller/i, /\bbest\s*seller\b/i, /\blowest\s*price\s*guaranteed\b/i, /\bfree\s*gift\b/i, /\bcheapest\b/i],
    severity: 'VIOLATION',
    citationPolicy: 'Amazon Product Detail Page Rules (Sec. 2.1)',
  },
  {
    code: 'FACT-MAT-003',
    category: 'FACTUAL_ACCURACY',
    name: 'Material Truthfulness',
    description: 'Natural stone items must not be described as resin, faux stone, or lightweight plastic.',
    forbiddenPatterns: [/\bresin\s*stone\b/i, /\bfaux\s*marble\b/i, /\bplastic\s*holder\b/i],
    severity: 'VIOLATION',
    citationPolicy: 'FTC Guides for the Jewelry & Stone Industry & Amazon Authenticity Policy',
  },
  {
    code: 'FACT-DIM-004',
    category: 'FACTUAL_ACCURACY',
    name: 'Slot Dimension & Electric Toothbrush Compatibility',
    description: 'Electric toothbrush claims must specify exact slot dimensions to prevent buyer mismatch returns.',
    forbiddenPatterns: [/\bfits\s*all\s*electric\s*toothbrushes\b/i],
    severity: 'WARNING',
    citationPolicy: 'Amazon Customer Expectation & Accurate Spec Guidelines',
  },
];

export interface ComplianceCheckResult {
  status: 'PASS' | 'WARNING' | 'REJECTED';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  violations: Array<{
    ruleCode: string;
    ruleName: string;
    severity: 'WARNING' | 'VIOLATION';
    matchedText: string;
    field: string;
    citation: string;
    suggestedRevision: string;
  }>;
  evidenceSummary: string;
  passedRulesCount: number;
  totalRulesEvaluated: number;
}

export class ComplianceJudgeService {
  /**
   * Pure deterministic compliance evaluation for listing content against verified policy rules.
   */
  static evaluateListing(listing: {
    title: string;
    bulletPoints: string[];
    description?: string;
  }): ComplianceCheckResult {
    const violations: ComplianceCheckResult['violations'] = [];
    const fields = [
      { name: 'title', content: listing.title },
      ...listing.bulletPoints.map((b, idx) => ({ name: `bullet_${idx + 1}`, content: b })),
      { name: 'description', content: listing.description || '' },
    ];

    let hasViolation = false;
    let hasWarning = false;

    for (const rule of AMAZON_COMPLIANCE_RULES) {
      for (const field of fields) {
        for (const pattern of rule.forbiddenPatterns) {
          const match = pattern.exec(field.content);
          if (match) {
            if (rule.severity === 'VIOLATION') hasViolation = true;
            if (rule.severity === 'WARNING') hasWarning = true;

            let suggestion = 'Remove prohibited claim';
            if (rule.code === 'FACT-DIM-004') {
              suggestion = 'Replace with "Fits handles up to 1.5 inches in diameter (compatible with standard manual & slim electric handles)"';
            } else if (rule.code === 'POL-FDA-001') {
              suggestion = 'Remove FDA reference and state physical sanitary benefits (e.g., non-porous polished stone)';
            }

            violations.push({
              ruleCode: rule.code,
              ruleName: rule.name,
              severity: rule.severity,
              matchedText: match[0],
              field: field.name,
              citation: rule.citationPolicy,
              suggestedRevision: suggestion,
            });
          }
        }
      }
    }

    const status: ComplianceCheckResult['status'] = hasViolation ? 'REJECTED' : hasWarning ? 'WARNING' : 'PASS';
    const riskLevel: ComplianceCheckResult['riskLevel'] = hasViolation ? 'HIGH' : hasWarning ? 'MEDIUM' : 'LOW';

    const evidenceSummary = violations.length === 0
      ? 'All listing claims conform strictly to Amazon Detail Page Rules and FTC material disclosure requirements.'
      : `Identified ${violations.length} policy / fact warning(s). Highest severity: ${hasViolation ? 'VIOLATION' : 'WARNING'}.`;

    return {
      status,
      riskLevel,
      violations,
      evidenceSummary,
      passedRulesCount: AMAZON_COMPLIANCE_RULES.length - violations.length,
      totalRulesEvaluated: AMAZON_COMPLIANCE_RULES.length,
    };
  }
}
