import { OpportunityScoreEngine } from '../src/research/opportunity-score.engine';
import { KeywordMetric, MarketProduct, TrendSummary, ProductReviewHealthResult, VocProductAnalysisResult } from '@crosspilot/shared';

describe('OpportunityScoreEngine Boundary and Monotonicity Tests', () => {
  const baseKeywordMetric: KeywordMetric = {
    source: 'XYDC',
    marketplace: 'US',
    keyword: 'test query',
    searchVolume: 10000,
    abaRank: 20000,
    cpc: 1.5,
    capturedAt: new Date().toISOString(),
  };

  const createProduct = (reviewCount: number, price: number): MarketProduct => ({
    asin: 'B0TEST0001',
    externalId: 'B0TEST0001',
    source: 'XYDC',
    marketplace: 'US',
    title: 'Test Product',
    price,
    rating: 4.5,
    reviewCount,
    capturedAt: new Date().toISOString(),
  });

  describe('Boundary Tests (±ε continuity and interval boundaries)', () => {
    describe('Demand Search Volume Boundaries', () => {
      it('evaluates boundary points around 1,000 search volume', () => {
        const opp999 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 999, abaRank: null },
        });
        const opp1000 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 1000, abaRank: null },
        });
        const opp1001 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 1001, abaRank: null },
        });

        expect(opp999.signals.demand.normalizedScore).toBeLessThanOrEqual(opp1000.signals.demand.normalizedScore!);
        expect(opp1000.signals.demand.normalizedScore).toBe(45);
        expect(opp1001.signals.demand.normalizedScore).toBeGreaterThanOrEqual(45);
      });

      it('evaluates boundary points around 5,000, 20,000, and 50,000 volume', () => {
        const opp4999 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 4999, abaRank: null },
        });
        const opp5000 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 5000, abaRank: null },
        });
        expect(opp5000.signals.demand.normalizedScore).toBe(65);
        expect(opp4999.signals.demand.normalizedScore).toBeLessThanOrEqual(65);

        const opp19999 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 19999, abaRank: null },
        });
        const opp20000 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 20000, abaRank: null },
        });
        expect(opp20000.signals.demand.normalizedScore).toBe(80);
        expect(opp19999.signals.demand.normalizedScore).toBeLessThanOrEqual(80);

        const opp49999 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 49999, abaRank: null },
        });
        const opp50000 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: 50000, abaRank: null },
        });
        expect(opp50000.signals.demand.normalizedScore).toBe(90);
        expect(opp49999.signals.demand.normalizedScore).toBeLessThanOrEqual(90);
      });
    });

    describe('Competition Review Count Boundaries', () => {
      it('evaluates boundaries at 150, 500, 1500, 4000 reviews', () => {
        const opp150 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(150, 29.99)],
        });
        const opp151 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(151, 29.99)],
        });
        expect(opp150.signals.competition.normalizedScore).toBe(80); // 100 - 20
        expect(opp151.signals.competition.normalizedScore).toBe(65); // 100 - 35

        const opp500 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(500, 29.99)],
        });
        const opp501 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(501, 29.99)],
        });
        expect(opp500.signals.competition.normalizedScore).toBe(65);
        expect(opp501.signals.competition.normalizedScore).toBe(45); // 100 - 55

        const opp1500 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(1500, 29.99)],
        });
        const opp1501 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(1501, 29.99)],
        });
        expect(opp1500.signals.competition.normalizedScore).toBe(45);
        expect(opp1501.signals.competition.normalizedScore).toBe(25); // 100 - 75

        const opp4000 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(4000, 29.99)],
        });
        const opp4001 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(4001, 29.99)],
        });
        expect(opp4000.signals.competition.normalizedScore).toBe(25);
        expect(opp4001.signals.competition.normalizedScore).toBe(10); // 100 - 90
      });
    });

    describe('Commercial Price Bands Boundaries', () => {
      it('evaluates boundaries at $15, $20, $25, $45, $80', () => {
        const opp14_99 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(100, 14.99)],
        });
        const opp15_00 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(100, 15.00)],
        });
        expect(opp14_99.signals.commercial.normalizedScore).toBe(50); // 45 + 5 stable
        expect(opp15_00.signals.commercial.normalizedScore).toBe(70); // 65 + 5 stable

        const opp19_99 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(100, 19.99)],
        });
        const opp20_00 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(100, 20.00)],
        });
        expect(opp19_99.signals.commercial.normalizedScore).toBe(70);
        expect(opp20_00.signals.commercial.normalizedScore).toBe(85); // 80 + 5 stable

        const opp24_99 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(100, 24.99)],
        });
        const opp25_00 = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(100, 25.00)],
        });
        expect(opp24_99.signals.commercial.normalizedScore).toBe(85);
        expect(opp25_00.signals.commercial.normalizedScore).toBe(95); // 90 + 5 stable
      });
    });
  });

  describe('Monotonicity Tests (Single-variable invariants)', () => {
    it('Search volume monotonicity: score increases or stays equal as volume increases', () => {
      const volumes = [500, 1500, 6000, 25000, 60000, 100000];
      const scores = volumes.map((v) => {
        const opp = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          keywordMetric: { ...baseKeywordMetric, searchVolume: v, abaRank: null },
        });
        return opp.signals.demand.normalizedScore!;
      });

      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });

    it('Review barrier monotonicity: competition score decreases or stays equal as review count increases', () => {
      const reviewCounts = [50, 200, 800, 2500, 10000];
      const scores = reviewCounts.map((r) => {
        const opp = OpportunityScoreEngine.evaluate({
          keyword: 'test',
          marketplace: 'US',
          products: [createProduct(r, 29.99)],
        });
        return opp.signals.competition.normalizedScore!;
      });

      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it('Trend direction monotonicity: RANK_IMPROVED > STABLE > RANK_DECLINED', () => {
      const makeTrend = (direction: any): TrendSummary => ({
        startValue: 5000,
        endValue: 4000,
        minValue: 3500,
        maxValue: 5500,
        averageValue: 4500,
        changeAbsolute: -1000,
        changePercent: -20,
        direction,
      });

      const oppImproved = OpportunityScoreEngine.evaluate({
        keyword: 'test',
        marketplace: 'US',
        topAsinTrend: makeTrend('RANK_IMPROVED'),
      });
      const oppStable = OpportunityScoreEngine.evaluate({
        keyword: 'test',
        marketplace: 'US',
        topAsinTrend: makeTrend('STABLE'),
      });
      const oppDeclined = OpportunityScoreEngine.evaluate({
        keyword: 'test',
        marketplace: 'US',
        topAsinTrend: makeTrend('RANK_DECLINED'),
      });

      const scoreImproved = oppImproved.signals.trend.normalizedScore!;
      const scoreStable = oppStable.signals.trend.normalizedScore!;
      const scoreDeclined = oppDeclined.signals.trend.normalizedScore!;

      expect(scoreImproved).toBeGreaterThan(scoreStable);
      expect(scoreStable).toBeGreaterThan(scoreDeclined);
    });
  });
});
