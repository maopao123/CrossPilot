/**
 * Candidate Handoff Service for Product Research Auto Discovery MVP
 * Transforms CandidateDraft into ProductCandidate skeleton for V2 Frozen Pipeline.
 * Strictly adheres to Case 15 & 16: Empty economics -> UNKNOWN, risks -> UNVERIFIED, decision -> NEEDS_VALIDATION.
 */

import type {
  CandidateDraft,
  ProductCandidate,
  EvidenceItem,
  CandidateEconomics,
  CandidateRisk,
} from '@crosspilot/shared';

export class CandidateHandoffService {
  /**
   * Converts a CandidateDraft to a ProductCandidate skeleton ready for V2 Frozen Pipeline.
   * Auto Discovery DOES NOT fabricate supplier costs, quotes, or patent reviews.
   */
  static toProductCandidate(
    draft: CandidateDraft,
    allEvidence: EvidenceItem[] = [],
    category = 'Home & Kitchen',
  ): ProductCandidate {
    const primaryAsin = draft.representativeAsins[0];
    const candidateAsin = primaryAsin || undefined;

    // Map attached evidence items truthfully:
    // 1. Never fabricate fake stub evidence.
    // 2. Evidence once captured is strictly immutable (do NOT mutate subjectId).
    // 3. PRODUCT evidence is only attached if subjectId matches candidateId or candidateAsin.
    const attachedEvidence: EvidenceItem[] = [];
    const attachedIds = new Set<string>();

    for (const e of allEvidence) {
      if (!draft.evidenceIds.includes(e.id)) continue;
      if (attachedIds.has(e.id)) continue;

      if (e.scope === 'PRODUCT') {
        const sub = (e.subjectId || '').trim();
        const matchesCandidate = sub === draft.id || (candidateAsin && sub === candidateAsin);
        if (!matchesCandidate) {
          // Evidence belongs to another competitor ASIN in the cluster;
          // do NOT rewrite subjectId or inject into this candidate's product evidence.
          continue;
        }
      }

      attachedIds.add(e.id);
      attachedEvidence.push(e);
    }

    // Economics: Empty & Truthful UNKNOWN (Spec §36 & Case 15)
    const economics: CandidateEconomics = {
      status: 'INCOMPLETE',
      currency: 'USD',
      inputs: {
        sellingPrice: { value: null, source: 'UNKNOWN' },
        productCost: { value: null, source: 'UNKNOWN' },
        referralFeeRate: { value: null, source: 'UNKNOWN' },
        fbaFeePerUnit: { value: null, source: 'UNKNOWN' },
        freightPerUnit: { value: null, source: 'UNKNOWN' },
        dutyPerUnit: { value: null, source: 'UNKNOWN' },
        adsCostPerUnit: { value: null, source: 'UNKNOWN' },
        returnRate: { value: null, source: 'UNKNOWN' },
        returnLossPerUnit: { value: null, source: 'UNKNOWN' },
        storageFeePerUnit: { value: null, source: 'UNKNOWN' },
        otherCostsPerUnit: { value: null, source: 'UNKNOWN' },
      },
      scenarios: {
        base: {
          sellingPrice: 0,
          productCost: 0,
          amazonReferralFee: 0,
          fbaFee: 0,
          freight: 0,
          duty: 0,
          advertisingCost: 0,
          expectedReturnLoss: 0,
          storage: 0,
          otherCosts: 0,
          totalExpenses: 0,
          contributionProfit: 0,
          contributionMargin: 0,
        },
        conservative: {
          sellingPrice: 0,
          productCost: 0,
          amazonReferralFee: 0,
          fbaFee: 0,
          freight: 0,
          duty: 0,
          advertisingCost: 0,
          expectedReturnLoss: 0,
          storage: 0,
          otherCosts: 0,
          totalExpenses: 0,
          contributionProfit: 0,
          contributionMargin: 0,
        },
        optimistic: {
          sellingPrice: 0,
          productCost: 0,
          amazonReferralFee: 0,
          fbaFee: 0,
          freight: 0,
          duty: 0,
          advertisingCost: 0,
          expectedReturnLoss: 0,
          storage: 0,
          otherCosts: 0,
          totalExpenses: 0,
          contributionProfit: 0,
          contributionMargin: 0,
        },
      },
      missingInputs: ['sellingPrice', 'productCost', 'referralFeeRate', 'fbaFeePerUnit', 'freightPerUnit'],
      criticalInputs: ['sellingPrice', 'productCost', 'referralFeeRate', 'fbaFeePerUnit', 'freightPerUnit'],
    };

    // Risks: Truthful UNVERIFIED (Spec §37 & Case 16: Auto Discovery NEVER marks PASS)
    const risks: CandidateRisk[] = [
      {
        riskId: `risk-patent-${draft.id}`,
        category: 'PATENT',
        title: 'Patent Freedom to Operate (FTO)',
        status: 'UNVERIFIED',
        severity: 'HIGH',
        evidenceIds: [],
        notes: 'Unverified: Phase 2A discovery does not perform automatic patent clearance.',
      },
      {
        riskId: `risk-compliance-${draft.id}`,
        category: 'COMPLIANCE',
        title: 'Regulatory & Marketplace Compliance',
        status: 'UNVERIFIED',
        severity: 'MEDIUM',
        evidenceIds: [],
        notes: 'Unverified: Safety certifications and marketplace compliance required prior to shortlist.',
      },
    ];

    return {
      id: draft.id,
      title: draft.title,
      marketplace: draft.marketplace,
      category,
      concept: {
        productType: draft.productType,
        targetCustomer: 'Amazon Shopper',
        useCase: draft.primaryKeyword,
        specifications: {
          seedKeyword: draft.primaryKeyword,
          supportingKeywords: draft.supportingKeywords,
        },
        differentiationHypotheses: draft.discoveryReasons.map((r) => r.conclusion),
      },
      marketResearch: {
        seedKeyword: draft.primaryKeyword,
        searchVolumeMonthly: draft.discoveryMetrics.demand?.value ?? null,
        competitiveDifficulty: draft.discoveryMetrics.competition?.value ?? null,
        competitorSampleSize: draft.discoveryMetrics.asinSampleSize,
        representativeAsin: draft.representativeAsins[0] ?? null,
        evidenceIds: [...draft.evidenceIds],
      },
      economics,
      risks,
      evidence: attachedEvidence,
      assumptions: [],
      missingRequirements: [
        {
          id: `missing-econ-${draft.id}`,
          dimension: 'ECONOMICS',
          field: 'productCost',
          description: 'Product cost requires quotation or manual assumption before economics validation',
          blockingDecision: true,
        },
      ],
      decision: 'NEEDS_VALIDATION',
      decisionDetail: {
        verdict: 'NEEDS_VALIDATION',
        reasons: ['Candidate draft handed off from Auto Discovery. Economics and risks require verification.'],
        evidenceCoverageHeuristic: 0.4,
        hardRiskGatePassed: false,
        economicsGatePassed: false,
        evaluatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Convert multiple drafts (e.g. top 3-5 candidates)
   */
  static handoffToV2(
    drafts: CandidateDraft[],
    allEvidence: EvidenceItem[] = [],
    category?: string,
  ): ProductCandidate[] {
    return drafts.map((draft) => this.toProductCandidate(draft, allEvidence, category));
  }
}
