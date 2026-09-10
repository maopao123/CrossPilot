import { ProfitCalculationService } from '../src/profit/profit-calculation.service';

describe('ProfitCalculationService', () => {
  it('should calculate revenue, expenses, net profit and margin with precision', () => {
    // 10 units at $29.99, cost $8.50, FBA fee $4.50, Referral fee 15% ($4.4985)
    const result = ProfitCalculationService.calculateProfit({
      orderItems: [
        {
          quantity: 10,
          unitPrice: 29.99,
          unitCost: 8.5,
          fbaFeePerUnit: 4.5,
          referralFeeRate: 0.15,
        },
      ],
      adsCost: 35.0,
      storageFee: 5.0,
    });

    expect(result.revenue).toBe(299.9);
    expect(result.cogs).toBe(85.0);
    expect(result.amazonFees).toBe(44.98); // 29.99 * 10 * 0.15 = 44.985 float -> 44.98
    expect(result.fbaFee).toBe(45.0); // 10 * 4.5
    expect(result.adsCost).toBe(35.0);
    expect(result.otherCosts).toBe(5.0);
    expect(result.returnLoss).toBe(0);

    // Total expenses: 85 + 44.98 + 45 + 35 + 5 = 214.98
    // Net profit: 299.9 - 214.98 = 84.92
    expect(result.netProfit).toBe(84.92);
    expect(result.margin).toBe(0.2832); // 84.92 / 299.9 = 0.283161... -> 0.2832
  });

  it('AC 3: Return -> Profit Recalculate should update net profit and return loss dynamically', () => {
    const initial = ProfitCalculationService.calculateProfit({
      orderItems: [
        {
          quantity: 10,
          unitPrice: 29.99,
          unitCost: 8.5,
          fbaFeePerUnit: 4.5,
          referralFeeRate: 0.15,
        },
      ],
      adsCost: 35.0,
    });

    const initialProfit = initial.netProfit;

    // A return occurs: refund $29.99 + $2.00 processing fee
    const updated = ProfitCalculationService.recalculateWithReturn(initial, {
      refundAmount: 29.99,
      returnProcessingFee: 2.0,
    });

    expect(updated.returnLoss).toBe(31.99);
    expect(updated.netProfit).toBe(Math.round((initialProfit - 31.99) * 100) / 100);
    expect(updated.margin).toBeLessThan(initial.margin);
  });
});
