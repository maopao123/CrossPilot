import { PrismaClient } from '@prisma/client';
import { ErpHttpServerFixture } from './fixtures/erp-http-server';
import { AutomationOperationStore } from '@crosspilot/db';
import { processAutomationRecovery } from '../../worker/src/processors/automation-recovery.processor';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.AUTOMATION_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

describe('A7: Automation Recovery & Lease Preemption Suite', () => {
  let prisma: PrismaClient;
  let erpServer: ErpHttpServerFixture;
  let erpBaseUrl: string;
  let store: AutomationOperationStore;
  let wsId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    store = new AutomationOperationStore(prisma);

    erpServer = new ErpHttpServerFixture();
    erpBaseUrl = await erpServer.start();

    const unique = Date.now();
    wsId = `ws-recov-${unique}`;
    await prisma.workspace.create({
      data: {
        id: wsId,
        name: `Recovery WS ${unique}`,
        slug: `slug-${wsId}`,
      },
    });
  });

  afterAll(async () => {
    await erpServer.stop();
    if (prisma) {
      try {
        await prisma.purchaseOrderItem.deleteMany({ where: { workspaceId: wsId } });
        await prisma.purchaseOrder.deleteMany({ where: { workspaceId: wsId } });
        await prisma.sku.deleteMany({ where: { workspaceId: wsId } });
        await prisma.product.deleteMany({ where: { workspaceId: wsId } });
        await prisma.supplier.deleteMany({ where: { workspaceId: wsId } });
        await prisma.automationOperation.deleteMany({ where: { workspaceId: wsId } });
        await prisma.plannedAction.deleteMany({ where: { workspaceId: wsId } });
        await prisma.workspace.deleteMany({ where: { id: wsId } });
      } catch {
        // ignore
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('1. proves expired lease is claimed by recovery processor', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'EXECUTING',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId: 'SUP-1', lines: [] },
      },
    });

    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-recov',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-expired-${Date.now()}`,
        payloadHash: 'hash-1',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'SUBMITTED',
        effect: 'UNKNOWN',
        recovery: 'QUERY',
        version: 2,
        leaseOwner: 'dead-worker-1',
        leaseUntil: new Date(Date.now() - 60000), // Expired 1 min ago
      },
    });

    // List due operations
    const dueList = await store.listDue(new Date());
    const found = dueList.find((d) => d.id === op.id);
    expect(found).toBeDefined();

    // Claim the expired lease
    const claimed = await store.claim(wsId, op.id, op.version, 'recovery-worker-1', 30);
    expect(claimed.leaseOwner).toBe('recovery-worker-1');
    expect(claimed.version).toBe(3);
  });

  it('2. proves network-interrupted SUBMITTED operation is verified and converged to COMPLETED via QUERY', async () => {
    // 1. Create order directly on ERP loopback server to simulate remote success before local crash
    const opId = `op-query-test-${Date.now()}`;
    const erpCreateRes = await fetch(`${erpBaseUrl}/erp/purchase-orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': wsId,
        'x-operation-id': opId,
      },
      body: JSON.stringify({
        scope: { workspaceId: wsId },
        operationId: opId,
        idempotencyKey: `key-${opId}`,
        supplierId: 'SUPPLIER-REMOTE',
        lines: [{ skuId: 'SKU-001', quantity: 40, unitCostMinor: 2500 }],
      }),
    });
    expect(erpCreateRes.status).toBe(201);
    const remoteOrder = (await erpCreateRes.json()) as any;
    expect(remoteOrder.externalId).toBeDefined();

    // 2. Action and operation in DB stuck in SUBMITTED
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'EXECUTING',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId: 'SUPPLIER-REMOTE', lines: [] },
      },
    });

    await prisma.automationOperation.create({
      data: {
        id: opId,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-recov',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `key-${opId}`,
        payloadHash: 'hash-query',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'SUBMITTED',
        effect: 'UNKNOWN',
        recovery: 'QUERY',
        version: 1,
        leaseOwner: 'crashed-worker',
        leaseUntil: new Date(Date.now() - 30000), // Expired lease
      },
    });

    // 3. Run recovery sweep
    const result = await processAutomationRecovery(prisma, {
      workerId: 'worker-healer',
      erpBaseUrl,
    });

    expect(result.recovered).toBeGreaterThanOrEqual(1);

    // 4. Verify converged state in DB
    const updatedOp = await prisma.automationOperation.findUnique({
      where: { id: opId },
    });
    expect(updatedOp?.phase).toBe('COMPLETED');
    expect(updatedOp?.effect).toBe('APPLIED');
    expect(updatedOp?.recovery).toBe('NONE');
    expect(updatedOp?.externalId).toBe(remoteOrder.externalId);
    expect(updatedOp?.leaseOwner).toBeNull();

    // Action status converged to SUCCESS
    const updatedAction = await prisma.plannedAction.findUnique({
      where: { id: action.id },
    });
    expect(updatedAction?.status).toBe('SUCCESS');
    expect(updatedAction?.lastMessage).toContain('恢复成功');
  });

  it('3. proves max retries exceeded escalates to NEEDS_ATTENTION with released lease', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'EXECUTING',
        target: { mode: 'SIMULATOR' },
        parameters: { supplierId: 'SUPPLIER-FAIL', lines: [] },
      },
    });

    const opId = `op-max-retries-${Date.now()}`;
    await prisma.automationOperation.create({
      data: {
        id: opId,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-recov',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `key-${opId}`,
        payloadHash: 'hash-retry-max',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'READY',
        effect: 'NOT_APPLIED',
        recovery: 'RETRY',
        attemptCount: 3, // Already reached 3 attempts!
        version: 1,
      },
    });

    // Run recovery
    const result = await processAutomationRecovery(prisma, {
      workerId: 'worker-escalator',
      erpBaseUrl,
    });

    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const updatedOp = await prisma.automationOperation.findUnique({
      where: { id: opId },
    });
    expect(updatedOp?.phase).toBe('NEEDS_ATTENTION');
    expect(updatedOp?.effect).toBe('NOT_APPLIED');
    expect(updatedOp?.recovery).toBe('MANUAL');
    expect(updatedOp?.lastErrorCode).toBe('MAX_RETRIES_EXCEEDED');
    expect(updatedOp?.leaseOwner).toBeNull();

    const updatedAction = await prisma.plannedAction.findUnique({
      where: { id: action.id },
    });
    expect(updatedAction?.status).toBe('FAILED');
    expect(updatedAction?.lastMessage).toContain('需要人工介入处理');
  });

  it('4. proves READY operation executes createPurchaseOrder and syncs local PurchaseOrder (Case 2 execution)', async () => {
    // Setup supplier and SKU for local purchase order creation
    const supplier = await prisma.supplier.create({
      data: {
        workspaceId: wsId,
        name: 'Retry Supplier Test',
      },
    });

    let mp = await prisma.marketplace.findFirst();
    if (!mp) {
      mp = await prisma.marketplace.create({
        data: {
          id: `mp-recov-${Date.now()}`,
          code: `US-RECOV-${Date.now()}`,
          name: 'Amazon US',
          countryCode: 'US',
          currencyCode: 'USD',
          languageCode: 'en',
          timezone: 'America/New_York',
        },
      });
    }

    const product = await prisma.product.create({
      data: {
        workspaceId: wsId,
        marketplaceId: mp.id,
        name: 'Retry Test Product',
        brand: 'RetryBrand',
        category: 'Electronics',
      },
    });

    const sku = await prisma.sku.create({
      data: {
        workspaceId: wsId,
        productId: product.id,
        skuCode: `SKU-RETRY-${Date.now()}`,
        variantName: 'Default Variant',
        sellingPrice: 50.0,
      },
    });

    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'EXECUTING',
        target: { mode: 'SIMULATOR', supplierId: supplier.id },
        parameters: {
          supplierId: supplier.id,
          lines: [{ skuId: sku.id, quantity: 25, unitCostMinor: 3000 }],
        },
      },
    });

    const opId = `op-ready-retry-${Date.now()}`;
    await prisma.automationOperation.create({
      data: {
        id: opId,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-recov',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `key-${opId}`,
        payloadHash: 'hash-ready-retry',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'READY',
        effect: 'NOT_APPLIED',
        recovery: 'RETRY',
        attemptCount: 1,
        version: 1,
      },
    });

    // Run recovery
    const result = await processAutomationRecovery(prisma, {
      workerId: 'worker-case2-executor',
      erpBaseUrl,
    });

    expect(result.recovered).toBeGreaterThanOrEqual(1);

    const updatedOp = await prisma.automationOperation.findUnique({
      where: { id: opId },
    });
    expect(updatedOp?.phase).toBe('COMPLETED');
    expect(updatedOp?.effect).toBe('APPLIED');
    expect(updatedOp?.recovery).toBe('NONE');
    expect(updatedOp?.externalId).toBeDefined();

    const updatedAction = await prisma.plannedAction.findUnique({
      where: { id: action.id },
    });
    expect(updatedAction?.status).toBe('SUCCESS');
    expect(updatedAction?.lastMessage).toContain('ERP 采购单重试成功');
    const params = updatedAction?.parameters as any;
    expect(params._evidence).toBeDefined();
    expect(params._evidence.externalId).toBe(updatedOp?.externalId);

    // Verify local PurchaseOrder was created and synced in database
    const localPo = await prisma.purchaseOrder.findFirst({
      where: { workspaceId: wsId, poNumber: updatedOp!.externalId! },
      include: { items: true },
    });
    expect(localPo).toBeDefined();
    expect(localPo?.supplierId).toBe(supplier.id);
    expect(localPo?.status).toBe('CONFIRMED');
    expect(localPo?.items.length).toBe(1);
    expect(localPo?.items[0].skuId).toBe(sku.id);
    expect(localPo?.items[0].quantity).toBe(25);
  });
});
