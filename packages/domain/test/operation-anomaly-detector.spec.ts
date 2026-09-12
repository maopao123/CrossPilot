import {
  OperationAnomalyDetector,
  OperationAnomalyDetectionInput,
  buildIdempotentSignalId,
} from '../src/operations/operation-anomaly-detector.js';

import {
  ThresholdResolver,
  DEFAULT_ANOMALY_THRESHOLDS,
} from '../src/operations/anomaly-threshold.config.js';

import { ScenarioGeneratorService } from '../src/scenario/scenario-generator.js';

describe('Epic 3 Phase 2: OperationAnomalyDetector 12 Core Rules Engine', () => {
  let detector: OperationAnomalyDetector;
  const standardDateRange = {
    from: '2026-09-04T00:00:00.000Z',
    to: '2026-09-11T00:00:00.000Z',
  };

  beforeEach(() => {
    detector = new OperationAnomalyDetector();
  });

  // ==========================================================================
  // 1. Positive Trigger Tests (All 12 Rules)
  // ==========================================================================
  describe('1. Positive Trigger Tests (12 Rules)', () => {
    it('[R-PROF-01] should trigger PROFIT_DROP when net profit drops >= 20%', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 2000.0, revenue: 10000.0 },
          baseline: { netProfit: 3000.0, revenue: 12000.0 }, // -33.3% drop
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-PROF-01');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('PROFIT_DROP');
      expect(signal?.severity).toBe('CRITICAL');
      expect(signal?.domain).toBe('PROFIT');
      expect(signal?.direction).toBe('DOWN');
      expect(signal?.changePct).toBeCloseTo(-0.3333, 2);
      expect(signal?.evidence).toHaveLength(1);
      expect(signal?.evidence[0].category).toBe('CALCULATED_METRIC');
    });

    it('[R-PROF-02] should trigger CRITICAL_MARGIN when margin is below 5% or negative', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 300.0, revenue: 10000.0, margin: 0.03 }, // 3% margin < 5% floor
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-PROF-02');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('CRITICAL_MARGIN');
      expect(signal?.severity).toBe('CRITICAL');
      expect(signal?.currentValue).toBe(0.03);
      expect(signal?.evidence[0].category).toBe('CALCULATED_METRIC');
    });

    it('[R-ADS-01] should trigger ACOS_SPIKE when ACOS > 35% and > target * 1.3', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        advertising: {
          current: { spend: 420.0, sales: 1000.0 }, // 42% ACOS > 35% and > 30% * 1.3 = 39%
          targetAcos: 0.30,
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-ADS-01');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('ACOS_SPIKE');
      expect(signal?.severity).toBe('WARNING');
      expect(signal?.currentValue).toBe(0.42);
      expect(signal?.evidence[0].source).toBe('AdOptimizerService');
    });

    it('[R-ADS-02] should trigger AD_SPEND_INEFFICIENT when spend growth > 25% and sales growth <= 0', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        advertising: {
          current: { spend: 1300.0, sales: 4000.0 },
          baseline: { spend: 1000.0, sales: 4200.0 }, // Spend +30% (>25%), Sales -4.8% (<=0)
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-ADS-02');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('AD_SPEND_INEFFICIENT');
      expect(signal?.severity).toBe('CRITICAL');
      expect(signal?.changePct).toBe(0.30);
    });

    it('[R-ADS-03] should trigger ZERO_CONVERSION_SPEND when search term has >= 20 clicks and 0 orders', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        advertising: {
          searchTerms: [
            {
              searchTerm: 'bathroom organizer cheap',
              impressions: 1200,
              clicks: 28, // >= 20
              spend: 42.50,
              orders: 0,
              sales: 0,
              campaignId: 'camp-991',
            },
          ],
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-ADS-03');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('ZERO_CONVERSION_SPEND');
      expect(signal?.currentValue).toBe(28);
      expect(signal?.evidence[0].sourceId).toBe('bathroom organizer cheap');
    });

    it('[R-INV-01] should trigger STOCKOUT_IMMINENT when daysCover <= lead time floor', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        inventory: {
          current: {
            fulfillableQuantity: 100,
            avgDailySales: 10, // 10 days cover
            leadTimeDays: 15, // buffer = 15 days, critical floor = 15 days
            inboundQuantity: 0,
          },
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-INV-01');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('STOCKOUT_IMMINENT');
      expect(signal?.severity).toBe('CRITICAL');
      expect(signal?.currentValue).toBe(10);
      expect(signal?.thresholdValue).toBe(15);
    });

    it('[R-INV-02] should trigger OUT_OF_STOCK when fulfillableQuantity is 0', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        inventory: {
          current: {
            fulfillableQuantity: 0,
            avgDailySales: 10,
            leadTimeDays: 15,
            inboundQuantity: 200,
          },
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-INV-02');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('OUT_OF_STOCK');
      expect(signal?.severity).toBe('CRITICAL');
      expect(signal?.currentValue).toBe(0);
    });

    it('[R-INV-03] should trigger EXCESS_INVENTORY when daysCover > 90 days', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        inventory: {
          current: {
            fulfillableQuantity: 1200,
            avgDailySales: 10, // 120 days cover > 90 days
            leadTimeDays: 15,
          },
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-INV-03');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('EXCESS_INVENTORY');
      expect(signal?.severity).toBe('INFO');
      expect(signal?.currentValue).toBe(120);
    });

    it('[R-RET-01] should trigger RETURN_RATE_SPIKE when rate >= 5% and growth >= 50%', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        returns: {
          current: { deliveredUnits: 100, returnUnits: 7, returnRate: 0.07 }, // 7.0% >= 5%
          baseline: { deliveredUnits: 100, returnUnits: 3, returnRate: 0.03 }, // +133% growth >= 50%
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-RET-01');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('RETURN_RATE_SPIKE');
      expect(signal?.severity).toBe('WARNING');
      expect(signal?.currentValue).toBe(0.07);
      expect(signal?.changePct).toBeCloseTo(1.3333, 2);
    });

    it('[R-REV-01] should trigger RATING_DETERIORATION when rating < 4.3 or recent negative ratio > 20%', () => {
      const inputRating: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        reviews: {
          current: { overallRating: 4.15, totalReviews: 50 }, // 4.15 < 4.3 floor
        },
      };

      const resultRating = detector.detect(inputRating);
      const signalRating = resultRating.signals.find((s) => s.ruleId === 'R-REV-01');
      expect(signalRating).toBeDefined();
      expect(signalRating?.code).toBe('RATING_DETERIORATION');
      expect(signalRating?.currentValue).toBe(4.15);

      const inputNegative: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        reviews: {
          current: {
            overallRating: 4.5,
            totalReviews: 100,
            recentNegativeReviewsCount: 6,
            recentTotalReviewsCount: 20, // 30% negative > 20%
          },
        },
      };

      const resultNegative = detector.detect(inputNegative);
      const signalNegative = resultNegative.signals.find((s) => s.ruleId === 'R-REV-01');
      expect(signalNegative).toBeDefined();
      expect(signalNegative?.currentValue).toBe(0.30);
    });

    it('[R-COMP-01] should trigger COMPETITOR_PRICE_DROP when competitor drops price >= 10%', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        competitors: {
          items: [
            {
              competitorId: 'COMP-01',
              asin: 'B0COMP001',
              name: 'Competitor A',
              baselinePrice: 39.99,
              currentPrice: 32.99, // -17.5% drop >= 10%
            },
          ],
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-COMP-01');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('COMPETITOR_PRICE_DROP');
      expect(signal?.severity).toBe('WARNING');
      expect(signal?.currentValue).toBe(32.99);
      expect(signal?.evidence[0].sourceId).toBe('COMP-01');
    });

    it('[R-COMP-02] should trigger COMPETITOR_ADVANTAGE when competitor rating exceeds ours by >= 0.30 stars', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        reviews: {
          current: { overallRating: 4.4, totalReviews: 50 },
        },
        competitors: {
          items: [
            {
              competitorId: 'COMP-LEADER',
              asin: 'B0LEADER01',
              name: 'Top Brand',
              currentPrice: 35.0,
              rating: 4.8, // 4.8 - 4.4 = 0.40 >= 0.30 delta
            },
          ],
        },
      };

      const result = detector.detect(input);
      const signal = result.signals.find((s) => s.ruleId === 'R-COMP-02');

      expect(signal).toBeDefined();
      expect(signal?.code).toBe('COMPETITOR_ADVANTAGE');
      expect(signal?.severity).toBe('INFO');
      expect(signal?.currentValue).toBe(4.8);
      expect(signal?.changePct).toBe(0.4);
    });
  });

  // ==========================================================================
  // 2. Negative Tests (Healthy Operations -> 0 Signals, NO_ANOMALY)
  // ==========================================================================
  describe('2. Negative Tests (Healthy Business Operations)', () => {
    it('should generate 0 signals and all NO_ANOMALY when all operational metrics are healthy', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-healthy',
        skuId: 'SKU-HEALTHY',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 3200.0, revenue: 12000.0, margin: 0.267 },
          baseline: { netProfit: 3000.0, revenue: 11500.0 }, // +6.7% profit growth
        },
        advertising: {
          current: { spend: 500.0, sales: 2500.0, acos: 0.20 }, // 20% ACOS < 35%
          baseline: { spend: 480.0, sales: 2400.0 },
          targetAcos: 0.25,
          searchTerms: [
            {
              searchTerm: 'marble stand',
              impressions: 2000,
              clicks: 40,
              spend: 50.0,
              orders: 5,
              sales: 250.0,
            },
          ],
        },
        inventory: {
          current: {
            fulfillableQuantity: 400,
            avgDailySales: 10, // 40 days cover (between 15 and 90)
            leadTimeDays: 15,
            inboundQuantity: 200,
          },
        },
        returns: {
          current: { deliveredUnits: 200, returnUnits: 4, returnRate: 0.02 }, // 2.0% < 5%
          baseline: { deliveredUnits: 200, returnUnits: 4, returnRate: 0.02 },
        },
        reviews: {
          current: {
            overallRating: 4.7,
            totalReviews: 120,
            recentNegativeReviewsCount: 1,
            recentTotalReviewsCount: 20, // 5% negative < 20%
          },
        },
        competitors: {
          items: [
            {
              competitorId: 'COMP-SAME',
              baselinePrice: 30.0,
              currentPrice: 30.0,
              rating: 4.6, // 4.6 < our 4.7
            },
          ],
        },
      };

      const result = detector.detect(input);

      expect(result.signals).toHaveLength(0);
      expect(result.summary.criticalSignals).toBe(0);
      expect(result.summary.warningSignals).toBe(0);
      expect(result.summary.infoSignals).toBe(0);
      expect(result.summary.triggeredCount).toBe(0);
      expect(result.summary.noAnomalyCount).toBe(12);
    });
  });

  // ==========================================================================
  // 3. Boundary Tests (At Threshold, Just Below, Just Above)
  // ==========================================================================
  describe('3. Boundary Tests', () => {
    it('[R-PROF-01 Boundary] 19.9% drop should NOT trigger, 20.0% drop SHOULD trigger', () => {
      // 19.9% drop
      const belowBoundary = detector.detect({
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 801.0, revenue: 5000.0 },
          baseline: { netProfit: 1000.0, revenue: 5000.0 }, // -19.9%
        },
      });
      expect(belowBoundary.signals.find((s) => s.ruleId === 'R-PROF-01')).toBeUndefined();

      // Exactly 20.0% drop
      const atBoundary = detector.detect({
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 800.0, revenue: 5000.0 },
          baseline: { netProfit: 1000.0, revenue: 5000.0 }, // -20.0%
        },
      });
      expect(atBoundary.signals.find((s) => s.ruleId === 'R-PROF-01')).toBeDefined();
    });

    it('[R-INV-01 Boundary] Exactly at replenishment limit (15 days) triggers, 15.1 days does NOT trigger', () => {
      // 15.1 days cover
      const safe = detector.detect({
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        inventory: {
          current: { fulfillableQuantity: 151, avgDailySales: 10, leadTimeDays: 15 },
        },
      });
      expect(safe.signals.find((s) => s.ruleId === 'R-INV-01')).toBeUndefined();

      // Exactly 15.0 days cover
      const triggered = detector.detect({
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        inventory: {
          current: { fulfillableQuantity: 150, avgDailySales: 10, leadTimeDays: 15 },
        },
      });
      expect(triggered.signals.find((s) => s.ruleId === 'R-INV-01')).toBeDefined();
    });

    it('[R-ADS-03 Boundary] 19 clicks does not trigger, 20 clicks triggers', () => {
      // 19 clicks
      const nineteen = detector.detect({
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        advertising: {
          searchTerms: [{ searchTerm: 'test', impressions: 100, clicks: 19, spend: 20, orders: 0, sales: 0 }],
        },
      });
      expect(nineteen.signals.find((s) => s.ruleId === 'R-ADS-03')).toBeUndefined();

      // 20 clicks
      const twenty = detector.detect({
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        advertising: {
          searchTerms: [{ searchTerm: 'test', impressions: 100, clicks: 20, spend: 20, orders: 0, sales: 0 }],
        },
      });
      expect(twenty.signals.find((s) => s.ruleId === 'R-ADS-03')).toBeDefined();
    });
  });

  // ==========================================================================
  // 4. Missing Data & Data Availability Tests
  // ==========================================================================
  describe('4. Missing Data & Data Availability Tests', () => {
    it('should report NOT_EVALUATED and generate 0 signals when telemetry is UNAVAILABLE', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-empty',
        dateRange: standardDateRange,
        financials: { availability: 'UNAVAILABLE' },
        advertising: { availability: 'UNAVAILABLE' },
        inventory: { availability: 'UNAVAILABLE' },
        returns: { availability: 'UNAVAILABLE' },
        reviews: { availability: 'UNAVAILABLE' },
        competitors: { availability: 'UNAVAILABLE' },
      };

      const result = detector.detect(input);

      expect(result.signals).toHaveLength(0);
      expect(result.summary.notEvaluatedCount).toBe(12);
      expect(result.summary.triggeredCount).toBe(0);
      expect(result.summary.noAnomalyCount).toBe(0);

      // Verify specific rule records have NOT_EVALUATED
      for (const ev of result.evaluations) {
        expect(ev.status).toBe('NOT_EVALUATED');
      }
    });

    it('should distinguish NO_ANOMALY from NOT_EVALUATED', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-mixed',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 1000, revenue: 5000 },
          baseline: { netProfit: 1000, revenue: 5000 }, // Healthy -> NO_ANOMALY
        },
        competitors: { availability: 'UNAVAILABLE' }, // Missing -> NOT_EVALUATED
      };

      const result = detector.detect(input);

      const profEval = result.evaluations.find((e) => e.ruleId === 'R-PROF-01');
      expect(profEval?.status).toBe('NO_ANOMALY');

      const compEval = result.evaluations.find((e) => e.ruleId === 'R-COMP-01');
      expect(compEval?.status).toBe('NOT_EVALUATED');
    });
  });

  // ==========================================================================
  // 5. False Positive Defenses & Small Denominators
  // ==========================================================================
  describe('5. False Positive Defenses & Small Denominators', () => {
    it('should suppress R-RET-01 return spike false alarm when delivered volume < 20 units', () => {
      // 1 order with 1 return = 100% return rate, but denominator is only 1!
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        returns: {
          current: { deliveredUnits: 1, returnUnits: 1, returnRate: 1.0 },
          baseline: { deliveredUnits: 100, returnUnits: 2, returnRate: 0.02 },
        },
      };

      const result = detector.detect(input);
      const retEval = result.evaluations.find((e) => e.ruleId === 'R-RET-01');

      expect(retEval?.status).toBe('NOT_EVALUATED');
      expect(retEval?.reason).toContain('below minimum statistical sample size');
      expect(result.signals.find((s) => s.ruleId === 'R-RET-01')).toBeUndefined();
    });

    it('should suppress R-REV-01 when total review count is below 5 reviews', () => {
      // 1 review at 1.0 star -> average is 1.0, but only 1 review
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        reviews: {
          current: { overallRating: 1.0, totalReviews: 1 },
        },
      };

      const result = detector.detect(input);
      const revEval = result.evaluations.find((e) => e.ruleId === 'R-REV-01');

      expect(revEval?.status).toBe('NOT_EVALUATED');
      expect(revEval?.reason).toContain('sample size insufficient');
    });

    it('should handle zero baseline profit without division by zero or NaN', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: -500.0, revenue: 2000.0 },
          baseline: { netProfit: 0.0, revenue: 0.0 },
        },
      };

      const result = detector.detect(input);
      const profEval = result.evaluations.find((e) => e.ruleId === 'R-PROF-01');

      expect(profEval?.status).toBe('NOT_EVALUATED');
      expect(profEval?.reason).toContain('mathematically undefined');

      // But R-PROF-02 (negative margin) properly catches the negative profit!
      const marginSignal = result.signals.find((s) => s.ruleId === 'R-PROF-02');
      expect(marginSignal).toBeDefined();
    });
  });

  // ==========================================================================
  // 6. Signal Identity, Idempotency & Evidence Integrity
  // ==========================================================================
  describe('6. Signal Identity, Idempotency & Evidence Integrity', () => {
    it('should produce identical, stable signalId when run repeatedly with the same parameters', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-idempotent-01',
        skuId: 'SKU-MARBLE-WHITE',
        dateRange: standardDateRange,
        inventory: {
          current: { fulfillableQuantity: 0, avgDailySales: 10, leadTimeDays: 15 },
        },
      };

      const run1 = detector.detect(input);
      const run2 = detector.detect(input);

      expect(run1.signals).toHaveLength(1);
      expect(run2.signals).toHaveLength(1);

      const id1 = run1.signals[0].signalId;
      const id2 = run2.signals[0].signalId;

      expect(id1).toBe(id2);
      expect(id1).toBe('SIG-R-INV-02-ws-idempotent-01-SKU-MARBLE-WHITE-20260904_20260911');
    });

    it('should verify that EVERY generated signal has at least 1 valid OperationEvidenceItem', () => {
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-multi',
        skuId: 'SKU-001',
        dateRange: standardDateRange,
        financials: {
          current: { netProfit: 100, revenue: 10000, margin: 0.01 }, // triggers R-PROF-02
          baseline: { netProfit: 2000, revenue: 10000 }, // triggers R-PROF-01
        },
        inventory: {
          current: { fulfillableQuantity: 0, avgDailySales: 5, leadTimeDays: 15 }, // triggers R-INV-02
        },
      };

      const result = detector.detect(input);
      expect(result.signals.length).toBeGreaterThanOrEqual(3);

      for (const signal of result.signals) {
        expect(signal.evidence).toBeDefined();
        expect(signal.evidence.length).toBeGreaterThanOrEqual(1);
        expect(signal.evidence[0].evidenceId).toBeDefined();
        expect(signal.evidence[0].title).toBeDefined();
        expect(signal.evidence[0].content).toBeDefined();
        expect(signal.evidence[0].source).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // 7. Tiered Threshold Resolver Integration
  // ==========================================================================
  describe('7. Tiered Threshold Resolver Integration', () => {
    it('should honor custom ThresholdResolver overrides (e.g. looser ACOS threshold for new SKU)', () => {
      const customResolver = new ThresholdResolver();
      // Relax maxAcosThreshold from 0.35 to 0.50 for launch SKU
      customResolver.registerRule({
        scope: 'SKU',
        scopeKey: 'SKU-LAUNCH',
        overrides: {
          maxAcosThreshold: 0.50,
        },
      });

      const detectorWithCustom = new OperationAnomalyDetector({ thresholdResolver: customResolver });

      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-test',
        skuId: 'SKU-LAUNCH',
        dateRange: standardDateRange,
        advertising: {
          current: { spend: 400.0, sales: 1000.0 }, // 40% ACOS
          targetAcos: 0.30,
        },
      };

      // With custom resolver (0.50 threshold), 40% ACOS does NOT trigger
      const result = detectorWithCustom.detect(input);
      expect(result.signals.find((s) => s.ruleId === 'R-ADS-01')).toBeUndefined();

      // With default detector (0.35 threshold), 40% ACOS triggers
      const defaultResult = detector.detect(input);
      expect(defaultResult.signals.find((s) => s.ruleId === 'R-ADS-01')).toBeDefined();
    });
  });

  // ==========================================================================
  // 8. Scenario Generator Integration Tests
  // ==========================================================================
  describe('8. Scenario Generator Integration Tests', () => {
    it('should detect Day 18 ACOS Spike scenario on Green/White SKU', () => {
      // Day 18 event: Search term "bathroom organizer" spend $420, 2 orders, ACOS 93.3%
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-scenario',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-09-18T00:00:00Z', to: '2026-09-18T23:59:59Z' },
        advertising: {
          current: { spend: 420.0, sales: 450.0, acos: 0.933 },
          targetAcos: 0.30,
          searchTerms: [
            {
              searchTerm: 'bathroom organizer',
              impressions: 12500,
              clicks: 280,
              spend: 420.0,
              orders: 2,
              sales: 450.0,
            },
          ],
        },
      };

      const result = detector.detect(input);
      const acosSignal = result.signals.find((s) => s.ruleId === 'R-ADS-01');

      expect(acosSignal).toBeDefined();
      expect(acosSignal?.code).toBe('ACOS_SPIKE');
      expect(acosSignal?.currentValue).toBe(0.933);
    });

    it('should detect Day 50 Return Rate Spike scenario on Grey SKU', () => {
      // Day 50 event: Return rate for Grey SKU spikes from 3.2% to 6.7%
      const input: OperationAnomalyDetectionInput = {
        workspaceId: 'ws-scenario',
        skuId: 'MTH-GREY-001',
        dateRange: { from: '2026-09-50T00:00:00Z', to: '2026-09-50T23:59:59Z' },
        returns: {
          current: { deliveredUnits: 300, returnUnits: 20, returnRate: 0.067 }, // 6.7%
          baseline: { deliveredUnits: 300, returnUnits: 10, returnRate: 0.032 }, // 3.2%
        },
      };

      const result = detector.detect(input);
      const retSignal = result.signals.find((s) => s.ruleId === 'R-RET-01');

      expect(retSignal).toBeDefined();
      expect(retSignal?.code).toBe('RETURN_RATE_SPIKE');
      expect(retSignal?.currentValue).toBe(0.067);
      expect(retSignal?.changePct).toBeGreaterThan(0.50);
    });

    it('should detect Day 52 Low Stock & Day 62 Out-of-Stock scenario on Green SKU', () => {
      // Day 52: 120 units / 10.2 sales = 11.8 days cover <= 15 days lead time
      const day52Result = detector.detect({
        workspaceId: 'ws-scenario',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-09-52T00:00:00Z', to: '2026-09-52T23:59:59Z' },
        inventory: {
          current: {
            fulfillableQuantity: 120,
            avgDailySales: 10.2,
            leadTimeDays: 15,
          },
        },
      });

      const lowStockSignal = day52Result.signals.find((s) => s.ruleId === 'R-INV-01');
      expect(lowStockSignal).toBeDefined();
      expect(lowStockSignal?.code).toBe('STOCKOUT_IMMINENT');

      // Day 62: Stock hits 0
      const day62Result = detector.detect({
        workspaceId: 'ws-scenario',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-09-62T00:00:00Z', to: '2026-09-62T23:59:59Z' },
        inventory: {
          current: {
            fulfillableQuantity: 0,
            avgDailySales: 10.2,
            leadTimeDays: 15,
          },
        },
      });

      const oosSignal = day62Result.signals.find((s) => s.ruleId === 'R-INV-02');
      expect(oosSignal).toBeDefined();
      expect(oosSignal?.code).toBe('OUT_OF_STOCK');
      expect(oosSignal?.severity).toBe('CRITICAL');
    });
  });
});
