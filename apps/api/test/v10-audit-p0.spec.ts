import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { OperationAutomationService } from '../src/modules/operation-automation/operation-automation.service.js';
import { ProfitService } from '../src/modules/profit/profit.service.js';
import { SupplierService } from '../src/modules/supplier/supplier.service.js';
import { PurchaseService } from '../src/modules/purchase/purchase.service.js';
import { AnalystService } from '../src/modules/analyst/analyst.service.js';

describe('V10 P0 Bug Audit Regression Tests (API Layer)', () => {
  describe('S1: OperationAutomationService handles RPA failure', () => {
    it('marks workflow and steps FAILED when RPA submission fails, avoiding fake publish status', async () => {
      const approvalRecord: any = {
        id: 'app_1',
        workspaceId: 'ws_test',
        targetId: 'MTH-WHITE-001',
        requestedPayload: JSON.stringify({ price: 29.99 }),
        status: 'PENDING',
        requestedAt: new Date(),
      };
      const mockPrisma: any = {
        approval: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            Object.assign(approvalRecord, data);
            return approvalRecord;
          }),
          findFirst: jest.fn().mockResolvedValue(approvalRecord),
          update: jest.fn().mockImplementation(async ({ data }) => {
            Object.assign(approvalRecord, data);
            return approvalRecord;
          }),
        },
      };
      const mockToolCenter: any = {
        executeTool: jest.fn().mockResolvedValue({ success: true, data: {} }),
      };

      const service = new OperationAutomationService(mockPrisma, mockToolCenter);

      // Mock actionRouter.dispatch to return FAILED
      (service as any).actionRouter = {
        dispatch: jest.fn().mockResolvedValue({
          actionId: 'act_1',
          status: 'FAILED',
          error: 'Connection to Seller Central RPA timed out',
          data: { jobId: 'job_fail_001' },
        }),
      };

      const initialRun = await service.startListingPublishWorkflow(
        { skuCode: 'MTH-WHITE-001', targetPrice: 29.99 },
        'ws_test'
      );
      expect(initialRun.status).toBe('WAITING_APPROVAL');

      const run = await service.approveAndExecute('app_1', 'ws_test');

      expect(run.status).toBe('FAILED');
      expect(run.result?.publishedAt).toBeUndefined();
      expect(run.result?.sellerCentralUrl).toBeUndefined();
      expect(run.result?.error).toContain('Connection to Seller Central RPA timed out');

      const step5 = run.steps.find((s) => s.stepNumber === 5);
      expect(step5?.status).toBe('FAILED');
      expect(step5?.summary).toContain('RPA 执行失败');

      const step6 = run.steps.find((s) => s.stepNumber === 6);
      expect(step6?.status).toBe('FAILED');
      expect(step6?.summary).toContain('跳过发布后确认');
    });
  });

  describe('S2: ProfitService tenant isolation in createReturn', () => {
    it('throws NotFoundException when orderItemId does not belong to the workspace', async () => {
      const mockTx = {
        orderItem: { findFirst: jest.fn().mockResolvedValue(null) },
        sku: { findFirst: jest.fn().mockResolvedValue({ id: 'sku_1', workspaceId: 'ws_a' }) },
      };
      const mockPrisma: any = {
        $transaction: jest.fn(async (cb) => cb(mockTx)),
      };

      const service = new ProfitService(mockPrisma);

      await expect(
        service.createReturn('ws_a', {
          orderItemId: 'item_foreign_ws_b',
          skuId: 'sku_1',
          refundAmount: 29.99,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when orderItem sku does not match the provided skuId', async () => {
      const mockTx = {
        orderItem: {
          findFirst: jest.fn().mockResolvedValue({ id: 'item_1', workspaceId: 'ws_a', skuId: 'sku_2' }),
        },
        sku: { findFirst: jest.fn().mockResolvedValue({ id: 'sku_1', workspaceId: 'ws_a' }) },
      };
      const mockPrisma: any = {
        $transaction: jest.fn(async (cb) => cb(mockTx)),
      };

      const service = new ProfitService(mockPrisma);

      await expect(
        service.createReturn('ws_a', {
          orderItemId: 'item_1',
          skuId: 'sku_1', // mismatch with sku_2
          refundAmount: 29.99,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('S3: SupplierService tenant isolation in createQuote', () => {
    it('throws NotFoundException when supplierId does not belong to the workspace', async () => {
      const mockPrisma: any = {
        supplier: { findFirst: jest.fn().mockResolvedValue(null) },
        sku: { findFirst: jest.fn().mockResolvedValue({ id: 'sku_1', workspaceId: 'ws_a' }) },
      };

      const service = new SupplierService(mockPrisma);

      await expect(
        service.createQuote('ws_a', {
          supplierId: 'supplier_foreign_ws_b',
          skuId: 'sku_1',
          unitCost: 12.5,
          moq: 100,
          currencyCode: 'USD',
        })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('S4: PurchaseService deduplicates duplicate skuId in receivePurchaseOrder', () => {
    it('aggregates duplicate items by skuId and prevents double inventory increments or over-receipt bugs', async () => {
      const mockPo = {
        id: 'po_001',
        poNumber: 'PO-2026-001',
        workspaceId: 'ws_test',
        status: 'SHIPPED',
        items: [
          { id: 'item_1', skuId: 'sku_1', quantity: 20, receivedQuantity: 5 },
        ],
      };

      let currentBalanceRow: any = {
        workspaceId: 'ws_test',
        skuId: 'sku_1',
        warehouseType: 'FBA',
        fulfillableQuantity: 10,
        inboundQuantity: 15,
      };

      const updatedPoItem = jest.fn();

      const mockTx: any = {
        purchaseOrder: {
          findFirst: jest.fn().mockResolvedValue(mockPo),
          update: jest.fn().mockResolvedValue({ ...mockPo, status: 'PARTIALLY_RECEIVED' }),
        },
        inventoryBalance: {
          findUnique: jest.fn().mockImplementation(() => currentBalanceRow),
          upsert: jest.fn().mockImplementation(({ update }) => {
            currentBalanceRow = { ...currentBalanceRow, ...update };
          }),
        },
        purchaseOrderItem: {
          update: updatedPoItem,
          findMany: jest.fn().mockResolvedValue([{ id: 'item_1', quantity: 20, receivedQuantity: 15 }]),
        },
      };

      const mockPrisma: any = {
        $transaction: jest.fn(async (cb) => cb(mockTx)),
      };

      const service = new PurchaseService(mockPrisma);

      // Sending two entries with sku_1, quantity 5 each (total 10)
      const res = await service.receivePurchaseOrder('ws_test', 'po_001', {
        items: [
          { skuId: 'sku_1', receivedQuantity: 5 },
          { skuId: 'sku_1', receivedQuantity: 5 },
        ],
      });

      // Exactly one update call for item_1 with total 15 (previously 5 + 10 = 15)
      expect(updatedPoItem).toHaveBeenCalledTimes(1);
      expect(updatedPoItem).toHaveBeenCalledWith({
        where: { id: 'item_1' },
        data: { receivedQuantity: 15 },
      });
      // Inventory balance increased by 10 (fulfillable: 10 + 10 = 20)
      expect(currentBalanceRow.fulfillableQuantity).toBe(20);
    });
  });

  describe('S5: AnalystService week-over-week grouping by distinct calendar dates', () => {
    it('correctly aggregates multi-SKU daily records by distinct calendar date before week comparison', async () => {
      // 14 distinct dates with 3 SKUs per day (total 42 rows)
      const records: any[] = [];
      for (let day = 1; day <= 14; day++) {
        const dateStr = `2026-08-${String(day).padStart(2, '0')}`;
        for (let s = 1; s <= 3; s++) {
          records.push({
            workspaceId: 'ws_test',
            skuId: `sku_${s}`,
            date: new Date(`${dateStr}T00:00:00.000Z`),
            netProfit: 100, // each SKU yields 100 netProfit -> 300 per day
          });
        }
      }

      const mockPrisma: any = {
        analysisWaterfall: {
          findFirst: jest.fn().mockResolvedValue({
            periodStart: new Date('2026-08-01T00:00:00.000Z'),
            periodEnd: new Date('2026-08-14T00:00:00.000Z'),
            totalVariance: 0,
            advertisingImpact: 0,
            returnsImpact: 0,
            inventoryImpact: 0,
            priceImpact: 0,
            otherImpact: 0,
            formulaExplained: '0 = 0',
            session: { findings: [] },
          }),
        },
        profitDaily: {
          findMany: jest.fn().mockResolvedValue(records),
        },
      };

      const service = new AnalystService(mockPrisma);
      const res = await service.getWaterfall('ws_test');

      // 7 days * 300 = 2100 for previous period, 7 days * 300 = 2100 for current period
      expect(res.attribution.previousProfit).toBe(2100);
      expect(res.attribution.currentProfit).toBe(2100);
      expect(res.attribution.totalVariance).toBe(0);
      expect(res.attribution.isExactMatch).toBe(true);
    });
  });
});
