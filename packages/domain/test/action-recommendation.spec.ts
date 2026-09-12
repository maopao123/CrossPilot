/**
 * Action Recommendation Service Test Suite (Epic 3 Phase 5)
 *
 * Verifies deterministic action recommendation generation, priority scoring,
 * risk classification, deduplication, conflict detection, and scenario replay.
 *
 * Strict Axiom:
 * Load != Detect != Diagnose != Recommend != Execute
 * Phase 5 generates recommendations ONLY. NO execution mutations.
 */

import {
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  ActionRecommendationResponse,
  OperationEvidenceItem,
} from '@crosspilot/shared';

import {
  ActionRecommendationService,
  ActionPriorityScorer,
  ActionRiskClassifier,
  ActionDeduplicator,
  ActionConflictDetector,
  AdvertisingActionPolicy,
  InventoryActionPolicy,
  ProfitActionPolicy,
  ProductQualityActionPolicy,
  CompetitorActionPolicy,
  CrossDomainDiagnosisService,
  Sku360ContextLoader,
  ScenarioSku360DataSource,
  OperationAnomalyDetector,
} from '../src/operations/index.js';

import { InventoryPlanningService } from '../src/inventory/inventory-planning.service.js';

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
      searchTerms: [],
      availability: 'AVAILABLE',
    },
    inventory: {
      fulfillableQuantity: 450,
      inboundQuantity: 200,
      avgDailySales: 44.3,
      daysCover: 10.2,
      leadTimeDays: 21,
      safetyStockDays: 14,
      reorderPoint: 1551,
      inventoryHealth: 'LOW_STOCK',
      recommendedQuantity: 420,
      availability: 'AVAILABLE',
    },
    reviews: {
      overallRating: 4.5,
      totalReviews: 240,
      recentReviewCount: 25,
      negativeReviewCount: 2,
      negativeReviewRatio: 0.08,
      topPainPoints: [],
      availability: 'AVAILABLE',
    },
    returns: {
      returnCount: { current: 12, baseline: 10, delta: 2, deltaPct: 0.20 },
      deliveredUnits: { current: 310, baseline: 330, delta: -20, deltaPct: -0.061 },
      returnRate: { current: 0.0387, baseline: 0.0303, delta: 0.0084, deltaPct: 0.277 },
      returnCost: { current: 348.0, baseline: 290.0, delta: 58.0, deltaPct: 0.20 },
      availability: 'AVAILABLE',
    },
    competitors: {
      items: [
        {
          competitorId: 'comp_01',
          asin: 'B08COMPETITOR1',
          name: 'Rival Marble Holder',
          relationType: 'DIRECT',
          isPrimary: true,
          currentPrice: 28.99,
          currentRating: 4.6,
          reviewCount: 890,
        },
      ],
      availability: 'AVAILABLE',
    },
    profit: {
      revenue: { current: 8990.0, baseline: 9570.0, delta: -580.0, deltaPct: -0.061 },
      cogs: { current: 2790.0, baseline: 2970.0, delta: -180.0, deltaPct: -0.061 },
      amazonFees: { current: 1348.5, baseline: 1435.5, delta: -87.0, deltaPct: -0.061 },
      fbaFee: { current: 1550.0, baseline: 1650.0, delta: -100.0, deltaPct: -0.061 },
      adsCost: { current: 2000.0, baseline: 1020.0, delta: 980.0, deltaPct: 0.961 },
      returnLoss: { current: 348.0, baseline: 290.0, delta: 58.0, deltaPct: 0.20 },
      otherCosts: { current: 0, baseline: 0, delta: 0, deltaPct: 0 },
      netProfit: { current: 953.5, baseline: 2204.5, delta: -1251.0, deltaPct: -0.567 },
      netMargin: { current: 0.1061, baseline: 0.2304, delta: -0.1243, deltaPct: -0.5395 },
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
      sales: { asOf: '2026-03-14', status: 'FRESH' },
      advertising: { asOf: '2026-03-14', status: 'FRESH' },
      inventory: { asOf: '2026-03-14', status: 'FRESH' },
      reviews: { asOf: '2026-03-14', status: 'FRESH' },
      returns: { asOf: '2026-03-14', status: 'FRESH' },
      competitors: { asOf: '2026-03-14', status: 'FRESH' },
      profit: { asOf: '2026-03-14', status: 'FRESH' },
      overall: 'FRESH',
      loadedAt: '2026-03-15T00:00:00.000Z',
    },
    evidence: [],
    loadedAt: '2026-03-15T00:00:00.000Z',
  };

  return {
    ...defaultContext,
    ...overrides,
    identity: { ...defaultContext.identity, ...(overrides?.identity ?? {}) },
    sales: { ...defaultContext.sales, ...(overrides?.sales ?? {}) },
    advertising: { ...defaultContext.advertising, ...(overrides?.advertising ?? {}) },
    inventory: { ...defaultContext.inventory, ...(overrides?.inventory ?? {}) },
    reviews: { ...defaultContext.reviews, ...(overrides?.reviews ?? {}) },
    returns: { ...defaultContext.returns, ...(overrides?.returns ?? {}) },
    competitors: { ...defaultContext.competitors, ...(overrides?.competitors ?? {}) },
    profit: { ...defaultContext.profit, ...(overrides?.profit ?? {}) },
  };
}

describe('Epic 3 Phase 5: Action Recommendation Service', () => {
  describe('1. Golden Cases Recommendation Mapping (D1 - D10)', () => {
    it('D1: should recommend REVIEW_AD_SPEND bound to Ads waterfall driver on Profit Drop', () => {
      const context = buildMockContext();
      const signal: BusinessSignal = {
        signalId: 'SIG-PROF-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        asin: 'B0BFGNSXYL',
        domain: 'PROFIT',
        code: 'PROFIT_DROP',
        metric: 'netProfit',
        currentValue: 953.5,
        baselineValue: 2204.5,
        changePct: -0.567,
        thresholdValue: 0.20,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-PROF-01',
        title: 'Net Profit Dropped 56.7%',
        description: 'Net profit plummeted due to ad spend surge.',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      expect(response.actions.length).toBeGreaterThan(0);
      const adAction = response.actions.find((a) => a.actionType === 'REVIEW_AD_SPEND');
      expect(adAction).toBeDefined();
      expect(adAction!.category).toBe('ADVERTISING');
      expect(adAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(adAction!.impactAmount).toBe(-980);
      expect(adAction!.impactType).toBe('MEASURED');
      expect(adAction!.sourceDiagnosisIds?.length).toBeGreaterThan(0);
    });

    it('D2: should recommend PREPARE_REPLENISHMENT and INVESTIGATE_STOCKOUT on active stockout', () => {
      const context = buildMockContext({
        inventory: {
          fulfillableQuantity: 0,
          inboundQuantity: 100,
          avgDailySales: 20,
          daysCover: 0,
          leadTimeDays: 14,
          safetyStockDays: 14,
          reorderPoint: 560,
          inventoryHealth: 'OUT_OF_STOCK',
          recommendedQuantity: 420,
          availability: 'AVAILABLE',
        },
      });

      const signal: BusinessSignal = {
        signalId: 'SIG-INV-02',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'INVENTORY',
        code: 'OUT_OF_STOCK',
        metric: 'fulfillableQuantity',
        currentValue: 0,
        baselineValue: 100,
        changePct: -1.0,
        thresholdValue: 0,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-INV-02',
        title: 'Active Out of Stock',
        description: '0 sellable units',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      const replenishAction = response.actions.find((a) => a.actionType === 'PREPARE_REPLENISHMENT');
      expect(replenishAction).toBeDefined();
      expect(replenishAction!.priority).toBe('P1');
      expect(replenishAction!.riskLevel).toBe('HIGH');
      expect(replenishAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(replenishAction!.impactType).toBe('ESTIMATED');
      // Must strictly use recommendedQuantity from planning service (420)
      expect(replenishAction!.payload?.recommendedQuantity).toBe(420);
      expect(replenishAction!.title).toContain('420 Units');

      const auditAction = response.actions.find((a) => a.actionType === 'INVESTIGATE_STOCKOUT');
      expect(auditAction).toBeDefined();
      expect(auditAction!.priority).toBe('P1');
      expect(auditAction!.executionMode).toBe('ADVISORY');
      expect(auditAction!.riskLevel).toBe('LOW');
    });

    it('D3: should recommend PREPARE_REPLENISHMENT (P1) on imminent stockout with velocity surge', () => {
      const context = buildMockContext({
        sales: {
          ordersCount: { current: 350, baseline: 280, delta: 70, deltaPct: 0.25 },
          unitsSold: { current: 388, baseline: 310, delta: 78, deltaPct: 0.252 },
          revenue: { current: 11252.0, baseline: 8990.0, delta: 2262.0, deltaPct: 0.252 },
          averageSellingPrice: { current: 29.0, baseline: 29.0, delta: 0, deltaPct: 0 },
          availability: 'AVAILABLE',
        },
        inventory: {
          fulfillableQuantity: 180,
          inboundQuantity: 0,
          avgDailySales: 35,
          daysCover: 5.1,
          leadTimeDays: 21,
          safetyStockDays: 14,
          reorderPoint: 1225,
          inventoryHealth: 'LOW_STOCK',
          recommendedQuantity: 865,
          availability: 'AVAILABLE',
        },
      });

      const signal: BusinessSignal = {
        signalId: 'SIG-INV-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'INVENTORY',
        code: 'STOCKOUT_IMMINENT',
        metric: 'daysCover',
        currentValue: 5.1,
        baselineValue: 25.0,
        changePct: -0.796,
        thresholdValue: 21,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-INV-01',
        title: 'Imminent Stockout Risk',
        description: 'Days cover is 5.1d vs 21d lead time',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      const replenishAction = response.actions.find((a) => a.actionType === 'PREPARE_REPLENISHMENT');
      expect(replenishAction).toBeDefined();
      expect(replenishAction!.priority).toBe('P1');
      expect(replenishAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(replenishAction!.payload?.recommendedQuantity).toBe(865);
    });

    it('D4: should recommend INVESTIGATE_PRODUCT_FIT and REVIEW_LISTING_SPECIFICATION on return spike + VOC', () => {
      const context = buildMockContext({
        returns: {
          returnCount: { current: 36, baseline: 10, delta: 26, deltaPct: 2.6 },
          deliveredUnits: { current: 300, baseline: 300, delta: 0, deltaPct: 0 },
          returnRate: { current: 0.12, baseline: 0.033, delta: 0.087, deltaPct: 2.63 },
          returnCost: { current: 1044.0, baseline: 290.0, delta: 754.0, deltaPct: 2.6 },
          availability: 'AVAILABLE',
        },
        reviews: {
          overallRating: 3.7,
          totalReviews: 250,
          recentReviewCount: 20,
          negativeReviewCount: 7,
          negativeReviewRatio: 0.35,
          topPainPoints: [
            { topicName: 'Hole size too small for electric toothbrush', percentage: 0.45, reviewCount: 9 },
          ],
          availability: 'AVAILABLE',
        },
      });

      const retSignal: BusinessSignal = {
        signalId: 'SIG-RET-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'RETURNS',
        code: 'RETURN_RATE_SPIKE',
        metric: 'returnRate',
        currentValue: 0.12,
        baselineValue: 0.033,
        changePct: 2.63,
        thresholdValue: 0.05,
        severity: 'CRITICAL',
        direction: 'UP',
        detectedBy: 'FORMULA',
        ruleId: 'R-RET-01',
        title: 'Return Rate Spiked to 12.0%',
        description: 'Return rate surged',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const revSignal: BusinessSignal = {
        signalId: 'SIG-REV-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'REVIEWS',
        code: 'RATING_DETERIORATION',
        metric: 'negativeReviewRatio',
        currentValue: 0.35,
        baselineValue: 0.08,
        changePct: 3.375,
        thresholdValue: 0.20,
        severity: 'CRITICAL',
        direction: 'UP',
        detectedBy: 'FORMULA',
        ruleId: 'R-REV-01',
        title: 'Negative Review Surge',
        description: '35% negative reviews',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [retSignal, revSignal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [retSignal, revSignal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      const fitAction = response.actions.find((a) => a.actionType === 'INVESTIGATE_PRODUCT_FIT');
      expect(fitAction).toBeDefined();
      expect(fitAction!.priority).toBe('P2');
      expect(fitAction!.executionMode).toBe('ADVISORY');
      expect(fitAction!.reason).toContain('Hole size too small');

      const listingAction = response.actions.find((a) => a.actionType === 'REVIEW_LISTING_SPECIFICATION');
      expect(listingAction).toBeDefined();
      expect(listingAction!.priority).toBe('P2');
      expect(listingAction!.executionMode).toBe('APPROVAL_REQUIRED');
    });

    it('D5: should recommend REVIEW_PRICE_COMPETITIVENESS when competitor undercuts on fresh data', () => {
      const context = buildMockContext({
        competitors: {
          items: [
            {
              competitorId: 'comp_01',
              asin: 'B08COMPETITOR1',
              relationType: 'DIRECT',
              isPrimary: true,
              currentPrice: 24.99,
              currentRating: 4.6,
              reviewCount: 890,
            },
          ],
          availability: 'AVAILABLE',
        },
        freshness: {
          ...buildMockContext().freshness,
          competitors: { asOf: '2026-03-14', status: 'FRESH' },
        },
      });

      const signal: BusinessSignal = {
        signalId: 'SIG-COMP-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'COMPETITOR',
        code: 'COMPETITOR_PRICE_DROP',
        metric: 'currentPrice',
        currentValue: 24.99,
        baselineValue: 28.99,
        changePct: -0.138,
        thresholdValue: -0.10,
        severity: 'WARNING',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-COMP-01',
        title: 'Competitor Price Dropped 13.8%',
        description: 'Comp dropped to $24.99',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      const priceAction = response.actions.find((a) => a.actionType === 'REVIEW_PRICE_COMPETITIVENESS');
      expect(priceAction).toBeDefined();
      expect(priceAction!.priority).toBe('P2');
      expect(priceAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(priceAction!.payload?.priceGap).toBeCloseTo(4.01, 1);
    });

    it('D6: should recommend REFRESH_COMPETITOR_DATA and strictly PROHIBIT price changes if data is STALE', () => {
      const context = buildMockContext({
        competitors: {
          items: [
            {
              competitorId: 'comp_01',
              asin: 'B08COMPETITOR1',
              relationType: 'DIRECT',
              isPrimary: true,
              currentPrice: 24.99,
              currentRating: 4.6,
              reviewCount: 890,
            },
          ],
          availability: 'AVAILABLE',
        },
        freshness: {
          ...buildMockContext().freshness,
          competitors: { asOf: '2026-03-01', status: 'STALE' },
        },
      });

      const signal: BusinessSignal = {
        signalId: 'SIG-COMP-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'COMPETITOR',
        code: 'COMPETITOR_PRICE_DROP',
        metric: 'currentPrice',
        currentValue: 24.99,
        baselineValue: 28.99,
        changePct: -0.138,
        thresholdValue: -0.10,
        severity: 'WARNING',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-COMP-01',
        title: 'Competitor Price Dropped 13.8%',
        description: 'Comp dropped to $24.99',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      const refreshAction = response.actions.find((a) => a.actionType === 'REFRESH_COMPETITOR_DATA');
      expect(refreshAction).toBeDefined();
      expect(refreshAction!.priority).toBe('P3');
      expect(refreshAction!.executionMode).toBe('ADVISORY');

      // Crucial: Must NOT recommend price reduction on stale data
      const priceAction = response.actions.find((a) => a.actionType === 'REVIEW_PRICE_COMPETITIVENESS');
      expect(priceAction).toBeUndefined();
    });

    it('D7: should recommend REVIEW_NEGATIVE_KEYWORD with MEASURED waste on zero-conversion search terms', () => {
      const context = buildMockContext({
        advertising: {
          ...buildMockContext().advertising,
          searchTerms: [
            {
              searchTerm: 'acrylic toothbrush organizer',
              impressions: 1200,
              clicks: 28,
              spend: 185.0,
              orders: 0,
              sales: 0,
            },
          ],
        },
      });

      const signal: BusinessSignal = {
        signalId: 'SIG-ADS-03',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'ADVERTISING',
        code: 'ZERO_CONVERSION_SPEND',
        metric: 'zeroConversionSearchTermSpend',
        currentValue: 185.0,
        baselineValue: 0,
        changePct: 1.0,
        thresholdValue: 30.0,
        severity: 'CRITICAL',
        direction: 'UP',
        detectedBy: 'RULE',
        ruleId: 'R-ADS-03',
        title: 'Zero Conversion Search Term Spend: $185.00',
        description: 'Wasted spend on acrylic toothbrush organizer',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      const negAction = response.actions.find((a) => a.actionType === 'REVIEW_NEGATIVE_KEYWORD');
      expect(negAction).toBeDefined();
      expect(negAction!.priority).toBe('P1');
      expect(negAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(negAction!.impactAmount).toBe(-185.0);
      expect(negAction!.impactType).toBe('MEASURED');
      expect(negAction!.expectedImpact).toContain('$185.00');
    });

    it('D8: should return 0 actions and clean summary on Healthy SKU (signals = [], diagnoses = [])', () => {
      const context = buildMockContext();
      const response = ActionRecommendationService.recommend({
        context,
        signals: [],
        diagnoses: [],
      });

      expect(response.actions).toHaveLength(0);
      expect(response.summary.totalActions).toBe(0);
      expect(response.summary.p1Count).toBe(0);
      expect(response.summary.p2Count).toBe(0);
      expect(response.summary.p3Count).toBe(0);
      expect(response.summary.conflictsDetected).toBe(0);
    });

    it('D9: should gracefully omit competitor actions if competitor service is UNAVAILABLE', () => {
      const context = buildMockContext({
        competitors: {
          items: [],
          availability: 'UNAVAILABLE',
        },
      });

      const profSignal: BusinessSignal = {
        signalId: 'SIG-PROF-01',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'PROFIT',
        code: 'PROFIT_DROP',
        metric: 'netProfit',
        currentValue: 953.5,
        baselineValue: 2204.5,
        changePct: -0.567,
        thresholdValue: 0.20,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-PROF-01',
        title: 'Net Profit Dropped',
        description: 'Net profit dropped',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [profSignal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [profSignal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      expect(response.actions.length).toBeGreaterThan(0);
      const compActions = response.actions.filter((a) => a.category === 'PRICING');
      expect(compActions).toHaveLength(0);
    });

    it('D10: should recommend driver-specific actions on Sales Up, Profit Down (Margin Dilution)', () => {
      const context = buildMockContext({
        sales: {
          ordersCount: { current: 350, baseline: 280, delta: 70, deltaPct: 0.25 },
          unitsSold: { current: 388, baseline: 310, delta: 78, deltaPct: 0.252 },
          revenue: { current: 10476.0, baseline: 8990.0, delta: 1486.0, deltaPct: 0.165 },
          averageSellingPrice: { current: 27.0, baseline: 29.0, delta: -2.0, deltaPct: -0.069 },
          availability: 'AVAILABLE',
        },
        profit: {
          ...buildMockContext().profit,
          revenue: { current: 10476.0, baseline: 8990.0, delta: 1486.0, deltaPct: 0.165 },
          adsCost: { current: 3200.0, baseline: 2000.0, delta: 1200.0, deltaPct: 0.60 },
          netProfit: { current: 400.0, baseline: 953.5, delta: -553.5, deltaPct: -0.58 },
        },
      });

      const signal: BusinessSignal = {
        signalId: 'SIG-PROF-02',
        workspaceId: 'ws_demo',
        skuId: 'sku_white_001',
        domain: 'PROFIT',
        code: 'CRITICAL_MARGIN',
        metric: 'netMargin',
        currentValue: 0.038,
        baselineValue: 0.106,
        changePct: -0.64,
        thresholdValue: 0.05,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-PROF-02',
        title: 'Critical Profit Margin: 3.8%',
        description: 'Margin dropped to 3.8%',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      // Must be driver-specific action, NOT generic "increase profit"
      expect(response.actions.length).toBeGreaterThan(0);
      const adSpendAction = response.actions.find((a) => a.actionType === 'REVIEW_AD_SPEND');
      expect(adSpendAction).toBeDefined();
    });
  });

  describe('2. Action Priority & Risk Classification Axioms', () => {
    it('Priority Scorer: should assign P1 to critical stockout and P3 to stale competitor data', () => {
      const context = buildMockContext({
        inventory: {
          ...buildMockContext().inventory,
          fulfillableQuantity: 0,
        },
      });

      const p1Result = ActionPriorityScorer.score(
        { actionType: 'PREPARE_REPLENISHMENT', impactAmount: -420, impactType: 'ESTIMATED' },
        context,
        [],
        []
      );
      expect(p1Result.priority).toBe('P1');
      expect(p1Result.score).toBeGreaterThanOrEqual(75);

      const p3Result = ActionPriorityScorer.score(
        { actionType: 'REFRESH_COMPETITOR_DATA' },
        context,
        [],
        []
      );
      expect(p3Result.priority).toBe('P3');
      expect(p3Result.score).toBeLessThan(50);
    });

    it('Risk Classifier: should enforce Priority != Risk Level (P1 can be LOW risk; Replenishment can be HIGH risk)', () => {
      const stockoutAuditRisk = ActionRiskClassifier.classify({
        actionType: 'INVESTIGATE_STOCKOUT',
      });
      expect(stockoutAuditRisk.riskLevel).toBe('LOW');
      expect(stockoutAuditRisk.executionMode).toBe('ADVISORY');

      const highQtyReplenishRisk = ActionRiskClassifier.classify({
        actionType: 'PREPARE_REPLENISHMENT',
        payload: { recommendedQuantity: 420, unitCost: 20 },
      });
      expect(highQtyReplenishRisk.riskLevel).toBe('HIGH');
      expect(highQtyReplenishRisk.executionMode).toBe('APPROVAL_REQUIRED');

      const negKeywordRisk = ActionRiskClassifier.classify({
        actionType: 'REVIEW_NEGATIVE_KEYWORD',
      });
      expect(negKeywordRisk.riskLevel).toBe('LOW');
      expect(negKeywordRisk.executionMode).toBe('APPROVAL_REQUIRED');
    });
  });

  describe('3. Action Deduplication, Merging & Conflict Detection', () => {
    it('should deduplicate and merge identical actions from multiple diagnoses', () => {
      const act1 = {
        actionId: 'ACT-demo-sku1-review-ad-spend',
        workspaceId: 'ws_demo',
        skuId: 'sku1',
        sourceSignalIds: ['SIG-1'],
        sourceDiagnosisIds: ['DIAG-1'],
        category: 'ADVERTISING' as const,
        actionType: 'REVIEW_AD_SPEND' as const,
        priority: 'P2' as const,
        riskLevel: 'MEDIUM' as const,
        executionMode: 'APPROVAL_REQUIRED' as const,
        status: 'PROPOSED' as const,
        title: 'Review Ad Spend',
        reason: 'Ad spend increased 50%',
        evidence: [
          {
            evidenceId: 'EV-1',
            category: 'CALCULATED_METRIC' as const,
            title: 'Metric',
            content: 'Spend up',
            source: 'test',
            capturedAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
      };

      const act2 = {
        actionId: 'ACT-demo-sku1-review-ad-spend',
        workspaceId: 'ws_demo',
        skuId: 'sku1',
        sourceSignalIds: ['SIG-2'],
        sourceDiagnosisIds: ['DIAG-2'],
        category: 'ADVERTISING' as const,
        actionType: 'REVIEW_AD_SPEND' as const,
        priority: 'P1' as const, // higher priority
        riskLevel: 'MEDIUM' as const,
        executionMode: 'APPROVAL_REQUIRED' as const,
        status: 'PROPOSED' as const,
        title: 'Review Ad Spend',
        reason: 'Zero conversion terms found',
        evidence: [
          {
            evidenceId: 'EV-2',
            category: 'DATABASE' as const,
            title: 'Search Terms',
            content: 'Waste spend',
            source: 'test',
            capturedAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
      };

      const merged = ActionDeduplicator.dedupAndMerge([act1, act2]);
      expect(merged).toHaveLength(1);
      expect(merged[0].priority).toBe('P1'); // Took higher priority
      expect(merged[0].sourceDiagnosisIds).toEqual(['DIAG-1', 'DIAG-2']);
      expect(merged[0].sourceSignalIds).toEqual(['SIG-1', 'SIG-2']);
      expect(merged[0].evidence).toHaveLength(2);
      expect(merged[0].reason).toContain('Ad spend increased 50%');
      expect(merged[0].reason).toContain('Zero conversion terms found');
    });

    it('Conflict Detection: should flag conflict between Inventory Shortage and Competitor Price Lowering', () => {
      const stockoutAction = {
        actionId: 'ACT-stockout-replenish',
        workspaceId: 'ws_demo',
        skuId: 'sku_marble',
        sourceSignalIds: ['SIG-INV-1'],
        category: 'INVENTORY' as const,
        actionType: 'PREPARE_REPLENISHMENT' as const,
        priority: 'P1' as const,
        riskLevel: 'HIGH' as const,
        executionMode: 'APPROVAL_REQUIRED' as const,
        status: 'PROPOSED' as const,
        title: 'Prepare Replenishment (0 Units In Stock)',
        reason: 'Stock is depleted',
        evidence: [],
        createdAt: new Date().toISOString(),
      };

      const discountAction = {
        actionId: 'ACT-price-coupon',
        workspaceId: 'ws_demo',
        skuId: 'sku_marble',
        sourceSignalIds: ['SIG-COMP-1'],
        category: 'PRICING' as const,
        actionType: 'REVIEW_COUPON_STRATEGY' as const,
        priority: 'P2' as const,
        riskLevel: 'MEDIUM' as const,
        executionMode: 'APPROVAL_REQUIRED' as const,
        status: 'PROPOSED' as const,
        title: 'Review Coupon Strategy to Counter Competitor',
        reason: 'Competitor dropped price',
        evidence: [],
        createdAt: new Date().toISOString(),
      };

      const evaluated = ActionConflictDetector.detectConflicts([stockoutAction, discountAction]);
      expect(evaluated[0].conflictDetected).toBe(true);
      expect(evaluated[0].conflictingActionIds).toContain(discountAction.actionId);
      expect(evaluated[0].recommendationGateStatus).toBe('NEEDS_REVIEW');

      expect(evaluated[1].conflictDetected).toBe(true);
      expect(evaluated[1].conflictingActionIds).toContain(stockoutAction.actionId);
      expect(evaluated[1].recommendationGateStatus).toBe('NEEDS_REVIEW');
    });
  });

  describe('4. Full Lifecycle Scenario Replay (White, Green, Grey SKUs)', () => {
    it('White SKU: should replay Day 18 zero-conversion spend & Week 10 vs 11 profit drop', async () => {
      const dataSource = new ScenarioSku360DataSource();
      const loader = new Sku360ContextLoader(dataSource);

      // Load White SKU Week 10 vs 11
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        skuId: 'MTH-WHITE-001',
        currentPeriod: { from: '2026-08-10', to: '2026-08-16' }, // Week 11
        baselinePeriod: { from: '2026-08-03', to: '2026-08-09' }, // Week 10
      });

      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);
      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: detectionResult.signals,
      });

      const recommendationResponse = ActionRecommendationService.recommend({
        context,
        signals: detectionResult.signals,
        diagnoses: diagnosisResponse.diagnoses,
      });

      expect(recommendationResponse.actions.length).toBeGreaterThan(0);
      const adAction = recommendationResponse.actions.find((a) => a.actionType === 'REVIEW_AD_SPEND');
      expect(adAction).toBeDefined();
      expect(adAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(recommendationResponse.summary.p1Count + recommendationResponse.summary.p2Count).toBeGreaterThan(0);
    });

    it('Green SKU: should replay Day 52 viral surge imminent stockout & recommend replenishment', async () => {
      const dataSource = new ScenarioSku360DataSource();
      const loader = new Sku360ContextLoader(dataSource);

      // Load Green SKU Day 52 window
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        skuId: 'MTH-GREEN-001',
        currentPeriod: { from: '2026-07-16', to: '2026-07-22' },
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      });

      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);
      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: detectionResult.signals,
      });

      const recommendationResponse = ActionRecommendationService.recommend({
        context,
        signals: detectionResult.signals,
        diagnoses: diagnosisResponse.diagnoses,
      });

      const replenishAction = recommendationResponse.actions.find(
        (a) => a.actionType === 'PREPARE_REPLENISHMENT'
      );
      expect(replenishAction).toBeDefined();
      expect(replenishAction!.priority).toBe('P1');
      expect(replenishAction!.executionMode).toBe('APPROVAL_REQUIRED');
      expect(replenishAction!.payload?.recommendedQuantity).toBeDefined();
    });

    it('Grey SKU: should replay Day 50 return spike + Day 55 VOC hole size defect & recommend fit investigation', async () => {
      const dataSource = new ScenarioSku360DataSource();
      const loader = new Sku360ContextLoader(dataSource);

      // Load Grey SKU Day 50 window
      const context = await loader.loadSku360({
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        skuId: 'MTH-GREY-001',
        currentPeriod: { from: '2026-07-14', to: '2026-07-20' },
        baselinePeriod: { from: '2026-07-07', to: '2026-07-13' },
      });

      const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
      const detectionResult = OperationAnomalyDetector.detect(detectorInput);
      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: detectionResult.signals,
      });

      const recommendationResponse = ActionRecommendationService.recommend({
        context,
        signals: detectionResult.signals,
        diagnoses: diagnosisResponse.diagnoses,
      });

      expect(recommendationResponse.actions.length).toBeGreaterThan(0);
      const fitAction = recommendationResponse.actions.find(
        (a) => a.actionType === 'INVESTIGATE_PRODUCT_FIT'
      );
      expect(fitAction).toBeDefined();
      expect(fitAction!.executionMode).toBe('ADVISORY');
      expect(fitAction!.riskLevel).toBe('LOW');
    });
  });

  describe('5. Strict Architectural Boundaries', () => {
    it('should NEVER execute actions or mutate status away from PROPOSED', () => {
      const context = buildMockContext();
      const signal: BusinessSignal = {
        signalId: 'SIG-1',
        workspaceId: 'ws_demo',
        skuId: 'sku1',
        domain: 'PROFIT',
        code: 'PROFIT_DROP',
        metric: 'netProfit',
        currentValue: 500,
        baselineValue: 1500,
        changePct: -0.66,
        thresholdValue: 0.20,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-PROF-01',
        title: 'Profit Drop',
        description: 'Drop',
        evidence: [],
        detectedAt: new Date().toISOString(),
      };

      const diagnosisResponse = CrossDomainDiagnosisService.diagnose({
        context,
        signals: [signal],
      });

      const response = ActionRecommendationService.recommend({
        context,
        signals: [signal],
        diagnoses: diagnosisResponse.diagnoses,
      });

      for (const action of response.actions) {
        expect(action.status).toBe('PROPOSED');
        expect(action.actionId).toMatch(/^ACT-/);
        expect(action.evidence.length).toBeGreaterThan(0);
        expect(action.reason.length).toBeGreaterThan(10);
      }
    });
  });
});
