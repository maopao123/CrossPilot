import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  createDefaultSimConfig,
  createInitialWorldState,
  simulateOneDay,
} from '@crosspilot/domain';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { SimulatorService } from '../src/modules/simulator/simulator.service.js';
import { SimulatorController } from '../src/modules/simulator/simulator.controller.js';
import { SimulatorPersistenceService } from '../src/modules/simulator/simulator.persistence.js';

describe('CL-0: Closed-loop v2 compatibility and isolation', () => {
  const CONTROL_WS_ID = 'ws_control_owner';
  const OTHER_WS_ID = 'ws_attacker';
  const OWNER_USER_ID = 'user_owner';
  const ATTACKER_USER_ID = 'user_attacker';

  let controller: SimulatorController;
  let service: SimulatorService;
  let mockPrisma: any;

  // In-memory data store for the mock
  let workspaces: Map<string, any>;
  let workspaceMembers: Map<string, any[]>;
  let stores: Map<string, any>;
  let skus: Map<string, any>;
  let simulationRuns: Map<string, any>;
  let simulationStates: Map<string, any>;

  beforeEach(async () => {
    workspaces = new Map();
    workspaceMembers = new Map();
    stores = new Map();
    skus = new Map();
    simulationRuns = new Map();
    simulationStates = new Map();

    // Seed control workspace
    workspaces.set(CONTROL_WS_ID, {
      id: CONTROL_WS_ID,
      name: 'Control Workspace',
      defaultMarketplaceId: 'mkt_us',
    });
    workspaceMembers.set(CONTROL_WS_ID, [
      { id: 'mem_owner', workspaceId: CONTROL_WS_ID, userId: OWNER_USER_ID, role: 'OWNER' },
    ]);

    // Seed attacker workspace
    workspaces.set(OTHER_WS_ID, {
      id: OTHER_WS_ID,
      name: 'Other Workspace',
      defaultMarketplaceId: 'mkt_us',
    });
    workspaceMembers.set(OTHER_WS_ID, [
      { id: 'mem_attacker', workspaceId: OTHER_WS_ID, userId: ATTACKER_USER_ID, role: 'OWNER' },
    ]);

    mockPrisma = {
      workspace: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(workspaces.get(where.id) ?? null)),
        create: jest.fn(({ data }: any) => {
          const ws = { id: data.id ?? `ws_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...data };
          workspaces.set(ws.id, ws);
          return Promise.resolve(ws);
        }),
      },
      workspaceMember: {
        findFirst: jest.fn(({ where }: any) => {
          const members = workspaceMembers.get(where.workspaceId) ?? [];
          const found = members.find((m) => {
            if (where.userId && m.userId !== where.userId) return false;
            return true;
          });
          return Promise.resolve(found ?? null);
        }),
        findMany: jest.fn(({ where }: any) => {
          const members = workspaceMembers.get(where.workspaceId) ?? [];
          return Promise.resolve(members);
        }),
        create: jest.fn(({ data }: any) => {
          const member = { id: `mem_${Date.now()}`, ...data };
          const list = workspaceMembers.get(data.workspaceId) ?? [];
          list.push(member);
          workspaceMembers.set(data.workspaceId, list);
          return Promise.resolve(member);
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
      product: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: data.id ?? `prod_${Date.now()}`, ...data })),
      },
      sku: {
        findMany: jest.fn(({ where }: any) => {
          const wsSkus = Array.from(skus.values()).filter((s) => s.workspaceId === where.workspaceId);
          if (where.skuCode?.in) {
            return Promise.resolve(wsSkus.filter((s) => where.skuCode.in.includes(s.skuCode)));
          }
          return Promise.resolve(wsSkus);
        }),
        create: jest.fn(({ data }: any) => {
          const sku = { id: data.id ?? `sku_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...data };
          skus.set(sku.id, sku);
          return Promise.resolve(sku);
        }),
        createMany: jest.fn(({ data }: any) => {
          const list = Array.isArray(data) ? data : [data];
          for (const item of list) {
            const sku = { id: `sku_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...item };
            skus.set(sku.id, sku);
          }
          return Promise.resolve({ count: list.length });
        }),
      },
      marketplace: {
        upsert: jest.fn().mockResolvedValue({ id: 'mkt_us', code: 'AMAZON_US' }),
      },
      commerceAccount: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: `acct_${data.provider}`, ...data })),
      },
      campaign: {
        create: jest.fn(({ data }: any) => Promise.resolve({ id: `camp_${Date.now()}`, ...data })),
      },
      simulationRun: {
        findUnique: jest.fn(({ where }: any) => {
          if (where.id) return Promise.resolve(simulationRuns.get(where.id) ?? null);
          if (where.runWorkspaceId) {
            const found = Array.from(simulationRuns.values()).find((r) => r.runWorkspaceId === where.runWorkspaceId);
            return Promise.resolve(found ?? null);
          }
          if (where.idempotencyKey) {
            const found = Array.from(simulationRuns.values()).find((r) => r.idempotencyKey === where.idempotencyKey);
            return Promise.resolve(found ?? null);
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn(({ where }: any) => {
          const list = Array.from(simulationRuns.values()).filter((r) => {
            if (where.id && r.id !== where.id) return false;
            if (where.controlWorkspaceId && r.controlWorkspaceId !== where.controlWorkspaceId) return false;
            if (where.runWorkspaceId && r.runWorkspaceId !== where.runWorkspaceId) return false;
            if (where.idempotencyKey && r.idempotencyKey !== where.idempotencyKey) return false;
            return true;
          });
          return Promise.resolve(list[0] ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const run = { id: data.id ?? `run_${Date.now()}`, ...data };
          simulationRuns.set(run.id, run);
          return Promise.resolve(run);
        }),
      },
      simulationState: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(simulationStates.get(where.workspaceId) ?? null)),
        create: jest.fn(({ data }: any) => {
          const s = { id: `sim_state_${Date.now()}`, ...data };
          simulationStates.set(data.workspaceId, s);
          return Promise.resolve(s);
        }),
        deleteMany: jest.fn(({ where }: any) => {
          if (where.workspaceId) {
            simulationStates.delete(where.workspaceId);
          }
          return Promise.resolve({ count: 1 });
        }),
      },
      inventorySnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      order: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      orderItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      review: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      adMetricDaily: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      channelDailyMetric: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      simulationEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((callbackOrArray: any) => {
        if (typeof callbackOrArray === 'function') {
          return callbackOrArray(mockPrisma);
        }
        return Promise.all(callbackOrArray);
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
  });

  describe('1. Legacy V1 Output Invariance', () => {
    it('produces identical output for identical default config, world state, and seed', () => {
      const config1 = createDefaultSimConfig();
      const state1 = createInitialWorldState(config1);
      const output1 = simulateOneDay(state1, config1);

      const config2 = createDefaultSimConfig();
      const state2 = createInitialWorldState(config2);
      const output2 = simulateOneDay(state2, config2);

      expect(output1.nextState.simDate).toBe('2026-09-02');
      expect(output1.nextState.dayIndex).toBe(1);
      expect(output1.output.orders.length).toBe(output2.output.orders.length);
      expect(output1.output.adMetrics.length).toBe(output2.output.adMetrics.length);
      expect(output1.output.channelMetrics.length).toBe(output2.output.channelMetrics.length);
      expect(JSON.stringify(output1)).toBe(JSON.stringify(output2));
    });
  });

  describe('2. Model Version Routing & Dedicated Run Workspace', () => {
    it('creates a dedicated workspace, store, and isolated SKUs for closed-loop-v2 Run', async () => {
      const req = { user: { sub: OWNER_USER_ID, id: OWNER_USER_ID } };
      const runResult = await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
          scenarioId: 'S01',
          idempotencyKey: 'req-unique-001',
        },
        req,
      );

      expect(runResult).toBeDefined();
      expect(runResult.runId).toBeDefined();
      expect(runResult.runWorkspaceId).toBeDefined();
      expect(runResult.runWorkspaceId).not.toBe(CONTROL_WS_ID);
      expect(runResult.storeId).toBeDefined();
      expect(runResult.modelVersion).toBe('closed-loop-v2');

      // Check that runWorkspace exists
      const runWs = workspaces.get(runResult.runWorkspaceId);
      expect(runWs).toBeDefined();

      // Check that store exists and belongs to runWorkspace
      const runStore = stores.get(runResult.storeId);
      expect(runStore).toBeDefined();
      expect(runStore.workspaceId).toBe(runResult.runWorkspaceId);

      // Check that owner user was added as OWNER to runWorkspace
      const members = workspaceMembers.get(runResult.runWorkspaceId);
      expect(members?.some((m) => m.userId === OWNER_USER_ID && m.role === 'OWNER')).toBe(true);
    });

    it('returns the same runId for duplicate creation with same idempotencyKey (idempotent replay)', async () => {
      const req = { user: { sub: OWNER_USER_ID, id: OWNER_USER_ID } };
      const run1 = await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
          scenarioId: 'S01',
          idempotencyKey: 'idem-key-abc',
        },
        req,
      );

      const runCountBefore = simulationRuns.size;
      const wsCountBefore = workspaces.size;

      const run2 = await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
          scenarioId: 'S01',
          idempotencyKey: 'idem-key-abc',
        },
        req,
      );

      expect(run2.runId).toBe(run1.runId);
      expect(run2.runWorkspaceId).toBe(run1.runWorkspaceId);
      expect(simulationRuns.size).toBe(runCountBefore);
      expect(workspaces.size).toBe(wsCountBefore);
    });
  });

  describe('3. Legacy reset does not touch v2 Run', () => {
    it('rejects POST /simulator/reset on a v2 runWorkspace with 409 RESET_REQUIRES_NEW_RUN', async () => {
      const req = {
        user: { sub: OWNER_USER_ID, id: OWNER_USER_ID },
        workspaceMember: { role: 'OWNER' },
      };

      const run = await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
          scenarioId: 'S01',
        },
        req,
      );

      await expect(controller.reset(run.runWorkspaceId, req)).rejects.toThrow(ConflictException);
      await expect(controller.reset(run.runWorkspaceId, req)).rejects.toThrow(/RESET_REQUIRES_NEW_RUN/);
    });
  });

  describe('4. Tenant isolation: Non-member cannot access Run', () => {
    it('returns 403 or 404 when user A attempts to read user B’s Run', async () => {
      const ownerReq = { user: { sub: OWNER_USER_ID, id: OWNER_USER_ID } };
      const run = await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
        },
        ownerReq,
      );

      // Attacker from OTHER_WS_ID with ATTACKER_USER_ID tries to read the Run
      const attackerReq = { user: { sub: ATTACKER_USER_ID, id: ATTACKER_USER_ID } };

      await expect(
        controller.getRun(OTHER_WS_ID, run.runId, attackerReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows member of control workspace to read the Run', async () => {
      const ownerReq = { user: { sub: OWNER_USER_ID, id: OWNER_USER_ID } };
      const run = await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
        },
        ownerReq,
      );

      const readResult = await controller.getRun(CONTROL_WS_ID, run.runId, ownerReq);
      expect(readResult).toBeDefined();
      expect(readResult.id).toBe(run.runId);
      expect(readResult.modelVersion).toBe('closed-loop-v2');
      // Must not leak hidden internal truth
      expect((readResult as any).activeEvents).toBeUndefined();
    });

    it('rejects createRun with 409 ConflictException when same idempotencyKey is used with different parameters', async () => {
      const req = { user: { sub: OWNER_USER_ID, id: OWNER_USER_ID } };
      await controller.createRun(
        CONTROL_WS_ID,
        {
          modelVersion: 'closed-loop-v2',
          seed: 1001,
          idempotencyKey: 'idem-conflict-test',
        },
        req,
      );

      // Attempt second creation with same key but different seed (1002)
      await expect(
        controller.createRun(
          CONTROL_WS_ID,
          {
            modelVersion: 'closed-loop-v2',
            seed: 1002,
            idempotencyKey: 'idem-conflict-test',
          },
          req,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects tick with 403 ForbiddenException when non-member of control workspace attempts to tick', async () => {
      const ownerReq = { user: { sub: OWNER_USER_ID, id: OWNER_USER_ID } };
      const run = await controller.createRun(
        CONTROL_WS_ID,
        { modelVersion: 'closed-loop-v2', seed: 1001 },
        ownerReq,
      );

      const nonMemberReq = { user: { sub: ATTACKER_USER_ID, id: ATTACKER_USER_ID } };
      await expect(
        controller.tickRun(CONTROL_WS_ID, run.runId, undefined, nonMemberReq),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
