import type {
  CandidateDraft,
  CandidateVocSummary,
  CompetitorSnapshot,
  EnrichedProductConcept,
  PricePositioning,
} from '@crosspilot/shared';

export class ProductConceptBuilder {
  static build(params: {
    draft: CandidateDraft;
    competitors: CompetitorSnapshot[];
    voc: CandidateVocSummary;
    price: PricePositioning;
  }): EnrichedProductConcept {
    const useCase = params.voc.useCases[0]?.label || params.draft.primaryKeyword;
    const targetCustomer = params.voc.useCases.length
      ? `Shoppers with use case: ${params.voc.useCases[0].label}`
      : `Amazon shoppers searching "${params.draft.primaryKeyword}"`;

    const specifications = [];
    for (const competitor of params.competitors) {
      if (competitor.title?.source === 'FACT' && competitor.title.value) {
        specifications.push({
          name: `competitorTitle:${competitor.asin}`,
          proposedValue: competitor.title.value,
          status: 'FACT' as const,
          evidenceIds: competitor.evidenceIds,
          rationale: 'Observed competitor listing title',
        });
      }
    }
    for (const pain of params.voc.painPoints) {
      specifications.push({
        name: `addressPain:${pain.label}`,
        proposedValue: `Improve ${pain.label}`,
        status: 'HYPOTHESIS' as const,
        evidenceIds: [...pain.evidenceIds],
        rationale: 'Candidate-side response to observed VOC theme',
      });
    }

    const evidenceIds = [
      ...params.competitors.flatMap((c) => c.evidenceIds),
      ...params.voc.evidenceIds,
      ...params.price.evidenceIds,
    ];

    return {
      productType: params.draft.productType,
      targetCustomer,
      useCase,
      targetPrice: params.price.suggestedTargetPrice,
      specifications,
      evidenceIds: Array.from(new Set(evidenceIds)),
    };
  }
}
