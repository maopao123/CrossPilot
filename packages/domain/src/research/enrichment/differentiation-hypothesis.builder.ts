import type {
  CandidateVocSummary,
  CompetitorSnapshot,
  DifferentiationHypothesis,
  PricePositioning,
} from '@crosspilot/shared';

export class DifferentiationHypothesisBuilder {
  static build(params: {
    voc: CandidateVocSummary;
    competitors: CompetitorSnapshot[];
    price: PricePositioning;
  }): DifferentiationHypothesis[] {
    const asins = params.competitors.map((c) => c.asin);
    const hyps: DifferentiationHypothesis[] = [];

    params.voc.painPoints.forEach((pain, index) => {
      const hasEvidence = pain.evidenceIds.length > 0;
      hyps.push({
        id: `diff-pain-${index}-${pain.id}`,
        title: `Address ${pain.label}`,
        description: `Differentiate by solving observed theme "${pain.label}".`,
        basedOn: 'PAIN_POINT',
        evidenceIds: [...pain.evidenceIds],
        affectedCompetitorAsins: [...asins],
        confidence: hasEvidence ? 'MEDIUM' : 'LOW',
        validationRequired: !hasEvidence,
      });
    });

    params.voc.desiredFeatures.forEach((feat, index) => {
      const hasEvidence = feat.evidenceIds.length > 0;
      hyps.push({
        id: `diff-feat-${index}-${feat.id}`,
        title: `Offer ${feat.label}`,
        description: `Differentiate via desired feature "${feat.label}".`,
        basedOn: 'DESIRED_FEATURE',
        evidenceIds: [...feat.evidenceIds],
        affectedCompetitorAsins: [...asins],
        confidence: hasEvidence ? 'MEDIUM' : 'LOW',
        validationRequired: !hasEvidence,
      });
    });

    if (hyps.length === 0) {
      hyps.push({
        id: 'diff-unvalidated-gap',
        title: 'Validate differentiation against representative competitors',
        description: 'No text VOC themes were available; differentiation remains a hypothesis pending evidence.',
        basedOn: 'COMPETITOR_GAP',
        evidenceIds: [],
        affectedCompetitorAsins: [...asins],
        confidence: 'LOW',
        validationRequired: true,
      });
    }

    return hyps;
  }
}
