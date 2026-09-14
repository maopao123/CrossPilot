/**
 * Daily Diagnosis API Service (Epic 3 Phase 7)
 *
 * Implements the domain workflow bridge for WF-05 Daily Operation Workflow.
 * Enforces:
 * - Single Source of Truth: PostgreSQL / Prisma Checkpoint Store
 * - Strict Workspace Isolation
 * - Client Idempotency
 * - Zero External Execution on Decision
 * - Outbound Sensitive Data Scrubbing
 */

import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DailyOperationWorkflowService,
  PostgresWorkflowCheckpointStore,
  PrismaWorkflowDatabaseAdapter,
  SensitiveDataGuard,
  Sku360ContextLoader,
  WorkflowNotFoundError,
  CheckpointVersionConflictError,
  InvalidActionStateError,
  PersistenceUnavailableError,
} from '@crosspilot/domain';
import { StoreSku360DataSource } from '../commerce-store/store-sku360-data-source.js';
import { V2Sku360DataSource } from '../commerce-store/v2-sku360-data-source.js';
import { setDailyOperationWorkflowService } from '@crosspilot/tool-platform';
import {
  DailyOperationStartRequestDto,
  DailyOperationStartResponseDto,
  DailyOperationTaskSummaryDto,
  DailyOperationActionDecisionDto,
  DailyOperationActionDecisionResponseDto,
  DailyOperationResumeResponseDto,
  DailyOperationWorkflowEvent,
  DailyOperationWorkflowInput,
  DailyOperationWorkflowState,
  RecommendedAction,
} from '@crosspilot/shared';

const DAILY_DIAGNOSIS_IDEMPOTENCY_SCOPE = 'daily-diagnosis';

function isPrismaUniqueConflict(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as any).code === 'P2002');
}

@Injectable()
export class DailyDiagnosisService {
  private readonly workflowService: DailyOperationWorkflowService;
  private readonly dbAdapter: PrismaWorkflowDatabaseAdapter;
  private readonly checkpointStore: PostgresWorkflowCheckpointStore;

  constructor(private readonly prisma: PrismaService) {
    this.dbAdapter = new PrismaWorkflowDatabaseAdapter(this.prisma);
    this.checkpointStore = new PostgresWorkflowCheckpointStore(this.dbAdapter);
    const storeMode = process.env.STORE_SKU360_SOURCE === 'prisma';
    this.workflowService = new DailyOperationWorkflowService({
      checkpointStore: this.checkpointStore,
      contextLoader: storeMode
        ? new Sku360ContextLoader(new StoreSku360DataSource(this.prisma))
        : undefined,
    });
    setDailyOperationWorkflowService(this.workflowService);
  }

  public getWorkflowService(): DailyOperationWorkflowService {
    return this.workflowService;
  }

  public getCheckpointStore(): PostgresWorkflowCheckpointStore {
    return this.checkpointStore;
  }

  public async getServiceForWorkspace(workspaceId: string): Promise<DailyOperationWorkflowService> {
    if (this.prisma.simulationRun?.findUnique) {
      const isV2Run = await this.prisma.simulationRun.findUnique({
        where: { runWorkspaceId: workspaceId },
      });
      if (isV2Run) {
        return new DailyOperationWorkflowService({
          checkpointStore: this.checkpointStore,
          contextLoader: new Sku360ContextLoader(new V2Sku360DataSource(this.prisma)),
        });
      }
    }
    return this.workflowService;
  }

  /**
   * Starts a daily diagnosis workflow execution.
   * If idempotencyKey is supplied and already recorded, returns the existing task.
   */
  async startDiagnosis(
    workspaceId: string,
    dto: DailyOperationStartRequestDto,
    userId?: string,
  ): Promise<DailyOperationStartResponseDto> {
    const waitForCompletion = Boolean(dto.options && (dto.options as any).waitForCompletion);

    if (dto.idempotencyKey) {
      const existing = await this.loadIdempotency(workspaceId, dto.idempotencyKey);
      if (existing) {
        const replay = await this.replayIdempotentTask(
          workspaceId,
          existing.taskId,
          waitForCompletion,
        );
        if (replay) {
          return replay;
        }
        await this.prisma.workflowIdempotency.deleteMany({
          where: {
            workspaceId,
            scope: DAILY_DIAGNOSIS_IDEMPOTENCY_SCOPE,
            idempotencyKey: dto.idempotencyKey,
            taskId: existing.taskId,
          },
        });
      }
    }

    const taskId = `task-diag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const workflowRunId = `run-${Date.now()}`;

    if (dto.idempotencyKey) {
      const claimed = await this.claimIdempotency(workspaceId, dto.idempotencyKey, taskId);
      if (!claimed) {
        const winner = await this.loadIdempotency(workspaceId, dto.idempotencyKey);
        if (winner) {
          const replay = await this.replayIdempotentTask(
            workspaceId,
            winner.taskId,
            waitForCompletion,
          );
          if (replay) {
            return replay;
          }
          return this.toStartResponse(winner.taskId, winner.taskId, 'RUNNING');
        }
      }
    }

    const input: DailyOperationWorkflowInput = {
      taskId,
      workflowRunId,
      workspaceId,
      marketplaceId: dto.marketplaceId || 'AMAZON_US',
      mode: dto.mode || 'WORKSPACE',
      skuId: dto.skuId,
      skuIds: dto.skuIds,
      dateRange: dto.dateRange || {
        from: new Date(Date.now() - 7 * 86400000).toISOString(),
        to: new Date().toISOString(),
      },
      baselinePeriod: dto.baselinePeriod,
      workflowVersion: dto.options?.workflowVersion || 'WF05_V1',
    };

    // Execute workflow in background (or await if requested)
    const service = await this.getServiceForWorkspace(workspaceId);
    const runPromise = service.execute(input).catch((err) => {
      console.error(`[DailyDiagnosisService] Error executing workflow task ${taskId}:`, err);
    });

    if (dto.options && (dto.options as any).waitForCompletion) {
      await runPromise;
    }

    return {
      taskId,
      workflowRunId,
      status: 'RUNNING',
      streamUrl: `/operations/daily-diagnosis/${taskId}/events`,
      statusUrl: `/operations/daily-diagnosis/${taskId}`,
    };
  }

  /**
   * Retrieves compact task summary (<4KB) with optional selective expansion.
   * Enforces strict workspace isolation.
   */
  async getTaskSummary(
    taskId: string,
    workspaceId: string,
    include?: string,
  ): Promise<DailyOperationTaskSummaryDto> {
    const service = await this.getServiceForWorkspace(workspaceId);
    const state = await service.getState(taskId);
    if (!state) {
      throw new WorkflowNotFoundError(taskId);
    }
    if (state.workspaceId !== workspaceId) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'You do not have access to this workflow task',
      });
    }

    const includeList = include ? include.split(',').map((s) => s.trim().toLowerCase()) : [];

    const evaluatedSkusCount = Object.keys(state.contexts || {}).length;
    const affectedSkusCount = new Set(state.signals.map((s) => s.skuId)).size;

    const p1Count = state.recommendedActions.filter((a) => a.priority === 'P1').length;
    const p2Count = state.recommendedActions.filter((a) => a.priority === 'P2').length;
    const p3Count = state.recommendedActions.filter((a) => a.priority === 'P3').length;
    const advisoryCount = state.recommendedActions.filter((a) => a.executionMode === 'ADVISORY').length;

    const taskSummary: DailyOperationTaskSummaryDto = {
      taskId: state.taskId,
      workflowVersion: state.workflowVersion,
      status: state.status,
      currentStep: state.currentStep,
      healthStatus: state.summary?.healthStatus || 'HEALTHY',
      skuSummary: {
        total: state.skuIds?.length || 0,
        evaluated: evaluatedSkusCount,
        failed: state.errors?.length || 0,
        affected: affectedSkusCount,
      },
      signalSummary: {
        criticalCount: state.signals.filter((s) => s.severity === 'CRITICAL').length,
        warningCount: state.signals.filter((s) => s.severity === 'WARNING').length,
        totalCount: state.signals.length,
      },
      diagnosisSummary: {
        totalCount: state.diagnoses.length,
      },
      actionSummary: {
        p1Count,
        p2Count,
        p3Count,
        totalCount: state.recommendedActions.length,
        advisoryCount,
        approvalRequiredCount: state.recommendedActions.length - advisoryCount,
      },
      approvalSummary: {
        pendingCount: state.approvalState?.pendingActionIds?.length || 0,
        approvedCount: state.approvalState?.approvedActionIds?.length || 0,
        rejectedCount: state.approvalState?.rejectedActionIds?.length || 0,
        dismissedCount: state.approvalState?.dismissedActionIds?.length || 0,
      },
      topRisks: state.summary?.topRisks || [],
      topActions: state.recommendedActions.slice(0, 5),
      warnings: (state.warnings || []).map((w: any) => (typeof w === 'string' ? w : w.message || String(w))),
      errors: (state.errors || []).map((e: any) => (typeof e === 'string' ? e : e.message || String(e))),
      checkpointVersion: state.checkpointVersion,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt,
    };

    if (includeList.includes('actions')) {
      taskSummary.actions = state.recommendedActions;
    }
    if (includeList.includes('signals')) {
      taskSummary.signals = state.signals;
    }
    if (includeList.includes('diagnoses')) {
      taskSummary.diagnoses = state.diagnoses;
    }
    if (includeList.includes('steptraces')) {
      taskSummary.stepTraces = state.stepTraces;
    }
    if (includeList.includes('contexts')) {
      taskSummary.contexts = state.contexts;
    }

    return SensitiveDataGuard.scrub(taskSummary);
  }

  /**
   * Approves an action with OCC guard. Zero external execution.
   */
  async approveAction(
    taskId: string,
    actionId: string,
    workspaceId: string,
    memberRole?: string,
    dto?: DailyOperationActionDecisionDto,
  ): Promise<DailyOperationActionDecisionResponseDto> {
    if (memberRole === 'VIEWER') {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Viewer role cannot approve workflow actions',
      });
    }

    const state = await this.workflowService.getState(taskId);
    if (!state) {
      throw new WorkflowNotFoundError(taskId);
    }
    if (state.workspaceId !== workspaceId) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'You do not have access to this workflow task',
      });
    }

    const service = await this.getServiceForWorkspace(workspaceId);
    const updatedState = await service.approveAction(
      taskId,
      actionId,
      dto?.decidedBy || 'HUMAN_OPERATOR',
      dto?.note,
      { expectedVersion: dto?.expectedVersion },
    );

    return SensitiveDataGuard.scrub({
      taskId,
      actionId,
      decision: 'APPROVED',
      status: updatedState.status,
      checkpointVersion: updatedState.checkpointVersion,
      approvalSummary: {
        pendingCount: updatedState.approvalState.pendingActionIds.length,
        approvedCount: updatedState.approvalState.approvedActionIds.length,
        rejectedCount: updatedState.approvalState.rejectedActionIds.length,
        dismissedCount: updatedState.approvalState.dismissedActionIds.length,
      },
    });
  }

  /**
   * Rejects an action with OCC guard. Zero external execution.
   */
  async rejectAction(
    taskId: string,
    actionId: string,
    workspaceId: string,
    memberRole?: string,
    dto?: DailyOperationActionDecisionDto,
  ): Promise<DailyOperationActionDecisionResponseDto> {
    if (memberRole === 'VIEWER') {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Viewer role cannot reject workflow actions',
      });
    }

    const service = await this.getServiceForWorkspace(workspaceId);
    const state = await service.getState(taskId);
    if (!state) {
      throw new WorkflowNotFoundError(taskId);
    }
    if (state.workspaceId !== workspaceId) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'You do not have access to this workflow task',
      });
    }

    const updatedState = await service.rejectAction(
      taskId,
      actionId,
      dto?.decidedBy || 'HUMAN_OPERATOR',
      dto?.note,
      { expectedVersion: dto?.expectedVersion },
    );

    return SensitiveDataGuard.scrub({
      taskId,
      actionId,
      decision: 'REJECTED',
      status: updatedState.status,
      checkpointVersion: updatedState.checkpointVersion,
      approvalSummary: {
        pendingCount: updatedState.approvalState.pendingActionIds.length,
        approvedCount: updatedState.approvalState.approvedActionIds.length,
        rejectedCount: updatedState.approvalState.rejectedActionIds.length,
        dismissedCount: updatedState.approvalState.dismissedActionIds.length,
      },
    });
  }

  /**
   * Dismisses an action with OCC guard. Zero external execution.
   */
  async dismissAction(
    taskId: string,
    actionId: string,
    workspaceId: string,
    memberRole?: string,
    dto?: DailyOperationActionDecisionDto,
  ): Promise<DailyOperationActionDecisionResponseDto> {
    if (memberRole === 'VIEWER') {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Viewer role cannot dismiss workflow actions',
      });
    }

    const service = await this.getServiceForWorkspace(workspaceId);
    const state = await service.getState(taskId);
    if (!state) {
      throw new WorkflowNotFoundError(taskId);
    }
    if (state.workspaceId !== workspaceId) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'You do not have access to this workflow task',
      });
    }

    const updatedState = await service.dismissAction(
      taskId,
      actionId,
      dto?.decidedBy || 'HUMAN_OPERATOR',
      dto?.note,
      { expectedVersion: dto?.expectedVersion },
    );

    return SensitiveDataGuard.scrub({
      taskId,
      actionId,
      decision: 'DISMISSED',
      status: updatedState.status,
      checkpointVersion: updatedState.checkpointVersion,
      approvalSummary: {
        pendingCount: updatedState.approvalState.pendingActionIds.length,
        approvedCount: updatedState.approvalState.approvedActionIds.length,
        rejectedCount: updatedState.approvalState.rejectedActionIds.length,
        dismissedCount: updatedState.approvalState.dismissedActionIds.length,
      },
    });
  }

  /**
   * Resumes workflow after HITL approvals.
   */
  async resumeWorkflow(
    taskId: string,
    workspaceId: string,
    memberRole?: string,
    options?: { expectedVersion?: number },
  ): Promise<DailyOperationResumeResponseDto> {
    if (memberRole === 'VIEWER') {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Viewer role cannot resume workflow',
      });
    }

    const service = await this.getServiceForWorkspace(workspaceId);
    const state = await service.getState(taskId);
    if (!state) {
      throw new WorkflowNotFoundError(taskId);
    }
    if (state.workspaceId !== workspaceId) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'You do not have access to this workflow task',
      });
    }

    const result = await service.resume(taskId, options);

    return SensitiveDataGuard.scrub({
      taskId: result.taskId,
      status: result.status,
      healthStatus: result.healthStatus,
      checkpointVersion: result.checkpointVersion || state.checkpointVersion,
      completedAt: result.completedAt,
    });
  }

  /**
   * Subscribes to live workflow events for a specific task.
   */
  subscribeTaskEvents(
    taskId: string,
    listener: (event: DailyOperationWorkflowEvent) => void,
  ): () => void {
    const filterListener = (event: DailyOperationWorkflowEvent) => {
      if (event.taskId === taskId) {
        listener(event);
      }
    };
    return this.workflowService.getEventEmitter().subscribe(filterListener);
  }

  /**
   * Gets past events for a specific task from history.
   */
  getPastTaskEvents(taskId: string): DailyOperationWorkflowEvent[] {
    return this.workflowService
      .getEventEmitter()
      .getHistory()
      .filter((e) => e.taskId === taskId);
  }

  private toStartResponse(
    taskId: string,
    workflowRunId: string,
    status: DailyOperationStartResponseDto['status'],
  ): DailyOperationStartResponseDto {
    return {
      taskId,
      workflowRunId,
      status,
      streamUrl: `/operations/daily-diagnosis/${taskId}/events`,
      statusUrl: `/operations/daily-diagnosis/${taskId}`,
    };
  }

  private loadIdempotency(workspaceId: string, idempotencyKey: string) {
    return this.prisma.workflowIdempotency.findUnique({
      where: {
        workspaceId_scope_idempotencyKey: {
          workspaceId,
          scope: DAILY_DIAGNOSIS_IDEMPOTENCY_SCOPE,
          idempotencyKey,
        },
      },
    });
  }

  private async claimIdempotency(
    workspaceId: string,
    idempotencyKey: string,
    taskId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.workflowIdempotency.create({
        data: {
          workspaceId,
          scope: DAILY_DIAGNOSIS_IDEMPOTENCY_SCOPE,
          idempotencyKey,
          taskId,
        },
      });
      return true;
    } catch (err) {
      if (isPrismaUniqueConflict(err)) {
        return false;
      }
      throw err;
    }
  }

  private async replayIdempotentTask(
    workspaceId: string,
    taskId: string,
    waitForCompletion: boolean,
  ): Promise<DailyOperationStartResponseDto | null> {
    const deadline = Date.now() + (waitForCompletion ? 15000 : 800);
    let state = await this.checkpointStore.get(taskId);
    while ((!state || state.workspaceId !== workspaceId) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      state = await this.checkpointStore.get(taskId);
    }
    if (!state || state.workspaceId !== workspaceId) {
      const task = await this.prisma.agentTask.findUnique({
        where: { id: taskId },
      });
      if (task && task.workspaceId === workspaceId) {
        return this.toStartResponse(
          taskId,
          taskId,
          (task.status as DailyOperationStartResponseDto['status']) || 'RUNNING',
        );
      }
      return null;
    }
    if (waitForCompletion) {
      while (state.status === 'RUNNING' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const next = await this.checkpointStore.get(taskId);
        if (next) {
          state = next;
        }
      }
    }
    return this.toStartResponse(state.taskId, state.workflowRunId, state.status as any);
  }
}
