/**
 * Sku360 Context Loader (CrossPilot V9 Epic 3 Phase 3)
 *
 * Implements WF-05 unified cross-domain business fact assembly layer:
 * Product/SKU, Sales, Advertising, Inventory, Reviews, Returns, Competitor, Profit
 *       ↓
 * Sku360ContextLoader
 *       ↓
 * Sku360BusinessContext
 *
 * Core Axiom: Load != Detect != Diagnose != Recommend
 * - ONLY responsible for: Load, Normalize, Compare, Assemble, Trace.
 * - NEVER responsible for: Anomaly Detection, Causal Diagnosis, Action Recommendation, RPA Execution.
 * - Reuses existing domain services (InventoryPlanningService, ProfitCalculationService, VarianceAttributionService).
 * - Full defensive normalization (null, NaN, Infinity, negative impossibility protection).
 * - Concurrent loading via Promise.allSettled with per-domain timeout and graceful partial failure isolation.
 * - Bridges directly into OperationAnomalyDetector via static toAnomalyDetectorInput().
 */

import {
  DataAvailabilityStatus,
  OperationEvidenceItem,
  Sku360Identity,
  Sku360TimePeriod,
  MetricComparison,
  Sku360SalesContext,
  Sku360AdvertisingContext,
  Sku360InventoryContext,
  Sku360ReviewsContext,
  Sku360ReturnsContext,
  Sku360CompetitorsContext,
  Sku360ProfitContext,
  Sku360DomainAvailability,
  Sku360Freshness,
  Sku360BusinessContext,
  FreshnessStatus,
  Sku360DomainFreshness,
} from '@crosspilot/shared';

import {
  ISku360DataSource,
  Sku360LoadParams,
  Workspace360LoadParams,
  DomainLoadResult,
  RawSalesData,
  RawAdvertisingData,
  RawInventoryData,
  RawReviewsData,
  RawReturnsData,
  RawCompetitorsData,
  RawProfitData,
} from './sku360-data-source.interface.js';

import {
  OperationAnomalyDetectionInput,
  AnomalyDetectionFinancials,
  AnomalyDetectionAdvertising,
  AnomalyDetectionInventory,
  AnomalyDetectionReturns,
  AnomalyDetectionReviews,
  AnomalyDetectionCompetitors,
} from './operation-anomaly-detector.js';

import {
  ThresholdResolver,
} from './anomaly-threshold.config.js';

import {
  roundMoney,
  roundMargin,
} from '../profit/profit-calculation.service.js';

import {
  InventoryPlanningService,
} from '../inventory/inventory-planning.service.js';

import {
  VarianceAttributionService,
} from '../variance/variance-attribution.service.js';

import {
  ScenarioSku360DataSource,
} from './scenario-sku360-data-source.js';

// ============================================================================
// 1. Normalization & Math Utilities
// ============================================================================

function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return fallback;
  }
  return val;
}

function safeNonNegative(val: unknown, fallback = 0): number {
  const n = safeNumber(val, fallback);
  return Math.max(0, n);
}

function computeComparison(
  current: unknown,
  baseline: unknown,
  options?: { isRate?: boolean; nonNegative?: boolean } | boolean,
): MetricComparison {
  const isRate = typeof options === 'boolean' ? options : !!options?.isRate;
  const nonNegative = typeof options === 'object' ? !!options.nonNegative : false;
  const roundFn = isRate ? roundMargin : roundMoney;
  const numFn = nonNegative ? safeNonNegative : safeNumber;
  const cur = roundFn(numFn(current, 0));
  const base = roundFn(numFn(baseline, 0));
  const delta = roundFn(cur - base);

  let deltaPct = 0;
  if (base > 0) {
    deltaPct = roundMargin((cur - base) / base);
  } else if (base < 0) {
    deltaPct = roundMargin((cur - base) / Math.abs(base));
  } else if (base === 0 && cur > 0) {
    deltaPct = 1.0;
  } else if (base === 0 && cur < 0) {
    deltaPct = -1.0;
  } else {
    deltaPct = 0;
  }

  return {
    current: cur,
    baseline: base,
    delta,
    deltaPct,
  };
}

function calculateDaysBetween(from: string, to: string): number {
  try {
    const d1 = new Date(from.slice(0, 10)).getTime();
    const d2 = new Date(to.slice(0, 10)).getTime();
    if (Number.isNaN(d1) || Number.isNaN(d2)) return 7;
    return Math.max(1, Math.round(Math.abs(d2 - d1) / (24 * 60 * 60 * 1000)) + 1);
  } catch {
    return 7;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  domainName: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout loading domain [${domainName}] after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// ============================================================================
// 2. Sku360 Context Loader Implementation
// ============================================================================

export class Sku360ContextLoader {
  private dataSource: ISku360DataSource;
  private defaultTimeoutMs: number;
  private defaultFreshnessMaxDays: number;

  constructor(
    dataSource?: ISku360DataSource,
    options?: { timeoutMs?: number; freshnessMaxAgeDays?: number },
  ) {
    this.dataSource = dataSource || new ScenarioSku360DataSource();
    this.defaultTimeoutMs = options?.timeoutMs ?? 5000;
    this.defaultFreshnessMaxDays = options?.freshnessMaxAgeDays ?? 7;
  }

  /**
   * Primary entry point: Loads unified cross-domain Sku360BusinessContext for a single SKU.
   */
  async loadSku360(params: Sku360LoadParams): Promise<Sku360BusinessContext> {
    const loadedAt = new Date().toISOString();
    const timeoutMs = params.options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxFreshnessDays = params.options?.freshnessMaxAgeDays ?? this.defaultFreshnessMaxDays;

    // 1. Load & Validate Identity
    if (!params.workspaceId || !params.skuId) {
      throw new Error('Invalid load parameters: workspaceId and skuId are required');
    }
    if (!params.currentPeriod?.from || !params.currentPeriod?.to) {
      throw new Error('Invalid load parameters: currentPeriod { from, to } is required');
    }

    let identity: Sku360Identity;
    try {
      identity = await withTimeout(
        this.dataSource.getIdentity(params),
        timeoutMs,
        'identity',
      );
    } catch (err: any) {
      // Fallback identity with defensive normalization
      identity = {
        workspaceId: params.workspaceId,
        marketplaceId: params.marketplaceId || 'AMAZON_US',
        productId: `prod_${params.skuId}`,
        skuId: params.skuId,
        skuCode: params.skuId,
        status: 'ACTIVE',
      };
    }

    // 2. Normalize Time Periods
    const currentDays = calculateDaysBetween(params.currentPeriod.from, params.currentPeriod.to);
    const currentPeriod: Sku360TimePeriod = {
      from: params.currentPeriod.from,
      to: params.currentPeriod.to,
      daysCount: currentDays,
    };

    let baselinePeriod: Sku360TimePeriod;
    if (params.baselinePeriod) {
      const baseDays = calculateDaysBetween(params.baselinePeriod.from, params.baselinePeriod.to);
      baselinePeriod = {
        from: params.baselinePeriod.from,
        to: params.baselinePeriod.to,
        daysCount: baseDays,
      };
    } else {
      // Default: identical length immediately preceding currentPeriod
      const curStart = new Date(params.currentPeriod.from.slice(0, 10)).getTime();
      const baseEnd = new Date(curStart - 24 * 60 * 60 * 1000);
      const baseStart = new Date(baseEnd.getTime() - (currentDays - 1) * 24 * 60 * 60 * 1000);
      baselinePeriod = {
        from: baseStart.toISOString().slice(0, 10),
        to: baseEnd.toISOString().slice(0, 10),
        daysCount: currentDays,
      };
    }

    const effectiveParams: Sku360LoadParams = {
      ...params,
      baselinePeriod: {
        from: baselinePeriod.from,
        to: baselinePeriod.to,
      },
    };

    // 3. Concurrent Domain Loading via Promise.allSettled
    const [
      salesRes,
      adsRes,
      invRes,
      revRes,
      retRes,
      compRes,
      profitRes,
    ] = await Promise.allSettled([
      withTimeout(this.dataSource.getSales(effectiveParams), timeoutMs, 'sales'),
      withTimeout(this.dataSource.getAdvertising(effectiveParams), timeoutMs, 'advertising'),
      withTimeout(this.dataSource.getInventory(effectiveParams), timeoutMs, 'inventory'),
      withTimeout(this.dataSource.getReviews(effectiveParams), timeoutMs, 'reviews'),
      withTimeout(this.dataSource.getReturns(effectiveParams), timeoutMs, 'returns'),
      withTimeout(this.dataSource.getCompetitors(effectiveParams), timeoutMs, 'competitors'),
      withTimeout(this.dataSource.getProfit(effectiveParams), timeoutMs, 'profit'),
    ]);

    const collectedEvidence: OperationEvidenceItem[] = [];

    // Helper to extract domain or create degraded fallback
    const extractDomainResult = <T>(
      settled: PromiseSettledResult<DomainLoadResult<T>>,
      domainName: string,
    ): DomainLoadResult<T> => {
      if (settled.status === 'fulfilled') {
        if (settled.value.evidence) {
          collectedEvidence.push(...settled.value.evidence);
        }
        return settled.value;
      }

      // Partial failure: domain timeout or error
      const errorMsg = settled.reason?.message || `Failed to load domain ${domainName}`;
      collectedEvidence.push({
        evidenceId: `EVI-ERR-${domainName.toUpperCase()}-${identity.skuId}-${Date.now()}`,
        category: 'RULE',
        title: `Domain ${domainName} Load Warning`,
        content: `Domain load failed or timed out: ${errorMsg}. Availability downgraded to UNAVAILABLE.`,
        source: 'Sku360ContextLoader',
        capturedAt: loadedAt,
        metadata: {
          domain: domainName,
          error: errorMsg,
          skuId: identity.skuId,
        },
      });

      return {
        availability: 'UNAVAILABLE',
        asOf: currentPeriod.to,
        error: errorMsg,
      };
    };

    const salesDomain = extractDomainResult<RawSalesData>(salesRes, 'sales');
    const adsDomain = extractDomainResult<RawAdvertisingData>(adsRes, 'advertising');
    const invDomain = extractDomainResult<RawInventoryData>(invRes, 'inventory');
    const revDomain = extractDomainResult<RawReviewsData>(revRes, 'reviews');
    const retDomain = extractDomainResult<RawReturnsData>(retRes, 'returns');
    const compDomain = extractDomainResult<RawCompetitorsData>(compRes, 'competitors');
    const profitDomain = extractDomainResult<RawProfitData>(profitRes, 'profit');

    // 4. Assemble & Normalize Sales Context
    const rawSalesCur = salesDomain.data?.current;
    const rawSalesBase = salesDomain.data?.baseline;
    const salesContext: Sku360SalesContext = {
      ordersCount: computeComparison(rawSalesCur?.ordersCount, rawSalesBase?.ordersCount, { nonNegative: true }),
      unitsSold: computeComparison(rawSalesCur?.unitsSold, rawSalesBase?.unitsSold, { nonNegative: true }),
      revenue: computeComparison(rawSalesCur?.revenue, rawSalesBase?.revenue, { nonNegative: true }),
      averageSellingPrice: computeComparison(rawSalesCur?.averageSellingPrice, rawSalesBase?.averageSellingPrice, { nonNegative: true }),
      sessions: rawSalesCur?.sessions !== undefined
        ? computeComparison(rawSalesCur.sessions, rawSalesBase?.sessions, { nonNegative: true })
        : undefined,
      pageViews: rawSalesCur?.pageViews !== undefined
        ? computeComparison(rawSalesCur.pageViews, rawSalesBase?.pageViews, { nonNegative: true })
        : undefined,
      conversionRate: rawSalesCur?.conversionRate !== undefined
        ? computeComparison(rawSalesCur.conversionRate, rawSalesBase?.conversionRate, { isRate: true, nonNegative: true })
        : undefined,
      availability: salesDomain.availability,
      asOf: salesDomain.asOf,
    };

    // 5. Assemble & Normalize Advertising Context
    const rawAdsCur = adsDomain.data?.current;
    const rawAdsBase = adsDomain.data?.baseline;
    const advertisingContext: Sku360AdvertisingContext = {
      spend: computeComparison(rawAdsCur?.spend, rawAdsBase?.spend, { nonNegative: true }),
      sales: computeComparison(rawAdsCur?.sales, rawAdsBase?.sales, { nonNegative: true }),
      orders: computeComparison(rawAdsCur?.orders, rawAdsBase?.orders, { nonNegative: true }),
      clicks: computeComparison(rawAdsCur?.clicks, rawAdsBase?.clicks, { nonNegative: true }),
      impressions: computeComparison(rawAdsCur?.impressions, rawAdsBase?.impressions, { nonNegative: true }),
      acos: computeComparison(rawAdsCur?.acos, rawAdsBase?.acos, { isRate: true, nonNegative: true }),
      roas: computeComparison(rawAdsCur?.roas, rawAdsBase?.roas, { nonNegative: true }),
      ctr: computeComparison(rawAdsCur?.ctr, rawAdsBase?.ctr, { isRate: true, nonNegative: true }),
      cvr: computeComparison(rawAdsCur?.cvr, rawAdsBase?.cvr, { isRate: true, nonNegative: true }),
      targetAcos: adsDomain.data?.targetAcos ?? 0.30,
      searchTerms: adsDomain.data?.searchTerms || [],
      availability: adsDomain.availability,
      asOf: adsDomain.asOf,
    };

    // 6. Assemble & Normalize Inventory Context (Reusing InventoryPlanningService)
    const rawInv = invDomain.data;
    const fulfillableQty = safeNonNegative(rawInv?.fulfillableQuantity, 0);
    const inboundQty = safeNonNegative(rawInv?.inboundQuantity, 0);
    const reservedQty = safeNonNegative(rawInv?.reservedQuantity, 0);
    const avgDailySales = safeNonNegative(rawInv?.avgDailySales, 0);
    const leadTimeDays = safeNonNegative(rawInv?.leadTimeDays, 15);
    const safetyStockDays = safeNonNegative(rawInv?.safetyStockDays, 7);

    // Call domain planning service
    const planning = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: fulfillableQty,
      inboundQuantity: inboundQty,
      avgDailySales,
      leadTimeDays,
      safetyStockDays,
      targetDaysCover: rawInv?.targetDaysCover ?? 45,
    });

    const inventoryContext: Sku360InventoryContext = {
      fulfillableQuantity: fulfillableQty,
      inboundQuantity: inboundQty,
      reservedQuantity: reservedQty,
      avgDailySales,
      daysCover: planning.daysCover,
      leadTimeDays,
      safetyStockDays,
      reorderPoint: planning.reorderPoint,
      inventoryHealth: planning.riskLevel,
      recommendedQuantity: planning.recommendedQuantity,
      baseline: rawInv?.baseline
        ? {
            fulfillableQuantity: safeNonNegative(rawInv.baseline.fulfillableQuantity),
            daysCover: safeNonNegative(rawInv.baseline.daysCover),
            avgDailySales: safeNonNegative(rawInv.baseline.avgDailySales),
          }
        : undefined,
      availability: invDomain.availability,
      asOf: invDomain.asOf,
    };

    // 7. Assemble & Normalize Reviews Context
    const rawRev = revDomain.data;
    const overallRating = roundMargin(safeNumber(rawRev?.overallRating, 0));
    const totalReviews = safeNonNegative(rawRev?.totalReviews, 0);
    const recentRevCount = safeNonNegative(rawRev?.recentReviewCount, 0);
    const negRevCount = safeNonNegative(rawRev?.negativeReviewCount, 0);
    const negRatio = recentRevCount > 0
      ? roundMargin(negRevCount / recentRevCount)
      : roundMargin(safeNumber(rawRev?.negativeReviewRatio, 0));

    const reviewsContext: Sku360ReviewsContext = {
      overallRating,
      totalReviews,
      recentReviewCount: recentRevCount,
      negativeReviewCount: negRevCount,
      negativeReviewRatio: negRatio,
      baseline: rawRev?.baseline
        ? {
            overallRating: roundMargin(safeNumber(rawRev.baseline.overallRating, 0)),
            totalReviews: safeNonNegative(rawRev.baseline.totalReviews, 0),
          }
        : undefined,
      topPainPoints: rawRev?.topPainPoints || [],
      topPositiveThemes: rawRev?.topPositiveThemes || [],
      availability: revDomain.availability,
      asOf: revDomain.asOf,
    };

    // 8. Assemble & Normalize Returns Context
    const rawRetCur = retDomain.data?.current;
    const rawRetBase = retDomain.data?.baseline;

    const curDelivered = safeNonNegative(rawRetCur?.deliveredUnits, 0);
    const curRetCount = safeNonNegative(rawRetCur?.returnCount, 0);
    const curRetRate = curDelivered > 0
      ? roundMargin(curRetCount / curDelivered)
      : roundMargin(safeNumber(rawRetCur?.returnRate, 0));

    const baseDelivered = safeNonNegative(rawRetBase?.deliveredUnits, 0);
    const baseRetCount = safeNonNegative(rawRetBase?.returnCount, 0);
    const baseRetRate = baseDelivered > 0
      ? roundMargin(baseRetCount / baseDelivered)
      : roundMargin(safeNumber(rawRetBase?.returnRate, 0));

    const returnsContext: Sku360ReturnsContext = {
      returnCount: computeComparison(curRetCount, baseRetCount, { nonNegative: true }),
      deliveredUnits: computeComparison(curDelivered, baseDelivered, { nonNegative: true }),
      returnRate: computeComparison(curRetRate, baseRetRate, { isRate: true, nonNegative: true }),
      returnCost: computeComparison(rawRetCur?.returnCost, rawRetBase?.returnCost, { nonNegative: true }),
      topReturnReasons: rawRetCur?.topReturnReasons || [],
      availability: retDomain.availability,
      asOf: retDomain.asOf,
    };

    // 9. Assemble & Normalize Competitors Context
    const rawCompetitors = compDomain.data?.items || [];
    const normalizedCompetitors = rawCompetitors.map((item) => {
      const curPrice = roundMoney(safeNonNegative(item.currentPrice, 0));
      const basePrice = item.baselinePrice !== undefined ? roundMoney(safeNonNegative(item.baselinePrice, 0)) : undefined;
      const priceDelta = basePrice !== undefined ? roundMoney(curPrice - basePrice) : undefined;
      const priceDeltaPct = (basePrice !== undefined && basePrice > 0)
        ? roundMargin((curPrice - basePrice) / basePrice)
        : undefined;

      const curRating = item.currentRating !== undefined ? roundMargin(safeNonNegative(item.currentRating, 0)) : undefined;
      const baseRating = item.baselineRating !== undefined ? roundMargin(safeNonNegative(item.baselineRating, 0)) : undefined;
      const ratingDelta = (curRating !== undefined && baseRating !== undefined)
        ? roundMargin(curRating - baseRating)
        : undefined;

      return {
        competitorId: item.competitorId,
        asin: item.asin,
        name: item.name,
        relationType: item.relationType || 'DIRECT_BENCHMARK',
        isPrimary: item.isPrimary ?? false,
        currentPrice: curPrice,
        baselinePrice: basePrice,
        priceDelta,
        priceDeltaPct,
        currentRating: curRating,
        baselineRating: baseRating,
        ratingDelta,
        reviewCount: item.reviewCount !== undefined ? safeNonNegative(item.reviewCount) : undefined,
      };
    });

    const primaryCompetitor = normalizedCompetitors.find((c) => c.isPrimary) || normalizedCompetitors[0];
    const competitorsContext: Sku360CompetitorsContext = {
      items: normalizedCompetitors,
      primaryCompetitor,
      availability: compDomain.availability,
      asOf: compDomain.asOf,
    };

    // 10. Assemble & Normalize Profit Context (Reusing VarianceAttributionService)
    const rawProfitCur = profitDomain.data?.current;
    const rawProfitBase = profitDomain.data?.baseline;

    const curProfitRev = safeNumber(rawProfitCur?.revenue, 0);
    const curProfitCogs = safeNumber(rawProfitCur?.cogs, 0);
    const curProfitAmz = safeNumber(rawProfitCur?.amazonFees, 0);
    const curProfitFba = safeNumber(rawProfitCur?.fbaFee, 0);
    const curProfitAds = safeNumber(rawProfitCur?.adsCost, 0);
    const curProfitRet = safeNumber(rawProfitCur?.returnLoss, 0);
    const curProfitOth = safeNumber(rawProfitCur?.otherCosts, 0);
    const curNetProfit = rawProfitCur?.netProfit !== undefined
      ? safeNumber(rawProfitCur.netProfit)
      : roundMoney(curProfitRev - curProfitCogs - curProfitAmz - curProfitFba - curProfitAds - curProfitRet - curProfitOth);
    const curNetMargin = curProfitRev > 0 ? roundMargin(curNetProfit / curProfitRev) : 0;

    const baseProfitRev = safeNumber(rawProfitBase?.revenue, 0);
    const baseProfitCogs = safeNumber(rawProfitBase?.cogs, 0);
    const baseProfitAmz = safeNumber(rawProfitBase?.amazonFees, 0);
    const baseProfitFba = safeNumber(rawProfitBase?.fbaFee, 0);
    const baseProfitAds = safeNumber(rawProfitBase?.adsCost, 0);
    const baseProfitRet = safeNumber(rawProfitBase?.returnLoss, 0);
    const baseProfitOth = safeNumber(rawProfitBase?.otherCosts, 0);
    const baseNetProfit = rawProfitBase?.netProfit !== undefined
      ? safeNumber(rawProfitBase.netProfit)
      : roundMoney(baseProfitRev - baseProfitCogs - baseProfitAmz - baseProfitFba - baseProfitAds - baseProfitRet - baseProfitOth);
    const baseNetMargin = baseProfitRev > 0 ? roundMargin(baseNetProfit / baseProfitRev) : 0;

    let waterfallBreakdown: Sku360ProfitContext['waterfallAttribution'];
    if (profitDomain.data?.waterfallAttribution) {
      const rawWf = profitDomain.data.waterfallAttribution;
      const wfResult = VarianceAttributionService.attributeVariance({
        currentProfit: rawWf.currentProfit !== undefined ? rawWf.currentProfit : curNetProfit,
        previousProfit: rawWf.previousProfit !== undefined ? rawWf.previousProfit : baseNetProfit,
        advertisingImpact: rawWf.advertisingImpact,
        returnsImpact: rawWf.returnsImpact,
        inventoryImpact: rawWf.inventoryImpact,
        priceImpact: rawWf.priceImpact,
        otherImpact: rawWf.otherImpact,
      });

      waterfallBreakdown = {
        totalVariance: wfResult.totalVariance,
        advertisingImpact: wfResult.breakdown.advertising,
        returnsImpact: wfResult.breakdown.returns,
        inventoryImpact: wfResult.breakdown.inventory,
        priceImpact: wfResult.breakdown.price,
        otherImpact: wfResult.breakdown.other,
        isExactMatch: wfResult.isExactMatch,
        residual: wfResult.residual,
        formulaString: wfResult.formulaString,
      };
    }

    const profitContext: Sku360ProfitContext = {
      revenue: computeComparison(curProfitRev, baseProfitRev),
      cogs: computeComparison(curProfitCogs, baseProfitCogs),
      amazonFees: computeComparison(curProfitAmz, baseProfitAmz),
      fbaFee: computeComparison(curProfitFba, baseProfitFba),
      adsCost: computeComparison(curProfitAds, baseProfitAds),
      returnLoss: computeComparison(curProfitRet, baseProfitRet),
      otherCosts: computeComparison(curProfitOth, baseProfitOth),
      netProfit: computeComparison(curNetProfit, baseNetProfit),
      netMargin: computeComparison(curNetMargin, baseNetMargin, true),
      waterfallAttribution: waterfallBreakdown,
      availability: profitDomain.availability,
      asOf: profitDomain.asOf,
    };

    // 11. Domain-Level Data Availability Mapping
    const availability: Sku360DomainAvailability = {
      sales: salesDomain.availability,
      advertising: adsDomain.availability,
      inventory: invDomain.availability,
      reviews: revDomain.availability,
      returns: retDomain.availability,
      competitors: compDomain.availability,
      profit: profitDomain.availability,
      overall: 'AVAILABLE',
    };

    const domainAvailabilities = [
      availability.sales,
      availability.advertising,
      availability.inventory,
      availability.reviews,
      availability.returns,
      availability.competitors,
      availability.profit,
    ];

    if (domainAvailabilities.every((a) => a === 'AVAILABLE')) {
      availability.overall = 'AVAILABLE';
    } else if (domainAvailabilities.every((a) => a === 'UNAVAILABLE')) {
      availability.overall = 'UNAVAILABLE';
    } else {
      availability.overall = 'PARTIAL';
    }

    // 12. Freshness Determination
    const checkDomainFreshness = (asOfStr?: string): Sku360DomainFreshness => {
      if (!asOfStr) {
        return { asOf: loadedAt, status: 'UNKNOWN' };
      }
      try {
        const asOfTime = new Date(asOfStr).getTime();
        if (Number.isNaN(asOfTime)) {
          return { asOf: asOfStr, status: 'UNKNOWN' };
        }
        const nowTime = new Date(loadedAt).getTime();
        const diffDays = (nowTime - asOfTime) / (24 * 60 * 60 * 1000);
        const status: FreshnessStatus = diffDays <= maxFreshnessDays ? 'FRESH' : 'STALE';
        return { asOf: asOfStr, sourceTimestamp: asOfStr, status };
      } catch {
        return { asOf: asOfStr, status: 'UNKNOWN' };
      }
    };

    const domainFreshnesses = {
      sales: checkDomainFreshness(salesDomain.asOf),
      advertising: checkDomainFreshness(adsDomain.asOf),
      inventory: checkDomainFreshness(invDomain.asOf),
      reviews: checkDomainFreshness(revDomain.asOf),
      returns: checkDomainFreshness(retDomain.asOf),
      competitors: checkDomainFreshness(compDomain.asOf),
      profit: checkDomainFreshness(profitDomain.asOf),
    };

    let overallFreshness: FreshnessStatus = 'FRESH';
    const activeFreshStatuses = [
      domainFreshnesses.sales.status,
      domainFreshnesses.advertising.status,
      domainFreshnesses.inventory.status,
      domainFreshnesses.reviews.status,
      domainFreshnesses.returns.status,
      domainFreshnesses.competitors.status,
      domainFreshnesses.profit.status,
    ];
    if (activeFreshStatuses.some((s) => s === 'STALE')) {
      overallFreshness = 'STALE';
    } else if (activeFreshStatuses.some((s) => s === 'UNKNOWN')) {
      overallFreshness = 'UNKNOWN';
    }

    const freshness: Sku360Freshness = {
      ...domainFreshnesses,
      overall: overallFreshness,
      loadedAt,
    };

    // 13. Assemble Lineage Evidence
    const coreMetricsEvidence: OperationEvidenceItem[] = [
      {
        evidenceId: `EVI-SKU360-ASSEMBLY-${identity.skuId}-${currentPeriod.from.slice(0, 10)}`,
        category: 'CALCULATED_METRIC',
        title: 'Sku360 Cross-Domain Fact Assembly',
        content: `Assembled 7 operational domains for SKU ${identity.skuCode || identity.skuId} across period ${currentPeriod.from} to ${currentPeriod.to}. Net Profit: $${profitContext.netProfit.current.toFixed(2)}, Margin: ${(profitContext.netMargin.current * 100).toFixed(1)}%, Days Cover: ${inventoryContext.daysCover}d.`,
        source: 'Sku360ContextLoader',
        capturedAt: loadedAt,
        metadata: {
          workspaceId: identity.workspaceId,
          skuId: identity.skuId,
          period: `${currentPeriod.from}..${currentPeriod.to}`,
          availability: availability.overall,
          freshness: freshness.overall,
        },
      },
    ];

    const allEvidence = [...collectedEvidence, ...coreMetricsEvidence];

    return {
      identity,
      currentPeriod,
      baselinePeriod,
      sales: salesContext,
      advertising: advertisingContext,
      inventory: inventoryContext,
      reviews: reviewsContext,
      returns: returnsContext,
      competitors: competitorsContext,
      profit: profitContext,
      availability,
      freshness,
      evidence: allEvidence,
      loadedAt,
    };
  }

  /**
   * Workspace Mode: Loads Sku360 contexts for all requested SKUs across a workspace.
   */
  async loadWorkspace360(params: Workspace360LoadParams): Promise<Sku360BusinessContext[]> {
    const skuIds = params.skuIds && params.skuIds.length > 0
      ? params.skuIds
      : ['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'];

    const contexts: Sku360BusinessContext[] = [];
    for (const skuId of skuIds) {
      const ctx = await this.loadSku360({
        workspaceId: params.workspaceId,
        skuId,
        marketplaceId: params.marketplaceId,
        currentPeriod: params.currentPeriod,
        baselinePeriod: params.baselinePeriod,
        options: {
          timeoutMs: params.options?.timeoutMs,
          freshnessMaxAgeDays: params.options?.freshnessMaxAgeDays,
        },
      });
      contexts.push(ctx);
    }
    return contexts;
  }

  /**
   * Directly transforms Sku360BusinessContext into OperationAnomalyDetectionInput
   * for seamless integration with Phase 2 OperationAnomalyDetector.
   */
  static toAnomalyDetectorInput(
    context: Sku360BusinessContext,
    thresholdResolver?: ThresholdResolver,
  ): OperationAnomalyDetectionInput {
    // 1. Financials Input (Profit + Sales)
    const financials: AnomalyDetectionFinancials = {
      current: {
        revenue: context.profit.revenue.current,
        netProfit: context.profit.netProfit.current,
        margin: context.profit.netMargin.current,
        orderCount: context.sales.ordersCount.current,
        unitsSold: context.sales.unitsSold.current,
        cogs: context.profit.cogs.current,
        amazonFees: context.profit.amazonFees.current,
        fbaFee: context.profit.fbaFee.current,
        adsCost: context.profit.adsCost.current,
        returnLoss: context.profit.returnLoss.current,
        otherCosts: context.profit.otherCosts.current,
      },
      baseline: {
        revenue: context.profit.revenue.baseline,
        netProfit: context.profit.netProfit.baseline,
        margin: context.profit.netMargin.baseline,
        orderCount: context.sales.ordersCount.baseline,
        unitsSold: context.sales.unitsSold.baseline,
      },
      availability: context.availability.profit,
    };

    // 2. Advertising Input
    const advertising: AnomalyDetectionAdvertising = {
      current: {
        spend: context.advertising.spend.current,
        sales: context.advertising.sales.current,
        orders: context.advertising.orders.current,
        clicks: context.advertising.clicks.current,
        impressions: context.advertising.impressions.current,
        acos: context.advertising.acos.current,
      },
      baseline: {
        spend: context.advertising.spend.baseline,
        sales: context.advertising.sales.baseline,
        orders: context.advertising.orders.baseline,
        clicks: context.advertising.clicks.baseline,
        acos: context.advertising.acos.baseline,
      },
      targetAcos: context.advertising.targetAcos,
      searchTerms: context.advertising.searchTerms,
      availability: context.availability.advertising,
    };

    // 3. Inventory Input
    const inventory: AnomalyDetectionInventory = {
      current: {
        fulfillableQuantity: context.inventory.fulfillableQuantity,
        inboundQuantity: context.inventory.inboundQuantity,
        avgDailySales: context.inventory.avgDailySales,
        leadTimeDays: context.inventory.leadTimeDays,
        safetyStockDays: context.inventory.safetyStockDays,
        daysCover: context.inventory.daysCover,
      },
      status: context.identity.status,
      availability: context.availability.inventory,
    };

    // 4. Returns Input
    const returns: AnomalyDetectionReturns = {
      current: {
        returnUnits: context.returns.returnCount.current,
        deliveredUnits: context.returns.deliveredUnits.current,
        returnRate: context.returns.returnRate.current,
      },
      baseline: {
        returnUnits: context.returns.returnCount.baseline,
        deliveredUnits: context.returns.deliveredUnits.baseline,
        returnRate: context.returns.returnRate.baseline,
      },
      availability: context.availability.returns,
    };

    // 5. Reviews Input
    const reviews: AnomalyDetectionReviews = {
      current: {
        overallRating: context.reviews.overallRating,
        totalReviews: context.reviews.totalReviews,
        recentNegativeReviewsCount: context.reviews.negativeReviewCount,
        recentTotalReviewsCount: context.reviews.recentReviewCount,
        recentNegativeReviewRatio: context.reviews.negativeReviewRatio,
      },
      availability: context.availability.reviews,
    };

    // 6. Competitors Input
    const competitors: AnomalyDetectionCompetitors = {
      items: context.competitors.items.map((item) => ({
        competitorId: item.competitorId,
        asin: item.asin,
        name: item.name,
        currentPrice: item.currentPrice,
        baselinePrice: item.baselinePrice,
        rating: item.currentRating,
        baselineRating: item.baselineRating,
        reviewCount: item.reviewCount,
      })),
      availability: context.availability.competitors,
    };

    return {
      workspaceId: context.identity.workspaceId,
      skuId: context.identity.skuId,
      asin: context.identity.asin,
      marketplaceId: context.identity.marketplaceId,
      category: context.identity.category,
      dateRange: {
        from: context.currentPeriod.from,
        to: context.currentPeriod.to,
      },
      baselineDateRange: {
        from: context.baselinePeriod.from,
        to: context.baselinePeriod.to,
      },
      financials,
      advertising,
      inventory,
      returns,
      reviews,
      competitors,
      thresholdResolver,
      asOf: context.loadedAt,
    };
  }
}
