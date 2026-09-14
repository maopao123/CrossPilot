import {
  computeOutcomeWindowsV2,
  evaluateOutcomeV2,
  OutcomeMetricKey,
  OutcomeMetrics,
} from '../src/outcome/index.js';

function makeMetrics(partial: Partial<OutcomeMetrics> & { adSpend?: number; adSales?: number }): OutcomeMetrics {
  return {
    sessions: null,
    addToCart: null,
    checkout: null,
    orders: null,
    revenue: null,
    impressions: null,
    clicks: null,
    spend: null,
    sales: null,
    ctr: null,
    cvr: null,
    acos: null,
    roas: null,
    profit: null,
    margin: null,
    ...partial,
  };
}

describe('CL-3: Closed-loop v2 Outcome Evaluation & Window Rules', () => {
  describe('1. 7-Day Baseline Window (D-6..D)', () => {
    it('computes 7-day baseline from D-6 to D (7 days inclusive) and observe window from D+1 to D+windowDays', () => {
      const executionDate = '2026-09-07';
      const window7 = computeOutcomeWindowsV2(executionDate, 7);

      // Baseline: 2026-09-01 to 2026-09-07 inclusive = 7 days
      expect(window7.baselineStart).toBe('2026-09-01');
      expect(window7.baselineEnd).toBe('2026-09-07');
      expect(window7.observeStart).toBe('2026-09-08');
      expect(window7.observeEnd).toBe('2026-09-14');

      const window14 = computeOutcomeWindowsV2(executionDate, 14);
      expect(window14.baselineStart).toBe('2026-09-01');
      expect(window14.baselineEnd).toBe('2026-09-07');
      expect(window14.observeStart).toBe('2026-09-08');
      expect(window14.observeEnd).toBe('2026-09-21');
    });
  });

  describe('2. Daily Average Normalization for Volume Metrics', () => {
    it('constant sample: profit=10/day for 7-day baseline, 7-day, 14-day, and 30-day observe -> daily average 10, relative change 0%', () => {
      const baseline = makeMetrics({
        profit: 70, // 7 days * 10
        revenue: 700,
        orders: 70,
        acos: 0.25,
        margin: 0.1,
        ctr: 0.02,
        cvr: 0.1,
      });

      // 14-day observe: total profit = 140 (14 days * 10)
      const after14 = makeMetrics({
        profit: 140,
        revenue: 1400,
        orders: 140,
        acos: 0.25,
        margin: 0.1,
        ctr: 0.02,
        cvr: 0.1,
      });

      const result14 = evaluateOutcomeV2({
        actionType: 'GENERATE_REPORT',
        primaryMetric: 'profit',
        windowDays: 14,
        baseline,
        after: after14,
        observeWindowEnded: true,
      });

      // Must NOT report +100% growth (140 vs 70); daily average is 10 vs 10 -> 0% change
      expect(result14.delta?.profit?.changePct).toBe(0);
      expect(result14.status).toBe('NEUTRAL');

      // 30-day observe: total profit = 300 (30 days * 10)
      const after30 = makeMetrics({
        profit: 300,
        revenue: 3000,
        orders: 300,
        acos: 0.25,
        margin: 0.1,
        ctr: 0.02,
        cvr: 0.1,
      });

      const result30 = evaluateOutcomeV2({
        actionType: 'GENERATE_REPORT',
        primaryMetric: 'profit',
        windowDays: 30,
        baseline,
        after: after30,
        observeWindowEnded: true,
      });

      expect(result30.delta?.profit?.changePct).toBe(0);
      expect(result30.status).toBe('NEUTRAL');
    });
  });

  describe('3. Zero Denominator & Zero Conversion Spend Handling', () => {
    it('spend > 0 and ad sales = 0 -> ACOS is null + ZERO_CONVERSION_SPEND, never POSITIVE', () => {
      const baseline = makeMetrics({
        profit: 70,
        revenue: 700,
        orders: 70,
        acos: 0.3,
        margin: 0.1,
        ctr: 0.02,
        cvr: 0.1,
      });

      const afterWithZeroSales = makeMetrics({
        profit: 20,
        revenue: 100,
        orders: 5,
        acos: null, // Zero conversion spend
        margin: 0.05,
        ctr: 0.02,
        cvr: 0.0,
        adSpend: 50,
        spend: 50,
        adSales: 0,
        sales: 0,
      });

      const result = evaluateOutcomeV2({
        actionType: 'DECREASE_BID',
        primaryMetric: 'acos',
        windowDays: 7,
        baseline,
        after: afterWithZeroSales,
        observeWindowEnded: true,
        zeroConversionSpend: true,
      });

      expect(result.status).not.toBe('POSITIVE');
      expect(result.status).toBe('NEGATIVE');
      expect(result.evaluationReason).toContain('ZERO_CONVERSION_SPEND');
    });
  });

  describe('4. Window Maturity with completedThrough', () => {
    it('returns OBSERVING when completedThrough has not reached observeEnd', () => {
      const result = evaluateOutcomeV2({
        actionType: 'DECREASE_BID',
        primaryMetric: 'acos',
        windowDays: 7,
        baseline: makeMetrics({ acos: 0.4, profit: 50 }),
        after: makeMetrics({ acos: 0.2, profit: 60 }),
        observeWindowEnded: false, // completedThrough < observeEnd
      });

      expect(result.status).toBe('OBSERVING');
      expect(result.delta).toBeNull();
    });
  });

  describe('5. Negative or Zero Baseline Handling (R2-1)', () => {
    it('sets changePct to null for all metrics when baseline <= 0, avoiding sign inversion', () => {
      const baseline = makeMetrics({
        profit: -70, // negative baseline profit
        revenue: 0,   // zero baseline revenue
        orders: 0,    // zero baseline orders
        acos: null,
      });

      const after = makeMetrics({
        profit: 35,
        revenue: 350,
        orders: 35,
        acos: 0.3,
      });

      const result = evaluateOutcomeV2({
        actionType: 'GENERATE_REPORT',
        primaryMetric: 'profit',
        windowDays: 7,
        baseline,
        after,
        observeWindowEnded: true,
      });

      // When baseline <= 0, relative percentage change must be null (never sign-inverted)
      expect(result.delta?.profit?.changePct).toBeNull();
      expect(result.delta?.revenue?.changePct).toBeNull();
      expect(result.delta?.orders?.changePct).toBeNull();
      // Absolute growth from -10/day to +5/day is positive (> 10 improvement)
      expect(result.status).toBe('POSITIVE');
      expect(result.evaluationReason).toContain('基线≤0不计算百分比');
    });

    it('correctly reports NEGATIVE when profit worsens with negative baseline', () => {
      const baseline = makeMetrics({
        profit: -35, // -5/day
        revenue: 70,
        orders: 7,
      });

      const after = makeMetrics({
        profit: -140, // -20/day
        revenue: 70,
        orders: 7,
      });

      const result = evaluateOutcomeV2({
        actionType: 'GENERATE_REPORT',
        primaryMetric: 'profit',
        windowDays: 7,
        baseline,
        after,
        observeWindowEnded: true,
      });

      expect(result.delta?.profit?.changePct).toBeNull();
      expect(result.status).toBe('NEGATIVE');
      expect(result.evaluationReason).toContain('恶化');
    });
  });
});

