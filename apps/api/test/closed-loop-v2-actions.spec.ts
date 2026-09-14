import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ActionLayerService } from '../src/modules/action-layer/action-layer.service.js';
import { ActionLayerController } from '../src/modules/action-layer/action-layer.controller.js';
import { IntelligenceService } from '../src/modules/intelligence/intelligence.service.js';
import { AdvertisingService } from '../src/modules/advertising/advertising.service.js';
import { OutcomeTrackingService } from '../src/modules/outcome-tracking/outcome-tracking.service.js';
import { V2RunStore } from '@crosspilot/db';
import { computeSha256 } from '@crosspilot/domain';

describe('CL-2: Action Layer Closed-loop Execution on v2 Simulator', () => {
  const CONTROL_WS_ID = 'ws_control_owner';
  const OWNER_USER_ID = 'user_owner';

  let service: ActionLayerService;
  let controller: ActionLayerController;
  let v2Store: V2RunStore;
  let mockPrisma: any;

  // In-memory data store
  let plannedActions: Map<string, any>;
  let actionExecutions: any[];
  let executionReceipts: Map<string, any>;
  let simulationRuns: Map<string, any>;
  let stores: Map<string, any>;
  let campaigns: Map<string, any>;
  let workspaces: Map<string, any>;
  let skus: Map<string, any>;

  beforeEach(async () => {
    plannedActions = new Map();
    actionExecutions = [];
    executionReceipts = new Map();
    simulationRuns = new Map();
    stores = new Map();
    campaigns = new Map();
    workspaces = new Map();
    skus = new Map();

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
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaign: {
        create: jest.fn(({ data }: any) => {
          const c = { id: data.id ?? `camp_${Date.now()}_${Math.random()}`, ...data };
          campaigns.set(c.id, c);
          return Promise.resolve(c);
        }),
        findFirst: jest.fn(({ where }: any) => {
          const found = Array.from(campaigns.values()).find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.workspaceId && c.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return Promise.resolve(found ?? null);
        }),
      },
      plannedAction: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(plannedActions.get(where.id) ?? null)),
        findFirst: jest.fn(({ where }: any) => {
          const list = Array.from(plannedActions.values()).filter((a) => {
            if (where.id && a.id !== where.id) return false;
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return Promise.resolve(list[0] ?? null);
        }),
        findMany: jest.fn(({ where }: any) => {
          const list = Array.from(plannedActions.values()).filter((a) => {
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return Promise.resolve(list);
        }),
        create: jest.fn(({ data }: any) => {
          const a = { id: data.id ?? `action_${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          plannedActions.set(a.id, a);
          return Promise.resolve(a);
        }),
        update: jest.fn(({ where, data }: any) => {
          const a = plannedActions.get(where.id);
          if (!a) return Promise.resolve(null);
          Object.assign(a, data, { updatedAt: new Date() });
          return Promise.resolve(a);
        }),
      },
      actionExecution: {
        create: jest.fn(({ data }: any) => {
          const exec = { id: `exec_${Date.now()}`, timestamp: new Date(), ...data };
          actionExecutions.push(exec);
          return Promise.resolve(exec);
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      simulationExecutionReceipt: {
        findFirst: jest.fn(({ where }: any) => {
          const key = `${where.runId}_${where.actionId}_${where.operationKind ?? 'APPLY'}`;
          return Promise.resolve(executionReceipts.get(key) ?? null);
        }),
        create: jest.fn(({ data }: any) => {
          const key = `${data.runId}_${data.actionId}_${data.operationKind ?? 'APPLY'}`;
          const receipt = { id: `rcpt_${Date.now()}`, ...data };
          executionReceipts.set(key, receipt);
          return Promise.resolve(receipt);
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
          const updated = { ...run, ...data };
          simulationRuns.set(where.id, updated);
          return Promise.resolve(updated);
        }),
        updateMany: jest.fn(({ where, data }: any) => {
          const run = simulationRuns.get(where.id);
          if (run) {
            if (where.stateVersion !== undefined && where.stateVersion !== run.stateVersion) {
              return Promise.resolve({ count: 0 });
            }
            const updated = { ...run, ...data };
            simulationRuns.set(where.id, updated);
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActionLayerController],
      providers: [
        ActionLayerService,
        {
          provide: IntelligenceService,
          useValue: { generateEvidence: jest.fn().mockResolvedValue({ id: 'ev_1' }) },
        },
        {
          provide: AdvertisingService,
          useValue: { getCampaigns: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: OutcomeTrackingService,
          useValue: { createForExecution: jest.fn().mockResolvedValue(null) },
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ActionLayerService>(ActionLayerService);
    controller = module.get<ActionLayerController>(ActionLayerController);
    v2Store = new V2RunStore(mockPrisma);
  });

  it('executes DECREASE_BID: bid=120 cents, percentage=20, targetVersion=1 -> bid=96 cents, targetVersion=2, and APPLIED receipt', async () => {
    // 1. Create Run
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];
    expect(campaign.bidCents).toBe(120);
    expect(campaign.targetVersion).toBe(1);

    // 2. Create WAITING_APPROVAL PlannedAction
    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 1,
        },
        parameters: {
          percentage: 20,
          expectedTargetVersion: 1,
        },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    // 3. Approve Action (generates _approval metadata and payloadHash)
    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    // 4. Execute Action
    const result = await service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    expect(result.status).toBe('SUCCESS');

    // 5. Verify Run campaign state was modified
    const updatedRun = simulationRuns.get(runResult.runId);
    const updatedCampaign = updatedRun.stateSnapshot.campaigns.find((c: any) => c.id === campaign.id);
    expect(updatedCampaign.bidCents).toBe(96);
    expect(updatedCampaign.targetVersion).toBe(2);

    // 6. Verify Execution Receipt
    const receiptKey = `${runResult.runId}_${action.id}_APPLY`;
    const receipt = executionReceipts.get(receiptKey);
    expect(receipt).toBeDefined();
    expect(receipt.status).toBe('APPLIED');
    expect(receipt.beforeState.bidCents).toBe(120);
    expect(receipt.afterState.bidCents).toBe(96);
    expect(receipt.targetVersion).toBe(2);
  });

  it('idempotent execution replay: executing same actionId twice retains 96 cents without multiplying 0.8 again', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 1,
        },
        parameters: { percentage: 20, expectedTargetVersion: 1 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    // First execution
    await service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    const updatedRun1 = simulationRuns.get(runResult.runId);
    expect(updatedRun1.stateSnapshot.campaigns[0].bidCents).toBe(96);

    // Second execution with same actionId (idempotent replay)
    const result2 = await service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID);
    expect(result2.status).toBe('SUCCESS');

    const updatedRun2 = simulationRuns.get(runResult.runId);
    expect(updatedRun2.stateSnapshot.campaigns[0].bidCents).toBe(96); // Still 96, not 77
  });

  it('rejects version conflict when expectedTargetVersion does not match current campaign version', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 99, // Mismatch!
        },
        parameters: { percentage: 20, expectedTargetVersion: 99 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    await expect(
      service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects keyword targeting on campaign-level action with BadRequestException', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 1,
          keyword: 'sneakers', // Non-empty keyword should be rejected
        },
        parameters: { percentage: 20, expectedTargetVersion: 1 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    await expect(
      service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('executes STOP_CAMPAIGN: pauses the campaign and sets status to PAUSED and targetVersion to 2', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'STOP_CAMPAIGN',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 1,
        },
        parameters: { expectedTargetVersion: 1 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    const result = await service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID);
    expect(result.status).toBe('SUCCESS');

    const updatedRun = simulationRuns.get(runResult.runId);
    const updatedCampaign = updatedRun.stateSnapshot.campaigns.find((c: any) => c.id === campaign.id);
    expect(updatedCampaign.status).toBe('PAUSED');
    expect(updatedCampaign.targetVersion).toBe(2);
  });

  it('rejects approval when expectedTargetVersion is missing from target and parameters', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
        },
        parameters: { percentage: 20 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await expect(
      service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID),
    ).rejects.toThrow(/expectedTargetVersion is required/);
  });

  it('rejects execution when approval has expired', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 1,
        },
        parameters: { percentage: 20, expectedTargetVersion: 1 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    // Tamper expiration time to past in stored record
    const stored = plannedActions.get(action.id);
    stored.parameters._approval.expiresAt = new Date(Date.now() - 10000).toISOString();

    await expect(
      service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects execution when payload parameters are tampered after approval (payloadHash mismatch)', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    const action = await mockPrisma.plannedAction.create({
      data: {
        workspaceId: runResult.runWorkspaceId,
        actionType: 'DECREASE_BID',
        target: {
          runId: runResult.runId,
          storeId: runResult.storeId,
          campaignId: campaign.id,
          expectedTargetVersion: 1,
        },
        parameters: { percentage: 20, expectedTargetVersion: 1 },
        riskLevel: 'LOW',
        needApproval: true,
        status: 'WAITING_APPROVAL',
      },
    });

    await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

    // Tamper action parameters after approval
    const stored = plannedActions.get(action.id);
    stored.parameters.percentage = 50;

    await expect(
      service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects execution when percentage is invalid (0, negative, or > 100)', async () => {
    const runResult = await v2Store.createRun(CONTROL_WS_ID, OWNER_USER_ID);
    const run = simulationRuns.get(runResult.runId);
    const campaign = run.stateSnapshot.campaigns[0];

    for (const invalidPct of [0, -10, 150]) {
      const action = await mockPrisma.plannedAction.create({
        data: {
          workspaceId: runResult.runWorkspaceId,
          actionType: 'DECREASE_BID',
          target: {
            runId: runResult.runId,
            storeId: runResult.storeId,
            campaignId: campaign.id,
            expectedTargetVersion: 1,
          },
          parameters: { percentage: invalidPct, expectedTargetVersion: 1 },
          riskLevel: 'LOW',
          status: 'WAITING_APPROVAL',
        },
      });

      await service.approve(runResult.runWorkspaceId, action.id, OWNER_USER_ID);

      await expect(
        service.execute(runResult.runWorkspaceId, action.id, OWNER_USER_ID),
      ).rejects.toThrow(BadRequestException);
    }
  });
});
