/**
 * 统筹对抗探针 Batch D（review-kimi）
 * P-1 真竞态：远端已落单但连接被切断（执行方 fixture 是"建单前断连"，未覆盖此场景）
 * P-2 双重恢复竞争：同一 UNKNOWN/QUERY 操作被两轮并发 worker 扫描
 * P-3 假收敛对抗：远端按 operationId 返回内容不符的单据，验证是否盲目采纳
 * 真实隔离 PG（crosspilot_test）+ Loopback HTTP fixture。
 */
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
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

class AdversarialErpServer {
  private server: http.Server | null = null;
  public port = 0;
  public orders: Map<string, ErpPurchaseOrder> = new Map();
  public operationIndex: Map<string, string> = new Map();
  public postCreateCount = 0;
  public queryCount = 0;
  /** true 时：先把单落库，再切断 socket 不回响应 —— 真"超时但已建单" */
  public dropAfterCreate = false;

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        if (req.method === 'POST' && pathname === '/erp/purchase-orders') {
          this.postCreateCount++;
          let buf = '';
          req.on('data', (c) => { buf += c; });
          req.on('end', () => {
            let cmd: ErpCreateCommand;
            try { cmd = JSON.parse(buf); } catch {
              res.writeHead(400).end('{}'); return;
            }
            const externalId = `ERP-PO-ADV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const order: ErpPurchaseOrder = {
              externalId,
              operationId: cmd.operationId,
              idempotencyKey: cmd.idempotencyKey,
              supplierId: cmd.supplierId,
              warehouseId: cmd.warehouseId,
              status: 'CONFIRMED',
              lines: cmd.lines,
              totalAmountMinor: (cmd.lines || []).reduce((a, l) => a + l.quantity * l.unitCostMinor, 0),
              currency: cmd.currency || 'USD',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            this.orders.set(externalId, order);
            if (cmd.operationId) this.operationIndex.set(cmd.operationId, externalId);
            if (this.dropAfterCreate) {
              // 单已落库，但响应永远到不了客户端
              req.socket.destroy();
              return;
            }
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
            res.end(JSON.stringify({ error: 'NOT_FOUND' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.orders.get(externalId)));
          return;
        }

        res.writeHead(404).end('{}');
      });
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server!.address() as AddressInfo).port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  seedOrder(operationId: string, externalId: string, supplierId: string, totalAmountMinor: number, lines: any[] = []) {
    const order: ErpPurchaseOrder = {
      externalId, operationId, idempotencyKey: `idemp-${operationId}`,
      supplierId, status: 'CONFIRMED', lines, totalAmountMinor,
      currency: 'USD', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as ErpPurchaseOrder;
    this.orders.set(externalId, order);
    this.operationIndex.set(operationId, externalId);
    return order;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        (this.server as any).closeAllConnections?.();
        this.server.close(() => resolve());
      } else resolve();
    });
  }
}

describe('Review Batch D: adversarial probes (real PG + loopback ERP)', () => {
  let prisma: PrismaClient;
  let erp: AdversarialErpServer;
  let erpBaseUrl: string;
  let automationService: PurchaseAutomationService;
  let actionLayerService: ActionLayerService;
  let wsId: string;
  let supplierId: string;
  let skuId: string;
  const userId = 'reviewer-batch-d';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    erp = new AdversarialErpServer();
    erpBaseUrl = await erp.start();
    actionLayerService = new ActionLayerService(prisma as any, {} as IntelligenceService, {} as AdvertisingService);
    automationService = new PurchaseAutomationService(prisma as any);

    const unique = Date.now();
    wsId = `ws-review-d-${unique}`;
    await prisma.workspace.create({ data: { id: wsId, name: wsId, slug: `slug-${wsId}` } });
    supplierId = `sup-review-d-${unique}`;
    await prisma.supplier.create({ data: { id: supplierId, workspaceId: wsId, name: 'Review D Supplier' } });
    let mp = await prisma.marketplace.findFirst();
    if (!mp) {
      mp = await prisma.marketplace.create({
        data: { id: `mp-rd-${unique}`, code: `US-RD-${unique}`, name: 'US', countryCode: 'US',
          currencyCode: 'USD', languageCode: 'en', timezone: 'America/New_York' },
      });
    }
    const product = await prisma.product.create({
      data: { workspaceId: wsId, marketplaceId: mp.id, name: 'Review D Widget', brand: 'B', category: 'C' },
    });
    skuId = `sku-review-d-${unique}`;
    await prisma.sku.create({
      data: { id: skuId, workspaceId: wsId, productId: product.id, skuCode: `SKU-RD-${unique}`,
        variantName: 'V', sellingPrice: 10 },
    });
  });

  afterAll(async () => {
    await erp.stop();
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
      } catch { /* ignore */ } finally { await prisma.$disconnect(); }
    }
  });

  it('P-1: 超时但远端已落单 —— worker 恢复后不重复 POST，收敛 COMPLETED/APPLIED，单号对齐', async () => {
    const proposal = await automationService.generateReplenishmentProposal(wsId, {
      skuId, supplierId, fulfillableQuantity: 20, inboundQuantity: 0, avgDailySales: 15,
      leadTimeDays: 4, safetyStockDays: 2, targetDaysCover: 7, unitCostMinor: 3500, erpBaseUrl,
    });
    expect(proposal.proposed).toBe(true);
    const actionId = proposal.actionId!;
    await actionLayerService.approve(wsId, actionId, userId);

    const postsBefore = erp.postCreateCount;
    erp.dropAfterCreate = true; // 远端落单后断连
    const executed = await actionLayerService.execute(wsId, actionId, userId);
    erp.dropAfterCreate = false;

    expect(executed.status).toBe('EXECUTING');
    expect((executed.parameters as any)._evidence.effect).toBe('UNKNOWN');
    expect(erp.postCreateCount).toBe(postsBefore + 1); // 远端确实已建单

    const rec = await processAutomationRecovery(prisma, { workerId: 'review-p1', erpBaseUrl });

    expect(erp.postCreateCount).toBe(postsBefore + 1); // 零重复 POST
    expect(rec.recovered).toBeGreaterThanOrEqual(1);
    const action = await prisma.plannedAction.findUnique({ where: { id: actionId } });
    expect(action?.status).toBe('SUCCESS');
    expect((action?.parameters as any)?._evidence?.phase).toBe('COMPLETED');
    expect((action?.parameters as any)?._evidence?.effect).toBe('APPLIED');
    const externalId = (action?.parameters as any)?._evidence?.externalId;
    const localPo = await prisma.purchaseOrder.findFirst({ where: { workspaceId: wsId, poNumber: externalId } });
    expect(localPo).not.toBeNull(); // 本地 PO 与远端单号对齐
  });

  it('P-2: 双重恢复并发扫描同一 UNKNOWN/QUERY 操作 —— 不重复建单、不竞态', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER', riskLevel: 'high',
        needApproval: true, status: 'EXECUTING', target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId, lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }] },
      },
    });
    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId, actionId: action.id, connectionId: 'conn-review-d',
        operationKind: 'CREATE_PURCHASE_ORDER', idempotencyKey: `idemp-p2-${Date.now()}`,
        payloadHash: 'hash-p2', mode: 'SIMULATOR', provider: 'simulator-erp',
        phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY', version: 1,
        leaseOwner: 'crashed-worker', leaseUntil: new Date(Date.now() - 30000),
      },
    });
    erp.seedOrder(op.id, 'ERP-PO-P2-RACE', supplierId, 5000,
      [{ skuId, quantity: 5, unitCostMinor: 1000 }]);

    const postsBefore = erp.postCreateCount;
    const [r1, r2] = await Promise.all([
      processAutomationRecovery(prisma, { workerId: 'review-p2-a', erpBaseUrl }),
      processAutomationRecovery(prisma, { workerId: 'review-p2-b', erpBaseUrl }),
    ]);

    expect(erp.postCreateCount).toBe(postsBefore); // QUERY 路径零建单
    expect(r1.failed + r2.failed).toBe(0);
    expect(r1.recovered + r2.recovered).toBe(1); // 恰好收敛一次
    const pos = await prisma.purchaseOrder.findMany({ where: { workspaceId: wsId, poNumber: 'ERP-PO-P2-RACE' } });
    expect(pos.length).toBe(1); // 本地单据不重复
    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    expect(finalAction?.status).toBe('SUCCESS');
  });

  it('P-3: 假收敛对抗 —— 远端按 operationId 返回内容不符单据，不得盲目采纳为 APPLIED', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER', riskLevel: 'high',
        needApproval: true, status: 'EXECUTING', target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId, lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }] },
      },
    });
    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId, actionId: action.id, connectionId: 'conn-review-d',
        operationKind: 'CREATE_PURCHASE_ORDER', idempotencyKey: `idemp-p3-${Date.now()}`,
        payloadHash: 'hash-p3', mode: 'SIMULATOR', provider: 'simulator-erp',
        phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY', version: 1,
        leaseOwner: 'crashed-worker', leaseUntil: new Date(Date.now() - 30000),
      },
    });
    // 远端返回的单据：supplier 与金额均与本地请求不符
    erp.seedOrder(op.id, 'ERP-PO-P3-MISMATCH', 'SUP-WRONG-SUPPLIER', 999999,
      [{ skuId: 'sku-not-ours', quantity: 999, unitCostMinor: 1000 }]);

    await processAutomationRecovery(prisma, { workerId: 'review-p3', erpBaseUrl });

    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    const evidence = (finalAction?.parameters as any)?._evidence;
    // 期望：识别内容不符，进入人工/冲突态；不得 SUCCESS+APPLIED
    expect({
      status: finalAction?.status,
      phase: evidence?.phase,
      effect: evidence?.effect,
    }).toEqual(expect.not.objectContaining({ status: 'SUCCESS', effect: 'APPLIED' }));
    expect(evidence?.phase).toBe('NEEDS_ATTENTION');
    expect(evidence?.recovery).toBe('MANUAL');
    expect(evidence?.errorCode).toBe('REMOTE_PAYLOAD_MISMATCH');
  });

  it('P-4: 假收敛对抗变体 A —— 金额完全一致但供应商不同，必须拦截并置 NEEDS_ATTENTION', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER', riskLevel: 'high',
        needApproval: true, status: 'EXECUTING', target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId, lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }] },
      },
    });
    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId, actionId: action.id, connectionId: 'conn-review-d',
        operationKind: 'CREATE_PURCHASE_ORDER', idempotencyKey: `idemp-p4-${Date.now()}`,
        payloadHash: 'hash-p4', mode: 'SIMULATOR', provider: 'simulator-erp',
        phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY', version: 1,
        leaseOwner: 'crashed-worker', leaseUntil: new Date(Date.now() - 30000),
      },
    });
    // 远端返回的单据：总金额同为 5000，但供应商为 SUP-DIFFERENT
    erp.seedOrder(op.id, 'ERP-PO-P4-SUP-DIFF', 'SUP-DIFFERENT', 5000,
      [{ skuId, quantity: 5, unitCostMinor: 1000 }]);

    await processAutomationRecovery(prisma, { workerId: 'review-p4', erpBaseUrl });

    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    const evidence = (finalAction?.parameters as any)?._evidence;
    expect(finalAction?.status).toBe('FAILED');
    expect(evidence?.phase).toBe('NEEDS_ATTENTION');
    expect(evidence?.effect).toBe('NOT_APPLIED');
    expect(evidence?.recovery).toBe('MANUAL');
    expect(evidence?.errorCode).toBe('REMOTE_PAYLOAD_MISMATCH');
    expect(finalAction?.lastMessage).toContain('反查内容与原始请求不符');
    expect(finalAction?.lastMessage).toContain('supplierId');
  });

  it('P-5: 假收敛对抗变体 B —— 供应商与总金额均一致但明细数量不一致，必须拦截并置 NEEDS_ATTENTION', async () => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER', riskLevel: 'high',
        needApproval: true, status: 'EXECUTING', target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId, lines: [{ skuId, quantity: 10, unitCostMinor: 500 }] }, // 本地: 10 件 @ 500 = 5000
      },
    });
    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId, actionId: action.id, connectionId: 'conn-review-d',
        operationKind: 'CREATE_PURCHASE_ORDER', idempotencyKey: `idemp-p5-${Date.now()}`,
        payloadHash: 'hash-p5', mode: 'SIMULATOR', provider: 'simulator-erp',
        phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY', version: 1,
        leaseOwner: 'crashed-worker', leaseUntil: new Date(Date.now() - 30000),
      },
    });
    // 远端单据：同一供应商，总金额同为 5000，但数量为 5 件 @ 1000
    erp.seedOrder(op.id, 'ERP-PO-P5-QTY-DIFF', supplierId, 5000,
      [{ skuId, quantity: 5, unitCostMinor: 1000 }]);

    await processAutomationRecovery(prisma, { workerId: 'review-p5', erpBaseUrl });

    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    const evidence = (finalAction?.parameters as any)?._evidence;
    expect(finalAction?.status).toBe('FAILED');
    expect(evidence?.phase).toBe('NEEDS_ATTENTION');
    expect(evidence?.effect).toBe('NOT_APPLIED');
    expect(evidence?.errorCode).toBe('REMOTE_PAYLOAD_MISMATCH');
    expect(finalAction?.lastMessage).toContain('totalQuantity');
  });

  it('P-6: 关联隐患防护 —— 本地 PurchaseOrder 同步失败绝不静默，必须落证据并置 NEEDS_ATTENTION', async () => {
    // 创建一个包含不存在供应商的 Action（模拟本地外键/数据损坏场景）
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER', riskLevel: 'high',
        needApproval: true, status: 'EXECUTING', target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId: 'NON-EXISTENT-SUPPLIER-LOCAL', lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }] },
      },
    });
    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId, actionId: action.id, connectionId: 'conn-review-d',
        operationKind: 'CREATE_PURCHASE_ORDER', idempotencyKey: `idemp-p6-${Date.now()}`,
        payloadHash: 'hash-p6', mode: 'SIMULATOR', provider: 'simulator-erp',
        phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY', version: 1,
        leaseOwner: 'crashed-worker', leaseUntil: new Date(Date.now() - 30000),
      },
    });
    // 远端单据完全吻合请求
    erp.seedOrder(op.id, 'ERP-PO-P6-SYNC-FAIL', 'NON-EXISTENT-SUPPLIER-LOCAL', 5000,
      [{ skuId, quantity: 5, unitCostMinor: 1000 }]);

    const result = await processAutomationRecovery(prisma, { workerId: 'review-p6', erpBaseUrl });
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    const evidence = (finalAction?.parameters as any)?._evidence;
    // 远端确实生效(APPLIED)，但本地单据同步失败，绝不可静默成功
    expect(finalAction?.status).toBe('FAILED');
    expect(evidence?.phase).toBe('NEEDS_ATTENTION');
    expect(evidence?.effect).toBe('APPLIED');
    expect(evidence?.recovery).toBe('MANUAL');
    expect(evidence?.errorCode).toBe('LOCAL_SYNC_FAILED');
    expect(evidence?.syncError).toContain('SUPPLIER_NOT_FOUND');
    expect(finalAction?.lastMessage).toContain('本地单据同步失败');
  });
});
