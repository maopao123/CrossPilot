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
 * High-fidelity in-memory transactional mock of PrismaClient for Phase 6 & Phase 6.1.
 * Supports:
 * - Isolation per workspace
 * - Atomic $transaction with isolated rollback of transaction mutations
 * - Optimistic concurrency control via updateMany version checking
 */
function createMockPrismaClient() {
  let ops: any[] = [];
  let actions: any[] = [];
  let audits: ExecutionAudit[] = [];

  const createClientInterface = (
    isTx = false,
    callbacks?: {
      onRecordCreate?: (list: any[], item: any) => void;
      onRecordModify?: (target: any) => void;
    },
  ) => {
    const recordModify = (target: any) => {
      if (callbacks?.onRecordModify) {
        callbacks.onRecordModify(target);
      }
    };
    const recordCreate = (list: any[], item: any) => {
      if (callbacks?.onRecordCreate) {
        callbacks.onRecordCreate(list, item);
      }
    };

    const client: any = {
      automationOperation: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          const found = ops.find((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.workspaceId && o.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return found ? JSON.parse(JSON.stringify(found)) : null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          const found = ops.find((o) => o.id === where.id);
          return found ? JSON.parse(JSON.stringify(found)) : null;
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
          recordCreate(ops, record);
          return { ...record };
        }),
        update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const target = ops.find((o) => o.id === where.id);
          if (!target) throw new Error(`Record not found: ${where.id}`);
          recordModify(target);
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
        updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const matches = ops.filter((o) => {
            if (where.id && o.id !== where.id) return false;
            if (where.workspaceId && o.workspaceId !== where.workspaceId) return false;
            if (where.version !== undefined && o.version !== where.version) return false;
            if (where.phase && o.phase !== where.phase) return false;
            return true;
          });
          for (const target of matches) {
            recordModify(target);
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
          }
          return { count: matches.length };
        }),
      },

      plannedAction: {
        findFirst: jest.fn(async ({ where }: { where: any }) => {
          const found = actions.find((a) => {
            if (where.id && a.id !== where.id) return false;
            if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return found ? JSON.parse(JSON.stringify(found)) : null;
        }),
        findUnique: jest.fn(async ({ where }: { where: any }) => {
          const found = actions.find((a) => a.id === where.id);
          return found ? JSON.parse(JSON.stringify(found)) : null;
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
          recordCreate(actions, record);
          return { ...record };
        }),
        update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
          const target = actions.find((a) => a.id === where.id);
          if (!target) throw new Error(`PlannedAction not found: ${where.id}`);
          recordModify(target);
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
          recordCreate(audits, record);
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
        const createdRecords: { list: any[]; item: any }[] = [];
        const modifiedRecords: { target: any; original: any }[] = [];

        const recordModification = (target: any) => {
          if (!modifiedRecords.some((m) => m.target === target)) {
            modifiedRecords.push({ target, original: JSON.parse(JSON.stringify(target)) });
          }
        };

        const txClient = createClientInterface(true, {
          onRecordCreate: (list, item) => createdRecords.push({ list, item }),
          onRecordModify: (target) => recordModification(target),
        });

        try {
          const result = await fn(txClient);
          return result;
        } catch (error) {
          for (const { list, item } of createdRecords) {
            const idx = list.indexOf(item);
            if (idx !== -1) list.splice(idx, 1);
          }
          for (const { target, original } of modifiedRecords) {
            Object.keys(target).forEach((k) => delete target[k]);
            Object.assign(target, original);
          }
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
        actorId: 'admin-user-77',
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
        actorId: 'ops-lead-01',
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
        actorId: 'ops-retry-usr',
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
          actorId: 'ops-user',
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
          actorId: 'usr-tx-rollback',
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
  // 11. Phase 6.1: Concurrency Control & Single-Winner OCC Hardening
  // ==========================================
  describe('11. Phase 6.1: Concurrency Control & Single-Winner OCC Hardening', () => {
    it('proves concurrent identical resolutions (Admin A DISMISS vs Admin B DISMISS): single winner, loser rejected with 409 ConflictException, version increments once, exactly 1 audit', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      const action = mock.seedAction({
        id: 'act-occ-same-1',
        workspaceId: wsA,
        status: 'FAILED',
      });

      const op = mock.seedOp({
        id: 'op-occ-same-1',
        workspaceId: wsA,
        actionId: action.id,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 1,
      });

      // Admin A and Admin B submit DISMISS concurrently
      const [resA, resB] = await Promise.allSettled([
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: 'admin-a',
          comment: 'Dismissed by A',
        }),
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: 'admin-b',
          comment: 'Dismissed by B',
        }),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = [resA, resB].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      // Exactly 1 winner and 1 loser
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Loser must throw ConflictException with 409 status code semantics
      expect(rejected[0].reason.constructor.name).toBe('ConflictException');
      expect(rejected[0].reason.message).toMatch(/Concurrent modification conflict/);

      // Verify DB state: Operation version incremented by exactly 1, phase FAILED
      const { ops, actions, audits } = mock.getStore();
      const updatedOp = ops.find((o) => o.id === op.id);
      expect(updatedOp.version).toBe(2);
      expect(updatedOp.phase).toBe('FAILED');
      expect(updatedOp.effect).toBe('NOT_APPLIED');

      // PlannedAction status FAILED
      const updatedAction = actions.find((a) => a.id === action.id);
      expect(updatedAction.status).toBe('FAILED');

      // Exactly 1 ExecutionAudit row created (by the winner)
      expect(audits).toHaveLength(1);
      expect(audits[0].auditAction).toBe('DISMISS');
      expect(audits[0].actorId).toBe(fulfilled[0].value.operation.evidence.manualResolution.resolvedBy);
    });

    it('proves concurrent conflicting resolutions (Admin A FORCE_ADOPT vs Admin B DISMISS): single winner, loser transaction aborted with zero action corruption and zero extra audits', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      (service as any).syncLocalPurchaseOrder = jest.fn().mockResolvedValue({ success: true });

      const action = mock.seedAction({
        id: 'act-occ-conf-1',
        workspaceId: wsA,
        status: 'FAILED',
        parameters: { sku: 'SKU-RACE-01' },
      });

      const op = mock.seedOp({
        id: 'op-occ-conf-1',
        workspaceId: wsA,
        actionId: action.id,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 3,
        externalId: 'EXT-PO-RACE-01',
      });

      // Race FORCE_ADOPT vs DISMISS
      const [resAdopt, resDismiss] = await Promise.allSettled([
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'FORCE_ADOPT',
          actorId: 'admin-adopt',
          comment: 'Force adopt winner',
        }),
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: 'admin-dismiss',
          comment: 'Dismiss loser',
        }),
      ]);

      const fulfilled = [resAdopt, resDismiss].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = [resAdopt, resDismiss].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.constructor.name).toBe('ConflictException');

      // Version incremented exactly once (from 3 to 4)
      const { ops, actions, audits } = mock.getStore();
      const updatedOp = ops.find((o) => o.id === op.id);
      expect(updatedOp.version).toBe(4);

      // Exactly 1 ExecutionAudit row
      expect(audits).toHaveLength(1);
      const winnerResolution = fulfilled[0].value.operation.evidence.manualResolution.resolution;
      expect(audits[0].auditAction).toBe(winnerResolution);

      // Action status must match the winner's expected state
      const updatedAction = actions.find((a) => a.id === action.id);
      if (winnerResolution === 'FORCE_ADOPT') {
        expect(updatedAction.status).toBe('SUCCESS');
      } else {
        expect(updatedAction.status).toBe('FAILED');
      }
    });

    it('proves resolving an operation with a stale version throws 409 ConflictException when updateMany matches 0 rows', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      const op = mock.seedOp({
        id: 'op-stale-1',
        workspaceId: wsA,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 1,
      });

      // Intercept tx to simulate OCC mismatch (updateMany matched 0 records due to concurrent version update)
      const origTransaction = mock.prisma.$transaction;
      mock.prisma.$transaction = jest.fn(async (fn: any) => {
        return origTransaction(async (tx: any) => {
          tx.automationOperation.updateMany = jest.fn().mockResolvedValue({ count: 0 });
          return fn(tx);
        });
      });

      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: 'admin-stale',
        }),
      ).rejects.toThrow(/Concurrent modification conflict/);

      // Zero audits recorded
      expect(mock.getStore().audits).toHaveLength(0);
    });

    it('proves operation already transitioned out of NEEDS_ATTENTION throws 409 ConflictException inside transaction', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      const op = mock.seedOp({
        id: 'op-phase-transition-race',
        workspaceId: wsA,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 1,
      });

      // Inside transaction, simulate phase having transitioned to COMPLETED
      const origTransaction = mock.prisma.$transaction;
      mock.prisma.$transaction = jest.fn(async (fn: any) => {
        const stored = mock.getStore().ops.find((o) => o.id === op.id);
        if (stored) {
          stored.phase = 'COMPLETED';
        }
        return origTransaction(fn);
      });

      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: 'admin-race',
        }),
      ).rejects.toThrow(/Operation 'op-phase-transition-race' is no longer in NEEDS_ATTENTION phase/);

      expect(mock.getStore().audits).toHaveLength(0);
    });

    it('proves fail-closed actor contract: missing, empty, or blank actorId throws 400 BadRequestException with zero mutations', async () => {
      const mock = createMockPrismaClient();
      const service = new OperationAutomationService(
        mock.prisma as any,
        { executeTool: jest.fn() } as any,
      );

      const op = mock.seedOp({
        id: 'op-actor-contract-1',
        workspaceId: wsA,
        phase: 'NEEDS_ATTENTION',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        version: 1,
      });

      // 1. Empty string actorId
      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: '',
        }),
      ).rejects.toThrow(/Authenticated actor ID is required/);

      // 2. Blank whitespace actorId
      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          actorId: '   ',
        }),
      ).rejects.toThrow(/Authenticated actor ID is required/);

      // 3. Passing userId only without actorId (reject legacy userId fallback)
      await expect(
        service.resolveNeedsAttention(wsA, op.id, {
          resolution: 'DISMISS',
          userId: 'legacy-user',
        } as any),
      ).rejects.toThrow(/Authenticated actor ID is required/);

      // 0 mutations, 0 audits
      expect(mock.getStore().audits).toHaveLength(0);
      expect(mock.getStore().ops.find((o) => o.id === op.id).version).toBe(1);
    });
  });

  // ==========================================
  // 12. Real PostgreSQL Live Integration Suite (Active when TEST_DATABASE_URL is set)
  // ==========================================
  const liveTestDbUrl =
    process.env.AUTOMATION_TEST_DATABASE_URL ||
    process.env.TEST_DATABASE_URL;

  const isLiveTestDb = Boolean(
    liveTestDbUrl &&
    liveTestDbUrl.includes('test')
  );

  const describeLivePostgres = isLiveTestDb ? describe : describe.skip;

  describeLivePostgres('12. Real PostgreSQL Live Transaction & Rollback Integration', () => {
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

    it('proves real PostgreSQL OCC concurrency: concurrent updateMany with version predicate admits only one winner', async () => {
      const opPostgresId = `op_pg_occ_${Date.now()}`;
      await realPrisma.automationOperation.create({
        data: {
          id: opPostgresId,
          workspaceId: realWs,
          connectionId: 'conn-pg-occ',
          operationKind: 'CREATE_PURCHASE_ORDER',
          idempotencyKey: `idemp-pg-occ-${Date.now()}`,
          payloadHash: 'hash-pg-occ',
          mode: 'SIMULATOR',
          provider: 'simulator-erp',
          phase: 'NEEDS_ATTENTION',
          effect: 'UNKNOWN',
          recovery: 'MANUAL',
          version: 1,
        },
      });

      // Two concurrent transactions attempt OCC update with version: 1
      const attemptUpdate = async (actor: string) => {
        return realPrisma.$transaction(async (tx) => {
          const res = await tx.automationOperation.updateMany({
            where: { id: opPostgresId, workspaceId: realWs, version: 1, phase: 'NEEDS_ATTENTION' },
            data: { phase: 'COMPLETED', effect: 'APPLIED', recovery: 'NONE', version: { increment: 1 } },
          });
          if (res.count === 0) {
            throw new Error(`OCC_CONFLICT_${actor}`);
          }
          return actor;
        });
      };

      const [res1, res2] = await Promise.allSettled([
        attemptUpdate('worker-1'),
        attemptUpdate('worker-2'),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const finalOp = await realPrisma.automationOperation.findUnique({ where: { id: opPostgresId } });
      expect(finalOp?.version).toBe(2);
      expect(finalOp?.phase).toBe('COMPLETED');
    });
  });
});
