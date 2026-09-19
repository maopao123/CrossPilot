import { PrismaClient, Prisma, ExecutionAttempt } from '@prisma/client';
import {
  ExecutionAttemptStore,
  ExecutionAttemptType,
  ExecutionAttemptStatus,
  ExecutionAttemptTerminalStatus,
  VALID_EXECUTION_ATTEMPT_TYPES,
  VALID_EXECUTION_ATTEMPT_TERMINAL_STATUSES,
  StartAttemptParams,
  FinishAttemptParams,
  AutomationOperationNotFoundError,
  AutomationOperationConflictError,
} from '@crosspilot/db';
import {
  RuntimeEvents,
  runtimeLogger,
  ExecutionErrorClass,
  normalizeExecutionError,
} from '@crosspilot/shared';

/**
 * High-fidelity in-memory mock of PrismaClient for ExecutionAttempt model.
 * Simulates real PostgreSQL unique constraints, filtering, sorting, and OCC updates.
 */
function createMockPrismaClient() {
  const store: ExecutionAttempt[] = [];
  const opStore: any[] = [];

  const automationOperation = {
    findFirst: jest.fn(async ({ where }: { where: any }) => {
      const found = opStore.find((op) => {
        if (where.id && op.id !== where.id) return false;
        if (where.workspaceId && op.workspaceId !== where.workspaceId) return false;
        return true;
      });
      return found ? { ...found } : null;
    }),
    findUnique: jest.fn(async ({ where }: { where: any }) => {
      const found = opStore.find((op) => op.id === where.id);
      return found ? { ...found } : null;
    }),
    create: jest.fn(async ({ data }: { data: any }) => {
      opStore.push(data);
      return { ...data };
    }),
  };

  const executionAttempt = {
    create: jest.fn(async ({ data }: { data: any }) => {
      // Check unique constraint @@unique([operationId, attemptNo])
      const duplicate = store.find(
        (a) => a.operationId === data.operationId && a.attemptNo === data.attemptNo,
      );
      if (duplicate) {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`operation_id`,`attempt_no`)',
          {
            code: 'P2002',
            clientVersion: '6.19.3',
            meta: { target: ['operation_id', 'attempt_no'] },
          },
        );
        throw error;
      }

      const record: ExecutionAttempt = {
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        workspaceId: data.workspaceId,
        operationId: data.operationId,
        attemptNo: data.attemptNo,
        attemptType: data.attemptType,
        provider: data.provider,
        workerId: data.workerId ?? null,
        traceId: data.traceId ?? null,
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt ?? null,
        durationMs: data.durationMs ?? null,
        errorClass: data.errorClass ?? null,
        errorCode: data.errorCode ?? null,
        errorMessage: data.errorMessage ?? null,
        effect: data.effect ?? null,
        recovery: data.recovery ?? null,
        evidence: data.evidence ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(record);
      return { ...record };
    }),

    findUnique: jest.fn(async ({ where }: { where: any }) => {
      if (where.operationId_attemptNo) {
        const { operationId, attemptNo } = where.operationId_attemptNo;
        const found = store.find(
          (a) => a.operationId === operationId && a.attemptNo === attemptNo,
        );
        return found ? { ...found } : null;
      }
      if (where.id) {
        const found = store.find((a) => a.id === where.id);
        return found ? { ...found } : null;
      }
      return null;
    }),

    findFirst: jest.fn(async ({ where }: { where: any }) => {
      const found = store.find((a) => {
        if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
        if (where.operationId && a.operationId !== where.operationId) return false;
        if (where.attemptNo !== undefined && a.attemptNo !== where.attemptNo) return false;
        return true;
      });
      return found ? { ...found } : null;
    }),

    findMany: jest.fn(async ({ where, orderBy }: { where: any; orderBy?: any }) => {
      let filtered = store.filter((a) => {
        if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
        if (where.operationId && a.operationId !== where.operationId) return false;
        return true;
      });

      if (orderBy?.attemptNo) {
        filtered = filtered.sort((a, b) =>
          orderBy.attemptNo === 'desc' ? b.attemptNo - a.attemptNo : a.attemptNo - b.attemptNo,
        );
      }
      return filtered.map((a) => ({ ...a }));
    }),

    updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
      let count = 0;
      for (const item of store) {
        if (
          item.workspaceId === where.workspaceId &&
          item.operationId === where.operationId &&
          item.attemptNo === where.attemptNo
        ) {
          Object.assign(item, data, { updatedAt: new Date() });
          count++;
        }
      }
      return { count };
    }),
  };

  return {
    automationOperation,
    executionAttempt,
    _store: store,
    _opStore: opStore,
  } as unknown as PrismaClient & { _store: ExecutionAttempt[]; _opStore: any[] };
}

describe('Phase 5 — Execution Attempt History Specification', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let attemptStore: ExecutionAttemptStore;

  const workspaceId = 'ws-test-attempt-1';
  const operationId = 'op-purchase-order-123';

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    mockPrisma._opStore.push({
      id: operationId,
      workspaceId,
      provider: 'simulator-erp',
      attemptCount: 1,
    });
    attemptStore = new ExecutionAttemptStore(mockPrisma);
  });

  describe('1. 1 Claim = 1 Attempt & Invariant Numbering', () => {
    it('creates Attempt #1 with attemptNo = 1 strictly aligned with claim() result', async () => {
      const started = await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
        workerId: 'api-worker-1',
        traceId: 'trc-abc-123',
      });

      expect(started).toBeDefined();
      expect(started.workspaceId).toBe(workspaceId);
      expect(started.operationId).toBe(operationId);
      expect(started.attemptNo).toBe(1);
      expect(started.attemptType).toBe('EXECUTE');
      expect(started.status).toBe('RUNNING');
      expect(started.provider).toBe('simulator-erp');
      expect(started.workerId).toBe('api-worker-1');
      expect(started.traceId).toBe('trc-abc-123');
      expect(started.finishedAt).toBeNull();
    });

    it('creates Attempt #2 on next claim with attemptNo = 2', async () => {
      // First attempt finishes
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'FAILED',
        errorClass: 'TRANSIENT',
        errorCode: 'ECONNRESET',
      });

      // Second attempt claimed by recovery worker
      const secondAttempt = await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        attemptType: 'RETRY',
        provider: 'simulator-erp',
        workerId: 'worker-instance-99',
      });

      expect(secondAttempt.attemptNo).toBe(2);
      expect(secondAttempt.attemptType).toBe('RETRY');

      const attempts = await attemptStore.listAttempts(workspaceId, operationId);
      expect(attempts).toHaveLength(2);
      expect(attempts[0].attemptNo).toBe(1);
      expect(attempts[1].attemptNo).toBe(2);
    });
  });

  describe('2. Idempotency & Unique Protection (operationId, attemptNo)', () => {
    it('returns existing attempt without error on duplicate startAttempt() calls with identical identity', async () => {
      const first = await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'shopify',
      });

      // Duplicate delivery of same attempt
      const duplicate = await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'shopify',
      });

      expect(duplicate.id).toBe(first.id);
      expect(duplicate.attemptNo).toBe(1);

      const all = await attemptStore.listAttempts(workspaceId, operationId);
      expect(all).toHaveLength(1);
    });
  });

  describe('3. Attempt Status Progression & Timing Calculation', () => {
    it('computes durationMs accurately when finishAttempt() is called', async () => {
      const startTime = new Date('2026-09-19T10:00:00.000Z');
      const finishTime = new Date('2026-09-19T10:00:02.500Z');

      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
        startedAt: startTime,
      });

      const finished = await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'SUCCEEDED',
        finishedAt: finishTime,
        effect: 'APPLIED',
        recovery: 'NONE',
        evidence: { externalId: 'PO-2026-001' },
      });

      expect(finished).not.toBeNull();
      expect(finished?.status).toBe('SUCCEEDED');
      expect(finished?.durationMs).toBe(2500);
      expect(finished?.finishedAt).toEqual(finishTime);
      expect(finished?.effect).toBe('APPLIED');
      expect(finished?.recovery).toBe('NONE');
    });

    it('records TIMEOUT status with UNKNOWN effect and QUERY recovery', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      const finished = await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'TIMEOUT',
        errorClass: 'TIMEOUT',
        errorCode: 'GATEWAY_TIMEOUT',
        errorMessage: 'ERP gateway timeout after 30000ms',
        effect: 'UNKNOWN',
        recovery: 'QUERY',
      });

      expect(finished?.status).toBe('TIMEOUT');
      expect(finished?.errorClass).toBe('TIMEOUT');
      expect(finished?.effect).toBe('UNKNOWN');
      expect(finished?.recovery).toBe('QUERY');
    });
  });

  describe('4. Secret Redaction & Sanitization Guarantee', () => {
    it('redacts Bearer tokens, passwords, and API keys from errorMessage', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      const sensitiveMsg =
        'Failed request with Authorization: Bearer sk-live-secret-token-12345 and password=SuperSecretPassword99!';
      const finished = await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'FAILED',
        errorMessage: sensitiveMsg,
      });

      expect(finished?.errorMessage).not.toContain('sk-live-secret-token-12345');
      expect(finished?.errorMessage).not.toContain('SuperSecretPassword99!');
      expect(finished?.errorMessage).toContain('Bearer [REDACTED]');
      expect(finished?.errorMessage).toContain('password=[REDACTED]');
    });

    it('redacts Shopify access tokens and postgres URLs from errorMessage', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'shopify',
      });

      const dbUrlMsg =
        'Connect error to postgresql://admin:p%40ssw0rd!@10.0.0.1:5432/main using token shpat_fa83bc294827da482';
      const finished = await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'FAILED',
        errorMessage: dbUrlMsg,
      });

      expect(finished?.errorMessage).not.toContain('p%40ssw0rd!');
      expect(finished?.errorMessage).not.toContain('shpat_fa83bc294827da482');
      expect(finished?.errorMessage).toContain('[REDACTED]');
    });

    it('clamps errorMessage length to 1000 characters maximum', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      const longError = 'E'.repeat(3000);
      const finished = await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'FAILED',
        errorMessage: longError,
      });

      expect(finished?.errorMessage?.length).toBe(1000);
    });

    it('sanitizes sensitive fields inside evidence payload', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      const sensitiveEvidence = {
        orderId: 'PO-999',
        authorization: 'Bearer secret_token_xyz',
        apiKey: 'api-key-live-1234',
        nested: {
          clientSecret: 'secret_value_here',
          safeField: 'ok',
        },
      };

      const finished = await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'FAILED',
        evidence: sensitiveEvidence,
      });

      const savedEvidence = finished?.evidence as any;
      expect(savedEvidence.orderId).toBe('PO-999');
      expect(savedEvidence.authorization).toBe('[REDACTED]');
      expect(savedEvidence.apiKey).toBe('[REDACTED]');
      expect(savedEvidence.nested.clientSecret).toBe('[REDACTED]');
      expect(savedEvidence.nested.safeField).toBe('ok');
    });
  });

  describe('5. Distinct Attempt Types: EXECUTE vs QUERY vs RETRY', () => {
    it('strictly differentiates initial write (EXECUTE), verification (QUERY), and retry (RETRY)', async () => {
      // Attempt 1: Synchronous initial write that times out
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'TIMEOUT',
        errorClass: 'TIMEOUT',
        effect: 'UNKNOWN',
        recovery: 'QUERY',
      });

      // Attempt 2: Worker queries remote state to verify whether order was created
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        attemptType: 'QUERY',
        provider: 'simulator-erp',
        workerId: 'worker-recon-1',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        status: 'SUCCEEDED',
        effect: 'APPLIED',
        recovery: 'NONE',
        evidence: { externalId: 'REMOTE-PO-777', verified: true },
      });

      const history = await attemptStore.listAttempts(workspaceId, operationId);
      expect(history).toHaveLength(2);
      expect(history[0].attemptType).toBe('EXECUTE');
      expect(history[0].status).toBe('TIMEOUT');
      expect(history[1].attemptType).toBe('QUERY');
      expect(history[1].status).toBe('SUCCEEDED');
      expect(history[1].effect).toBe('APPLIED');
    });
  });

  describe('6. Error History & Non-Overwriting Invariant', () => {
    it('preserves complete 3-attempt progression (#1 TRANSIENT, #2 RATE_LIMIT, #3 SUCCEEDED)', async () => {
      // Attempt #1: Transient failure
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'FAILED',
        errorClass: 'TRANSIENT',
        errorCode: 'ECONNRESET',
        errorMessage: 'Connection reset by peer',
      });

      // Attempt #2: Rate limited
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        attemptType: 'RETRY',
        provider: 'simulator-erp',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        status: 'FAILED',
        errorClass: 'RATE_LIMIT',
        errorCode: 'TOO_MANY_REQUESTS',
        errorMessage: 'HTTP 429 Too Many Requests',
      });

      // Attempt #3: Succeeded
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 3,
        attemptType: 'RETRY',
        provider: 'simulator-erp',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 3,
        status: 'SUCCEEDED',
        effect: 'APPLIED',
        recovery: 'NONE',
        evidence: { externalId: 'PO-SUCCESS-3' },
      });

      const history = await attemptStore.listAttempts(workspaceId, operationId);
      expect(history).toHaveLength(3);

      expect(history[0].attemptNo).toBe(1);
      expect(history[0].status).toBe('FAILED');
      expect(history[0].errorClass).toBe('TRANSIENT');
      expect(history[0].errorCode).toBe('ECONNRESET');

      expect(history[1].attemptNo).toBe(2);
      expect(history[1].status).toBe('FAILED');
      expect(history[1].errorClass).toBe('RATE_LIMIT');
      expect(history[1].errorCode).toBe('TOO_MANY_REQUESTS');

      expect(history[2].attemptNo).toBe(3);
      expect(history[2].status).toBe('SUCCEEDED');
      expect(history[2].effect).toBe('APPLIED');
    });
  });

  describe('7. Workspace Isolation Guarantee', () => {
    it('ensures Workspace A cannot query Workspace B attempts via listAttempts() or getAttempt()', async () => {
      const wsA = 'ws-alpha';
      const wsB = 'ws-beta';
      const sharedOpId = 'op-shared-id';

      mockPrisma._opStore.push({
        id: sharedOpId,
        workspaceId: wsA,
      });

      await attemptStore.startAttempt({
        workspaceId: wsA,
        operationId: sharedOpId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      // Query from Workspace B
      const wsBAttempts = await attemptStore.listAttempts(wsB, sharedOpId);
      expect(wsBAttempts).toHaveLength(0);

      const singleAttemptB = await attemptStore.getAttempt(wsB, sharedOpId, 1);
      expect(singleAttemptB).toBeNull();

      // Query from Workspace A
      const wsAAttempts = await attemptStore.listAttempts(wsA, sharedOpId);
      expect(wsAAttempts).toHaveLength(1);
      expect(wsAAttempts[0].workspaceId).toBe(wsA);
    });
  });

  describe('8. Crash Semantics (RUNNING with expired lease)', () => {
    it('preserves RUNNING status of crashed worker attempt when next recovery claims Attempt #2', async () => {
      // Worker 1 starts attempt #1 but crashes before calling finishAttempt
      const attempt1 = await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
        workerId: 'crashed-worker-pid-1234',
      });
      expect(attempt1.status).toBe('RUNNING');

      // Next recovery cycle claims expired lease and starts Attempt #2
      const attempt2 = await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        attemptType: 'QUERY',
        provider: 'simulator-erp',
        workerId: 'surviving-worker-pid-5678',
      });
      await attemptStore.finishAttempt({
        workspaceId,
        operationId,
        attemptNo: 2,
        status: 'SUCCEEDED',
        effect: 'APPLIED',
      });

      const history = await attemptStore.listAttempts(workspaceId, operationId);
      expect(history).toHaveLength(2);
      // Attempt #1 is NOT overwritten, remains RUNNING indicating interrupted crash
      expect(history[0].status).toBe('RUNNING');
      expect(history[0].workerId).toBe('crashed-worker-pid-1234');
      // Attempt #2 succeeded
      expect(history[1].status).toBe('SUCCEEDED');
      expect(history[1].workerId).toBe('surviving-worker-pid-5678');
    });
  });

  describe('9. Fail-Safe Guarantee: Attempt DB failures must not crash business execution', () => {
    it('safeStartAttempt returns null and logs warning without throwing if DB is unavailable', async () => {
      const faultyClient = {
        automationOperation: {
          findFirst: jest.fn().mockResolvedValue({ id: operationId, workspaceId }),
        },
        executionAttempt: {
          create: jest.fn().mockRejectedValue(new Error('PostgreSQL connection timeout')),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
        },
      } as unknown as PrismaClient;

      const faultyStore = new ExecutionAttemptStore(faultyClient);
      const loggerWarnSpy = jest.spyOn(runtimeLogger, 'warn').mockImplementation(() => {});

      const result = await faultyStore.safeStartAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      expect(result).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: RuntimeEvents.EXECUTION_ATTEMPT_RECORD_FAILED,
          action: 'startAttempt',
        }),
      );
      loggerWarnSpy.mockRestore();
    });

    it('safeFinishAttempt returns null and logs warning without throwing if DB update fails', async () => {
      const faultyClient = {
        executionAttempt: {
          findFirst: jest.fn().mockResolvedValue({ startedAt: new Date() }),
          updateMany: jest.fn().mockRejectedValue(new Error('Deadlock detected')),
        },
      } as unknown as PrismaClient;

      const faultyStore = new ExecutionAttemptStore(faultyClient);
      const loggerWarnSpy = jest.spyOn(runtimeLogger, 'warn').mockImplementation(() => {});

      const result = await faultyStore.safeFinishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'SUCCEEDED',
      });

      expect(result).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: RuntimeEvents.EXECUTION_ATTEMPT_RECORD_FAILED,
          action: 'finishAttempt',
        }),
      );
      loggerWarnSpy.mockRestore();
    });
  });

  describe('10. Legacy Data Policy (No Backfill Fabrication)', () => {
    it('returns empty attempt history for legacy operations without synthesizing fake rows', async () => {
      const legacyOperationId = 'op-legacy-pre-phase5';
      const history = await attemptStore.listAttempts(workspaceId, legacyOperationId);

      expect(history).toEqual([]);
      // Confirms no fake backfill records were fabricated
    });
  });

  describe('11. Phase 5.1 Closure: Parent Workspace Validation & Cross-Tenant Protection', () => {
    it('throws AutomationOperationNotFoundError if parent operation does not exist in workspace', async () => {
      const wrongWorkspace = 'ws-unauthorized';

      await expect(
        attemptStore.startAttempt({
          workspaceId: wrongWorkspace,
          operationId, // exists in workspaceId, NOT in wrongWorkspace
          attemptNo: 1,
          attemptType: 'EXECUTE',
          provider: 'simulator-erp',
        }),
      ).rejects.toThrow(AutomationOperationNotFoundError);

      // Verify no attempts were created
      const attempts = await attemptStore.listAttempts(wrongWorkspace, operationId);
      expect(attempts).toHaveLength(0);
    });

    it('duplicate start with wrong workspace must NOT return other workspace attempt', async () => {
      // Create Attempt #1 in workspace A
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      // Now Workspace B tries to call startAttempt for same operationId + attemptNo
      // Add op to wsB as well to test P2002 duplicate branch
      mockPrisma._opStore.push({
        id: 'op-collision',
        workspaceId: 'ws-b',
      });

      // Directly simulate P2002 collision by crafting mock
      jest.spyOn(mockPrisma.executionAttempt, 'create').mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      // When ws-b tries to start attempt with same operationId, it must NOT receive ws-a's attempt
      await expect(
        attemptStore.startAttempt({
          workspaceId: 'ws-b',
          operationId: 'op-collision',
          attemptNo: 1,
          attemptType: 'EXECUTE',
          provider: 'simulator-erp',
        }),
      ).rejects.toThrow(AutomationOperationConflictError);
    });
  });

  describe('12. Phase 5.1 Closure: Attempt Identity Validation on Duplicate Start', () => {
    it('duplicate start with different attemptType throws conflict error', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      // Duplicate delivery tries to use RETRY instead of EXECUTE
      await expect(
        attemptStore.startAttempt({
          workspaceId,
          operationId,
          attemptNo: 1,
          attemptType: 'RETRY',
          provider: 'simulator-erp',
        }),
      ).rejects.toThrow(AutomationOperationConflictError);
    });

    it('duplicate start with different provider throws conflict error', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      // Duplicate delivery tries to use shopify instead of simulator-erp
      await expect(
        attemptStore.startAttempt({
          workspaceId,
          operationId,
          attemptNo: 1,
          attemptType: 'EXECUTE',
          provider: 'shopify',
        }),
      ).rejects.toThrow(AutomationOperationConflictError);
    });

    it('safeStartAttempt returns null and logs failed event on identity conflict', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      const warnSpy = jest.spyOn(runtimeLogger, 'warn').mockImplementation(() => {});

      const result = await attemptStore.safeStartAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'QUERY',
        provider: 'simulator-erp',
      });

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: RuntimeEvents.EXECUTION_ATTEMPT_RECORD_FAILED,
          action: 'startAttempt',
        }),
      );
      warnSpy.mockRestore();
    });
  });

  describe('13. Phase 5.1 Closure: Finish Attempt Workspace Scope & Status Validation', () => {
    it('finishAttempt with wrong workspace returns null and makes no mutations', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      // Workspace B tries to finish Attempt from Workspace A
      const res = await attemptStore.finishAttempt({
        workspaceId: 'ws-intruder',
        operationId,
        attemptNo: 1,
        status: 'SUCCEEDED',
      });

      expect(res).toBeNull();

      // Ensure attempt in Workspace A remains RUNNING
      const attempt = await attemptStore.getAttempt(workspaceId, operationId, 1);
      expect(attempt?.status).toBe('RUNNING');
    });

    it('finishAttempt rejects non-terminal status RUNNING at runtime', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      await expect(
        attemptStore.finishAttempt({
          workspaceId,
          operationId,
          attemptNo: 1,
          status: 'RUNNING' as any,
        }),
      ).rejects.toThrow(/Invalid execution attempt terminal status/);
    });
  });

  describe('14. Phase 5.1 Closure: Terminal Status Logging Semantics', () => {
    it('logs EXECUTION_ATTEMPT_COMPLETED for SUCCEEDED', async () => {
      await attemptStore.startAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'simulator-erp',
      });

      const infoSpy = jest.spyOn(runtimeLogger, 'info').mockImplementation(() => {});

      await attemptStore.safeFinishAttempt({
        workspaceId,
        operationId,
        attemptNo: 1,
        status: 'SUCCEEDED',
      });

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: RuntimeEvents.EXECUTION_ATTEMPT_COMPLETED,
          status: 'SUCCEEDED',
        }),
      );
      infoSpy.mockRestore();
    });

    it('logs EXECUTION_ATTEMPT_FAILED for CANCELLED, UNKNOWN, TIMEOUT, and FAILED', async () => {
      const nonSuccessStatuses: ExecutionAttemptTerminalStatus[] = [
        'CANCELLED',
        'UNKNOWN',
        'TIMEOUT',
        'FAILED',
      ];

      for (let i = 0; i < nonSuccessStatuses.length; i++) {
        const terminalStatus = nonSuccessStatuses[i];
        const attemptNo = i + 1;

        await attemptStore.startAttempt({
          workspaceId,
          operationId,
          attemptNo,
          attemptType: 'EXECUTE',
          provider: 'simulator-erp',
        });

        const infoSpy = jest.spyOn(runtimeLogger, 'info').mockImplementation(() => {});

        await attemptStore.safeFinishAttempt({
          workspaceId,
          operationId,
          attemptNo,
          status: terminalStatus,
        });

        expect(infoSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: RuntimeEvents.EXECUTION_ATTEMPT_FAILED,
            status: terminalStatus,
          }),
        );
        infoSpy.mockRestore();
      }
    });
  });
});
