import type {
  CandidateDraft,
  DifferentiationHypothesis,
  EnrichedProductConcept,
  EnrichmentGateResult,
  PricePositioning,
  CompetitorSnapshot,
  EvidenceItem,
} from '@crosspilot/shared';
import { CandidateEvidenceValidator } from '../candidate-evidence-validator.js';

export class EnrichmentGate {
  static evaluate(params: {
    draft: CandidateDraft;
    competitors: CompetitorSnapshot[];
    price: PricePositioning;
    concept: EnrichedProductConcept;
    hypotheses: DifferentiationHypothesis[];
    evidence: EvidenceItem[];
    vocUnavailable: boolean;
    contamination: boolean;
  }): EnrichmentGateResult {
    const reasons: string[] = [];

    if (!params.draft?.id || !params.draft.title || !params.draft.productType) {
      reasons.push('Candidate Draft is incomplete');
    }
    if (params.competitors.length < 1) {
      reasons.push('No valid representative competitor retrieved');
    }

    const hasDemand =
      params.draft.discoveryMetrics?.demand?.value != null ||
      params.evidence.some((e) => e.scope === 'KEYWORD' || e.scope === 'MARKET');
    if (!hasDemand) reasons.push('No real market / demand evidence');

    if (params.contamination) {
      reasons.push('Cross-subject evidence contamination detected');
    }

    if (!params.concept.productType || !params.concept.useCase) {
      reasons.push('Product concept missing productType/useCase');
    }

    const conceptOnlyLlm =
      (params.concept.specifications || []).every((s) => s.status !== 'FACT') && params.competitors.length === 0;
    if (conceptOnlyLlm) {
      reasons.push('Concept is unconstrained LLM generation without competitor facts');
    }

    const hypOk = params.hypotheses.every((h) => h.evidenceIds.length > 0 || h.validationRequired);
    if (!hypOk) reasons.push('Differentiation hypothesis missing evidence and validationRequired');

    if (params.price.sampleSize === 0 && params.price.positioning !== 'UNKNOWN') {
      reasons.push('Price positioning claimed without sample');
    }

    const blocking = reasons.filter((r) =>
      r.includes('incomplete') ||
      r.includes('No valid representative') ||
      r.includes('contamination') ||
      r.includes('unconstrained LLM') ||
      r.includes('No real market'),
    );

    if (blocking.length > 0 || reasons.includes('Candidate Draft is incomplete') || params.competitors.length < 1) {
      return { status: 'INSUFFICIENT_DATA', reasons };
    }

    if (params.vocUnavailable) {
      reasons.push('Text VOC unavailable; enrichment is degraded');
      return { status: 'DEGRADED_READY', reasons };
    }

    if (reasons.length > 0) {
      return { status: 'DEGRADED_READY', reasons };
    }

    return { status: 'READY_FOR_HANDOFF', reasons: ['Enrichment meets handoff minimums'] };
  }

  static hasContamination(candidateId: string, representativeAsin: string | undefined, evidence: EvidenceItem[]): boolean {
    const result = CandidateEvidenceValidator.validateCandidateEvidence(candidateId, representativeAsin, evidence);
    return result.violations.some((v) => v.reason.includes('Cross-candidate'));
  }
}
