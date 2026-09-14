import * as http from 'http';
import type { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import { PurchaseAutomationService } from '../src/modules/purchase/purchase-automation.service';
import { ActionLayerService } from '../src/modules/action-layer/action-layer.service';
import { processAutomationRecovery } from '../../worker/src/processors/automation-recovery.processor';
import type { IntelligenceService } from '../src/modules/intelligence/intelligence.service';
import type { AdvertisingService } from '../src/modules/advertising/advertising.service';
import type { ErpCreateCommand, ErpPurchaseOrder } from '@crosspilot/shared';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.AUTOMATION_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

/**
 * Isolated ERP HTTP server fixture supporting fault injection:
 * - socket destruction to simulate network error / drop
 * - seed remote order to simulate "order exists on remote"
 * - 404 NOT_FOUND to simulate "order confirmed not created"
 */
class BatchDErpServer {
  private server: http.Server | null = null;
  public port: number = 0;
  public orders: Map<string, ErpPurchaseOrder> = new Map();
  public operationIndex: Map<string, string> = new Map();
  public postCreateCount: number = 0;
  public queryCount: number = 0;
  public shouldDropCreateConnection: boolean = false;

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        if (req.method === 'POST' && pathname === '/erp/purchase-orders') {
          this.postCreateCount++;
          if (this.shouldDropCreateConnection) {
            req.socket.destroy();
            return;
          }

          let bodyBuffer = '';
          req.on('data', (chunk) => {
            bodyBuffer += chunk;
          });
          req.on('end', () => {
            let cmd: ErpCreateCommand;
            try {
              cmd = JSON.parse(bodyBuffer) as ErpCreateCommand;
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              return;
            }

            const externalId = `ERP-PO-BATCHD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const order: ErpPurchaseOrder = {
              externalId,
              operationId: cmd.operationId,
              idempotencyKey: cmd.idempotencyKey,
              supplierId: cmd.supplierId,
              warehouseId: cmd.warehouseId,
              status: 'CONFIRMED',
              lines: cmd.lines,
              totalAmountMinor: (cmd.lines || []).reduce(
                (acc, l) => acc + l.quantity * l.unitCostMinor,
                0,
              ),
              currency: cmd.currency || 'USD',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            this.orders.set(externalId, order);
            if (cmd.operationId) this.operationIndex.set(cmd.operationId, externalId);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(order));
          });
          return;
        }

        if (req.method === 'GET' && pathname.startsWith('/erp/purchase-orders/by-operation/')) {
          this.queryCount++;
          const operationId = decodeURIComponent(pathname.replace('/erp/purchase-orders/by-operation/', ''));
          const externalId = this.operationIndex.get(operationId);
          if (!externalId || !this.orders.has(externalId)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Order not found for operation' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.orders.get(externalId)));
          return;
        }

        if (req.method === 'GET' && pathname.startsWith('/erp/purchase-orders/')) {
          const externalId = decodeURIComponent(pathname.replace('/erp/purchase-orders/', ''));
          const order = this.orders.get(externalId);
          if (!order) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Order not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(order));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  seedExistingOrder(operationId: string, externalId: string, supplierId: string, lines: any[] = []) {
    const order: ErpPurchaseOrder = {
      externalId,
      operationId,
      idempotencyKey: `idemp-${operationId}`,
      supplierId,
      status: 'CONFIRMED',
      lines,
      totalAmountMinor: lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitCostMinor || 0), 0),
      currency: 'USD',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(externalId, order);
    this.operationIndex.set(operationId, externalId);
    return order;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        if (typeof (this.server as any).closeAllConnections === 'function') {
          (this.server as any).closeAllConnections();
        }
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

describe('Batch D: End-to-End Alignment on Procurement Recovery & Truthfulness', () => {
  let prisma: PrismaClient;
  let erpServer: BatchDErpServer;
  let erpBaseUrl: string;
  let automationService: PurchaseAutomationService;
  let actionLayerService: ActionLayerService;
  let wsId: string;
  let supplierId: string;
  let skuId: string;
  let productId: string;
  const userId = 'buyer-batch-d';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();

    erpServer = new BatchDErpServer();
    erpBaseUrl = await erpServer.start();

    const intelMock = {} as unknown as IntelligenceService;
    const adMock = {} as unknown as AdvertisingService;
    actionLayerService = new ActionLayerService(prisma as any, intelMock, adMock);
    automationService = new PurchaseAutomationService(prisma as any);

    const unique = Date.now();
    wsId = `ws-batch-d-${unique}`;
    await prisma.workspace.create({
      data: {
        id: wsId,
        name: `Batch D Alignment WS ${unique}`,
        slug: `slug-${wsId}`,
      },
    });

    // Create supplier
    supplierId = `sup-batch-d-${unique}`;
    await prisma.supplier.create({
      data: {
        id: supplierId,
        workspaceId: wsId,
        name: 'Batch D Verified Supplier Ltd',
      },
    });

    // Create product & SKU for local PO sync
    let mp = await prisma.marketplace.findFirst();
    if (!mp) {
      mp = await prisma.marketplace.create({
        data: {
          id: `mp-d-${unique}`,
          code: `US-D-${unique}`,
          name: 'Amazon US Batch D',
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
        name: 'Batch D Smart Widget',
        brand: 'WidgetCo',
        category: 'Electronics',
      },
    });
    productId = product.id;

    skuId = `sku-batch-d-${unique}`;
    await prisma.sku.create({
      data: {
        id: skuId,
        workspaceId: wsId,
        productId: product.id,
        skuCode: `SKU-D-${unique}`,
        variantName: 'Black 64GB',
        sellingPrice: 79.99,
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
        await prisma.sku.deleteMany({ where: { workspaceId: wsId } });
        await prisma.product.deleteMany({ where: { workspaceId: wsId } });
        await prisma.supplier.deleteMany({ where: { workspaceId: wsId } });
        await prisma.workspace.deleteMany({ where: { id: wsId } });
      } catch {
        // ignore cleanup error
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('1. Failure Reproduction: Injects ERP network/timeout fault -> records UNKNOWN/QUERY without permanent FAILED', async () => {
    // 1. Generate replenishment proposal with target pointing to loopback ERP
    const proposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId,
      supplierId,
      fulfillableQuantity: 20,
      inboundQuantity: 0,
      avgDailySales: 15,
      leadTimeDays: 4,
      safetyStockDays: 2,
      targetDaysCover: 7,
      unitCostMinor: 3500,
      erpBaseUrl,
    });

    expect(proposal.proposed).toBe(true);
    const actionId = proposal.actionId!;

    // Verify proposal has human approval required and high risk
    const proposalAction = await prisma.plannedAction.findUnique({ where: { id: actionId } });
    expect(proposalAction?.status).toBe('WAITING_APPROVAL');
    expect(proposalAction?.riskLevel).toBe('high');
    expect(proposalAction?.needApproval).toBe(true);

    // 2. Approve action
    await actionLayerService.approve(wsId, actionId, userId);
    const approvedAction = await prisma.plannedAction.findUnique({ where: { id: actionId } });
    expect(approvedAction?.status).toBe('APPROVED');

    // 3. Inject fault on loopback ERP: drop TCP connection immediately upon POST
    erpServer.shouldDropCreateConnection = true;

    // 4. Execute action
    const executed = await actionLayerService.execute(wsId, actionId, userId);

    // RESTORE normal server behavior
    erpServer.shouldDropCreateConnection = false;

    // 5. CRITICAL ASSERTION: Action MUST NOT be marked permanent FAILED!
    // It must remain in EXECUTING with QUERY recovery queue instructions
    expect(executed.status).toBe('EXECUTING');
    expect(executed.lastMessage).toContain('ERP 采购单提交超时，远端状态未知，已置入 QUERY 恢复队列等待 Worker 自愈');

    // 6. Verify evidence structure attached to PlannedAction
    const params = executed.parameters as any;
    expect(params._evidence).toBeDefined();
    expect(params._evidence.phase).toBe('SUBMITTED');
    expect(params._evidence.effect).toBe('UNKNOWN');
    expect(params._evidence.recovery).toBe('QUERY');
    expect(params._evidence.provider).toBe('simulator-erp');
    expect(params._evidence.operationId).toBeDefined();

    // 7. Verify corresponding AutomationOperation record in PG DB
    const op = await prisma.automationOperation.findUnique({
      where: { id: params._evidence.operationId },
    });
    expect(op).toBeDefined();
    expect(op?.phase).toBe('SUBMITTED');
    expect(op?.effect).toBe('UNKNOWN');
    expect(op?.recovery).toBe('QUERY');
    expect(op?.actionId).toBe(actionId);
    expect(op?.leaseOwner).toBeNull(); // Lease released so recovery worker can claim
  });

  it('2. Worker Convergence (Case 1): Remote order pre-exists -> Worker queries, verifies, and converges to COMPLETED / APPLIED', async () => {
    // Find the operation from Test 1 stuck in SUBMITTED
    const pendingOp = await prisma.automationOperation.findFirst({
      where: { workspaceId: wsId, phase: 'SUBMITTED', recovery: 'QUERY' },
      orderBy: { createdAt: 'desc' },
    });
    expect(pendingOp).toBeDefined();

    // Seed loopback ERP to simulate: the remote ERP actually received the order before connection dropped
    const pendingAction = await prisma.plannedAction.findUnique({ where: { id: pendingOp!.actionId! } });
    const localLines = (pendingAction?.parameters as any)?.lines || [];
    const remoteExternalId = `ERP-PO-RECOV-EXISTS-${Date.now()}`;
    erpServer.seedExistingOrder(pendingOp!.id, remoteExternalId, supplierId, localLines);

    // Run recovery worker sweep
    const recoveryResult = await processAutomationRecovery(prisma, {
      workerId: 'batch-d-worker-healer',
      erpBaseUrl,
    });

    expect(recoveryResult.recovered).toBeGreaterThanOrEqual(1);

    // Verify AutomationOperation converged to COMPLETED / APPLIED
    const healedOp = await prisma.automationOperation.findUnique({
      where: { id: pendingOp!.id },
    });
    expect(healedOp?.phase).toBe('COMPLETED');
    expect(healedOp?.effect).toBe('APPLIED');
    expect(healedOp?.recovery).toBe('NONE');
    expect(healedOp?.externalId).toBe(remoteExternalId);
    expect(healedOp?.leaseOwner).toBeNull();

    // Verify PlannedAction converged to SUCCESS
    const healedAction = await prisma.plannedAction.findUnique({
      where: { id: pendingOp!.actionId! },
    });
    expect(healedAction?.status).toBe('SUCCESS');
    expect(healedAction?.lastMessage).toContain('ERP 采购单恢复成功 (远程已存在)');

    const healedEvidence = (healedAction?.parameters as any)?._evidence;
    expect(healedEvidence).toBeDefined();
    expect(healedEvidence.phase).toBe('COMPLETED');
    expect(healedEvidence.effect).toBe('APPLIED');
    expect(healedEvidence.recovery).toBe('NONE');
    expect(healedEvidence.externalId).toBe(remoteExternalId);
    expect(healedEvidence.verifiedAt).toBeDefined();

    // Verify local PurchaseOrder was created and synced
    const localPo = await prisma.purchaseOrder.findFirst({
      where: { workspaceId: wsId, poNumber: remoteExternalId },
      include: { items: true },
    });
    expect(localPo).toBeDefined();
    expect(localPo?.supplierId).toBe(supplierId);
    expect(localPo?.status).toBe('CONFIRMED');
    expect(localPo?.items.length).toBeGreaterThanOrEqual(1);
    expect(localPo?.items[0].skuId).toBe(skuId);
  });

  it('3. Worker Convergence (Case 2): Remote order confirmed NOT_FOUND -> transitions to READY/RETRY -> recreates order to COMPLETED / APPLIED', async () => {
    // Dedicated SKU & Supplier for Case 2
    const uniqueCase2 = Date.now();
    const supCase2 = await prisma.supplier.create({
      data: {
        id: `sup-case2-${uniqueCase2}`,
        workspaceId: wsId,
        name: 'Case 2 Dedicated Supplier',
      },
    });

    const skuCase2 = await prisma.sku.create({
      data: {
        id: `sku-case2-${uniqueCase2}`,
        workspaceId: wsId,
        productId,
        skuCode: `SKU-CASE2-${uniqueCase2}`,
        variantName: 'Blue 128GB',
        sellingPrice: 99.99,
      },
    });

    // 1. Propose and approve via standard approval pipeline to guarantee full approval metadata
    const proposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId: skuCase2.id,
      supplierId: supCase2.id,
      fulfillableQuantity: 10,
      inboundQuantity: 0,
      avgDailySales: 12,
      leadTimeDays: 3,
      safetyStockDays: 2,
      targetDaysCover: 6,
      unitCostMinor: 4000,
      erpBaseUrl,
    });
    expect(proposal.proposed).toBe(true);
    const actionId = proposal.actionId!;

    await actionLayerService.approve(wsId, actionId, userId);

    // 2. Inject fault: drop connection so it enters SUBMITTED / UNKNOWN / QUERY
    erpServer.shouldDropCreateConnection = true;
    const executed = await actionLayerService.execute(wsId, actionId, userId);
    erpServer.shouldDropCreateConnection = false;
    expect(executed.status).toBe('EXECUTING');

    // Verify operation is now in SUBMITTED
    const op = await prisma.automationOperation.findFirst({
      where: { actionId },
    });
    expect(op).toBeDefined();
    expect(op?.phase).toBe('SUBMITTED');
    expect(op?.recovery).toBe('QUERY');

    // 3. In this scenario, remote ERP DOES NOT have the order (returns 404 NOT_FOUND on query)
    // Run recovery worker Pass 1: query detects NOT_FOUND -> transitions to READY / RETRY
    const pass1Result = await processAutomationRecovery(prisma, {
      workerId: 'batch-d-worker-pass1',
      erpBaseUrl,
    });
    expect(pass1Result.retried).toBeGreaterThanOrEqual(1);

    const opAfterPass1 = await prisma.automationOperation.findUnique({
      where: { id: op!.id },
    });
    expect(opAfterPass1?.phase).toBe('READY');
    expect(opAfterPass1?.recovery).toBe('RETRY');
    expect(opAfterPass1?.effect).toBe('NOT_APPLIED');
    expect(opAfterPass1?.leaseOwner).toBeNull();

    // Reset nextAttemptAt to immediate and attemptCount to 1 so pass 2 can execute retry
    await prisma.automationOperation.update({
      where: { id: op!.id },
      data: {
        nextAttemptAt: new Date(Date.now() - 1000),
        attemptCount: 1,
      },
    });

    // 4. Run recovery worker Pass 2: executes retry createPurchaseOrder on loopback ERP
    const pass2Result = await processAutomationRecovery(prisma, {
      workerId: 'batch-d-worker-pass2',
      erpBaseUrl,
    });
    expect(pass2Result.recovered).toBeGreaterThanOrEqual(1);

    // Verify operation converged to COMPLETED / APPLIED
    const opAfterPass2 = await prisma.automationOperation.findUnique({
      where: { id: op!.id },
    });
    expect(opAfterPass2?.phase).toBe('COMPLETED');
    expect(opAfterPass2?.effect).toBe('APPLIED');
    expect(opAfterPass2?.recovery).toBe('NONE');
    expect(opAfterPass2?.externalId).toBeDefined();

    // Verify PlannedAction converged to SUCCESS
    const actionAfterPass2 = await prisma.plannedAction.findUnique({
      where: { id: actionId },
    });
    expect(actionAfterPass2?.status).toBe('SUCCESS');
    expect(actionAfterPass2?.lastMessage).toContain('ERP 采购单重试成功');

    // Verify local PurchaseOrder synced
    const localPo = await prisma.purchaseOrder.findFirst({
      where: { workspaceId: wsId, poNumber: opAfterPass2!.externalId! },
    });
    expect(localPo).toBeDefined();
    expect(localPo?.status).toBe('CONFIRMED');
    expect(localPo?.supplierId).toBe(supCase2.id);
  });

  it('4. Adversarial & Idempotency: Remote exists never causes duplicate order creation', async () => {
    // Record current POST count
    const postCountBefore = erpServer.postCreateCount;

    // Create an operation that is in SUBMITTED state
    const opId = `op-idemp-test-${Date.now()}`;
    const remoteId = `ERP-PO-IDEMP-${Date.now()}`;

    // Seed existing order on loopback ERP
    erpServer.seedExistingOrder(opId, remoteId, supplierId, [
      { skuId, quantity: 10, unitCostMinor: 3500 },
    ]);

    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'EXECUTING',
        target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId, lines: [{ skuId, quantity: 10, unitCostMinor: 3500 }] },
      },
    });

    await prisma.automationOperation.create({
      data: {
        id: opId,
        workspaceId: wsId,
        actionId: action.id,
        connectionId: 'conn-idemp',
        operationKind: 'CREATE_PURCHASE_ORDER',
        idempotencyKey: `idemp-key-${opId}`,
        payloadHash: 'hash-idemp',
        mode: 'SIMULATOR',
        provider: 'simulator-erp',
        phase: 'SUBMITTED',
        effect: 'UNKNOWN',
        recovery: 'QUERY',
        version: 1,
      },
    });

    // Run recovery
    await processAutomationRecovery(prisma, {
      workerId: 'batch-d-worker-idemp',
      erpBaseUrl,
    });

    // CRITICAL: ERP POST count MUST NOT have increased! (Zero duplicate orders created)
    const postCountAfter = erpServer.postCreateCount;
    expect(postCountAfter).toBe(postCountBefore);

    // Verify exact 1 local PO in DB
    const localPos = await prisma.purchaseOrder.findMany({
      where: { workspaceId: wsId, poNumber: remoteId },
    });
    expect(localPos.length).toBe(1);
  });

  it('5. Anti-Tamper & Guard: CREATE_PURCHASE_ORDER requires human approval and rejects unapproved execution', async () => {
    const uniqueGuard = Date.now();
    const supGuard = await prisma.supplier.create({
      data: {
        id: `sup-guard-${uniqueGuard}`,
        workspaceId: wsId,
        name: 'Guard Supplier Verification',
      },
    });

    const skuGuard = await prisma.sku.create({
      data: {
        id: `sku-guard-${uniqueGuard}`,
        workspaceId: wsId,
        productId,
        skuCode: `SKU-GUARD-${uniqueGuard}`,
        variantName: 'Red 256GB',
        sellingPrice: 129.99,
      },
    });

    const unapprovedAction = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId,
        actionType: 'CREATE_PURCHASE_ORDER',
        riskLevel: 'high',
        needApproval: true,
        status: 'WAITING_APPROVAL',
        target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId: supGuard.id, lines: [] },
      },
    });

    // Unapproved action execution MUST throw
    await expect(
      actionLayerService.execute(wsId, unapprovedAction.id, userId),
    ).rejects.toThrow(/only APPROVED actions can execute/);

    // Verify proposal generation enforces needApproval: true and riskLevel: 'high'
    const proposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId: skuGuard.id,
      supplierId: supGuard.id,
      fulfillableQuantity: 10,
      inboundQuantity: 0,
      avgDailySales: 20,
      leadTimeDays: 3,
      safetyStockDays: 2,
      targetDaysCover: 5,
      unitCostMinor: 2000,
      erpBaseUrl,
    });

    expect(proposal.proposed).toBe(true);
    const generated = await prisma.plannedAction.findUnique({
      where: { id: proposal.actionId },
    });
    expect(generated?.needApproval).toBe(true);
    expect(generated?.riskLevel).toBe('high');
    expect(generated?.status).toBe('WAITING_APPROVAL');
  });

  it('6. Frontend ActionDetailDrawer Evidence Contract Compatibility', () => {
    // Simulate what ActionDetailDrawer renders from action evidence
    const simulateDrawerRender = (action: any) => {
      const exec = action.executionEvidence || action.parameters?._evidence || action.metadata?.executionEvidence;
      if (!exec) return null;

      const isNeedsAttention = exec.phase === 'NEEDS_ATTENTION';
      const badgeMode = `${exec.mode || '未知'} / ${exec.provider || '未知'}`;
      const phase = exec.phase;
      const effect = exec.effect;
      const externalId = exec.externalId || null;
      const verifiedAt = exec.verifiedAt || null;
      const recovery = exec.recovery || null;

      return {
        hasEvidence: true,
        isNeedsAttention,
        badgeMode,
        phase,
        effect,
        externalId,
        verifiedAt,
        recovery,
      };
    };

    // 1. Timeout intermediate evidence
    const timeoutAction = {
      parameters: {
        _evidence: {
          mode: 'SIMULATOR',
          provider: 'simulator-erp',
          phase: 'SUBMITTED',
          effect: 'UNKNOWN',
          recovery: 'QUERY',
          errorCode: 'TIMEOUT',
        },
      },
    };
    const timeoutRender = simulateDrawerRender(timeoutAction);
    expect(timeoutRender).not.toBeNull();
    expect(timeoutRender?.phase).toBe('SUBMITTED');
    expect(timeoutRender?.effect).toBe('UNKNOWN');
    expect(timeoutRender?.recovery).toBe('QUERY');
    expect(timeoutRender?.badgeMode).toBe('SIMULATOR / simulator-erp');
    expect(timeoutRender?.externalId).toBeNull();

    // 2. Converged terminal evidence
    const convergedAction = {
      parameters: {
        _evidence: {
          mode: 'SIMULATOR',
          provider: 'simulator-erp',
          phase: 'COMPLETED',
          effect: 'APPLIED',
          recovery: 'NONE',
          externalId: 'ERP-PO-999',
          verifiedAt: '2026-09-14T20:00:00.000Z',
        },
      },
    };
    const convergedRender = simulateDrawerRender(convergedAction);
    expect(convergedRender).not.toBeNull();
    expect(convergedRender?.phase).toBe('COMPLETED');
    expect(convergedRender?.effect).toBe('APPLIED');
    expect(convergedRender?.recovery).toBe('NONE');
    expect(convergedRender?.externalId).toBe('ERP-PO-999');
    expect(convergedRender?.verifiedAt).toBe('2026-09-14T20:00:00.000Z');

    // 3. Escalated NEEDS_ATTENTION evidence
    const escalatedAction = {
      parameters: {
        _evidence: {
          mode: 'SIMULATOR',
          provider: 'simulator-erp',
          phase: 'NEEDS_ATTENTION',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: 'MAX_RETRIES_EXCEEDED',
        },
      },
    };
    const escalatedRender = simulateDrawerRender(escalatedAction);
    expect(escalatedRender).not.toBeNull();
    expect(escalatedRender?.isNeedsAttention).toBe(true);
    expect(escalatedRender?.phase).toBe('NEEDS_ATTENTION');
    expect(escalatedRender?.recovery).toBe('MANUAL');
  });
});
