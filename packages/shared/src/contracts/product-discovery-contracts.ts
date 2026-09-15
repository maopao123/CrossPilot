/**
 * Product Research Phase 2A — Auto Discovery MVP Contracts
 * Single source of truth for Discovery Data Models, Graph Nodes, Clusters, Drafts, Gates, and Deduplication.
 * Conforms to PRODUCT_RESEARCH_AUTO_DISCOVERY_MVP_SPEC.md (V2.1.0).
 */

import type { ProvenanceValue, EvidenceItem } from './research-contracts.js';

export interface ProductDiscoveryRequest {
  marketplace: string;
  isDemo?: boolean;

  seed: {
    keyword: string;
    category?: string;
  };

  constraints?: {
    targetPriceMin?: number;
    targetPriceMax?: number;

    includeTerms?: string[];
    excludeTerms?: string[];

    excludeBrandTerms?: boolean;
    excludeAccessoryIntent?: boolean;
  };

  limits?: {
    maxExpandedKeywords?: number;
    maxRepresentativeAsins?: number;
    maxClusters?: number;
    maxCandidateDrafts?: number;
  };

  budget?: {
    maxProviderCalls?: number;
    maxExpensiveCalls?: number;
    maxCredits?: number;
  };

  providerPolicy?: {
    preferredProviders?: string[];
    allowFallback?: boolean;
  };
}

export const DEFAULT_DISCOVERY_LIMITS = {
  maxExpandedKeywords: 100,
  maxRepresentativeAsins: 30,
  maxClusters: 20,
  maxCandidateDrafts: 10,
} as const;

export const DEFAULT_DISCOVERY_BUDGET = {
  maxProviderCalls: 20,
  maxExpensiveCalls: 5,
  maxCredits: 20,
} as const;

export type DiscoveryRunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'DEGRADED'
  | 'INSUFFICIENT_DATA'
  | 'FAILED';

export type KeywordNodeOrigin =
  | 'SEED'
  | 'ASIN_REVERSE_LOOKUP'
  | 'KEYWORD_EXPANSION'
  | 'MANUAL';

export interface KeywordNode {
  id: string;

  rawKeyword: string;
  normalizedKeyword: string;

  marketplace: string;

  origin: KeywordNodeOrigin;

  metrics: {
    searchVolume?: ProvenanceValue<number>;
    abaRank?: ProvenanceValue<number>;
    cpc?: ProvenanceValue<number>;
    competition?: ProvenanceValue<number>;

    growth?: ProvenanceValue<number>;
    trendDirection?: ProvenanceValue<'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN'>;
  };

  representativeAsins: string[];

  evidenceIds: string[];
}

export interface AsinNode {
  asin: string;
  marketplace: string;

  title?: ProvenanceValue<string>;
  price?: ProvenanceValue<number>;
  rating?: ProvenanceValue<number>;
  reviewCount?: ProvenanceValue<number>;

  sourceKeywords: string[];

  discoveredKeywords: string[];

  evidenceIds: string[];
}

export type KeywordAsinRelation =
  | 'TOP_ASIN'
  | 'ORGANIC_KEYWORD'
  | 'AD_KEYWORD'
  | 'DISCOVERED_RELATION';

export interface KeywordAsinEdge {
  keywordId: string;
  asin: string;

  relation: KeywordAsinRelation;

  evidenceIds: string[];
}

export interface DiscoveryClusteringConfig {
  tokenSimilarityThreshold: number;
  sharedAsinJaccardThreshold: number;
  semanticSimilarityThreshold?: number;
}

export const DEFAULT_CLUSTERING_CONFIG: DiscoveryClusteringConfig = {
  tokenSimilarityThreshold: 0.45,
  sharedAsinJaccardThreshold: 0.25,
};

export interface KeywordCluster {
  id: string;

  marketplace: string;

  label: string;

  primaryKeywordId: string;

  keywordIds: string[];

  representativeAsins: string[];

  metrics: {
    demand?: ProvenanceValue<number>;
    growth?: ProvenanceValue<number>;
    competition?: ProvenanceValue<number>;
  };

  evidenceIds: string[];

  clusteringReasons: string[];

  missingFields: string[];
}

export type DiscoveryReasonCode =
  | 'DEMAND_SIGNAL'
  | 'TREND_SIGNAL'
  | 'MULTI_KEYWORD_SUPPORT'
  | 'MULTI_ASIN_SUPPORT'
  | 'COMPETITION_SIGNAL'
  | 'INTENT_DISTINCTNESS';

export interface DiscoveryReason {
  code: DiscoveryReasonCode;

  conclusion: string;

  metricIds: string[];

  evidenceIds: string[];
}

export type DiscoveryGateStatus =
  | 'PASS'
  | 'DEGRADED_PASS'
  | 'REJECT';

export type DiscoveryPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'NEEDS_DATA';

export type ProductIntent =
  | 'MAIN_PRODUCT'
  | 'ACCESSORY'
  | 'REPLACEMENT'
  | 'CONSUMABLE'
  | 'UNKNOWN';

export type CandidateDraftStatus =
  | 'DISCOVERED'
  | 'READY_FOR_ENRICHMENT'
  | 'NEEDS_MORE_DATA'
  | 'REJECTED';

export interface CandidateDraft {
  id: string;

  marketplace: string;

  title: string;
  productType: string;

  clusterId: string;

  primaryKeyword: string;
  supportingKeywords: string[];

  representativeAsins: string[];

  discoveryMetrics: {
    demand?: ProvenanceValue<number>;
    growth?: ProvenanceValue<number>;
    competition?: ProvenanceValue<number>;

    keywordCount: number;
    asinSampleSize: number;
  };

  evidenceIds: string[];

  discoveryReasons: DiscoveryReason[];

  missingRequirements: string[];

  status: CandidateDraftStatus;

  dedupKey: string;

  priorityTier?: DiscoveryPriority;
  productIntent?: ProductIntent;
  gateStatus?: DiscoveryGateStatus;
  gateReasons?: string[];
  isBrandDependent?: boolean;
}

export interface CandidateDedupResult {
  keptCandidateId: string;
  mergedCandidateIds: string[];
  reasons: string[];
}

export interface DiscoveryBudgetState {
  maxProviderCalls?: number;
  usedProviderCalls: number;

  maxCredits?: number;
  usedCredits?: number | null;

  maxExpensiveCalls?: number;
  usedExpensiveCalls: number;

  stoppedByBudget: boolean;
}

export interface ProductDiscoveryRun {
  id: string;

  request: ProductDiscoveryRequest;

  status: DiscoveryRunStatus;

  seedKeyword: string;

  keywordNodes: KeywordNode[];
  asinNodes: AsinNode[];
  edges?: KeywordAsinEdge[];

  clusters: KeywordCluster[];

  candidateDrafts: CandidateDraft[];

  evidence: EvidenceItem[];

  missingCapabilities: string[];

  budgetUsage: {
    providerCalls: number;
    credits?: number | null;
    expensiveCalls: number;
    stoppedByBudget?: boolean;
  };

  stats: {
    keywordsReceived: number;
    keywordsAccepted: number;
    keywordsDeduplicated: number;

    asinsReceived: number;
    asinsAccepted: number;

    clustersCreated: number;

    candidateDraftsCreated: number;
    candidateDraftsRejected: number;
  };
}

export interface DiscoveryDryRunPreview {
  plannedCapabilities: string[];
  estimatedCallCount: number;
  knownCreditCost: number | null;
  unknownCostFields: string[];
}
