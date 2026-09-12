/**
 * Daily Operation Workflow Types & Contracts (Epic 3 Phase 6)
 *
 * Strict boundary: Workflow != Business Logic
 * Orchestrates Phase 1-5 engines without re-computing domain math.
 */

import {
  DailyOperationWorkflowStep,
  WorkflowExecutionStatus,
  WorkflowStepTrace,
  DailyOperationTopRisk,
  DailyOperationSummary,
  ActionApprovalDecision,
  WorkflowApprovalState,
  DailyOperationWorkflowState,
  DailyOperationWorkflowInput,
  DailyOperationWorkflowResult,
  DailyOperationEventType,
  DailyOperationWorkflowEvent,
} from '@crosspilot/shared';

export interface IWorkflowCheckpointStore {
  save(state: DailyOperationWorkflowState, options?: { expectedVersion?: number }): Promise<void>;
  get(taskId: string): Promise<DailyOperationWorkflowState | null>;
  delete(taskId: string): Promise<void>;
  has(taskId: string): Promise<boolean>;
}

export interface IWorkflowDatabaseAdapter {
  saveTask(
    data: {
      taskId: string;
      workspaceId: string;
      taskType: string;
      status: string;
      activeSkuId?: string;
      inputJson: string;
      resultJson: string;
      stepTraces?: WorkflowStepTrace[];
      approvals?: Array<{
        actionId: string;
        actionType?: string;
        status: string;
        requestedPayload: string;
        decidedBy?: string;
        note?: string;
      }>;
      checkpointVersion: number;
      workflowVersion?: string;
      currentStep?: string;
      checkpointedAt?: string;
      userId?: string;
    },
    options?: { expectedVersion?: number }
  ): Promise<void>;

  getTask(taskId: string): Promise<{
    taskId: string;
    workspaceId: string;
    status: string;
    inputJson: string;
    resultJson: string;
    checkpointVersion: number;
    workflowVersion?: string | null;
    currentStep?: string | null;
    checkpointedAt?: Date | string | null;
    userId?: string | null;
  } | null>;

  deleteTask(taskId: string): Promise<void>;
  hasTask(taskId: string): Promise<boolean>;
}

export class PersistenceUnavailableError extends Error {
  public readonly code = 'PERSISTENCE_UNAVAILABLE';
  constructor(message?: string) {
    super(
      message ??
        'PERSISTENCE_UNAVAILABLE: Workflow persistence backend is unavailable or not configured. Production requires a durable database adapter.'
    );
    this.name = 'PersistenceUnavailableError';
  }
}

export class CheckpointVersionConflictError extends Error {
  public readonly code = 'CHECKPOINT_VERSION_CONFLICT';
  constructor(
    public readonly taskId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `CHECKPOINT_VERSION_CONFLICT: Expected version ${expectedVersion}, but found ${actualVersion} for task ${taskId}`
    );
    this.name = 'CheckpointVersionConflictError';
  }
}

export class InvalidActionStateError extends Error {
  public readonly code = 'INVALID_ACTION_STATE';
  constructor(
    public readonly actionId: string,
    public readonly currentStatus: string,
    public readonly attemptedStatus: string
  ) {
    super(
      `INVALID_ACTION_STATE: Cannot transition action ${actionId} from ${currentStatus} to ${attemptedStatus}. Only PROPOSED actions can be decided.`
    );
    this.name = 'InvalidActionStateError';
  }
}

export class WorkflowNotFoundError extends Error {
  public readonly code = 'WORKFLOW_NOT_FOUND';
  constructor(public readonly taskId: string) {
    super(`WORKFLOW_NOT_FOUND: Workflow state for task ${taskId} was not found in checkpoint store.`);
    this.name = 'WorkflowNotFoundError';
  }
}

export interface ISkuResolver {
  resolveActiveSkus(workspaceId: string, marketplaceId: string, maxCount?: number): Promise<string[]>;
}

export type WorkflowEventListener = (event: DailyOperationWorkflowEvent) => void;

export interface WorkflowExecutionHooks {
  onEvent?: WorkflowEventListener;
  onStepTransition?: (step: DailyOperationWorkflowStep, status: WorkflowStepTrace['status']) => void;
}

