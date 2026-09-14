import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SimulatorService } from '../src/modules/simulator/simulator.service.js';
import { SimulatorPersistenceService } from '../src/modules/simulator/simulator.persistence.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { V2RunStore } from '@crosspilot/db';

describe('CL-4: Closed-loop v2 API Experiment & Budget Limits', () => {
  const CONTROL_WS_ID = 'ws_experiment_owner';
  const OTHER_WS_ID = 'ws_other_tenant';
  const OWNER_USER_ID = 'user_experiment_owner';

  let service: SimulatorService;
  let mockPrisma: any;

  // In-memory data store
  let simulationRuns: Map<string, any>;
  let simulationExperiments: Map<string, any>;
  let workspaces: Map<string, any>;
  let stores: Map<string, any>;
  let skus: Map<string, any>;
  let campaigns: Map<string, any>;

  beforeEach(async () => {
    simulationRuns = new Map();
    simulationExperiments = new Map();
    workspaces = new Map();
    stores = new Map();
    skus = new Map();
    campaigns = new Map();

    workspaces.set(CONTROL_WS_ID, {
      id: CONTROL_WS_ID,
      name: 'Experiment Control Workspace',
      defaultMarketplaceId: 'mkt_us',
    });

    workspaces.set(OTHER_WS_ID, {
      id: OTHER_WS_ID,
      name: 'Other Tenant Workspace',
      defaultMarketplaceId: 'mkt_us',
    });

    mockPrisma = {
      workspace: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(workspaces.get(where.id) ?? null)),
        create: jest.fn(({ data }: any) => {
          const ws = { id: data.id ?? `ws_${Date.now()}_${Math.random()}`, ...data };
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
          const s = { id: data.id ?? `store_${Date.now()}_${Math.random()}`, ...data };
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
          const run = { id: data.id ?? `run_${Date.now()}_${Math.random()}`, ...data };
          simulationRuns.set(run.id, run);
          return Promise.resolve(run);
        }),
        updateMany: jest.fn(({ where, data }: any) => {
          let count = 0;
          for (const [id, run] of simulationRuns.entries()) {
            if (where?.id?.in && where.id.in.includes(id)) {
              Object.assign(run, data);
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
      },
      simulationExperiment: {
        create: jest.fn(({ data }: any) => {
          const exp = { id: data.id ?? `exp_${Date.now()}_${Math.random()}`, ...data };
          simulationExperiments.set(exp.id, exp);
          return Promise.resolve(exp);
        }),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(simulationExperiments.get(where.id) ?? null)),
      },
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatorService,
        { provide: SimulatorPersistenceService, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SimulatorService>(SimulatorService);
  });

  it('creates three isolated runs (Control, Rule, CrossPilot) with manifest hash', async () => {
    const experiment = await service.createExperiment(CONTROL_WS_ID, OWNER_USER_ID, {
      scenarioIds: ['S01'],
      seeds: [1001],
      maxLlmCalls: 50,
      maxCostUSD: 5.0,
    });

    expect(experiment).toBeDefined();
    expect(experiment.controlWorkspaceId).toBe(CONTROL_WS_ID);
    expect(experiment.status).toBe('RUNNING');
    expect(experiment.controlRunId).toBeDefined();
    expect(experiment.ruleRunId).toBeDefined();
    expect(experiment.crossPilotRunId).toBeDefined();

    // All three runs must be distinct isolated runs
    expect(experiment.controlRunId).not.toBe(experiment.ruleRunId);
    expect(experiment.ruleRunId).not.toBe(experiment.crossPilotRunId);

    // Manifest hash must be generated
    expect(experiment.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('pauses budget (PAUSED_BUDGET) when maxLlmCalls or maxCostUSD is zero/negative', async () => {
    const experiment = await service.createExperiment(CONTROL_WS_ID, OWNER_USER_ID, {
      scenarioIds: ['S02'],
      seeds: [1002],
      maxLlmCalls: 0, // Budget exhausted
      maxCostUSD: 0,
    });

    expect(experiment.status).toBe('PAUSED_BUDGET');
  });

  it('multi-tenant isolation: forbids access to experiments from other workspaces', async () => {
    const experiment = await service.createExperiment(CONTROL_WS_ID, OWNER_USER_ID, {
      scenarioIds: ['S03'],
      seeds: [1003],
    });

    // Owner workspace can retrieve
    const retrieved = await service.getExperiment(CONTROL_WS_ID, experiment.id);
    expect(retrieved.id).toBe(experiment.id);

    // Other workspace is forbidden
    await expect(service.getExperiment(OTHER_WS_ID, experiment.id)).rejects.toThrow(ForbiddenException);

    // Non-existent experiment throws NotFound
    await expect(service.getExperiment(CONTROL_WS_ID, 'non_existent_exp')).rejects.toThrow(NotFoundException);
  });
});
