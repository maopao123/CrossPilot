import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SimulatorController } from '../src/modules/simulator/simulator.controller.js';
import { SimulatorService } from '../src/modules/simulator/simulator.service.js';
import { SimulatorPersistenceService } from '../src/modules/simulator/simulator.persistence.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

describe('CL-5: Closed-loop v2 API Role Guardrails & Policy Configuration', () => {
  const CONTROL_WS_ID = 'ws_control';
  const OTHER_WS_ID = 'ws_other';
  const OWNER_USER_ID = 'user_owner_sub';
  const VIEWER_USER_ID = 'user_viewer_sub';

  let controller: SimulatorController;
  let service: SimulatorService;
  let mockPrisma: any;

  let simulationRuns: Map<string, any>;
  let workspaces: Map<string, any>;
  let workspaceMembers: Map<string, any>;
  let stores: Map<string, any>;
  let skus: Map<string, any>;
  let campaigns: Map<string, any>;

  beforeEach(async () => {
    simulationRuns = new Map();
    workspaces = new Map();
    workspaceMembers = new Map();
    stores = new Map();
    skus = new Map();
    campaigns = new Map();

    workspaces.set(CONTROL_WS_ID, {
      id: CONTROL_WS_ID,
      slug: 'ws-control-slug',
      name: 'Control Workspace',
      defaultMarketplaceId: 'mkt_us',
    });

    workspaces.set(OTHER_WS_ID, {
      id: OTHER_WS_ID,
      slug: 'ws-other-slug',
      name: 'Other Workspace',
      defaultMarketplaceId: 'mkt_us',
    });

    // Register members (P1 #8: conditional roles, never always OWNER)
    workspaceMembers.set(`${CONTROL_WS_ID}_${OWNER_USER_ID}`, {
      id: 'mem_owner',
      workspaceId: CONTROL_WS_ID,
      userId: OWNER_USER_ID,
      role: 'OWNER',
    });
    workspaceMembers.set(`${CONTROL_WS_ID}_${VIEWER_USER_ID}`, {
      id: 'mem_viewer',
      workspaceId: CONTROL_WS_ID,
      userId: VIEWER_USER_ID,
      role: 'VIEWER',
    });
    workspaceMembers.set(`${OTHER_WS_ID}_${VIEWER_USER_ID}`, {
      id: 'mem_other_user',
      workspaceId: OTHER_WS_ID,
      userId: VIEWER_USER_ID,
      role: 'OWNER',
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
        create: jest.fn(({ data }: any) => {
          const mem = { id: `mem_${Date.now()}`, ...data };
          workspaceMembers.set(`${data.workspaceId}_${data.userId}`, mem);
          return Promise.resolve(mem);
        }),
        findFirst: jest.fn(({ where }: any) => {
          const key = `${where.workspaceId}_${where.userId}`;
          return Promise.resolve(workspaceMembers.get(key) ?? null);
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
          const sku = { id: data.id ?? `sku_${Date.now()}`, ...data };
          skus.set(sku.id, sku);
          return Promise.resolve(sku);
        }),
      },
      campaign: {
        create: jest.fn(({ data }: any) => {
          const c = { id: data.id ?? `camp_${Date.now()}`, ...data };
          campaigns.set(c.id, c);
          return Promise.resolve(c);
        }),
      },
      simulationRun: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(simulationRuns.get(where.id) ?? null)),
        findFirst: jest.fn(({ where }: any) => {
          const list = Array.from(simulationRuns.values()).filter((r) => {
            if (where.id && r.id !== where.id) return false;
            if (where.controlWorkspaceId && r.controlWorkspaceId !== where.controlWorkspaceId) return false;
            if (where.idempotencyKey && r.idempotencyKey !== where.idempotencyKey) return false;
            return true;
          });
          return Promise.resolve(list[0] ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const run = { id: data.id ?? `run_${Date.now()}`, policyEnabled: false, ...data };
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
          if (run) {
            if (where.stateVersion !== undefined && where.stateVersion !== run.stateVersion) {
              return Promise.resolve({ count: 0 });
            }
            Object.assign(run, data);
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }),
      },
      simulationTick: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: any) => Promise.resolve({ id: `tick_${Date.now()}`, ...data })),
      },
      simulationLedgerEntry: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      profitDaily: {
        create: jest.fn(({ data }: any) => Promise.resolve(data)),
      },
      channelDailyMetric: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adMetricDaily: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventorySnapshot: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryBalance: {
        upsert: jest.fn().mockResolvedValue({ id: 'bal_1' }),
      },
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulatorController],
      providers: [
        SimulatorService,
        { provide: SimulatorPersistenceService, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<SimulatorController>(SimulatorController);
    service = module.get<SimulatorService>(SimulatorService);
  });

  describe('1. Role Authorization (VIEWER vs OWNER / ADMIN)', () => {
    it('blocks VIEWER from creating a simulation run', async () => {
      // FIX-5: Use authentic JWT payload format { sub: ... }
      const viewerReq = { user: { sub: VIEWER_USER_ID }, workspaceMember: { role: 'VIEWER' } };

      expect(() =>
        controller.createRun(CONTROL_WS_ID, { scenarioId: 'S01' }, viewerReq),
      ).toThrow(ForbiddenException);
    });

    it('blocks VIEWER from creating an experiment', async () => {
      const viewerReq = { user: { sub: VIEWER_USER_ID }, workspaceMember: { role: 'VIEWER' } };

      expect(() =>
        controller.createExperiment(CONTROL_WS_ID, { scenarioIds: ['S01'] }, viewerReq),
      ).toThrow(ForbiddenException);
    });

    it('blocks VIEWER from ticking a simulation run', async () => {
      const viewerReq = { user: { sub: VIEWER_USER_ID }, workspaceMember: { role: 'VIEWER' } };

      expect(() =>
        controller.tickRun(CONTROL_WS_ID, 'run_123', {}, viewerReq),
      ).toThrow(ForbiddenException);
    });

    it('FIX-4: tenant isolation in tickRun — Workspace B cannot tick Workspace A run', async () => {
      // Create a run in CONTROL_WS_ID
      const run = await service.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S01' });

      // User in OTHER_WS_ID attempts to tick run belonging to CONTROL_WS_ID
      const otherWsReq = { user: { sub: VIEWER_USER_ID }, workspaceMember: { role: 'OWNER' } };
      await expect(
        controller.tickRun(OTHER_WS_ID, run.runId, {}, otherWsReq),
      ).rejects.toThrow();
    });

    it('blocks VIEWER from enabling autopilot policy, but allows OWNER/ADMIN', async () => {
      const run = await service.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S01' });

      // VIEWER attempt -> Forbidden
      const viewerReq = { user: { sub: VIEWER_USER_ID }, workspaceMember: { role: 'VIEWER' } };
      await expect(
        controller.updateRunPolicy(CONTROL_WS_ID, run.runId, { policyEnabled: true }, viewerReq),
      ).rejects.toThrow(ForbiddenException);

      // OWNER attempt with valid tightened limits -> Success
      const ownerReq = { user: { sub: OWNER_USER_ID }, workspaceMember: { role: 'OWNER' } };
      const updated = await controller.updateRunPolicy(
        CONTROL_WS_ID,
        run.runId,
        { policyEnabled: true, policyLimits: { maxSingleBidChangePct: 0.15 } },
        ownerReq,
      );

      expect(updated.policyEnabled).toBe(true);
      expect(updated.policyLimits).toEqual({ maxSingleBidChangePct: 0.15 });
    });

    it('FIX-10: rejects relaxing policy limits via updateRunPolicy', async () => {
      const run = await service.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S01' });
      const ownerReq = { user: { sub: OWNER_USER_ID }, workspaceMember: { role: 'OWNER' } };

      // Attempt to relax single bid change to 50% (> 20% limit) -> BadRequestException
      await expect(
        controller.updateRunPolicy(
          CONTROL_WS_ID,
          run.runId,
          { policyEnabled: true, policyLimits: { maxSingleBidChangePct: 0.50 } },
          ownerReq,
        ),
      ).rejects.toThrow();
    });
  });

  describe('2. Run Control Endpoints (advance, pause, events)', () => {
    it('FIX-17: pauses a running run', async () => {
      const run = await service.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S01' });
      const ownerReq = { user: { sub: OWNER_USER_ID }, workspaceMember: { role: 'OWNER' } };

      const paused = await controller.pauseRun(CONTROL_WS_ID, run.runId, ownerReq);
      expect(paused.status).toBe('PAUSED');
    });

    it('FIX-17: injects future events, rejects past events', async () => {
      const run = await service.createRun(CONTROL_WS_ID, OWNER_USER_ID, { scenarioId: 'S01' });
      const ownerReq = { user: { sub: OWNER_USER_ID }, workspaceMember: { role: 'OWNER' } };

      // Tick day 1 (2026-09-01)
      await service.tickRun(CONTROL_WS_ID, run.runId, undefined, OWNER_USER_ID);

      // Inject future event -> Success
      const futureResult = await controller.injectEvents(
        CONTROL_WS_ID,
        run.runId,
        { events: [{ code: 'FUTURE_PROMO', date: '2026-09-10' }] },
        ownerReq,
      );
      expect(futureResult.success).toBe(true);

      // Inject past event (date <= 2026-09-01) -> BadRequestException
      await expect(
        controller.injectEvents(
          CONTROL_WS_ID,
          run.runId,
          { events: [{ code: 'PAST_EVENT', date: '2026-09-01' }] },
          ownerReq,
        ),
      ).rejects.toThrow();
    });
  });
});
