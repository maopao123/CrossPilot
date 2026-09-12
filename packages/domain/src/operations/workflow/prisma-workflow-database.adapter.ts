/**
 * Prisma Workflow Database Adapter (Epic 3 Phase 6.2)
 *
 * Provides production-grade PostgreSQL persistence for WF-05 Daily Operation Workflow
 * via Prisma ORM (AgentTask, AgentStep, Approval).
 *
 * Implements:
 * 1. Atomic Database-Level Optimistic Concurrency Control (OCC)
 *    (WHERE id = ? AND checkpoint_version = ?)
 * 2. Transactional State & Approval Consistency (prisma.$transaction)
 * 3. Step Trace & Audit Log Synchronization
 * 4. Resilient cross-instance state retrieval & error mapping
 */

import { WorkflowStepTrace } from '@crosspilot/shared';
import {
  IWorkflowDatabaseAdapter,
  CheckpointVersionConflictError,
} from './workflow.types.js';

export interface PrismaAgentTaskRecord {
  id: string;
  workspaceId: string;
  userId?: string | null;
  taskType: string;
  status: string;
  activeSkuId?: string | null;
  checkpointVersion: number;
  checkpointedAt?: Date | null;
  workflowVersion?: string | null;
  currentStep?: string | null;
  inputJson: string;
  resultJson?: string | null;
  startedAt?: Date;
  completedAt?: Date | null;
}

export interface PrismaClientLike {
  agentTask: {
    findUnique(args: { where: { id: string }; select?: any }): Promise<any>;
    count(args: { where: { id: string } }): Promise<number>;
    updateMany(args: { where: { id: string; checkpointVersion?: number }; data: any }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: any }): Promise<any>;
    create(args: { data: any }): Promise<any>;
    delete(args: { where: { id: string } }): Promise<any>;
  };
  agentStep?: {
    findMany(args: { where: { taskId: string } }): Promise<any[]>;
    create(args: { data: any }): Promise<any>;
    update(args: { where: { id: string }; data: any }): Promise<any>;
    deleteMany(args: { where: { taskId: string } }): Promise<any>;
  };
  approval?: {
    findMany(args: { where: { taskId?: string } }): Promise<any[]>;
    create(args: { data: any }): Promise<any>;
    update(args: { where: { id: string }; data: any }): Promise<any>;
    deleteMany(args: { where: { taskId?: string } }): Promise<any>;
  };
  $transaction?<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T>;
}

export class PrismaWorkflowDatabaseAdapter implements IWorkflowDatabaseAdapter {
  constructor(private readonly prisma: PrismaClientLike) {}

  public async saveTask(
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
  ): Promise<void> {
    if (typeof this.prisma.$transaction === 'function') {
      await this.prisma.$transaction(async (tx) => {
        await this.executeSaveTask(tx, data, options);
      });
    } else {
      await this.executeSaveTask(this.prisma, data, options);
    }
  }

  private async executeSaveTask(
    tx: PrismaClientLike,
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
  ): Promise<void> {
    const taskId = data.taskId;
    const checkpointedAtDate = data.checkpointedAt ? new Date(data.checkpointedAt) : new Date();

    // 1. Optimistic Concurrency Control (OCC) Task Upsert / Update
    if (options?.expectedVersion !== undefined) {
      // Atomic conditional update where id = ? and checkpoint_version = ?
      const updateResult = await tx.agentTask.updateMany({
        where: {
          id: taskId,
          checkpointVersion: options.expectedVersion,
        },
        data: {
          workspaceId: data.workspaceId,
          taskType: data.taskType,
          status: data.status,
          activeSkuId: data.activeSkuId ?? null,
          inputJson: data.inputJson,
          resultJson: data.resultJson,
          checkpointVersion: data.checkpointVersion,
          checkpointedAt: checkpointedAtDate,
          workflowVersion: data.workflowVersion ?? 'WF05_V1',
          currentStep: data.currentStep ?? null,
          userId: data.userId ?? null,
        },
      });

      if (updateResult.count === 0) {
        // Find existing to determine conflict or absence
        const existing = await tx.agentTask.findUnique({
          where: { id: taskId },
          select: { checkpointVersion: true },
        });

        if (existing) {
          throw new CheckpointVersionConflictError(
            taskId,
            options.expectedVersion,
            existing.checkpointVersion
          );
        } else {
          // Task does not exist yet. Only initial version 0 or 1 is allowed
          if (options.expectedVersion !== 0 && options.expectedVersion !== 1) {
            throw new CheckpointVersionConflictError(taskId, options.expectedVersion, 0);
          }

          await tx.agentTask.create({
            data: {
              id: taskId,
              workspaceId: data.workspaceId,
              taskType: data.taskType,
              status: data.status,
              activeSkuId: data.activeSkuId ?? null,
              inputJson: data.inputJson,
              resultJson: data.resultJson,
              checkpointVersion: data.checkpointVersion,
              checkpointedAt: checkpointedAtDate,
              workflowVersion: data.workflowVersion ?? 'WF05_V1',
              currentStep: data.currentStep ?? null,
              userId: data.userId ?? null,
            },
          });
        }
      }
    } else {
      // Unconditional save (upsert pattern)
      const existing = await tx.agentTask.findUnique({
        where: { id: taskId },
        select: { id: true, checkpointVersion: true },
      });

      if (existing) {
        await tx.agentTask.update({
          where: { id: taskId },
          data: {
            workspaceId: data.workspaceId,
            taskType: data.taskType,
            status: data.status,
            activeSkuId: data.activeSkuId ?? null,
            inputJson: data.inputJson,
            resultJson: data.resultJson,
            checkpointVersion: data.checkpointVersion,
            checkpointedAt: checkpointedAtDate,
            workflowVersion: data.workflowVersion ?? 'WF05_V1',
            currentStep: data.currentStep ?? null,
            userId: data.userId ?? null,
          },
        });
      } else {
        await tx.agentTask.create({
          data: {
            id: taskId,
            workspaceId: data.workspaceId,
            taskType: data.taskType,
            status: data.status,
            activeSkuId: data.activeSkuId ?? null,
            inputJson: data.inputJson,
            resultJson: data.resultJson,
            checkpointVersion: data.checkpointVersion,
            checkpointedAt: checkpointedAtDate,
            workflowVersion: data.workflowVersion ?? 'WF05_V1',
            currentStep: data.currentStep ?? null,
            userId: data.userId ?? null,
          },
        });
      }
    }

    // 2. Transactional Approval Record Synchronization
    if (tx.approval && data.approvals && data.approvals.length > 0) {
      const existingApprovals = await tx.approval.findMany({
        where: { taskId },
      });
      const existingMap = new Map<string, any>(
        existingApprovals.map((a: any) => [a.targetId, a])
      );

      for (const app of data.approvals) {
        const mappedStatus =
          app.status === 'PROPOSED'
            ? 'PENDING'
            : app.status;

        const existingApp = existingMap.get(app.actionId);
        if (existingApp) {
          await tx.approval.update({
            where: { id: existingApp.id },
            data: {
              status: mappedStatus,
              actionType: app.actionType ?? 'WF05_ACTION',
              requestedPayload: app.requestedPayload,
              approvedBy: app.decidedBy ?? existingApp.approvedBy,
              comment: app.note ?? existingApp.comment,
              resolvedAt: app.decidedBy ? new Date() : existingApp.resolvedAt,
            },
          });
        } else {
          await tx.approval.create({
            data: {
              workspaceId: data.workspaceId,
              taskId,
              targetId: app.actionId,
              targetType: 'ACTION_RECOMMENDATION',
              actionType: app.actionType ?? 'WF05_ACTION',
              requestedPayload: app.requestedPayload,
              status: mappedStatus,
              requestedBy: 'DAILY_OPERATION_WF05',
              approvedBy: app.decidedBy ?? null,
              comment: app.note ?? null,
              resolvedAt: app.decidedBy ? new Date() : null,
            },
          });
        }
      }
    }

    // 3. Step Trace Audit Log Synchronization
    if (tx.agentStep && data.stepTraces && data.stepTraces.length > 0) {
      const existingSteps = await tx.agentStep.findMany({
        where: { taskId },
      });
      const existingStepMap = new Map<string, any>(
        existingSteps.map((s: any) => [s.name, s])
      );

      for (let i = 0; i < data.stepTraces.length; i++) {
        const trace = data.stepTraces[i];
        const existingStep = existingStepMap.get(trace.step);

        if (existingStep) {
          await tx.agentStep.update({
            where: { id: existingStep.id },
            data: {
              stepNumber: i + 1,
              status: trace.status,
              outputSummary: trace.outputSummary ?? null,
              completedAt: trace.completedAt ? new Date(trace.completedAt) : null,
            },
          });
        } else {
          await tx.agentStep.create({
            data: {
              taskId,
              stepNumber: i + 1,
              stepType: 'DAG_STEP',
              name: trace.step,
              status: trace.status,
              outputSummary: trace.outputSummary ?? null,
              startedAt: trace.startedAt ? new Date(trace.startedAt) : new Date(),
              completedAt: trace.completedAt ? new Date(trace.completedAt) : null,
            },
          });
        }
      }
    }
  }

  public async getTask(taskId: string): Promise<{
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
  } | null> {
    const task = await this.prisma.agentTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return null;
    }

    return {
      taskId: task.id,
      workspaceId: task.workspaceId,
      status: task.status,
      inputJson: task.inputJson,
      resultJson: task.resultJson ?? '{}',
      checkpointVersion: task.checkpointVersion ?? 1,
      workflowVersion: task.workflowVersion,
      currentStep: task.currentStep,
      checkpointedAt: task.checkpointedAt,
      userId: task.userId,
    };
  }

  public async deleteTask(taskId: string): Promise<void> {
    try {
      if (typeof this.prisma.$transaction === 'function') {
        await this.prisma.$transaction(async (tx) => {
          if (tx.approval) {
            await tx.approval.deleteMany({ where: { taskId } });
          }
          if (tx.agentStep) {
            await tx.agentStep.deleteMany({ where: { taskId } });
          }
          await tx.agentTask.delete({ where: { id: taskId } });
        });
      } else {
        if (this.prisma.approval) {
          await this.prisma.approval.deleteMany({ where: { taskId } });
        }
        if (this.prisma.agentStep) {
          await this.prisma.agentStep.deleteMany({ where: { taskId } });
        }
        await this.prisma.agentTask.delete({ where: { id: taskId } });
      }
    } catch (err: any) {
      if (err.code !== 'P2025') {
        throw err;
      }
    }
  }

  public async hasTask(taskId: string): Promise<boolean> {
    const count = await this.prisma.agentTask.count({
      where: { id: taskId },
    });
    return count > 0;
  }
}
