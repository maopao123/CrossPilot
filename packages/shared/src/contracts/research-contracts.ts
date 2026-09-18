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

/**
 * Normalized ASIN → Keywords result (market.asin.keywords).
 * Missing provider fields stay null; callers must not invent defaults.
 */
export interface AsinKeywordHit {
  keyword: string;
  searchRank?: number | null;
  trafficShare?: number | null;
  adPosition?: string | null;
}

export interface AsinKeywordResult {
  asin: string;
  keywords: AsinKeywordHit[];
  total?: number | null;
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

export type ValueSource = 'FACT' | 'ESTIMATE' | 'ASSUMPTION' | 'UNKNOWN' | 'DEMO';

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

export interface EconomicsScenarioMultipliers {
  sellingPriceMultiplier: number;
  productCostMultiplier: number;
  freightMultiplier: number;
  adsCostMultiplier: number;
  returnRateMultiplier: number;
  storageMultiplier: number;
  description: string;
}

export interface EconomicsScenarioConfig {
  conservative: EconomicsScenarioMultipliers;
  optimistic: EconomicsScenarioMultipliers;
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
  criticalInputs?: string[];
  excludedInputs?: string[];
  scenarioAssumptions?: {
    conservative: string;
    optimistic: string;
  };
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
  evidenceCoverageHeuristic: number; // 0.0 - 1.0 (Dimensional coverage across concept, market, economics, risk)
  /** @deprecated Kept for backwards compatibility */
  evidenceCompleteness?: number;
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
  evidenceIds?: string[];
  assumptionIds?: string[];
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
  specifications?: ProductSpecification[];
  activeSpecVersionId?: string;
  supplierQuotes?: SupplierQuote[];
  primaryQuoteId?: string;
  fxSnapshot?: FxSnapshot;
  initialCash?: InitialCashRequirement;
  decisionPacket?: OnePageDecisionPacket;
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
  candidateAEvidenceIds?: string[];
  candidateBEvidenceIds?: string[];
  candidateAAssumptionIds?: string[];
  candidateBAssumptionIds?: string[];
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

export interface CandidateDefaultsResponse {
  mode: 'DEMO' | 'LIVE';
  dataSource: string;
  isRealData: boolean;
  disclaimer: string;
  candidates: ProductCandidate[];
  comparison: CandidateComparisonResult;
}

/**
 * ============================================================================
 * Phase 3: Single Product Research V1 Contracts (V1 最终冻结版 · 工程增强修订)
 * ============================================================================
 */

/**
 * P0-1: 核心规格字段严格定义
 * 字段级 diff 依据: 只要 CORE_SPEC_FIELDS 任一变更，旧 Quote 全部失效变为 STALE，旧 FBA/Freight 变为 UNKNOWN
 */
export const CORE_SPEC_FIELDS = [
  'material',
  'capacity',
  'dimensions',
  'targetSellingPrice',
] as const;

export type CoreSpecField = (typeof CORE_SPEC_FIELDS)[number];

export type SpecificationStatus = 'DRAFT' | 'FROZEN';

export interface ProductSpecification {
  id: string;
  candidateId: string;
  version: number;
  status: SpecificationStatus;

  // 核心 4 大规格（询价前必填）
  material: string;
  capacity: string;
  dimensions: string;
  targetSellingPrice: number;

  // 非核心规格（初次可未知或估算，工厂报价后自动回填）
  netWeight?: ProvenanceValue<number>;
  packagingDimensions?: ProvenanceValue<string>;
  packagedWeight?: ProvenanceValue<number>;
  unitsPerCarton?: ProvenanceValue<number>;
  cartonDimensions?: ProvenanceValue<string>;
  cartonGrossWeight?: ProvenanceValue<number>;

  specialRequirements?: string[];
  frozenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * P0-2: 可复制询价单
 */
export interface GeneratedRfq {
  candidateId: string;
  specVersionId: string;
  productTitle: string;
  specifications: {
    material: string;
    capacity: string;
    dimensions: string;
    targetSellingPrice?: number;
    specialRequirements?: string[];
  };
  inquiryItems: string[];
  copyableText: string;
  generatedAt: string;
}

/**
 * P0-3 & P0-4: 供应商报价与来源维度拆分
 */
export type QuoteCaptureMethod = 'MANUAL' | 'API' | 'IMPORT';
export type QuoteSourceChannel = '1688' | 'ALIBABA' | 'WECHAT' | 'EMAIL' | 'OTHER';
export type SupplierQuoteStatus = 'ACTIVE' | 'STALE' | 'DRAFT';

export interface ReturnedPhysicalSpecs {
  netWeight?: number;
  packagingDimensions?: string;
  packagedWeight?: number;
  unitsPerCarton?: number;
  cartonDimensions?: string;
  cartonGrossWeight?: number;
}

export interface SupplierQuote {
  id: string;
  candidateId: string;
  specVersionId: string;
  supplierName: string;
  status: SupplierQuoteStatus;

  unitPrice: number;
  packagingCost: ProvenanceValue<number>;
  logoCost: ProvenanceValue<number>;
  moq: number;
  sampleCost?: number | null;
  toolingCost?: number | null;
  leadTimeDays?: number | null;

  returnedSpecs?: ReturnedPhysicalSpecs;

  captureMethod: QuoteCaptureMethod;
  sourceChannel: QuoteSourceChannel;
  currency: string;
  capturedAt: string;
  notes?: string;
}

/**
 * P0-3: 事实标签（禁止“综合最优”或隐形评分，仅展示事实最值）
 */
export type SupplierQuoteBadgeType = 'LOWEST_PRICE' | 'LOWEST_MOQ' | 'SHORTEST_LEAD_TIME';

export interface SupplierQuoteFactBadge {
  quoteId: string;
  badgeType: SupplierQuoteBadgeType;
  labelZh: string;
}

/**
 * P0-6: 汇率快照
 */
export interface FxSnapshot {
  currencyPair: string;
  rate: number;
  source: string;
  capturedAt: string;
}

/**
 * P0-11: 首单最低现金需求模型（与单件 Unit Economics 严格领域层分离）
 */
export interface InitialCashItem {
  item: string;
  amount: number;
  currency: string;
  description?: string;
  isOneTime: boolean;
}

export type InitialCashStatus = 'COMPLETE' | 'INCOMPLETE';

export interface InitialCashRequirement {
  status: InitialCashStatus;
  moq: number;
  productCostPerUnit: number;
  inventoryCost: number;
  sampleCost: number | null;
  firstFreightCost: number | null;
  toolingCost: number;
  packagingSetupCost: number;
  otherOneTimeCosts: number;
  totalInitialCash: number | null;
  currency: string;
  missingItems?: string[];
  displaySummaryZh: string;
  breakdown: InitialCashItem[];
}

/**
 * P0-14: Next Best Action 确定性规则优先级与模型
 */
export type NextBestActionCategory =
  | 'BLOCKED_STOP'
  | 'RISK_VERIFICATION'
  | 'CRITICAL_INPUT'
  | 'LAUNCH_CASH'
  | 'NON_BLOCKING_IMPROVEMENT';

export interface NextBestAction {
  id: string;
  priority: number; // 1 to 5
  title: string;
  category: NextBestActionCategory;
  targetField?: string;
  description: string;
  actionType: 'STOP' | 'VERIFY_RISK' | 'FILL_CRITICAL_INPUT' | 'CONFIRM_LAUNCH_CASH' | 'OPTIMIZE';
  buttonText: string;
}

/**
 * 敏感度因素分析（什么变化会改变当前结论）
 */
export interface DecisionSensitivityFactor {
  factorName: string;
  currentValue: string | number;
  triggerThreshold: string | number;
  projectedVerdict: CandidateDecision;
  explanation: string;
}

/**
 * P0-15: 一页决策结论包 (OnePageDecisionPacket)
 */
export interface OnePageDecisionPacket {
  verdict: CandidateDecision;
  verdictTitleZh: string;
  adviceZh: string;
  unitContributionProfitUsd: number | null;
  unitContributionMargin: number | null;
  initialCashRequired: {
    status: InitialCashStatus;
    amount: number | null;
    currency: string;
    formattedTextZh: string;
    missingItems?: string[];
  };
  confirmedChecklistZh: string[];
  missingChecklistZh: string[];
  nextBestAction: NextBestAction | null;
  conservativeScenarioSummary: {
    unitContributionProfitUsd: number | null;
    unitContributionMargin: number | null;
    explanationZh: string;
  };
  decisionSensitivities: DecisionSensitivityFactor[];
  costBreakdown: {
    productCost: DecisionCostItem;
    referralFee: DecisionCostItem;
    fbaFee: DecisionCostItem;
    freightFee: DecisionCostItem;
    duty: DecisionCostItem;
    advertisingCost: DecisionCostItem;
    expectedReturnLoss: DecisionCostItem;
    storage: DecisionCostItem;
    otherCosts: DecisionCostItem;
    totalExpenses: DecisionCostItem;
  };
  riskAndEvidenceSummary: {
    totalRisks: number;
    unverifiedCount: number;
    passCount: number;
    failCount: number;
    applicableRisks: CandidateRisk[];
  };
  evaluatedAt: string;
}

/**
 * 决策包成本明细项（P0-4 规约: UNKNOWN ≠ 0，严格保留来源凭据与区分 FACT 0）
 */
export interface DecisionCostItem {
  value: number | null;
  source: ValueSource;
  included: boolean;
}

/**
 * 状态机前后台术语统一字典（Spec §29）
 */
export const RESEARCH_STATUS_TRANSLATIONS: Record<string, string> = {
  DRAFT: '还在修改',
  FROZEN: '已按这个去询价',
  STALE: '规格变了，需要重新问',
  FACT: '工厂正式报价 / 已确认',
  ESTIMATE: '估算值',
  ASSUMPTION: '暂时按这个算',
  UNKNOWN: '还不知道',
  INCOMPLETE: '还差一项才能算',
  NEEDS_VALIDATION: '先补这份材料',
  WATCH: '先观察',
  SHORTLIST: '建议继续打样',
  BLOCKED: '不建议做',
  ACTIVE: '生效中',
};

/**
 * 埋点事件定义（Spec §35）
 */
export type ResearchFunnelEvent =
  | 'RFQ_GENERATED'
  | 'QUOTE_ENTERED'
  | 'CRITICAL_FEES_COMPLETED'
  | 'DECISION_PACKET_VIEWED'
  | 'NEXT_BEST_ACTION_CLICKED'
  | 'COLLAPSIBLE_SECTION_EXPANDED';

export interface ResearchAnalyticsEvent {
  workspaceId?: string;
  eventName: ResearchFunnelEvent;
  candidateId: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * ============================================================================
 * Phase 4: Single Product Research Workflow Task (选品任务流与持久化编排)
 * ============================================================================
 */
export type ResearchTaskStage =
  | 'CREATED'
  | 'MARKET_RESEARCH'
  | 'SPECIFICATION'
  | 'QUOTE'
  | 'ECONOMICS'
  | 'DECISION'
  | 'COMPLETED';

export interface ResearchTask {
  id: string;
  workspaceId: string;
  title: string;
  currentStage: ResearchTaskStage;
  candidateData: ProductCandidate;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchTaskSummary {
  id: string;
  workspaceId: string;
  title: string;
  currentStage: ResearchTaskStage;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResearchTaskDto {
  title: string;
  candidateData: ProductCandidate;
  currentStage?: ResearchTaskStage;
}

export interface UpdateResearchTaskDto {
  title?: string;
  candidateData?: ProductCandidate;
  currentStage?: ResearchTaskStage;
}



