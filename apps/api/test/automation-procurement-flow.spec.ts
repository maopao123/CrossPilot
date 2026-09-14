import { PrismaClient } from '@prisma/client';
import { ErpHttpServerFixture } from './fixtures/erp-http-server';
import { PurchaseAutomationService } from '../src/modules/purchase/purchase-automation.service';
import { ActionLayerService } from '../src/modules/action-layer/action-layer.service';
import type { IntelligenceService } from '../src/modules/intelligence/intelligence.service';
import type { AdvertisingService } from '../src/modules/advertising/advertising.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.AUTOMATION_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

describe('A5: Inventory to Procurement Flow & Approval Closed-Loop Suite', () => {
  let prisma: PrismaClient;
  let erpServer: ErpHttpServerFixture;
  let erpBaseUrl: string;
  let automationService: PurchaseAutomationService;
  let actionLayerService: ActionLayerService;
  let wsId: string;
  let supplierId: string;
  const skuId = 'SKU-001';
  const userId = 'buyer-007';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();

    erpServer = new ErpHttpServerFixture();
    erpBaseUrl = await erpServer.start();

    const intelMock = {} as unknown as IntelligenceService;
    const adMock = {} as unknown as AdvertisingService;
    actionLayerService = new ActionLayerService(prisma as any, intelMock, adMock);
    automationService = new PurchaseAutomationService(prisma as any);

    // Setup test workspace & supplier
    const unique = Date.now();
    wsId = `ws-procure-${unique}`;
    await prisma.workspace.create({
      data: {
        id: wsId,
        name: `Procurement Test Workspace ${unique}`,
        slug: `slug-${wsId}`,
      },
    });

    supplierId = `sup-${unique}`;
    await prisma.supplier.create({
      data: {
        id: supplierId,
        workspaceId: wsId,
        name: 'Alpha Electronics Ltd',
      },
    });
  });

  afterAll(async () => {
    await erpServer.stop();
    if (prisma) {
      try {
        await prisma.actionExecution.deleteMany({ where: { action: { workspaceId: wsId } } });
        await prisma.automationOperation.deleteMany({ where: { workspaceId: wsId } });
        await prisma.plannedAction.deleteMany({ where: { workspaceId: wsId } });
        await prisma.purchaseOrderItem.deleteMany({ where: { workspaceId: wsId } });
        await prisma.purchaseOrder.deleteMany({ where: { workspaceId: wsId } });
        await prisma.inventoryBalance.deleteMany({ where: { workspaceId: wsId } });
        await prisma.supplier.deleteMany({ where: { workspaceId: wsId } });
        await prisma.workspace.deleteMany({ where: { id: wsId } });
      } catch {
        // ignore cleanup error
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('1. triggers replenishment calculation: ROP=50, stock=30 -> proposes 40 units as WAITING_APPROVAL', async () => {
    const proposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId,
      supplierId,
      fulfillableQuantity: 30,
      inboundQuantity: 0,
      avgDailySales: 10,
      leadTimeDays: 3,
      safetyStockDays: 2,
      targetDaysCover: 5,
      unitCostMinor: 2500,
      erpBaseUrl,
    });

    expect(proposal.proposed).toBe(true);
    expect(proposal.actionId).toBeDefined();
    expect(proposal.calculation?.reorderPoint).toBe(50);
    expect(proposal.calculation?.recommendedQuantity).toBe(40);
    expect(proposal.calculation?.daysCover).toBe(3);

    const action = await prisma.plannedAction.findUnique({
      where: { id: proposal.actionId },
    });
    expect(action).toBeDefined();
    expect(action?.status).toBe('WAITING_APPROVAL');
    expect(action?.riskLevel).toBe('high');
    expect(action?.needApproval).toBe(true);
  });

  it('2. proves duplicate replenishment is blocked while action is pending approval', async () => {
    const duplicateProposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId,
      supplierId,
      fulfillableQuantity: 30,
      inboundQuantity: 0,
      avgDailySales: 10,
      leadTimeDays: 3,
      safetyStockDays: 2,
      targetDaysCover: 5,
      unitCostMinor: 2500,
      erpBaseUrl,
    });

    expect(duplicateProposal.proposed).toBe(false);
    expect(duplicateProposal.blockedReason).toBe('DUPLICATE_REPLENISHMENT_EXISTS');
    expect(duplicateProposal.message).toContain('already pending');
  });

  it('3. proves unapproved action cannot be executed', async () => {
    const pendingAction = await prisma.plannedAction.findFirst({
      where: { workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER' },
    });
    expect(pendingAction).toBeDefined();

    await expect(actionLayerService.execute(wsId, pendingAction!.id, userId)).rejects.toThrow(
      /only APPROVED actions can execute/,
    );
  });

  it('4. approves and executes action: calls real loopback ERP HTTP, creates PO, records evidence', async () => {
    const pendingAction = await prisma.plannedAction.findFirst({
      where: { workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER' },
    });
    expect(pendingAction).toBeDefined();

    // Approve
    const approved = await actionLayerService.approve(wsId, pendingAction!.id, userId);
    expect(approved.status).toBe('APPROVED');

    // Execute (synchronous ERP HTTP call via loopback)
    const executed = await actionLayerService.execute(wsId, pendingAction!.id, userId);
    expect(executed.status).toBe('SUCCESS');
    expect(executed.lastMessage).toMatch(/ERP 采购单已创建: ERP-PO-/);

    // Verify AutomationOperation in DB
    const op = await prisma.automationOperation.findFirst({
      where: { workspaceId: wsId, actionId: pendingAction!.id },
    });
    expect(op).toBeDefined();
    expect(op?.phase).toBe('COMPLETED');
    expect(op?.effect).toBe('APPLIED');
    expect(op?.externalId).toMatch(/^ERP-PO-/);
    expect(op?.leaseOwner).toBeNull();

    // Verify local PurchaseOrder was created in DB
    const localPo = await prisma.purchaseOrder.findFirst({
      where: { workspaceId: wsId, poNumber: op!.externalId! },
    });
    expect(localPo).toBeDefined();
    expect(localPo?.status).toBe('CONFIRMED');
  });

  it('5. proves duplicate replenishment is blocked when open PO exists in DB', async () => {
    const secondProposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId,
      supplierId,
      fulfillableQuantity: 30,
      avgDailySales: 10,
      leadTimeDays: 3,
      safetyStockDays: 2,
      targetDaysCover: 5,
      erpBaseUrl,
    });

    expect(secondProposal.proposed).toBe(false);
    expect(secondProposal.blockedReason).toBeDefined();
  });
});
