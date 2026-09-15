import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalystService } from '../analyst/analyst.service.js';
import { AnalystTraceEmitter, AnalystTraceEvent } from '../analyst/analyst-trace.emitter.js';
import { Observable } from 'rxjs';

export interface TraceEvent {
  type: 'TASK_START' | 'STEP_START' | 'TOOL_CALL' | 'TOOL_RESULT' | 'EVIDENCE' | 'TASK_COMPLETE';
  timestamp: string;
  stepNumber?: number;
  toolName?: string;
  payload: any;
}

@Injectable()
export class AgentTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analystService: AnalystService,
    private readonly traceEmitter: AnalystTraceEmitter,
  ) {}

  async listTasks(workspaceId: string) {
    const tasks = await this.prisma.agentTask.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        steps: { include: { toolExecutions: true } },
      },
    });

    return tasks.map((t) => ({
      id: t.id,
      taskType: t.taskType,
      status: t.status,
      activeSkuId: t.activeSkuId,
      input: JSON.parse(t.inputJson || '{}'),
      result: t.resultJson ? JSON.parse(t.resultJson) : null,
      stepsCount: t.steps.length,
      toolsCount: t.steps.reduce((sum, s) => sum + s.toolExecutions.length, 0),
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    }));
  }

  async getTaskTrace(taskId: string, workspaceId: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
          include: {
            toolExecutions: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!task) throw new NotFoundException(`Task ${taskId} not found in workspace`);

    return {
      taskId: task.id,
      taskType: task.taskType,
      status: task.status,
      input: JSON.parse(task.inputJson || '{}'),
      result: task.resultJson ? JSON.parse(task.resultJson) : null,
      steps: task.steps.map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        stepType: s.stepType,
        name: s.name,
        status: s.status,
        inputSummary: s.inputSummary,
        outputSummary: s.outputSummary,
        toolExecutions: s.toolExecutions.map((te) => ({
          id: te.id,
          toolName: te.toolName,
          status: te.status,
          latencyMs: te.latencyMs,
          input: JSON.parse(te.inputJson || '{}'),
          output: JSON.parse(te.outputJson || '{}'),
          errorMessage: te.errorMessage,
        })),
      })),
    };
  }

  /**
   * Real Tool Event Stream: Subscribes to the unified execution events from AnalystTraceEmitter.
   * Eliminates dual-track execution divergence between askAnalyst and SSE.
   */
  streamTaskExecution(
    workspaceId?: string,
    taskType = 'VARIANCE_ATTRIBUTION',
    executionId?: string,
  ): Observable<MessageEvent> {
    return new Observable((observer) => {
      let isCancelled = false;

      (async () => {
        try {
          const wsId = workspaceId || 'crosspilot-demo';
          const workspace = await this.prisma.workspace.findFirst({
            where: {
              OR: [{ id: wsId }, { slug: wsId }],
            },
          });
          const actualWsId = workspace?.id || wsId;

          const emitSSE = (event: AnalystTraceEvent) => {
            if (!isCancelled) {
              observer.next({
                data: JSON.stringify({
                  ...event,
                  timestamp: event.timestamp || new Date().toISOString(),
                }),
              } as MessageEvent);
            }
          };

          // Check if specific executionId was requested or exists
          let targetExecId = executionId;
          if (!targetExecId) {
            targetExecId = this.traceEmitter.getLatestExecutionId(actualWsId);
          }

          // If execution already has history, replay past events
          if (targetExecId) {
            const history = this.traceEmitter.getEvents(targetExecId);
            for (const ev of history) {
              emitSSE(ev);
            }
            const completed = history.some((e) => e.type === 'TASK_COMPLETE');
            if (completed) {
              if (!isCancelled) observer.complete();
              return;
            }
          }

          // Allocate new execution ID if no execution was found
          const isNewExecution = !targetExecId;
          if (!targetExecId) {
            targetExecId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          }

          // Subscribe specifically to targetExecId to isolate concurrent executions
          const subscription = this.traceEmitter
            .subscribeExecution(targetExecId)
            .subscribe({
              next: (event) => {
                emitSSE(event);
                if (event.type === 'TASK_COMPLETE') {
                  if (!isCancelled) observer.complete();
                }
              },
              error: (err) => {
                if (!isCancelled) observer.error(err);
              },
            });

          // If no active execution existed, trigger askAnalyst with the allocated targetExecId
          if (isNewExecution) {
            await this.analystService.askAnalyst(
              'Why did profit drop this week?',
              actualWsId,
              targetExecId,
            );
          }

          return () => {
            isCancelled = true;
            subscription.unsubscribe();
          };
        } catch (err: any) {
          if (!isCancelled) {
            observer.error(err);
          }
        }
      })();

      return () => {
        isCancelled = true;
      };
    });
  }
}
