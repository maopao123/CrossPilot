import { PrismaClient } from '@prisma/client';
import { PurchaseService } from '../src/modules/purchase/purchase.service';
import { BadRequestException } from '@nestjs/common';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.AUTOMATION_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

describe('A6: Multi-batch Receipts, Idempotent Inbound & Reconciliation Suite', () => {
  let prisma: PrismaClient;
  let purchaseService: PurchaseService;
  let wsId: string;
  let supplierId: string;
  let prodId: string;
  let skuId: string;
  let poId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    purchaseService = new PurchaseService(prisma as any);

    const unique = Date.now();
    wsId = `ws-receipt-${unique}`;
    await prisma.workspace.create({
      data: {
        id: wsId,
        name: `Receipt Test Workspace ${unique}`,
        slug: `slug-${wsId}`,
      },
    });

    let mp = await prisma.marketplace.findFirst();
    if (!mp) {
      mp = await prisma.marketplace.create({
        data: {
          id: `mp-${unique}`,
          code: `US-${unique}`,
          name: 'Amazon US',
          countryCode: 'US',
          currencyCode: 'USD',
          languageCode: 'en',
          timezone: 'America/New_York',
        },
      });
    }

    supplierId = `sup-rcpt-${unique}`;
    await prisma.supplier.create({
      data: {
        id: supplierId,
        workspaceId: wsId,
        name: 'Alpha Supplier',
      },
    });

    prodId = `prod-rcpt-${unique}`;
    await prisma.product.create({
      data: {
        id: prodId,
        workspaceId: wsId,
        marketplaceId: mp.id,
        name: 'Desk Lamp',
        brand: 'Alpha',
        category: 'Electronics',
      },
    });

    skuId = `SKU-RCPT-${unique}`;
    await prisma.sku.create({
      data: {
        id: skuId,
        workspaceId: wsId,
        productId: prodId,
        skuCode: skuId,
        variantName: 'Black',
        sellingPrice: 45.0,
      },
    });

    // Initial stock: 30 fulfillable, 40 inbound
    await prisma.inventoryBalance.create({
      data: {
        workspaceId: wsId,
        skuId,
        warehouseType: 'FBA',
        fulfillableQuantity: 30,
        inboundQuantity: 40,
        reservedQuantity: 0,
      },
    });

    // Create a CONFIRMED PO with 40 units
    const po = await prisma.purchaseOrder.create({
      data: {
        workspaceId: wsId,
        supplierId,
        poNumber: `PO-RCPT-${unique}`,
        status: 'CONFIRMED',
        totalAmount: 1000,
        items: {
          create: [
            {
              workspaceId: wsId,
              skuId,
              quantity: 40,
              unitCost: 25.0,
              receivedQuantity: 0,
            },
          ],
        },
      },
    });
    poId = po.id;
  });

  afterAll(async () => {
    if (prisma) {
      try {
        await prisma.automationOperation.deleteMany({ where: { workspaceId: wsId } });
        await prisma.purchaseOrderItem.deleteMany({ where: { workspaceId: wsId } });
        await prisma.purchaseOrder.deleteMany({ where: { workspaceId: wsId } });
        await prisma.inventoryBalance.deleteMany({ where: { workspaceId: wsId } });
        await prisma.sku.deleteMany({ where: { workspaceId: wsId } });
        await prisma.product.deleteMany({ where: { workspaceId: wsId } });
        await prisma.supplier.deleteMany({ where: { workspaceId: wsId } });
        await prisma.workspace.deleteMany({ where: { id: wsId } });
      } catch {
        // ignore
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('1. receives batch 1 (15 units) -> transitions PO to PARTIALLY_RECEIVED, updates fulfillable to 45', async () => {
    const received = await purchaseService.receivePurchaseOrder(wsId, poId, {
      externalReceiptId: 'RECEIPT-BATCH-1',
      items: [{ skuId, receivedQuantity: 15 }],
    });

    expect(received.status).toBe('PARTIALLY_RECEIVED');

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });
    expect(po?.status).toBe('PARTIALLY_RECEIVED');
    expect(po?.items[0]?.receivedQuantity).toBe(15);

    const balance = await prisma.inventoryBalance.findFirst({
      where: { workspaceId: wsId, skuId },
    });
    expect(balance?.fulfillableQuantity).toBe(45);
    expect(balance?.inboundQuantity).toBe(25);

    // Verify receipt operation logged
    const op = await prisma.automationOperation.findFirst({
      where: { workspaceId: wsId, idempotencyKey: 'RECEIPT-BATCH-1' },
    });
    expect(op).toBeDefined();
    expect(op?.phase).toBe('COMPLETED');
    expect(op?.effect).toBe('APPLIED');
  });

  it('2. proves idempotency: retrying batch 1 with same externalReceiptId is safe and does not double stock', async () => {
    const replayed = await purchaseService.receivePurchaseOrder(wsId, poId, {
      externalReceiptId: 'RECEIPT-BATCH-1',
      items: [{ skuId, receivedQuantity: 15 }],
    });

    expect(replayed.status).toBe('PARTIALLY_RECEIVED');

    const balance = await prisma.inventoryBalance.findFirst({
      where: { workspaceId: wsId, skuId },
    });
    // Stock must remain 45, NOT 60!
    expect(balance?.fulfillableQuantity).toBe(45);
    expect(balance?.inboundQuantity).toBe(25);
  });

  it('3. receives batch 2 (25 units) -> transitions PO to RECEIVED, fulfillable reaches 70', async () => {
    const received = await purchaseService.receivePurchaseOrder(wsId, poId, {
      externalReceiptId: 'RECEIPT-BATCH-2',
      items: [{ skuId, receivedQuantity: 25 }],
    });

    expect(received.status).toBe('RECEIVED');

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });
    expect(po?.status).toBe('RECEIVED');
    expect(po?.items[0]?.receivedQuantity).toBe(40);

    const balance = await prisma.inventoryBalance.findFirst({
      where: { workspaceId: wsId, skuId },
    });
    expect(balance?.fulfillableQuantity).toBe(70);
    expect(balance?.inboundQuantity).toBe(0);
  });

  it('4. rejects over-receipt: attempting to receive 1 more unit throws 400 BadRequestException', async () => {
    await expect(
      purchaseService.receivePurchaseOrder(wsId, poId, {
        externalReceiptId: 'RECEIPT-OVER-1',
        items: [{ skuId, receivedQuantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. performs full end-to-end reconciliation report verifying 100% balance', async () => {
    const report = await purchaseService.reconcilePurchaseOrder(wsId, poId);

    expect(report.isFullyReconciled).toBe(true);
    expect(report.totalOrderedQuantity).toBe(40);
    expect(report.totalReceivedQuantity).toBe(40);
    expect(report.remainingQuantity).toBe(0);
    expect(report.discrepancies).toHaveLength(0);
    expect(report.lines[0]?.isBalanced).toBe(true);
  });
});
