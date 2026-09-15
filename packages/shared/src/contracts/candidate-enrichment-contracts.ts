/**
 * Product Research Phase 2B — Candidate Enrichment Contracts
 * Conforms to PRODUCT_RESEARCH_CANDIDATE_ENRICHMENT_V2_2_SPEC.md
 */

import type { CandidateDraft } from './product-discovery-contracts.js';
import type {
  EvidenceItem,
  EvidenceScope,
  ProvenanceValue,
  VocAnalysisScopeType,
  VocItemScope,
} from './research-contracts.js';

export const DEFAULT_ENRICHMENT_BUDGET = {
  maxProviderCalls: 20,
  maxExpensiveCalls: 3,
  maxCredits: 20,
} as const;

export const DEFAULT_MAX_COMPETITORS = 3;
export const HARD_MAX_COMPETITORS = 5;

export interface CandidateEnrichmentRequest {
  draft: CandidateDraft;
  marketplace: string;

  options?: {
    maxCompetitors?: number;
    enableProductTrend?: boolean;
    enableReviewHealth?: boolean;
    enableTextVoc?: boolean;
  };

  budget?: {
    maxProviderCalls?: number;
    maxCredits?: number;
    maxExpensiveCalls?: number;
  };

  manualInputs?: {
    targetSellingPrice?: ProvenanceValue<number>;
    productCost?: ProvenanceValue<number>;
    referralFeeRate?: ProvenanceValue<number>;
    fbaFeePerUnit?: ProvenanceValue<number>;
    freightPerUnit?: ProvenanceValue<number>;
  };

  extraEvidence?: EvidenceItem[];
}

export interface CompetitorSnapshot {
  asin: string;
  title?: ProvenanceValue<string>;
  price?: ProvenanceValue<number>;
  rating?: ProvenanceValue<number>;
  reviewCount?: ProvenanceValue<number>;
  trend?: {
    direction?: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';
    evidenceIds: string[];
  };
  sourceKeywordIds: string[];
  evidenceIds: string[];
}



export type VocThemeScope = EvidenceScope | VocAnalysisScopeType | VocItemScope | 'UNKNOWN';

export interface VocTheme {
  id: string;
  label: string;
  observationCount?: number | null;
  denominator?: number | null;
  percentage?: number | null;
  scope: VocThemeScope;
  subjectIds: string[];
  evidenceIds: string[];
  confidence?: number;
}

export type EnrichmentVocSourceType =
  | 'AMAZON_REVIEW_VOC'
  | 'EXTERNAL_VOC'
  | 'MIXED'
  | 'UNAVAILABLE';

export interface CandidateVocSummary {
  sourceType: EnrichmentVocSourceType;
  analyzedItemCount: number | null;
  painPoints: VocTheme[];
  praisePoints: VocTheme[];
  useCases: VocTheme[];
  desiredFeatures: VocTheme[];
  questions: VocTheme[];
  evidenceIds: string[];
  missingDimensions: string[];
}

export interface PricePositioning {
  sampleSize: number;
  observedPrices: Array<{
    asin: string;
    price: number;
    evidenceId: string;
  }>;
  min?: number | null;
  median?: number | null;
  max?: number | null;
  suggestedTargetPrice?: ProvenanceValue<number>;
  positioning: 'VALUE' | 'MAINSTREAM' | 'PREMIUM' | 'UNKNOWN';
  evidenceIds: string[];
}

export interface EnrichedSpecification {
  name: string;
  proposedValue: unknown;
  status: 'FACT' | 'HYPOTHESIS' | 'USER_INPUT';
  evidenceIds: string[];
  rationale?: string;
}

export interface EnrichedProductConcept {
  productType: string;
  targetCustomer?: string;
  useCase?: string;
  targetPrice?: ProvenanceValue<number>;
  specifications?: EnrichedSpecification[];
  evidenceIds: string[];
}

export interface DifferentiationHypothesis {
  id: string;
  title: string;
  description: string;
  basedOn: 'PAIN_POINT' | 'USE_CASE' | 'PRICE_GAP' | 'COMPETITOR_GAP' | 'DESIRED_FEATURE';
  evidenceIds: string[];
  affectedCompetitorAsins: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  validationRequired: boolean;
}

export type EnrichmentGateStatus = 'READY_FOR_HANDOFF' | 'DEGRADED_READY' | 'INSUFFICIENT_DATA';

export interface EnrichmentGateResult {
  status: EnrichmentGateStatus;
  reasons: string[];
}

export interface EnrichmentBudgetUsage {
  providerCalls: number;
  credits?: number | null;
  expensiveCalls: number;
  stoppedByBudget: boolean;
}

export interface CompetitorSampleTruth {
  requestedSampleSize: number;
  actualSampleSize: number;
}

export interface EnrichedCandidate {
  id: string;
  draftId: string;
  marketplace: string;
  title: string;
  productType: string;
  competitors: CompetitorSnapshot[];
  competitorSample: CompetitorSampleTruth;
  voc: CandidateVocSummary;
  pricePositioning: PricePositioning;
  concept: EnrichedProductConcept;
  differentiationHypotheses: DifferentiationHypothesis[];
  evidenceIds: string[];
  missingRequirements: string[];
  gate: EnrichmentGateResult;
  budgetUsage: EnrichmentBudgetUsage;
}

export type EnrichmentRunStatus = 'COMPLETED' | 'DEGRADED' | 'INSUFFICIENT_DATA' | 'FAILED';

export interface CandidateEnrichmentRun {
  id: string;
  request: CandidateEnrichmentRequest;
  status: EnrichmentRunStatus;
  enriched: EnrichedCandidate;
  evidence: EvidenceItem[];
  missingCapabilities: string[];
}
