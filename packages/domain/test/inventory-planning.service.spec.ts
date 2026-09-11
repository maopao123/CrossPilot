import { InventoryPlanningService } from '../src/inventory/inventory-planning.service';

describe('InventoryPlanningService', () => {
  it('should calculate days cover, reorder point and recommended order quantity', () => {
    // fulfillable 100, inbound 20, avg daily sales 10, lead time 15 days, safety 14 days
    const result = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: 100,
      inboundQuantity: 20,
      avgDailySales: 10,
      leadTimeDays: 15,
      safetyStockDays: 14,
      targetDaysCover: 45,
    });

    expect(result.daysCover).toBe(10); // 100 / 10 = 10 days
    // reorder point = (15 * 10) + (14 * 10) = 150 + 140 = 290 units
    expect(result.reorderPoint).toBe(290);
    // targetStock = 45 * 10 = 450 units; safetyStock = 14 * 10 = 140 units; current pipeline = 120; recommended = 450 + 140 - 120 = 470 units
    expect(result.recommendedQuantity).toBe(470);
    expect(result.riskLevel).toBe('LOW_STOCK'); // daysCover 10 <= leadTime 15
  });
});
