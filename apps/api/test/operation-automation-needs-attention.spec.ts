import { Test } from '@nestjs/testing';
import { OperationAutomationService } from '../src/modules/operation-automation/operation-automation.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ToolCenterService } from '../src/modules/tool-center/tool-center.service.js';

describe('F-11: Needs Attention Human Review & Recovery Flow', () => {
  let service: OperationAutomationService;
  let prisma: PrismaService;
  const wsId = `ws-f11-${Date.now()}`;
  const otherWsId = `ws-f11-other-${Date.now()}`;

  let supplierId: string;
  let skuId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationAutomationService,
        {
          provide: PrismaService,
          useValue: new PrismaService(),
        },
        {
          provide: ToolCenterService,
          useValue: { executeTool: jest.fn().mockResolvedValue({ data: { status: 'PASS' } }) },
        },
      ],
    }).compile();

    service = moduleRef.get<OperationAutomationService>(OperationAutomationService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Create test workspaces
    await prisma.workspace.create({ data: { id: wsId, slug: `slug-${wsId}`, name: 'F11 Test WS' } });
    await prisma.workspace.create({ data: { id: otherWsId, slug: `slug-${otherWsId}`, name: 'F11 Other WS' } });

    // Seed marketplace, product, sku
    const mp = await prisma.marketplace.create({
      data: {
        id: `mp-f11-${Date.now()}`,
        code: `US-F11-${Date.now()}`,
        name: 'Amazon US',
        countryCode: 'US',
        currencyCode: 'USD',
        languageCode: 'en',
        timezone: 'America/New_York',
      },
    });

    const product = await prisma.product.create({
      data: {
        workspaceId: wsId,
        marketplaceId: mp.id,
        name: 'F11 Test Product',
        brand: 'Brand',
        category: 'Electronics',
      },
    });

    const sku = await prisma.sku.create({
      data: {
        workspaceId: wsId,
        productId: product.id,
        skuCode: `SKU-F11-${Date.now()}`,
        variantName: 'Default Variant',
        sellingPrice: 40.0,
      },
    });
    skuId = sku.id;

    const supplier = await prisma.supplier.create({
      data: {
        workspaceId: wsId,
        name: 'F11 Real Supplier',
      },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await prisma.purchaseOrderItem.deleteMany({ where: { workspaceId: wsId } });
    await prisma.purchaseOrder.deleteMany({ where: { workspaceId: wsId } });
    await prisma.automationOperation.deleteMany({ where: { workspaceId: { in: [wsId, otherWsId] } } });
    await prisma.plannedAction.deleteMany({ where: { workspaceId: { in: [wsId, otherWsId] } } });
    await prisma.sku.deleteMany({ where: { workspaceId: wsId } });
    await prisma.product.deleteMany({ where: { workspaceId: wsId } });
    await prisma.supplier.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.deleteMany({ where: { id: { in: [wsId, otherWsId] } } });
    await prisma.$disconnect();
  });

  it('1. listNeedsAttention returns operations requiring manual intervention strictly scoped to workspace', async () => {
    // Create one NEEDS_ATTENTION in wsId
    const action1 = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'FAILED',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId, lines: [{ skuId, quantity: 10, unitCostMinor: 2000 }] },
      },
    });

    await prisma.automationOperation.create({
      data: {
        id: `op-f11-1-${Date.now()}`,
        workspaceId: wsId,
        actionId: action1.id,
        connectionId: 'conn-1',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-1-${Date.now()}`,
        payloadHash: 'hash-1',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'NEEDS_ATTENTION',
        effect: 'NOT_APPLIED',
        recovery: 'MANUAL',
        lastErrorCode: 'REMOTE_PAYLOAD_MISMATCH',
        evidence: {
          phase: 'NEEDS_ATTENTION',
          errorCode: 'REMOTE_PAYLOAD_MISMATCH',
          conflictDetails: { mismatches: ['totalAmountMinor: 20000 vs 25000'] },
        },
      },
    });

    // Create another NEEDS_ATTENTION in otherWsId
    await prisma.automationOperation.create({
      data: {
        id: `op-f11-other-${Date.now()}`,
        workspaceId: otherWsId,
        connectionId: 'conn-other',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-other-${Date.now()}`,
        payloadHash: 'hash-other',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'NEEDS_ATTENTION',
        effect: 'NOT_APPLIED',
        recovery: 'MANUAL',
      },
    });

    const list = await service.listNeedsAttention(wsId);
    expect(list.length).toBe(1);
    expect(list[0].workspaceId).toBe(wsId);
    expect(list[0].lastErrorCode).toBe('REMOTE_PAYLOAD_MISMATCH');
    expect(list[0].conflictDetails.mismatches).toContain('totalAmountMinor: 20000 vs 25000');
    expect(list[0].linkedAction?.id).toBe(action1.id);
  });

  it('2. resolveNeedsAttention with RETRY_SYNC: recovers stuck operation and syncs local PO when prerequisite is resolved', async () => {
    // Simulate: local PO sync failed initially because missing supplier
    const missingSupplierId = `SUP-LATER-${Date.now()}`;
    const extPo = `ERP-PO-RETRY-SYNC-${Date.now()}`;

    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'FAILED',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId: missingSupplierId, lines: [{ skuId, quantity: 15, unitCostMinor: 3000 }] },
      },
    });

    const op = await prisma.automationOperation.create({
      data: {
        id: `op-f11-retry-${Date.now()}`,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-retry',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-retry-${Date.now()}`,
        payloadHash: 'hash-retry',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'NEEDS_ATTENTION',
        effect: 'APPLIED',
        recovery: 'MANUAL',
        externalId: extPo,
        lastErrorCode: 'LOCAL_SYNC_FAILED',
        evidence: {
          phase: 'NEEDS_ATTENTION',
          effect: 'APPLIED',
          recovery: 'MANUAL',
          externalId: extPo,
          errorCode: 'LOCAL_SYNC_FAILED',
          syncError: `SUPPLIER_NOT_FOUND: supplierId '${missingSupplierId}' not found`,
        },
      },
    });

    // 1) Attempt RETRY_SYNC before adding supplier -> should fail with 400
    await expect(
      service.resolveNeedsAttention(wsId, op.id, { resolution: 'RETRY_SYNC' }),
    ).rejects.toThrow(/Local PurchaseOrder sync failed/);

    // 2) Operator adds the supplier in the database
    await prisma.supplier.create({
      data: {
        id: missingSupplierId,
        workspaceId: wsId,
        name: 'Later Created Supplier',
      },
    });

    // 3) Re-attempt RETRY_SYNC -> should succeed!
    const resolveRes = await service.resolveNeedsAttention(wsId, op.id, {
      resolution: 'RETRY_SYNC',
      userId: 'admin-user-1',
      comment: 'Supplier registered, successfully synchronized local PO',
    });

    expect(resolveRes.success).toBe(true);
    expect(resolveRes.operation.phase).toBe('COMPLETED');
    expect(resolveRes.operation.effect).toBe('APPLIED');
    expect(resolveRes.operation.recovery).toBe('NONE');

    // Verify local PO exists in DB
    const localPo = await prisma.purchaseOrder.findFirst({
      where: { workspaceId: wsId, poNumber: extPo },
      include: { items: true },
    });
    expect(localPo).toBeDefined();
    expect(localPo?.supplierId).toBe(missingSupplierId);
    expect(localPo?.status).toBe('CONFIRMED');
    expect(localPo?.items.length).toBe(1);
    expect(localPo?.items[0].quantity).toBe(15);

    // Verify PlannedAction converged to SUCCESS
    const updatedAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    expect(updatedAction?.status).toBe('SUCCESS');
    expect(updatedAction?.lastMessage).toContain('本地单据重试同步成功');
  });

  it('3. resolveNeedsAttention with FORCE_ADOPT: human approves mismatched remote order and updates audit evidence', async () => {
    const extPo = `ERP-PO-FORCE-ADOPT-${Date.now()}`;
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'FAILED',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId, lines: [{ skuId, quantity: 20, unitCostMinor: 1500 }] },
      },
    });

    const op = await prisma.automationOperation.create({
      data: {
        id: `op-f11-adopt-${Date.now()}`,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-adopt',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-adopt-${Date.now()}`,
        payloadHash: 'hash-adopt',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'NEEDS_ATTENTION',
        effect: 'NOT_APPLIED',
        recovery: 'MANUAL',
        externalId: extPo,
        lastErrorCode: 'REMOTE_PAYLOAD_MISMATCH',
        evidence: {
          phase: 'NEEDS_ATTENTION',
          errorCode: 'REMOTE_PAYLOAD_MISMATCH',
          externalId: extPo,
        },
      },
    });

    const resolveRes = await service.resolveNeedsAttention(wsId, op.id, {
      resolution: 'FORCE_ADOPT',
      userId: 'admin-manager',
      comment: 'Verified with ERP vendor that minor discrepancy was due to currency conversion rounding',
    });

    expect(resolveRes.success).toBe(true);
    expect(resolveRes.operation.phase).toBe('COMPLETED');
    expect(resolveRes.operation.effect).toBe('APPLIED');
    expect(resolveRes.operation.recovery).toBe('NONE');
    const evidence = resolveRes.operation.evidence as any;
    expect(evidence.manualResolution?.resolution).toBe('FORCE_ADOPT');
    expect(evidence.manualResolution?.resolvedBy).toBe('admin-manager');
    expect(evidence.manualResolution?.comment).toContain('currency conversion');

    const updatedAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    expect(updatedAction?.status).toBe('SUCCESS');
    expect(updatedAction?.lastMessage).toContain('强制采纳外部单据');
  });

  it('4. resolveNeedsAttention with DISMISS: human rejects invalid order and permanently fails action', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'FAILED',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId, lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }] },
      },
    });

    const op = await prisma.automationOperation.create({
      data: {
        id: `op-f11-dismiss-${Date.now()}`,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-dismiss',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-dismiss-${Date.now()}`,
        payloadHash: 'hash-dismiss',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'NEEDS_ATTENTION',
        effect: 'NOT_APPLIED',
        recovery: 'MANUAL',
        lastErrorCode: 'REMOTE_PAYLOAD_MISMATCH',
      },
    });

    const resolveRes = await service.resolveNeedsAttention(wsId, op.id, {
      resolution: 'DISMISS',
      userId: 'ops-lead',
      comment: 'Wrong supplier code submitted by operator, cancelled',
    });

    expect(resolveRes.success).toBe(true);
    expect(resolveRes.operation.phase).toBe('FAILED');
    expect(resolveRes.operation.recovery).toBe('NONE');
    const evidence = resolveRes.operation.evidence as any;
    expect(evidence.manualResolution?.resolution).toBe('DISMISS');
    expect(evidence.manualResolution?.resolvedBy).toBe('ops-lead');

    const updatedAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    expect(updatedAction?.status).toBe('FAILED');
    expect(updatedAction?.lastMessage).toContain('人工核对后已废弃此异常操作');
  });

  it('5. error handling: rejects cross-workspace operation (404) and already completed operation (400)', async () => {
    // 1) Cross workspace
    await expect(
      service.resolveNeedsAttention(otherWsId, 'non-existent-op', { resolution: 'DISMISS' }),
    ).rejects.toThrow(/not found/);

    // 2) Non-NEEDS_ATTENTION operation
    const completedOp = await prisma.automationOperation.create({
      data: {
        id: `op-already-done-${Date.now()}`,
        workspaceId: wsId,
        connectionId: 'conn-done',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-done-${Date.now()}`,
        payloadHash: 'hash-done',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
      },
    });

    await expect(
      service.resolveNeedsAttention(wsId, completedOp.id, { resolution: 'FORCE_ADOPT' }),
    ).rejects.toThrow(/is not in NEEDS_ATTENTION phase/);
  });
});
