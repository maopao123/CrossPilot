import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { PurchaseService } from '../src/modules/purchase/purchase.service.js';
import { OrderService } from '../src/modules/order/order.service.js';
import { ProfitService } from '../src/modules/profit/profit.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { ErrorCodes } from '@crosspilot/shared';

describe('Milestone 1: Core Commerce Integration & AC Verification', () => {
  let purchaseService: PurchaseService;
  let orderService: OrderService;
  let profitService: ProfitService;
  let inventoryService: InventoryService;
  let prisma: any;

  const mockWorkspaceId = 'ws_test_001';
  const mockSkuId = 'sku_test_marble_white';
  const mockSupplierId = 'sup_test_001';
  const mockPoId = 'po_test_001';
  const mockOrderId = 'ord_test_001';

  beforeEach(async () => {
    prisma = {
      purchaseOrder: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      sku: {
        findUnique: jest.fn().mockResolvedValue({ id: mockSkuId, sellingPrice: 29.99 }),
        findFirst: jest.fn().mockResolvedValue({
          id: mockSkuId,
          workspaceId: mockWorkspaceId,
          sellingPrice: 29.99,
        }),
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: mockSupplierId,
          workspaceId: mockWorkspaceId,
        }),
      },
      purchaseOrderItem: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ skuId: mockSkuId, quantity: 500, receivedQuantity: 500 }]),
      },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      inventoryBalance: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      supplierSkuQuote: {
        findFirst: jest.fn(),
      },
      returnRecord: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
      },
      profitDaily: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        OrderService,
        ProfitService,
        InventoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    purchaseService = module.get<PurchaseService>(PurchaseService);
    orderService = module.get<OrderService>(OrderService);
    profitService = module.get<ProfitService>(ProfitService);
    inventoryService = module.get<InventoryService>(InventoryService);
  });

  describe('AC 1: PO Receive -> Inventory +', () => {
    it('should increment fulfillable inventory and deduct inbound when PO is received', async () => {
      // 1. Setup existing PO in SHIPPED status
      prisma.purchaseOrder.findFirst.mockResolvedValue({
        id: mockPoId,
        workspaceId: mockWorkspaceId,
        supplierId: mockSupplierId,
        poNumber: 'PO-20260901-01',
        status: 'SHIPPED',
        totalAmount: 4250,
        currencyCode: 'USD',
        items: [
          {
            id: 'poi_001',
            purchaseOrderId: mockPoId,
            skuId: mockSkuId,
            quantity: 500,
            unitCost: 8.5,
            receivedQuantity: 0,
            sku: { skuCode: 'MTH-WHITE-001' },
          },
        ],
      });

      // 2. Setup current inventory balance (inbound: 500, fulfillable: 100)
      prisma.inventoryBalance.findUnique.mockResolvedValue({
        id: 'inv_001',
        workspaceId: mockWorkspaceId,
        skuId: mockSkuId,
        warehouseType: 'FBA',
        fulfillableQuantity: 100,
        reservedQuantity: 10,
        inboundQuantity: 500,
        unfulfillableQuantity: 0,
      });

      prisma.inventoryBalance.upsert.mockResolvedValue({});
      prisma.purchaseOrderItem.update.mockResolvedValue({});
      prisma.purchaseOrder.update.mockResolvedValue({
        id: mockPoId,
        workspaceId: mockWorkspaceId,
        status: 'RECEIVED',
        totalAmount: 4250,
        items: [],
      });

      // 3. Execute PO Receive
      const res = await purchaseService.receivePurchaseOrder(
        mockWorkspaceId,
        mockPoId,
        {
          items: [{ skuId: mockSkuId, receivedQuantity: 500 }],
        },
      );

      // 4. Assert PO status transition and InventoryBalance upsert call
      expect(res.status).toBe('RECEIVED');
      expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
        where: {
          workspaceId_skuId_warehouseType: {
            workspaceId: mockWorkspaceId,
            skuId: mockSkuId,
            warehouseType: 'FBA',
          },
        },
        update: {
          fulfillableQuantity: 600, // 100 + 500
          inboundQuantity: 0, // 500 - 500
        },
        create: {
          workspaceId: mockWorkspaceId,
          skuId: mockSkuId,
          warehouseType: 'FBA',
          fulfillableQuantity: 600,
          inboundQuantity: 0,
        },
      });
    });
  });

  describe('AC 2: Order -> Inventory - with insufficient inventory protection', () => {
    it('should deduct fulfillable inventory when stock is sufficient', async () => {
      // 1. Current stock: 600
      prisma.inventoryBalance.findUnique.mockResolvedValue({
        id: 'inv_001',
        workspaceId: mockWorkspaceId,
        skuId: mockSkuId,
        warehouseType: 'FBA',
        fulfillableQuantity: 600,
        reservedQuantity: 0,
        inboundQuantity: 0,
        unfulfillableQuantity: 0,
      });

      prisma.inventoryBalance.update.mockResolvedValue({});
      prisma.order.create.mockResolvedValue({
        id: mockOrderId,
        workspaceId: mockWorkspaceId,
        marketplaceId: 'mkt_us_001',
        orderNumber: 'ORD-1001',
        status: 'SHIPPED',
        totalAmount: 59.98,
        currencyCode: 'USD',
        orderedAt: new Date(),
        items: [
          {
            id: 'item_001',
            orderId: mockOrderId,
            skuId: mockSkuId,
            quantity: 2,
            unitPrice: 29.99,
            sku: { skuCode: 'MTH-WHITE-001' },
          },
        ],
      });

      prisma.supplierSkuQuote.findFirst.mockResolvedValue({
        unitCost: 8.5,
      });
      prisma.profitDaily.findUnique.mockResolvedValue(null);
      prisma.profitDaily.create.mockResolvedValue({});

      // 2. Order 2 units
      const order = await orderService.createOrder(mockWorkspaceId, {
        marketplaceId: 'mkt_us_001',
        orderNumber: 'ORD-1001',
        items: [
          {
            skuId: mockSkuId,
            quantity: 2,
            unitPrice: 29.99,
          },
        ],
      });

      // 3. Verify stock deducted to 598 (600 - 2)
      expect(order.orderNumber).toBe('ORD-1001');
      expect(prisma.inventoryBalance.update).toHaveBeenCalledWith({
        where: {
          workspaceId_skuId_warehouseType: {
            workspaceId: mockWorkspaceId,
            skuId: mockSkuId,
            warehouseType: 'FBA',
          },
        },
        data: {
          fulfillableQuantity: 598,
        },
      });
    });

    it('should reject order and throw INVENTORY_NOT_ENOUGH when stock is insufficient', async () => {
      // Stock only 1 unit
      prisma.inventoryBalance.findUnique.mockResolvedValue({
        id: 'inv_001',
        workspaceId: mockWorkspaceId,
        skuId: mockSkuId,
        warehouseType: 'FBA',
        fulfillableQuantity: 1,
        reservedQuantity: 0,
        inboundQuantity: 0,
        unfulfillableQuantity: 0,
      });

      // Attempt to order 5 units
      await expect(
        orderService.createOrder(mockWorkspaceId, {
          marketplaceId: 'mkt_us_001',
          orderNumber: 'ORD-FAIL-001',
          items: [
            {
              skuId: mockSkuId,
              quantity: 5,
              unitPrice: 29.99,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify inventory was NOT updated
      expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });
  });

  describe('AC 3: Return -> Profit Recalculate', () => {
    it('should recalculate net profit and margin with exact decimal precision on return', async () => {
      const mockReturnDate = new Date('2026-09-08T12:00:00Z');

      prisma.returnRecord.create.mockResolvedValue({
        id: 'ret_001',
        workspaceId: mockWorkspaceId,
        orderItemId: 'item_001',
        skuId: mockSkuId,
        refundAmount: 29.99,
        reason: 'Damaged item',
        status: 'COMPLETED',
        returnDate: mockReturnDate,
      });

      // Existing profit before return:
      // Revenue = 299.90, COGS = 85.00, AmazonFees = 44.99, FBA = 45.00, Ads = 30.00
      // Net Profit = 299.90 - (85 + 44.99 + 45 + 30) = 94.91
      // Margin = 94.91 / 299.90 = 0.3165
      prisma.profitDaily.findUnique.mockResolvedValue({
        id: 'pd_001',
        workspaceId: mockWorkspaceId,
        skuId: mockSkuId,
        date: new Date('2026-09-08'),
        revenue: 299.9,
        cogs: 85.0,
        amazonFees: 44.99,
        fbaFee: 45.0,
        adsCost: 30.0,
        returnLoss: 0,
        otherCosts: 0,
        netProfit: 94.91,
        margin: 0.3165,
      });

      prisma.profitDaily.update.mockResolvedValue({});

      // Process return of 29.99 refund
      const result = await profitService.createReturn(mockWorkspaceId, {
        orderItemId: 'item_001',
        skuId: mockSkuId,
        refundAmount: 29.99,
        reason: 'Damaged item',
        returnDate: mockReturnDate.toISOString(),
      });

      // Verify recalculation:
      // returnLoss = 29.99
      // netProfit = 94.91 - 29.99 = 64.92
      // margin = 64.92 / 299.90 = 0.2165
      expect(result.updatedProfit.returnLoss).toBe(29.99);
      expect(result.updatedProfit.netProfit).toBe(64.92);
      expect(result.updatedProfit.margin).toBe(0.2165);

      expect(prisma.profitDaily.update).toHaveBeenCalledWith({
        where: { id: 'pd_001' },
        data: {
          returnLoss: 29.99,
          netProfit: 64.92,
          margin: 0.2165,
        },
      });
    });
  });

  describe('Inventory Planning & Reorder Recommendation', () => {
    it('should compute deterministic reorder point and recommended quantity', async () => {
      prisma.inventoryBalance.findFirst.mockResolvedValue({
        fulfillableQuantity: 50,
        inboundQuantity: 0,
      });
      prisma.supplierSkuQuote.findFirst.mockResolvedValue({
        supplier: { leadTimeDays: 15 },
      });
      prisma.orderItem.findMany.mockResolvedValue([
        { quantity: 150 }, // 150 sold over 30 days => avgDailySales = 5.0
      ]);

      const rec = await inventoryService.getReorderRecommendation(
        mockWorkspaceId,
        mockSkuId,
      );

      expect(rec).toBeDefined();
      expect(rec.avgDailySales).toBe(5);
      expect(rec.leadTimeDays).toBe(15);
      expect(rec.safetyStockDays).toBe(14);
      // Safety stock = 14 * 5 = 70
      // Reorder Point = (15 * 5) + 70 = 145
      expect(rec.reorderPoint).toBe(145);
      // Days cover = 50 / 5 = 10 days
      expect(rec.daysCover).toBe(10);
      // Since daysCover (10) <= leadTimeDays (15), risk level should be LOW_STOCK
      expect(rec.riskLevel).toBe('LOW_STOCK');
      // Target stock for 45 days = 45 * 5 = 225
      // Safety stock = 14 * 5 = 70
      // Recommended quantity = 225 + 70 - 50 = 245
      expect(rec.recommendedQuantity).toBe(245);
    });
  });
});
