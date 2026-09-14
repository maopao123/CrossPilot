import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryPlanningService, computeSha256 } from '@crosspilot/domain';

export interface ReplenishmentProposalInput {
  skuId: string;
  supplierId: string;
  leadTimeDays?: number;
  safetyStockDays?: number;
  targetDaysCover?: number;
  avgDailySales?: number;
  fulfillableQuantity?: number;
  inboundQuantity?: number;
  unitCostMinor?: number;
  erpBaseUrl?: string;
}

export interface ReplenishmentProposalResult {
  proposed: boolean;
  actionId?: string;
  action?: any;
  calculation?: {
    daysCover: number;
    reorderPoint: number;
    recommendedQuantity: number;
    riskLevel: string;
  };
  blockedReason?: string;
  message?: string;
}

@Injectable()
export class PurchaseAutomationService {
  constructor(private readonly prisma: PrismaService) {}

  async generateReplenishmentProposal(
    workspaceId: string,
    input: ReplenishmentProposalInput,
  ): Promise<ReplenishmentProposalResult> {
    if (!input.skuId || !input.supplierId) {
      throw new BadRequestException('skuId and supplierId are required');
    }

    // 1. Duplicate check across pending/executing actions
    const existingActions = await this.prisma.plannedAction.findMany({
      where: {
        workspaceId,
        actionType: 'CREATE_PURCHASE_ORDER',
        status: { in: ['CREATED', 'WAITING_APPROVAL', 'APPROVED', 'EXECUTING'] },
      },
    });

    const duplicateAction = existingActions.find((a) => {
      const target = (a.target as any) || {};
      const params = (a.parameters as any) || {};
      if (target.skuId === input.skuId) return true;
      if (Array.isArray(params.lines) && params.lines.some((l: any) => l.skuId === input.skuId)) {
        return true;
      }
      return false;
    });

    if (duplicateAction) {
      return {
        proposed: false,
        blockedReason: 'DUPLICATE_REPLENISHMENT_EXISTS',
        message: `A planned purchase order action (${duplicateAction.id}) for SKU '${input.skuId}' is already pending approval or execution`,
      };
    }

    // 2. Open PO check in database (if inbound not explicitly accounted for)
    if (input.inboundQuantity === undefined || input.inboundQuantity === 0) {
      const activePo = await this.prisma.purchaseOrder.findFirst({
        where: {
          workspaceId,
          status: { in: ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'SHIPPED', 'PARTIALLY_RECEIVED'] },
          OR: [
            { items: { some: { skuId: input.skuId } } },
            { supplierId: input.supplierId },
          ],
        },
      });

      if (activePo) {
        return {
          proposed: false,
          blockedReason: 'OPEN_PURCHASE_ORDER_EXISTS',
          message: `Purchase order ${activePo.poNumber} for SKU '${input.skuId}' is currently active in status '${activePo.status}'`,
        };
      }
    }

    // 3. Stock metrics
    let fulfillable = input.fulfillableQuantity;
    let inbound = input.inboundQuantity ?? 0;

    if (fulfillable === undefined) {
      const balance = await this.prisma.inventoryBalance.findFirst({
        where: { workspaceId, skuId: input.skuId },
      });
      fulfillable = balance?.fulfillableQuantity ?? 0;
      if (input.inboundQuantity === undefined) {
        inbound = balance?.inboundQuantity ?? 0;
      }
    }

    const leadTimeDays = input.leadTimeDays ?? 3;
    const safetyStockDays = input.safetyStockDays ?? 2;
    const targetDaysCover = input.targetDaysCover ?? 5;
    const avgDailySales = input.avgDailySales ?? 10;

    const planning = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: fulfillable,
      inboundQuantity: inbound,
      avgDailySales,
      leadTimeDays,
      safetyStockDays,
      targetDaysCover,
    });

    if (planning.recommendedQuantity <= 0) {
      return {
        proposed: false,
        calculation: planning,
        message: 'Stock level is healthy; no replenishment needed',
      };
    }

    // 4. Create PlannedAction
    let unitCostMinor = input.unitCostMinor;
    if (unitCostMinor === undefined) {
      const quote = await this.prisma.supplierSkuQuote.findFirst({
        where: { workspaceId, skuId: input.skuId, supplierId: input.supplierId },
      });
      unitCostMinor = quote ? Math.round(Number(quote.unitCost) * 100) : 0;
    }

    const target: Record<string, unknown> = {
      skuId: input.skuId,
      supplierId: input.supplierId,
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
      ...(input.erpBaseUrl ? { erpBaseUrl: input.erpBaseUrl } : {}),
    };
    const parameters: Record<string, unknown> = {
      supplierId: input.supplierId,
      lines: [
        {
          skuId: input.skuId,
          quantity: planning.recommendedQuantity,
          unitCostMinor,
        },
      ],
    };

    const payloadHash = computeSha256({
      actionType: 'CREATE_PURCHASE_ORDER',
      target,
      parameters,
    });
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const plannedAction = await this.prisma.plannedAction.create({
      data: {
        workspaceId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'WAITING_APPROVAL',
        target: target as any,
        parameters: {
          ...parameters,
          _approval: {
            payloadHash,
            expiresAt,
          },
        } as any,
        lastMessage: `建议补货 ${planning.recommendedQuantity} 件 (当前库存: ${fulfillable}, ROP: ${planning.reorderPoint})`,
      },
    });

    return {
      proposed: true,
      actionId: plannedAction.id,
      action: plannedAction,
      calculation: planning,
    };
  }
}
