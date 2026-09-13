import {
  ProductQualityIssuePattern,
  CompetitorPressurePattern,
} from '../src/operations/index.js';
import {
  buildMockContext,
  buildMockSignal,
} from './cross-domain-diagnosis.spec.js';
import { BusinessSignal } from '@crosspilot/shared';

describe('V10 P0 Bug Audit Regression Tests', () => {
  describe('S6: VOC & Return percentage unit consistency', () => {
    it('should format percentages correctly when given 0-100 values without 100x inflation', () => {
      const pattern = new ProductQualityIssuePattern();
      const context = buildMockContext({
        returns: {
          returnCount: { current: 35, baseline: 14, delta: 21, deltaPct: 1.50 },
          deliveredUnits: { current: 520, baseline: 440, delta: 80, deltaPct: 0.182 },
          returnRate: { current: 0.067, baseline: 0.032, delta: 0.035, deltaPct: 1.094 },
          returnCost: { current: 1050.0, baseline: 420.0, delta: 630.0, deltaPct: 1.50 },
          topReturnReasons: [
            { reason: 'Slot hole too small for electric brush', count: 25, percentage: 70 },
            { reason: 'Chipped marble corner', count: 10, percentage: 30 },
          ],
          availability: 'AVAILABLE',
        },
        reviews: {
          overallRating: 4.1,
          totalReviews: 120,
          recentReviewCount: 20,
          negativeReviewCount: 5,
          negativeReviewRatio: 0.25,
          topPainPoints: [
            { topicName: 'Hole diameter too narrow for electric handles', reviewCount: 14, percentage: 31.1 },
          ],
          availability: 'AVAILABLE',
        },
      });

      const signals: BusinessSignal[] = [
        buildMockSignal({
          signalId: 'sig_ret_1',
          code: 'RETURN_RATE_SPIKE',
          domain: 'RETURNS',
          ruleId: 'R-RET-01',
          currentValue: 0.067,
          baselineValue: 0.032,
          changePct: 1.094,
          direction: 'UP',
        }),
        buildMockSignal({
          signalId: 'sig_rev_1',
          code: 'RATING_DETERIORATION',
          domain: 'REVIEWS',
          ruleId: 'R-REV-01',
          currentValue: 4.1,
          baselineValue: 4.5,
          changePct: -0.088,
          direction: 'DOWN',
        }),
      ];

      const diag = pattern.diagnose(context, signals);
      expect(diag).not.toBeNull();
      // Description must say "占退货 70%" (NOT "7000%") and "占投诉 31%" (NOT "3110%")
      expect(diag!.primaryDriver.description).toContain('占退货 70%');
      expect(diag!.primaryDriver.description).not.toContain('7000%');
      expect(diag!.secondaryDrivers[0].description).toContain('占投诉 31%');
      expect(diag!.secondaryDrivers[0].description).not.toContain('3110%');
    });
  });

  describe('S7: CompetitorPressurePattern non-price-drop handling', () => {
    it('should not misdiagnose non-drop scenarios as COMPETITOR_RATING_ADVANTAGE without rating advantage', () => {
      const pattern = new CompetitorPressurePattern();
      const context = buildMockContext({
        competitors: {
          items: [
            {
              competitorId: 'comp_01',
              asin: 'B0COMPET01',
              relationType: 'DIRECT',
              isPrimary: true,
              currentPrice: 29.50,
              baselinePrice: 29.99,
              priceDelta: -0.49,
              priceDeltaPct: -0.016, // only -1.6% drop (does NOT qualify for -10% price drop)
              currentRating: 4.3,    // does NOT qualify for >= 4.7 or +0.30 rating advantage
              baselineRating: 4.3,
              ratingDelta: 0,
            },
          ],
          availability: 'AVAILABLE',
        },
      });

      const signals: BusinessSignal[] = [
        buildMockSignal({
          signalId: 'sig_comp_1',
          code: 'COMPETITOR_PRICE_DROP',
          domain: 'COMPETITOR',
          ruleId: 'R-COMP-01',
          currentValue: 29.50,
          direction: 'DOWN',
        }),
      ];

      const diag = pattern.diagnose(context, signals);
      expect(diag).not.toBeNull();
      // Must NOT be COMPETITOR_RATING_ADVANTAGE since rating is 4.3 with 0 delta
      expect(diag!.rootCauseCode).toBe('COMPETITOR_PRESSURE_GENERAL');
      expect(diag!.rootCauseCode).not.toBe('COMPETITOR_RATING_ADVANTAGE');
    });

    it('should correctly diagnose COMPETITOR_RATING_ADVANTAGE when rating advantage is verified', () => {
      const pattern = new CompetitorPressurePattern();
      const context = buildMockContext({
        competitors: {
          items: [
            {
              competitorId: 'comp_01',
              asin: 'B0COMPET01',
              relationType: 'DIRECT',
              isPrimary: true,
              currentPrice: 29.99,
              baselinePrice: 29.99,
              priceDelta: 0,
              priceDeltaPct: 0,
              currentRating: 4.8, // >= 4.7 verified advantage
              baselineRating: 4.4,
              ratingDelta: 0.40,
            },
          ],
          availability: 'AVAILABLE',
        },
      });

      const signals: BusinessSignal[] = [
        buildMockSignal({
          signalId: 'sig_comp_2',
          code: 'COMPETITOR_ADVANTAGE',
          domain: 'COMPETITOR',
          ruleId: 'R-COMP-02',
          currentValue: 4.8,
          direction: 'UP',
        }),
      ];

      const diag = pattern.diagnose(context, signals);
      expect(diag).not.toBeNull();
      expect(diag!.rootCauseCode).toBe('COMPETITOR_RATING_ADVANTAGE');
    });
  });
});
