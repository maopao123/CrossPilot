import { AdOptimizerService } from '../src/advertising/ad-optimizer.service';

describe('AdOptimizerService', () => {
  it('should flag "bathroom organizer" with 93.3% ACOS as negative keyword candidate', () => {
    const result = AdOptimizerService.analyzeSearchTerm({
      searchTerm: 'bathroom organizer',
      impressions: 12500,
      clicks: 280,
      spend: 420.00,
      orders: 2,
      sales: 450.00,
    });

    expect(result.acos).toBeGreaterThan(0.90);
    expect(result.action).toBe('ADD_NEGATIVE_EXACT');
    expect(result.reason).toContain('Negative Exact');
  });

  it('should recommend increasing bid for high-converting term', () => {
    const result = AdOptimizerService.analyzeSearchTerm({
      searchTerm: 'marble toothbrush stand',
      impressions: 4800,
      clicks: 160,
      spend: 85.00,
      orders: 18,
      sales: 540.00,
    });

    expect(result.acos).toBeLessThan(0.20);
    expect(result.action).toBe('INCREASE_BID');
    expect(result.suggestedBidAdjustmentPercent).toBe(15);
  });
});
