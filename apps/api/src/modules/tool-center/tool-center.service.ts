import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  createDefaultToolRegistry,
  ToolCategory,
  ToolExecutor,
  ToolRegistry,
  ToolExecutionResult,
  ToolErrorEnvelope,
} from '@crosspilot/tool-platform';
import { EvidenceMeta } from '@crosspilot/shared';

export interface RecordedToolRun {
  id: string;
  toolId: string;
  toolName: string;
  category: string;
  input: any;
  output: any;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  cost?: { amount: number; unit: string };
  traceId: string;
  source: string;
  createdAt: string;
  workspaceId?: string;
  evidenceMeta?: EvidenceMeta[];
  errorEnvelope?: ToolErrorEnvelope;
}

@Injectable()
export class ToolCenterService {
  private readonly registry: ToolRegistry;
  private readonly executor: ToolExecutor;
  private readonly recentExecutions: RecordedToolRun[] = [];

  constructor(private readonly prisma: PrismaService) {
    this.registry = createDefaultToolRegistry();
    this.executor = new ToolExecutor(this.registry);
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }

  getExecutor(): ToolExecutor {
    return this.executor;
  }

  listTools(category?: string) {
    if (category && category !== 'ALL') {
      return this.registry.getByCategory(category as ToolCategory).map(({ execute, ...meta }) => meta);
    }
    return this.registry.listMetadata();
  }

  getTool(id: string) {
    const tool = this.registry.get(id);
    if (!tool) {
      throw new NotFoundException(`Tool '${id}' not found in registry`);
    }
    const { execute, ...meta } = tool;
    return meta;
  }

  async executeTool(
    id: string,
    input: any,
    workspaceId: string,
    userId?: string,
    source: 'TOOL_CENTER' | 'AGENT' | 'WORKFLOW' = 'TOOL_CENTER',
  ): Promise<ToolExecutionResult> {
    const tool = this.registry.get(id);
    if (!tool) {
      throw new NotFoundException(`Tool '${id}' not found in registry`);
    }

    const result = await this.executor.execute(
      id,
      input,
      {
        workspaceId,
        userId,
        source,
      },
    );

    // Record in-memory buffer
    const record: RecordedToolRun = {
      id: `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      toolId: tool.id,
      toolName: tool.name,
      category: tool.category,
      input,
      output: result.data || result.error,
      status: result.success ? 'SUCCESS' : 'FAILED',
      durationMs: result.durationMs,
      cost: result.cost,
      traceId: result.traceId,
      source,
      createdAt: new Date().toISOString(),
      workspaceId,
      evidenceMeta: result.evidenceMeta,
      errorEnvelope: result.errorEnvelope,
    };
    this.recentExecutions.unshift(record);
    if (this.recentExecutions.length > 50) {
      this.recentExecutions.pop();
    }

    // Attempt DB persistence with accurate task linkage
    try {
      let taskId = (input as any)?.taskId;
      if (!taskId) {
        let taskUserId = userId;
        if (!taskUserId) {
          const member = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId },
          });
          taskUserId = member?.userId || 'usr_default_001';
        }

        const standaloneTask = await this.prisma.agentTask.create({
          data: {
            workspace: { connect: { id: workspaceId } },
            user: { connect: { id: taskUserId } },
            taskType: 'TOOL_EXECUTION',
            status: result.success ? 'COMPLETED' : 'FAILED',
            inputJson: JSON.stringify(input),
            resultJson: JSON.stringify(result.data || result.error || {}),
            completedAt: new Date(),
          },
        });
        taskId = standaloneTask.id;
      }

      await this.prisma.toolExecution.create({
        data: {
          taskId,
          toolName: tool.id,
          inputJson: JSON.stringify(input),
          outputJson: JSON.stringify(result.data || result.error || {}),
          status: result.success ? 'SUCCESS' : 'FAILED',
          latencyMs: result.durationMs,
          errorMessage: result.error?.message,
        },
      });
    } catch {
      // Gracefully continue in memory if DB table unavailable
    }

    return result;
  }

  async listExecutions(limit = 20, workspaceId?: string): Promise<RecordedToolRun[]> {
    if (!workspaceId) {
      return [];
    }
    try {
      const dbExecutions = await this.prisma.toolExecution.findMany({
        where: { task: { workspaceId } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      if (dbExecutions.length > 0) {
        return dbExecutions.map((e) => {
          const toolDef = this.registry.get(e.toolName);
          return {
            id: e.id,
            toolId: e.toolName,
            toolName: toolDef?.name || e.toolName,
            category: toolDef?.category || 'DATA',
            input: JSON.parse(e.inputJson || '{}'),
            output: JSON.parse(e.outputJson || '{}'),
            status: e.status as 'SUCCESS' | 'FAILED',
            durationMs: e.latencyMs,
            traceId: `trace_${e.id}`,
            source: 'TOOL_CENTER',
            createdAt: e.createdAt.toISOString(),
            workspaceId,
          };
        });
      }
    } catch {
      return this.recentExecutions
        .filter((e) => e.workspaceId === workspaceId)
        .slice(0, limit);
    }

    return this.recentExecutions
      .filter((e) => e.workspaceId === workspaceId)
      .slice(0, limit);
  }
}
