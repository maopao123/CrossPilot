import { VarianceAttributionService } from '../src/variance/variance-attribution.service';

describe('VarianceAttributionService', () => {
  it('should attribute -$2,280 profit drop with exact mathematical closure', () => {
    const result = VarianceAttributionService.attributeVariance({
      previousProfit: 4120.00,
      currentProfit: 1840.00,
      advertisingImpact: -980.00,
      returnsImpact: -620.00,
      inventoryImpact: -510.00,
      priceImpact: -310.00,
      otherImpact: 140.00,
    });

    expect(result.totalVariance).toBe(-2280.00);
    expect(result.isExactMatch).toBe(true);
    expect(result.residual).toBe(0);
    expect(result.formulaString).toBe('-2280 = -980 -620 -510 -310 +140');
    expect(result.breakdown.advertising).toBe(-980);
    expect(result.breakdown.returns).toBe(-620);
    expect(result.breakdown.inventory).toBe(-510);
    expect(result.breakdown.price).toBe(-310);
    expect(result.breakdown.other).toBe(140);
  });
});
