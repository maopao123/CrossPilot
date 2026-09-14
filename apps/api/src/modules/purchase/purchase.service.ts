import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreatePurchaseOrderInput,
  ErrorCodes,
  PurchaseOrderInfo,
  ReceivePurchaseOrderInput,
} from '@crosspilot/shared';
import { Prisma } from '@prisma/client';
import {
  InventoryMovementService,
  PurchaseOrderStateMachine,
  PurchaseOrderStatus,
} from '@crosspilot/domain';

@Injectable()
export class PurchaseService {
  constructor(private prisma: PrismaService) {}

  async listPurchaseOrders(workspaceId: string): Promise<PurchaseOrderInfo[]> {
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { workspaceId },
      include: {
        supplier: true,
        items: {
          include: { sku: true },
        },
      },
      orderBy: { orderDate: 'desc' },
    });

    return pos.map((po) => this.mapPo(po));
  }

  async getPurchaseOrderById(
    workspaceId: string,
    poId: string,
  ): Promise<PurchaseOrderInfo> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, workspaceId },
      include: {
        supplier: true,
        items: {
          include: { sku: true },
        },
      },
    });

    if (!po) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Purchase order not found',
      });
    }

    return this.mapPo(po);
  }

  async createPurchaseOrder(
    workspaceId: string,
    input: CreatePurchaseOrderInput,
  ): Promise<PurchaseOrderInfo> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, workspaceId },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Supplier not found in this workspace',
      });
    }
    for (const item of input.items) {
      const sku = await this.prisma.sku.findFirst({
        where: { id: item.skuId, workspaceId },
      });
      if (!sku) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: `SKU '${item.skuId}' not found in this workspace`,
        });
      }
    }

    // Calculate total amount
    const totalAmount = input.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0,
    );

    const po = await this.prisma.purchaseOrder.create({
      data: {
        workspaceId,
        supplierId: input.supplierId,
        poNumber: input.poNumber,
        status: 'DRAFT',
        totalAmount,
        currencyCode: input.currencyCode,
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : undefined,
        items: {
          create: input.items.map((item) => ({
            workspaceId,
            skuId: item.skuId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            receivedQuantity: 0,
          })),
        },
      },
      include: {
        supplier: true,
        items: {
          include: { sku: true },
        },
      },
    });

    return this.mapPo(po);
  }

  async confirmPurchaseOrder(
    workspaceId: string,
    poId: string,
  ): Promise<PurchaseOrderInfo> {
    const po = await this.getPurchaseOrderById(workspaceId, poId);
    this.assertPoTransition(po.status as PurchaseOrderStatus, 'CONFIRMED');

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'CONFIRMED' },
      include: {
        supplier: true,
        items: {
          include: { sku: true },
        },
      },
    });

    return this.mapPo(updated);
  }

  async shipPurchaseOrder(
    workspaceId: string,
    poId: string,
  ): Promise<PurchaseOrderInfo> {
    return await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: poId, workspaceId },
        include: {
          supplier: true,
          items: {
            include: { sku: true },
          },
        },
      });

      if (!po) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'Purchase order not found',
        });
      }

      this.assertPoTransition(po.status as PurchaseOrderStatus, 'SHIPPED');

      // Update PO status to SHIPPED and increase inbound on inventory balance
      const updated = await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: 'SHIPPED' },
        include: {
          supplier: true,
          items: {
            include: { sku: true },
          },
        },
      });

      for (const item of updated.items) {
        await tx.inventoryBalance.upsert({
          where: {
            workspaceId_skuId_warehouseType: {
              workspaceId,
              skuId: item.skuId,
              warehouseType: 'FBA',
            },
          },
          update: {
            inboundQuantity: { increment: item.quantity },
          },
          create: {
            workspaceId,
            skuId: item.skuId,
            warehouseType: 'FBA',
            fulfillableQuantity: 0,
            inboundQuantity: item.quantity,
          },
        });
      }

      return this.mapPo(updated);
    });
  }

  /**
   * AC 1: PO Receive -> Inventory +
   * Validates transition, adds received quantity to fulfillable stock, and updates PO.
   */
  async receivePurchaseOrder(
    workspaceId: string,
    poId: string,
    input: ReceivePurchaseOrderInput,
  ): Promise<PurchaseOrderInfo> {
    return await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: poId, workspaceId },
        include: {
          supplier: true,
          items: {
            include: { sku: true },
          },
        },
      });

      if (!po) {
        throw new NotFoundException({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'Purchase order not found',
        });
      }

      // Idempotency check for externalReceiptId
      if (input.externalReceiptId) {
        const existingOp = await tx.automationOperation.findFirst({
          where: {
            workspaceId,
            operationKind: 'RECEIPT',
            idempotencyKey: input.externalReceiptId,
            phase: 'COMPLETED',
          },
        });
        if (existingOp) {
          const incomingPayloadHash = JSON.stringify(input);
          if (existingOp.payloadHash !== incomingPayloadHash) {
            throw new ConflictException({
              code: ErrorCodes.CONFLICT_ERROR,
              message: `IDEMPOTENCY_CONFLICT: externalReceiptId '${input.externalReceiptId}' already executed with different payload`,
            });
          }
          return this.mapPo(po);
        }
      }

      // Aggregate quantities by skuId first to prevent duplicate processing / over-receipt bugs
      const aggregatedItems = new Map<string, number>();
      for (const recItem of input.items) {
        if (!recItem.skuId) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: 'skuId is required for received item',
          });
        }
        if (recItem.receivedQuantity <= 0) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Received quantity must be greater than 0`,
          });
        }
        aggregatedItems.set(
          recItem.skuId,
          (aggregatedItems.get(recItem.skuId) || 0) + recItem.receivedQuantity,
        );
      }

      // Validate each received item belongs to this PO and check over-receipt first
      for (const [skuId, recQuantity] of aggregatedItems.entries()) {
        const poItem = po.items?.find((i) => i.skuId === skuId);
        if (!poItem) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `SKU '${skuId}' does not belong to purchase order '${po.poNumber}'`,
          });
        }

        const totalReceived = poItem.receivedQuantity + recQuantity;
        if (totalReceived > poItem.quantity) {
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Over-receipt rejected: cannot receive ${recQuantity} units. Ordered: ${poItem.quantity}, previously received: ${poItem.receivedQuantity}, remaining allowed: ${poItem.quantity - poItem.receivedQuantity}`,
          });
        }
      }

      // Determine targetStatus and assert valid transition
      const allFullyReceived = (po.items || []).every((item) => {
        const adding = aggregatedItems.get(item.skuId) || 0;
        return item.receivedQuantity + adding >= item.quantity;
      });
      const targetStatus: PurchaseOrderStatus = allFullyReceived
        ? 'RECEIVED'
        : 'PARTIALLY_RECEIVED';

      this.assertPoTransition(po.status as PurchaseOrderStatus, targetStatus);

      // Apply inventory updates and update PO items
      for (const [skuId, recQuantity] of aggregatedItems.entries()) {
        const poItem = po.items?.find((i) => i.skuId === skuId)!;

        // Concurrency-safe check: update PO Item received quantity using increment with optimistic lock
        const updateResult = await tx.purchaseOrderItem.updateMany({
          where: {
            id: poItem.id,
            receivedQuantity: poItem.receivedQuantity,
          },
          data: {
            receivedQuantity: { increment: recQuantity },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException({
            code: ErrorCodes.CONFLICT_ERROR,
            message: `Concurrent modification detected on purchase order item for SKU '${skuId}', please retry`,
          });
        }

        // Concurrency-safe inventory balance update using atomic increment
        await tx.inventoryBalance.upsert({
          where: {
            workspaceId_skuId_warehouseType: {
              workspaceId,
              skuId,
              warehouseType: 'FBA',
            },
          },
          update: {
            fulfillableQuantity: { increment: recQuantity },
            inboundQuantity: { decrement: recQuantity },
          },
          create: {
            workspaceId,
            skuId,
            warehouseType: 'FBA',
            fulfillableQuantity: recQuantity,
            inboundQuantity: 0,
          },
        });
      }

      const updatedPo = await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: targetStatus,
          actualDeliveryDate: allFullyReceived ? new Date() : undefined,
        },
        include: {
          supplier: true,
          items: {
            include: { sku: true },
          },
        },
      });

      // Record receipt evidence if externalReceiptId provided
      if (input.externalReceiptId) {
        try {
          await tx.automationOperation.create({
            data: {
              workspaceId,
              connectionId: 'erp-receipt',
              operationKind: 'RECEIPT',
              idempotencyKey: input.externalReceiptId,
              payloadHash: JSON.stringify(input),
              approvedPayloadHash: JSON.stringify(input),
              mode: 'SIMULATOR',
              provider: 'erp-receipt',
              phase: 'COMPLETED',
              effect: 'APPLIED',
              recovery: 'NONE',
              externalId: input.externalReceiptId,
              evidence: {
                externalReceiptId: input.externalReceiptId,
                receivedAt: new Date().toISOString(),
              },
            },
          });
        } catch (err: any) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Concurrent duplicate receipt created: safe to treat as idempotent
          } else {
            throw err;
          }
        }
      }

      return this.mapPo(updatedPo);
    });
  }

  async reconcilePurchaseOrder(
    workspaceId: string,
    poId: string,
  ): Promise<any> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, workspaceId },
      include: {
        items: { include: { sku: true } },
      },
    });

    if (!po) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Purchase order not found',
      });
    }

    let totalOrdered = 0;
    let totalReceived = 0;
    const discrepancies: string[] = [];

    const lines = (po.items || []).map((item) => {
      totalOrdered += item.quantity;
      totalReceived += item.receivedQuantity;
      const remaining = item.quantity - item.receivedQuantity;
      if (remaining > 0) {
        discrepancies.push(`SKU ${item.skuId} has ${remaining} remaining units pending receipt`);
      } else if (remaining < 0) {
        discrepancies.push(`SKU ${item.skuId} is over-received by ${-remaining} units`);
      }
      return {
        skuId: item.skuId,
        ordered: item.quantity,
        received: item.receivedQuantity,
        remaining,
        isBalanced: remaining === 0,
      };
    });

    const isFullyReconciled =
      totalOrdered === totalReceived &&
      discrepancies.length === 0 &&
      po.status === 'RECEIVED';

    return {
      poId: po.id,
      poNumber: po.poNumber,
      status: po.status,
      totalOrderedQuantity: totalOrdered,
      totalReceivedQuantity: totalReceived,
      remainingQuantity: totalOrdered - totalReceived,
      isFullyReconciled,
      discrepancies,
      lines,
    };
  }

  private assertPoTransition(
    current: PurchaseOrderStatus,
    next: PurchaseOrderStatus,
  ): void {
    try {
      PurchaseOrderStateMachine.assertTransition(current, next);
    } catch (err: any) {
      throw new ConflictException({
        code: ErrorCodes.PURCHASE_INVALID_STATUS_TRANSITION,
        message: err?.message || 'Invalid purchase order status transition',
      });
    }
  }

  private mapPo(po: any): PurchaseOrderInfo {
    return {
      id: po.id,
      workspaceId: po.workspaceId,
      supplierId: po.supplierId,
      supplierName: po.supplier?.name,
      poNumber: po.poNumber,
      status: po.status,
      totalAmount: Number(po.totalAmount),
      currencyCode: po.currencyCode,
      orderDate: po.orderDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      actualDeliveryDate: po.actualDeliveryDate,
      items: po.items
        ? po.items.map((i: any) => ({
            id: i.id,
            purchaseOrderId: i.purchaseOrderId,
            skuId: i.skuId,
            skuCode: i.sku?.skuCode,
            quantity: i.quantity,
            unitCost: Number(i.unitCost),
            receivedQuantity: i.receivedQuantity,
          }))
        : undefined,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    };
  }
}
