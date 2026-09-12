/**
 * CrossPilot Deterministic Operation Anomaly Detector (Epic 3 Phase 2)
 *
 * Implements pure code, deterministic detection of 12 core operational anomalies
 * across 7 domains (PROFIT, ADVERTISING, INVENTORY, RETURNS, REVIEWS, COMPETITOR, SALES).
 *
 * Core Principles:
 * 1. Strictly NO LLM. Pure code, deterministic formulas and rules.
 * 2. Detect != Diagnose != Recommend: Only answers "What anomaly occurred?".
 * 3. Reuses existing domain calculators (ProfitCalculationService, InventoryPlanningService, AdOptimizerService).
 * 4. Resolves all thresholds via ThresholdResolver with multi-tier inheritance (System -> Marketplace/Category -> Workspace -> SKU).
 * 5. Deterministic, idempotent Signal IDs.
 * 6. Explicit Data Availability (AVAILABLE, PARTIAL, UNAVAILABLE) and Rule Evaluation Status (TRIGGERED, NO_ANOMALY, NOT_EVALUATED).
 * 7. Small-denominator & missing baseline False Positive defenses.
 */

import {
  BusinessSignal,
  OperationEvidenceItem,
  SignalDomain,
  SignalSeverity,
  SignalDirection,
  DetectionMethod,
  DataAvailabilityStatus,
  RuleEvaluationStatus,
  RuleEvaluationRecord,
  OperationAnomalyDetectionResult,
} from '@crosspilot/shared';

import {
  AnomalyThresholdConfig,
  DEFAULT_ANOMALY_THRESHOLDS,
  ThresholdResolver,
  ThresholdResolutionContext,
} from './anomaly-threshold.config.js';

import {
  roundMoney,
  roundMargin,
  ProfitCalculationService,
} from '../profit/profit-calculation.service.js';

import {
  InventoryPlanningService,
} from '../inventory/inventory-planning.service.js';

import {
  AdOptimizerService,
} from '../advertising/ad-optimizer.service.js';

// ============================================================================
// 1. Input Types for Operation Anomaly Detector
// ============================================================================

export interface AnomalyDetectionFinancials {
  current?: {
    revenue: number;
    netProfit: number;
    margin?: number; // 0..1 rate
    orderCount?: number;
    unitsSold?: number;
    cogs?: number;
    amazonFees?: number;
    fbaFee?: number;
    adsCost?: number;
    returnLoss?: number;
    otherCosts?: number;
  };
  baseline?: {
    revenue: number;
    netProfit: number;
    margin?: number;
    orderCount?: number;
    unitsSold?: number;
  };
  availability?: DataAvailabilityStatus;
}

export interface SearchTermPerformance {
  searchTerm: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  campaignId?: string;
  adGroupId?: string;
}

export interface AnomalyDetectionAdvertising {
  current?: {
    spend: number;
    sales: number;
    orders?: number;
    clicks?: number;
    impressions?: number;
    acos?: number; // 0..1 rate
  };
  baseline?: {
    spend: number;
    sales: number;
    orders?: number;
    clicks?: number;
    acos?: number;
  };
  targetAcos?: number; // e.g. 0.30
  searchTerms?: SearchTermPerformance[];
  availability?: DataAvailabilityStatus;
}

export interface AnomalyDetectionInventory {
  current?: {
    fulfillableQuantity: number;
    inboundQuantity?: number;
    avgDailySales: number;
    leadTimeDays: number;
    safetyStockDays?: number;
    targetDaysCover?: number;
    daysCover?: number;
  };
  status?: string; // 'ACTIVE', etc.
  availability?: DataAvailabilityStatus;
}

export interface AnomalyDetectionReturns {
  current?: {
    returnUnits: number;
    deliveredUnits: number;
    returnRate?: number; // 0..1 rate
  };
  baseline?: {
    returnUnits: number;
    deliveredUnits: number;
    returnRate?: number;
  };
  availability?: DataAvailabilityStatus;
}

export interface AnomalyDetectionReviews {
  current?: {
    overallRating?: number;
    totalReviews?: number;
    recentNegativeReviewsCount?: number; // 1-2 star reviews in evaluation window
    recentTotalReviewsCount?: number;
    recentNegativeReviewRatio?: number;
  };
  availability?: DataAvailabilityStatus;
}

export interface CompetitorBenchmarkItem {
  competitorId: string;
  asin?: string;
  name?: string;
  currentPrice: number;
  baselinePrice?: number;
  rating?: number;
  baselineRating?: number;
  reviewCount?: number;
  baselineReviewCount?: number;
}

export interface AnomalyDetectionCompetitors {
  items?: CompetitorBenchmarkItem[];
  availability?: DataAvailabilityStatus;
}

export interface OperationAnomalyDetectionInput {
  workspaceId: string;
  skuId?: string;
  asin?: string;
  marketplaceId?: string;
  category?: string;
  dateRange: {
    from: string; // ISO 8601
    to: string; // ISO 8601
  };
  baselineDateRange?: {
    from: string;
    to: string;
  };
  financials?: AnomalyDetectionFinancials;
  advertising?: AnomalyDetectionAdvertising;
  inventory?: AnomalyDetectionInventory;
  returns?: AnomalyDetectionReturns;
  reviews?: AnomalyDetectionReviews;
  competitors?: AnomalyDetectionCompetitors;
  thresholdResolver?: ThresholdResolver;
  asOf?: string;
}

// ============================================================================
// 2. Helper Utilities: Idempotent Signal Identity & Date Parsing
// ============================================================================

function cleanKey(val?: string): string {
  return (val || 'GLOBAL').replace(/[^a-zA-Z0-9_-]/g, '');
}

function formatDateRangeKey(from: string, to: string): string {
  const f = from.slice(0, 10).replace(/-/g, '');
  const t = to.slice(0, 10).replace(/-/g, '');
  return `${f}_${t}`;
}

export function buildIdempotentSignalId(
  ruleId: string,
  workspaceId: string,
  skuId: string | undefined,
  dateRange: { from: string; to: string },
  subEntity?: string
): string {
  const period = formatDateRangeKey(dateRange.from, dateRange.to);
  const base = `SIG-${ruleId}-${cleanKey(workspaceId)}-${cleanKey(skuId)}-${period}`;
  return subEntity ? `${base}-${cleanKey(subEntity)}` : base;
}

// Minimum statistical sample thresholds for false positive suppression
const MIN_RETURN_DELIVERED_UNITS = 20;
const MIN_REVIEW_SAMPLE_COUNT = 5;
const MIN_AD_SPEND_SAMPLE_USD = 10.0;

// ============================================================================
// 3. OperationAnomalyDetector Implementation
// ============================================================================

export class OperationAnomalyDetector {
  private readonly defaultResolver: ThresholdResolver;

  constructor(options?: { thresholdResolver?: ThresholdResolver }) {
    this.defaultResolver = options?.thresholdResolver || new ThresholdResolver();
  }

  /**
   * Primary entry point: Evaluates 12 deterministic rules against provided metrics and thresholds.
   */
  public static detect(input: OperationAnomalyDetectionInput): OperationAnomalyDetectionResult {
    return new OperationAnomalyDetector().detect(input);
  }

  /**
   * Evaluates 12 deterministic rules on instance with custom thresholdResolver.
   */
  public detect(input: OperationAnomalyDetectionInput): OperationAnomalyDetectionResult {
    const executedAt = new Date().toISOString();
    const resolver = input.thresholdResolver || this.defaultResolver;

    // Resolve 4-tier thresholds for this exact context
    const thresholdContext: ThresholdResolutionContext = {
      marketplaceId: input.marketplaceId,
      category: input.category,
      workspaceId: input.workspaceId,
      skuId: input.skuId,
      asOf: input.asOf || input.dateRange.to,
    };
    const thresholds = resolver.resolve(thresholdContext);

    const signals: BusinessSignal[] = [];
    const evaluations: RuleEvaluationRecord[] = [];

    // Evaluate 12 rules in structured domain sequence
    this.evaluateProfitRules(input, thresholds, signals, evaluations, executedAt);
    this.evaluateAdvertisingRules(input, thresholds, signals, evaluations, executedAt);
    this.evaluateInventoryRules(input, thresholds, signals, evaluations, executedAt);
    this.evaluateReturnRules(input, thresholds, signals, evaluations, executedAt);
    this.evaluateReviewRules(input, thresholds, signals, evaluations, executedAt);
    this.evaluateCompetitorRules(input, thresholds, signals, evaluations, executedAt);

    // Aggregate summary
    const criticalSignals = signals.filter((s) => s.severity === 'CRITICAL').length;
    const warningSignals = signals.filter((s) => s.severity === 'WARNING').length;
    const infoSignals = signals.filter((s) => s.severity === 'INFO').length;

    const triggeredCount = evaluations.filter((e) => e.status === 'TRIGGERED').length;
    const noAnomalyCount = evaluations.filter((e) => e.status === 'NO_ANOMALY').length;
    const notEvaluatedCount = evaluations.filter((e) => e.status === 'NOT_EVALUATED').length;

    return {
      signals,
      evaluations,
      summary: {
        totalRules: evaluations.length,
        triggeredCount,
        noAnomalyCount,
        notEvaluatedCount,
        criticalSignals,
        warningSignals,
        infoSignals,
      },
      context: {
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        marketplaceId: input.marketplaceId,
        category: input.category,
        dateRange: input.dateRange,
      },
      thresholdVersion: thresholds.version,
      executedAt,
    };
  }

  /**
   * Convenience method returning only the triggered signals.
   */
  public detectSignals(input: OperationAnomalyDetectionInput): BusinessSignal[] {
    return this.detect(input).signals;
  }

  // ==========================================================================
  // Rule Group: PROFIT (R-PROF-01, R-PROF-02)
  // ==========================================================================

  private evaluateProfitRules(
    input: OperationAnomalyDetectionInput,
    thresholds: AnomalyThresholdConfig,
    signals: BusinessSignal[],
    evaluations: RuleEvaluationRecord[],
    executedAt: string
  ): void {
    const fin = input.financials;

    // R-PROF-01: PROFIT_DROP
    if (fin?.availability === 'UNAVAILABLE' || !fin?.current || !fin?.baseline) {
      evaluations.push({
        ruleId: 'R-PROF-01',
        ruleCode: 'PROFIT_DROP',
        ruleName: 'Net Profit Baseline Drop',
        domain: 'PROFIT',
        status: 'NOT_EVALUATED',
        dataAvailability: fin?.availability || 'UNAVAILABLE',
        reason: 'Current or baseline net profit data is missing or marked UNAVAILABLE.',
        evaluatedAt: executedAt,
      });
    } else {
      const currProfit = roundMoney(fin.current.netProfit);
      const baseProfit = roundMoney(fin.baseline.netProfit);

      // False positive defense: cannot calculate relative drop percentage from non-positive baseline
      if (baseProfit <= 0) {
        evaluations.push({
          ruleId: 'R-PROF-01',
          ruleCode: 'PROFIT_DROP',
          ruleName: 'Net Profit Baseline Drop',
          domain: 'PROFIT',
          status: 'NOT_EVALUATED',
          dataAvailability: fin.availability || 'AVAILABLE',
          reason: `Baseline net profit is non-positive ($${baseProfit.toFixed(2)}). Relative percentage drop is mathematically undefined; evaluated via R-PROF-02 margin rule.`,
          metrics: { currentProfit: currProfit, baselineProfit: baseProfit },
          evaluatedAt: executedAt,
        });
      } else {
        const delta = roundMoney(currProfit - baseProfit);
        const changePct = roundMargin((currProfit - baseProfit) / baseProfit);
        const dropPct = -changePct; // Positive drop value

        if (dropPct >= thresholds.profitDropPctThreshold) {
          const signalId = buildIdempotentSignalId('R-PROF-01', input.workspaceId, input.skuId, input.dateRange);
          const evidenceItem: OperationEvidenceItem = {
            evidenceId: `EV-${signalId}-01`,
            category: 'CALCULATED_METRIC',
            title: 'Net Profit Variance Attribution',
            content: `Net profit dropped from $${baseProfit.toFixed(2)} to $${currProfit.toFixed(2)} (delta: $${delta.toFixed(2)}, ${(changePct * 100).toFixed(1)}%), exceeding threshold of -${(thresholds.profitDropPctThreshold * 100).toFixed(1)}%.`,
            source: 'ProfitCalculationService',
            sourceId: 'calculateProfit',
            capturedAt: executedAt,
            metadata: {
              currentProfit: currProfit,
              baselineProfit: baseProfit,
              delta,
              changePct,
              threshold: thresholds.profitDropPctThreshold,
            },
          };

          signals.push({
            signalId,
            workspaceId: input.workspaceId,
            skuId: input.skuId,
            asin: input.asin,
            domain: 'PROFIT',
            code: 'PROFIT_DROP',
            metric: 'netProfit',
            currentValue: currProfit,
            baselineValue: baseProfit,
            changePct,
            thresholdValue: thresholds.profitDropPctThreshold,
            severity: 'CRITICAL',
            direction: 'DOWN',
            detectedBy: 'FORMULA',
            ruleId: 'R-PROF-01',
            title: `Net Profit Dropped ${(dropPct * 100).toFixed(1)}%`,
            description: `Net profit decreased by $${Math.abs(delta).toFixed(2)} (-${(dropPct * 100).toFixed(1)}%) compared to baseline period, exceeding the ${(thresholds.profitDropPctThreshold * 100).toFixed(1)}% drop threshold.`,
            evidence: [evidenceItem],
            detectedAt: executedAt,
          });

          evaluations.push({
            ruleId: 'R-PROF-01',
            ruleCode: 'PROFIT_DROP',
            ruleName: 'Net Profit Baseline Drop',
            domain: 'PROFIT',
            status: 'TRIGGERED',
            dataAvailability: fin.availability || 'AVAILABLE',
            signalId,
            reason: `Net profit dropped ${(dropPct * 100).toFixed(1)}% (threshold: ${(thresholds.profitDropPctThreshold * 100).toFixed(1)}%).`,
            metrics: { currentProfit: currProfit, baselineProfit: baseProfit, dropPct },
            evaluatedAt: executedAt,
          });
        } else {
          evaluations.push({
            ruleId: 'R-PROF-01',
            ruleCode: 'PROFIT_DROP',
            ruleName: 'Net Profit Baseline Drop',
            domain: 'PROFIT',
            status: 'NO_ANOMALY',
            dataAvailability: fin.availability || 'AVAILABLE',
            reason: `Net profit change (${(changePct * 100).toFixed(1)}%) is within acceptable threshold (-${(thresholds.profitDropPctThreshold * 100).toFixed(1)}%).`,
            metrics: { currentProfit: currProfit, baselineProfit: baseProfit, changePct },
            evaluatedAt: executedAt,
          });
        }
      }
    }

    // R-PROF-02: CRITICAL_MARGIN
    if (fin?.availability === 'UNAVAILABLE' || !fin?.current) {
      evaluations.push({
        ruleId: 'R-PROF-02',
        ruleCode: 'CRITICAL_MARGIN',
        ruleName: 'Critical Net Margin Floor',
        domain: 'PROFIT',
        status: 'NOT_EVALUATED',
        dataAvailability: fin?.availability || 'UNAVAILABLE',
        reason: 'Current financial data unavailable to evaluate net margin.',
        evaluatedAt: executedAt,
      });
    } else {
      const currProfit = roundMoney(fin.current.netProfit);
      const revenue = roundMoney(fin.current.revenue);

      let margin: number;
      if (fin.current.margin !== undefined) {
        margin = roundMargin(fin.current.margin);
      } else if (revenue > 0) {
        margin = roundMargin(currProfit / revenue);
      } else if (currProfit < 0) {
        margin = -1.0;
      } else {
        margin = 0;
      }

      // If no business revenue and no profit delta (zero sales activity), avoid false alert
      if (revenue === 0 && currProfit === 0) {
        evaluations.push({
          ruleId: 'R-PROF-02',
          ruleCode: 'CRITICAL_MARGIN',
          ruleName: 'Critical Net Margin Floor',
          domain: 'PROFIT',
          status: 'NOT_EVALUATED',
          dataAvailability: fin.availability || 'PARTIAL',
          reason: 'Revenue and profit are zero with no order activity. Margin rule not evaluated.',
          evaluatedAt: executedAt,
        });
      } else if (margin < thresholds.criticalMarginRateThreshold || margin < 0) {
        const signalId = buildIdempotentSignalId('R-PROF-02', input.workspaceId, input.skuId, input.dateRange);
        const evidenceItem: OperationEvidenceItem = {
          evidenceId: `EV-${signalId}-01`,
          category: 'CALCULATED_METRIC',
          title: 'Net Margin Ratio Calculation',
          content: `Net margin is ${(margin * 100).toFixed(1)}% (Profit: $${currProfit.toFixed(2)}, Revenue: $${revenue.toFixed(2)}), falling below configured safety floor of ${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}%.`,
          source: 'ProfitCalculationService',
          sourceId: 'roundMargin',
          capturedAt: executedAt,
          metadata: {
            netProfit: currProfit,
            revenue,
            margin,
            threshold: thresholds.criticalMarginRateThreshold,
          },
        };

        signals.push({
          signalId,
          workspaceId: input.workspaceId,
          skuId: input.skuId,
          asin: input.asin,
          domain: 'PROFIT',
          code: 'CRITICAL_MARGIN',
          metric: 'margin',
          currentValue: margin,
          thresholdValue: thresholds.criticalMarginRateThreshold,
          severity: 'CRITICAL',
          direction: margin < 0 ? 'DOWN' : 'STABLE',
          detectedBy: 'RULE',
          ruleId: 'R-PROF-02',
          title: `Net Margin at ${(margin * 100).toFixed(1)}% (Critical Floor Breach)`,
          description: `Current net margin of ${(margin * 100).toFixed(1)}% is below the ${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}% safety floor (or negative), risking operating losses.`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
        });

        evaluations.push({
          ruleId: 'R-PROF-02',
          ruleCode: 'CRITICAL_MARGIN',
          ruleName: 'Critical Net Margin Floor',
          domain: 'PROFIT',
          status: 'TRIGGERED',
          dataAvailability: fin.availability || 'AVAILABLE',
          signalId,
          reason: `Net margin ${(margin * 100).toFixed(1)}% is below configured safety floor ${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}%.`,
          metrics: { margin, netProfit: currProfit, revenue },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-PROF-02',
          ruleCode: 'CRITICAL_MARGIN',
          ruleName: 'Critical Net Margin Floor',
          domain: 'PROFIT',
          status: 'NO_ANOMALY',
          dataAvailability: fin.availability || 'AVAILABLE',
          reason: `Net margin ${(margin * 100).toFixed(1)}% meets safety floor threshold (${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}%).`,
          metrics: { margin, netProfit: currProfit, revenue },
          evaluatedAt: executedAt,
        });
      }
    }
  }

  // ==========================================================================
  // Rule Group: ADVERTISING (R-ADS-01, R-ADS-02, R-ADS-03)
  // ==========================================================================

  private evaluateAdvertisingRules(
    input: OperationAnomalyDetectionInput,
    thresholds: AnomalyThresholdConfig,
    signals: BusinessSignal[],
    evaluations: RuleEvaluationRecord[],
    executedAt: string
  ): void {
    const ads = input.advertising;

    // R-ADS-01: ACOS_SPIKE
    if (ads?.availability === 'UNAVAILABLE' || !ads?.current) {
      evaluations.push({
        ruleId: 'R-ADS-01',
        ruleCode: 'ACOS_SPIKE',
        ruleName: 'ACOS Spike Above Target',
        domain: 'ADVERTISING',
        status: 'NOT_EVALUATED',
        dataAvailability: ads?.availability || 'UNAVAILABLE',
        reason: 'Current advertising performance data is unavailable.',
        evaluatedAt: executedAt,
      });
    } else {
      const spend = roundMoney(ads.current.spend);
      const sales = roundMoney(ads.current.sales);
      const targetAcos = ads.targetAcos ?? 0.30;

      if (spend === 0) {
        evaluations.push({
          ruleId: 'R-ADS-01',
          ruleCode: 'ACOS_SPIKE',
          ruleName: 'ACOS Spike Above Target',
          domain: 'ADVERTISING',
          status: 'NO_ANOMALY',
          dataAvailability: ads.availability || 'AVAILABLE',
          reason: 'Zero advertising spend recorded.',
          evaluatedAt: executedAt,
        });
      } else if (sales === 0 && spend < MIN_AD_SPEND_SAMPLE_USD) {
        evaluations.push({
          ruleId: 'R-ADS-01',
          ruleCode: 'ACOS_SPIKE',
          ruleName: 'ACOS Spike Above Target',
          domain: 'ADVERTISING',
          status: 'NOT_EVALUATED',
          dataAvailability: ads.availability || 'PARTIAL',
          reason: `Spend ($${spend.toFixed(2)}) is below minimal statistical sample floor ($${MIN_AD_SPEND_SAMPLE_USD.toFixed(2)}).`,
          evaluatedAt: executedAt,
        });
      } else {
        const acos = ads.current.acos !== undefined
          ? roundMargin(ads.current.acos)
          : (sales > 0 ? roundMargin(spend / sales) : 1.0);

        const targetLimit = roundMargin(targetAcos * (1 + thresholds.acosTargetDeviationThreshold));
        const isSpike = acos > thresholds.maxAcosThreshold && acos > targetLimit;

        if (isSpike) {
          const signalId = buildIdempotentSignalId('R-ADS-01', input.workspaceId, input.skuId, input.dateRange);
          const evidenceItem: OperationEvidenceItem = {
            evidenceId: `EV-${signalId}-01`,
            category: 'CALCULATED_METRIC',
            title: 'ACOS Target Deviation Analysis',
            content: `ACOS climbed to ${(acos * 100).toFixed(1)}% (Spend: $${spend.toFixed(2)}, Sales: $${sales.toFixed(2)}), exceeding absolute ceiling of ${(thresholds.maxAcosThreshold * 100).toFixed(1)}% and target ${(targetAcos * 100).toFixed(0)}% by more than ${(thresholds.acosTargetDeviationThreshold * 100).toFixed(0)}%.`,
            source: 'AdOptimizerService',
            sourceId: 'analyzeSearchTerm',
            capturedAt: executedAt,
            metadata: { spend, sales, acos, targetAcos, maxAcosThreshold: thresholds.maxAcosThreshold },
          };

          signals.push({
            signalId,
            workspaceId: input.workspaceId,
            skuId: input.skuId,
            asin: input.asin,
            domain: 'ADVERTISING',
            code: 'ACOS_SPIKE',
            metric: 'acos',
            currentValue: acos,
            baselineValue: targetAcos,
            changePct: roundMargin((acos - targetAcos) / targetAcos),
            thresholdValue: thresholds.maxAcosThreshold,
            severity: 'WARNING',
            direction: 'UP',
            detectedBy: 'RULE',
            ruleId: 'R-ADS-01',
            title: `ACOS Spiked to ${(acos * 100).toFixed(1)}% (Target: ${(targetAcos * 100).toFixed(0)}%)`,
            description: `ACOS reached ${(acos * 100).toFixed(1)}%, surpassing both absolute ceiling (${(thresholds.maxAcosThreshold * 100).toFixed(1)}%) and target threshold.`,
            evidence: [evidenceItem],
            detectedAt: executedAt,
          });

          evaluations.push({
            ruleId: 'R-ADS-01',
            ruleCode: 'ACOS_SPIKE',
            ruleName: 'ACOS Spike Above Target',
            domain: 'ADVERTISING',
            status: 'TRIGGERED',
            dataAvailability: ads.availability || 'AVAILABLE',
            signalId,
            reason: `ACOS ${(acos * 100).toFixed(1)}% breached both ${(thresholds.maxAcosThreshold * 100).toFixed(1)}% ceiling and target allowance.`,
            metrics: { acos, spend, sales, targetAcos },
            evaluatedAt: executedAt,
          });
        } else {
          evaluations.push({
            ruleId: 'R-ADS-01',
            ruleCode: 'ACOS_SPIKE',
            ruleName: 'ACOS Spike Above Target',
            domain: 'ADVERTISING',
            status: 'NO_ANOMALY',
            dataAvailability: ads.availability || 'AVAILABLE',
            reason: `ACOS ${(acos * 100).toFixed(1)}% is within acceptable bounds.`,
            metrics: { acos, spend, sales, targetAcos },
            evaluatedAt: executedAt,
          });
        }
      }
    }

    // R-ADS-02: AD_SPEND_INEFFICIENT
    if (ads?.availability === 'UNAVAILABLE' || !ads?.current || !ads?.baseline) {
      evaluations.push({
        ruleId: 'R-ADS-02',
        ruleCode: 'AD_SPEND_INEFFICIENT',
        ruleName: 'Inefficient Ad Spend Expansion',
        domain: 'ADVERTISING',
        status: 'NOT_EVALUATED',
        dataAvailability: ads?.availability || 'UNAVAILABLE',
        reason: 'Current or baseline advertising metrics are missing.',
        evaluatedAt: executedAt,
      });
    } else {
      const currSpend = roundMoney(ads.current.spend);
      const baseSpend = roundMoney(ads.baseline.spend);
      const currSales = roundMoney(ads.current.sales);
      const baseSales = roundMoney(ads.baseline.sales);

      if (baseSpend <= 0) {
        evaluations.push({
          ruleId: 'R-ADS-02',
          ruleCode: 'AD_SPEND_INEFFICIENT',
          ruleName: 'Inefficient Ad Spend Expansion',
          domain: 'ADVERTISING',
          status: 'NOT_EVALUATED',
          dataAvailability: ads.availability || 'AVAILABLE',
          reason: 'Baseline ad spend is zero; cannot evaluate relative spend expansion rate.',
          evaluatedAt: executedAt,
        });
      } else {
        const spendGrowth = roundMargin((currSpend - baseSpend) / baseSpend);
        const salesGrowth = baseSales > 0 ? roundMargin((currSales - baseSales) / baseSales) : (currSales > 0 ? 1.0 : 0);

        if (spendGrowth > thresholds.adSpendGrowthMaxThreshold && salesGrowth <= 0) {
          const signalId = buildIdempotentSignalId('R-ADS-02', input.workspaceId, input.skuId, input.dateRange);
          const evidenceItem: OperationEvidenceItem = {
            evidenceId: `EV-${signalId}-01`,
            category: 'CALCULATED_METRIC',
            title: 'Ad Spend vs Sales Growth Disconnect',
            content: `Ad spend surged ${(spendGrowth * 100).toFixed(1)}% ($${baseSpend.toFixed(2)} -> $${currSpend.toFixed(2)}), but attributed revenue did not grow (${(salesGrowth * 100).toFixed(1)}%, $${baseSales.toFixed(2)} -> $${currSales.toFixed(2)}).`,
            source: 'AdOptimizerService',
            capturedAt: executedAt,
            metadata: { currSpend, baseSpend, spendGrowth, currSales, baseSales, salesGrowth },
          };

          signals.push({
            signalId,
            workspaceId: input.workspaceId,
            skuId: input.skuId,
            asin: input.asin,
            domain: 'ADVERTISING',
            code: 'AD_SPEND_INEFFICIENT',
            metric: 'spendGrowth',
            currentValue: currSpend,
            baselineValue: baseSpend,
            changePct: spendGrowth,
            thresholdValue: thresholds.adSpendGrowthMaxThreshold,
            severity: 'CRITICAL',
            direction: 'UP',
            detectedBy: 'FORMULA',
            ruleId: 'R-ADS-02',
            title: `Ad Spend Surge (+${(spendGrowth * 100).toFixed(1)}%) with Zero Sales Growth`,
            description: `Ad budget expanded by ${(spendGrowth * 100).toFixed(1)}% ($${currSpend - baseSpend > 0 ? '+' : ''}$${(currSpend - baseSpend).toFixed(2)}) without generating incremental sales revenue (${(salesGrowth * 100).toFixed(1)}%).`,
            evidence: [evidenceItem],
            detectedAt: executedAt,
          });

          evaluations.push({
            ruleId: 'R-ADS-02',
            ruleCode: 'AD_SPEND_INEFFICIENT',
            ruleName: 'Inefficient Ad Spend Expansion',
            domain: 'ADVERTISING',
            status: 'TRIGGERED',
            dataAvailability: ads.availability || 'AVAILABLE',
            signalId,
            reason: `Spend growth ${(spendGrowth * 100).toFixed(1)}% exceeds ${(thresholds.adSpendGrowthMaxThreshold * 100).toFixed(1)}% with sales growth ${(salesGrowth * 100).toFixed(1)}% <= 0.`,
            metrics: { spendGrowth, salesGrowth, currSpend, baseSpend },
            evaluatedAt: executedAt,
          });
        } else {
          evaluations.push({
            ruleId: 'R-ADS-02',
            ruleCode: 'AD_SPEND_INEFFICIENT',
            ruleName: 'Inefficient Ad Spend Expansion',
            domain: 'ADVERTISING',
            status: 'NO_ANOMALY',
            dataAvailability: ads.availability || 'AVAILABLE',
            reason: 'Ad spend growth is aligned with sales velocity or within threshold.',
            metrics: { spendGrowth, salesGrowth },
            evaluatedAt: executedAt,
          });
        }
      }
    }

    // R-ADS-03: ZERO_CONVERSION_SPEND
    if (ads?.availability === 'UNAVAILABLE' || (!ads?.searchTerms && ads?.current?.clicks === undefined)) {
      evaluations.push({
        ruleId: 'R-ADS-03',
        ruleCode: 'ZERO_CONVERSION_SPEND',
        ruleName: 'Zero Conversion Wasted Spend',
        domain: 'ADVERTISING',
        status: 'NOT_EVALUATED',
        dataAvailability: ads?.availability || 'UNAVAILABLE',
        reason: 'No search term or click conversion telemetry available.',
        evaluatedAt: executedAt,
      });
    } else if (ads.searchTerms && ads.searchTerms.length > 0) {
      // Granular search-term level detection
      const wastefulTerms = ads.searchTerms.filter(
        (t) => t.clicks >= thresholds.zeroConversionClicksThreshold && t.orders === 0
      );

      if (wastefulTerms.length > 0) {
        // Sort by highest spend to pick primary offender
        wastefulTerms.sort((a, b) => b.spend - a.spend);
        const topTerm = wastefulTerms[0];

        const signalId = buildIdempotentSignalId('R-ADS-03', input.workspaceId, input.skuId, input.dateRange, topTerm.searchTerm);
        const evidenceItem: OperationEvidenceItem = {
          evidenceId: `EV-${signalId}-01`,
          category: 'DATABASE',
          title: `Search Term Waste: "${topTerm.searchTerm}"`,
          content: `Search term "${topTerm.searchTerm}" consumed ${topTerm.clicks} clicks with $${topTerm.spend.toFixed(2)} spend and 0 orders in campaign ${topTerm.campaignId || 'DEFAULT'}.`,
          source: 'AdOptimizerService',
          sourceId: topTerm.searchTerm,
          capturedAt: executedAt,
          metadata: {
            searchTerm: topTerm.searchTerm,
            clicks: topTerm.clicks,
            spend: topTerm.spend,
            orders: topTerm.orders,
            threshold: thresholds.zeroConversionClicksThreshold,
            campaignId: topTerm.campaignId,
          },
        };

        signals.push({
          signalId,
          workspaceId: input.workspaceId,
          skuId: input.skuId,
          asin: input.asin,
          domain: 'ADVERTISING',
          code: 'ZERO_CONVERSION_SPEND',
          metric: 'clicks',
          currentValue: topTerm.clicks,
          thresholdValue: thresholds.zeroConversionClicksThreshold,
          severity: 'WARNING',
          direction: 'UP',
          detectedBy: 'RULE',
          ruleId: 'R-ADS-03',
          title: `Wasted Ad Spend: "${topTerm.searchTerm}" (${topTerm.clicks} Clicks, $${topTerm.spend.toFixed(2)}, 0 Orders)`,
          description: `Search term "${topTerm.searchTerm}" consumed ${topTerm.clicks} clicks ($${topTerm.spend.toFixed(2)}) without generating a single order. Recommend Negative Exact isolation.`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
          metadata: {
            searchTerm: topTerm.searchTerm,
            campaignId: topTerm.campaignId,
            wastedSpend: topTerm.spend,
          },
        });

        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: 'Zero Conversion Wasted Spend',
          domain: 'ADVERTISING',
          status: 'TRIGGERED',
          dataAvailability: 'AVAILABLE',
          signalId,
          reason: `Found ${wastefulTerms.length} search term(s) with >= ${thresholds.zeroConversionClicksThreshold} clicks and 0 orders. Top wasted: "${topTerm.searchTerm}" ($${topTerm.spend.toFixed(2)}).`,
          metrics: { topTerm: topTerm.searchTerm, clicks: topTerm.clicks, spend: topTerm.spend },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: 'Zero Conversion Wasted Spend',
          domain: 'ADVERTISING',
          status: 'NO_ANOMALY',
          dataAvailability: 'AVAILABLE',
          reason: `Evaluated ${ads.searchTerms.length} search term(s); none breached zero-conversion threshold (${thresholds.zeroConversionClicksThreshold} clicks).`,
          evaluatedAt: executedAt,
        });
      }
    } else {
      // Aggregate click level fallback
      const clicks = ads.current?.clicks ?? 0;
      const orders = ads.current?.orders ?? 0;
      const spend = ads.current?.spend ?? 0;

      if (clicks >= thresholds.zeroConversionClicksThreshold && orders === 0) {
        const signalId = buildIdempotentSignalId('R-ADS-03', input.workspaceId, input.skuId, input.dateRange, 'aggregate');
        const evidenceItem: OperationEvidenceItem = {
          evidenceId: `EV-${signalId}-01`,
          category: 'DATABASE',
          title: 'Aggregate Campaign Zero-Conversion',
          content: `Campaign generated ${clicks} clicks and $${spend.toFixed(2)} spend with 0 orders.`,
          source: 'AdOptimizerService',
          capturedAt: executedAt,
          metadata: { clicks, orders, spend },
        };

        signals.push({
          signalId,
          workspaceId: input.workspaceId,
          skuId: input.skuId,
          asin: input.asin,
          domain: 'ADVERTISING',
          code: 'ZERO_CONVERSION_SPEND',
          metric: 'clicks',
          currentValue: clicks,
          thresholdValue: thresholds.zeroConversionClicksThreshold,
          severity: 'WARNING',
          direction: 'UP',
          detectedBy: 'RULE',
          ruleId: 'R-ADS-03',
          title: `Zero Orders Across ${clicks} Clicks ($${spend.toFixed(2)} Spend)`,
          description: `Total ad traffic produced ${clicks} clicks without a conversion.`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
        });

        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: 'Zero Conversion Wasted Spend',
          domain: 'ADVERTISING',
          status: 'TRIGGERED',
          dataAvailability: 'PARTIAL',
          signalId,
          reason: `Aggregate clicks ${clicks} >= ${thresholds.zeroConversionClicksThreshold} with 0 orders.`,
          metrics: { clicks, orders, spend },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: 'Zero Conversion Wasted Spend',
          domain: 'ADVERTISING',
          status: 'NO_ANOMALY',
          dataAvailability: ads.availability || 'AVAILABLE',
          reason: 'No zero-conversion spend pattern detected.',
          metrics: { clicks, orders },
          evaluatedAt: executedAt,
        });
      }
    }
  }

  // ==========================================================================
  // Rule Group: INVENTORY (R-INV-01, R-INV-02, R-INV-03)
  // ==========================================================================

  private evaluateInventoryRules(
    input: OperationAnomalyDetectionInput,
    thresholds: AnomalyThresholdConfig,
    signals: BusinessSignal[],
    evaluations: RuleEvaluationRecord[],
    executedAt: string
  ): void {
    const inv = input.inventory;

    if (inv?.availability === 'UNAVAILABLE' || !inv?.current) {
      const notEvalReasons = [
        { id: 'R-INV-01', code: 'STOCKOUT_IMMINENT', name: 'Imminent Stockout Risk' },
        { id: 'R-INV-02', code: 'OUT_OF_STOCK', name: 'Fulfillable Stockout (0 Units)' },
        { id: 'R-INV-03', code: 'EXCESS_INVENTORY', name: 'Excess Inventory Coverage' },
      ];
      for (const r of notEvalReasons) {
        evaluations.push({
          ruleId: r.id,
          ruleCode: r.code,
          ruleName: r.name,
          domain: 'INVENTORY',
          status: 'NOT_EVALUATED',
          dataAvailability: inv?.availability || 'UNAVAILABLE',
          reason: 'Inventory stock telemetry is unavailable.',
          evaluatedAt: executedAt,
        });
      }
      return;
    }

    const cur = inv.current;
    const fulfillable = Math.max(0, cur.fulfillableQuantity);
    const inbound = Math.max(0, cur.inboundQuantity ?? 0);
    const velocity = Math.max(0, cur.avgDailySales);
    const leadTime = Math.max(0, cur.leadTimeDays);

    // Reuse InventoryPlanningService
    const plan = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: fulfillable,
      inboundQuantity: inbound,
      avgDailySales: velocity,
      leadTimeDays: leadTime,
      safetyStockDays: cur.safetyStockDays,
      targetDaysCover: cur.targetDaysCover,
    });

    const daysCover = cur.daysCover !== undefined ? cur.daysCover : plan.daysCover;

    // R-INV-02: OUT_OF_STOCK (Checked first: 0 units is OUT_OF_STOCK, not IMMINENT)
    if (fulfillable <= thresholds.stockoutUnitsThreshold) {
      const signalId = buildIdempotentSignalId('R-INV-02', input.workspaceId, input.skuId, input.dateRange);
      const evidenceItem: OperationEvidenceItem = {
        evidenceId: `EV-${signalId}-01`,
        category: 'DATABASE',
        title: 'Fulfillable Inventory Stockout',
        content: `Available fulfillable inventory has dropped to 0 units. Inbound pipeline: ${inbound} units. Estimated lost daily revenue: $${roundMoney(velocity * 29.99).toFixed(2)}.`,
        source: 'inventory_snapshot',
        capturedAt: executedAt,
        metadata: { fulfillable, inbound, velocity, leadTime },
      };

      signals.push({
        signalId,
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        asin: input.asin,
        domain: 'INVENTORY',
        code: 'OUT_OF_STOCK',
        metric: 'fulfillableQuantity',
        currentValue: fulfillable,
        thresholdValue: thresholds.stockoutUnitsThreshold,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'RULE',
        ruleId: 'R-INV-02',
        title: 'Out of Stock (0 Fulfillable Units)',
        description: 'Fulfillable inventory is completely depleted (0 units). Sales velocity halted, damaging organic ranking.',
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-INV-02',
        ruleCode: 'OUT_OF_STOCK',
        ruleName: 'Fulfillable Stockout (0 Units)',
        domain: 'INVENTORY',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: 'Fulfillable inventory is 0 units.',
        metrics: { fulfillable, inbound, velocity },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-INV-02',
        ruleCode: 'OUT_OF_STOCK',
        ruleName: 'Fulfillable Stockout (0 Units)',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `Fulfillable inventory (${fulfillable} units) > 0.`,
        metrics: { fulfillable },
        evaluatedAt: executedAt,
      });
    }

    // R-INV-01: STOCKOUT_IMMINENT
    if (fulfillable === 0) {
      // Already out of stock; imminent stockout is superseded
      evaluations.push({
        ruleId: 'R-INV-01',
        ruleCode: 'STOCKOUT_IMMINENT',
        ruleName: 'Imminent Stockout Risk',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: 'SKU is already completely out of stock; covered by R-INV-02.',
        metrics: { daysCover, fulfillable },
        evaluatedAt: executedAt,
      });
    } else if (velocity <= 0) {
      evaluations.push({
        ruleId: 'R-INV-01',
        ruleCode: 'STOCKOUT_IMMINENT',
        ruleName: 'Imminent Stockout Risk',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: 'Zero sales velocity; days cover is effectively infinite.',
        metrics: { daysCover, velocity },
        evaluatedAt: executedAt,
      });
    } else {
      const effectiveLeadTimeLimit = Math.round(leadTime * thresholds.minDaysCoverLeadTimeFactor);
      const criticalLimit = Math.max(effectiveLeadTimeLimit, thresholds.criticalDaysCoverFloor);

      if (daysCover <= criticalLimit) {
        const signalId = buildIdempotentSignalId('R-INV-01', input.workspaceId, input.skuId, input.dateRange);
        const evidenceItem: OperationEvidenceItem = {
          evidenceId: `EV-${signalId}-01`,
          category: 'CALCULATED_METRIC',
          title: 'Replenishment Runout Planning',
          content: `Current stock of ${fulfillable} units at ${velocity.toFixed(1)} units/day provides only ${daysCover.toFixed(1)} days cover. This is below the replenishment threshold of ${criticalLimit} days (Lead time: ${leadTime}d, Configured Floor: ${thresholds.criticalDaysCoverFloor}d). Recommended PO: ${plan.recommendedQuantity} units.`,
          source: 'InventoryPlanningService',
          sourceId: 'calculatePlanning',
          capturedAt: executedAt,
          metadata: {
            fulfillable,
            inbound,
            velocity,
            daysCover,
            criticalLimit,
            reorderPoint: plan.reorderPoint,
            recommendedQuantity: plan.recommendedQuantity,
          },
        };

        signals.push({
          signalId,
          workspaceId: input.workspaceId,
          skuId: input.skuId,
          asin: input.asin,
          domain: 'INVENTORY',
          code: 'STOCKOUT_IMMINENT',
          metric: 'daysCover',
          currentValue: daysCover,
          thresholdValue: criticalLimit,
          severity: 'CRITICAL',
          direction: 'DOWN',
          detectedBy: 'FORMULA',
          ruleId: 'R-INV-01',
          title: `Imminent Stockout Risk (${daysCover.toFixed(1)} Days Cover <= ${criticalLimit}d Lead Time)`,
          description: `Inventory coverage of ${daysCover.toFixed(1)} days cannot cover supplier replenishment lead time (${leadTime} days). Emergency reorder required.`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
          metadata: { recommendedQuantity: plan.recommendedQuantity },
        });

        evaluations.push({
          ruleId: 'R-INV-01',
          ruleCode: 'STOCKOUT_IMMINENT',
          ruleName: 'Imminent Stockout Risk',
          domain: 'INVENTORY',
          status: 'TRIGGERED',
          dataAvailability: 'AVAILABLE',
          signalId,
          reason: `Days cover ${daysCover.toFixed(1)} <= ${criticalLimit} days replenishment buffer.`,
          metrics: { daysCover, criticalLimit, fulfillable, velocity },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-INV-01',
          ruleCode: 'STOCKOUT_IMMINENT',
          ruleName: 'Imminent Stockout Risk',
          domain: 'INVENTORY',
          status: 'NO_ANOMALY',
          dataAvailability: 'AVAILABLE',
          reason: `Days cover ${daysCover.toFixed(1)} safely exceeds lead time buffer (${criticalLimit} days).`,
          metrics: { daysCover, criticalLimit },
          evaluatedAt: executedAt,
        });
      }
    }

    // R-INV-03: EXCESS_INVENTORY
    if (fulfillable > 0 && daysCover > thresholds.excessDaysCoverThreshold) {
      const signalId = buildIdempotentSignalId('R-INV-03', input.workspaceId, input.skuId, input.dateRange);
      const evidenceItem: OperationEvidenceItem = {
        evidenceId: `EV-${signalId}-01`,
        category: 'CALCULATED_METRIC',
        title: 'Excess Inventory Analysis',
        content: `Current stock of ${fulfillable} units represents ${daysCover.toFixed(0)} days cover, exceeding the ${thresholds.excessDaysCoverThreshold} days excess holding limit. Risk of FBA aged inventory surcharge.`,
        source: 'InventoryPlanningService',
        sourceId: 'calculatePlanning',
        capturedAt: executedAt,
        metadata: { fulfillable, velocity, daysCover, threshold: thresholds.excessDaysCoverThreshold },
      };

      signals.push({
        signalId,
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        asin: input.asin,
        domain: 'INVENTORY',
        code: 'EXCESS_INVENTORY',
        metric: 'daysCover',
        currentValue: daysCover,
        thresholdValue: thresholds.excessDaysCoverThreshold,
        severity: 'INFO',
        direction: 'UP',
        detectedBy: 'RULE',
        ruleId: 'R-INV-03',
        title: `Excess Inventory (${daysCover.toFixed(0)} Days Cover > ${thresholds.excessDaysCoverThreshold}d Limit)`,
        description: `Inventory coverage of ${daysCover.toFixed(0)} days exceeds the ${thresholds.excessDaysCoverThreshold}-day holding target. Consider promotion or price discount to accelerate sell-through.`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-INV-03',
        ruleCode: 'EXCESS_INVENTORY',
        ruleName: 'Excess Inventory Coverage',
        domain: 'INVENTORY',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `Days cover ${daysCover.toFixed(0)} > ${thresholds.excessDaysCoverThreshold} days.`,
        metrics: { daysCover, fulfillable },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-INV-03',
        ruleCode: 'EXCESS_INVENTORY',
        ruleName: 'Excess Inventory Coverage',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `Days cover ${daysCover.toFixed(0)} is within healthy threshold (<= ${thresholds.excessDaysCoverThreshold} days).`,
        metrics: { daysCover },
        evaluatedAt: executedAt,
      });
    }
  }

  // ==========================================================================
  // Rule Group: RETURNS (R-RET-01)
  // ==========================================================================

  private evaluateReturnRules(
    input: OperationAnomalyDetectionInput,
    thresholds: AnomalyThresholdConfig,
    signals: BusinessSignal[],
    evaluations: RuleEvaluationRecord[],
    executedAt: string
  ): void {
    const ret = input.returns;

    if (ret?.availability === 'UNAVAILABLE' || !ret?.current || !ret?.baseline) {
      evaluations.push({
        ruleId: 'R-RET-01',
        ruleCode: 'RETURN_RATE_SPIKE',
        ruleName: 'Return Rate Spike & Acceleration',
        domain: 'RETURNS',
        status: 'NOT_EVALUATED',
        dataAvailability: ret?.availability || 'UNAVAILABLE',
        reason: 'Current or baseline return tracking data unavailable.',
        evaluatedAt: executedAt,
      });
      return;
    }

    const curDelivered = ret.current.deliveredUnits;
    const curReturns = ret.current.returnUnits;
    const baseDelivered = ret.baseline.deliveredUnits;
    const baseReturns = ret.baseline.returnUnits;

    // False positive defense: Minimum sample check
    if (curDelivered < MIN_RETURN_DELIVERED_UNITS) {
      evaluations.push({
        ruleId: 'R-RET-01',
        ruleCode: 'RETURN_RATE_SPIKE',
        ruleName: 'Return Rate Spike & Acceleration',
        domain: 'RETURNS',
        status: 'NOT_EVALUATED',
        dataAvailability: ret.availability || 'PARTIAL',
        reason: `Delivered volume (${curDelivered} units) is below minimum statistical sample size (${MIN_RETURN_DELIVERED_UNITS} units) to prevent low-denominator false alarms.`,
        metrics: { curDelivered, curReturns },
        evaluatedAt: executedAt,
      });
      return;
    }

    const currRate = ret.current.returnRate !== undefined
      ? roundMargin(ret.current.returnRate)
      : (curDelivered > 0 ? roundMargin(curReturns / curDelivered) : 0);

    const baseRate = ret.baseline.returnRate !== undefined
      ? roundMargin(ret.baseline.returnRate)
      : (baseDelivered > 0 ? roundMargin(baseReturns / baseDelivered) : 0);

    let relativeGrowth: number;
    if (baseRate > 0) {
      relativeGrowth = roundMargin((currRate - baseRate) / baseRate);
    } else {
      relativeGrowth = currRate > 0 ? 1.0 : 0;
    }

    // Both conditions required (User Req §7: Absolute Floor + Relative Growth)
    const isSpike =
      currRate >= thresholds.returnRateSpikeThreshold &&
      relativeGrowth >= thresholds.returnRateGrowthThreshold;

    if (isSpike) {
      const signalId = buildIdempotentSignalId('R-RET-01', input.workspaceId, input.skuId, input.dateRange);
      const evidenceItem: OperationEvidenceItem = {
        evidenceId: `EV-${signalId}-01`,
        category: 'CALCULATED_METRIC',
        title: 'Return Rate Spike Verification',
        content: `Return rate surged from ${(baseRate * 100).toFixed(1)}% to ${(currRate * 100).toFixed(1)}% (+${(relativeGrowth * 100).toFixed(1)}%), exceeding both absolute floor ${(thresholds.returnRateSpikeThreshold * 100).toFixed(1)}% and relative surge threshold ${(thresholds.returnRateGrowthThreshold * 100).toFixed(1)}% (Current: ${curReturns}/${curDelivered}, Baseline: ${baseReturns}/${baseDelivered}).`,
        source: 'returns_summary',
        capturedAt: executedAt,
        metadata: {
          currRate,
          baseRate,
          relativeGrowth,
          curReturns,
          curDelivered,
          baseReturns,
          baseDelivered,
        },
      };

      signals.push({
        signalId,
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        asin: input.asin,
        domain: 'RETURNS',
        code: 'RETURN_RATE_SPIKE',
        metric: 'returnRate',
        currentValue: currRate,
        baselineValue: baseRate,
        changePct: relativeGrowth,
        thresholdValue: thresholds.returnRateSpikeThreshold,
        severity: 'WARNING',
        direction: 'UP',
        detectedBy: 'FORMULA',
        ruleId: 'R-RET-01',
        title: `Return Rate Spiked to ${(currRate * 100).toFixed(1)}% (+${(relativeGrowth * 100).toFixed(0)}% vs Baseline)`,
        description: `Customer returns accelerated to ${(currRate * 100).toFixed(1)}% (${curReturns} returns on ${curDelivered} delivered units), surging ${(relativeGrowth * 100).toFixed(0)}% over baseline. Review reasons for batch or sizing defects.`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-RET-01',
        ruleCode: 'RETURN_RATE_SPIKE',
        ruleName: 'Return Rate Spike & Acceleration',
        domain: 'RETURNS',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `Return rate ${(currRate * 100).toFixed(1)}% >= ${(thresholds.returnRateSpikeThreshold * 100).toFixed(1)}% floor AND grew ${(relativeGrowth * 100).toFixed(0)}% >= ${(thresholds.returnRateGrowthThreshold * 100).toFixed(0)}% growth threshold.`,
        metrics: { currRate, baseRate, relativeGrowth },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-RET-01',
        ruleCode: 'RETURN_RATE_SPIKE',
        ruleName: 'Return Rate Spike & Acceleration',
        domain: 'RETURNS',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `Return rate ${(currRate * 100).toFixed(1)}% is normal or within relative change tolerance.`,
        metrics: { currRate, baseRate, relativeGrowth },
        evaluatedAt: executedAt,
      });
    }
  }

  // ==========================================================================
  // Rule Group: REVIEWS (R-REV-01)
  // ==========================================================================

  private evaluateReviewRules(
    input: OperationAnomalyDetectionInput,
    thresholds: AnomalyThresholdConfig,
    signals: BusinessSignal[],
    evaluations: RuleEvaluationRecord[],
    executedAt: string
  ): void {
    const rev = input.reviews;

    if (rev?.availability === 'UNAVAILABLE' || !rev?.current) {
      evaluations.push({
        ruleId: 'R-REV-01',
        ruleCode: 'RATING_DETERIORATION',
        ruleName: 'Rating Deterioration & Negative Review Surge',
        domain: 'REVIEWS',
        status: 'NOT_EVALUATED',
        dataAvailability: rev?.availability || 'UNAVAILABLE',
        reason: 'Customer review and rating data unavailable.',
        evaluatedAt: executedAt,
      });
      return;
    }

    const cur = rev.current;
    const overallRating = cur.overallRating;
    const totalReviews = cur.totalReviews ?? 0;
    const recentNegative = cur.recentNegativeReviewsCount ?? 0;
    const recentTotal = cur.recentTotalReviewsCount ?? 0;

    const hasOverallData = overallRating !== undefined && totalReviews >= MIN_REVIEW_SAMPLE_COUNT;
    const hasRecentData = cur.recentNegativeReviewsCount !== undefined && recentTotal >= MIN_REVIEW_SAMPLE_COUNT;

    if (!hasOverallData && !hasRecentData) {
      evaluations.push({
        ruleId: 'R-REV-01',
        ruleCode: 'RATING_DETERIORATION',
        ruleName: 'Rating Deterioration & Negative Review Surge',
        domain: 'REVIEWS',
        status: 'NOT_EVALUATED',
        dataAvailability: rev.availability || 'PARTIAL',
        reason: `Review sample size insufficient for reliable evaluation (minimum ${MIN_REVIEW_SAMPLE_COUNT} reviews required).`,
        metrics: { totalReviews, recentTotal },
        evaluatedAt: executedAt,
      });
      return;
    }

    let isRatingBreached = false;
    let isRecentRatioBreached = false;
    let recentRatio = 0;

    if (hasOverallData && overallRating! < thresholds.ratingDeteriorationFloor) {
      isRatingBreached = true;
    }

    if (hasRecentData) {
      recentRatio = cur.recentNegativeReviewRatio !== undefined
        ? cur.recentNegativeReviewRatio
        : roundMargin(recentNegative / recentTotal);
      if (recentRatio > thresholds.recentNegativeReviewRatioThreshold) {
        isRecentRatioBreached = true;
      }
    }

    if (isRatingBreached || isRecentRatioBreached) {
      const signalId = buildIdempotentSignalId('R-REV-01', input.workspaceId, input.skuId, input.dateRange);
      const evidenceItem: OperationEvidenceItem = {
        evidenceId: `EV-${signalId}-01`,
        category: 'DATABASE',
        title: 'Review Health Telemetry Analysis',
        content: isRatingBreached
          ? `Overall rating dropped to ${overallRating?.toFixed(2)} stars (${totalReviews} reviews), falling below safety floor of ${thresholds.ratingDeteriorationFloor.toFixed(1)} stars.`
          : `Recent 7-day negative review ratio reached ${(recentRatio * 100).toFixed(1)}% (${recentNegative}/${recentTotal} negative reviews), exceeding threshold of ${(thresholds.recentNegativeReviewRatioThreshold * 100).toFixed(0)}%.`,
        source: 'reviews_summary',
        capturedAt: executedAt,
        metadata: {
          overallRating,
          totalReviews,
          recentNegative,
          recentTotal,
          recentRatio,
          floor: thresholds.ratingDeteriorationFloor,
          recentThreshold: thresholds.recentNegativeReviewRatioThreshold,
        },
      };

      signals.push({
        signalId,
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        asin: input.asin,
        domain: 'REVIEWS',
        code: 'RATING_DETERIORATION',
        metric: isRatingBreached ? 'overallRating' : 'recentNegativeReviewRatio',
        currentValue: isRatingBreached ? overallRating! : recentRatio,
        thresholdValue: isRatingBreached ? thresholds.ratingDeteriorationFloor : thresholds.recentNegativeReviewRatioThreshold,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'RULE',
        ruleId: 'R-REV-01',
        title: isRatingBreached
          ? `Product Rating Deterioration: ${overallRating?.toFixed(2)}★ (< ${thresholds.ratingDeteriorationFloor.toFixed(1)}★)`
          : `Recent Negative Review Surge: ${(recentRatio * 100).toFixed(1)}% 1-2★ Reviews`,
        description: isRatingBreached
          ? `Overall average rating of ${overallRating?.toFixed(2)}★ has fallen below the ${thresholds.ratingDeteriorationFloor.toFixed(1)}★ threshold, hurting conversion and buy box eligibility.`
          : `${(recentRatio * 100).toFixed(1)}% of reviews in the current period are negative (1-2★), exceeding the ${(thresholds.recentNegativeReviewRatioThreshold * 100).toFixed(0)}% threshold.`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-REV-01',
        ruleCode: 'RATING_DETERIORATION',
        ruleName: 'Rating Deterioration & Negative Review Surge',
        domain: 'REVIEWS',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: isRatingBreached
          ? `Rating ${overallRating} < ${thresholds.ratingDeteriorationFloor}★.`
          : `Recent negative review ratio ${(recentRatio * 100).toFixed(1)}% > ${(thresholds.recentNegativeReviewRatioThreshold * 100).toFixed(0)}%.`,
        metrics: { overallRating, recentRatio, totalReviews, recentTotal },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-REV-01',
        ruleCode: 'RATING_DETERIORATION',
        ruleName: 'Rating Deterioration & Negative Review Surge',
        domain: 'REVIEWS',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: 'Customer rating and review sentiment are healthy.',
        metrics: { overallRating, recentRatio },
        evaluatedAt: executedAt,
      });
    }
  }

  // ==========================================================================
  // Rule Group: COMPETITOR (R-COMP-01, R-COMP-02)
  // ==========================================================================

  private evaluateCompetitorRules(
    input: OperationAnomalyDetectionInput,
    thresholds: AnomalyThresholdConfig,
    signals: BusinessSignal[],
    evaluations: RuleEvaluationRecord[],
    executedAt: string
  ): void {
    const comp = input.competitors;

    // R-COMP-01: COMPETITOR_PRICE_DROP
    if (comp?.availability === 'UNAVAILABLE' || !comp?.items || comp.items.length === 0) {
      evaluations.push({
        ruleId: 'R-COMP-01',
        ruleCode: 'COMPETITOR_PRICE_DROP',
        ruleName: 'Competitor Aggressive Price Undercut',
        domain: 'COMPETITOR',
        status: 'NOT_EVALUATED',
        dataAvailability: comp?.availability || 'UNAVAILABLE',
        reason: 'Competitor pricing telemetry is unavailable.',
        evaluatedAt: executedAt,
      });
      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: 'Competitor Rating / Spec Advantage',
        domain: 'COMPETITOR',
        status: 'NOT_EVALUATED',
        dataAvailability: comp?.availability || 'UNAVAILABLE',
        reason: 'Competitor rating telemetry is unavailable.',
        evaluatedAt: executedAt,
      });
      return;
    }

    // Evaluate R-COMP-01 across items
    const priceDroppedItems = comp.items.filter((item) => {
      if (item.baselinePrice && item.baselinePrice > 0 && item.currentPrice > 0) {
        const dropPct = roundMargin((item.baselinePrice - item.currentPrice) / item.baselinePrice);
        return dropPct >= thresholds.competitorPriceDropPctThreshold;
      }
      return false;
    });

    if (priceDroppedItems.length > 0) {
      priceDroppedItems.sort((a, b) => {
        const dropA = (a.baselinePrice! - a.currentPrice) / a.baselinePrice!;
        const dropB = (b.baselinePrice! - b.currentPrice) / b.baselinePrice!;
        return dropB - dropA;
      });
      const topComp = priceDroppedItems[0];
      const dropPct = roundMargin((topComp.baselinePrice! - topComp.currentPrice) / topComp.baselinePrice!);

      const signalId = buildIdempotentSignalId('R-COMP-01', input.workspaceId, input.skuId, input.dateRange, topComp.competitorId);
      const evidenceItem: OperationEvidenceItem = {
        evidenceId: `EV-${signalId}-01`,
        category: 'EXTERNAL_DATA',
        title: `Competitor Undercut: ${topComp.name || topComp.asin || topComp.competitorId}`,
        content: `Competitor ${topComp.name || topComp.competitorId} (${topComp.asin || 'N/A'}) reduced price from $${topComp.baselinePrice!.toFixed(2)} to $${topComp.currentPrice.toFixed(2)} (-${(dropPct * 100).toFixed(1)}%), exceeding the ${(thresholds.competitorPriceDropPctThreshold * 100).toFixed(0)}% price drop threshold.`,
        source: 'competitor_crawler',
        sourceId: topComp.competitorId,
        capturedAt: executedAt,
        metadata: {
          competitorId: topComp.competitorId,
          asin: topComp.asin,
          currentPrice: topComp.currentPrice,
          baselinePrice: topComp.baselinePrice,
          dropPct,
          threshold: thresholds.competitorPriceDropPctThreshold,
        },
      };

      signals.push({
        signalId,
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        asin: input.asin,
        domain: 'COMPETITOR',
        code: 'COMPETITOR_PRICE_DROP',
        metric: 'competitorPrice',
        currentValue: topComp.currentPrice,
        baselineValue: topComp.baselinePrice,
        changePct: -dropPct,
        thresholdValue: thresholds.competitorPriceDropPctThreshold,
        severity: 'WARNING',
        direction: 'DOWN',
        detectedBy: 'RULE',
        ruleId: 'R-COMP-01',
        title: `Competitor Price Drop: ${topComp.name || topComp.competitorId} (-${(dropPct * 100).toFixed(1)}%)`,
        description: `Key competitor lowered price by ${(dropPct * 100).toFixed(1)}% to $${topComp.currentPrice.toFixed(2)}. Assess price elasticity and coupon match strategy.`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-COMP-01',
        ruleCode: 'COMPETITOR_PRICE_DROP',
        ruleName: 'Competitor Aggressive Price Undercut',
        domain: 'COMPETITOR',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `Competitor ${topComp.competitorId} dropped price by ${(dropPct * 100).toFixed(1)}% >= ${(thresholds.competitorPriceDropPctThreshold * 100).toFixed(0)}%.`,
        metrics: { competitorId: topComp.competitorId, currentPrice: topComp.currentPrice, baselinePrice: topComp.baselinePrice, dropPct },
        evaluatedAt: executedAt,
      });
    } else {
      const hasBaselinePrices = comp.items.some((i) => i.baselinePrice !== undefined && i.baselinePrice > 0);
      if (!hasBaselinePrices) {
        evaluations.push({
          ruleId: 'R-COMP-01',
          ruleCode: 'COMPETITOR_PRICE_DROP',
          ruleName: 'Competitor Aggressive Price Undercut',
          domain: 'COMPETITOR',
          status: 'NOT_EVALUATED',
          dataAvailability: 'PARTIAL',
          reason: 'Competitors are tracked but no historical baseline prices are recorded.',
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-COMP-01',
          ruleCode: 'COMPETITOR_PRICE_DROP',
          ruleName: 'Competitor Aggressive Price Undercut',
          domain: 'COMPETITOR',
          status: 'NO_ANOMALY',
          dataAvailability: 'AVAILABLE',
          reason: 'No key competitor price drop exceeded threshold.',
          evaluatedAt: executedAt,
        });
      }
    }

    // R-COMP-02: COMPETITOR_ADVANTAGE
    const ourRating = input.reviews?.current?.overallRating;
    if (ourRating === undefined) {
      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: 'Competitor Rating / Spec Advantage',
        domain: 'COMPETITOR',
        status: 'NOT_EVALUATED',
        dataAvailability: 'PARTIAL',
        reason: 'Our product rating is unavailable; cannot compute relative competitor advantage delta.',
        evaluatedAt: executedAt,
      });
      return;
    }

    const advantageItems = comp.items.filter(
      (i) => i.rating !== undefined && i.rating - ourRating >= thresholds.competitorRatingAdvantageDelta
    );

    if (advantageItems.length > 0) {
      advantageItems.sort((a, b) => b.rating! - a.rating!);
      const topAdv = advantageItems[0];
      const delta = roundMargin(topAdv.rating! - ourRating);

      const signalId = buildIdempotentSignalId('R-COMP-02', input.workspaceId, input.skuId, input.dateRange, topAdv.competitorId);
      const evidenceItem: OperationEvidenceItem = {
        evidenceId: `EV-${signalId}-01`,
        category: 'EXTERNAL_DATA',
        title: `Competitor Rating Advantage: ${topAdv.name || topAdv.asin || topAdv.competitorId}`,
        content: `Competitor ${topAdv.name || topAdv.competitorId} holds a ${topAdv.rating!.toFixed(2)}★ rating, outperforming our product (${ourRating.toFixed(2)}★) by +${delta.toFixed(2)} stars (threshold: +${thresholds.competitorRatingAdvantageDelta.toFixed(2)}★).`,
        source: 'competitor_crawler',
        sourceId: topAdv.competitorId,
        capturedAt: executedAt,
        metadata: {
          competitorId: topAdv.competitorId,
          competitorRating: topAdv.rating,
          ourRating,
          delta,
          threshold: thresholds.competitorRatingAdvantageDelta,
        },
      };

      signals.push({
        signalId,
        workspaceId: input.workspaceId,
        skuId: input.skuId,
        asin: input.asin,
        domain: 'COMPETITOR',
        code: 'COMPETITOR_ADVANTAGE',
        metric: 'competitorRatingDelta',
        currentValue: topAdv.rating!,
        baselineValue: ourRating,
        changePct: delta,
        thresholdValue: thresholds.competitorRatingAdvantageDelta,
        severity: 'INFO',
        direction: 'UP',
        detectedBy: 'RULE',
        ruleId: 'R-COMP-02',
        title: `Competitor Rating Advantage: ${topAdv.name || topAdv.competitorId} (+${delta.toFixed(2)}★)`,
        description: `Competitor holds higher star rating (${topAdv.rating!.toFixed(2)}★ vs our ${ourRating.toFixed(2)}★). Analyze competitor customer feedback for feature and quality insights.`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: 'Competitor Rating / Spec Advantage',
        domain: 'COMPETITOR',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `Competitor rating (${topAdv.rating}★) exceeds our rating (${ourRating}★) by >= ${thresholds.competitorRatingAdvantageDelta}★.`,
        metrics: { competitorId: topAdv.competitorId, competitorRating: topAdv.rating, ourRating, delta },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: 'Competitor Rating / Spec Advantage',
        domain: 'COMPETITOR',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `No tracked competitor rating exceeds our product rating by ${thresholds.competitorRatingAdvantageDelta}★.`,
        metrics: { ourRating },
        evaluatedAt: executedAt,
      });
    }
  }
}
