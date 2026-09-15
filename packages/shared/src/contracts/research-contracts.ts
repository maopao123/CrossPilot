/**
 * Normalized Research Contracts for CrossPilot V9
 * Single source of truth for market data domain models.
 * Strictly decoupled from third-party vendor DTOs (e.g. XYDC, SellerSprite, Keepa).
 */

export interface MarketProduct {
  source: string;
  marketplace: string;
  externalId: string;
  asin?: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  price?: number | null;
  monthlySales?: number | null;
  monthlyRevenue?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  bsr?: number | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  capturedAt: string;
  rawRef?: string;
}

export type MarketMetricType =
  | 'AVG_PRICE'
  | 'COMPETITOR_COUNT'
  | 'SEARCH_VOLUME'
  | 'SALES'
  | 'REVENUE'
  | 'BSR'
  | 'OPPORTUNITY_SCORE'
  | 'COMPETITION_SCORE'
  | 'OTHER';

export interface MarketMetric {
  source: string;
  marketplace: string;
  metric: MarketMetricType;
  value: number | null;
  unit?: string | null;
  capturedAt: string;
}

export interface KeywordMetric {
  source: string;
  marketplace: string;
  keyword: string;
  searchVolume?: number | null;
  competition?: number | null;
  relevance?: number | null;
  growth?: string | null;
  cpc?: number | null;
  abaRank?: number | null;
  topAsins?: string[] | null;
  capturedAt: string;
}

export type TrendMetricType =
  | 'PRICE'
  | 'SALES'
  | 'REVENUE'
  | 'BSR'
  | 'SEARCH_INTEREST'
  | 'RATING'
  | 'REVIEW_COUNT';

export type TrendDirection =
  | 'IMPROVED'
  | 'DECLINED'
  | 'STABLE'
  | 'PRICE_UP'
  | 'PRICE_DOWN'
  | 'RANK_IMPROVED'
  | 'RANK_DECLINED'
  | 'RATING_IMPROVED'
  | 'RATING_DECLINED'
  | 'REVIEWS_INCREASED'
  | 'REVIEWS_DECREASED'
  | 'NEUTRAL';

export interface TrendSummary {
  startValue: number | null;
  endValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  averageValue: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  direction: TrendDirection;
}

export interface MarketTrend {
  source: string;
  marketplace: string;
  subjectId?: string | null;
  metric: TrendMetricType;
  points: Array<{
    date: string;
    value: number | null;
  }>;
  summary?: TrendSummary;
  metadata?: Record<string, any>;
}

export type EvidenceSourceMode = 'LIVE' | 'CACHED' | 'MOCK' | 'DEGRADED';

export type ProviderTransportType = 'MCP' | 'HTTP' | 'NATIVE' | 'RPA';

export type EvidenceType =
  | 'MARKET_PRODUCT'
  | 'MARKET_METRIC'
  | 'KEYWORD'
  | 'TREND'
  | 'VOC'
  | 'REVIEW_METRIC'
  | 'AMAZON_REVIEW_VOC'
  | 'EXTERNAL_VOC'
  | 'KNOWLEDGE_AUTHORITY'
  | 'KNOWLEDGE_OPTIMIZATION'
  | 'KNOWLEDGE_INTENT'
  | 'OTHER';

export interface ResearchEvidence {
  evidenceId: string;
  source: string;
  providerId: string;
  transport?: ProviderTransportType | string;
  type: EvidenceType;
  scope?: EvidenceScope;
  subjectId?: string;
  sourceId?: string;
  title?: string;
  content: string;
  capturedAt: string;
  mode: EvidenceSourceMode;
  costCredits?: number;
  executionTimeMs?: number;
  confidenceScore?: number;
  metadata?: Record<string, unknown>;
}

export interface MarketOverviewSnapshot {
  seedKeyword: string;
  category: string | null;
  marketplace: string;
  searchVolumeMonthly: number | null;
  avgPrice: number | null;
  avgRating: number | null;
  avgReviewCount: number | null;
  competitorCount: number | null;
  opportunityScore: number | null;
  competitionScore: number | null;
  trendingKeywords: Array<{ keyword: string; volume: number | null; growth?: string | null }>;
  topProducts?: MarketProduct[];
  evidence?: ResearchEvidence[];
  source: string;
  mode: EvidenceSourceMode;
  capturedAt: string;
}

export interface CompositeProductSearchResult {
  query: {
    keyword: string;
    marketplace?: string;
  };
  keywordMetric: KeywordMetric | null;
  products: MarketProduct[];
  evidence: ResearchEvidence[];
  provider: {
    providerId: string;
    transport: string;
    mode: EvidenceSourceMode;
  };
}

export type VocSourceType =
  | 'AMAZON_REVIEW'
  | 'REDDIT'
  | 'YOUTUBE'
  | 'FORUM'
  | 'SOCIAL'
  | 'REVIEWS'
  | 'WEB'
  | 'OTHER';

export type VocContentKind =
  | 'FULL_TEXT'
  | 'COMMENT'
  | 'REVIEW'
  | 'TRANSCRIPT'
  | 'SEARCH_SNIPPET'
  | 'UNKNOWN';

export interface RawTextItem {
  sourceId: string;
  sourceType: VocSourceType | string;
  contentKind?: VocContentKind;
  text: string;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}

export type VocItemScope = 'EXACT_PRODUCT' | 'BRAND_PRODUCT' | 'CATEGORY' | 'GENERIC';

export type VocAnalysisScopeType = 'PRODUCT' | 'PRODUCT_PLUS_CATEGORY' | 'CATEGORY';

export interface VocAnalysisScope {
  type: VocAnalysisScopeType;
  targetAsin?: string;
  query?: string;
  totalAnalyzedItems: number;
  exactProductItems: number;
  brandProductItems: number;
  categoryItems: number;
  genericItems: number;
  uniqueSourcePages: number;
  knownAuthorCount: number;
  unknownAuthorCount: number;
  uniqueKnownAuthors: number;
  /** @deprecated Kept for backwards compatibility */
  uniqueAuthors?: number;
  searchSnippetCount?: number;
  fullTextCount?: number;
  sourceDistribution?: Record<string, number>;
  domainDistribution?: Record<string, number>;
}

export interface VocEvidenceQuote {
  quoteText: string;
  reviewDate?: string | null;
  rating?: number | null;
  reviewer?: string | null;
  url?: string | null;
  sourceType?: string | null;
  scope?: VocItemScope;
}

export interface VocPainPoint {
  topic: string;
  category?: string | null;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: VocItemScope | VocAnalysisScopeType;
  denominatorText?: string | null;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  quotes: VocEvidenceQuote[];
  evidenceIds?: string[];
}

export interface VocPraisePoint {
  topic: string;
  category?: string | null;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: VocItemScope | VocAnalysisScopeType;
  denominatorText?: string | null;
  quotes: VocEvidenceQuote[];
  evidenceIds?: string[];
}

export interface VocBuyerMotivation {
  motivation: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: VocItemScope | VocAnalysisScopeType;
  denominatorText?: string | null;
  quotes?: string[];
  evidenceIds?: string[];
}

export interface VocUseCase {
  useCase: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: VocItemScope | VocAnalysisScopeType;
  denominatorText?: string | null;
  quotes?: VocEvidenceQuote[];
  evidenceIds?: string[];
}

export interface VocQuestion {
  question: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: VocItemScope | VocAnalysisScopeType;
  denominatorText?: string | null;
  quotes?: VocEvidenceQuote[];
  evidenceIds?: string[];
}

export interface VocDesiredFeature {
  feature: string;
  frequency?: number | null;
  percentage?: number | null;
  sampleSize?: number | null;
  scope?: VocItemScope | VocAnalysisScopeType;
  denominatorText?: string | null;
  quotes?: VocEvidenceQuote[];
  evidenceIds?: string[];
}

/**
 * Product Review Health Contract
 * Represents high-level quantitative review & rating metrics (stars, total ratings, rating distribution)
 * explicitly decoupled from NLP text mining (pain points, praise points, quotes).
 */
export interface ProductReviewHealthResult {
  asin: string;
  marketplace: string;
  averageRating: number | null;
  totalReviewCount: number | null;
  analyzedReviewCount: number | null; // 0 or null when provider lacks single-ASIN review text mining
  ratingDistribution?: Record<string, number> | null;
  summary: string;
  supportedDimensions: string[];
  unsupportedDimensions: string[];
  evidenceNotice: string;
  evidence?: ResearchEvidence[];
}

/**
 * Full Text-level VOC Analysis Contract
 * Represents deep NLP analysis on raw buyer reviews / discussions (pain points, praise points, buyer motivations, use cases).
 * Providers that only supply stars & total ratings must NOT claim full LIVE support.
 */
export interface VocProductAnalysisResult {
  asin: string;
  marketplace: string;
  vocSourceType?: 'AMAZON_REVIEW_VOC' | 'EXTERNAL_VOC';
  analysisScope?: VocAnalysisScope;
  totalReviewCount: number | null;
  analyzedReviewCount: number | null;
  /** @deprecated Use totalReviewCount instead. Kept only for backward compatibility */
  totalReviewsAnalyzed?: number | null;
  averageRating: number | null;
  ratingDistribution?: Record<string, number> | null;
  painPoints: VocPainPoint[];
  praisePoints: VocPraisePoint[];
  buyerMotivations: VocBuyerMotivation[];
  useCases?: VocUseCase[];
  questions?: VocQuestion[];
  desiredFeatures?: VocDesiredFeature[];
  rawTexts?: RawTextItem[];
  summary: string;
  evidenceNotice: string;
  supportedDimensions?: string[];
  unsupportedDimensions?: string[];
  evidence?: ResearchEvidence[];
}

/**
 * Phase 7: Product Research Decision Layer Models
 */

export type EvidenceGateStatus = 'SUFFICIENT' | 'DEGRADED_PASS' | 'INSUFFICIENT';

export type SignalStatus = 'AVAILABLE' | 'PARTIAL' | 'MISSING';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type FactBoundaryLevel = 'FACT' | 'SIGNAL' | 'INFERENCE' | 'RECOMMENDATION';

export interface StructuredFact {
  code: string;
  level: FactBoundaryLevel;
  statement: string;
  evidenceIds: string[];
  metricName?: string;
  metricValue?: number | string | null;
}

export interface DemandSignalMetrics {
  weeklySearchVolume: number | null;
  abaRank: number | null;
  volumeGrowth?: string | null;
}

export interface CompetitionSignalMetrics {
  competitiveDifficulty: number | null; // 0-100 (higher means stronger barrier)
  topAsinsCount: number | null;
  topAsinAvgReviews: number | null;
  topAsinAvgRating: number | null;
  cpc: number | null;
}

export interface CommercialSignalMetrics {
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  priceStability: 'STABLE' | 'VOLATILE' | 'UNKNOWN';
}

export interface TrendSignalMetrics {
  bsrDirection: TrendDirection | null;
  priceDirection: TrendDirection | null;
  ratingDirection: TrendDirection | null;
  reviewGrowthDirection: TrendDirection | null;
  bsrChangeAbsolute?: number | null;
}

export interface ReviewHealthSignalMetrics {
  averageRating: number | null;
  totalReviewCount: number | null;
  ratingHealthStatus: 'STRONG' | 'MODERATE' | 'WEAK' | 'UNKNOWN';
}

export interface VocOpportunitySignalMetrics {
  painPointCount: number;
  topPainPointFrequency: number;
  topPainPointPercentage: number;
  desiredFeaturesCount: number;
  scope: VocAnalysisScopeType;
  contentKind: VocContentKind;
  sampleSize: number;
}

export type SignalScope =
  | 'KEYWORD_MARKET'
  | 'TOP_PRODUCTS'
  | 'REPRESENTATIVE_PRODUCT'
  | 'CATEGORY_EXTERNAL_VOC';

export type OpportunityScoreMethodology = 'HEURISTIC';

export type ScoreCalibrationStatus = 'UNCALIBRATED' | 'CALIBRATED';

export interface OpportunityScopeDisclosure {
  decisionScope: 'KEYWORD_CATEGORY_OPPORTUNITY';
  representativeAsin: string | null;
  keyword: string;
  marketplace: string;
  productSampleSize: number;
  trendSampleSize: number;
  vocScope: VocAnalysisScopeType;
  vocContentKind: VocContentKind;
  vocSampleSize: number;
  targetEntityNotice: string;
}

export interface OpportunityScoreConfig {
  scoreConfigVersion: string;
  weights: {
    demand: number;
    competition: number;
    commercial: number;
    trend: number;
    reviewHealth: number;
    voc: number;
  };
  gate: {
    sufficientMinSignals: number;
    degradedMinSignals: number;
    criticalSignals: Array<'demand' | 'competition'>;
  };
  demand: {
    volumeBrackets: Array<{ min: number; max: number | null; baseScore: number; maxScore: number }>;
    abaRankTiers: Array<{ maxRank: number; bonus: number; description: string }>;
    abaRankPenalty: { minRank: number; penalty: number; description: string };
  };
  competition: {
    reviewBrackets: Array<{ min: number; max: number; difficulty: number; description: string }>;
    cpcTiers: {
      highThreshold: number;
      highPenalty: number;
      lowThreshold: number;
      lowBonus: number;
    };
  };
  commercial: {
    priceBands: Array<{ min: number; max: number; baseScore: number; description: string }>;
    stablePriceSpreadRatio: number;
    stablePriceBonus: number;
  };
  trend: {
    bsrImprovedBonus: number;
    bsrDeclinedPenalty: number;
    bsrStableBonus: number;
  };
  reviewHealth: {
    ratingBands: Array<{ min: number; max: number; baseScore: number; status: 'STRONG' | 'MODERATE' | 'WEAK'; description: string }>;
  };
  voc: {
    topPainPointHighThreshold: number;
    topPainPointHighBonus: number;
    topPainPointMediumThreshold: number;
    topPainPointMediumBonus: number;
    desiredFeatureMultiplier: number;
    maxDesiredFeatureBonus: number;
    searchSnippetConfidenceCap: number;
    smallSampleThreshold: number;
    smallSampleConfidencePenalty: number;
  };
}

export interface MarketSignal<TMetrics = Record<string, any>> {
  signalId: 'demand' | 'competition' | 'commercial' | 'trend' | 'reviewHealth' | 'voc';
  label: string;
  status: SignalStatus;
  scope: SignalScope;
  subjectId?: string;
  sampleSize?: number;
  representativeAsin?: string;
  rawMetrics: TMetrics;
  normalizedScore: number | null; // 0 - 100, or null if MISSING
  weight: number; // Effective normalized weight
  contribution: number | null; // normalizedScore * weight
  confidence: number; // 0.0 - 1.0
  evidenceIds: string[];
  findings: string[];
  capturedAt?: string;
}

export interface OpportunityExplanation {
  summary: string;
  demandAnalysis: string;
  competitionAnalysis: string;
  differentiationOpportunity: string;
  actionableRecommendations: string[];
}

export interface ResearchCostBudget {
  xydcCredits: number;
  firecrawlCredits: number;
  totalRequests: number;
  cacheHits: number;
  estimatedCostUsd: number | null; // Null if no verified live pricing contract/API is available
  costDisclaimer?: string;
}

export interface ProductOpportunity {
  opportunityId: string;
  keyword: string;
  marketplace: string;
  representativeAsin?: string;
  overallScore: number | null;
  scoreVersion: string;
  scoreConfigVersion: string;
  methodology: OpportunityScoreMethodology;
  calibrationStatus: ScoreCalibrationStatus;
  decisionScope: 'KEYWORD_CATEGORY_OPPORTUNITY';
  methodologyDisclaimer: string;
  scopeDisclosure: OpportunityScopeDisclosure;
  evidenceStatus: EvidenceGateStatus;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  signals: {
    demand: MarketSignal<DemandSignalMetrics>;
    competition: MarketSignal<CompetitionSignalMetrics>;
    commercial: MarketSignal<CommercialSignalMetrics>;
    trend: MarketSignal<TrendSignalMetrics>;
    reviewHealth: MarketSignal<ReviewHealthSignalMetrics>;
    voc: MarketSignal<VocOpportunitySignalMetrics>;
  };
  weights: Record<string, number>;
  strengths: StructuredFact[];
  risks: StructuredFact[];
  opportunities: StructuredFact[];
  missingSignals: string[];
  evidenceIds: string[];
  explanation: OpportunityExplanation;
  costBudget: ResearchCostBudget;
  createdAt: string;
}

/**
 * ============================================================================
 * Product Research V2 MVP Contracts (Candidate Comparison & Truthfulness)
 * ============================================================================
 */

export type EvidenceScope = 'PRODUCT' | 'KEYWORD' | 'CATEGORY' | 'MARKET';

export interface EvidenceItem {
  id: string;
  scope: EvidenceScope;
  subjectId: string;
  source: string;
  content: string;
  sourceUrl?: string;
  capturedAt?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export type ValueSource = 'FACT' | 'ESTIMATE' | 'ASSUMPTION' | 'UNKNOWN';

export interface ProvenanceValue<T = number> {
  value: T | null;
  source: ValueSource;
  basis?: string;
  evidenceId?: string;
  assumptionId?: string;
}

export interface Assumption {
  id: string;
  field: string;
  description: string;
  assumedValue: unknown;
  sourceReason: string;
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  validated: boolean;
}

export interface MissingRequirement {
  id: string;
  dimension: 'ECONOMICS' | 'RISK' | 'SPECIFICATION' | 'SUPPLIER' | 'EVIDENCE';
  field: string;
  description: string;
  blockingDecision: boolean;
}

export type RiskStatus = 'UNVERIFIED' | 'PASS' | 'FAIL';

export interface CandidateRisk {
  riskId: string;
  category: 'PATENT' | 'COMPLIANCE' | 'QUALITY' | 'SUPPLY_CHAIN' | 'COMPETITION' | 'OTHER';
  title: string;
  status: RiskStatus;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceIds: string[];
  notes?: string;
}

export interface ScenarioEconomicsResult {
  sellingPrice: number;
  productCost: number;
  amazonReferralFee: number;
  fbaFee: number;
  freight: number;
  duty: number;
  advertisingCost: number;
  expectedReturnLoss: number;
  storage: number;
  otherCosts: number;
  totalExpenses: number;
  contributionProfit: number;
  contributionMargin: number; // e.g. 0.235 -> 23.5%
}

export type CandidateEconomicsStatus = 'COMPLETE' | 'NEEDS_VALIDATION' | 'INCOMPLETE';

export interface CandidateEconomicsInputs {
  sellingPrice: ProvenanceValue<number>;
  productCost: ProvenanceValue<number>;
  referralFeeRate: ProvenanceValue<number>;
  fbaFeePerUnit: ProvenanceValue<number>;
  freightPerUnit: ProvenanceValue<number>;
  dutyPerUnit: ProvenanceValue<number>;
  adsCostPerUnit: ProvenanceValue<number>;
  returnRate: ProvenanceValue<number>;
  returnLossPerUnit: ProvenanceValue<number>;
  storageFeePerUnit: ProvenanceValue<number>;
  otherCostsPerUnit: ProvenanceValue<number>;
}

export interface CandidateEconomics {
  status: CandidateEconomicsStatus;
  currency: string;
  inputs: CandidateEconomicsInputs;
  scenarios: {
    conservative: ScenarioEconomicsResult;
    base: ScenarioEconomicsResult;
    optimistic: ScenarioEconomicsResult;
  };
  missingInputs: string[];
}

export type CandidateDecision =
  | 'INSUFFICIENT_DATA'
  | 'NEEDS_VALIDATION'
  | 'BLOCKED'
  | 'WATCH'
  | 'SHORTLIST';

export interface CandidateDecisionDetail {
  verdict: CandidateDecision;
  reasons: string[];
  evidenceCompleteness: number; // 0.0 - 1.0
  hardRiskGatePassed: boolean;
  economicsGatePassed: boolean;
  evaluatedAt: string;
}

export interface ProductCandidateConcept {
  productType: string;
  targetCustomer?: string;
  useCase?: string;
  targetPrice?: number;
  specifications?: Record<string, unknown>;
  differentiationHypotheses?: string[];
}

export interface ProductCandidateMarketResearch {
  seedKeyword?: string;
  searchVolumeMonthly?: number | null;
  competitiveDifficulty?: number | null;
  opportunityScore?: number | null;
  competitorSampleSize?: number;
  representativeAsin?: string | null;
}

export interface ProductCandidate {
  id: string;
  title: string;
  marketplace: string;
  category?: string;
  concept: ProductCandidateConcept;
  marketResearch?: ProductCandidateMarketResearch;
  economics: CandidateEconomics;
  risks: CandidateRisk[];
  evidence: EvidenceItem[];
  assumptions: Assumption[];
  missingRequirements: MissingRequirement[];
  decision: CandidateDecision;
  decisionDetail?: CandidateDecisionDetail;
}

export type ComparisonDimension =
  | 'ECONOMICS'
  | 'MARKET_DEMAND'
  | 'COMPETITION_BARRIER'
  | 'RISK_PROFILE'
  | 'DIFFERENTIATION'
  | 'EVIDENCE_CONFIDENCE';

export type ComparisonConclusion =
  | 'A_BETTER'
  | 'B_BETTER'
  | 'SIMILAR'
  | 'NOT_COMPARABLE';

export interface ComparisonReason {
  candidateA: string;
  candidateB: string;
  dimension: ComparisonDimension;
  conclusion: ComparisonConclusion;
  metricIds: string[];
  evidenceIds: string[];
  assumptionIds: string[];
  explanation: string;
}

export interface CandidateComparisonResult {
  candidateIds: string[];
  ranking: string[];
  pairwiseReasons: Record<string, ComparisonReason[]>;
  summary: string;
  comparable: boolean;
  nonComparableReason?: string;
}

