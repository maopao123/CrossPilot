/**
 * CrossPilot Daily Operations Intelligence Contracts (Epic 3)
 *
 * Defines unified typed contracts for Business Signals, Recommended Actions,
 * Diagnosis Results, and Daily Operations Diagnosis State.
 *
 * Fully decoupled from specific storage drivers or UI components.
 */

// ============================================================================
// 1. Evidence Types & Categorization
// ============================================================================

export type EvidenceSourceCategory =
  | 'RAG'
  | 'DATABASE'
  | 'CALCULATED_METRIC'
  | 'BUSINESS_SIGNAL'
  | 'RULE'
  | 'EXTERNAL_DATA';

export interface OperationEvidenceItem {
  evidenceId: string;
  category: EvidenceSourceCategory;
  title: string;
  content: string;
  source: string; // e.g. 'orders_daily', 'inventory_snapshot', 'ProfitCalculationService', 'K-AUTH-001'
  sourceId?: string; // record ID, formula name, rule ID, or citationId
  capturedAt: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 2. Business Signals
// ============================================================================

export type SignalDomain =
  | 'SALES'
  | 'ADVERTISING'
  | 'INVENTORY'
  | 'REVIEWS'
  | 'RETURNS'
  | 'COMPETITOR'
  | 'PROFIT';

export type SignalSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type SignalDirection = 'UP' | 'DOWN' | 'STABLE';

export type DetectionMethod = 'RULE' | 'FORMULA' | 'STATISTICAL';

export interface BusinessSignal {
  signalId: string;
  workspaceId: string;
  skuId?: string;
  asin?: string;
  domain: SignalDomain;
  code: string; // e.g. 'PROFIT_DROP', 'ACOS_SPIKE', 'STOCKOUT_IMMINENT'
  metric: string; // e.g. 'netProfit', 'acos', 'daysCover'
  currentValue: number;
  baselineValue?: number;
  changePct?: number; // relative change (e.g. -0.277 = -27.7%)
  thresholdValue?: number;
  severity: SignalSeverity;
  direction: SignalDirection;
  detectedBy: DetectionMethod;
  ruleId?: string; // e.g. 'R-PROF-01'
  title: string;
  description: string;
  evidence: OperationEvidenceItem[];
  detectedAt: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 3. Recommended Actions
// ============================================================================

export type ActionCategory =
  | 'ADVERTISING'
  | 'INVENTORY'
  | 'LISTING'
  | 'PRICING'
  | 'REVIEW'
  | 'PURCHASE'
  | 'INVESTIGATION';

export type ActionPriority = 'P1' | 'P2' | 'P3';

export type ActionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type ActionExecutionMode = 'ADVISORY' | 'APPROVAL_REQUIRED';

export type ActionStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'DISMISSED';

export type ImpactType = 'MEASURED' | 'ESTIMATED' | 'QUALITATIVE' | 'UNKNOWN';

export type RecommendationGateStatus = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED';

export type ActionType =
  | 'INVESTIGATE_SEARCH_TERM'
  | 'REVIEW_AD_SPEND'
  | 'REVIEW_BID'
  | 'REVIEW_NEGATIVE_KEYWORD'
  | 'PREPARE_REPLENISHMENT'
  | 'REVIEW_REORDER_PLAN'
  | 'INVESTIGATE_STOCKOUT'
  | 'INVESTIGATE_PRODUCT_FIT'
  | 'REVIEW_RETURN_REASON'
  | 'REVIEW_LISTING_SPECIFICATION'
  | 'REVIEW_PRICE_COMPETITIVENESS'
  | 'REVIEW_COUPON_STRATEGY'
  | 'REFRESH_COMPETITOR_DATA'
  | 'INVESTIGATE_PROFIT_DRIVER'
  | 'NO_ACTION_REQUIRED';

export interface RecommendedAction {
  actionId: string;
  workspaceId: string;
  skuId?: string;
  asin?: string;
  sourceSignalIds: string[];
  sourceDiagnosisIds?: string[];
  category: ActionCategory;
  actionType?: ActionType;
  priority: ActionPriority;
  riskLevel: ActionRiskLevel;
  executionMode: ActionExecutionMode;
  status: ActionStatus;
  title: string;
  reason: string;
  evidence: OperationEvidenceItem[];
  expectedImpact?: string;
  impactAmount?: number;
  impactType?: ImpactType;
  recommendationGateStatus?: RecommendationGateStatus;
  conflictDetected?: boolean;
  conflictingActionIds?: string[];
  conflictReason?: string;
  targetEntity?: string; // e.g. 'Campaign', 'Keyword', 'PurchaseOrder', 'Listing'
  targetId?: string;
  payload?: Record<string, unknown>;
  createdAt: string; // ISO 8601
}

// ============================================================================
// 4. Diagnosis & Causal Drivers
// ============================================================================

export type CausalStrength = 'PROVEN' | 'STRONG' | 'INDICATIVE' | 'UNKNOWN';

export type DiagnosisEvidenceGateStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'INSUFFICIENT';

export interface DiagnosisDriver {
  domain: SignalDomain;
  metric: string;
  impactAmount?: number; // monetary impact on profit, e.g. -980.00
  impactType?: ImpactType;
  contributionRatio?: number; // normalized ratio 0..1
  direction: SignalDirection;
  description: string;
  causalStrength?: CausalStrength;
  relatedSignalIds?: string[];
  evidence?: OperationEvidenceItem[];
}

export interface DiagnosisResult {
  diagnosisId: string;
  workspaceId: string;
  skuId?: string;
  asin?: string;
  title: string;
  summary: string;
  primaryDriver: DiagnosisDriver;
  secondaryDrivers: DiagnosisDriver[];
  confidence: number; // 0..1
  evidence: OperationEvidenceItem[];
  affectedDomains: SignalDomain[];
  affectedSkus: string[];
  gateStatus?: DiagnosisEvidenceGateStatus;
  targetSignalIds?: string[];
  rootCauseCode?: string;
  unknowns?: string[];
  impactType?: ImpactType;
  calculatedAt: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

export interface CrossDomainDiagnosisInput {
  context: Sku360BusinessContext;
  signals: BusinessSignal[];
  options?: {
    minConfidenceThreshold?: number;
    includeLLMSummary?: boolean;
    asOf?: string;
  };
}

export interface CrossDomainDiagnosisResponse {
  diagnoses: DiagnosisResult[];
  summary: {
    totalDiagnoses: number;
    supportedCount: number;
    partiallySupportedCount: number;
    insufficientCount: number;
    hasUnconfirmedRootCauses: boolean;
  };
  evaluatedSignalsCount: number;
  unattributedSignalIds: string[];
  executedAt: string;
}

export interface ActionRecommendationOptions {
  dedup?: boolean;
  detectConflicts?: boolean;
  minPriority?: ActionPriority;
  asOf?: string;
}

export interface ActionRecommendationInput {
  context: Sku360BusinessContext;
  signals: BusinessSignal[];
  diagnoses: DiagnosisResult[];
  options?: ActionRecommendationOptions;
}

export interface ActionRecommendationResponse {
  workspaceId: string;
  skuId?: string;
  asin?: string;
  actions: RecommendedAction[];
  summary: {
    totalActions: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
    advisoryCount: number;
    approvalRequiredCount: number;
    conflictsDetected: number;
  };
  evaluatedDiagnosisCount: number;
  evaluatedSignalCount: number;
  executedAt: string;
}

// ============================================================================
// 5. Daily Operation Diagnosis & Workflow State (WF-05)
// ============================================================================

export type DiagnosisMode = 'WORKSPACE' | 'SKU';

export type DiagnosisHealthStatus = 'HEALTHY' | 'NEEDS_ATTENTION' | 'CRITICAL';

export type DailyOperationWorkflowStep =
  | 'VALIDATE_INPUT'
  | 'RESOLVE_SKUS'
  | 'LOAD_CONTEXT'
  | 'DETECT_SIGNALS'
  | 'DIAGNOSE'
  | 'RECOMMEND'
  | 'AGGREGATE'
  | 'APPROVAL_GATE'
  | 'FINALIZE';

export type WorkflowExecutionStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'PARTIALLY_APPROVED'
  | 'PARTIAL_SUCCESS'
  | 'FAILED';

export interface WorkflowStepTrace {
  step: DailyOperationWorkflowStep;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SKIPPED' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputSummary?: string;
  outputSummary?: string;
  toolOrService?: string;
  error?: string;
}

export interface DailyOperationTopRisk {
  skuId: string;
  skuCode?: string;
  domain: SignalDomain;
  title: string;
  severity: SignalSeverity;
  financialExposure?: number;
}

export interface DailyOperationSummary {
  healthStatus: DiagnosisHealthStatus;
  totalSkuCount: number;
  evaluatedSkuCount: number;
  failedSkuCount: number;
  affectedSkuCount: number;
  criticalSignalCount: number;
  warningSignalCount: number;
  p1ActionCount: number;
  p2ActionCount: number;
  p3ActionCount: number;
  advisoryCount: number;
  approvalRequiredCount: number;
  topRisks: DailyOperationTopRisk[];
  actions: RecommendedAction[];
  noActionRequired: boolean;
}

export interface ActionApprovalDecision {
  actionId: string;
  decision: 'APPROVED' | 'REJECTED' | 'DISMISSED';
  decidedBy?: string;
  note?: string;
  decidedAt: string;
}

export interface WorkflowApprovalState {
  pendingActionIds: string[];
  approvedActionIds: string[];
  rejectedActionIds: string[];
  dismissedActionIds: string[];
  decisions: ActionApprovalDecision[];
}

export interface DailyOperationWorkflowState {
  taskId: string;
  workflowRunId: string;
  workspaceId: string;
  marketplaceId: string;
  mode: DiagnosisMode;
  skuIds: string[];
  dateRange: { from: string; to: string; daysCount?: number };
  baselinePeriod?: { from: string; to: string; daysCount?: number };

  contexts: Record<string, Sku360BusinessContext>;
  signals: BusinessSignal[];
  diagnoses: DiagnosisResult[];
  recommendedActions: RecommendedAction[];

  approvalState: WorkflowApprovalState;

  currentStep: DailyOperationWorkflowStep;
  completedSteps: DailyOperationWorkflowStep[];
  stepTraces: WorkflowStepTrace[];

  errors: Array<{ step: DailyOperationWorkflowStep; skuId?: string; message: string; timestamp: string }>;
  warnings: Array<{ step: DailyOperationWorkflowStep; skuId?: string; message: string; timestamp: string }>;

  summary?: DailyOperationSummary;
  status: WorkflowExecutionStatus;

  checkpointVersion?: number; // Monotonically increasing version for Optimistic Concurrency Control (OCC)
  checkpointedAt?: string;
  workflowVersion?: string; // Workflow DAG / execution version (e.g. 'WF05_V1')

  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface DailyOperationWorkflowInput {
  taskId?: string;
  workflowRunId?: string;
  workflowVersion?: string;
  workspaceId: string;
  marketplaceId: string;
  mode: DiagnosisMode;
  skuId?: string;
  skuIds?: string[];
  dateRange: { from: string; to: string };
  baselinePeriod?: { from: string; to: string };
  options?: {
    maxConcurrency?: number;
    maxSkuCount?: number;
    autoApproveAdvisory?: boolean;
    failFast?: boolean;
    checkpointStorage?: boolean;
    asOf?: string;
  };
}

export interface DailyOperationWorkflowResult {
  taskId: string;
  workflowRunId: string;
  mode: DiagnosisMode;
  workspaceId: string;
  marketplaceId: string;
  status: WorkflowExecutionStatus;
  healthStatus: DiagnosisHealthStatus;
  checkpointVersion?: number;
  workflowVersion?: string;
  skuSummary: {
    total: number;
    evaluated: number;
    failed: number;
    affected: number;
  };
  signals: BusinessSignal[];
  diagnoses: DiagnosisResult[];
  actions: RecommendedAction[];
  approvalSummary: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    dismissedCount: number;
  };
  summary: DailyOperationSummary;
  warnings: string[];
  errors: string[];
  stepTraces: WorkflowStepTrace[];
  startedAt: string;
  completedAt?: string;
}

export type DailyOperationEventType =
  | 'workflow.started'
  | 'step.started'
  | 'step.completed'
  | 'sku.started'
  | 'sku.completed'
  | 'signal.detected'
  | 'diagnosis.completed'
  | 'recommendation.created'
  | 'approval.required'
  | 'action.approved'
  | 'action.rejected'
  | 'action.dismissed'
  | 'workflow.checkpoint'
  | 'workflow.completed'
  | 'workflow.failed';

export interface DailyOperationWorkflowEvent {
  type: DailyOperationEventType;
  taskId: string;
  workflowRunId: string;
  timestamp: string;
  step?: DailyOperationWorkflowStep;
  skuId?: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface DailyOperationDiagnosisSummary {
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  affectedSkuCount: number;
  status: DiagnosisHealthStatus;
  primaryIssueDomain?: SignalDomain;
}

export interface DailyOperationDiagnosisState {
  mode: DiagnosisMode;
  dateRange: {
    from: string; // ISO 8601
    to: string; // ISO 8601
  };
  workspaceId: string;
  skuIds: string[];
  businessContext?: Record<string, unknown>;
  signals: BusinessSignal[];
  diagnoses: DiagnosisResult[];
  recommendedActions: RecommendedAction[];
  summary?: DailyOperationDiagnosisSummary;
  executedAt: string; // ISO 8601
}

// ============================================================================
// 6. Data Availability & Rule Evaluation Audit
// ============================================================================

export type DataAvailabilityStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export type RuleEvaluationStatus =
  | 'TRIGGERED'      // Rule condition met -> BusinessSignal generated
  | 'NO_ANOMALY'     // Data available, evaluated, within normal acceptable bounds
  | 'NOT_EVALUATED'  // Missing data, missing baseline, or insufficient statistical sample
  | 'SKIPPED';       // Rule not applicable to scope

export interface RuleEvaluationRecord {
  ruleId: string; // e.g. 'R-PROF-01'
  ruleCode?: string; // e.g. 'PROFIT_DROP'
  ruleName: string; // e.g. 'Net Profit Baseline Drop'
  domain: SignalDomain;
  status: RuleEvaluationStatus;
  dataAvailability: DataAvailabilityStatus;
  signalId?: string;
  reason: string;
  metrics?: Record<string, number | string | boolean | null | undefined>;
  evaluatedAt: string; // ISO 8601
}

export interface OperationAnomalyDetectionResult {
  signals: BusinessSignal[];
  evaluations: RuleEvaluationRecord[];
  summary: {
    totalRules: number;
    triggeredCount: number;
    noAnomalyCount: number;
    notEvaluatedCount: number;
    criticalSignals: number;
    warningSignals: number;
    infoSignals: number;
  };
  context: {
    workspaceId: string;
    skuId?: string;
    marketplaceId?: string;
    category?: string;
    dateRange: { from: string; to: string };
  };
  thresholdVersion: string;
  executedAt: string; // ISO 8601
}

// ============================================================================
// 7. Sku360 Unified Cross-Domain Business Context (WF-05 / Epic 3 Phase 3)
// ============================================================================

export interface Sku360TimePeriod {
  from: string; // ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  to: string; // ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  daysCount?: number;
}

export interface MetricComparison {
  current: number;
  baseline: number;
  delta: number;
  deltaPct: number; // relative change rate e.g. -0.277 = -27.7%
}

export interface Sku360Identity {
  workspaceId: string;
  marketplaceId: string;
  productId: string;
  skuId: string;
  skuCode?: string;
  asin?: string;
  productName?: string;
  brand?: string;
  category?: string;
  status?: string; // 'ACTIVE', 'INACTIVE', etc.
}

export interface Sku360SalesContext {
  ordersCount: MetricComparison;
  unitsSold: MetricComparison;
  revenue: MetricComparison;
  averageSellingPrice: MetricComparison;
  sessions?: MetricComparison;
  pageViews?: MetricComparison;
  conversionRate?: MetricComparison;
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360SearchTermItem {
  searchTerm: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  acos?: number;
  cvr?: number;
  ctr?: number;
  campaignId?: string;
  adGroupId?: string;
}

export interface Sku360AdvertisingContext {
  spend: MetricComparison;
  sales: MetricComparison;
  orders: MetricComparison;
  clicks: MetricComparison;
  impressions: MetricComparison;
  acos: MetricComparison; // rate 0..1
  roas: MetricComparison;
  ctr: MetricComparison;  // rate 0..1
  cvr: MetricComparison;  // rate 0..1
  targetAcos?: number;    // e.g. 0.30
  searchTerms?: Sku360SearchTermItem[];
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360InventoryContext {
  fulfillableQuantity: number;
  inboundQuantity: number;
  reservedQuantity?: number;
  avgDailySales: number;
  daysCover: number;
  leadTimeDays: number;
  safetyStockDays: number;
  reorderPoint: number;
  inventoryHealth: 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERSTOCKED';
  recommendedQuantity?: number;
  baseline?: {
    fulfillableQuantity?: number;
    daysCover?: number;
    avgDailySales?: number;
  };
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360VocTheme {
  topicName: string;
  percentage: number;
  reviewCount: number;
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface Sku360ReviewsContext {
  overallRating: number;
  totalReviews: number;
  recentReviewCount: number;
  negativeReviewCount: number;
  negativeReviewRatio: number; // rate 0..1
  baseline?: {
    overallRating?: number;
    totalReviews?: number;
  };
  topPainPoints?: Sku360VocTheme[];
  topPositiveThemes?: Sku360VocTheme[];
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360ReturnsContext {
  returnCount: MetricComparison;
  deliveredUnits: MetricComparison;
  returnRate: MetricComparison; // rate 0..1
  returnCost: MetricComparison;
  topReturnReasons?: Array<{ reason: string; count: number; percentage?: number }>;
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360CompetitorItem {
  competitorId: string;
  asin: string;
  name?: string;
  relationType: string;
  isPrimary: boolean;
  currentPrice: number;
  baselinePrice?: number;
  priceDelta?: number;
  priceDeltaPct?: number;
  currentRating?: number;
  baselineRating?: number;
  ratingDelta?: number;
  reviewCount?: number;
}

export interface Sku360CompetitorsContext {
  items: Sku360CompetitorItem[];
  primaryCompetitor?: Sku360CompetitorItem;
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360WaterfallBreakdown {
  totalVariance: number;
  advertisingImpact: number;
  returnsImpact: number;
  inventoryImpact: number;
  priceImpact: number;
  otherImpact: number;
  isExactMatch: boolean;
  residual: number;
  formulaString: string;
}

export interface Sku360ProfitContext {
  revenue: MetricComparison;
  cogs: MetricComparison;
  amazonFees: MetricComparison;
  fbaFee: MetricComparison;
  adsCost: MetricComparison;
  returnLoss: MetricComparison;
  otherCosts: MetricComparison;
  netProfit: MetricComparison;
  netMargin: MetricComparison; // rate 0..1
  waterfallAttribution?: Sku360WaterfallBreakdown;
  availability: DataAvailabilityStatus;
  asOf?: string;
}

export interface Sku360DomainAvailability {
  sales: DataAvailabilityStatus;
  advertising: DataAvailabilityStatus;
  inventory: DataAvailabilityStatus;
  reviews: DataAvailabilityStatus;
  returns: DataAvailabilityStatus;
  competitors: DataAvailabilityStatus;
  profit: DataAvailabilityStatus;
  overall: DataAvailabilityStatus;
}

export type FreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface Sku360DomainFreshness {
  asOf: string;
  sourceTimestamp?: string;
  status: FreshnessStatus;
}

export interface Sku360Freshness {
  sales: Sku360DomainFreshness;
  advertising: Sku360DomainFreshness;
  inventory: Sku360DomainFreshness;
  reviews: Sku360DomainFreshness;
  returns: Sku360DomainFreshness;
  competitors: Sku360DomainFreshness;
  profit: Sku360DomainFreshness;
  overall: FreshnessStatus;
  loadedAt: string;
}

export interface Sku360BusinessContext {
  identity: Sku360Identity;
  currentPeriod: Sku360TimePeriod;
  baselinePeriod: Sku360TimePeriod;

  sales: Sku360SalesContext;
  advertising: Sku360AdvertisingContext;
  inventory: Sku360InventoryContext;
  reviews: Sku360ReviewsContext;
  returns: Sku360ReturnsContext;
  competitors: Sku360CompetitorsContext;
  profit: Sku360ProfitContext;

  availability: Sku360DomainAvailability;
  freshness: Sku360Freshness;
  evidence: OperationEvidenceItem[];

  loadedAt: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 10. Phase 7: Operation API & Tool Platform Contracts & DTOs
// ============================================================================

export interface DailyOperationStartRequestDto {
  workspaceId?: string;
  marketplaceId: string;
  mode: DiagnosisMode;
  skuId?: string;
  skuIds?: string[];
  dateRange: { from: string; to: string };
  baselinePeriod?: { from: string; to: string };
  options?: {
    maxConcurrency?: number;
    maxSkuCount?: number;
    autoApproveAdvisory?: boolean;
    failFast?: boolean;
    workflowVersion?: string;
    waitForCompletion?: boolean;
  };
  idempotencyKey?: string;
}

export interface DailyOperationStartResponseDto {
  taskId: string;
  workflowRunId: string;
  status: WorkflowExecutionStatus;
  streamUrl: string;
  statusUrl: string;
}

export interface DailyOperationTaskSummaryDto {
  taskId: string;
  workflowVersion: string;
  status: WorkflowExecutionStatus;
  currentStep?: DailyOperationWorkflowStep;
  healthStatus: DiagnosisHealthStatus;
  skuSummary: {
    total: number;
    evaluated: number;
    failed: number;
    affected: number;
  };
  signalSummary: {
    criticalCount: number;
    warningCount: number;
    totalCount: number;
  };
  diagnosisSummary: {
    totalCount: number;
  };
  actionSummary: {
    p1Count: number;
    p2Count: number;
    p3Count: number;
    totalCount: number;
    advisoryCount: number;
    approvalRequiredCount: number;
  };
  approvalSummary: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    dismissedCount: number;
  };
  topRisks?: DailyOperationTopRisk[];
  topActions?: RecommendedAction[];
  actions?: RecommendedAction[];
  signals?: BusinessSignal[];
  diagnoses?: DiagnosisResult[];
  stepTraces?: WorkflowStepTrace[];
  contexts?: Record<string, Sku360BusinessContext>;
  warnings: string[];
  errors: string[];
  checkpointVersion: number;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface DailyOperationActionDecisionDto {
  expectedVersion?: number;
  note?: string;
  decidedBy?: string;
}

export interface DailyOperationActionDecisionResponseDto {
  taskId: string;
  actionId: string;
  decision: 'APPROVED' | 'REJECTED' | 'DISMISSED';
  status: WorkflowExecutionStatus;
  checkpointVersion: number;
  approvalSummary: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    dismissedCount: number;
  };
}

export interface DailyOperationResumeResponseDto {
  taskId: string;
  status: WorkflowExecutionStatus;
  healthStatus: DiagnosisHealthStatus;
  checkpointVersion: number;
  completedAt?: string;
}

