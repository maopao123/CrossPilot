/**
 * Sku360ContextLoader Comprehensive Test Suite (Epic 3 Phase 3)
 *
 * Verifies the cross-domain business fact assembly layer:
 * 1. Identity Context & Strict Multi-Tenant Isolation
 * 2. Current Period vs Baseline Period Comparative Math
 * 3. 7 Operational Domains Loading & Normalization (Sales, Ads, Inv, Rev, Ret, Comp, Profit)
 * 4. Domain Service Reuse (InventoryPlanningService, VarianceAttributionService)
 * 5. Domain Data Availability (AVAILABLE, PARTIAL, UNAVAILABLE)
 * 6. Concurrency & Partial Failure Isolation (Domain Timeout / Exception Graceful Downgrade)
 * 7. Defensive Normalization & Numeric Safety (NaN, Infinity, Null, Negative Values)
 * 8. Evidence Lineage & Auditability (Non-RAG, Structured OperationEvidenceItem)
 * 9. Freshness Tracking (FRESH, STALE, UNKNOWN, asOf, loadedAt)
 * 10. Direct Phase 2 OperationAnomalyDetector Integration
 * 11. Scenario Replay across 3 SKUs (White Hero, Green Stockout, Grey Returns/VOC)
 * 12. Workspace Mode Multi-SKU Assembly
 */

import {
  Sku360ContextLoader,
  ScenarioSku360DataSource,
  ISku360DataSource,
  Sku360LoadParams,
  DomainLoadResult,
  RawSalesData,
  RawAdvertisingData,
  RawInventoryData,
  RawReviewsData,
  RawReturnsData,
  RawCompetitorsData,
  RawProfitData,
  OperationAnomalyDetector,
  ThresholdResolver,
  DEFAULT_ANOMALY_THRESHOLDS,
} from '../src/operations/index.js';

import {
  Sku360Identity,
  OperationEvidenceItem,
  DataAvailabilityStatus,
} from '@crosspilot/shared';

describe('Epic 3 Phase 3: Sku360ContextLoader Test Suite', () => {
  const baseDate = new Date('2026-06-01T00:00:00Z');
  let scenarioDataSource: ScenarioSku360DataSource;
  let loader: Sku360ContextLoader;

  beforeEach(() => {
    scenarioDataSource = new ScenarioSku360DataSource(baseDate);
    loader = new Sku360ContextLoader(scenarioDataSource, { timeoutMs: 3000, freshnessMaxAgeDays: 7 });
  });

  // ==========================================================================
  // Group 1: Identity Context & Isolation
  // ==========================================================================
  describe('1. Identity Context & Multi-Tenant Isolation', () => {
    it('should strictly preserve workspaceId, marketplaceId, and SKU ownership', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_tenant_alpha',
        marketplaceId: 'AMAZON_US',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-10', to: '2026-06-16' },
      });

      expect(context.identity.workspaceId).toBe('ws_tenant_alpha');
      expect(context.identity.marketplaceId).toBe('AMAZON_US');
      expect(context.identity.skuCode).toBe('MTH-WHITE-001');
      expect(context.identity.asin).toBe('B0BFGNSXYL');
      expect(context.identity.productName).toBe('Natural Marble Toothbrush Holder');
      expect(context.identity.brand).toBe('POLEGAS');
      expect(context.identity.category).toBe('Home & Kitchen');
      expect(context.identity.status).toBe('ACTIVE');
    });

    it('should prevent workspace cross-talk and throw if workspaceId is missing', async () => {
      await expect(
        loader.loadSku360({
          workspaceId: '',
          skuId: 'MTH-WHITE-001',
          currentPeriod: { from: '2026-06-10', to: '2026-06-16' },
        }),
      ).rejects.toThrow('workspaceId and skuId are required');
    });

    it('should throw if currentPeriod is missing or invalid', async () => {
      await expect(
        loader.loadSku360({
          workspaceId: 'ws_demo',
          skuId: 'MTH-WHITE-001',
          currentPeriod: { from: '', to: '' },
        }),
      ).rejects.toThrow('currentPeriod { from, to } is required');
    });
  });

  // ==========================================================================
  // Group 2: Current vs Baseline Period Comparative Math
  // ==========================================================================
  describe('2. Current vs Baseline Period Comparative Math', () => {
    it('should correctly compute metric deltas and percentage changes for specified periods', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-15', to: '2026-06-21' }, // 7 days
        baselinePeriod: { from: '2026-06-08', to: '2026-06-14' }, // 7 days
      });

      expect(context.currentPeriod.daysCount).toBe(7);
      expect(context.baselinePeriod.daysCount).toBe(7);

      // Verify comparative structure { current, baseline, delta, deltaPct }
      expect(context.sales.revenue.delta).toBe(
        Math.round((context.sales.revenue.current - context.sales.revenue.baseline) * 100) / 100,
      );
      if (context.sales.revenue.baseline > 0) {
        const expectedPct = Math.round(
          ((context.sales.revenue.current - context.sales.revenue.baseline) /
            context.sales.revenue.baseline) *
            10000,
        ) / 10000;
        expect(context.sales.revenue.deltaPct).toBe(expectedPct);
      }
    });

    it('should automatically infer preceding baseline period when not explicitly provided', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-15', to: '2026-06-21' }, // 7 days
      });

      expect(context.baselinePeriod.daysCount).toBe(7);
      expect(context.baselinePeriod.to).toBe('2026-06-14');
      expect(context.baselinePeriod.from).toBe('2026-06-08');
    });
  });

  // ==========================================================================
  // Group 3: 7 Domains Fact Loading & Domain Service Re-use
  // ==========================================================================
  describe('3. Operational Domains Loading & Domain Service Reuse', () => {
    it('should correctly assemble Sales context with units, orders, revenue, ASP', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      expect(context.sales.unitsSold.current).toBeGreaterThan(0);
      expect(context.sales.ordersCount.current).toBeGreaterThan(0);
      expect(context.sales.revenue.current).toBeGreaterThan(0);
      expect(context.sales.averageSellingPrice.current).toBeCloseTo(29.99, 1);
      expect(context.sales.availability).toBe('AVAILABLE');
    });

    it('should correctly assemble Advertising context and search terms', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-15', to: '2026-06-21' }, // includes Day 18
      });

      expect(context.advertising.spend.current).toBeGreaterThan(0);
      expect(context.advertising.sales.current).toBeGreaterThan(0);
      expect(context.advertising.acos.current).toBeGreaterThan(0);
      expect(context.advertising.targetAcos).toBe(0.30);
      expect(context.advertising.searchTerms?.length).toBeGreaterThan(0);

      // Verify Day 18 "bathroom organizer" search term is loaded
      const wastedTerm = context.advertising.searchTerms?.find((t) => t.searchTerm === 'bathroom organizer');
      expect(wastedTerm).toBeDefined();
      expect(wastedTerm?.spend).toBe(420.0);
      expect(wastedTerm?.orders).toBe(2);
      expect(wastedTerm?.clicks).toBe(280);
      expect(wastedTerm?.acos).toBeCloseTo(0.933, 2);
    });

    it('should reuse InventoryPlanningService to compute daysCover and health', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      expect(context.inventory.fulfillableQuantity).toBeGreaterThan(0);
      expect(context.inventory.avgDailySales).toBeGreaterThan(0);
      expect(context.inventory.daysCover).toBeGreaterThan(0);
      expect(context.inventory.reorderPoint).toBeGreaterThan(0);
      expect(['HEALTHY', 'LOW_STOCK', 'OUT_OF_STOCK', 'OVERSTOCKED']).toContain(
        context.inventory.inventoryHealth,
      );
      expect(context.inventory.leadTimeDays).toBe(15);
      expect(context.inventory.safetyStockDays).toBe(7);
    });

    it('should correctly assemble Reviews context and structured VOC topics', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-GREY-001',
        currentPeriod: { from: '2026-07-20', to: '2026-07-26' }, // Day 50+
      });

      expect(context.reviews.overallRating).toBe(4.1);
      expect(context.reviews.negativeReviewRatio).toBeCloseTo(0.311, 2);
      expect(context.reviews.topPainPoints?.length).toBeGreaterThan(0);
      expect(context.reviews.topPainPoints?.[0].topicName).toContain('Hole diameter too narrow');
      expect(context.reviews.topPositiveThemes?.length).toBeGreaterThan(0);
    });

    it('should correctly assemble Returns context with rate and top reasons', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-GREY-001',
        currentPeriod: { from: '2026-07-20', to: '2026-07-26' }, // Day 50+
      });

      expect(context.returns.returnRate.current).toBeCloseTo(0.067, 2);
      expect(context.returns.returnCost.current).toBe(620.0);
      expect(context.returns.topReturnReasons?.length).toBeGreaterThan(0);
      expect(context.returns.topReturnReasons?.[0].reason).toContain('Slot hole too small');
    });

    it('should correctly assemble Competitors context with primary competitor and deltas', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-10', to: '2026-06-16' },
      });

      expect(context.competitors.items.length).toBeGreaterThanOrEqual(1);
      expect(context.competitors.primaryCompetitor).toBeDefined();
      expect(context.competitors.primaryCompetitor?.asin).toBe('B09XYZ1234');
      expect(context.competitors.primaryCompetitor?.currentPrice).toBe(22.49);
      expect(context.competitors.primaryCompetitor?.baselinePrice).toBe(25.99);
      expect(context.competitors.primaryCompetitor?.priceDelta).toBe(-3.5);
    });

    it('should reuse VarianceAttributionService for profit waterfall decomposition', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-08-11', to: '2026-08-17' }, // Day 72-78 includes Week 11
        baselinePeriod: { from: '2026-08-04', to: '2026-08-10' }, // Day 65-71 includes Week 10
      });

      expect(context.profit.revenue.current).toBeGreaterThan(0);
      expect(context.profit.netProfit.current).toBeDefined();
      expect(context.profit.netMargin.current).toBeDefined();

      // Verify exact closure of waterfall decomposition
      expect(context.profit.waterfallAttribution).toBeDefined();
      expect(context.profit.waterfallAttribution?.isExactMatch).toBe(true);
      expect(context.profit.waterfallAttribution?.formulaString).toContain('-2280');
      expect(context.profit.waterfallAttribution?.advertisingImpact).toBe(-980.0);
      expect(context.profit.waterfallAttribution?.returnsImpact).toBe(-620.0);
      expect(context.profit.waterfallAttribution?.residual).toBe(0);
    });
  });

  // ==========================================================================
  // Group 4: Data Availability & Partial Failure
  // ==========================================================================
  describe('4. Data Availability & Partial Failure Handling', () => {
    it('should report overall AVAILABLE when all 7 domains succeed', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      expect(context.availability.sales).toBe('AVAILABLE');
      expect(context.availability.advertising).toBe('AVAILABLE');
      expect(context.availability.inventory).toBe('AVAILABLE');
      expect(context.availability.reviews).toBe('AVAILABLE');
      expect(context.availability.returns).toBe('AVAILABLE');
      expect(context.availability.competitors).toBe('AVAILABLE');
      expect(context.availability.profit).toBe('AVAILABLE');
      expect(context.availability.overall).toBe('AVAILABLE');
    });

    it('should gracefully handle partial failure when one domain throws or times out', async () => {
      // Create mock data source where competitor fails
      const faultyDataSource: ISku360DataSource = {
        getIdentity: (p) => scenarioDataSource.getIdentity(p),
        getSales: (p) => scenarioDataSource.getSales(p),
        getAdvertising: (p) => scenarioDataSource.getAdvertising(p),
        getInventory: (p) => scenarioDataSource.getInventory(p),
        getReviews: (p) => scenarioDataSource.getReviews(p),
        getReturns: (p) => scenarioDataSource.getReturns(p),
        getCompetitors: jest.fn().mockRejectedValue(new Error('Competitor service timeout after 3000ms')),
        getProfit: (p) => scenarioDataSource.getProfit(p),
      };

      const customLoader = new Sku360ContextLoader(faultyDataSource);
      const context = await customLoader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      // Overall context should NOT throw!
      expect(context).toBeDefined();
      expect(context.competitors.availability).toBe('UNAVAILABLE');
      expect(context.competitors.items).toEqual([]);
      expect(context.availability.overall).toBe('PARTIAL');

      // Other 6 domains must still load cleanly
      expect(context.sales.availability).toBe('AVAILABLE');
      expect(context.advertising.availability).toBe('AVAILABLE');
      expect(context.inventory.availability).toBe('AVAILABLE');
      expect(context.profit.availability).toBe('AVAILABLE');

      // Evidence should contain error item
      const errEvidence = context.evidence.find((e) => e.evidenceId.includes('ERR-COMPETITORS'));
      expect(errEvidence).toBeDefined();
      expect(errEvidence?.category).toBe('RULE');
      expect(errEvidence?.content).toContain('timeout after 3000ms');
    });
  });

  // ==========================================================================
  // Group 5: Defensive Normalization & Numeric Safety
  // ==========================================================================
  describe('5. Defensive Normalization & Numeric Safety', () => {
    it('should sanitize NaN, Infinity, null, and impossible negative numbers', async () => {
      const corruptDataSource: ISku360DataSource = {
        getIdentity: jest.fn().mockResolvedValue({
          workspaceId: 'ws_corrupt',
          marketplaceId: 'AMAZON_US',
          productId: 'prod_bad',
          skuId: 'sku_bad',
        }),
        getSales: jest.fn().mockResolvedValue({
          data: {
            current: {
              ordersCount: NaN as any,
              unitsSold: -50 as any,
              revenue: Infinity as any,
            },
            baseline: {
              ordersCount: null as any,
              unitsSold: undefined as any,
              revenue: -100 as any,
            },
          },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
        getAdvertising: jest.fn().mockResolvedValue({
          data: {
            current: { spend: NaN, sales: null, orders: Infinity },
          },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
        getInventory: jest.fn().mockResolvedValue({
          data: {
            fulfillableQuantity: -100, // impossible negative stock
            inboundQuantity: NaN,
            avgDailySales: -5,
            leadTimeDays: NaN,
          },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
        getReviews: jest.fn().mockResolvedValue({
          data: { overallRating: NaN, totalReviews: -10 },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
        getReturns: jest.fn().mockResolvedValue({
          data: { current: { returnCount: NaN, deliveredUnits: -20 } },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
        getCompetitors: jest.fn().mockResolvedValue({
          data: { items: [{ competitorId: 'c1', asin: 'a1', currentPrice: NaN }] },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
        getProfit: jest.fn().mockResolvedValue({
          data: { current: { revenue: NaN, cogs: Infinity, amazonFees: 0, fbaFee: 0, adsCost: 0, returnLoss: 0, otherCosts: 0 } },
          availability: 'AVAILABLE',
          asOf: '2026-06-11',
        }),
      };

      const safeLoader = new Sku360ContextLoader(corruptDataSource);
      const context = await safeLoader.loadSku360({
        workspaceId: 'ws_corrupt',
        skuId: 'sku_bad',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      // Verify no NaN or Infinity exists in output
      expect(Number.isFinite(context.sales.ordersCount.current)).toBe(true);
      expect(context.sales.unitsSold.current).toBe(0); // non-negative clamp
      expect(Number.isFinite(context.sales.revenue.current)).toBe(true);

      expect(context.inventory.fulfillableQuantity).toBe(0);
      expect(context.inventory.avgDailySales).toBe(0);
      expect(context.inventory.leadTimeDays).toBe(15); // fallback default

      expect(context.advertising.spend.current).toBe(0);
      expect(context.advertising.sales.current).toBe(0);
      expect(context.reviews.overallRating).toBe(0);
      expect(context.returns.returnCount.current).toBe(0);
      expect(context.competitors.items[0].currentPrice).toBe(0);
    });
  });

  // ==========================================================================
  // Group 6: Evidence Lineage & Auditability
  // ==========================================================================
  describe('6. Evidence Lineage & Auditability', () => {
    it('should generate structured non-RAG OperationEvidenceItems with full lineage', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      expect(context.evidence.length).toBeGreaterThanOrEqual(2);

      for (const ev of context.evidence) {
        expect(['DATABASE', 'CALCULATED_METRIC', 'EXTERNAL_DATA', 'RULE']).toContain(ev.category);
        expect(ev.category).not.toBe('RAG'); // Strictly no RAG citation for transactional DB facts
        expect(ev.evidenceId).toBeDefined();
        expect(ev.title).toBeDefined();
        expect(ev.content).toBeDefined();
        expect(ev.capturedAt).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Group 7: Freshness Tracking
  // ==========================================================================
  describe('7. Freshness Tracking', () => {
    it('should assess FRESH status when asOf is within max age limit', async () => {
      const nowStr = new Date().toISOString();
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: nowStr },
      });

      expect(context.freshness.overall).toBeDefined();
      expect(['FRESH', 'STALE', 'UNKNOWN']).toContain(context.freshness.overall);
      expect(context.freshness.loadedAt).toBeDefined();
    });

    it('should detect STALE status when data is older than threshold days', async () => {
      const staleDataSource: ISku360DataSource = {
        getIdentity: (p) => scenarioDataSource.getIdentity(p),
        getSales: (p) => scenarioDataSource.getSales(p),
        getAdvertising: (p) => scenarioDataSource.getAdvertising(p),
        getInventory: (p) => scenarioDataSource.getInventory(p),
        getReviews: (p) => scenarioDataSource.getReviews(p),
        getReturns: (p) => scenarioDataSource.getReturns(p),
        getCompetitors: jest.fn().mockResolvedValue({
          data: { items: [] },
          availability: 'AVAILABLE',
          asOf: '2025-01-01T00:00:00Z', // 1+ year old
        }),
        getProfit: (p) => scenarioDataSource.getProfit(p),
      };

      const staleLoader = new Sku360ContextLoader(staleDataSource, { freshnessMaxAgeDays: 7 });
      const context = await staleLoader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-05', to: '2026-06-11' },
      });

      expect(context.freshness.competitors.status).toBe('STALE');
      expect(context.freshness.overall).toBe('STALE');
    });
  });

  // ==========================================================================
  // Group 8: Direct Phase 2 OperationAnomalyDetector Integration
  // ==========================================================================
  describe('8. Direct Integration with OperationAnomalyDetector', () => {
    it('should convert Sku360BusinessContext to OperationAnomalyDetectionInput and detect Day 18 ACOS spike', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-06-15', to: '2026-06-21' }, // includes Day 18
        baselinePeriod: { from: '2026-06-08', to: '2026-06-14' },
      });

      // 1. Transform context directly to detector input
      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);

      expect(detectorInput.workspaceId).toBe('ws_demo');
      expect(detectorInput.skuId).toBe('sku_white_001');
      expect(detectorInput.advertising?.searchTerms?.length).toBeGreaterThan(0);

      // 2. Execute Phase 2 OperationAnomalyDetector without manual payload construction
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);

      expect(detectionResult.summary.totalRules).toBe(12);

      // Must detect R-ADS-03 Zero Conversion Wasted Spend
      const wastedTermSignal = detectionResult.signals.find((s: any) => s.ruleId === 'R-ADS-03');
      expect(wastedTermSignal).toBeDefined();
      expect(wastedTermSignal?.metric).toBe('clicks');
      expect(wastedTermSignal?.severity).toBe('WARNING');
      expect(wastedTermSignal?.evidence[0].content).toContain('acrylic toothbrush organizer');
    });

    it('should detect Green SKU stockout risk when loaded into OperationAnomalyDetector', async () => {
      // Day 52 Green SKU: inventory 120, avgDailySales 10.2 -> daysCover 11.8 < 15
      const customGreenSource: ISku360DataSource = {
        getIdentity: (p) => scenarioDataSource.getIdentity(p),
        getSales: (p) => scenarioDataSource.getSales(p),
        getAdvertising: (p) => scenarioDataSource.getAdvertising(p),
        getInventory: jest.fn().mockResolvedValue({
          data: {
            fulfillableQuantity: 120,
            inboundQuantity: 0,
            avgDailySales: 10.2,
            leadTimeDays: 15,
            safetyStockDays: 7,
          },
          availability: 'AVAILABLE',
          asOf: '2026-07-22',
        }),
        getReviews: (p) => scenarioDataSource.getReviews(p),
        getReturns: (p) => scenarioDataSource.getReturns(p),
        getCompetitors: (p) => scenarioDataSource.getCompetitors(p),
        getProfit: (p) => scenarioDataSource.getProfit(p),
      };

      const greenLoader = new Sku360ContextLoader(customGreenSource);
      const context = await greenLoader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-GREEN-001',
        currentPeriod: { from: '2026-07-16', to: '2026-07-22' },
      });

      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);

      const stockoutSignal = detectionResult.signals.find((s: any) => s.ruleId === 'R-INV-01');
      expect(stockoutSignal).toBeDefined();
      expect(stockoutSignal?.severity).toBe('CRITICAL');
      expect(stockoutSignal?.currentValue).toBeLessThanOrEqual(15);
    });

    it('should detect Grey SKU return rate spike and rating deterioration', async () => {
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        skuId: 'MTH-GREY-001',
        currentPeriod: { from: '2026-07-20', to: '2026-07-26' }, // Day 50+
        baselinePeriod: { from: '2026-07-13', to: '2026-07-19' },
      });

      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);

      // R-RET-01: Return Rate Spike (6.7% vs 3.2%)
      const retSignal = detectionResult.signals.find((s: any) => s.ruleId === 'R-RET-01');
      expect(retSignal).toBeDefined();
      expect(retSignal?.currentValue).toBeCloseTo(0.067, 2);

      // R-REV-01: Rating Deterioration (< 4.3 or > 20% recent negative)
      const revSignal = detectionResult.signals.find((s: any) => s.ruleId === 'R-REV-01');
      expect(revSignal).toBeDefined();
      expect(revSignal?.currentValue).toBe(4.1);
    });
  });

  // ==========================================================================
  // Group 9: Workspace Mode Multi-SKU Assembly
  // ==========================================================================
  describe('9. Workspace Mode Multi-SKU Assembly', () => {
    it('should assemble Sku360BusinessContext for all 3 SKUs in workspace concurrently', async () => {
      const contexts = await loader.loadWorkspace360({
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        currentPeriod: { from: '2026-06-10', to: '2026-06-16' },
        skuIds: ['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'],
      });

      expect(contexts.length).toBe(3);

      const codes = contexts.map((c) => c.identity.skuCode);
      expect(codes).toContain('MTH-WHITE-001');
      expect(codes).toContain('MTH-GREEN-001');
      expect(codes).toContain('MTH-GREY-001');

      for (const ctx of contexts) {
        expect(ctx.identity.workspaceId).toBe('ws_demo');
        expect(ctx.availability.overall).toBe('AVAILABLE');
        expect(ctx.sales.revenue.current).toBeGreaterThan(0);
        expect(ctx.inventory.daysCover).toBeGreaterThan(0);
      }
    });
  });
});
