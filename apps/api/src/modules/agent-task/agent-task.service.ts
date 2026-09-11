import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
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
  constructor(private readonly prisma: PrismaService) {}

  async listTasks(workspaceId?: string) {
    const where = workspaceId ? { workspaceId } : {};
    const tasks = await this.prisma.agentTask.findMany({
      where,
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

  async getTaskTrace(taskId: string) {
    const task = await this.prisma.agentTask.findUnique({
      where: { id: taskId },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
          include: {
            toolExecutions: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!task) throw new NotFoundException(`Task ${taskId} not found`);

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
   * SSE Stream simulating real-time agent trajectory execution
   */
  streamTaskExecution(taskType = 'VARIANCE_ATTRIBUTION'): Observable<MessageEvent> {
    return new Observable((observer) => {
      const steps = [
        {
          type: 'TASK_START',
          payload: { taskType, message: 'Agent initialized. Loading context for SKU MTH-GREEN-001...' },
          delay: 200,
        },
        {
          type: 'STEP_START',
          stepNumber: 1,
          payload: { name: 'Reconcile Profit Ledgers', stepType: 'TOOL_EXECUTION' },
          delay: 500,
        },
        {
          type: 'TOOL_CALL',
          toolName: 'query_profit_summary',
          payload: { params: { periodA: 'Week 10', periodB: 'Week 11' } },
          delay: 800,
        },
        {
          type: 'TOOL_RESULT',
          toolName: 'query_profit_summary',
          payload: { latencyMs: 145, result: { week10: 4120, week11: 1840, delta: -2280 } },
          delay: 1200,
        },
        {
          type: 'STEP_START',
          stepNumber: 2,
          payload: { name: 'Audit Advertising Spend & Search Terms', stepType: 'TOOL_EXECUTION' },
          delay: 1500,
        },
        {
          type: 'TOOL_CALL',
          toolName: 'query_ad_metrics',
          payload: { params: { highAcosThreshold: 0.5 } },
          delay: 1800,
        },
        {
          type: 'TOOL_RESULT',
          toolName: 'query_ad_metrics',
          payload: { latencyMs: 180, result: { keyword: 'bathroom organizer', spend: 420, acos: 0.933 } },
          delay: 2200,
        },
        {
          type: 'EVIDENCE',
          payload: { rule: 'EXACT_WATERFALL_CLOSURE', formula: '-2280 = -980 - 620 - 510 - 310 + 140' },
          delay: 2600,
        },
        {
          type: 'TASK_COMPLETE',
          payload: { status: 'COMPLETED', variance: -2280, recommendationsCount: 3 },
          delay: 3000,
        },
      ];

      const timeouts: NodeJS.Timeout[] = [];

      for (const item of steps) {
        const timeout = setTimeout(() => {
          observer.next({
            data: JSON.stringify({
              type: item.type,
              timestamp: new Date().toISOString(),
              stepNumber: item.stepNumber,
              toolName: item.toolName,
              ...item.payload,
            }),
          } as MessageEvent);

          if (item.type === 'TASK_COMPLETE') {
            observer.complete();
          }
        }, item.delay);

        timeouts.push(timeout);
      }

      return () => {
        timeouts.forEach(clearTimeout);
      };
    });
  }
}
