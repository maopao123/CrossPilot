import { ActionLayerService } from '../src/modules/action-layer/action-layer.service.js';
import { ExecutionAttemptStore } from '@crosspilot/db';
import { SimulatorERPAdapter } from '@crosspilot/integrations';

describe('Phase 5.1 Runtime Wiring: ActionLayer ERP Execution Attempt History', () => {
  const now = new Date('2026-09-19T10:00:00.000Z');
  const workspaceId = 'ws-test-wiring-1';

  function createMockPrisma() {
    const ops: any[] = [];
    const attempts: any[] = [];
    const actions: any[] = [];
    const executions: any[] = [];

    const prisma: any = {
      automationOperation: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          return ops.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.workspaceId && o.workspaceId !== where.workspaceId) return false;
            if (where.connectionId && o.connectionId !== where.connectionId) return false;
            if (where.operationKind && o.operationKind !== where.operationKind) return false;
            if (where.idempotencyKey && o.idempotencyKey !== where.idempotencyKey) return false;
            return true;
          }) ?? null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          return ops.find((o) => o.id === where.id) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: any }) => {
          const record = {
            id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            version: 1,
            phase: 'READY',
            effect: 'UNKNOWN',
            recovery: 'NONE',
            attemptCount: 0,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          ops.push(record);
          return { ...record };
        }),
        updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const o of ops) {
            if (o.id === where.id && (where.version === undefined || o.version === where.version)) {
              if (data.version?.increment) o.version += data.version.increment;
              if (data.attemptCount?.increment) o.attemptCount += data.attemptCount.increment;
              if (data.leaseOwner !== undefined) o.leaseOwner = data.leaseOwner;
              if (data.leaseUntil !== undefined) o.leaseUntil = data.leaseUntil;
              if (data.phase !== undefined) o.phase = data.phase;
              if (data.effect !== undefined) o.effect = data.effect;
              if (data.recovery !== undefined) o.recovery = data.recovery;
              if (data.evidence !== undefined) o.evidence = data.evidence;
              o.updatedAt = new Date();
              count++;
            }
          }
          return { count };
        }),
        update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const o = ops.find((item) => item.id === where.id);
          if (!o) throw new Error('Not found');
          Object.assign(o, data, { updatedAt: new Date() });
          return { ...o };
        }),
      },

      executionAttempt: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          return attempts.find((a) => {
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            if (where.operationId && a.operationId !== where.operationId) return false;
            if (where.attemptNo !== undefined && a.attemptNo !== where.attemptNo) return false;
            return true;
          }) ?? null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          if (where.operationId_attemptNo) {
            const { operationId, attemptNo } = where.operationId_attemptNo;
            return attempts.find((a) => a.operationId === operationId && a.attemptNo === attemptNo) ?? null;
          }
          return attempts.find((a) => a.id === where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where, orderBy }: { where: any; orderBy?: any }) => {
          let res = attempts.filter((a) => {
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            if (where.operationId && a.operationId !== where.operationId) return false;
            return true;
          });
          if (orderBy?.attemptNo) {
            res = res.sort((a, b) => a.attemptNo - b.attemptNo);
          }
          return res.map((a) => ({ ...a }));
        }),
        create: jest.fn(async ({ data }: { data: any }) => {
          const record = {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            finishedAt: null,
            durationMs: null,
            errorClass: null,
            errorCode: null,
            errorMessage: null,
            effect: null,
            recovery: null,
            evidence: null,
            ...data,
            createdAt: now,
            updatedAt: now,
          };
          attempts.push(record);
          return { ...record };
        }),
        updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const a of attempts) {
            if (
              a.workspaceId === where.workspaceId &&
              a.operationId === where.operationId &&
              a.attemptNo === where.attemptNo
            ) {
              Object.assign(a, data, { updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        }),
      },

      plannedAction: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          return actions.find((act) => act.id === where.id && act.workspaceId === where.workspaceId) ?? null;
        }),
        update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const act = actions.find((item) => item.id === where.id);
          if (!act) throw new Error('Action not found');
          Object.assign(act, data, { updatedAt: new Date() });
          return { ...act };
        }),
      },

      actionExecution: {
        create: jest.fn(async ({ data }: { data: any }) => {
          executions.push(data);
          return { id: `exec-${Date.now()}`, ...data };
        }),
      },

      supplier: {
        findFirst: jest.fn().mockResolvedValue(null),
      },

      sku: {
        findFirst: jest.fn().mockResolvedValue(null),
      },

      _ops: ops,
      _attempts: attempts,
      _actions: actions,
    };

    return prisma;
  }

  it('10. Non-sync ERP execution claims operation but does NOT fabricate external Attempt', async () => {
    const prisma = createMockPrisma();
    const actionId = 'act-po-async-1';
    const actionRow = {
      id: actionId,
      workspaceId,
      actionType: 'CREATE_PURCHASE_ORDER',
      target: {
        connectionId: 'erp-async',
        syncExecution: false, // Asynchronous path
        provider: 'simulator-erp',
      },
      parameters: {
        supplierId: 'sup-101',
        lines: [{ skuId: 'sku-1', quantity: 5, unitCostMinor: 200 }],
      },
      riskLevel: 'low',
      needApproval: true,
      status: 'WAITING_APPROVAL',
      createdAt: now,
      updatedAt: now,
    };
    prisma._actions.push(actionRow);

    const svc = new ActionLayerService(prisma, {} as any, {} as any);
    await svc.approve(workspaceId, actionId, 'user-tester');
    const result = await svc.execute(workspaceId, actionId, 'user-tester');

    // Action status transitions to EXECUTING (reserved for background worker)
    expect(result.status).toBe('EXECUTING');

    // Operation was claimed and has attemptCount = 1
    expect(prisma._ops).toHaveLength(1);
    const op = prisma._ops[0];
    expect(op.attemptCount).toBe(1);
    expect(op.phase).toBe('SUBMITTED');

    // INVARIANT: No fake external attempt was created!
    const attemptStore = new ExecutionAttemptStore(prisma);
    const recordedAttempts = await attemptStore.listAttempts(workspaceId, op.id);
    expect(recordedAttempts).toHaveLength(0);
  });

  it('11. Synchronous ERP execution success records real EXECUTE Attempt #1 with SUCCEEDED status', async () => {
    const prisma = createMockPrisma();
    const actionId = 'act-po-sync-success-1';
    const actionRow = {
      id: actionId,
      workspaceId,
      actionType: 'CREATE_PURCHASE_ORDER',
      target: {
        connectionId: 'erp-sync-1',
        syncExecution: true, // Synchronous path
        provider: 'simulator-erp',
      },
      parameters: {
        supplierId: 'sup-202',
        lines: [{ skuId: 'sku-2', quantity: 15, unitCostMinor: 500 }],
      },
      riskLevel: 'low',
      needApproval: true,
      status: 'WAITING_APPROVAL',
      createdAt: now,
      updatedAt: now,
    };
    prisma._actions.push(actionRow);

    // Mock ERP createPurchaseOrder to succeed
    jest.spyOn(SimulatorERPAdapter.prototype, 'createPurchaseOrder').mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      data: {
        externalId: 'PO-SYNC-EXT-998',
        supplierId: 'sup-202',
        status: 'CONFIRMED',
        lines: [{ skuId: 'sku-2', quantity: 15, unitCostMinor: 500 }],
        totalAmountMinor: 7500,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });

    const svc = new ActionLayerService(prisma, {} as any, {} as any);
    await svc.approve(workspaceId, actionId, 'user-tester');
    const result = await svc.execute(workspaceId, actionId, 'user-tester');

    expect(result.status).toBe('SUCCESS');

    // Verify exactly 1 EXECUTE attempt was recorded
    const op = prisma._ops[0];
    const attemptStore = new ExecutionAttemptStore(prisma);
    const recordedAttempts = await attemptStore.listAttempts(workspaceId, op.id);

    expect(recordedAttempts).toHaveLength(1);
    const attempt = recordedAttempts[0];
    expect(attempt.attemptNo).toBe(1);
    expect(attempt.attemptType).toBe('EXECUTE');
    expect(attempt.provider).toBe('simulator-erp');
    expect(attempt.status).toBe('SUCCEEDED');
    expect(attempt.effect).toBe('APPLIED');
    expect(attempt.recovery).toBe('NONE');
    expect((attempt.evidence as any)?.externalId).toBe('PO-SYNC-EXT-998');
  });

  it('11b. Synchronous ERP execution timeout records real EXECUTE Attempt #1 with TIMEOUT status', async () => {
    const prisma = createMockPrisma();
    const actionId = 'act-po-sync-timeout-1';
    const actionRow = {
      id: actionId,
      workspaceId,
      actionType: 'CREATE_PURCHASE_ORDER',
      target: {
        connectionId: 'erp-sync-2',
        syncExecution: true,
        provider: 'simulator-erp',
      },
      parameters: {
        supplierId: 'sup-303',
        lines: [{ skuId: 'sku-3', quantity: 20, unitCostMinor: 100 }],
      },
      riskLevel: 'low',
      needApproval: true,
      status: 'WAITING_APPROVAL',
      createdAt: now,
      updatedAt: now,
    };
    prisma._actions.push(actionRow);

    // Mock ERP createPurchaseOrder to return a 504 TIMEOUT error
    jest.spyOn(SimulatorERPAdapter.prototype, 'createPurchaseOrder').mockResolvedValueOnce({
      success: false,
      statusCode: 504,
      errorCode: 'TIMEOUT',
      errorMessage: 'ERP gateway timed out after 30000ms',
    });

    const svc = new ActionLayerService(prisma, {} as any, {} as any);
    await svc.approve(workspaceId, actionId, 'user-tester');
    const result = await svc.execute(workspaceId, actionId, 'user-tester');

    // On timeout, action stays in EXECUTING with QUERY recovery scheduled
    expect(result.status).toBe('EXECUTING');

    const op = prisma._ops[0];
    const attemptStore = new ExecutionAttemptStore(prisma);
    const recordedAttempts = await attemptStore.listAttempts(workspaceId, op.id);

    expect(recordedAttempts).toHaveLength(1);
    const attempt = recordedAttempts[0];
    expect(attempt.attemptNo).toBe(1);
    expect(attempt.attemptType).toBe('EXECUTE');
    expect(attempt.status).toBe('TIMEOUT');
    expect(attempt.errorClass).toBe('TIMEOUT');
    expect(attempt.effect).toBe('UNKNOWN');
    expect(attempt.recovery).toBe('QUERY');
  });
});
