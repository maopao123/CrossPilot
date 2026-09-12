/**
 * Daily Operation Workflow Service (WF-05 DAG & HITL) - Epic 3 Phase 6
 *
 * Orchestrates:
 * 1. VALIDATE_INPUT
 * 2. RESOLVE_SKUS
 * 3. LOAD_CONTEXT (Sku360ContextLoader)
 * 4. DETECT_SIGNALS (OperationAnomalyDetector)
 * 5. DIAGNOSE (CrossDomainDiagnosisService)
 * 6. RECOMMEND (ActionRecommendationService)
 * 7. AGGREGATE (WorkflowAggregator)
 * 8. APPROVAL_GATE (HITL: ADVISORY vs APPROVAL_REQUIRED)
 * 9. FINALIZE (DailyOperationWorkflowResult)
 *
 * Strict Axiom: Workflow != Business Logic
 * Pure deterministic orchestration, checkpointing, and trace generation.
 */

import {
  DailyOperationWorkflowInput,
  DailyOperationWorkflowResult,
  DailyOperationWorkflowState,
  DailyOperationWorkflowStep,
  WorkflowExecutionStatus,
  WorkflowStepTrace,
  Sku360BusinessContext,
  BusinessSignal,
  DiagnosisResult,
  RecommendedAction,
  DailyOperationSummary,
} from '@crosspilot/shared';

import {
  IWorkflowCheckpointStore,
  ISkuResolver,
  WorkflowExecutionHooks,
  CheckpointVersionConflictError,
  InvalidActionStateError,
  WorkflowNotFoundError,
} from './workflow.types.js';
import {
  InMemoryWorkflowCheckpointStore,
  PersistentWorkflowCheckpointStore,
} from './workflow-checkpoint.store.js';
import { WorkflowEventEmitter } from './workflow-event-emitter.js';
import { WorkflowAggregator } from './workflow-aggregator.js';

import { Sku360ContextLoader } from '../sku360-context-loader.js';
import { ScenarioSku360DataSource } from '../scenario-sku360-data-source.js';
import { OperationAnomalyDetector } from '../operation-anomaly-detector.js';
import { CrossDomainDiagnosisService } from '../diagnosis/cross-domain-diagnosis.service.js';
import { ActionRecommendationService } from '../recommendation/action-recommendation.service.js';

export class DailyOperationWorkflowService {
  private readonly contextLoader: Sku360ContextLoader;
  private readonly checkpointStore: IWorkflowCheckpointStore;
  private readonly eventEmitter: WorkflowEventEmitter;
  private readonly skuResolver?: ISkuResolver;

  constructor(options?: {
    contextLoader?: Sku360ContextLoader;
    checkpointStore?: IWorkflowCheckpointStore;
    eventEmitter?: WorkflowEventEmitter;
    skuResolver?: ISkuResolver;
  }) {
    this.contextLoader =
      options?.contextLoader ?? new Sku360ContextLoader(new ScenarioSku360DataSource());
    // Production default: PersistentWorkflowCheckpointStore.
    // Tests or ephemeral callers can explicitly pass InMemoryWorkflowCheckpointStore.
    this.checkpointStore =
      options?.checkpointStore ?? new PersistentWorkflowCheckpointStore();
    this.eventEmitter = options?.eventEmitter ?? new WorkflowEventEmitter();
    this.skuResolver = options?.skuResolver;
  }

  public getEventEmitter(): WorkflowEventEmitter {
    return this.eventEmitter;
  }

  public getCheckpointStore(): IWorkflowCheckpointStore {
    return this.checkpointStore;
  }

  public async getState(taskId: string): Promise<DailyOperationWorkflowState | null> {
    return this.checkpointStore.get(taskId);
  }

  public async getWorkflowState(taskId: string): Promise<DailyOperationWorkflowState | null> {
    return this.checkpointStore.get(taskId);
  }

  /**
   * Main entrypoint for WF-05 DAG execution.
   */
  public async execute(
    input: DailyOperationWorkflowInput,
    hooks?: WorkflowExecutionHooks
  ): Promise<DailyOperationWorkflowResult> {
    if (hooks?.onEvent) {
      this.eventEmitter.subscribe(hooks.onEvent);
    }

    const taskId = input.taskId ?? `task-wf05-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const workflowRunId = input.workflowRunId ?? `run-${Date.now()}`;

    // Initialize State
    const state: DailyOperationWorkflowState = {
      taskId,
      workflowRunId,
      workspaceId: input.workspaceId,
      marketplaceId: input.marketplaceId,
      mode: input.mode,
      skuIds: input.skuIds ?? (input.skuId ? [input.skuId] : []),
      dateRange: input.dateRange,
      baselinePeriod: input.baselinePeriod,
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
      checkpointedAt: new Date().toISOString(),
      workflowVersion: input.workflowVersion ?? 'WF05_V1',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save initial checkpoint
    await this.checkpointStore.save(state);

    this.eventEmitter.emitEvent(
      'workflow.started',
      taskId,
      workflowRunId,
      `WF-05 Daily Operation Workflow started in ${input.mode} mode for workspace ${input.workspaceId}.`,
      { payload: { mode: input.mode, workspaceId: input.workspaceId } }
    );

    try {
      // Step 1: VALIDATE_INPUT
      await this.runStep(state, 'VALIDATE_INPUT', async () => {
        this.validateInput(input);
        return { outputSummary: `Input validated successfully for mode: ${input.mode}` };
      });

      // Step 2: RESOLVE_SKUS
      await this.runStep(state, 'RESOLVE_SKUS', async () => {
        const resolved = await this.resolveSkus(input);
        state.skuIds = resolved;
        return {
          outputSummary: `Resolved ${resolved.length} active SKU(s): ${resolved.join(', ')}`,
        };
      });

      // Step 3: LOAD_CONTEXT
      let failedSkuCount = 0;
      await this.runStep(state, 'LOAD_CONTEXT', async () => {
        const concurrency = input.options?.maxConcurrency ?? 3;
        const skus = state.skuIds;

        // Controlled batch loading
        for (let i = 0; i < skus.length; i += concurrency) {
          const batch = skus.slice(i, i + concurrency);
          const results = await Promise.allSettled(
            batch.map(async (skuId) => {
              this.eventEmitter.emitEvent(
                'sku.started',
                taskId,
                workflowRunId,
                `Loading Sku360 business context for SKU: ${skuId}`,
                { skuId }
              );

              const ctx = await this.contextLoader.loadSku360({
                workspaceId: input.workspaceId,
                marketplaceId: input.marketplaceId,
                skuId,
                currentPeriod: input.dateRange,
                baselinePeriod: input.baselinePeriod,
              });

              this.eventEmitter.emitEvent(
                'sku.completed',
                taskId,
                workflowRunId,
                `Loaded Sku360 context for SKU: ${skuId} (Availability: ${ctx.availability.overall})`,
                { skuId }
              );

              return ctx;
            })
          );

          results.forEach((res, idx) => {
            const skuId = batch[idx];
            if (res.status === 'fulfilled') {
              state.contexts[skuId] = res.value;
            } else {
              failedSkuCount++;
              const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
              state.errors.push({
                step: 'LOAD_CONTEXT',
                skuId,
                message: `Failed to load context for SKU ${skuId}: ${msg}`,
                timestamp: new Date().toISOString(),
              });
              if (input.options?.failFast) {
                throw new Error(`Fail-fast triggered on SKU ${skuId}: ${msg}`);
              }
            }
          });
        }

        const loadedCount = Object.keys(state.contexts).length;
        return {
          outputSummary: `Successfully loaded ${loadedCount}/${skus.length} SKU context(s) (${failedSkuCount} failed).`,
        };
      });

      // Step 4: DETECT_SIGNALS
      await this.runStep(state, 'DETECT_SIGNALS', async () => {
        const allSignals: BusinessSignal[] = [];

        for (const [skuId, context] of Object.entries(state.contexts)) {
          const detectorInput = Sku360ContextLoader.toAnomalyDetectorInput(context);
          const detectionResult = OperationAnomalyDetector.detect(detectorInput);

          allSignals.push(...detectionResult.signals);

          if (detectionResult.signals.length > 0) {
            this.eventEmitter.emitEvent(
              'signal.detected',
              taskId,
              workflowRunId,
              `Detected ${detectionResult.signals.length} anomaly signal(s) for SKU ${skuId}`,
              { skuId, payload: { count: detectionResult.signals.length } }
            );
          }
        }

        state.signals = allSignals;
        return {
          outputSummary: `Detected ${allSignals.length} total operational anomaly signal(s) across all SKUs.`,
        };
      });

      // Step 5: DIAGNOSE
      await this.runStep(state, 'DIAGNOSE', async () => {
        if (state.signals.length === 0) {
          this.eventEmitter.emitEvent(
            'diagnosis.completed',
            taskId,
            workflowRunId,
            'Zero operational signals detected. No diagnosis required.',
            { step: 'DIAGNOSE' }
          );
          return { outputSummary: 'Zero signals detected. Skipped root cause diagnosis.' };
        }

        const allDiagnoses: DiagnosisResult[] = [];

        for (const [skuId, context] of Object.entries(state.contexts)) {
          const matchesThisSku = (id?: string) =>
            Boolean(
              id &&
                (id === skuId ||
                  id === context.identity.skuId ||
                  id === context.identity.skuCode)
            );

          const skuSignals = state.signals.filter((s) => matchesThisSku(s.skuId));
          if (skuSignals.length === 0) continue;

          const diagResponse = CrossDomainDiagnosisService.diagnose({
            context,
            signals: skuSignals,
          });

          allDiagnoses.push(...diagResponse.diagnoses);

          this.eventEmitter.emitEvent(
            'diagnosis.completed',
            taskId,
            workflowRunId,
            `Completed root-cause diagnosis for SKU ${skuId} (${diagResponse.diagnoses.length} diagnosis generated)`,
            { skuId, payload: { count: diagResponse.diagnoses.length } }
          );
        }

        state.diagnoses = allDiagnoses;
        return {
          outputSummary: `Generated ${allDiagnoses.length} causal diagnosis result(s).`,
        };
      });

      // Step 6: RECOMMEND
      await this.runStep(state, 'RECOMMEND', async () => {
        const allActions: RecommendedAction[] = [];

        for (const [skuId, context] of Object.entries(state.contexts)) {
          const matchesThisSku = (id?: string) =>
            Boolean(
              id &&
                (id === skuId ||
                  id === context.identity.skuId ||
                  id === context.identity.skuCode)
            );

          const skuSignals = state.signals.filter((s) => matchesThisSku(s.skuId));
          const skuDiagnoses = state.diagnoses.filter((d) => matchesThisSku(d.skuId));

          const recResponse = ActionRecommendationService.recommend({
            context,
            signals: skuSignals,
            diagnoses: skuDiagnoses,
          });

          allActions.push(...recResponse.actions);

          if (recResponse.actions.length > 0) {
            this.eventEmitter.emitEvent(
              'recommendation.created',
              taskId,
              workflowRunId,
              `Generated ${recResponse.actions.length} recommended action(s) for SKU ${skuId}`,
              { skuId, payload: { count: recResponse.actions.length } }
            );
          }
        }

        state.recommendedActions = allActions;
        return {
          outputSummary: `Generated ${allActions.length} initial proposed action(s).`,
        };
      });

      // Step 7: AGGREGATE
      await this.runStep(state, 'AGGREGATE', async () => {
        const { rankedActions, summary, healthStatus } = WorkflowAggregator.aggregate({
          totalSkuCount: state.skuIds.length,
          evaluatedSkuCount: Object.keys(state.contexts).length,
          failedSkuCount,
          signals: state.signals,
          actions: state.recommendedActions,
        });

        state.recommendedActions = rankedActions;
        state.summary = summary;

        return {
          outputSummary: `Aggregated Today's Action List: ${rankedActions.length} actions. Health Status: ${healthStatus}.`,
        };
      });

      // Step 8: APPROVAL_GATE
      const approvalRequired = state.recommendedActions.filter(
        (a) => a.executionMode === 'APPROVAL_REQUIRED' && a.status === 'PROPOSED'
      );

      state.approvalState.pendingActionIds = approvalRequired.map((a) => a.actionId);

      // If approval-required actions exist and autoApproveAdvisory is not enabled, pause at approval gate
      if (approvalRequired.length > 0 && !input.options?.autoApproveAdvisory) {
        state.status = 'WAITING_APPROVAL';
        state.currentStep = 'APPROVAL_GATE';
        state.updatedAt = new Date().toISOString();

        // 1. Persist state first (Source of Truth)
        await this.checkpointStore.save(state);

        // 2. Emit event second (Observation Channel)
        this.eventEmitter.emitEvent(
          'approval.required',
          taskId,
          workflowRunId,
          `Workflow paused at Human-in-the-Loop approval gate: ${approvalRequired.length} action(s) require human authorization.`,
          {
            step: 'APPROVAL_GATE',
            payload: {
              pendingActionIds: state.approvalState.pendingActionIds,
              count: approvalRequired.length,
            },
          }
        );

        return this.buildResult(state);
      }

      state.completedSteps.push('APPROVAL_GATE');

      // Step 9: FINALIZE
      return await this.finalizeWorkflow(state, failedSkuCount);
    } catch (err) {
      state.status = 'FAILED';
      const errMsg = err instanceof Error ? err.message : String(err);
      state.errors.push({
        step: state.currentStep,
        message: errMsg,
        timestamp: new Date().toISOString(),
      });
      state.completedAt = new Date().toISOString();

      await this.checkpointStore.save(state);

      this.eventEmitter.emitEvent(
        'workflow.failed',
        taskId,
        workflowRunId,
        `Workflow failed at step ${state.currentStep}: ${errMsg}`,
        { payload: { error: errMsg } }
      );

      return this.buildResult(state);
    }
  }

  /**
   * Action-level Approval (HITL)
   */
  public async approveAction(
    taskId: string,
    actionId: string,
    decidedBy = 'HUMAN_OPERATOR',
    note?: string,
    options?: { expectedVersion?: number }
  ): Promise<DailyOperationWorkflowState> {
    const state = await this.loadStateOrThrow(taskId);

    if (options?.expectedVersion !== undefined && state.checkpointVersion !== options.expectedVersion) {
      throw new CheckpointVersionConflictError(
        taskId,
        options.expectedVersion,
        state.checkpointVersion ?? 0
      );
    }

    const action = state.recommendedActions.find((a) => a.actionId === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found in task ${taskId}`);
    }

    // Precondition check: Only PROPOSED actions can be approved
    if (action.status !== 'PROPOSED') {
      throw new InvalidActionStateError(actionId, action.status, 'APPROVED');
    }

    // Update Action Status
    action.status = 'APPROVED';

    // Update Workflow Approval State
    state.approvalState.pendingActionIds = state.approvalState.pendingActionIds.filter(
      (id) => id !== actionId
    );
    if (!state.approvalState.approvedActionIds.includes(actionId)) {
      state.approvalState.approvedActionIds.push(actionId);
    }

    state.approvalState.decisions.push({
      actionId,
      decision: 'APPROVED',
      decidedBy,
      note,
      decidedAt: new Date().toISOString(),
    });

    state.updatedAt = new Date().toISOString();

    // If no more pending actions, transition to COMPLETED
    if (state.approvalState.pendingActionIds.length === 0) {
      if (!state.completedSteps.includes('APPROVAL_GATE')) {
        state.completedSteps.push('APPROVAL_GATE');
      }
      if (!state.completedSteps.includes('FINALIZE')) {
        state.completedSteps.push('FINALIZE');
      }
      state.status = 'COMPLETED';
      state.completedAt = new Date().toISOString();
    } else {
      state.status = 'PARTIALLY_APPROVED';
    }

    // Persist with Optimistic Concurrency Control (OCC)
    const expectedVersion = options?.expectedVersion ?? state.checkpointVersion;
    await this.checkpointStore.save(state, { expectedVersion });

    this.eventEmitter.emitEvent(
      'action.approved',
      taskId,
      state.workflowRunId,
      `Action ${actionId} (${action.title}) APPROVED by ${decidedBy}.`,
      { payload: { actionId, decision: 'APPROVED', note } }
    );

    if (state.status === 'COMPLETED') {
      this.eventEmitter.emitEvent(
        'workflow.completed',
        taskId,
        state.workflowRunId,
        `WF-05 DAG execution completed after final action decision. Health: ${state.summary?.healthStatus ?? 'HEALTHY'}.`,
        {
          payload: {
            status: state.status,
            totalActions: state.recommendedActions.length,
            healthStatus: state.summary?.healthStatus,
          },
        }
      );
    }

    return state;
  }

  /**
   * Action-level Rejection (HITL)
   */
  public async rejectAction(
    taskId: string,
    actionId: string,
    decidedBy = 'HUMAN_OPERATOR',
    note?: string,
    options?: { expectedVersion?: number }
  ): Promise<DailyOperationWorkflowState> {
    const state = await this.loadStateOrThrow(taskId);

    if (options?.expectedVersion !== undefined && state.checkpointVersion !== options.expectedVersion) {
      throw new CheckpointVersionConflictError(
        taskId,
        options.expectedVersion,
        state.checkpointVersion ?? 0
      );
    }

    const action = state.recommendedActions.find((a) => a.actionId === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found in task ${taskId}`);
    }

    // Precondition check: Only PROPOSED actions can be rejected
    if (action.status !== 'PROPOSED') {
      throw new InvalidActionStateError(actionId, action.status, 'REJECTED');
    }

    action.status = 'REJECTED';

    state.approvalState.pendingActionIds = state.approvalState.pendingActionIds.filter(
      (id) => id !== actionId
    );
    if (!state.approvalState.rejectedActionIds.includes(actionId)) {
      state.approvalState.rejectedActionIds.push(actionId);
    }

    state.approvalState.decisions.push({
      actionId,
      decision: 'REJECTED',
      decidedBy,
      note,
      decidedAt: new Date().toISOString(),
    });

    state.updatedAt = new Date().toISOString();

    if (state.approvalState.pendingActionIds.length === 0) {
      if (!state.completedSteps.includes('APPROVAL_GATE')) {
        state.completedSteps.push('APPROVAL_GATE');
      }
      if (!state.completedSteps.includes('FINALIZE')) {
        state.completedSteps.push('FINALIZE');
      }
      state.status = 'COMPLETED';
      state.completedAt = new Date().toISOString();
    } else {
      state.status = 'PARTIALLY_APPROVED';
    }

    const expectedVersion = options?.expectedVersion ?? state.checkpointVersion;
    await this.checkpointStore.save(state, { expectedVersion });

    this.eventEmitter.emitEvent(
      'action.rejected',
      taskId,
      state.workflowRunId,
      `Action ${actionId} (${action.title}) REJECTED by ${decidedBy}.`,
      { payload: { actionId, decision: 'REJECTED', note } }
    );

    if (state.status === 'COMPLETED') {
      this.eventEmitter.emitEvent(
        'workflow.completed',
        taskId,
        state.workflowRunId,
        `WF-05 DAG execution completed after final action decision. Health: ${state.summary?.healthStatus ?? 'HEALTHY'}.`,
        {
          payload: {
            status: state.status,
            totalActions: state.recommendedActions.length,
            healthStatus: state.summary?.healthStatus,
          },
        }
      );
    }

    return state;
  }

  /**
   * Action-level Dismissal (HITL)
   */
  public async dismissAction(
    taskId: string,
    actionId: string,
    decidedBy = 'HUMAN_OPERATOR',
    note?: string,
    options?: { expectedVersion?: number }
  ): Promise<DailyOperationWorkflowState> {
    const state = await this.loadStateOrThrow(taskId);

    if (options?.expectedVersion !== undefined && state.checkpointVersion !== options.expectedVersion) {
      throw new CheckpointVersionConflictError(
        taskId,
        options.expectedVersion,
        state.checkpointVersion ?? 0
      );
    }

    const action = state.recommendedActions.find((a) => a.actionId === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found in task ${taskId}`);
    }

    // Precondition check: Only PROPOSED actions can be dismissed
    if (action.status !== 'PROPOSED') {
      throw new InvalidActionStateError(actionId, action.status, 'DISMISSED');
    }

    action.status = 'DISMISSED';

    state.approvalState.pendingActionIds = state.approvalState.pendingActionIds.filter(
      (id) => id !== actionId
    );
    if (!state.approvalState.dismissedActionIds.includes(actionId)) {
      state.approvalState.dismissedActionIds.push(actionId);
    }

    state.approvalState.decisions.push({
      actionId,
      decision: 'DISMISSED',
      decidedBy,
      note,
      decidedAt: new Date().toISOString(),
    });

    state.updatedAt = new Date().toISOString();

    if (state.approvalState.pendingActionIds.length === 0) {
      if (!state.completedSteps.includes('APPROVAL_GATE')) {
        state.completedSteps.push('APPROVAL_GATE');
      }
      if (!state.completedSteps.includes('FINALIZE')) {
        state.completedSteps.push('FINALIZE');
      }
      state.status = 'COMPLETED';
      state.completedAt = new Date().toISOString();
    } else {
      state.status = 'PARTIALLY_APPROVED';
    }

    const expectedVersion = options?.expectedVersion ?? state.checkpointVersion;
    await this.checkpointStore.save(state, { expectedVersion });

    this.eventEmitter.emitEvent(
      'action.dismissed',
      taskId,
      state.workflowRunId,
      `Action ${actionId} (${action.title}) DISMISSED by ${decidedBy}.`,
      { payload: { actionId, decision: 'DISMISSED', note } }
    );

    if (state.status === 'COMPLETED') {
      this.eventEmitter.emitEvent(
        'workflow.completed',
        taskId,
        state.workflowRunId,
        `WF-05 DAG execution completed after final action decision. Health: ${state.summary?.healthStatus ?? 'HEALTHY'}.`,
        {
          payload: {
            status: state.status,
            totalActions: state.recommendedActions.length,
            healthStatus: state.summary?.healthStatus,
          },
        }
      );
    }

    return state;
  }

  /**
   * Resume paused workflow from checkpoint
   */
  public async resume(
    taskId: string,
    options?: { expectedVersion?: number }
  ): Promise<DailyOperationWorkflowResult> {
    const state = await this.loadStateOrThrow(taskId);

    if (options?.expectedVersion !== undefined && state.checkpointVersion !== options.expectedVersion) {
      throw new CheckpointVersionConflictError(
        taskId,
        options.expectedVersion,
        state.checkpointVersion ?? 0
      );
    }

    if (state.status === 'COMPLETED' || state.status === 'FAILED') {
      return this.buildResult(state);
    }

    // If waiting for approval and all actions were decided
    if (state.status === 'WAITING_APPROVAL' || state.status === 'PARTIALLY_APPROVED') {
      if (state.approvalState.pendingActionIds.length === 0) {
        state.status = 'COMPLETED';
        state.completedAt = new Date().toISOString();
        if (!state.completedSteps.includes('APPROVAL_GATE')) {
          state.completedSteps.push('APPROVAL_GATE');
        }
        if (!state.completedSteps.includes('FINALIZE')) {
          state.completedSteps.push('FINALIZE');
        }
        await this.checkpointStore.save(state);

        this.eventEmitter.emitEvent(
          'workflow.completed',
          state.taskId,
          state.workflowRunId,
          `WF-05 DAG execution resumed and completed with status: ${state.status}. Health: ${state.summary?.healthStatus ?? 'HEALTHY'}.`,
          {
            payload: {
              status: state.status,
              totalActions: state.recommendedActions.length,
              healthStatus: state.summary?.healthStatus,
            },
          }
        );
      }
    }

    return this.buildResult(state);
  }

  // ==========================================================================
  // Private Step Execution Helpers
  // ==========================================================================

  private async runStep(
    state: DailyOperationWorkflowState,
    step: DailyOperationWorkflowStep,
    executor: () => Promise<{ outputSummary?: string }>
  ): Promise<void> {
    const startTime = Date.now();
    state.currentStep = step;
    state.updatedAt = new Date().toISOString();

    this.eventEmitter.emitEvent(
      'step.started',
      state.taskId,
      state.workflowRunId,
      `Executing DAG step: ${step}`,
      { step }
    );

    try {
      const { outputSummary } = await executor();
      const durationMs = Date.now() - startTime;

      const trace: WorkflowStepTrace = {
        step,
        status: 'COMPLETED',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
        outputSummary,
      };

      state.stepTraces.push(trace);
      state.completedSteps.push(step);

      // Crash Consistency: Source of Truth (checkpoint) is updated before observation channel (SSE)
      await this.checkpointStore.save(state);

      this.eventEmitter.emitEvent(
        'step.completed',
        state.taskId,
        state.workflowRunId,
        `Step ${step} completed successfully in ${durationMs}ms`,
        { step, payload: { durationMs, outputSummary } }
      );
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      const trace: WorkflowStepTrace = {
        step,
        status: 'FAILED',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs,
        error: errMsg,
      };

      state.stepTraces.push(trace);
      throw err;
    }
  }

  private validateInput(input: DailyOperationWorkflowInput): void {
    if (!input.workspaceId || input.workspaceId.trim() === '') {
      throw new Error('FAILED_VALIDATION: workspaceId is required and cannot be empty.');
    }
    if (!input.marketplaceId || input.marketplaceId.trim() === '') {
      throw new Error('FAILED_VALIDATION: marketplaceId is required.');
    }
    if (!input.dateRange || !input.dateRange.from || !input.dateRange.to) {
      throw new Error('FAILED_VALIDATION: dateRange { from, to } is required.');
    }
    if (new Date(input.dateRange.from) > new Date(input.dateRange.to)) {
      throw new Error('FAILED_VALIDATION: dateRange.from cannot be greater than dateRange.to.');
    }
    if (input.mode === 'SKU' && !input.skuId && (!input.skuIds || input.skuIds.length === 0)) {
      throw new Error('FAILED_VALIDATION: skuId is required when mode is SKU.');
    }
  }

  private async resolveSkus(input: DailyOperationWorkflowInput): Promise<string[]> {
    if (input.mode === 'SKU') {
      const targetSku = input.skuId || input.skuIds![0];
      return [targetSku];
    }

    if (input.skuIds && input.skuIds.length > 0) {
      return input.options?.maxSkuCount
        ? input.skuIds.slice(0, input.options.maxSkuCount)
        : input.skuIds;
    }

    if (this.skuResolver) {
      const resolved = await this.skuResolver.resolveActiveSkus(
        input.workspaceId,
        input.marketplaceId,
        input.options?.maxSkuCount
      );
      return resolved;
    }

    // Default canonical scenario SKUs
    const defaultSkus = ['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'];
    return input.options?.maxSkuCount
      ? defaultSkus.slice(0, input.options.maxSkuCount)
      : defaultSkus;
  }

  private async finalizeWorkflow(
    state: DailyOperationWorkflowState,
    failedSkuCount: number
  ): Promise<DailyOperationWorkflowResult> {
    state.currentStep = 'FINALIZE';
    state.completedSteps.push('FINALIZE');
    state.status = failedSkuCount > 0 ? 'PARTIAL_SUCCESS' : 'COMPLETED';
    state.completedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    await this.checkpointStore.save(state);

    this.eventEmitter.emitEvent(
      'workflow.completed',
      state.taskId,
      state.workflowRunId,
      `WF-05 DAG execution completed with status: ${state.status}. Health: ${state.summary?.healthStatus ?? 'HEALTHY'}.`,
      {
        payload: {
          status: state.status,
          totalActions: state.recommendedActions.length,
          healthStatus: state.summary?.healthStatus,
        },
      }
    );

    return this.buildResult(state);
  }

  private buildResult(state: DailyOperationWorkflowState): DailyOperationWorkflowResult {
    const totalSku = state.skuIds.length;
    const evaluatedSku = Object.keys(state.contexts).length;
    const failedSku = totalSku - evaluatedSku;
    const affectedSku = state.summary?.affectedSkuCount ?? 0;

    const summary: DailyOperationSummary = state.summary ?? {
      healthStatus: 'HEALTHY',
      totalSkuCount: totalSku,
      evaluatedSkuCount: evaluatedSku,
      failedSkuCount: failedSku,
      affectedSkuCount: affectedSku,
      criticalSignalCount: state.signals.filter((s) => s.severity === 'CRITICAL').length,
      warningSignalCount: state.signals.filter((s) => s.severity === 'WARNING').length,
      p1ActionCount: state.recommendedActions.filter((a) => a.priority === 'P1').length,
      p2ActionCount: state.recommendedActions.filter((a) => a.priority === 'P2').length,
      p3ActionCount: state.recommendedActions.filter((a) => a.priority === 'P3').length,
      advisoryCount: state.recommendedActions.filter((a) => a.executionMode === 'ADVISORY').length,
      approvalRequiredCount: state.recommendedActions.filter(
        (a) => a.executionMode === 'APPROVAL_REQUIRED'
      ).length,
      topRisks: [],
      actions: state.recommendedActions,
      noActionRequired: state.recommendedActions.length === 0,
    };

    return {
      taskId: state.taskId,
      workflowRunId: state.workflowRunId,
      mode: state.mode,
      workspaceId: state.workspaceId,
      marketplaceId: state.marketplaceId,
      status: state.status,
      healthStatus: summary.healthStatus,
      checkpointVersion: state.checkpointVersion,
      workflowVersion: state.workflowVersion ?? 'WF05_V1',
      skuSummary: {
        total: totalSku,
        evaluated: evaluatedSku,
        failed: failedSku,
        affected: affectedSku,
      },
      signals: state.signals,
      diagnoses: state.diagnoses,
      actions: state.recommendedActions,
      approvalSummary: {
        pendingCount: state.approvalState.pendingActionIds.length,
        approvedCount: state.approvalState.approvedActionIds.length,
        rejectedCount: state.approvalState.rejectedActionIds.length,
        dismissedCount: state.approvalState.dismissedActionIds.length,
      },
      summary,
      warnings: state.warnings.map((w) => `[${w.step}] ${w.message}`),
      errors: state.errors.map((e) => `[${e.step}] ${e.message}`),
      stepTraces: state.stepTraces,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    };
  }

  private async loadStateOrThrow(taskId: string): Promise<DailyOperationWorkflowState> {
    const state = await this.checkpointStore.get(taskId);
    if (!state) {
      throw new WorkflowNotFoundError(taskId);
    }
    return state;
  }
}
