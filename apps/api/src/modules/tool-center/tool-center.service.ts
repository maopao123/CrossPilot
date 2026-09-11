import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  createDefaultToolRegistry,
  ToolCategory,
  ToolExecutor,
  ToolRegistry,
  ToolExecutionResult,
} from '@crosspilot/tool-platform';

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
    };
    this.recentExecutions.unshift(record);
    if (this.recentExecutions.length > 50) {
      this.recentExecutions.pop();
    }

    // Attempt DB persistence if task exists or in background
    try {
      const task = await this.prisma.agentTask.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });

      if (task) {
        await this.prisma.toolExecution.create({
          data: {
            taskId: task.id,
            toolName: tool.id,
            inputJson: JSON.stringify(input),
            outputJson: JSON.stringify(result.data || result.error || {}),
            status: result.success ? 'SUCCESS' : 'FAILED',
            latencyMs: result.durationMs,
            errorMessage: result.error?.message,
          },
        });
      }
    } catch {
      // Non-fatal if DB not running or task absent
    }

    return result;
  }

  listExecutions(limit = 20): RecordedToolRun[] {
    return this.recentExecutions.slice(0, limit);
  }
}
