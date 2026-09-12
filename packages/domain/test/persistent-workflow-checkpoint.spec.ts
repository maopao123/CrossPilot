/**
 * Persistent Workflow Checkpoint & Recovery Hardening Test Suite (Epic 3 Phase 6.1)
 *
 * Verifies:
 * 1. Durable disk persistence across distinct service instances (Instance A -> destroy -> Instance B resume)
 * 2. Optimistic Concurrency Control (OCC) version increments and conflict detection
 * 3. Strict action state transition preconditions (PROPOSED -> APPROVED/REJECTED/DISMISSED only)
 * 4. Concurrent decision race protection via OCC
 * 5. Resume idempotency (no duplicate steps, diagnoses, or actions on re-resume)
 * 6. Crash consistency (state persisted before SSE event emitted)
 * 7. Step trace and execution state survival across process boundaries
 * 8. IWorkflowDatabaseAdapter integration (mapping to AgentTask / AgentStep / Approval)
 * 9. WorkflowNotFoundError and CheckpointVersionConflictError semantics
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  DailyOperationWorkflowInput,
  DailyOperationWorkflowState,
} from '@crosspilot/shared';

import {
  DailyOperationWorkflowService,
  PersistentWorkflowCheckpointStore,
  InMemoryWorkflowCheckpointStore,
  CheckpointVersionConflictError,
  InvalidActionStateError,
  WorkflowNotFoundError,
  IWorkflowDatabaseAdapter,
  WorkflowEventEmitter,
} from '../src/operations/index.js';

describe('Epic 3 Phase 6.1: Persistent Workflow Checkpoint & Recovery Hardening', () => {
  let testStorageDir: string;

  beforeEach(() => {
    testStorageDir = path.join(
      os.tmpdir(),
      `crosspilot-checkpoints-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    );
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(testStorageDir)) {
        await fs.promises.rm(testStorageDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup
    }
  });

  // ==========================================================================
  // 1. File-Based Persistent Storage Durability
  // ==========================================================================
  describe('1. File-Based Persistent Store Durability', () => {
    it('should write checkpoint atomically to disk and increment version on subsequent saves', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const taskId = 'task-persist-001';

      const mockState: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-001',
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
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Initial save -> version 1
      await store.save(mockState);
      expect(mockState.checkpointVersion).toBe(1);

      const filePath = path.join(testStorageDir, `${taskId}.checkpoint.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const loadedV1 = await store.get(taskId);
      expect(loadedV1).not.toBeNull();
      expect(loadedV1?.checkpointVersion).toBe(1);
      expect(loadedV1?.taskId).toBe(taskId);

      // Second save -> version 2
      mockState.currentStep = 'RESOLVE_SKUS';
      await store.save(mockState);
      expect(mockState.checkpointVersion).toBe(2);

      const loadedV2 = await store.get(taskId);
      expect(loadedV2?.checkpointVersion).toBe(2);
      expect(loadedV2?.currentStep).toBe('RESOLVE_SKUS');

      // Check has() and delete()
      expect(await store.has(taskId)).toBe(true);
      await store.delete(taskId);
      expect(await store.has(taskId)).toBe(false);
      expect(await store.get(taskId)).toBeNull();
    });
  });

  // ==========================================================================
  // 2. Cross-Instance Process Restart & Recovery
  // ==========================================================================
  describe('2. Cross-Instance Process Restart & Recovery', () => {
    it('Instance A pauses at WAITING_APPROVAL -> Instance B loads from disk, approves, and resumes to COMPLETED', async () => {
      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-07-16', to: '2026-07-22' },
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      };

      // ----------------------------------------------------------------------
      // Step 1: Service Instance A executes and pauses at APPROVAL_GATE
      // ----------------------------------------------------------------------
      const storeA = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      let serviceA: DailyOperationWorkflowService | null = new DailyOperationWorkflowService({
        checkpointStore: storeA,
      });

      const initialResult = await serviceA.execute(input);
      const taskId = initialResult.taskId;

      expect(initialResult.status).toBe('WAITING_APPROVAL');
      expect(initialResult.approvalSummary.pendingCount).toBeGreaterThan(0);
      expect(initialResult.checkpointVersion).toBeGreaterThanOrEqual(1);

      // Destroy Instance A (simulate process kill / container termination)
      serviceA = null;

      // ----------------------------------------------------------------------
      // Step 2: Service Instance B boots with separate memory and resumes from disk
      // ----------------------------------------------------------------------
      const storeB = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const serviceB = new DailyOperationWorkflowService({
        checkpointStore: storeB,
      });

      // Verify Instance B can read full state from persistent storage
      const loadedByB = await storeB.get(taskId);
      expect(loadedByB).not.toBeNull();
      expect(loadedByB?.taskId).toBe(taskId);
      expect(loadedByB?.status).toBe('WAITING_APPROVAL');
      expect(loadedByB?.stepTraces.length).toBeGreaterThanOrEqual(7);
      expect(loadedByB?.signals.length).toBeGreaterThan(0);
      expect(loadedByB?.diagnoses.length).toBeGreaterThan(0);
      expect(loadedByB?.recommendedActions.length).toBeGreaterThan(0);

      const pendingIds = [...(loadedByB?.approvalState.pendingActionIds ?? [])];
      expect(pendingIds.length).toBeGreaterThan(0);

      // Instance B decides actions
      const firstActionId = pendingIds[0];
      const stateAfterFirst = await serviceB.approveAction(
        taskId,
        firstActionId,
        'OPERATOR_B',
        'Authorized on recovered service instance B'
      );

      expect(stateAfterFirst.approvalState.approvedActionIds).toContain(firstActionId);
      expect(stateAfterFirst.approvalState.pendingActionIds).not.toContain(firstActionId);

      // Decide remaining actions
      for (let i = 1; i < pendingIds.length; i++) {
        await serviceB.rejectAction(
          taskId,
          pendingIds[i],
          'OPERATOR_B',
          'Rejected remaining on instance B'
        );
      }

      // Resume workflow on Instance B
      const finalResult = await serviceB.resume(taskId);
      expect(finalResult.status).toBe('COMPLETED');
      expect(finalResult.approvalSummary.pendingCount).toBe(0);
      expect(finalResult.approvalSummary.approvedCount).toBe(1);
      expect(finalResult.approvalSummary.rejectedCount).toBe(pendingIds.length - 1);
    });
  });

  // ==========================================================================
  // 3. Optimistic Concurrency Control (OCC)
  // ==========================================================================
  describe('3. Optimistic Concurrency Control (OCC)', () => {
    it('should reject save with outdated expectedVersion throwing CheckpointVersionConflictError', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const taskId = 'task-occ-test-001';

      const state: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-occ',
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
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Initial save -> version 1
      await store.save(state);
      expect(state.checkpointVersion).toBe(1);

      // Save with correct expectedVersion: 1 -> succeeds, version becomes 2
      state.currentStep = 'RESOLVE_SKUS';
      await store.save(state, { expectedVersion: 1 });
      expect(state.checkpointVersion).toBe(2);

      // Stale save with outdated expectedVersion: 1 -> must throw CheckpointVersionConflictError
      state.currentStep = 'LOAD_CONTEXT';
      await expect(store.save(state, { expectedVersion: 1 })).rejects.toThrow(
        CheckpointVersionConflictError
      );

      try {
        await store.save(state, { expectedVersion: 1 });
      } catch (err: any) {
        expect(err.code).toBe('CHECKPOINT_VERSION_CONFLICT');
        expect(err.expectedVersion).toBe(1);
        expect(err.actualVersion).toBe(2);
        expect(err.taskId).toBe(taskId);
      }

      // Save with expectedVersion: 2 -> succeeds, version becomes 3
      await store.save(state, { expectedVersion: 2 });
      expect(state.checkpointVersion).toBe(3);
    });

    it('InMemoryWorkflowCheckpointStore also strictly enforces OCC', async () => {
      const store = new InMemoryWorkflowCheckpointStore();
      const taskId = 'task-mem-occ';

      const state: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-mem',
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
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(state);
      expect(state.checkpointVersion).toBe(1);

      await store.save(state, { expectedVersion: 1 });
      expect(state.checkpointVersion).toBe(2);

      await expect(store.save(state, { expectedVersion: 1 })).rejects.toThrow(
        CheckpointVersionConflictError
      );
    });
  });

  // ==========================================================================
  // 4. Action State Transition Preconditions
  // ==========================================================================
  describe('4. Action State Transition Preconditions', () => {
    it('should throw InvalidActionStateError when attempting to decide an already decided action', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await service.execute(input);
      const pendingIds = result.approvalSummary.pendingCount > 0
        ? result.actions.filter((a) => a.status === 'PROPOSED').map((a) => a.actionId)
        : [];

      if (pendingIds.length > 0) {
        const targetActionId = pendingIds[0];

        // First transition: PROPOSED -> APPROVED
        await service.approveAction(result.taskId, targetActionId, 'OPERATOR_1');

        // Second transition attempt: APPROVED -> REJECTED (Invalid)
        await expect(
          service.rejectAction(result.taskId, targetActionId, 'OPERATOR_2')
        ).rejects.toThrow(InvalidActionStateError);

        // Second transition attempt: APPROVED -> DISMISSED (Invalid)
        await expect(
          service.dismissAction(result.taskId, targetActionId, 'OPERATOR_2')
        ).rejects.toThrow(InvalidActionStateError);

        // Second transition attempt: APPROVED -> APPROVED again (Invalid)
        await expect(
          service.approveAction(result.taskId, targetActionId, 'OPERATOR_2')
        ).rejects.toThrow(InvalidActionStateError);

        try {
          await service.rejectAction(result.taskId, targetActionId, 'OPERATOR_2');
        } catch (err: any) {
          expect(err.code).toBe('INVALID_ACTION_STATE');
          expect(err.actionId).toBe(targetActionId);
          expect(err.currentStatus).toBe('APPROVED');
          expect(err.attemptedStatus).toBe('REJECTED');
        }
      }
    });
  });

  // ==========================================================================
  // 5. Concurrent Decision Race Protection
  // ==========================================================================
  describe('5. Concurrent Decision Race Protection', () => {
    it('two operators attempting concurrent decision on same action with stale version trigger OCC conflict', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await service.execute(input);
      const checkpoint = await store.get(result.taskId);
      const pendingIds = checkpoint?.approvalState.pendingActionIds ?? [];

      if (pendingIds.length >= 2) {
        const action1 = pendingIds[0];

        // Operator A and Operator B both load state at the same time (same checkpointVersion)
        const stateForOpA = await store.get(result.taskId);
        const stateForOpB = await store.get(result.taskId);

        expect(stateForOpA?.checkpointVersion).toBe(stateForOpB?.checkpointVersion);

        // Operator A approves action1 -> saves state, increments version in store
        await service.approveAction(result.taskId, action1, 'OPERATOR_A');

        const updatedInStore = await store.get(result.taskId);
        expect(updatedInStore?.checkpointVersion).toBeGreaterThan(stateForOpB!.checkpointVersion!);

        // If Operator B tries to save using their stale expectedVersion, store throws OCC conflict
        await expect(
          store.save(stateForOpB!, { expectedVersion: stateForOpB!.checkpointVersion })
        ).rejects.toThrow(CheckpointVersionConflictError);
      }
    });
  });

  // ==========================================================================
  // 6. Resume Idempotency
  // ==========================================================================
  describe('6. Resume Idempotency', () => {
    it('calling resume repeatedly on COMPLETED workflow is completely idempotent', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const initial = await service.execute(input);
      const pendingIds = initial.approvalSummary.pendingCount > 0
        ? initial.actions.filter((a) => a.status === 'PROPOSED').map((a) => a.actionId)
        : [];

      for (const id of pendingIds) {
        await service.approveAction(initial.taskId, id, 'OPERATOR');
      }

      const resume1 = await service.resume(initial.taskId);
      expect(resume1.status).toBe('COMPLETED');
      const traces1 = resume1.stepTraces.length;
      const actions1 = resume1.actions.length;

      // Repeated resume calls
      const resume2 = await service.resume(initial.taskId);
      const resume3 = await service.resume(initial.taskId);

      expect(resume2.status).toBe('COMPLETED');
      expect(resume3.status).toBe('COMPLETED');
      expect(resume2.stepTraces.length).toBe(traces1);
      expect(resume3.stepTraces.length).toBe(traces1);
      expect(resume2.actions.length).toBe(actions1);
      expect(resume3.actions.length).toBe(actions1);
    });

    it('calling resume on non-existent taskId throws WorkflowNotFoundError', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      await expect(service.resume('task-does-not-exist')).rejects.toThrow(
        WorkflowNotFoundError
      );

      try {
        await service.resume('task-does-not-exist');
      } catch (err: any) {
        expect(err.code).toBe('WORKFLOW_NOT_FOUND');
        expect(err.taskId).toBe('task-does-not-exist');
      }
    });
  });

  // ==========================================================================
  // 7. Crash Consistency & Event Listener Decoupling
  // ==========================================================================
  describe('7. Crash Consistency & Event Decoupling', () => {
    it('state is committed to persistent checkpoint before SSE event listener is notified', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const eventEmitter = new WorkflowEventEmitter();

      let checkpointVersionAtEvent = 0;
      let stateRetrievedDuringEvent: DailyOperationWorkflowState | null = null;

      // Subscribe to step.completed event
      eventEmitter.subscribe((event) => {
        if (event.type === 'step.completed' && event.step === 'VALIDATE_INPUT') {
          // Synchronously inspect store while event is firing:
          // The state MUST already be committed to disk!
          const filePath = path.join(testStorageDir, `${event.taskId}.checkpoint.json`);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            stateRetrievedDuringEvent = JSON.parse(content);
            checkpointVersionAtEvent = stateRetrievedDuringEvent?.checkpointVersion ?? 0;
          }
        }
      });

      const service = new DailyOperationWorkflowService({
        checkpointStore: store,
        eventEmitter,
      });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      await service.execute(input);

      expect(stateRetrievedDuringEvent).not.toBeNull();
      expect(stateRetrievedDuringEvent!.completedSteps).toContain('VALIDATE_INPUT');
      expect(checkpointVersionAtEvent).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 8. Trace Persistence Across Restarts
  // ==========================================================================
  describe('8. Trace Persistence Across Restarts', () => {
    it('all step traces survive persistence to disk and maintain duration and outputSummary', async () => {
      const store = new PersistentWorkflowCheckpointStore({ storageDir: testStorageDir });
      const service = new DailyOperationWorkflowService({ checkpointStore: store });

      const input: DailyOperationWorkflowInput = {
        workspaceId: 'ws_demo',
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      };

      const result = await service.execute(input);
      const reloadedState = await store.get(result.taskId);

      expect(reloadedState).not.toBeNull();
      expect(reloadedState!.stepTraces.length).toBeGreaterThanOrEqual(7);

      for (const trace of reloadedState!.stepTraces) {
        expect(trace.step).toBeDefined();
        expect(['COMPLETED', 'FAILED']).toContain(trace.status);
        expect(trace.startedAt).toBeDefined();
        expect(trace.completedAt).toBeDefined();
        expect(typeof trace.durationMs).toBe('number');
        expect(trace.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==========================================================================
  // 9. Database Adapter Integration (IWorkflowDatabaseAdapter)
  // ==========================================================================
  describe('9. Database Adapter Integration (IWorkflowDatabaseAdapter)', () => {
    it('PersistentWorkflowCheckpointStore routes properly through IWorkflowDatabaseAdapter', async () => {
      const databaseTable = new Map<string, any>();

      const mockDbAdapter: IWorkflowDatabaseAdapter = {
        saveTask: async (data) => {
          databaseTable.set(data.taskId, { ...data });
        },
        getTask: async (taskId) => {
          return databaseTable.get(taskId) ?? null;
        },
        deleteTask: async (taskId) => {
          databaseTable.delete(taskId);
        },
        hasTask: async (taskId) => {
          return databaseTable.has(taskId);
        },
      };

      const store = new PersistentWorkflowCheckpointStore({
        databaseAdapter: mockDbAdapter,
      });

      const taskId = 'task-db-adapter-001';
      const state: DailyOperationWorkflowState = {
        taskId,
        workflowRunId: 'run-db-001',
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
            actionId: 'ACT-001',
            workspaceId: 'ws_demo',
            category: 'INVENTORY',
            actionType: 'PREPARE_REPLENISHMENT',
            priority: 'P1',
            riskLevel: 'MEDIUM',
            executionMode: 'APPROVAL_REQUIRED',
            title: 'Replenish Inventory',
            reason: 'Days cover critical',
            status: 'PROPOSED',
            sourceSignalIds: ['SIG-001'],
            targetEntity: 'PurchaseOrder',
            evidence: [],
            payload: { quantity: 400 },
            createdAt: new Date().toISOString(),
          },
        ],
        approvalState: {
          pendingActionIds: ['ACT-001'],
          approvedActionIds: [],
          rejectedActionIds: [],
          dismissedActionIds: [],
          decisions: [],
        },
        currentStep: 'APPROVAL_GATE',
        completedSteps: ['VALIDATE_INPUT'],
        stepTraces: [
          {
            step: 'VALIDATE_INPUT',
            status: 'COMPLETED',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 5,
            outputSummary: 'Input valid',
          },
        ],
        errors: [],
        warnings: [],
        status: 'WAITING_APPROVAL',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save through adapter
      await store.save(state);
      expect(state.checkpointVersion).toBe(1);

      // Verify adapter database table was populated
      expect(databaseTable.has(taskId)).toBe(true);
      const dbRecord = databaseTable.get(taskId);
      expect(dbRecord.taskType).toBe('DAILY_OPERATION_WF05');
      expect(dbRecord.status).toBe('WAITING_APPROVAL');
      expect(dbRecord.workspaceId).toBe('ws_demo');
      expect(dbRecord.checkpointVersion).toBe(1);
      expect(dbRecord.approvals.length).toBe(1);
      expect(dbRecord.approvals[0].actionId).toBe('ACT-001');

      // Retrieve through store
      const retrieved = await store.get(taskId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.taskId).toBe(taskId);
      expect(retrieved?.status).toBe('WAITING_APPROVAL');
      expect(retrieved?.recommendedActions.length).toBe(1);

      // Delete through store
      await store.delete(taskId);
      expect(await store.has(taskId)).toBe(false);
      expect(databaseTable.has(taskId)).toBe(false);
    });
  });
});
