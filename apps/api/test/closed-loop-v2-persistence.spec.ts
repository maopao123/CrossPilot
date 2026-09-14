import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { SimulatorService } from '../src/modules/simulator/simulator.service.js';
import { SimulatorController } from '../src/modules/simulator/simulator.controller.js';
import { SimulatorPersistenceService } from '../src/modules/simulator/simulator.persistence.js';
import { V2RunStore } from '@crosspilot/db';

describe('CL-1: Closed-loop v2 Persistence & Atomic Tick', () => {
  const CONTROL_WS_ID = 'ws_control_owner';
  const OWNER_USER_ID = 'user_owner';

  let controller: SimulatorController;
  let service: SimulatorService;
  let v2Store: V2RunStore;
  let mockPrisma: any;

  // In-memory tables
  let simulationRuns: Map<string, any>;
  let simulationTicks: Map<string, any>;
  let ledgerEntries: any[];
  let profitDailyRows: any[];
  let channelMetrics: any[];
  let adMetrics: any[];
  let inventorySnapshots: any[];
  let inventoryBalances: Map<string, any>;
  let workspaces: Map<string, any>;
  let stores: Map<string, any>;
  let skus: Map<string, any>;
  let campaigns: Map<string, any>;

  beforeEach(async () => {
    simulationRuns = new Map();
    simulationTicks = new Map();
    ledgerEntries = [];
    profitDailyRows = [];
    channelMetrics = [];
    adMetrics = [];
    inventorySnapshots = [];
    inventoryBalances = new Map();
    workspaces = new Map();
    stores = new Map();
    skus = new Map();
    campaigns = new Map();

    workspaces.set(CONTROL_WS_ID, {
      id: CONTROL_WS_ID,
      name: 'Control Workspace',
      defaultMarketplaceId: 'mkt_us',
    });

    mockPrisma = {
      workspace: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(workspaces.get(where.id) ?? null)),
        create: jest.fn(({ data }: any) => {
          const ws = { id: data.id ?? `ws_run_${Date.now()}`, ...data };
          workspaces.set(ws.id, ws);
          return Promise.resolve(ws);
        }),
      },
      workspaceMember: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: `mem_${Date.now()}`, ...data })),
        findFirst: jest.fn(({ where }: any) => {
          if (where.workspaceId === CONTROL_WS_ID && where.userId === OWNER_USER_ID) {
            return Promise.resolve({ id: 'mem_1', workspaceId: where.workspaceId, userId: where.userId, role: 'OWNER' });
          }
          return Promise.resolve(null);
        }),
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
            if (where.idempotencyKey && r.idempotencyKey !== where.idempotencyKey) return false;
            return true;
          });
          return Promise.resolve(list[0] ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const run = { id: data.id ?? `run_${Date.now()}`, stateVersion: 1, policyEnabled: false, ...data };
          simulationRuns.set(run.id, run);
          return Promise.resolve(run);
        }),
        update: jest.fn(({ where, data }: any) => {
          const run = simulationRuns.get(where.id);
          if (!run) return Promise.resolve(null);
          Object.assign(run, data);
          return Promise.resolve(run);
        }),
        updateMany: jest.fn(({ where, data }: any) => {
          const run = simulationRuns.get(where.id);
          if (!run) return Promise.resolve({ count: 0 });
          if (where.stateVersion !== undefined && run.stateVersion !== where.stateVersion) {
            return Promise.resolve({ count: 0 });
          }
          if (data.stateVersion?.increment) {
            run.stateVersion += data.stateVersion.increment;
            delete data.stateVersion;
          }
          Object.assign(run, data);
          return Promise.resolve({ count: 1 });
        }),
      },
      simulationTick: {
        findUnique: jest.fn(({ where }: any) => {
          const key = `${where.runId_date?.runId}_${where.runId_date?.date}`;
          return Promise.resolve(simulationTicks.get(key) ?? null);
        }),
        findFirst: jest.fn(({ where }: any) => {
          const key = `${where.runId}_${where.date}`;
          return Promise.resolve(simulationTicks.get(key) ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const key = `${data.runId}_${data.date}`;
          const tick = { id: `tick_${Date.now()}`, ...data };
          simulationTicks.set(key, tick);
          return Promise.resolve(tick);
        }),
      },
      simulationLedgerEntry: {
        createMany: jest.fn(({ data }: any) => {
          ledgerEntries.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      profitDaily: {
        create: jest.fn(({ data }: any) => {
          profitDailyRows.push(data);
          return Promise.resolve(data);
        }),
      },
      channelDailyMetric: {
        createMany: jest.fn(({ data }: any) => {
          channelMetrics.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      adMetricDaily: {
        createMany: jest.fn(({ data }: any) => {
          adMetrics.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      inventorySnapshot: {
        createMany: jest.fn(({ data }: any) => {
          inventorySnapshots.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      inventoryBalance: {
        upsert: jest.fn(({ where, create, update }: any) => {
          const key = `${where.workspaceId_skuId_warehouseType.workspaceId}_${where.workspaceId_skuId_warehouseType.skuId}`;
          const existing = inventoryBalances.get(key);
          const val = existing ? { ...existing, ...update } : { id: `bal_${Date.now()}`, ...create };
          inventoryBalances.set(key, val);
          return Promise.resolve(val);
        }),
      },
      $transaction: jest.fn(async (fn: any) => {
        // True snapshot/rollback semantics (P1 #4)
        const snapTicks = new Map(simulationTicks);
        const snapLedger = [...ledgerEntries];
        const snapProfit = [...profitDailyRows];
        const snapChannel = [...channelMetrics];
        const snapAd = [...adMetrics];
        const snapRuns = new Map(Array.from(simulationRuns.entries()).map(([k, v]) => [k, { ...v }]));
        const snapStores = new Map(stores);
        const snapSkus = new Map(skus);
        const snapCampaigns = new Map(campaigns);
        const snapInventorySnapshots = [...inventorySnapshots];
        const snapInventoryBalances = new Map(inventoryBalances);
        try {
          return await fn(mockPrisma);
        } catch (err) {
          simulationTicks = snapTicks;
          ledgerEntries = snapLedger;
          profitDailyRows = snapProfit;
          channelMetrics = snapChannel;
          adMetrics = snapAd;
          simulationRuns = snapRuns;
          stores = snapStores;
          skus = snapSkus;
          campaigns = snapCampaigns;
          inventorySnapshots = snapInventorySnapshots;
          inventoryBalances = snapInventoryBalances;
          throw err;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulatorController],
      providers: [
        SimulatorService,
        SimulatorPersistenceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<SimulatorController>(SimulatorController);
    service = module.get<SimulatorService>(SimulatorService);
    v2Store = new V2RunStore(mockPrisma);
  });

  it('atomically ticks a simulated day: persists Tick, ledger entries, profit daily, and advances completedThrough', async () => {
    // 1. Create Run
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, {
      modelVersion: 'closed-loop-v2',
      seed: 1001,
    });

    // 2. Tick Day 1 (2026-09-01)
    const tickResult = await v2Store.tickDay(CONTROL_WS_ID, runResult.runId);

    expect(tickResult).toBeDefined();
    expect(tickResult.simDate).toBe('2026-09-01');
    expect(tickResult.nextDate).toBe('2026-09-02');
    expect(tickResult.completedThrough).toBe('2026-09-01');

    // Verify run record updated
    const updatedRun = simulationRuns.get(runResult.runId);
    expect(updatedRun.completedThrough).toEqual(new Date('2026-09-01T00:00:00.000Z'));

    // Verify tick persisted
    expect(simulationTicks.size).toBe(1);

    // Verify ledger entries persisted
    expect(ledgerEntries.length).toBeGreaterThan(0);

    // Verify profit daily persisted per SKU
    expect(profitDailyRows.length).toBeGreaterThan(0);
    expect(profitDailyRows[0].workspaceId).toBe(runResult.runWorkspaceId);
  });

  it('FIX-1: ticks ≥3 consecutive days with ad spend without ledger unique key collisions', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, {
      modelVersion: 'closed-loop-v2',
      seed: 1001,
    });

    const tick1 = await v2Store.tickDay(CONTROL_WS_ID, runResult.runId);
    const tick2 = await v2Store.tickDay(CONTROL_WS_ID, runResult.runId);
    const tick3 = await v2Store.tickDay(CONTROL_WS_ID, runResult.runId);

    expect(tick1.completedThrough).toBe('2026-09-01');
    expect(tick2.completedThrough).toBe('2026-09-02');
    expect(tick3.completedThrough).toBe('2026-09-03');

    // Verify every ledger entry across 3 days has unique composite key [runId, date, sourceType, sourceId, entryType, sequence]
    const keys = ledgerEntries.map(
      (e) => `${e.runId}_${e.date}_${e.sourceType}_${e.sourceId}_${e.entryType}_${e.sequence}`,
    );
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(ledgerEntries.length);
    expect(ledgerEntries.length).toBeGreaterThan(0);
  });

  it('FIX-2: writes profitDaily rows with real schema field names per SKU', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, {
      modelVersion: 'closed-loop-v2',
      seed: 1001,
    });

    await v2Store.tickDay(CONTROL_WS_ID, runResult.runId);

    expect(profitDailyRows.length).toBeGreaterThan(0);
    const first = profitDailyRows[0];
    expect(first).toHaveProperty('date');
    expect(first).toHaveProperty('skuId');
    expect(first).toHaveProperty('revenue');
    expect(first).toHaveProperty('cogs');
    expect(first).toHaveProperty('adsCost');
    expect(first).toHaveProperty('amazonFees');
    expect(first).toHaveProperty('fbaFee');
    expect(first).toHaveProperty('returnLoss');
    expect(first).toHaveProperty('netProfit');
    expect(first).not.toHaveProperty('profitDate');
    expect(first).not.toHaveProperty('grossRevenue');
  });

  it('idempotent tick: repeated tick for an already completed day replays or throws ConflictException', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, {
      modelVersion: 'closed-loop-v2',
      seed: 1001,
    });

    const firstTick = await v2Store.tickDay(CONTROL_WS_ID, runResult.runId);
    expect(firstTick.completedThrough).toBe('2026-09-01');

    // Calling tick for already completed day idempotently replays committed tick (P1 #2)
    const replayed = await service.tickRun(CONTROL_WS_ID, runResult.runId, '2026-09-01');
    expect(replayed.simDate).toBe('2026-09-01');
    expect(replayed.completedThrough).toBe('2026-09-01');

    // Calling tick with out-of-order / non-contiguous future date throws ConflictException
    await expect(service.tickRun(CONTROL_WS_ID, runResult.runId, '2026-09-05')).rejects.toThrow(ConflictException);
  });

  it('transaction rollback: mid-transaction failure rolls back all persistence for that day (P1 #9)', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID, {
      modelVersion: 'closed-loop-v2',
      seed: 1001,
    });

    // Inject fault in profitDaily
    mockPrisma.profitDaily.create.mockRejectedValueOnce(new Error('Simulated DB connection drop'));

    await expect(v2Store.tickDay(CONTROL_WS_ID, runResult.runId)).rejects.toThrow('Simulated DB connection drop');

    // Completed through must still be null
    const run = simulationRuns.get(runResult.runId);
    expect(run.completedThrough).toBeNull();

    // Rollback must leave zero ticks and zero ledger entries persisted (P1 #9)
    expect(simulationTicks.size).toBe(0);
    expect(ledgerEntries.length).toBe(0);
  });
});
