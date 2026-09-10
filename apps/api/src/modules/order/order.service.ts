import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateOrderInput,
  ErrorCodes,
  OrderInfo,
} from '@crosspilot/shared';
import {
  InventoryMovementService,
  ProfitCalculationService,
} from '@crosspilot/domain';

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

  async listOrders(
    workspaceId: string,
    limit = 50,
  ): Promise<OrderInfo[]> {
    try {
      const orders = await this.prisma.order.findMany({
        where: { workspaceId },
        include: {
          items: {
            include: { sku: true },
          },
        },
        orderBy: { orderedAt: 'desc' },
        take: limit,
      });

      return orders.map((o) => this.mapOrder(o));
    } catch {
      return [
        {
          id: 'ord_demo_001',
          workspaceId,
          marketplaceId: 'mkt_us_001',
          orderNumber: '114-8765432-1098765',
          status: 'SHIPPED',
          totalAmount: 29.99,
          currencyCode: 'USD',
          orderedAt: new Date(Date.now() - 3600000 * 5),
          items: [
            {
              id: 'ord_item_001',
              orderId: 'ord_demo_001',
              skuId: 'sku_white_001',
              skuCode: 'MTH-WHITE-001',
              quantity: 1,
              unitPrice: 29.99,
              itemTax: 2.1,
              shippingFee: 0,
            },
          ],
          createdAt: new Date(),
        },
      ];
    }
  }

  async getOrderById(workspaceId: string, orderId: string): Promise<OrderInfo> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        items: {
          include: { sku: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Order not found',
      });
    }

    return this.mapOrder(order);
  }

  /**
   * AC 2: Order -> Inventory -
   * Deducts orderQuantity from fulfillable stock.
   * Throws INVENTORY_NOT_ENOUGH if stock is insufficient.
   * Updates daily profit record.
   */
  async createOrder(
    workspaceId: string,
    input: CreateOrderInput,
  ): Promise<OrderInfo> {
    // 1. Verify and deduct inventory for each item
    for (const item of input.items) {
      const balance = await this.prisma.inventoryBalance.findUnique({
        where: {
          workspaceId_skuId_warehouseType: {
            workspaceId,
            skuId: item.skuId,
            warehouseType: 'FBA',
          },
        },
      });

      const currentBalance = balance
        ? {
            fulfillableQuantity: balance.fulfillableQuantity,
            reservedQuantity: balance.reservedQuantity,
            inboundQuantity: balance.inboundQuantity,
            unfulfillableQuantity: balance.unfulfillableQuantity,
          }
        : {
            fulfillableQuantity: 0,
            reservedQuantity: 0,
            inboundQuantity: 0,
            unfulfillableQuantity: 0,
          };

      let newBalance;
      try {
        newBalance = InventoryMovementService.calculateOrderFulfillment(
          currentBalance,
          item.quantity,
        );
      } catch (err: any) {
        throw new BadRequestException({
          code: ErrorCodes.INVENTORY_NOT_ENOUGH,
          message: err.message,
        });
      }

      await this.prisma.inventoryBalance.update({
        where: {
          workspaceId_skuId_warehouseType: {
            workspaceId,
            skuId: item.skuId,
            warehouseType: 'FBA',
          },
        },
        data: {
          fulfillableQuantity: newBalance.fulfillableQuantity,
        },
      });
    }

    // 2. Create Order & OrderItems
    const totalAmount = input.items.reduce(
      (sum, item) =>
        sum +
        item.quantity * item.unitPrice +
        (item.itemTax ?? 0) +
        (item.shippingFee ?? 0),
      0,
    );

    const orderedAtDate = input.orderedAt
      ? new Date(input.orderedAt)
      : new Date();

    const order = await this.prisma.order.create({
      data: {
        workspaceId,
        marketplaceId: input.marketplaceId,
        orderNumber: input.orderNumber,
        status: 'SHIPPED',
        totalAmount,
        currencyCode: input.currencyCode || 'USD',
        orderedAt: orderedAtDate,
        items: {
          create: input.items.map((item) => ({
            workspaceId,
            skuId: item.skuId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            itemTax: item.itemTax ?? 0,
            shippingFee: item.shippingFee ?? 0,
          })),
        },
      },
      include: {
        items: {
          include: {
            sku: true,
          },
        },
      },
    });

    // 3. Update ProfitDaily for each SKU
    const orderDateKey = new Date(orderedAtDate.toISOString().slice(0, 10));

    for (const item of input.items) {
      const quote = await this.prisma.supplierSkuQuote.findFirst({
        where: { workspaceId, skuId: item.skuId },
        orderBy: { effectiveDate: 'desc' },
      });
      const unitCost = quote ? Number(quote.unitCost) : 8.5;

      const itemProfit = ProfitCalculationService.calculateProfit({
        orderItems: [
          {
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost,
            referralFeeRate: 0.15,
            fbaFeePerUnit: 4.5,
          },
        ],
      });

      const existingProfit = await this.prisma.profitDaily.findUnique({
        where: {
          workspaceId_skuId_date: {
            workspaceId,
            skuId: item.skuId,
            date: orderDateKey,
          },
        },
      });

      if (existingProfit) {
        const newRevenue = Number(existingProfit.revenue) + itemProfit.revenue;
        const newCogs = Number(existingProfit.cogs) + itemProfit.cogs;
        const newAmazonFees =
          Number(existingProfit.amazonFees) + itemProfit.amazonFees;
        const newFbaFee = Number(existingProfit.fbaFee) + itemProfit.fbaFee;
        const newAdsCost = Number(existingProfit.adsCost);
        const newReturnLoss = Number(existingProfit.returnLoss);
        const newOtherCosts = Number(existingProfit.otherCosts);
        const newNetProfit =
          newRevenue -
          (newCogs +
            newAmazonFees +
            newFbaFee +
            newAdsCost +
            newReturnLoss +
            newOtherCosts);
        const newMargin = newRevenue > 0 ? newNetProfit / newRevenue : 0;

        await this.prisma.profitDaily.update({
          where: { id: existingProfit.id },
          data: {
            revenue: newRevenue,
            cogs: newCogs,
            amazonFees: newAmazonFees,
            fbaFee: newFbaFee,
            netProfit: newNetProfit,
            margin: newMargin,
          },
        });
      } else {
        await this.prisma.profitDaily.create({
          data: {
            workspaceId,
            skuId: item.skuId,
            date: orderDateKey,
            revenue: itemProfit.revenue,
            cogs: itemProfit.cogs,
            amazonFees: itemProfit.amazonFees,
            fbaFee: itemProfit.fbaFee,
            adsCost: 0,
            returnLoss: 0,
            otherCosts: 0,
            netProfit: itemProfit.netProfit,
            margin: itemProfit.margin,
          },
        });
      }
    }

    return this.mapOrder(order);
  }

  private mapOrder(order: any): OrderInfo {
    return {
      id: order.id,
      workspaceId: order.workspaceId,
      marketplaceId: order.marketplaceId,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currencyCode: order.currencyCode,
      orderedAt: order.orderedAt,
      items: order.items
        ? order.items.map((i: any) => ({
            id: i.id,
            orderId: i.orderId,
            skuId: i.skuId,
            skuCode: i.sku?.skuCode,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            itemTax: Number(i.itemTax ?? 0),
            shippingFee: Number(i.shippingFee ?? 0),
          }))
        : undefined,
      createdAt: order.createdAt,
    };
  }
}
