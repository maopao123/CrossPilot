/**
 * 统筹对抗探针 Batch D R2（review-kimi）—— D-R1 修复后再对抗
 * P-7 NEEDS_ATTENTION 稳定性：置人工态后两轮 worker 扫描不得改写/回弹/重复建单
 * P-8 分单位边界：远端金额差 1 个最小单位必须拦截（严格相等无容差）
 * P-9 内容全一致对照：正常收敛 COMPLETED/APPLIED（证明非一刀切拦截）
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import { processAutomationRecovery } from '../../worker/src/processors/automation-recovery.processor';
import type { ErpPurchaseOrder } from '@crosspilot/shared';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

class R2ErpServer {
  private server: http.Server | null = null;
  public orders: Map<string, ErpPurchaseOrder> = new Map();
  public operationIndex: Map<string, string> = new Map();
  public postCreateCount = 0;
  public queryCount = 0;

  async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        if (req.method === 'POST' && pathname === '/erp/purchase-orders') {
          this.postCreateCount++;
          res.writeHead(201, { 'Content-Type': 'application/json' }).end('{}');
          return;
        }
        if (req.method === 'GET' && pathname.startsWith('/erp/purchase-orders/by-operation/')) {
          this.queryCount++;
          const operationId = decodeURIComponent(pathname.replace('/erp/purchase-orders/by-operation/', ''));
          const externalId = this.operationIndex.get(operationId);
          if (!externalId || !this.orders.has(externalId)) {
            res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'NOT_FOUND' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(this.orders.get(externalId)));
          return;
        }
        res.writeHead(404).end('{}');
      });
      this.server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`);
      });
    });
  }

  seedOrder(operationId: string, externalId: string, supplierId: string, totalAmountMinor: number, lines: any[]) {
    this.orders.set(externalId, {
      externalId, operationId, idempotencyKey: `idemp-${operationId}`,
      supplierId, status: 'CONFIRMED', lines, totalAmountMinor,
      currency: 'USD', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as ErpPurchaseOrder);
    this.operationIndex.set(operationId, externalId);
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) { (this.server as any).closeAllConnections?.(); this.server.close(() => resolve()); }
      else resolve();
    });
  }
}

describe('Review Batch D R2: post-fix adversarial variants (real PG + loopback ERP)', () => {
  let prisma: PrismaClient;
  let erp: R2ErpServer;
  let erpBaseUrl: string;
  let wsId: string;
  let supplierId: string;
  let skuId: string;

  const setupMismatchCase = async (tag: string, remote: { supplierId: string; totalAmountMinor: number; lines: any[] }) => {
    const action = await prisma.plannedAction.create({
      data: {
        workspaceId: wsId, actionType: 'CREATE_PURCHASE_ORDER', riskLevel: 'high',
        needApproval: true, status: 'EXECUTING', target: { mode: 'SIMULATOR', erpBaseUrl },
        parameters: { supplierId, lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }] },
      },
    });
    const op = await prisma.automationOperation.create({
      data: {
        workspaceId: wsId, actionId: action.id, connectionId: 'conn-review-d-r2',
        operationKind: 'CREATE_PURCHASE_ORDER', idempotencyKey: `idemp-${tag}-${Date.now()}`,
        payloadHash: `hash-${tag}`, mode: 'SIMULATOR', provider: 'simulator-erp',
        phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY', version: 1,
        leaseOwner: 'crashed-worker', leaseUntil: new Date(Date.now() - 30000),
      },
    });
    erp.seedOrder(op.id, `ERP-PO-${tag.toUpperCase()}`, remote.supplierId, remote.totalAmountMinor, remote.lines);
    return { action, op };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    erp = new R2ErpServer();
    erpBaseUrl = await erp.start();
    const unique = Date.now();
    wsId = `ws-review-d-r2-${unique}`;
    await prisma.workspace.create({ data: { id: wsId, name: wsId, slug: `slug-${wsId}` } });
    supplierId = `sup-review-d-r2-${unique}`;
    await prisma.supplier.create({ data: { id: supplierId, workspaceId: wsId, name: 'R2 Supplier' } });
    let mp = await prisma.marketplace.findFirst();
    if (!mp) {
      mp = await prisma.marketplace.create({
        data: { id: `mp-r2-${unique}`, code: `US-R2-${unique}`, name: 'US', countryCode: 'US',
          currencyCode: 'USD', languageCode: 'en', timezone: 'America/New_York' },
      });
    }
    const product = await prisma.product.create({
      data: { workspaceId: wsId, marketplaceId: mp.id, name: 'R2 Widget', brand: 'B', category: 'C' },
    });
    skuId = `sku-review-d-r2-${unique}`;
    await prisma.sku.create({
      data: { id: skuId, workspaceId: wsId, productId: product.id, skuCode: `SKU-R2-${unique}`,
        variantName: 'V', sellingPrice: 10 },
    });
  });

  afterAll(async () => {
    await erp.stop();
    if (prisma) {
      try {
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

  it('P-7: NEEDS_ATTENTION 稳定性 —— 两轮后续扫描不改写、不回弹、不重复建单', async () => {
    const { action, op } = await setupMismatchCase('p7', {
      supplierId: 'SUP-WRONG', totalAmountMinor: 5000,
      lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }],
    });
    await processAutomationRecovery(prisma, { workerId: 'r2-p7-first', erpBaseUrl });
    const afterFirst = await prisma.automationOperation.findUnique({ where: { id: op.id } });
    expect(afterFirst?.phase).toBe('NEEDS_ATTENTION');
    expect(afterFirst?.recovery).toBe('MANUAL');

    const queriesBefore = erp.queryCount;
    const postsBefore = erp.postCreateCount;
    await processAutomationRecovery(prisma, { workerId: 'r2-p7-second', erpBaseUrl });
    await processAutomationRecovery(prisma, { workerId: 'r2-p7-third', erpBaseUrl });

    const afterMore = await prisma.automationOperation.findUnique({ where: { id: op.id } });
    expect(afterMore?.phase).toBe('NEEDS_ATTENTION'); // 不回弹
    expect(afterMore?.effect).toBe('NOT_APPLIED');
    expect(erp.queryCount).toBe(queriesBefore); // 不再被 listDue 扫到
    expect(erp.postCreateCount).toBe(postsBefore); // 零建单
    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    expect(finalAction?.status).toBe('FAILED');
  });

  it('P-8: 分单位边界 —— 远端金额差 1 个最小单位必须拦截', async () => {
    // 本地 5 x 1000 = 5000 分；远端 5001 分，供应商与数量一致
    const { action, op } = await setupMismatchCase('p8', {
      supplierId, totalAmountMinor: 5001,
      lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }],
    });
    await processAutomationRecovery(prisma, { workerId: 'r2-p8', erpBaseUrl });
    const finalOp = await prisma.automationOperation.findUnique({ where: { id: op.id } });
    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    const evidence = (finalAction?.parameters as any)?._evidence;
    expect(finalOp?.phase).toBe('NEEDS_ATTENTION');
    expect(evidence?.errorCode).toBe('REMOTE_PAYLOAD_MISMATCH');
    expect(evidence?.effect).toBe('NOT_APPLIED');
    expect(finalAction?.status).toBe('FAILED');
  });

  it('P-9: 内容全一致对照 —— 正常收敛 COMPLETED/APPLIED（非一刀切拦截）', async () => {
    const { action, op } = await setupMismatchCase('p9', {
      supplierId, totalAmountMinor: 5000,
      lines: [{ skuId, quantity: 5, unitCostMinor: 1000 }],
    });
    await processAutomationRecovery(prisma, { workerId: 'r2-p9', erpBaseUrl });
    const finalOp = await prisma.automationOperation.findUnique({ where: { id: op.id } });
    const finalAction = await prisma.plannedAction.findUnique({ where: { id: action.id } });
    const evidence = (finalAction?.parameters as any)?._evidence;
    expect(finalOp?.phase).toBe('COMPLETED');
    expect(evidence?.effect).toBe('APPLIED');
    expect(finalAction?.status).toBe('SUCCESS');
    const po = await prisma.purchaseOrder.findFirst({ where: { workspaceId: wsId, poNumber: 'ERP-PO-P9' } });
    expect(po).not.toBeNull();
  });
});
