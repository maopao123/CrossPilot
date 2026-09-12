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
        ruleName: '净利润基准下跌',
        domain: 'PROFIT',
        status: 'NOT_EVALUATED',
        dataAvailability: fin?.availability || 'UNAVAILABLE',
        reason: '当前或基准净利润数据缺失，或标记为 UNAVAILABLE。',
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
          ruleName: '净利润基准下跌',
          domain: 'PROFIT',
          status: 'NOT_EVALUATED',
          dataAvailability: fin.availability || 'AVAILABLE',
          reason: `基准净利润为非正值（$${baseProfit.toFixed(2)}），相对跌幅在数学上无定义；已由 R-PROF-02 净利率规则评估。`,
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
            title: '净利润差异归因',
            content: `净利润从 $${baseProfit.toFixed(2)} 下跌至 $${currProfit.toFixed(2)}（变动：$${delta.toFixed(2)}，${(changePct * 100).toFixed(1)}%），超过 -${(thresholds.profitDropPctThreshold * 100).toFixed(1)}% 的下跌阈值。`,
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
            title: `净利润下跌 ${(dropPct * 100).toFixed(1)}%`,
            description: `净利润较基准期减少 $${Math.abs(delta).toFixed(2)}（-${(dropPct * 100).toFixed(1)}%），超过 ${(thresholds.profitDropPctThreshold * 100).toFixed(1)}% 的下跌阈值。`,
            evidence: [evidenceItem],
            detectedAt: executedAt,
          });

          evaluations.push({
            ruleId: 'R-PROF-01',
            ruleCode: 'PROFIT_DROP',
            ruleName: '净利润基准下跌',
            domain: 'PROFIT',
            status: 'TRIGGERED',
            dataAvailability: fin.availability || 'AVAILABLE',
            signalId,
            reason: `净利润下跌 ${(dropPct * 100).toFixed(1)}%（阈值：${(thresholds.profitDropPctThreshold * 100).toFixed(1)}%）。`,
            metrics: { currentProfit: currProfit, baselineProfit: baseProfit, dropPct },
            evaluatedAt: executedAt,
          });
        } else {
          evaluations.push({
            ruleId: 'R-PROF-01',
            ruleCode: 'PROFIT_DROP',
            ruleName: '净利润基准下跌',
            domain: 'PROFIT',
            status: 'NO_ANOMALY',
            dataAvailability: fin.availability || 'AVAILABLE',
            reason: `净利润变动（${(changePct * 100).toFixed(1)}%）在可接受阈值（-${(thresholds.profitDropPctThreshold * 100).toFixed(1)}%）以内。`,
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
        ruleName: '净利率临界安全线',
        domain: 'PROFIT',
        status: 'NOT_EVALUATED',
        dataAvailability: fin?.availability || 'UNAVAILABLE',
        reason: '当前财务数据不可用，无法评估净利率。',
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
          ruleName: '净利率临界安全线',
          domain: 'PROFIT',
          status: 'NOT_EVALUATED',
          dataAvailability: fin.availability || 'PARTIAL',
          reason: '收入和利润均为零，无订单活动；净利率规则未评估。',
          evaluatedAt: executedAt,
        });
      } else if (margin < thresholds.criticalMarginRateThreshold || margin < 0) {
        const signalId = buildIdempotentSignalId('R-PROF-02', input.workspaceId, input.skuId, input.dateRange);
        const evidenceItem: OperationEvidenceItem = {
          evidenceId: `EV-${signalId}-01`,
          category: 'CALCULATED_METRIC',
          title: '净利率计算',
          content: `净利率为 ${(margin * 100).toFixed(1)}%（利润：$${currProfit.toFixed(2)}，收入：$${revenue.toFixed(2)}），低于配置的 ${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}% 安全线。`,
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
          title: `净利率 ${(margin * 100).toFixed(1)}%（跌破临界安全线）`,
          description: `当前净利率 ${(margin * 100).toFixed(1)}% 低于 ${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}% 的安全线（或为负值），存在经营亏损风险。`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
        });

        evaluations.push({
          ruleId: 'R-PROF-02',
          ruleCode: 'CRITICAL_MARGIN',
          ruleName: '净利率临界安全线',
          domain: 'PROFIT',
          status: 'TRIGGERED',
          dataAvailability: fin.availability || 'AVAILABLE',
          signalId,
          reason: `净利率 ${(margin * 100).toFixed(1)}% 低于配置的安全线 ${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}%。`,
          metrics: { margin, netProfit: currProfit, revenue },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-PROF-02',
          ruleCode: 'CRITICAL_MARGIN',
          ruleName: '净利率临界安全线',
          domain: 'PROFIT',
          status: 'NO_ANOMALY',
          dataAvailability: fin.availability || 'AVAILABLE',
          reason: `净利率 ${(margin * 100).toFixed(1)}% 满足安全线阈值（${(thresholds.criticalMarginRateThreshold * 100).toFixed(1)}%）。`,
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
        ruleName: 'ACOS 超标飙升',
        domain: 'ADVERTISING',
        status: 'NOT_EVALUATED',
        dataAvailability: ads?.availability || 'UNAVAILABLE',
        reason: '当前广告效果数据不可用。',
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
          ruleName: 'ACOS 超标飙升',
          domain: 'ADVERTISING',
          status: 'NO_ANOMALY',
          dataAvailability: ads.availability || 'AVAILABLE',
          reason: '广告花费为零。',
          evaluatedAt: executedAt,
        });
      } else if (sales === 0 && spend < MIN_AD_SPEND_SAMPLE_USD) {
        evaluations.push({
          ruleId: 'R-ADS-01',
          ruleCode: 'ACOS_SPIKE',
          ruleName: 'ACOS 超标飙升',
          domain: 'ADVERTISING',
          status: 'NOT_EVALUATED',
          dataAvailability: ads.availability || 'PARTIAL',
          reason: `广告花费（$${spend.toFixed(2)}）低于最小统计样本下限（$${MIN_AD_SPEND_SAMPLE_USD.toFixed(2)}）。`,
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
            title: 'ACOS 目标偏离分析',
            content: `ACOS 升至 ${(acos * 100).toFixed(1)}%（花费：$${spend.toFixed(2)}，销售额：$${sales.toFixed(2)}），超过 ${(thresholds.maxAcosThreshold * 100).toFixed(1)}% 的绝对上限，且偏离 ${(targetAcos * 100).toFixed(0)}% 目标超过 ${(thresholds.acosTargetDeviationThreshold * 100).toFixed(0)}%。`,
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
            title: `ACOS 飙升至 ${(acos * 100).toFixed(1)}%（目标：${(targetAcos * 100).toFixed(0)}%）`,
            description: `ACOS 达到 ${(acos * 100).toFixed(1)}%，同时超过绝对上限（${(thresholds.maxAcosThreshold * 100).toFixed(1)}%）与目标阈值。`,
            evidence: [evidenceItem],
            detectedAt: executedAt,
          });

          evaluations.push({
            ruleId: 'R-ADS-01',
            ruleCode: 'ACOS_SPIKE',
            ruleName: 'ACOS 超标飙升',
            domain: 'ADVERTISING',
            status: 'TRIGGERED',
            dataAvailability: ads.availability || 'AVAILABLE',
            signalId,
            reason: `ACOS ${(acos * 100).toFixed(1)}% 同时突破 ${(thresholds.maxAcosThreshold * 100).toFixed(1)}% 上限与目标容差。`,
            metrics: { acos, spend, sales, targetAcos },
            evaluatedAt: executedAt,
          });
        } else {
          evaluations.push({
            ruleId: 'R-ADS-01',
            ruleCode: 'ACOS_SPIKE',
            ruleName: 'ACOS 超标飙升',
            domain: 'ADVERTISING',
            status: 'NO_ANOMALY',
            dataAvailability: ads.availability || 'AVAILABLE',
            reason: `ACOS ${(acos * 100).toFixed(1)}% 在可接受范围内。`,
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
        ruleName: '广告花费低效扩张',
        domain: 'ADVERTISING',
        status: 'NOT_EVALUATED',
        dataAvailability: ads?.availability || 'UNAVAILABLE',
        reason: '当前或基准广告指标缺失。',
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
          ruleName: '广告花费低效扩张',
          domain: 'ADVERTISING',
          status: 'NOT_EVALUATED',
          dataAvailability: ads.availability || 'AVAILABLE',
          reason: '基准期广告花费为零，无法评估相对花费扩张速度。',
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
            title: '广告花费与销售增长脱节',
            content: `广告花费激增 ${(spendGrowth * 100).toFixed(1)}%（$${baseSpend.toFixed(2)} -> $${currSpend.toFixed(2)}），但归因收入未增长（${(salesGrowth * 100).toFixed(1)}%，$${baseSales.toFixed(2)} -> $${currSales.toFixed(2)}）。`,
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
            title: `广告花费激增（+${(spendGrowth * 100).toFixed(1)}%）而销售零增长`,
            description: `广告预算扩张 ${(spendGrowth * 100).toFixed(1)}%（$${currSpend - baseSpend > 0 ? '+' : ''}$${(currSpend - baseSpend).toFixed(2)}），未带来增量销售收入（${(salesGrowth * 100).toFixed(1)}%）。`,
            evidence: [evidenceItem],
            detectedAt: executedAt,
          });

          evaluations.push({
            ruleId: 'R-ADS-02',
            ruleCode: 'AD_SPEND_INEFFICIENT',
            ruleName: '广告花费低效扩张',
            domain: 'ADVERTISING',
            status: 'TRIGGERED',
            dataAvailability: ads.availability || 'AVAILABLE',
            signalId,
            reason: `花费增长 ${(spendGrowth * 100).toFixed(1)}% 超过 ${(thresholds.adSpendGrowthMaxThreshold * 100).toFixed(1)}%，而销售增长 ${(salesGrowth * 100).toFixed(1)}% <= 0。`,
            metrics: { spendGrowth, salesGrowth, currSpend, baseSpend },
            evaluatedAt: executedAt,
          });
        } else {
          evaluations.push({
            ruleId: 'R-ADS-02',
            ruleCode: 'AD_SPEND_INEFFICIENT',
            ruleName: '广告花费低效扩张',
            domain: 'ADVERTISING',
            status: 'NO_ANOMALY',
            dataAvailability: ads.availability || 'AVAILABLE',
            reason: '广告花费增长与销售速度匹配，或在阈值以内。',
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
        ruleName: '零转化浪费花费',
        domain: 'ADVERTISING',
        status: 'NOT_EVALUATED',
        dataAvailability: ads?.availability || 'UNAVAILABLE',
        reason: '无搜索词或点击转化数据。',
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
          title: `搜索词浪费："${topTerm.searchTerm}"`,
          content: `搜索词 "${topTerm.searchTerm}" 在广告活动 ${topTerm.campaignId || 'DEFAULT'} 中消耗 ${topTerm.clicks} 次点击、花费 $${topTerm.spend.toFixed(2)}，订单为 0。`,
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
          title: `广告花费浪费："${topTerm.searchTerm}"（${topTerm.clicks} 次点击，$${topTerm.spend.toFixed(2)}，0 订单）`,
          description: `搜索词 "${topTerm.searchTerm}" 消耗 ${topTerm.clicks} 次点击（$${topTerm.spend.toFixed(2)}）未产生任何订单，建议通过 Negative Exact（精准否定）隔离。`,
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
          ruleName: '零转化浪费花费',
          domain: 'ADVERTISING',
          status: 'TRIGGERED',
          dataAvailability: 'AVAILABLE',
          signalId,
          reason: `发现 ${wastefulTerms.length} 个搜索词点击 >= ${thresholds.zeroConversionClicksThreshold} 且订单为 0；最大浪费："${topTerm.searchTerm}"（$${topTerm.spend.toFixed(2)}）。`,
          metrics: { topTerm: topTerm.searchTerm, clicks: topTerm.clicks, spend: topTerm.spend },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: '零转化浪费花费',
          domain: 'ADVERTISING',
          status: 'NO_ANOMALY',
          dataAvailability: 'AVAILABLE',
          reason: `已评估 ${ads.searchTerms.length} 个搜索词，均未突破零转化阈值（${thresholds.zeroConversionClicksThreshold} 次点击）。`,
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
          title: '广告活动整体零转化',
          content: `广告活动产生 ${clicks} 次点击、花费 $${spend.toFixed(2)}，订单为 0。`,
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
          title: `${clicks} 次点击零订单（花费 $${spend.toFixed(2)}）`,
          description: `广告流量共产生 ${clicks} 次点击，未产生任何转化。`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
        });

        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: '零转化浪费花费',
          domain: 'ADVERTISING',
          status: 'TRIGGERED',
          dataAvailability: 'PARTIAL',
          signalId,
          reason: `整体点击 ${clicks} >= ${thresholds.zeroConversionClicksThreshold} 且订单为 0。`,
          metrics: { clicks, orders, spend },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-ADS-03',
          ruleCode: 'ZERO_CONVERSION_SPEND',
          ruleName: '零转化浪费花费',
          domain: 'ADVERTISING',
          status: 'NO_ANOMALY',
          dataAvailability: ads.availability || 'AVAILABLE',
          reason: '未检测到零转化花费模式。',
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
        { id: 'R-INV-01', code: 'STOCKOUT_IMMINENT', name: '断货迫近风险' },
        { id: 'R-INV-02', code: 'OUT_OF_STOCK', name: '可售库存断货（0 件）' },
        { id: 'R-INV-03', code: 'EXCESS_INVENTORY', name: '库存覆盖过剩' },
      ];
      for (const r of notEvalReasons) {
        evaluations.push({
          ruleId: r.id,
          ruleCode: r.code,
          ruleName: r.name,
          domain: 'INVENTORY',
          status: 'NOT_EVALUATED',
          dataAvailability: inv?.availability || 'UNAVAILABLE',
          reason: '库存数据不可用。',
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
        title: '可售库存断货',
        content: `可售库存已降至 0 件。在途库存：${inbound} 件。预计每日损失收入：$${roundMoney(velocity * 29.99).toFixed(2)}。`,
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
        title: '已断货（可售库存 0 件）',
        description: '可售库存已完全耗尽（0 件），销售停滞，自然搜索排名受损。',
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-INV-02',
        ruleCode: 'OUT_OF_STOCK',
        ruleName: '可售库存断货（0 件）',
        domain: 'INVENTORY',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: '可售库存为 0 件。',
        metrics: { fulfillable, inbound, velocity },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-INV-02',
        ruleCode: 'OUT_OF_STOCK',
        ruleName: '可售库存断货（0 件）',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `可售库存（${fulfillable} 件）> 0。`,
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
        ruleName: '断货迫近风险',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: 'SKU 已完全断货；由 R-INV-02 覆盖。',
        metrics: { daysCover, fulfillable },
        evaluatedAt: executedAt,
      });
    } else if (velocity <= 0) {
      evaluations.push({
        ruleId: 'R-INV-01',
        ruleCode: 'STOCKOUT_IMMINENT',
        ruleName: '断货迫近风险',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: '销售速度为零；库存覆盖天数实际为无限。',
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
          title: '补货耗尽测算',
          content: `当前库存 ${fulfillable} 件，按 ${velocity.toFixed(1)} 件/天销售仅可支撑 ${daysCover.toFixed(1)} 天，低于 ${criticalLimit} 天的补货阈值（交期：${leadTime} 天，配置下限：${thresholds.criticalDaysCoverFloor} 天）。建议采购单：${plan.recommendedQuantity} 件。`,
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
          title: `断货迫近风险（可售 ${daysCover.toFixed(1)} 天 <= ${criticalLimit} 天交期）`,
          description: `库存覆盖 ${daysCover.toFixed(1)} 天，无法覆盖供应商补货交期（${leadTime} 天），需要紧急补货。`,
          evidence: [evidenceItem],
          detectedAt: executedAt,
          metadata: { recommendedQuantity: plan.recommendedQuantity },
        });

        evaluations.push({
          ruleId: 'R-INV-01',
          ruleCode: 'STOCKOUT_IMMINENT',
          ruleName: '断货迫近风险',
          domain: 'INVENTORY',
          status: 'TRIGGERED',
          dataAvailability: 'AVAILABLE',
          signalId,
          reason: `可售天数 ${daysCover.toFixed(1)} <= 补货缓冲 ${criticalLimit} 天。`,
          metrics: { daysCover, criticalLimit, fulfillable, velocity },
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-INV-01',
          ruleCode: 'STOCKOUT_IMMINENT',
          ruleName: '断货迫近风险',
          domain: 'INVENTORY',
          status: 'NO_ANOMALY',
          dataAvailability: 'AVAILABLE',
          reason: `可售天数 ${daysCover.toFixed(1)} 安全高于交期缓冲（${criticalLimit} 天）。`,
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
        title: '库存过剩分析',
        content: `当前库存 ${fulfillable} 件相当于 ${daysCover.toFixed(0)} 天覆盖，超过 ${thresholds.excessDaysCoverThreshold} 天的超量持有上限，存在 FBA 长期仓储附加费风险。`,
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
        title: `库存过剩（${daysCover.toFixed(0)} 天覆盖 > ${thresholds.excessDaysCoverThreshold} 天上限）`,
        description: `库存覆盖 ${daysCover.toFixed(0)} 天，超过 ${thresholds.excessDaysCoverThreshold} 天的持有目标，建议通过促销或降价加速动销。`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-INV-03',
        ruleCode: 'EXCESS_INVENTORY',
        ruleName: '库存覆盖过剩',
        domain: 'INVENTORY',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `可售天数 ${daysCover.toFixed(0)} > ${thresholds.excessDaysCoverThreshold} 天。`,
        metrics: { daysCover, fulfillable },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-INV-03',
        ruleCode: 'EXCESS_INVENTORY',
        ruleName: '库存覆盖过剩',
        domain: 'INVENTORY',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `可售天数 ${daysCover.toFixed(0)} 处于健康阈值内（<= ${thresholds.excessDaysCoverThreshold} 天）。`,
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
        ruleName: '退货率飙升与加速',
        domain: 'RETURNS',
        status: 'NOT_EVALUATED',
        dataAvailability: ret?.availability || 'UNAVAILABLE',
        reason: '当前或基准退货追踪数据不可用。',
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
        ruleName: '退货率飙升与加速',
        domain: 'RETURNS',
        status: 'NOT_EVALUATED',
        dataAvailability: ret.availability || 'PARTIAL',
        reason: `送达量（${curDelivered} 件）低于最小统计样本量（${MIN_RETURN_DELIVERED_UNITS} 件），以避免低基数误报。`,
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
        title: '退货率飙升核验',
        content: `退货率从 ${(baseRate * 100).toFixed(1)}% 飙升至 ${(currRate * 100).toFixed(1)}%（+${(relativeGrowth * 100).toFixed(1)}%），同时超过 ${(thresholds.returnRateSpikeThreshold * 100).toFixed(1)}% 的绝对下限与 ${(thresholds.returnRateGrowthThreshold * 100).toFixed(1)}% 的相对飙升阈值（当前：${curReturns}/${curDelivered}，基准：${baseReturns}/${baseDelivered}）。`,
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
        title: `退货率飙升至 ${(currRate * 100).toFixed(1)}%（较基准 +${(relativeGrowth * 100).toFixed(0)}%）`,
        description: `买家退货加速至 ${(currRate * 100).toFixed(1)}%（${curDelivered} 件送达中 ${curReturns} 件退货），较基准飙升 ${(relativeGrowth * 100).toFixed(0)}%，请排查批次或尺码缺陷原因。`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-RET-01',
        ruleCode: 'RETURN_RATE_SPIKE',
        ruleName: '退货率飙升与加速',
        domain: 'RETURNS',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `退货率 ${(currRate * 100).toFixed(1)}% >= ${(thresholds.returnRateSpikeThreshold * 100).toFixed(1)}% 下限，且增长 ${(relativeGrowth * 100).toFixed(0)}% >= ${(thresholds.returnRateGrowthThreshold * 100).toFixed(0)}% 增长阈值。`,
        metrics: { currRate, baseRate, relativeGrowth },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-RET-01',
        ruleCode: 'RETURN_RATE_SPIKE',
        ruleName: '退货率飙升与加速',
        domain: 'RETURNS',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `退货率 ${(currRate * 100).toFixed(1)}% 正常，或在相对变化容差以内。`,
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
        ruleName: '评分恶化与差评激增',
        domain: 'REVIEWS',
        status: 'NOT_EVALUATED',
        dataAvailability: rev?.availability || 'UNAVAILABLE',
        reason: '买家评论与评分数据不可用。',
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
        ruleName: '评分恶化与差评激增',
        domain: 'REVIEWS',
        status: 'NOT_EVALUATED',
        dataAvailability: rev.availability || 'PARTIAL',
        reason: `评论样本量不足以可靠评估（至少需要 ${MIN_REVIEW_SAMPLE_COUNT} 条评论）。`,
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
        title: '评论健康度分析',
        content: isRatingBreached
          ? `整体评分降至 ${overallRating?.toFixed(2)} 星（共 ${totalReviews} 条评论），低于 ${thresholds.ratingDeteriorationFloor.toFixed(1)} 星的安全线。`
          : `近 7 天差评占比达 ${(recentRatio * 100).toFixed(1)}%（${recentNegative}/${recentTotal} 条差评），超过 ${(thresholds.recentNegativeReviewRatioThreshold * 100).toFixed(0)}% 的阈值。`,
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
          ? `产品评分恶化：${overallRating?.toFixed(2)}★（< ${thresholds.ratingDeteriorationFloor.toFixed(1)}★）`
          : `近期差评激增：${(recentRatio * 100).toFixed(1)}% 为 1-2★ 评论`,
        description: isRatingBreached
          ? `平均评分 ${overallRating?.toFixed(2)}★ 已跌破 ${thresholds.ratingDeteriorationFloor.toFixed(1)}★ 阈值，影响转化率与购物车（Buy Box）资格。`
          : `本期 ${(recentRatio * 100).toFixed(1)}% 的评论为差评（1-2★），超过 ${(thresholds.recentNegativeReviewRatioThreshold * 100).toFixed(0)}% 的阈值。`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-REV-01',
        ruleCode: 'RATING_DETERIORATION',
        ruleName: '评分恶化与差评激增',
        domain: 'REVIEWS',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: isRatingBreached
          ? `评分 ${overallRating} < ${thresholds.ratingDeteriorationFloor}★。`
          : `近期差评占比 ${(recentRatio * 100).toFixed(1)}% > ${(thresholds.recentNegativeReviewRatioThreshold * 100).toFixed(0)}%。`,
        metrics: { overallRating, recentRatio, totalReviews, recentTotal },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-REV-01',
        ruleCode: 'RATING_DETERIORATION',
        ruleName: '评分恶化与差评激增',
        domain: 'REVIEWS',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: '买家评分与评论情绪健康。',
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
        ruleName: '竞品激进降价压制',
        domain: 'COMPETITOR',
        status: 'NOT_EVALUATED',
        dataAvailability: comp?.availability || 'UNAVAILABLE',
        reason: '竞品价格数据不可用。',
        evaluatedAt: executedAt,
      });
      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: '竞品评分/规格优势',
        domain: 'COMPETITOR',
        status: 'NOT_EVALUATED',
        dataAvailability: comp?.availability || 'UNAVAILABLE',
        reason: '竞品评分数据不可用。',
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
        title: `竞品降价压制：${topComp.name || topComp.asin || topComp.competitorId}`,
        content: `竞品 ${topComp.name || topComp.competitorId}（${topComp.asin || 'N/A'}）将价格从 $${topComp.baselinePrice!.toFixed(2)} 降至 $${topComp.currentPrice.toFixed(2)}（-${(dropPct * 100).toFixed(1)}%），超过 ${(thresholds.competitorPriceDropPctThreshold * 100).toFixed(0)}% 的降价阈值。`,
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
        title: `竞品降价：${topComp.name || topComp.competitorId}（-${(dropPct * 100).toFixed(1)}%）`,
        description: `主要竞品降价 ${(dropPct * 100).toFixed(1)}% 至 $${topComp.currentPrice.toFixed(2)}，建议评估价格弹性与优惠券跟进策略。`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-COMP-01',
        ruleCode: 'COMPETITOR_PRICE_DROP',
        ruleName: '竞品激进降价压制',
        domain: 'COMPETITOR',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `竞品 ${topComp.competitorId} 降价 ${(dropPct * 100).toFixed(1)}% >= ${(thresholds.competitorPriceDropPctThreshold * 100).toFixed(0)}%。`,
        metrics: { competitorId: topComp.competitorId, currentPrice: topComp.currentPrice, baselinePrice: topComp.baselinePrice, dropPct },
        evaluatedAt: executedAt,
      });
    } else {
      const hasBaselinePrices = comp.items.some((i) => i.baselinePrice !== undefined && i.baselinePrice > 0);
      if (!hasBaselinePrices) {
        evaluations.push({
          ruleId: 'R-COMP-01',
          ruleCode: 'COMPETITOR_PRICE_DROP',
          ruleName: '竞品激进降价压制',
          domain: 'COMPETITOR',
          status: 'NOT_EVALUATED',
          dataAvailability: 'PARTIAL',
          reason: '已在追踪竞品，但无历史基准价格记录。',
          evaluatedAt: executedAt,
        });
      } else {
        evaluations.push({
          ruleId: 'R-COMP-01',
          ruleCode: 'COMPETITOR_PRICE_DROP',
          ruleName: '竞品激进降价压制',
          domain: 'COMPETITOR',
          status: 'NO_ANOMALY',
          dataAvailability: 'AVAILABLE',
          reason: '无主要竞品降价超过阈值。',
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
        ruleName: '竞品评分/规格优势',
        domain: 'COMPETITOR',
        status: 'NOT_EVALUATED',
        dataAvailability: 'PARTIAL',
        reason: '我方产品评分不可用，无法计算竞品相对优势差值。',
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
        title: `竞品评分优势：${topAdv.name || topAdv.asin || topAdv.competitorId}`,
        content: `竞品 ${topAdv.name || topAdv.competitorId} 评分 ${topAdv.rating!.toFixed(2)}★，高于我方产品（${ourRating.toFixed(2)}★）+${delta.toFixed(2)} 星（阈值：+${thresholds.competitorRatingAdvantageDelta.toFixed(2)}★）。`,
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
        title: `竞品评分优势：${topAdv.name || topAdv.competitorId}（+${delta.toFixed(2)}★）`,
        description: `竞品评分更高（${topAdv.rating!.toFixed(2)}★，我方 ${ourRating.toFixed(2)}★），建议分析竞品的买家评论，获取功能与质量洞察。`,
        evidence: [evidenceItem],
        detectedAt: executedAt,
      });

      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: '竞品评分/规格优势',
        domain: 'COMPETITOR',
        status: 'TRIGGERED',
        dataAvailability: 'AVAILABLE',
        signalId,
        reason: `竞品评分（${topAdv.rating}★）高于我方评分（${ourRating}★）>= ${thresholds.competitorRatingAdvantageDelta}★。`,
        metrics: { competitorId: topAdv.competitorId, competitorRating: topAdv.rating, ourRating, delta },
        evaluatedAt: executedAt,
      });
    } else {
      evaluations.push({
        ruleId: 'R-COMP-02',
        ruleCode: 'COMPETITOR_ADVANTAGE',
        ruleName: '竞品评分/规格优势',
        domain: 'COMPETITOR',
        status: 'NO_ANOMALY',
        dataAvailability: 'AVAILABLE',
        reason: `无已追踪竞品评分高出我方产品 ${thresholds.competitorRatingAdvantageDelta}★。`,
        metrics: { ourRating },
        evaluatedAt: executedAt,
      });
    }
  }
}
