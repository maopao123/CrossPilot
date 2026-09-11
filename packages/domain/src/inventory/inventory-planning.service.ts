export type StockRiskLevel = 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERSTOCKED';

export interface InventoryPlanningInput {
  fulfillableQuantity: number;
  inboundQuantity: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyStockDays?: number;
  targetDaysCover?: number;
}

export interface InventoryPlanningResult {
  daysCover: number;
  reorderPoint: number;
  recommendedQuantity: number;
  riskLevel: StockRiskLevel;
}

export class InventoryPlanningService {
  /**
   * Deterministic inventory metrics calculation
   */
  public static calculatePlanning(
    input: InventoryPlanningInput,
  ): InventoryPlanningResult {
    const safetyStockDays = input.safetyStockDays ?? 14;
    const targetDaysCover = input.targetDaysCover ?? 45;
    const avgDailySales = Math.max(0, input.avgDailySales);

    // Days Cover
    const daysCover =
      avgDailySales > 0
        ? Math.round((input.fulfillableQuantity / avgDailySales) * 10) / 10
        : 999;

    // Safety Stock units = Safety Days * Daily Sales
    const safetyStockUnits = Math.ceil(safetyStockDays * avgDailySales);

    // Reorder Point = (Lead Time * Daily Sales) + Safety Stock Units
    const reorderPoint = Math.ceil(
      input.leadTimeDays * avgDailySales + safetyStockUnits,
    );

    // Total Effective Inventory = Available + Inbound
    const totalPipeline = input.fulfillableQuantity + input.inboundQuantity;

    // Recommended Reorder Quantity (Baseline §194.3: TargetCoverageDemand + SafetyStock - Available - Inbound)
    let recommendedQuantity = 0;
    if (totalPipeline <= reorderPoint && avgDailySales > 0) {
      const targetStockUnits = Math.ceil(targetDaysCover * avgDailySales);
      recommendedQuantity = Math.max(0, targetStockUnits + safetyStockUnits - totalPipeline);
    }

    // Risk Level
    let riskLevel: StockRiskLevel = 'HEALTHY';
    if (input.fulfillableQuantity === 0) {
      riskLevel = 'OUT_OF_STOCK';
    } else if (daysCover <= input.leadTimeDays) {
      riskLevel = 'LOW_STOCK';
    } else if (daysCover > 90) {
      riskLevel = 'OVERSTOCKED';
    }

    return {
      daysCover,
      reorderPoint,
      recommendedQuantity,
      riskLevel,
    };
  }
}
