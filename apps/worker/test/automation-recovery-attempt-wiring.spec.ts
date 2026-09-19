import { SimulatorERPAdapter } from '@crosspilot/integrations';
import { ExecutionAttemptStore } from '@crosspilot/db';
import { processAutomationRecovery } from '../src/processors/automation-recovery.processor.js';

describe('Phase 5.1 Runtime Wiring: Automation Recovery Attempt History', () => {
  const now = new Date('2026-09-19T12:00:00.000Z');

  function createMockPrisma() {
    const ops: any[] = [];
    const attempts: any[] = [];
    const actions: any[] = [];

    const prisma: any = {
      automationOperation: {
        findMany: jest.fn(async ({ where }: { where?: any } = {}) => {
          // Return ops that are due (lease expired or null, and match recovery criteria)
          return ops.map((op) => ({ ...op }));
        }),
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          const op = ops.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.workspaceId && o.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return op ? { ...op } : null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          const op = ops.find((o) => o.id === where.id);
          return op ? { ...op } : null;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const op = ops.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.workspaceId && o.workspaceId !== where.workspaceId) return false;
            if (where.version !== undefined && o.version !== where.version) return false;
            return true;
          });
          if (!op) return { count: 0 };

          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'increment' in (v as any)) {
              op[k] = (op[k] || 0) + (v as any).increment;
            } else {
              op[k] = v;
            }
          }
          op.updatedAt = new Date();
          return { count: 1 };
        }),
      },

      executionAttempt: {
        create: jest.fn(async ({ data }: { data: any }) => {
          const record = {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
        findMany: jest.fn(async ({ where }: { where: any }) => {
          return attempts
            .filter((a) => {
              if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
              if (where.operationId && a.operationId !== where.operationId) return false;
              return true;
            })
            .map((a) => ({ ...a }));
        }),
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          const found = attempts.find((a) => {
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            if (where.operationId && a.operationId !== where.operationId) return false;
            if (where.attemptNo && a.attemptNo !== where.attemptNo) return false;
            return true;
          });
          return found ? { ...found } : null;
        }),
      },

      plannedAction: {
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          const act = actions.find((a) => a.id === where.id);
          return act ? { ...act } : null;
        }),
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          const act = actions.find((a) => a.id === where.id);
          return act ? { ...act } : null;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          let count = 0;
          for (const act of actions) {
            if (act.id === where.id && (!where.workspaceId || act.workspaceId === where.workspaceId)) {
              Object.assign(act, data, { updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        }),
      },

      purchaseOrder: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          // Return an existing local purchase order to allow syncLocalPurchaseOrder to succeed idempotently
          return {
            id: 'po-mock-local-1',
            workspaceId: where.workspaceId,
            poNumber: where.poNumber,
          };
        }),
      },

      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sup-mock-1', name: 'Mock Supplier' }),
      },

      sku: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sku-mock-1', name: 'Mock SKU' }),
      },

      _ops: ops,
      _attempts: attempts,
      _actions: actions,
    };

    return prisma;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. SUBMITTED + QUERY recovery claims operation, records Attempt with attemptType QUERY, and finishes with SUCCEEDED on match', async () => {
    const prisma = createMockPrisma();
    const workspaceId = 'ws-recovery-query';
    const opId = 'op-query-101';
    const actionId = 'act-query-101';

    // Initial state: Operation timed out during initial execution (attemptCount=1, phase=SUBMITTED, recovery=QUERY)
    const initialOp = {
      id: opId,
      workspaceId,
      actionId,
      connectionId: 'conn-erp-1',
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey: `idemp-${opId}`,
      payloadHash: 'hash-query-1',
      approvedPayloadHash: 'hash-query-1',
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
      phase: 'SUBMITTED',
      effect: 'UNKNOWN',
      recovery: 'QUERY',
      attemptCount: 1,
      version: 1,
      leaseOwner: null,
      leaseUntil: null,
      evidence: { traceId: 'trace-query-recovery-1' },
      createdAt: now,
      updatedAt: now,
    };
    prisma._ops.push(initialOp);

    const actionRow = {
      id: actionId,
      workspaceId,
      actionType: 'CREATE_PURCHASE_ORDER',
      status: 'EXECUTING',
      parameters: {
        supplierId: 'sup-1',
        lines: [{ skuId: 'sku-1', quantity: 10, unitCostMinor: 100 }],
      },
    };
    prisma._actions.push(actionRow);

    // Mock ERP getPurchaseOrder to simulate remote order was indeed created and matches local parameters
    const remoteOrderExternalId = 'ERP-PO-EXT-QUERY-MATCH-999';
    jest.spyOn(SimulatorERPAdapter.prototype, 'getPurchaseOrder').mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      data: {
        externalId: remoteOrderExternalId,
        supplierId: 'sup-1',
        status: 'CONFIRMED',
        lines: [{ skuId: 'sku-1', quantity: 10, unitCostMinor: 100 }],
        totalAmountMinor: 1000,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });

    // Run recovery sweep
    const sweepResult = await processAutomationRecovery(prisma, {
      workerId: 'worker-query-sweep',
    });

    expect(sweepResult.recovered).toBe(1);

    // Verify parent AutomationOperation converged to COMPLETED / APPLIED
    const op = prisma._ops.find((o: any) => o.id === opId);
    expect(op.phase).toBe('COMPLETED');
    expect(op.effect).toBe('APPLIED');
    expect(op.recovery).toBe('NONE');
    expect(op.attemptCount).toBe(2); // Attempt #2

    // Verify ExecutionAttempt history:
    // Exactly 1 new attempt recorded for this recovery (Attempt #2)
    const attemptStore = new ExecutionAttemptStore(prisma);
    const recordedAttempts = await attemptStore.listAttempts(workspaceId, opId);
    expect(recordedAttempts).toHaveLength(1);

    const attempt = recordedAttempts[0];
    expect(attempt.attemptNo).toBe(2);
    expect(attempt.attemptType).toBe('QUERY');
    expect(attempt.provider).toBe('simulator-erp');
    expect(attempt.workerId).toBe('worker-query-sweep');
    expect(attempt.status).toBe('SUCCEEDED');
    expect(attempt.effect).toBe('APPLIED');
    expect(attempt.recovery).toBe('NONE');
    expect(attempt.traceId).toBe('trace-query-recovery-1');
    expect((attempt.evidence as any)?.externalId).toBe(remoteOrderExternalId);
  });

  it('2. READY + RETRY recovery claims operation, records Attempt with attemptType RETRY, and finishes with SUCCEEDED on successful retry', async () => {
    const prisma = createMockPrisma();
    const workspaceId = 'ws-recovery-retry';
    const opId = 'op-retry-202';
    const actionId = 'act-retry-202';

    // Initial state: Operation hit a transient error and was scheduled for retry (attemptCount=1, phase=READY, recovery=RETRY)
    const initialOp = {
      id: opId,
      workspaceId,
      actionId,
      connectionId: 'conn-erp-2',
      operationKind: 'CREATE_PURCHASE_ORDER',
      idempotencyKey: `idemp-${opId}`,
      payloadHash: 'hash-retry-2',
      approvedPayloadHash: 'hash-retry-2',
      mode: 'SIMULATOR',
      provider: 'simulator-erp',
      phase: 'READY',
      effect: 'NOT_APPLIED',
      recovery: 'RETRY',
      attemptCount: 1,
      version: 1,
      leaseOwner: null,
      leaseUntil: null,
      evidence: { traceId: 'trace-retry-recovery-2' },
      createdAt: now,
      updatedAt: now,
    };
    prisma._ops.push(initialOp);

    const actionRow = {
      id: actionId,
      workspaceId,
      actionType: 'CREATE_PURCHASE_ORDER',
      status: 'EXECUTING',
      parameters: {
        supplierId: 'sup-2',
        lines: [{ skuId: 'sku-2', quantity: 5, unitCostMinor: 200 }],
      },
    };
    prisma._actions.push(actionRow);

    // Mock ERP createPurchaseOrder to succeed on retry
    const retryOrderExternalId = 'ERP-PO-EXT-RETRY-SUCCESS-888';
    jest.spyOn(SimulatorERPAdapter.prototype, 'createPurchaseOrder').mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      data: {
        externalId: retryOrderExternalId,
        supplierId: 'sup-2',
        status: 'CONFIRMED',
        lines: [{ skuId: 'sku-2', quantity: 5, unitCostMinor: 200 }],
        totalAmountMinor: 1000,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });

    // Run recovery sweep
    const sweepResult = await processAutomationRecovery(prisma, {
      workerId: 'worker-retry-sweep',
    });

    expect(sweepResult.recovered).toBe(1);

    // Verify parent AutomationOperation converged to COMPLETED / APPLIED
    const op = prisma._ops.find((o: any) => o.id === opId);
    expect(op.phase).toBe('COMPLETED');
    expect(op.effect).toBe('APPLIED');
    expect(op.recovery).toBe('NONE');
    expect(op.attemptCount).toBe(2); // Attempt #2

    // Verify ExecutionAttempt history:
    // Exactly 1 new attempt recorded for this retry (Attempt #2)
    const attemptStore = new ExecutionAttemptStore(prisma);
    const recordedAttempts = await attemptStore.listAttempts(workspaceId, opId);
    expect(recordedAttempts).toHaveLength(1);

    const attempt = recordedAttempts[0];
    expect(attempt.attemptNo).toBe(2);
    expect(attempt.attemptType).toBe('RETRY');
    expect(attempt.provider).toBe('simulator-erp');
    expect(attempt.workerId).toBe('worker-retry-sweep');
    expect(attempt.status).toBe('SUCCEEDED');
    expect(attempt.effect).toBe('APPLIED');
    expect(attempt.recovery).toBe('NONE');
    expect(attempt.traceId).toBe('trace-retry-recovery-2');
    expect((attempt.evidence as any)?.externalId).toBe(retryOrderExternalId);
  });
});
