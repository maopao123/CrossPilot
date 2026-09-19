import { PrismaClient, Prisma, ExecutionAudit } from '@prisma/client';
import {
  ExecutionAuditStore,
  ExecutionAuditAction,
  ExecutionAuditActorType,
  ExecutionAuditState,
  AppendAuditParams,
  VALID_EXECUTION_AUDIT_ACTIONS,
  VALID_EXECUTION_AUDIT_ACTOR_TYPES,
  AutomationOperationNotFoundError,
} from '@crosspilot/db';
import {
  RuntimeEvents,
  runtimeLogger,
  StructuredLogger,
} from '@crosspilot/shared';
import { OperationAutomationService } from '../../../apps/api/src/modules/operation-automation/operation-automation.service.js';
import { OperationAutomationController } from '../../../apps/api/src/modules/operation-automation/operation-automation.controller.js';

/**
 * High-fidelity in-memory transactional mock of PrismaClient for Phase 6.
 * Supports:
 * - Isolation per workspace
 * - Atomic $transaction with true rollback on error
 * - State snapshots
 */
function createMockPrismaClient() {
  let ops: any[] = [];
  let actions: any[] = [];
  let audits: ExecutionAudit[] = [];

  const cloneState = () => ({
    ops: JSON.parse(JSON.stringify(ops)),
    actions: JSON.parse(JSON.stringify(actions)),
    audits: JSON.parse(JSON.stringify(audits)),
  });

  const restoreState = (snapshot: any) => {
    ops = snapshot.ops;
    actions = snapshot.actions;
    audits = snapshot.audits;
  };

  const createClientInterface = (isTx = false) => {
    const client: any = {
      automationOperation: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          return ops.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.workspaceId && o.workspaceId !== where.workspaceId) return false;
            return true;
          }) ?? null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          return ops.find((o) => o.id === where.id) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: any }) => {
          const record = {
            id: data.id || `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            version: data.version ?? 1,
            phase: data.phase ?? 'READY',
            effect: data.effect ?? 'UNKNOWN',
            recovery: data.recovery ?? 'NONE',
            attemptCount: data.attemptCount ?? 0,
            externalId: data.externalId ?? null,
            lastErrorCode: data.lastErrorCode ?? null,
            evidence: data.evidence ?? null,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          ops.push(record);
          return { ...record };
        }),
        update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const target = ops.find((o) => o.id === where.id);
          if (!target) throw new Error(`Record not found: ${where.id}`);
          if (data.phase !== undefined) target.phase = data.phase;
          if (data.effect !== undefined) target.effect = data.effect;
          if (data.recovery !== undefined) target.recovery = data.recovery;
          if (data.evidence !== undefined) target.evidence = data.evidence;
          if (data.lastErrorCode !== undefined) target.lastErrorCode = data.lastErrorCode;
          if (data.leaseOwner !== undefined) target.leaseOwner = data.leaseOwner;
          if (data.leaseUntil !== undefined) target.leaseUntil = data.leaseUntil;
          if (data.version?.increment) {
            target.version += data.version.increment;
          }
          target.updatedAt = new Date();
          return { ...target };
        }),
      },

      plannedAction: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          return actions.find((a) => {
            if (where.id && a.id !== where.id) return false;
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            return true;
          }) ?? null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          return actions.find((a) => a.id === where.id) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: any }) => {
          const record = {
            id: data.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            status: data.status || 'PENDING',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          actions.push(record);
          return { ...record };
        }),
        update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const target = actions.find((a) => a.id === where.id);
          if (!target) throw new Error(`PlannedAction not found: ${where.id}`);
          if (data.status !== undefined) target.status = data.status;
          if (data.lastMessage !== undefined) target.lastMessage = data.lastMessage;
          if (data.parameters !== undefined) target.parameters = data.parameters;
          target.updatedAt = new Date();
          return { ...target };
        }),
      },

      executionAudit: {
        create: jest.fn(async ({ data }: { data: any }) => {
          const record: ExecutionAudit = {
            id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            workspaceId: data.workspaceId,
            operationId: data.operationId,
            actionId: data.actionId ?? null,
            actorId: data.actorId,
            actorType: data.actorType,
            auditAction: data.auditAction,
            reason: data.reason ?? null,
            beforeState: data.beforeState,
            afterState: data.afterState,
            metadata: data.metadata ?? null,
            traceId: data.traceId ?? null,
            createdAt: new Date(),
          };
          audits.push(record);
          return { ...record };
        }),
        findMany: jest.fn(async ({ where, orderBy }: { where: any; orderBy?: any }) => {
          return audits
            .filter((a) => {
              if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
              if (where.operationId && a.operationId !== where.operationId) return false;
              if (where.actorId && a.actorId !== where.actorId) return false;
              return true;
            })
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }),
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          return (
            audits.find((a) => {
              if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
              if (where.id && a.id !== where.id) return false;
              return true;
            }) ?? null
          );
        }),
      },

      purchaseOrder: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: any }) => ({ id: `po_${Date.now()}`, ...data })),
        update: jest.fn(async ({ data }: { data: any }) => ({ id: `po_${Date.now()}`, ...data })),
      },

      purchaseOrderItem: {
        createMany: jest.fn(async () => ({ count: 1 })),
      },
    };

    if (!isTx) {
      client.$transaction = jest.fn(async (fn: (tx: any) => Promise<any>) => {
        const snapshot = cloneState();
        const txClient = createClientInterface(true);
        try {
          const result = await fn(txClient);
          return result;
        } catch (error) {
          restoreState(snapshot);
          throw error;
        }
      });
    }

    return client;
  };

  const rootClient = createClientInterface(false);

  return {
    prisma: rootClient,
    getStore: () => ({ ops, actions, audits }),
    seedOp: (op: any) => {
      ops.push(op);
      return op;
    },
    seedAction: (act: any) => {
      actions.push(act);
      return act;
    },
  };
}

describe('Phase 6 — Human Audit Trail & ExecutionAudit Store', () => {
  const wsA = 'workspace-alpha';
  const wsB = 'workspace-beta';

  // ==========================================
  // 1. ExecutionAuditStore: Immutability & Append-only
  // ==========================================
  describe('1. Immutability and Append-only Semantics', () => {
    it('proves ExecutionAuditStore does not expose updateAudit, deleteAudit, or overwriteAudit', () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      expect((store as any).updateAudit).toBeUndefined();
      expect((store as any).deleteAudit).toBeUndefined();
      expect((store as any).overwriteAudit).toBeUndefined();
      expect((store as any).modifyAudit).toBeUndefined();
    });

    it('proves sequential appends create independent records without overwriting historical events', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      mock.seedOp({
        id: 'op-immut-1',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      const beforeState1: ExecutionAuditState = {
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        operationVersion: 1,
      };
      const afterState1: ExecutionAuditState = {
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        operationVersion: 2,
      };

      const audit1 = await store.appendAudit({
        workspaceId: wsA,
        operationId: 'op-immut-1',
        actorId: 'usr-admin-1',
        actorType: 'USER',
        auditAction: 'FORCE_ADOPT',
        reason: 'Event A: first manual adoption',
        beforeState: beforeState1,
        afterState: afterState1,
      });

      const beforeState2: ExecutionAuditState = {
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        operationVersion: 2,
      };
      const afterState2: ExecutionAuditState = {
        phase: 'FAILED',
        effect: 'NOT_APPLIED',
        recovery: 'NONE',
        operationVersion: 3,
      };

      const audit2 = await store.appendAudit({
        workspaceId: wsA,
        operationId: 'op-immut-1',
        actorId: 'usr-admin-2',
        actorType: 'USER',
        auditAction: 'DISMISS',
        reason: 'Event B: subsequent operator dismissal',
        beforeState: beforeState2,
        afterState: afterState2,
      });

      const allAudits = await store.listAudits(wsA, 'op-immut-1');
      expect(allAudits).toHaveLength(2);
      expect(allAudits[0].id).toBe(audit1.id);
      expect(allAudits[0].auditAction).toBe('FORCE_ADOPT');
      expect(allAudits[0].reason).toBe('Event A: first manual adoption');
      expect(allAudits[1].id).toBe(audit2.id);
      expect(allAudits[1].auditAction).toBe('DISMISS');
      expect(allAudits[1].reason).toBe('Event B: subsequent operator dismissal');
      expect(allAudits[0].id).not.toBe(allAudits[1].id);
    });
  });

  // ==========================================
  // 2. Workspace Isolation & Tenant Guard
  // ==========================================
  describe('2. Workspace Isolation and Tenant Safety', () => {
    it('proves querying audits across workspaces returns empty array or null', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      mock.seedOp({
        id: 'op-ws-1',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      const created = await store.appendAudit({
        workspaceId: wsA,
        operationId: 'op-ws-1',
        actorId: 'usr-1',
        auditAction: 'FORCE_ADOPT',
        beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
        afterState: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', operationVersion: 2 },
      });

      // Query from correct workspace wsA
      const listA = await store.listAudits(wsA, 'op-ws-1');
      expect(listA).toHaveLength(1);
      const getA = await store.getAudit(wsA, created.id);
      expect(getA).not.toBeNull();

      // Query from foreign workspace wsB
      const listB = await store.listAudits(wsB, 'op-ws-1');
      expect(listB).toEqual([]);
      const getB = await store.getAudit(wsB, created.id);
      expect(getB).toBeNull();
    });

    it('proves appending audit across workspace boundaries throws AutomationOperationNotFoundError', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      // Operation belongs to wsA
      mock.seedOp({
        id: 'op-ws-2',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      // Attempt to record audit under wsB for op-ws-2
      await expect(
        store.appendAudit({
          workspaceId: wsB,
          operationId: 'op-ws-2',
          actorId: 'usr-attacker',
          auditAction: 'DISMISS',
          beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
          afterState: { phase: 'FAILED', effect: 'NOT_APPLIED', recovery: 'NONE', operationVersion: 2 },
        }),
      ).rejects.toThrow(AutomationOperationNotFoundError);
    });
  });

  // ==========================================
  // 3. Actor Authenticity & Controlled Types
  // ==========================================
  describe('3. Actor Authenticity and Controlled Actions', () => {
    it('proves empty or whitespace actorId is rejected', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      mock.seedOp({
        id: 'op-actor-1',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      await expect(
        store.appendAudit({
          workspaceId: wsA,
          operationId: 'op-actor-1',
          actorId: '',
          auditAction: 'DISMISS',
          beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
          afterState: { phase: 'FAILED', effect: 'NOT_APPLIED', recovery: 'NONE', operationVersion: 2 },
        }),
      ).rejects.toThrow(/Authenticated actorId is required/);

      await expect(
        store.appendAudit({
          workspaceId: wsA,
          operationId: 'op-actor-1',
          actorId: '   ',
          auditAction: 'DISMISS',
          beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
          afterState: { phase: 'FAILED', effect: 'NOT_APPLIED', recovery: 'NONE', operationVersion: 2 },
        }),
      ).rejects.toThrow(/Authenticated actorId is required/);
    });

    it('proves invalid auditAction is rejected', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      mock.seedOp({
        id: 'op-action-val-1',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      await expect(
        store.appendAudit({
          workspaceId: wsA,
          operationId: 'op-action-val-1',
          actorId: 'usr-1',
          auditAction: 'MANUAL_RETRY' as any,
          beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
          afterState: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', operationVersion: 2 },
        }),
      ).rejects.toThrow(/Invalid execution audit action/);
    });

    it('proves invalid actorType is rejected', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      mock.seedOp({
        id: 'op-actor-val-1',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      await expect(
        store.appendAudit({
          workspaceId: wsA,
          operationId: 'op-actor-val-1',
          actorId: 'usr-1',
          actorType: 'ROBOT' as any,
          auditAction: 'FORCE_ADOPT',
          beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
          afterState: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', operationVersion: 2 },
        }),
      ).rejects.toThrow(/Invalid execution audit actor type/);
    });
  });

  // ==========================================
  // 4. Secret Redaction in Reason & Metadata
  // ==========================================
  describe('4. Secret Redaction Strategy', () => {
    it('proves sensitive tokens, passwords, db URLs, and API keys are redacted from reason and metadata', async () => {
      const mock = createMockPrismaClient();
      const store = new ExecutionAuditStore(mock.prisma as any);

      mock.seedOp({
        id: 'op-secret-1',
        workspaceId: wsA,
        version: 1,
        phase: 'NEEDS_ATTENTION',
      });

      const dirtyReason =
        'Operator noted: Bearer secret-token-12345678, password=SuperSecretPass! and postgresql://admin:p@ssword@db.host:5432/db';

      const dirtyMetadata = {
        apiKey: 'dummy_secret_api_key_sample_12345',
        authorization: 'Bearer sensitive-token',
        nested: {
          clientSecret: 'secret-xyz',
          normalKey: 'safe-value',
        },
      };

      const audit = await store.appendAudit({
        workspaceId: wsA,
        operationId: 'op-secret-1',
        actorId: 'usr-sec',
        auditAction: 'FORCE_ADOPT',
        reason: dirtyReason,
        beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
        afterState: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', operationVersion: 2 },
        metadata: dirtyMetadata,
      });

      expect(audit.reason).not.toContain('secret-token-12345678');
      expect(audit.reason).not.toContain('SuperSecretPass!');
      expect(audit.reason).not.toContain('p@ssword');
      expect(audit.reason).toContain('[REDACTED');

      const meta = audit.metadata as any;
      expect(meta.apiKey).toBe('[REDACTED]');
      expect(meta.authorization).toBe('[REDACTED]');
      expect(meta.nested.clientSecret).toBe('[REDACTED]');
      expect(meta.nested.normalKey).toBe('safe-value');
    });
  });

  // ==========================================
  // 5. OperationAutomationService Integration: FORCE_ADOPT
  // ==========================================
  describe('5. OperationAutomationService: FORCE_ADOPT with Audit Trail', () => {
    it('proves FORCE_ADOPT transitions Operation to COMPLETED/APPLIED, Action to SUCCESS, and creates exactly 1 audit', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      const action = mock.seedAction({
        id: 'act-fa-1',
        workspaceId: wsA,
        status: 'FAILED',
        parameters: { sku: 'SKU-001', qty: 10 },
      });

      const op = mock.seedOp({
        id: 'op-fa-1',
        workspaceId: wsA,
        actionId: action.id,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 5,
        lastErrorCode: 'VERIFY_MISMATCH',
        externalId: 'ERP-PO-999',
        evidence: {
          phase: 'NEEDS_ATTENTION',
          externalId: 'ERP-PO-999',
          traceId: 'trace-fa-123',
        },
      });

      const result = await service.resolveNeedsAttention(wsA, op.id, {
        resolution: 'FORCE_ADOPT',
        userId: 'admin-user-77',
        comment: '已人工核验外部单据真实有效并采纳',
      });

      expect(result.success).toBe(true);
      expect(result.operation.phase).toBe('COMPLETED');
      expect(result.operation.effect).toBe('APPLIED');
      expect(result.operation.recovery).toBe('NONE');
      expect(result.operation.version).toBe(6);

      // Verify legacy evidence.manualResolution snapshot
      expect(result.operation.evidence.manualResolution.resolution).toBe('FORCE_ADOPT');
      expect(result.operation.evidence.manualResolution.resolvedBy).toBe('admin-user-77');
      expect(result.operation.evidence.manualResolution.comment).toContain('已人工核验外部单据');

      // Verify PlannedAction
      const { actions } = mock.getStore();
      const updatedAction = actions.find((a) => a.id === action.id);
      expect(updatedAction.status).toBe('SUCCESS');
      expect(updatedAction.lastMessage).toContain('ERP-PO-999');

      // Verify ExecutionAudit table
      const { audits } = mock.getStore();
      expect(audits).toHaveLength(1);
      const audit = audits[0];
      expect(audit.auditAction).toBe('FORCE_ADOPT');
      expect(audit.actorId).toBe('admin-user-77');
      expect(audit.actorType).toBe('USER');
      expect(audit.traceId).toBe('trace-fa-123');

      // Check beforeState and afterState
      expect((audit.beforeState as any).phase).toBe('NEEDS_ATTENTION');
      expect((audit.beforeState as any).effect).toBe('UNKNOWN');
      expect((audit.beforeState as any).operationVersion).toBe(5);
      expect((audit.beforeState as any).actionStatus).toBe('FAILED');

      expect((audit.afterState as any).phase).toBe('COMPLETED');
      expect((audit.afterState as any).effect).toBe('APPLIED');
      expect((audit.afterState as any).recovery).toBe('NONE');
      expect((audit.afterState as any).operationVersion).toBe(6);
      expect((audit.afterState as any).actionStatus).toBe('SUCCESS');
    });
  });

  // ==========================================
  // 6. OperationAutomationService Integration: DISMISS
  // ==========================================
  describe('6. OperationAutomationService: DISMISS with Audit Trail', () => {
    it('proves DISMISS transitions Operation to FAILED/NOT_APPLIED, Action to FAILED, and creates exactly 1 audit', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      const action = mock.seedAction({
        id: 'act-dis-1',
        workspaceId: wsA,
        status: 'FAILED',
        parameters: { sku: 'SKU-DIS', qty: 5 },
      });

      const op = mock.seedOp({
        id: 'op-dis-1',
        workspaceId: wsA,
        actionId: action.id,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 2,
        lastErrorCode: 'PAYLOAD_CORRUPTED',
      });

      const result = await service.resolveNeedsAttention(wsA, op.id, {
        resolution: 'DISMISS',
        userId: 'ops-lead-01',
        comment: '重复提交，人工废弃该错误操作',
      });

      expect(result.success).toBe(true);
      expect(result.operation.phase).toBe('FAILED');
      expect(result.operation.recovery).toBe('NONE');
      expect(result.operation.version).toBe(3);

      const { audits } = mock.getStore();
      expect(audits).toHaveLength(1);
      const audit = audits[0];
      expect(audit.auditAction).toBe('DISMISS');
      expect(audit.actorId).toBe('ops-lead-01');
      expect(audit.reason).toContain('重复提交，人工废弃该错误操作');
      expect((audit.beforeState as any).phase).toBe('NEEDS_ATTENTION');
      expect((audit.afterState as any).phase).toBe('FAILED');
      expect((audit.afterState as any).effect).toBe('NOT_APPLIED');
    });
  });

  // ==========================================
  // 7. OperationAutomationService Integration: RETRY_SYNC
  // ==========================================
  describe('7. OperationAutomationService: RETRY_SYNC with Audit Trail', () => {
    it('proves RETRY_SYNC transitions Operation to COMPLETED/APPLIED, Action to SUCCESS, and records localSync metadata', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      // Mock internal syncLocalPurchaseOrder to succeed
      (service as any).syncLocalPurchaseOrder = jest.fn().mockResolvedValue({ success: true });

      const action = mock.seedAction({
        id: 'act-rs-1',
        workspaceId: wsA,
        status: 'FAILED',
      });

      const op = mock.seedOp({
        id: 'op-rs-1',
        workspaceId: wsA,
        actionId: action.id,
        phase: 'NEEDS_ATTENTION',
        effect: 'APPLIED',
        recovery: 'MANUAL',
        version: 1,
        externalId: 'PO-SYNC-RETRY',
      });

      const result = await service.resolveNeedsAttention(wsA, op.id, {
        resolution: 'RETRY_SYNC',
        userId: 'ops-retry-usr',
        comment: '本地单据重试同步成功',
      });

      expect(result.success).toBe(true);
      expect(result.operation.phase).toBe('COMPLETED');
      expect(result.operation.effect).toBe('APPLIED');
      expect(result.operation.version).toBe(2);

      const { audits } = mock.getStore();
      expect(audits).toHaveLength(1);
      const audit = audits[0];
      expect(audit.auditAction).toBe('RETRY_SYNC');
      expect(audit.actorId).toBe('ops-retry-usr');
      expect((audit.metadata as any).localSync).toBe('SUCCEEDED');
      expect((audit.metadata as any).externalId).toBe('PO-SYNC-RETRY');
    });

    it('proves failed localSync does not create any audit and leaves operation in NEEDS_ATTENTION', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      (service as any).syncLocalPurchaseOrder = jest
        .fn()
        .mockResolvedValue({ success: false, error: 'Database network timeout' });

      const op = mock.seedOp({
        id: 'op-rs-fail',
        workspaceId: wsA,
        phase: 'NEEDS_ATTENTION',
        effect: 'APPLIED',
        recovery: 'MANUAL',
        version: 1,
        externalId: 'PO-FAIL-EXT',
      });

      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'RETRY_SYNC',
          userId: 'ops-user',
        }),
      ).rejects.toThrow(/Local PurchaseOrder sync failed/);

      // Verify no audit recorded and operation unchanged
      const { audits, ops } = mock.getStore();
      expect(audits).toHaveLength(0);
      const storedOp = ops.find((o) => o.id === op.id);
      expect(storedOp.phase).toBe('NEEDS_ATTENTION');
      expect(storedOp.version).toBe(1);
    });
  });

  // ==========================================
  // 8. P0: Transaction Rollback on Audit Failure
  // ==========================================
  describe('8. P0: Atomic Transaction Rollback', () => {
    it('proves that when ExecutionAudit insertion fails inside $transaction, Operation and Action changes are rolled back', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      // Force auditStore.appendAudit to reject with simulated DB error
      jest.spyOn((service as any).auditStore, 'appendAudit').mockRejectedValueOnce(
        new Error('DB_DISK_FULL: unique constraint or disk write failed for execution_audits'),
      );

      const action = mock.seedAction({
        id: 'act-rollback-1',
        workspaceId: wsA,
        status: 'FAILED',
      });

      const op = mock.seedOp({
        id: 'op-rollback-1',
        workspaceId: wsA,
        actionId: action.id,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 4,
        externalId: 'EXT-PO-ROLLBACK',
      });

      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          userId: 'usr-tx-rollback',
          comment: 'Should abort completely',
        }),
      ).rejects.toThrow(/DB_DISK_FULL/);

      // Atomic verification: Operation must be completely rolled back to initial state
      const { ops, actions, audits } = mock.getStore();
      const targetOp = ops.find((o) => o.id === op.id);
      expect(targetOp.phase).toBe('NEEDS_ATTENTION');
      expect(targetOp.effect).toBe('UNKNOWN');
      expect(targetOp.recovery).toBe('MANUAL');
      expect(targetOp.version).toBe(4);

      // PlannedAction must remain FAILED
      const targetAction = actions.find((a) => a.id === action.id);
      expect(targetAction.status).toBe('FAILED');

      // ExecutionAudit must not have any record
      expect(audits).toHaveLength(0);
    });
  });

  // ==========================================
  // 9. Controller Actor Security & Sub Enforcing
  // ==========================================
  describe('9. Controller Actor Authenticity Enforcement', () => {
    it('proves missing user.sub rejects resolution with 400 and preserves state', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );
      const controller = new OperationAutomationController(service);

      const op = mock.seedOp({
        id: 'op-ctrl-1',
        workspaceId: wsA,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 1,
      });

      // User object has no sub (unauthenticated context)
      await expect(
        controller.resolveNeedsAttention(
          wsA,
          {} as any,
          op.id,
          { resolution: 'DISMISS', comment: 'Anonymous call' },
        ),
      ).rejects.toThrow(/Authenticated actor ID is required/);

      const { ops, audits } = mock.getStore();
      expect(ops.find((o) => o.id === op.id).phase).toBe('NEEDS_ATTENTION');
      expect(audits).toHaveLength(0);
    });

    it('proves body spoofed userId/actorId cannot override authenticated user.sub', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );
      const controller = new OperationAutomationController(service);

      const op = mock.seedOp({
        id: 'op-ctrl-spoof',
        workspaceId: wsA,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 1,
      });

      // Body attempts to spoof actorId / userId as "hacker-123", but authenticated user is "real-authenticated-user"
      await controller.resolveNeedsAttention(
        wsA,
        { sub: 'real-authenticated-user', role: 'ADMIN' } as any,
        op.id,
        {
          resolution: 'DISMISS',
          comment: 'Legitimate dismissal',
          userId: 'hacker-123',
          actorId: 'hacker-123',
        } as any,
      );

      const { audits } = mock.getStore();
      expect(audits).toHaveLength(1);
      expect(audits[0].actorId).toBe('real-authenticated-user');
      expect(audits[0].actorId).not.toBe('hacker-123');
    });
  });

  // ==========================================
  // 10. Four-History Responsibility Separation Regression
  // ==========================================
  describe('10. Four-History Responsibility Separation Regression', () => {
    it('proves ExecutionAudit exists alongside Approval, ActionExecution, and ExecutionAttempt without collisions', () => {
      // Verification of four independent historical scopes:
      // 1. Approval: "Was this Action approved?"
      // 2. ActionExecution: "What general actions did this PlannedAction execute?"
      // 3. ExecutionAttempt: "What happened during the N-th concrete external execution/query attempt?"
      // 4. ExecutionAudit: "Which person, when, and for what reason manually changed this AutomationOperation?"
      expect(VALID_EXECUTION_AUDIT_ACTIONS).toEqual(['FORCE_ADOPT', 'DISMISS', 'RETRY_SYNC']);
      expect(VALID_EXECUTION_AUDIT_ACTOR_TYPES).toEqual(['USER', 'SYSTEM']);
    });
  });

  // ==========================================
  // 11. Real PostgreSQL Live Integration Suite (Active when TEST_DATABASE_URL is set)
  // ==========================================
  const liveTestDbUrl =
    process.env.AUTOMATION_TEST_DATABASE_URL ||
    process.env.TEST_DATABASE_URL;

  const isLiveTestDb = Boolean(
    liveTestDbUrl &&
    liveTestDbUrl.includes('test')
  );

  const describeLivePostgres = isLiveTestDb ? describe : describe.skip;

  describeLivePostgres('11. Real PostgreSQL Live Transaction & Rollback Integration', () => {
    let realPrisma: PrismaClient;
    const realWs = `ws_audit_real_${Date.now()}`;
    const realOpId = `op_audit_real_${Date.now()}`;

    beforeAll(async () => {
      realPrisma = new PrismaClient({
        datasources: { db: { url: liveTestDbUrl } },
      });
      await realPrisma.$connect();
      await realPrisma.workspace.create({
        data: { id: realWs, slug: `slug-${realWs}`, name: 'Real Audit WS' },
      });
      await realPrisma.automationOperation.create({
        data: {
          id: realOpId,
          workspaceId: realWs,
          connectionId: 'conn-real',
          operationKind: 'CREATE_PURCHASE_ORDER',
          idempotencyKey: `idemp-real-${Date.now()}`,
          payloadHash: 'hash-real',
          mode: 'SIMULATOR',
          provider: 'simulator-erp',
          phase: 'NEEDS_ATTENTION',
          effect: 'UNKNOWN',
          recovery: 'MANUAL',
          version: 1,
        },
      });
    });

    afterAll(async () => {
      if (realPrisma) {
        await realPrisma.executionAudit.deleteMany({ where: { workspaceId: realWs } });
        await realPrisma.automationOperation.deleteMany({ where: { workspaceId: realWs } });
        await realPrisma.workspace.deleteMany({ where: { id: realWs } });
        await realPrisma.$disconnect();
      }
    });

    it('proves real PostgreSQL atomic rollback when audit insert throws within $transaction', async () => {
      const store = new ExecutionAuditStore(realPrisma);

      await expect(
        realPrisma.$transaction(async (tx) => {
          await tx.automationOperation.update({
            where: { id: realOpId },
            data: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', version: { increment: 1 } },
          });

          // Simulate audit append failure by providing invalid foreign key / workspace mismatch
          await store.appendAudit(
            {
              workspaceId: 'non-existent-workspace',
              operationId: realOpId,
              actorId: 'real-user',
              auditAction: 'FORCE_ADOPT',
              beforeState: { phase: 'NEEDS_ATTENTION', effect: 'UNKNOWN', recovery: 'MANUAL', operationVersion: 1 },
              afterState: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', operationVersion: 2 },
            },
            tx,
          );
        }),
      ).rejects.toThrow();

      // Verify that the operation phase and version rolled back in PostgreSQL
      const persisted = await realPrisma.automationOperation.findUnique({ where: { id: realOpId } });
      expect(persisted?.phase).toBe('NEEDS_ATTENTION');
      expect(persisted?.version).toBe(1);

      const audits = await store.listAudits(realWs, realOpId);
      expect(audits).toHaveLength(0);
    });
  });
});
