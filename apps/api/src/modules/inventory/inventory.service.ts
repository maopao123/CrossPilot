import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ErrorCodes, InventoryBalanceInfo } from '@crosspilot/shared';
import { InventoryPlanningService } from '@crosspilot/domain';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async listInventory(workspaceId: string): Promise<InventoryBalanceInfo[]> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { workspaceId },
      include: { sku: true },
    });

    return balances.map((b) => this.mapBalance(b));
  }

  async getSkuInventory(
    workspaceId: string,
    skuId: string,
  ): Promise<InventoryBalanceInfo> {
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: { workspaceId, skuId },
      include: { sku: true },
    });

    if (!balance) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Inventory balance not found for SKU',
      });
    }

    return this.mapBalance(balance);
  }

  async getReorderRecommendation(
    workspaceId: string,
    skuId: string,
    options?: { leadTimeDays?: number; targetDaysCover?: number },
  ) {
    const balance = await this.prisma.inventoryBalance.findFirst({
      where: { workspaceId, skuId },
    });

    if (!balance) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Inventory balance not found for SKU',
      });
    }

    const fulfillableQuantity = balance.fulfillableQuantity;
    const inboundQuantity = balance.inboundQuantity;

    // Determine lead time from supplier quote
    let leadTimeDays = options?.leadTimeDays ?? 15;
    try {
      const quote = await this.prisma.supplierSkuQuote.findFirst({
        where: { workspaceId, skuId },
        include: { supplier: true },
      });
      if (quote?.supplier?.leadTimeDays) {
        leadTimeDays = quote.supplier.leadTimeDays;
      }
    } catch {
      // Use fallback
    }

    // Determine average daily sales (past 30 days)
    let avgDailySales = 0;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const recentItems = await this.prisma.orderItem.findMany({
      where: {
        workspaceId,
        skuId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    if (recentItems.length > 0) {
      const totalSold = recentItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      avgDailySales = Math.round((totalSold / 30) * 10) / 10;
    }

    const planning = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity,
      inboundQuantity,
      avgDailySales,
      leadTimeDays,
      safetyStockDays: 14,
      targetDaysCover: options?.targetDaysCover ?? 45,
    });

    return {
      skuId,
      avgDailySales,
      fulfillableQuantity,
      inboundQuantity,
      leadTimeDays,
      safetyStockDays: 14,
      daysCover: planning.daysCover,
      reorderPoint: planning.reorderPoint,
      recommendedQuantity: planning.recommendedQuantity,
      riskLevel: planning.riskLevel,
    };
  }

  private mapBalance(b: any): InventoryBalanceInfo {
    return {
      id: b.id,
      workspaceId: b.workspaceId,
      skuId: b.skuId,
      skuCode: b.sku?.skuCode,
      warehouseType: b.warehouseType,
      fulfillableQuantity: b.fulfillableQuantity,
      reservedQuantity: b.reservedQuantity,
      inboundQuantity: b.inboundQuantity,
      unfulfillableQuantity: b.unfulfillableQuantity,
      updatedAt: b.updatedAt,
    };
  }
}
