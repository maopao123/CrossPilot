import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { V2RunStore } from '@crosspilot/db';
import { V2Sku360DataSource } from '../src/modules/commerce-store/v2-sku360-data-source.js';

describe('CL-3: Closed-loop v2 Scoped Diagnosis & Information Isolation', () => {
  const CONTROL_WS_ID = 'ws_control_owner';
  const OWNER_USER_ID = 'user_owner';

  let v2Store: V2RunStore;
  let dataSource: V2Sku360DataSource;
  let mockPrisma: any;

  // In-memory data store
  let simulationRuns: Map<string, any>;
  let channelDailyMetrics: any[];
  let adMetricDailyRows: any[];
  let inventoryBalances: any[];
  let profitDailyRows: any[];
  let simulationEvents: any[];
  let skus: Map<string, any>;
  let stores: Map<string, any>;
  let campaigns: Map<string, any>;
  let workspaces: Map<string, any>;

  beforeEach(async () => {
    simulationRuns = new Map();
    channelDailyMetrics = [];
    adMetricDailyRows = [];
    inventoryBalances = [];
    profitDailyRows = [];
    simulationEvents = [];
    skus = new Map();
    stores = new Map();
    campaigns = new Map();
    workspaces = new Map();

    workspaces.set(CONTROL_WS_ID, {
      id: CONTROL_WS_ID,
      name: 'Control Workspace',
      defaultMarketplaceId: 'mkt_us',
    });

    mockPrisma = {
      workspace: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(workspaces.get(where.id) ?? null)),
        create: jest.fn(({ data }: any) => {
          const ws = { id: data.id ?? `ws_${Date.now()}`, ...data };
          workspaces.set(ws.id, ws);
          return Promise.resolve(ws);
        }),
      },
      workspaceMember: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: `mem_${Date.now()}`, ...data })),
        findFirst: jest.fn().mockResolvedValue({ id: 'mem_1', role: 'OWNER' }),
      },
      store: {
        create: jest.fn(({ data }: any) => {
          const s = { id: data.id ?? `store_${Date.now()}`, ...data };
          stores.set(s.id, s);
          return Promise.resolve(s);
        }),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(stores.get(where.id) ?? null)),
      },
      commerceAccount: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: `acct_${data.provider}`, ...data })),
      },
      product: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: data.id ?? `prod_${Date.now()}`, ...data })),
      },
      sku: {
        create: jest.fn(({ data }: any) => {
          const sku = { id: data.id ?? `sku_${Date.now()}_${Math.random()}`, ...data };
          skus.set(sku.id, sku);
          return Promise.resolve(sku);
        }),
        findFirst: jest.fn(({ where }: any) => {
          const list = Array.from(skus.values()).filter((s) => {
            if (where.workspaceId && s.workspaceId !== where.workspaceId) return false;
            if (where.id && s.id !== where.id) return false;
            if (where.skuCode && s.skuCode !== where.skuCode) return false;
            return true;
          });
          return Promise.resolve(list[0] ?? null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaign: {
        create: jest.fn(({ data }: any) => {
          const c = { id: data.id ?? `camp_${Date.now()}_${Math.random()}`, ...data };
          campaigns.set(c.id, c);
          return Promise.resolve(c);
        }),
      },
      simulationRun: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(simulationRuns.get(where.id) ?? null)),
        findFirst: jest.fn(({ where }: any) => {
          const list = Array.from(simulationRuns.values()).filter((r) => {
            if (where.id && r.id !== where.id) return false;
            if (where.runWorkspaceId && r.runWorkspaceId !== where.runWorkspaceId) return false;
            return true;
          });
          return Promise.resolve(list[0] ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const run = { id: data.id ?? `run_${Date.now()}`, ...data };
          simulationRuns.set(run.id, run);
          return Promise.resolve(run);
        }),
        update: jest.fn(({ where, data }: any) => {
          const run = simulationRuns.get(where.id);
          if (!run) return Promise.resolve(null);
          Object.assign(run, data);
          return Promise.resolve(run);
        }),
      },
      channelDailyMetric: {
        findMany: jest.fn(({ where }: any) => {
          return Promise.resolve(
            channelDailyMetrics.filter((m) => {
              if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
              if (where.skuId && m.skuId !== where.skuId) return false;
              return true;
            }),
          );
        }),
      },
      adMetricDaily: {
        findMany: jest.fn(({ where }: any) => {
          return Promise.resolve(
            adMetricDailyRows.filter((a) => {
              if (where.skuId && a.skuId !== where.skuId) return false;
              return true;
            }),
          );
        }),
      },
      inventoryBalance: {
        findFirst: jest.fn(({ where }: any) => {
          return Promise.resolve(
            inventoryBalances.find((b) => b.workspaceId === where.workspaceId && b.skuId === where.skuId) ?? null,
          );
        }),
      },
      profitDaily: {
        findMany: jest.fn(({ where }: any) => {
          return Promise.resolve(
            profitDailyRows.filter((p) => p.workspaceId === where.workspaceId),
          );
        }),
      },
      simulationEvent: {
        findMany: jest.fn().mockResolvedValue(simulationEvents),
      },
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
    };

    v2Store = new V2RunStore(mockPrisma);
    dataSource = new V2Sku360DataSource(mockPrisma);
  });

  it('reads Sku360 data strictly scoped to runWorkspaceId without cross-workspace contamination', async () => {
    // 1. Create two isolated runs
    const run1 = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S01' });
    const run2 = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S02' });

    // 2. Add metrics to run 1 only
    channelDailyMetrics.push({
      workspaceId: run1.runWorkspaceId,
      skuId: 'sku_white_run1',
      metricDate: new Date('2026-09-01'),
      sessions: 150,
      orders: 15,
      revenue: 450,
    });

    // 3. Query Sku360 sales for run 1 vs run 2
    const salesRun1 = await dataSource.getSales({
      workspaceId: run1.runWorkspaceId,
      skuId: 'sku_white_run1',
      currentPeriod: { from: '2026-09-01', to: '2026-09-07' },
    });
    expect(salesRun1.availability).toBe('AVAILABLE');
    expect(salesRun1.data.current.ordersCount).toBe(15);
    expect(salesRun1.data.current.revenue).toBe(450);

    const salesRun2 = await dataSource.getSales({
      workspaceId: run2.runWorkspaceId,
      skuId: 'sku_white_run2',
      currentPeriod: { from: '2026-09-01', to: '2026-09-07' },
    });
    expect(salesRun2.data.current.revenue).toBe(0);
  });

  it('information isolation: does not leak hidden simulation event types or internal codes to Sku360 context', async () => {
    const run = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);

    // Inject hidden event in simulationEvents table
    simulationEvents.push({
      workspaceId: run.runWorkspaceId,
      code: 'INTERNAL_SUPPLIER_QUALITY_DEFECT',
      severity: 'CRITICAL',
      title: 'Secret root cause',
      description: 'Hidden supplier batch defect not visible to seller yet',
    });

    // Data source must not return this secret code in diagnostic signals
    const reviews = await dataSource.getReviews({
      workspaceId: run.runWorkspaceId,
      skuId: 'sku_test',
      currentPeriod: { from: '2026-09-01', to: '2026-09-07' },
    });

    expect(JSON.stringify(reviews)).not.toContain('INTERNAL_SUPPLIER_QUALITY_DEFECT');
    expect(JSON.stringify(reviews)).not.toContain('Secret root cause');
  });
});
