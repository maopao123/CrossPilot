/**
 * Cross-Domain Diagnosis Service Test Suite (Epic 3 Phase 4)
 *
 * Verifies deterministic causal attribution and driver isolation across 7 domains:
 * 1. Mathematical Profit Waterfall Closure (D1 & R-PROF-01, Residual = 0, PROVEN)
 * 2. Advertising Inefficiency & Search Term Waste (D2 & R-ADS-01/02/03)
 * 3. Inventory Stockout & Velocity Surge (D3 & R-INV-01/02/03)
 * 4. Product Quality Cross-Domain Synthesis (D4/D5 & R-RET-01 + R-REV-01)
 * 5. Competitor Pressure & Freshness Verification (D6 & R-COMP-01/02)
 * 6. Multi-Domain Concurrent Root Cause Ordering (D7)
 * 7. Clean Healthy State Interception (D8: signals = [] -> 0 diagnoses)
 * 8. Missing / Partial Telemetry Degradation (D9: UNAVAILABLE / PARTIAL)
 * 9. Conflicting Signals (D10: Sales up +25%, Profit down -35% -> Profit Dilution)
 * 10. Strict Architectural Boundary: Load != Detect != Diagnose != Recommend
 * 11. End-to-End Pipeline Integration with Sku360ContextLoader & Scenario Data
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  CrossDomainDiagnosisResponse,
  OperationEvidenceItem,
} from '@crosspilot/shared';

import {
  CrossDomainDiagnosisService,
  ProfitDropPattern,
  AdvertisingEfficiencyPattern,
  InventoryStockoutPattern,
  ProductQualityIssuePattern,
  CompetitorPressurePattern,
  Sku360ContextLoader,
  ScenarioSku360DataSource,
  OperationAnomalyDetector,
} from '../src/operations/index.js';

// Helper to build mock Sku360BusinessContext
function buildMockContext(overrides?: Partial<Sku360BusinessContext>): Sku360BusinessContext {
  const defaultContext: Sku360BusinessContext = {
    identity: {
      workspaceId: 'ws_demo',
      marketplaceId: 'AMAZON_US',
      productId: 'prod_mth_001',
      skuId: 'sku_white_001',
      skuCode: 'MTH-WHITE-001',
      asin: 'B0BFGNSXYL',
      productName: 'Natural Marble Toothbrush Holder',
      status: 'ACTIVE',
    },
    currentPeriod: { from: '2026-03-08', to: '2026-03-14', daysCount: 7 },
    baselinePeriod: { from: '2026-03-01', to: '2026-03-07', daysCount: 7 },
    sales: {
      ordersCount: { current: 280, baseline: 300, delta: -20, deltaPct: -0.067 },
      unitsSold: { current: 310, baseline: 330, delta: -20, deltaPct: -0.061 },
      revenue: { current: 8990.0, baseline: 9570.0, delta: -580.0, deltaPct: -0.061 },
      averageSellingPrice: { current: 29.0, baseline: 29.0, delta: 0, deltaPct: 0 },
      availability: 'AVAILABLE',
    },
    advertising: {
      spend: { current: 2000.0, baseline: 1020.0, delta: 980.0, deltaPct: 0.961 },
      sales: { current: 5100.0, baseline: 4250.0, delta: 850.0, deltaPct: 0.20 },
      orders: { current: 175, baseline: 146, delta: 29, deltaPct: 0.199 },
      clicks: { current: 2200, baseline: 1100, delta: 1100, deltaPct: 1.0 },
      impressions: { current: 45000, baseline: 25000, delta: 20000, deltaPct: 0.8 },
      acos: { current: 0.392, baseline: 0.24, delta: 0.152, deltaPct: 0.633 },
      roas: { current: 2.55, baseline: 4.17, delta: -1.62, deltaPct: -0.388 },
      ctr: { current: 0.049, baseline: 0.044, delta: 0.005, deltaPct: 0.114 },
      cvr: { current: 0.08, baseline: 0.133, delta: -0.053, deltaPct: -0.398 },
      targetAcos: 0.30,
      searchTerms: [
        {
          searchTerm: 'bathroom organizer counter',
          impressions: 12000,
          clicks: 28,
          spend: 42.50,
          orders: 0,
          sales: 0,
        },
        {
          searchTerm: 'electric toothbrush stand cheap',
          impressions: 8500,
          clicks: 24,
          spend: 38.00,
          orders: 0,
          sales: 0,
        },
      ],
      availability: 'AVAILABLE',
    },
    inventory: {
      fulfillableQuantity: 420,
      inboundQuantity: 300,
      avgDailySales: 44.3,
      daysCover: 9.5,
      leadTimeDays: 15,
      safetyStockDays: 14,
      reorderPoint: 665,
      inventoryHealth: 'LOW_STOCK',
      availability: 'AVAILABLE',
    },
    reviews: {
      overallRating: 4.6,
      totalReviews: 185,
      recentReviewCount: 12,
      negativeReviewCount: 1,
      negativeReviewRatio: 0.083,
      availability: 'AVAILABLE',
    },
    returns: {
      returnCount: { current: 9, baseline: 8, delta: 1, deltaPct: 0.125 },
      deliveredUnits: { current: 290, baseline: 310, delta: -20, deltaPct: -0.065 },
      returnRate: { current: 0.031, baseline: 0.026, delta: 0.005, deltaPct: 0.192 },
      returnCost: { current: 270.0, baseline: 240.0, delta: 30.0, deltaPct: 0.125 },
      availability: 'AVAILABLE',
    },
    competitors: {
      items: [
        {
          competitorId: 'comp_01',
          asin: 'B0COMP01XX',
          relationType: 'DIRECT_SUBSTITUTE',
          isPrimary: true,
          currentPrice: 28.99,
          baselinePrice: 28.99,
          priceDelta: 0,
          priceDeltaPct: 0,
          currentRating: 4.5,
        },
      ],
      availability: 'AVAILABLE',
    },
    profit: {
      revenue: { current: 8990.0, baseline: 9570.0, delta: -580.0, deltaPct: -0.061 },
      cogs: { current: 2697.0, baseline: 2871.0, delta: -174.0, deltaPct: -0.061 },
      amazonFees: { current: 1348.5, baseline: 1435.5, delta: -87.0, deltaPct: -0.061 },
      fbaFee: { current: 1395.0, baseline: 1485.0, delta: -90.0, deltaPct: -0.061 },
      adsCost: { current: 2000.0, baseline: 1020.0, delta: 980.0, deltaPct: 0.961 },
      returnLoss: { current: 1000.0, baseline: 380.0, delta: 620.0, deltaPct: 1.632 },
      otherCosts: { current: 250.0, baseline: 138.5, delta: 111.5, deltaPct: 0.805 },
      netProfit: { current: 299.5, baseline: 2240.0, delta: -1940.5, deltaPct: -0.866 },
      netMargin: { current: 0.033, baseline: 0.234, delta: -0.201, deltaPct: -0.859 },
      waterfallAttribution: {
        totalVariance: -2280.0,
        advertisingImpact: -980.0,
        returnsImpact: -620.0,
        inventoryImpact: -510.0,
        priceImpact: -310.0,
        otherImpact: 140.0,
        isExactMatch: true,
        residual: 0.0,
        formulaString: '-2280 = -980 -620 -510 -310 +140',
      },
      availability: 'AVAILABLE',
    },
    availability: {
      sales: 'AVAILABLE',
      advertising: 'AVAILABLE',
      inventory: 'AVAILABLE',
      reviews: 'AVAILABLE',
      returns: 'AVAILABLE',
      competitors: 'AVAILABLE',
      profit: 'AVAILABLE',
      overall: 'AVAILABLE',
    },
    freshness: {
      sales: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      advertising: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      inventory: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      reviews: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      returns: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      competitors: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      profit: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
      overall: 'FRESH',
      loadedAt: '2026-03-14T00:00:00Z',
    },
    evidence: [],
    loadedAt: '2026-03-14T00:00:00Z',
  };

  return { ...defaultContext, ...overrides };
}

function buildMockSignal(overrides?: Partial<BusinessSignal>): BusinessSignal {
  return {
    signalId: 'SIG-R-PROF-01-ws-sku-20260308_20260314',
    workspaceId: 'ws_demo',
    skuId: 'sku_white_001',
    asin: 'B0BFGNSXYL',
    domain: 'PROFIT',
    code: 'PROFIT_DROP',
    metric: 'netProfit',
    currentValue: 5960.0,
    baselineValue: 8240.0,
    changePct: -0.277,
    thresholdValue: 0.20,
    severity: 'CRITICAL',
    direction: 'DOWN',
    detectedBy: 'FORMULA',
    ruleId: 'R-PROF-01',
    title: 'Net Profit Dropped 27.7%',
    description: 'Net profit decreased by $2,280.00 (-27.7%) compared to baseline.',
    evidence: [],
    detectedAt: '2026-03-14T00:00:00Z',
    ...overrides,
  };
}

describe('CrossDomainDiagnosisService', () => {
  describe('1. Mathematical Profit Waterfall Closure (D1 & R-PROF-01)', () => {
    it('should perform exact waterfall profit attribution with Residual = 0 and PROVEN causal strength', () => {
      const context = buildMockContext();
      const signal = buildMockSignal({
        code: 'PROFIT_DROP',
        ruleId: 'R-PROF-01',
        changePct: -0.277,
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      expect(response.diagnoses.length).toBeGreaterThanOrEqual(1);
      const profitDiag = response.diagnoses.find((d) => d.affectedDomains.includes('PROFIT'));
      expect(profitDiag).toBeDefined();

      // Assert Evidence Gate & Mathematical Closure
      expect(profitDiag!.gateStatus).toBe('SUPPORTED');
      expect(profitDiag!.confidence).toBeGreaterThanOrEqual(0.95);
      expect(profitDiag!.rootCauseCode).toBe('PROFIT_EROSION_WATERFALL_ATTRIBUTED');

      // Primary driver: Advertising (-$980, largest negative impact)
      expect(profitDiag!.primaryDriver.domain).toBe('ADVERTISING');
      expect(profitDiag!.primaryDriver.impactAmount).toBe(-980.0);
      expect(profitDiag!.primaryDriver.causalStrength).toBe('PROVEN');
      expect(profitDiag!.primaryDriver.contributionRatio).toBeGreaterThan(0.35);

      // Secondary drivers: Returns (-$620), Inventory (-$510), Price (-$310)
      const secDomains = profitDiag!.secondaryDrivers.map((d) => d.domain);
      expect(secDomains).toContain('RETURNS');
      expect(secDomains).toContain('INVENTORY');
      expect(secDomains).toContain('SALES');

      // Check exact formula string in evidence
      const wfEvidence = profitDiag!.evidence.find((e) => e.source === 'VarianceAttributionService');
      expect(wfEvidence).toBeDefined();
      expect(wfEvidence!.content).toContain('-2280 = -980 -620 -510 -310 +140');
      expect(wfEvidence!.metadata?.residual).toBe(0);
      expect(wfEvidence!.metadata?.isExactMatch).toBe(true);
    });

    it('should deterministically rank drivers by absolute impact amount descending', () => {
      const context = buildMockContext();
      const signal = buildMockSignal();

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const profitDiag = response.diagnoses.find((d) => d.affectedDomains.includes('PROFIT'))!;
      const allDrivers = [profitDiag.primaryDriver, ...profitDiag.secondaryDrivers];

      for (let i = 0; i < allDrivers.length - 1; i++) {
        const currentImpact = Math.abs(allDrivers[i].impactAmount ?? 0);
        const nextImpact = Math.abs(allDrivers[i + 1].impactAmount ?? 0);
        expect(currentImpact).toBeGreaterThanOrEqual(nextImpact);
      }
    });
  });
  describe('2. Advertising Inefficiency & Search Term Waste (D2 & R-ADS-01/02/03)', () => {
    it('should isolate non-converting search terms and calculate exact wasted spend', () => {
      const context = buildMockContext({
        advertising: {
          ...buildMockContext().advertising,
          targetAcos: 0.40,
        },
      });
      const adSignals: BusinessSignal[] = [
        buildMockSignal({
          domain: 'ADVERTISING',
          code: 'ACOS_SPIKE',
          ruleId: 'R-ADS-01',
          metric: 'acos',
          currentValue: 0.392,
          baselineValue: 0.24,
          direction: 'UP',
        }),
        buildMockSignal({
          domain: 'ADVERTISING',
          code: 'ZERO_CONVERSION_SPEND',
          ruleId: 'R-ADS-03',
          metric: 'wastedSpend',
          currentValue: 80.5,
          direction: 'UP',
        }),
      ];

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: adSignals,
      });

      const adDiag = response.diagnoses.find((d) => d.affectedDomains.includes('ADVERTISING'));
      expect(adDiag).toBeDefined();
      expect(adDiag!.gateStatus).toBe('SUPPORTED');
      expect(adDiag!.rootCauseCode).toBe('AD_EFFICIENCY_SEARCH_TERM_WASTE');

      // Total wasted spend = $42.50 + $38.00 = $80.50
      expect(adDiag!.primaryDriver.metric).toBe('zeroConversionSearchTermSpend');
      expect(adDiag!.primaryDriver.impactAmount).toBe(-80.5);
      expect(adDiag!.primaryDriver.causalStrength).toBe('STRONG');
      expect(adDiag!.primaryDriver.description).toContain('bathroom organizer counter');
    });

    it('should detect spend-to-sales decoupling when spend surges without revenue gain', () => {
      const context = buildMockContext({
        advertising: {
          ...buildMockContext().advertising,
          spend: { current: 3000.0, baseline: 2000.0, delta: 1000.0, deltaPct: 0.50 },
          sales: { current: 5000.0, baseline: 5000.0, delta: 0, deltaPct: 0.0 },
          searchTerms: [], // no search terms
        },
      });

      const decoupleSignal = buildMockSignal({
        domain: 'ADVERTISING',
        code: 'AD_SPEND_INEFFICIENT',
        ruleId: 'R-ADS-02',
        metric: 'spendGrowth',
        currentValue: 0.50,
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [decoupleSignal],
      });

      const adDiag = response.diagnoses.find((d) => d.affectedDomains.includes('ADVERTISING'))!;
      expect(adDiag).toBeDefined();
      expect(adDiag.rootCauseCode).toBe('AD_SPEND_DECOUPLED_FROM_SALES');
      expect(adDiag.primaryDriver.causalStrength).toBe('STRONG');
    });
  });

  describe('3. Inventory Stockout & Velocity Surge (D3 & R-INV-01/02/03)', () => {
    it('should diagnose imminent stockout accelerated by sales velocity surge', () => {
      const context = buildMockContext({
        sales: {
          ...buildMockContext().sales,
          unitsSold: { current: 500, baseline: 350, delta: 150, deltaPct: 0.429 },
        },
        inventory: {
          fulfillableQuantity: 520,
          inboundQuantity: 200,
          avgDailySales: 44.1,
          daysCover: 11.8,
          leadTimeDays: 15,
          safetyStockDays: 14,
          reorderPoint: 660,
          inventoryHealth: 'LOW_STOCK',
          availability: 'AVAILABLE',
        },
      });

      const invSignal = buildMockSignal({
        domain: 'INVENTORY',
        code: 'STOCKOUT_IMMINENT',
        ruleId: 'R-INV-01',
        metric: 'daysCover',
        currentValue: 11.8,
        thresholdValue: 15,
        direction: 'DOWN',
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [invSignal],
      });

      const invDiag = response.diagnoses.find((d) => d.affectedDomains.includes('INVENTORY'));
      expect(invDiag).toBeDefined();
      expect(invDiag!.rootCauseCode).toBe('INVENTORY_RUNOUT_HIGH_VELOCITY');
      expect(invDiag!.primaryDriver.metric).toBe('daysCover');
      expect(invDiag!.primaryDriver.causalStrength).toBe('STRONG');

      // Secondary driver should identify the sales velocity surge
      const salesDriver = invDiag!.secondaryDrivers.find((d) => d.domain === 'SALES');
      expect(salesDriver).toBeDefined();
      expect(salesDriver!.metric).toBe('salesVelocitySurge');
      expect(salesDriver!.direction).toBe('UP');
    });

    it('should diagnose active out-of-stock when fulfillableQuantity is 0', () => {
      const context = buildMockContext({
        inventory: {
          fulfillableQuantity: 0,
          inboundQuantity: 250,
          avgDailySales: 42.0,
          daysCover: 0,
          leadTimeDays: 15,
          safetyStockDays: 14,
          reorderPoint: 630,
          inventoryHealth: 'OUT_OF_STOCK',
          availability: 'AVAILABLE',
        },
      });

      const oosSignal = buildMockSignal({
        domain: 'INVENTORY',
        code: 'OUT_OF_STOCK',
        ruleId: 'R-INV-02',
        metric: 'fulfillableQuantity',
        currentValue: 0,
        direction: 'DOWN',
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [oosSignal],
      });

      const invDiag = response.diagnoses.find((d) => d.affectedDomains.includes('INVENTORY'))!;
      expect(invDiag.rootCauseCode).toBe('INVENTORY_STOCKOUT_ACTIVE');
      expect(invDiag.primaryDriver.metric).toBe('fulfillableQuantity');
      expect(invDiag.primaryDriver.causalStrength).toBe('STRONG');
      expect(invDiag.primaryDriver.impactAmount).toBeLessThan(0); // active daily revenue loss
    });

    it('should diagnose excess inventory when daysCover exceeds 90 days', () => {
      const context = buildMockContext({
        inventory: {
          fulfillableQuantity: 1800,
          inboundQuantity: 0,
          avgDailySales: 15.0,
          daysCover: 120.0,
          leadTimeDays: 15,
          safetyStockDays: 14,
          reorderPoint: 225,
          inventoryHealth: 'OVERSTOCKED',
          availability: 'AVAILABLE',
        },
      });

      const excessSignal = buildMockSignal({
        domain: 'INVENTORY',
        code: 'EXCESS_INVENTORY',
        ruleId: 'R-INV-03',
        metric: 'daysCover',
        currentValue: 120.0,
        direction: 'UP',
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [excessSignal],
      });

      const invDiag = response.diagnoses.find((d) => d.affectedDomains.includes('INVENTORY'))!;
      expect(invDiag.rootCauseCode).toBe('INVENTORY_EXCESS_OVERSTOCK');
      expect(invDiag.primaryDriver.direction).toBe('UP');
    });
  });
  describe('4. Product Quality Cross-Domain Synthesis (D4/D5 & R-RET-01 + R-REV-01)', () => {
    it('should correlate Return Spike + Rating Drop + VOC themes into a Physical Quality Defect diagnosis', () => {
      const context = buildMockContext({
        returns: {
          returnCount: { current: 35, baseline: 14, delta: 21, deltaPct: 1.50 },
          deliveredUnits: { current: 520, baseline: 440, delta: 80, deltaPct: 0.182 },
          returnRate: { current: 0.067, baseline: 0.032, delta: 0.035, deltaPct: 1.094 },
          returnCost: { current: 1050.0, baseline: 420.0, delta: 630.0, deltaPct: 1.50 },
          topReturnReasons: [
            { reason: 'Hole diameter too narrow for standard electric toothbrush', count: 22, percentage: 0.63 },
            { reason: 'Defective / Cracked marble base', count: 13, percentage: 0.37 },
          ],
          availability: 'AVAILABLE',
        },
        reviews: {
          overallRating: 4.1,
          totalReviews: 240,
          recentReviewCount: 35,
          negativeReviewCount: 11,
          negativeReviewRatio: 0.314,
          topPainPoints: [
            { topicName: 'Hole diameter too narrow', percentage: 0.31, reviewCount: 11 },
          ],
          availability: 'AVAILABLE',
        },
      });

      const retSignal = buildMockSignal({
        domain: 'RETURNS',
        code: 'RETURN_RATE_SPIKE',
        ruleId: 'R-RET-01',
        metric: 'returnRate',
        currentValue: 0.067,
        baselineValue: 0.032,
      });

      const revSignal = buildMockSignal({
        domain: 'REVIEWS',
        code: 'RATING_DETERIORATION',
        ruleId: 'R-REV-01',
        metric: 'overallRating',
        currentValue: 4.1,
        baselineValue: 4.6,
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [retSignal, revSignal],
      });

      const qualDiag = response.diagnoses.find((d) => d.affectedDomains.includes('RETURNS') && d.affectedDomains.includes('REVIEWS'));
      expect(qualDiag).toBeDefined();
      expect(qualDiag!.rootCauseCode).toBe('PRODUCT_QUALITY_PHYSICAL_DEFECT');
      expect(qualDiag!.gateStatus).toBe('SUPPORTED');

      // Primary Driver: Returns with strong causal strength
      expect(qualDiag!.primaryDriver.domain).toBe('RETURNS');
      expect(qualDiag!.primaryDriver.metric).toBe('returnRate');
      expect(qualDiag!.primaryDriver.causalStrength).toBe('STRONG');
      expect(qualDiag!.primaryDriver.description).toContain('Hole diameter too narrow');

      // Secondary Driver: Reviews with strong causal strength
      const revDriver = qualDiag!.secondaryDrivers.find((d) => d.domain === 'REVIEWS');
      expect(revDriver).toBeDefined();
      expect(revDriver!.causalStrength).toBe('STRONG');
      expect(revDriver!.description).toContain('Hole diameter too narrow');
    });
  });

  describe('5. Competitor Pressure & Freshness Verification (D6 & R-COMP-01/02)', () => {
    it('should diagnose competitor price undercut and correlate with sales pressure', () => {
      const context = buildMockContext({
        sales: {
          ...buildMockContext().sales,
          ordersCount: { current: 210, baseline: 280, delta: -70, deltaPct: -0.25 },
        },
        competitors: {
          items: [
            {
              competitorId: 'comp_major_01',
              asin: 'B08P4ZZTNG',
              name: 'Leading Competitor Marble Stand',
              relationType: 'DIRECT_SUBSTITUTE',
              isPrimary: true,
              currentPrice: 24.99,
              baselinePrice: 29.99,
              priceDelta: -5.0,
              priceDeltaPct: -0.167,
              currentRating: 4.6,
            },
          ],
          primaryCompetitor: {
            competitorId: 'comp_major_01',
            asin: 'B08P4ZZTNG',
            relationType: 'DIRECT_SUBSTITUTE',
            isPrimary: true,
            currentPrice: 24.99,
            baselinePrice: 29.99,
            priceDelta: -5.0,
            priceDeltaPct: -0.167,
            currentRating: 4.6,
          },
          availability: 'AVAILABLE',
        },
        freshness: {
          ...buildMockContext().freshness,
          competitors: { asOf: '2026-03-14T00:00:00Z', status: 'FRESH' },
        },
      });

      const compSignal = buildMockSignal({
        domain: 'COMPETITOR',
        code: 'COMPETITOR_PRICE_DROP',
        ruleId: 'R-COMP-01',
        metric: 'competitorPrice',
        currentValue: 24.99,
        baselineValue: 29.99,
        changePct: -0.167,
        direction: 'DOWN',
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [compSignal],
      });

      const compDiag = response.diagnoses.find((d) => d.affectedDomains.includes('COMPETITOR'))!;
      expect(compDiag).toBeDefined();
      expect(compDiag.rootCauseCode).toBe('COMPETITOR_PRICE_UNDERCUT');
      expect(compDiag.gateStatus).toBe('SUPPORTED');
      expect(compDiag.primaryDriver.causalStrength).toBe('STRONG');
      expect(compDiag.primaryDriver.description).toContain('$24.99');

      // Secondary driver reflects our orders drop
      const salesDriver = compDiag.secondaryDrivers.find((d) => d.domain === 'SALES');
      expect(salesDriver).toBeDefined();
    });

    it('should downgrade causal strength to INDICATIVE and gate to PARTIALLY_SUPPORTED if competitor data is STALE', () => {
      const context = buildMockContext({
        competitors: {
          items: [
            {
              competitorId: 'comp_01',
              asin: 'B08P4ZZTNG',
              relationType: 'DIRECT',
              isPrimary: true,
              currentPrice: 22.0,
              baselinePrice: 29.99,
              priceDelta: -7.99,
              priceDeltaPct: -0.266,
            },
          ],
          availability: 'AVAILABLE',
        },
        freshness: {
          ...buildMockContext().freshness,
          competitors: { asOf: '2026-03-10T00:00:00Z', status: 'STALE' },
        },
      });

      const compSignal = buildMockSignal({
        domain: 'COMPETITOR',
        code: 'COMPETITOR_PRICE_DROP',
        ruleId: 'R-COMP-01',
        currentValue: 22.0,
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [compSignal],
      });

      const compDiag = response.diagnoses.find((d) => d.affectedDomains.includes('COMPETITOR'))!;
      expect(compDiag.gateStatus).toBe('PARTIALLY_SUPPORTED');
      expect(compDiag.primaryDriver.causalStrength).toBe('INDICATIVE');
      expect(compDiag.unknowns).toBeDefined();
      expect(compDiag.unknowns![0]).toContain('STALE');
    });
  });
  describe('6. Multi-Domain Concurrent Root Cause Ordering (D7)', () => {
    it('should process concurrent cross-domain signals and maintain attribution accounting', () => {
      const context = buildMockContext();
      const multiSignals: BusinessSignal[] = [
        buildMockSignal({ signalId: 'SIG-P1', domain: 'PROFIT', code: 'PROFIT_DROP', ruleId: 'R-PROF-01' }),
        buildMockSignal({ signalId: 'SIG-A1', domain: 'ADVERTISING', code: 'ACOS_SPIKE', ruleId: 'R-ADS-01' }),
        buildMockSignal({ signalId: 'SIG-I1', domain: 'INVENTORY', code: 'STOCKOUT_IMMINENT', ruleId: 'R-INV-01' }),
      ];

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: multiSignals,
      });

      expect(response.diagnoses.length).toBeGreaterThanOrEqual(3);
      expect(response.summary.totalDiagnoses).toBe(response.diagnoses.length);
      expect(response.evaluatedSignalsCount).toBe(3);
      expect(response.unattributedSignalIds).toHaveLength(0);
    });
  });

  describe('7. Clean Healthy State Interception (D8: signals = [])', () => {
    it('should return zero diagnoses, clean summary, and no alarms when signals array is empty', () => {
      const context = buildMockContext();

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [],
      });

      expect(response.diagnoses).toHaveLength(0);
      expect(response.summary.totalDiagnoses).toBe(0);
      expect(response.summary.supportedCount).toBe(0);
      expect(response.summary.partiallySupportedCount).toBe(0);
      expect(response.summary.insufficientCount).toBe(0);
      expect(response.summary.hasUnconfirmedRootCauses).toBe(false);
      expect(response.evaluatedSignalsCount).toBe(0);
      expect(response.unattributedSignalIds).toHaveLength(0);
    });
  });

  describe('8. Missing / Partial Telemetry Degradation (D9: UNAVAILABLE / PARTIAL)', () => {
    it('should degrade to INSUFFICIENT and ROOT_CAUSE_UNCONFIRMED when domain telemetry is UNAVAILABLE', () => {
      const context = buildMockContext({
        profit: {
          ...buildMockContext().profit,
          availability: 'UNAVAILABLE',
        },
      });

      const profitSignal = buildMockSignal({
        domain: 'PROFIT',
        code: 'PROFIT_DROP',
        ruleId: 'R-PROF-01',
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [profitSignal],
      });

      const profitDiag = response.diagnoses.find((d) => d.affectedDomains.includes('PROFIT'))!;
      expect(profitDiag.gateStatus).toBe('INSUFFICIENT');
      expect(profitDiag.rootCauseCode).toBe('ROOT_CAUSE_UNCONFIRMED');
      expect(profitDiag.primaryDriver.causalStrength).toBe('UNKNOWN');
      expect(profitDiag.unknowns).toBeDefined();
      expect(profitDiag.unknowns![0]).toContain('UNAVAILABLE');
      expect(response.summary.hasUnconfirmedRootCauses).toBe(true);
    });

    it('should downgrade to PARTIALLY_SUPPORTED when search terms or sub-dimensions are missing', () => {
      const context = buildMockContext({
        advertising: {
          ...buildMockContext().advertising,
          searchTerms: [], // missing search term report
          availability: 'PARTIAL',
        },
      });

      const adSignal = buildMockSignal({
        domain: 'ADVERTISING',
        code: 'ACOS_SPIKE',
        ruleId: 'R-ADS-01',
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [adSignal],
      });

      const adDiag = response.diagnoses.find((d) => d.affectedDomains.includes('ADVERTISING'))!;
      expect(adDiag.gateStatus).toBe('PARTIALLY_SUPPORTED');
      expect(adDiag.unknowns).toBeDefined();
    });
  });

  describe('9. Conflicting Signals (D10: Sales up +25%, Profit down -35%)', () => {
    it('should identify Margin Dilution / Unprofitable Growth when sales expand while profit plummets', () => {
      const context = buildMockContext({
        sales: {
          ...buildMockContext().sales,
          revenue: { current: 12500.0, baseline: 10000.0, delta: 2500.0, deltaPct: 0.25 },
          unitsSold: { current: 400, baseline: 320, delta: 80, deltaPct: 0.25 },
        },
        profit: {
          ...buildMockContext().profit,
          netProfit: { current: 650.0, baseline: 2500.0, delta: -1850.0, deltaPct: -0.74 },
          netMargin: { current: 0.052, baseline: 0.25, delta: -0.198, deltaPct: -0.792 },
          waterfallAttribution: {
            totalVariance: -1850.0,
            advertisingImpact: -1200.0,
            returnsImpact: -650.0,
            inventoryImpact: -200.0,
            priceImpact: 400.0,
            otherImpact: -200.0,
            isExactMatch: true,
            residual: 0,
            formulaString: '-1850 = -1200 -650 -200 +400 -200',
          },
        },
      });

      const profitSignal = buildMockSignal({
        domain: 'PROFIT',
        code: 'PROFIT_DROP',
        ruleId: 'R-PROF-01',
        changePct: -0.74,
      });

      const response = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [profitSignal],
      });

      const profitDiag = response.diagnoses.find((d) => d.affectedDomains.includes('PROFIT'))!;
      expect(profitDiag.rootCauseCode).toBe('PROFIT_DILUTION_UNPROFITABLE_GROWTH');
      expect(profitDiag.title).toBe('收入增长被严重利润稀释掩盖');
      expect(profitDiag.summary).toContain('收入增长 +');
      expect(profitDiag.summary).toContain('ADVERTISING 成本上涨');
      expect(profitDiag.primaryDriver.domain).toBe('ADVERTISING');
    });
  });

  describe('10. Strict Architectural Boundary: Load != Detect != Diagnose != Recommend', () => {
    it('should NEVER generate RecommendedActions or execution commands in Phase 4', () => {
      const context = buildMockContext();
      const signals = [
        buildMockSignal({ code: 'PROFIT_DROP', ruleId: 'R-PROF-01' }),
        buildMockSignal({ code: 'STOCKOUT_IMMINENT', ruleId: 'R-INV-01' }),
      ];

      const response = CrossDomainDiagnosisService.diagnose({ context, signals });

      // Check response structure
      expect((response as any).recommendedActions).toBeUndefined();
      expect((response as any).actions).toBeUndefined();

      // Check each diagnosis result
      response.diagnoses.forEach((diag) => {
        expect((diag as any).actionId).toBeUndefined();
        expect((diag as any).priority).toBeUndefined();
        expect((diag as any).executionMode).toBeUndefined();
        expect((diag as any).targetAction).toBeUndefined();

        // Check drivers
        expect((diag.primaryDriver as any).recommendedAction).toBeUndefined();
      });
    });
  });

  describe('11. End-to-End Pipeline Integration with Sku360ContextLoader & Scenario Data', () => {
    it('should run Sku360ContextLoader -> OperationAnomalyDetector -> CrossDomainDiagnosisService on White SKU Week 10 vs 11', async () => {
      const dataSource = new ScenarioSku360DataSource();
      const loader = new Sku360ContextLoader(dataSource);

      // Load White SKU Week 10 (baseline) vs Week 11 (current)
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-08-10', to: '2026-08-16' }, // Week 11
        baselinePeriod: { from: '2026-08-03', to: '2026-08-09' }, // Week 10
      });

      expect(context.identity.skuCode).toBe('MTH-WHITE-001');
      expect(context.profit.netProfit.delta).toBeLessThan(0);

      // Detect anomalies
      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);
      expect(detectionResult.signals.length).toBeGreaterThan(0);

      // Diagnose anomalies
      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: detectionResult.signals,
      });

      expect(diagnosisResponse.diagnoses.length).toBeGreaterThan(0);
      const profitDiag = diagnosisResponse.diagnoses.find((d) => d.affectedDomains.includes('PROFIT'));
      expect(profitDiag).toBeDefined();
      expect(profitDiag!.primaryDriver.causalStrength).toBe('PROVEN');
      expect(profitDiag!.gateStatus).toBe('SUPPORTED');
    });

    it('should run end-to-end pipeline on Green SKU Day 52 viral surge / stockout warning', async () => {
      const dataSource = new ScenarioSku360DataSource();
      const loader = new Sku360ContextLoader(dataSource);

      // Load Green SKU Day 52
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        skuId: 'MTH-GREEN-001',
        currentPeriod: { from: '2026-07-16', to: '2026-07-22' }, // Day 52 window
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      });

      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: detectionResult.signals,
      });

      expect(diagnosisResponse.diagnoses.length).toBeGreaterThan(0);
      const invDiag = diagnosisResponse.diagnoses.find((d) => d.affectedDomains.includes('INVENTORY'));
      expect(invDiag).toBeDefined();
      expect(invDiag!.primaryDriver.causalStrength).toBe('STRONG');
    });
  });
});
