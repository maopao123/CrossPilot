/**
 * Postgres-backed Workflow Persistence Test Suite (Epic 3 Phase 6.2)
 *
 * Verifies production database persistence using Prisma ORM (AgentTask, AgentStep, Approval):
 * 1. Adapter Save & Load
 * 2. Database-level atomic OCC (WHERE id = ? AND checkpoint_version = ?)
 * 3. Cross-instance DB recovery (Instance A -> Instance B -> Instance C)
 * 4. Approval transaction consistency
 * 5. Concurrent approval race protection
 * 6. Resume idempotency after new instance
 * 7. Step trace persistence
 * 8. Workflow version persistence
 * 9. Database failure / missing adapter semantics (PERSISTENCE_UNAVAILABLE fail-safe)
 * 10. Sensitive data guard redaction
 * 11. Memory / File / Postgres contract compatibility
 */

import {
  DailyOperationWorkflowInput,
  DailyOperationWorkflowState,
} from '@crosspilot/shared';

import {
  DailyOperationWorkflowService,
  PersistentWorkflowCheckpointStore,
  InMemoryWorkflowCheckpointStore,
  PostgresWorkflowCheckpointStore,
  PrismaWorkflowDatabaseAdapter,
  PrismaClientLike,
  CheckpointVersionConflictError,
  PersistenceUnavailableError,
  SensitiveDataGuard,
  IWorkflowCheckpointStore,
} from '../src/operations/index.js';

function createMockPrismaClient() {
  const agentTasks = new Map<string, any>();
  const approvals = new Map<string, any>();
  const agentSteps = new Map<string, any>();

  const client: PrismaClientLike = {
    agentTask: {
      async findUnique({ where }: any) {
        const found = agentTasks.get(where.id);
        return found ? { ...found } : null;
      },
      async count({ where }: any) {
        return agentTasks.has(where.id) ? 1 : 0;
      },
      async updateMany({ where, data }: any) {
        const found = agentTasks.get(where.id);
        if (!found) return { count: 0 };
        if (
          where.checkpointVersion !== undefined &&
          found.checkpointVersion !== where.checkpointVersion
        ) {
          return { count: 0 };
        }
        const updated = { ...found, ...data };
        agentTasks.set(where.id, updated);
        return { count: 1 };
      },
      async update({ where, data }: any) {
        const found = agentTasks.get(where.id);
        if (!found) {
          const err: any = new Error(`Record not found: ${where.id}`);
          err.code = 'P2025';
          throw err;
        }
        const updated = { ...found, ...data };
        agentTasks.set(where.id, updated);
        return { ...updated };
      },
      async create({ data }: any) {
        const copy = { ...data };
        agentTasks.set(copy.id, copy);
        return { ...copy };
      },
      async delete({ where }: any) {
        if (!agentTasks.has(where.id)) {
          const err: any = new Error('Record to delete does not exist.');
          err.code = 'P2025';
          throw err;
        }
        agentTasks.delete(where.id);
        return { id: where.id };
      },
    },
    agentStep: {
      async findMany({ where }: any) {
        return Array.from(agentSteps.values())
          .filter((s) => s.taskId === where.taskId)
          .map((s) => ({ ...s }));
      },
      async create({ data }: any) {
        const id = data.id ?? `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copy = { id, ...data };
        agentSteps.set(id, copy);
        return { ...copy };
      },
      async update({ where, data }: any) {
        const found = agentSteps.get(where.id);
        if (!found) throw new Error(`Step not found: ${where.id}`);
        const updated = { ...found, ...data };
        agentSteps.set(where.id, updated);
        return { ...updated };
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [id, step] of agentSteps.entries()) {
          if (step.taskId === where.taskId) {
            agentSteps.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
    approval: {
      async findMany({ where }: any) {
        return Array.from(approvals.values())
          .filter((a) => (where.taskId ? a.taskId === where.taskId : true))
          .map((a) => ({ ...a }));
      },
      async create({ data }: any) {
        const id = data.id ?? `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const copy = { id, ...data };
        approvals.set(id, copy);
        return { ...copy };
      },
      async update({ where, data }: any) {
        const found = approvals.get(where.id);
        if (!found) throw new Error(`Approval not found: ${where.id}`);
        const updated = { ...found, ...data };
        approvals.set(where.id, updated);
        return { ...updated };
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (const [id, app] of approvals.entries()) {
          if (where.taskId && app.taskId === where.taskId) {
            approvals.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
    async $transaction<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T> {
      return fn(client);
    },
  };

  return { client, agentTasks, approvals, agentSteps };
}

describe('Epic 3 Phase 6.2: Postgres-backed Workflow Persistence', () => {
  // ==========================================================================
  // 1. Adapter Save & Load
  // ==========================================================================
  describe('1. Prisma Adapter Save & Load', () => {
    it('saves task to Postgres AgentTask table and loads accurately', async () => {
      const { client, agentTasks } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const taskId = 'task-pg-001';

      await adapter.saveTask({
        taskId,
        workspaceId: 'ws_demo',
        taskType: 'DAILY_OPERATION_WF05',
        status: 'RUNNING',
        inputJson: JSON.stringify({ mode: 'SKU', workspaceId: 'ws_demo' }),
        resultJson: JSON.stringify({ taskId, status: 'RUNNING', checkpointVersion: 1 }),
        checkpointVersion: 1,
        workflowVersion: 'WF05_V1',
        currentStep: 'LOAD_CONTEXT',
      });

      expect(agentTasks.has(taskId)).toBe(true);
      const inDb = agentTasks.get(taskId);
      expect(inDb.id).toBe(taskId);
      expect(inDb.checkpointVersion).toBe(1);
      expect(inDb.workflowVersion).toBe('WF05_V1');
      expect(inDb.currentStep).toBe('LOAD_CONTEXT');

      const loaded = await adapter.getTask(taskId);
      expect(loaded).not.toBeNull();
      expect(loaded?.taskId).toBe(taskId);
      expect(loaded?.status).toBe('RUNNING');
      expect(loaded?.checkpointVersion).toBe(1);
      expect(loaded?.workflowVersion).toBe('WF05_V1');
      expect(loaded?.currentStep).toBe('LOAD_CONTEXT');

      const has = await adapter.hasTask(taskId);
      expect(has).toBe(true);

      await adapter.deleteTask(taskId);
      expect(await adapter.hasTask(taskId)).toBe(false);
      expect(await adapter.getTask(taskId)).toBeNull();
    });
  });

  // ==========================================================================
  // 2. Database-level atomic OCC
  // ==========================================================================
  describe('2. Database-Level Atomic OCC', () => {
    it('enforces atomic OCC during saveTask with expectedVersion', async () => {
      const { client } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const taskId = 'task-occ-001';

      // Initial create at expectedVersion 0
      await adapter.saveTask(
        {
          taskId,
          workspaceId: 'ws_demo',
          taskType: 'DAILY_OPERATION_WF05',
          status: 'RUNNING',
          inputJson: '{}',
          resultJson: JSON.stringify({ taskId, checkpointVersion: 1 }),
          checkpointVersion: 1,
        },
        { expectedVersion: 0 }
      );

      // Successful update from version 1 -> 2
      await adapter.saveTask(
        {
          taskId,
          workspaceId: 'ws_demo',
          taskType: 'DAILY_OPERATION_WF05',
          status: 'WAITING_APPROVAL',
          inputJson: '{}',
          resultJson: JSON.stringify({ taskId, checkpointVersion: 2 }),
          checkpointVersion: 2,
        },
        { expectedVersion: 1 }
      );

      const loaded = await adapter.getTask(taskId);
      expect(loaded?.checkpointVersion).toBe(2);

      // Stale update attempt with expectedVersion: 1 must throw CheckpointVersionConflictError
      await expect(
        adapter.saveTask(
          {
            taskId,
            workspaceId: 'ws_demo',
            taskType: 'DAILY_OPERATION_WF05',
            status: 'COMPLETED',
            inputJson: '{}',
            resultJson: JSON.stringify({ taskId, checkpointVersion: 3 }),
            checkpointVersion: 3,
          },
          { expectedVersion: 1 }
        )
      ).rejects.toThrow(CheckpointVersionConflictError);
    });
  });

  // ==========================================================================
  // 3. Cross-Instance DB Recovery
  // ==========================================================================
  describe('3. Cross-Instance DB Recovery (Instance A -> Instance B -> Instance C)', () => {
    it('persists through Instance A, approves via Instance B, and resumes via Instance C', async () => {
      const { client, approvals } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);

      const taskId = 'task-cross-instance-001';
      const input: DailyOperationWorkflowInput = {
        taskId,
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-07-16', to: '2026-07-22' },
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      };

      // Instance A executes workflow and halts at APPROVAL_GATE
      const storeA = new PostgresWorkflowCheckpointStore(adapter);
      const serviceA = new DailyOperationWorkflowService({ checkpointStore: storeA });
      const resultA = await serviceA.execute(input);

      expect(resultA.status).toBe('WAITING_APPROVAL');
      expect(resultA.checkpointVersion).toBeGreaterThanOrEqual(1);

      // Instance A is terminated/disposed
      // Instance B starts up with its own clean store instance pointing to same DB
      const storeB = new PostgresWorkflowCheckpointStore(adapter);
      const serviceB = new DailyOperationWorkflowService({ checkpointStore: storeB });

      const stateB = await storeB.get(taskId);
      expect(stateB).not.toBeNull();
      expect(stateB?.status).toBe('WAITING_APPROVAL');
      expect(stateB?.approvalState.pendingActionIds.length).toBeGreaterThan(0);

      const pendingIds = [...stateB!.approvalState.pendingActionIds];
      const pendingActionId = pendingIds[0];

      // Instance B approves the first action
      const stateBAfterApproval = await serviceB.approveAction(
        taskId,
        pendingActionId,
        'OPERATOR_SARAH',
        'Authorized for Phase 6.2 test'
      );
      expect(stateBAfterApproval.approvalState.approvedActionIds).toContain(pendingActionId);

      // Instance B rejects any remaining actions
      for (let i = 1; i < pendingIds.length; i++) {
        await serviceB.rejectAction(
          taskId,
          pendingIds[i],
          'OPERATOR_SARAH',
          'Rejected remaining on instance B'
        );
      }

      // Verify Approval record in Postgres mock table
      const dbApprovals = Array.from(approvals.values()).filter((a) => a.taskId === taskId);
      expect(dbApprovals.length).toBeGreaterThan(0);
      const matchedApp = dbApprovals.find((a) => a.targetId === pendingActionId);
      expect(matchedApp?.status).toBe('APPROVED');
      expect(matchedApp?.approvedBy).toBe('OPERATOR_SARAH');

      // Instance B is terminated/disposed
      // Instance C resumes the workflow to completion
      const storeC = new PostgresWorkflowCheckpointStore(adapter);
      const serviceC = new DailyOperationWorkflowService({ checkpointStore: storeC });

      const finalResult = await serviceC.resume(taskId);
      expect(finalResult.status).toBe('COMPLETED');
      expect(finalResult.approvalSummary.pendingCount).toBe(0);
      expect(finalResult.approvalSummary.approvedCount).toBe(1);

      const finalStateInDb = await storeC.get(taskId);
      expect(finalStateInDb?.status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // 4. Approval Transaction Consistency
  // ==========================================================================
  describe('4. Approval Transaction Consistency', () => {
    it('synchronizes AgentTask and Approval entities in single transaction', async () => {
      const { client, agentTasks, approvals } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const store = new PostgresWorkflowCheckpointStore(adapter);

      const taskId = 'task-txn-approval-001';
      const actionId = 'ACT-REPLENISH-001';

      const state: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-txn-001',
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuIds: ['MTH-WHITE-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        contexts: {},
        signals: [],
        diagnoses: [],
        recommendedActions: [
          {
            actionId,
            workspaceId: 'ws_demo',
            category: 'INVENTORY',
            actionType: 'PREPARE_REPLENISHMENT',
            priority: 'P1',
            riskLevel: 'MEDIUM',
            executionMode: 'APPROVAL_REQUIRED',
            title: 'Replenish Inventory',
            reason: 'Critical stock cover',
            payload: { orderQty: 100 },
            expectedImpact: 'Prevent stockout',
            status: 'PROPOSED',
            sourceSignalIds: ['SIG-001'],
            evidence: [],
            createdAt: new Date().toISOString(),
          },
        ],
        approvalState: {
          pendingActionIds: [actionId],
          approvedActionIds: [],
          rejectedActionIds: [],
          dismissedActionIds: [],
          decisions: [],
        },
        currentStep: 'APPROVAL_GATE',
        completedSteps: [],
        stepTraces: [],
        errors: [],
        warnings: [],
        status: 'WAITING_APPROVAL',
        checkpointVersion: 1,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(state);

      // Verify AgentTask
      expect(agentTasks.has(taskId)).toBe(true);
      expect(agentTasks.get(taskId).status).toBe('WAITING_APPROVAL');

      // Verify Approval record created with PENDING status
      const initialApprovals = Array.from(approvals.values()).filter((a) => a.taskId === taskId);
      expect(initialApprovals.length).toBe(1);
      expect(initialApprovals[0].targetId).toBe(actionId);
      expect(initialApprovals[0].status).toBe('PENDING');

      // Now decide approval
      state.recommendedActions[0].status = 'APPROVED';
      state.approvalState.pendingActionIds = [];
      state.approvalState.approvedActionIds = [actionId];
      state.approvalState.decisions.push({
        actionId,
        decision: 'APPROVED',
        decidedBy: 'OPERATOR_ALICE',
        decidedAt: new Date().toISOString(),
        note: 'Approved for manufacturing',
      });

      await store.save(state, { expectedVersion: 1 });

      // Verify Approval updated to APPROVED with audit note and decider
      const updatedApprovals = Array.from(approvals.values()).filter((a) => a.taskId === taskId);
      expect(updatedApprovals.length).toBe(1);
      expect(updatedApprovals[0].status).toBe('APPROVED');
      expect(updatedApprovals[0].approvedBy).toBe('OPERATOR_ALICE');
      expect(updatedApprovals[0].comment).toBe('Approved for manufacturing');
    });
  });

  // ==========================================================================
  // 5. Concurrent Approval Race Protection
  // ==========================================================================
  describe('5. Concurrent Approval Race Protection', () => {
    it('prevents concurrent decision race conditions via database OCC', async () => {
      const { client } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const store1 = new PostgresWorkflowCheckpointStore(adapter);
      const store2 = new PostgresWorkflowCheckpointStore(adapter);

      const taskId = 'task-race-001';
      const actionId = 'ACT-RACE-001';

      const state: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-race-001',
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuIds: ['MTH-WHITE-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        contexts: {},
        signals: [],
        diagnoses: [],
        recommendedActions: [
          {
            actionId,
            workspaceId: 'ws_demo',
            category: 'PRICING',
            actionType: 'REVIEW_PRICE_COMPETITIVENESS',
            priority: 'P2',
            riskLevel: 'LOW',
            executionMode: 'APPROVAL_REQUIRED',
            title: 'Adjust price',
            reason: 'Competitor undercut',
            status: 'PROPOSED',
            sourceSignalIds: ['SIG-002'],
            evidence: [],
            createdAt: new Date().toISOString(),
          },
        ],
        approvalState: {
          pendingActionIds: [actionId],
          approvedActionIds: [],
          rejectedActionIds: [],
          dismissedActionIds: [],
          decisions: [],
        },
        currentStep: 'APPROVAL_GATE',
        completedSteps: [],
        stepTraces: [],
        errors: [],
        warnings: [],
        status: 'WAITING_APPROVAL',
        checkpointVersion: 1,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store1.save(state); // saved at version 1

      // Worker 1 and Worker 2 both read version 1
      const state1 = await store1.get(taskId);
      const state2 = await store2.get(taskId);

      expect(state1?.checkpointVersion).toBe(1);
      expect(state2?.checkpointVersion).toBe(1);

      // Worker 1 updates with expectedVersion 1
      state1!.approvalState.approvedActionIds = [actionId];
      await store1.save(state1!, { expectedVersion: 1 }); // becomes version 2

      // Worker 2 attempts update with stale expectedVersion 1 -> conflict!
      state2!.approvalState.rejectedActionIds = [actionId];
      await expect(
        store2.save(state2!, { expectedVersion: 1 })
      ).rejects.toThrow(CheckpointVersionConflictError);
    });
  });

  // ==========================================================================
  // 6. Resume Idempotency
  // ==========================================================================
  describe('6. Resume Idempotency', () => {
    it('returns existing completed state idempotently without re-execution', async () => {
      const { client } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const store = new PostgresWorkflowCheckpointStore(adapter);
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const taskId = 'task-idempotent-001';
      const state: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-idempotent-001',
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuIds: ['MTH-WHITE-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        contexts: {},
        signals: [],
        diagnoses: [],
        recommendedActions: [],
        approvalState: {
          pendingActionIds: [],
          approvedActionIds: [],
          rejectedActionIds: [],
          dismissedActionIds: [],
          decisions: [],
        },
        currentStep: 'FINALIZE',
        completedSteps: ['FINALIZE'],
        stepTraces: [],
        errors: [],
        warnings: [],
        status: 'COMPLETED',
        checkpointVersion: 3,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      await store.save(state);

      const resumed = await service.resume(taskId);
      expect(resumed.status).toBe('COMPLETED');
      expect(resumed.taskId).toBe(taskId);
      expect(resumed.checkpointVersion).toBe(3);
    });
  });

  // ==========================================================================
  // 7. DAG Step Trace Persistence
  // ==========================================================================
  describe('7. DAG Step Trace Persistence', () => {
    it('synchronizes AgentStep records accurately for each completed step', async () => {
      const { client, agentSteps } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const store = new PostgresWorkflowCheckpointStore(adapter);
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const taskId = 'task-step-trace-001';
      await service.execute({
        taskId,
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      });

      const stepsInDb = Array.from(agentSteps.values()).filter((s) => s.taskId === taskId);
      expect(stepsInDb.length).toBeGreaterThanOrEqual(7);

      const stepNames = stepsInDb.map((s) => s.name);
      expect(stepNames).toContain('VALIDATE_INPUT');
      expect(stepNames).toContain('RESOLVE_SKUS');
      expect(stepNames).toContain('LOAD_CONTEXT');
      expect(stepNames).toContain('DETECT_SIGNALS');
      expect(stepNames).toContain('DIAGNOSE');
      expect(stepNames).toContain('RECOMMEND');
      expect(stepNames).toContain('AGGREGATE');
    });
  });

  // ==========================================================================
  // 8. Workflow Version Persistence
  // ==========================================================================
  describe('8. Workflow Version Persistence', () => {
    it('persists and restores workflowVersion accurately', async () => {
      const { client, agentTasks } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const store = new PostgresWorkflowCheckpointStore(adapter);
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const taskId = 'task-wf-version-001';
      const result = await service.execute({
        taskId,
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        workflowVersion: 'WF05_CUSTOM_V2',
      });

      expect(result.workflowVersion).toBe('WF05_CUSTOM_V2');

      const inDb = agentTasks.get(taskId);
      expect(inDb.workflowVersion).toBe('WF05_CUSTOM_V2');

      const restored = await store.get(taskId);
      expect(restored?.workflowVersion).toBe('WF05_CUSTOM_V2');
    });
  });

  // ==========================================================================
  // 9. Fail-Safe & Missing Adapter Semantics (Single Source of Truth)
  // ==========================================================================
  describe('9. Fail-Safe Semantics (Single Source of Truth)', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalBackend = process.env.WORKFLOW_CHECKPOINT_BACKEND;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.WORKFLOW_CHECKPOINT_BACKEND = originalBackend;
    });

    it('throws PersistenceUnavailableError when backend is postgres and no adapter provided', () => {
      expect(() => {
        new PersistentWorkflowCheckpointStore({
          backend: 'postgres',
        });
      }).toThrow(PersistenceUnavailableError);
    });

    it('throws PersistenceUnavailableError in production when adapter is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.WORKFLOW_CHECKPOINT_BACKEND;

      expect(() => {
        new PersistentWorkflowCheckpointStore();
      }).toThrow(PersistenceUnavailableError);
    });

    it('throws PersistenceUnavailableError in PostgresWorkflowCheckpointStore when adapter is null', () => {
      expect(() => {
        new PostgresWorkflowCheckpointStore(null as any);
      }).toThrow(PersistenceUnavailableError);
    });
  });

  // ==========================================================================
  // 10. Sensitive Data Redaction
  // ==========================================================================
  describe('10. Sensitive Data Redaction Before Persistence', () => {
    it('redacts tokens, apiKeys, and passwords before storing to Postgres', async () => {
      const { client, agentTasks, approvals } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);
      const store = new PostgresWorkflowCheckpointStore(adapter);

      const taskId = 'task-sensitive-001';
      const sensitiveState: any = {
        taskId,
        workflowRunId: 'run-sens-001',
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuIds: ['MTH-WHITE-001'],
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
        contexts: {
          'MTH-WHITE-001': {
            identity: {
              skuId: 'MTH-WHITE-001',
              apiKey: 'sk-prod-secret-12345',
              bearerToken: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
            },
          },
        },
        signals: [],
        diagnoses: [],
        recommendedActions: [
          {
            actionId: 'ACT-SENS-001',
            workspaceId: 'ws_demo',
            category: 'INVENTORY',
            actionType: 'PREPARE_REPLENISHMENT',
            priority: 'P1',
            riskLevel: 'LOW',
            executionMode: 'APPROVAL_REQUIRED',
            title: 'Replenish stock',
            reason: 'Normal replenishment',
            payload: {
              apiSecret: 'my-super-secret-key-999',
              password: 'db-password-secret',
            },
            status: 'PROPOSED',
          },
        ],
        approvalState: {
          pendingActionIds: ['ACT-SENS-001'],
          approvedActionIds: [],
          rejectedActionIds: [],
          dismissedActionIds: [],
          decisions: [],
        },
        currentStep: 'APPROVAL_GATE',
        completedSteps: [],
        stepTraces: [],
        errors: [],
        warnings: [],
        status: 'WAITING_APPROVAL',
        checkpointVersion: 1,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(sensitiveState);

      const inDb = agentTasks.get(taskId);
      expect(inDb.resultJson).not.toContain('sk-prod-secret-12345');
      expect(inDb.resultJson).not.toContain('my-super-secret-key-999');
      expect(inDb.resultJson).not.toContain('db-password-secret');
      expect(inDb.resultJson).toContain('[REDACTED]');

      const appInDb = Array.from(approvals.values()).find((a) => a.taskId === taskId);
      expect(appInDb?.requestedPayload).not.toContain('my-super-secret-key-999');
      expect(appInDb?.requestedPayload).toContain('[REDACTED]');
    });

    it('SensitiveDataGuard correctly identifies and scrubs sensitive keys', () => {
      const dirty = {
        service: 'CrossPilot',
        apiKey: '12345',
        authHeader: 'Bearer abcd',
        nested: {
          password: 'pass',
          token: 'xyz',
          normalField: 'ok',
        },
      };

      expect(SensitiveDataGuard.hasSensitiveData(dirty)).toBe(true);

      const cleaned = SensitiveDataGuard.scrub(dirty);
      expect(SensitiveDataGuard.hasSensitiveData(cleaned)).toBe(false);
      expect(cleaned.apiKey).toBe('[REDACTED]');
      expect(cleaned.authHeader).toBe('[REDACTED]');
      expect(cleaned.nested.password).toBe('[REDACTED]');
      expect(cleaned.nested.token).toBe('[REDACTED]');
      expect(cleaned.nested.normalField).toBe('ok');
    });
  });

  // ==========================================================================
  // 11. Contract Compatibility
  // ==========================================================================
  describe('11. Memory / File / Postgres Contract Compatibility', () => {
    it('all three stores adhere to IWorkflowCheckpointStore interface identically', async () => {
      const { client } = createMockPrismaClient();
      const adapter = new PrismaWorkflowDatabaseAdapter(client);

      const stores: Array<{ name: string; store: IWorkflowCheckpointStore }> = [
        { name: 'InMemory', store: new InMemoryWorkflowCheckpointStore() },
        { name: 'File', store: new PersistentWorkflowCheckpointStore({ backend: 'file' }) },
        { name: 'Postgres', store: new PostgresWorkflowCheckpointStore(adapter) },
      ];

      for (const { name, store } of stores) {
        const taskId = `task-contract-${name.toLowerCase()}`;
        const state: DailyOperationWorkflowState = {
          taskId,
          workflowRunId: 'run-contract',
          workspaceId: 'ws_demo',
          marketplaceId: 'AMAZON_US',
          mode: 'SKU',
          skuIds: ['MTH-WHITE-001'],
          dateRange: { from: '2026-03-08', to: '2026-03-14' },
          contexts: {},
          signals: [],
          diagnoses: [],
          recommendedActions: [],
          approvalState: {
            pendingActionIds: [],
            approvedActionIds: [],
            rejectedActionIds: [],
            dismissedActionIds: [],
            decisions: [],
          },
          currentStep: 'VALIDATE_INPUT',
          completedSteps: [],
          stepTraces: [],
          errors: [],
          warnings: [],
          status: 'RUNNING',
          checkpointVersion: 1,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Save
        await store.save(state);
        expect(await store.has(taskId)).toBe(true);

        // Get
        const loaded = await store.get(taskId);
        expect(loaded).not.toBeNull();
        expect(loaded?.taskId).toBe(taskId);

        // Version increment
        await store.save(loaded!, { expectedVersion: 1 });
        const loadedV2 = await store.get(taskId);
        expect(loadedV2?.checkpointVersion).toBe(2);

        // Delete
        await store.delete(taskId);
        expect(await store.has(taskId)).toBe(false);
      }
    });
  });
});
