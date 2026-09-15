import type {
  CandidateEconomicsInputs,
  EnrichedCandidate,
  EvidenceItem,
  ProductCandidate,
  ProvenanceValue,
} from '@crosspilot/shared';
import { CandidateEconomicsService } from '../candidate-economics.service.js';

export class EnrichedCandidateHandoffService {
  static toProductCandidate(
    enriched: EnrichedCandidate,
    allEvidence: EvidenceItem[] = [],
    manualInputs?: {
      targetSellingPrice?: ProvenanceValue<number>;
      productCost?: ProvenanceValue<number>;
      referralFeeRate?: ProvenanceValue<number>;
      fbaFeePerUnit?: ProvenanceValue<number>;
      freightPerUnit?: ProvenanceValue<number>;
    },
  ): ProductCandidate {
    const representativeAsin = enriched.competitors[0]?.asin;
    const allowedProductSubjects = new Set<string>([enriched.id, enriched.draftId]);
    if (representativeAsin) allowedProductSubjects.add(representativeAsin);

    const attached: EvidenceItem[] = [];
    const seen = new Set<string>();
    for (const evi of allEvidence) {
      if (!enriched.evidenceIds.includes(evi.id)) continue;
      if (seen.has(evi.id)) continue;
      if (evi.scope === 'PRODUCT' && !allowedProductSubjects.has((evi.subjectId || '').trim())) continue;
      if (evi.scope === 'CATEGORY') continue;
      seen.add(evi.id);
      attached.push(evi);
    }

    const economicsInputs: Partial<CandidateEconomicsInputs> = {};
    if (manualInputs?.targetSellingPrice) economicsInputs.sellingPrice = manualInputs.targetSellingPrice;
    else if (enriched.pricePositioning.suggestedTargetPrice) {
      economicsInputs.sellingPrice = {
        ...enriched.pricePositioning.suggestedTargetPrice,
        source: enriched.pricePositioning.suggestedTargetPrice.source === 'FACT' ? 'ESTIMATE' : enriched.pricePositioning.suggestedTargetPrice.source,
      };
    }
    if (manualInputs?.productCost) economicsInputs.productCost = manualInputs.productCost;
    if (manualInputs?.referralFeeRate) economicsInputs.referralFeeRate = manualInputs.referralFeeRate;
    if (manualInputs?.fbaFeePerUnit) economicsInputs.fbaFeePerUnit = manualInputs.fbaFeePerUnit;
    if (manualInputs?.freightPerUnit) economicsInputs.freightPerUnit = manualInputs.freightPerUnit;

    const economics = CandidateEconomicsService.calculateEconomics(economicsInputs);

    return {
      id: enriched.draftId,
      title: enriched.title,
      marketplace: enriched.marketplace,
      concept: {
        productType: enriched.concept.productType,
        targetCustomer: enriched.concept.targetCustomer,
        useCase: enriched.concept.useCase,
        targetPrice: enriched.concept.targetPrice?.value ?? undefined,
        specifications: {
          enrichment: enriched.concept.specifications || [],
        },
        differentiationHypotheses: enriched.differentiationHypotheses.map((h) => h.title),
      },
      marketResearch: {
        seedKeyword: enriched.concept.useCase,
        competitorSampleSize: enriched.competitorSample.actualSampleSize,
        representativeAsin: representativeAsin ?? null,
        evidenceIds: [...enriched.evidenceIds],
      },
      economics,
      risks: [
        {
          riskId: `risk-patent-${enriched.draftId}`,
          category: 'PATENT',
          title: 'Patent Freedom to Operate (FTO)',
          status: 'UNVERIFIED',
          severity: 'HIGH',
          evidenceIds: [],
          notes: 'Unverified: Phase 2B enrichment does not perform patent clearance.',
        },
        {
          riskId: `risk-compliance-${enriched.draftId}`,
          category: 'COMPLIANCE',
          title: 'Regulatory & Marketplace Compliance',
          status: 'UNVERIFIED',
          severity: 'MEDIUM',
          evidenceIds: [],
          notes: 'Unverified: Phase 2B enrichment does not certify compliance.',
        },
      ],
      evidence: attached,
      assumptions: [],
      missingRequirements: enriched.missingRequirements.map((field) => ({
        id: `missing-${enriched.draftId}-${field}`,
        dimension: field === 'textVoc' ? 'EVIDENCE' : 'EVIDENCE',
        field,
        description: `Missing enrichment requirement: ${field}`,
        blockingDecision: field === 'productCost' || field === 'sellingPrice',
      })),
      decision: 'NEEDS_VALIDATION',
    };
  }
}
