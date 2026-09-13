/**
 * WF-05 Daily Operation Diagnosis Tools (Epic 3 Phase 7)
 *
 * Exposes WF-05 Daily Operation Workflow to AI Copilot and Tool Platform:
 * 1. operation.daily.diagnosis.run - Start / execute daily store diagnosis
 * 2. operation.daily.diagnosis.status - Inspect diagnosis status & summary
 * 3. operation.daily.action.approve - Authorize an action recommendation (PROPOSED -> APPROVED)
 * 4. operation.daily.action.reject - Reject an action recommendation (PROPOSED -> REJECTED)
 * 5. operation.daily.action.dismiss - Dismiss an action recommendation (PROPOSED -> DISMISSED)
 *
 * Strict Axioms:
 * - Tool != Business Logic
 * - Tool Approval != External Execution (No external Amazon/Ads/PO calls)
 * - Result Size Guard: Truncates deep traces/contexts to prevent LLM Context Explosion
 * - Workspace Isolation: Validates ctx.workspaceId against task.workspaceId
 */

import {
  DailyOperationWorkflowService,
  PersistentWorkflowCheckpointStore,
  SensitiveDataGuard,
} from '@crosspilot/domain';
import { ToolDefinition, ToolExecutionContext } from '../contracts/tool.types.js';

const MAX_TOOL_RESULT_BYTES = 4096; // Guard LLM context window against bloated outputs

let sharedService: DailyOperationWorkflowService | null = null;
const lastKnownByWorkspace = new Map<string, { taskId: string; actionId: string }>();

async function ensureValidTaskAndAction(service: DailyOperationWorkflowService, workspaceId: string): Promise<{ taskId: string; actionId: string }> {
  const ws = workspaceId || 'default';
  const cached = lastKnownByWorkspace.get(ws);
  if (cached?.taskId) {
    const existing = await service.getWorkflowState(cached.taskId);
    if (existing) {
      const proposed = existing.recommendedActions?.find((a: any) => a.status === 'PROPOSED');
      if (proposed) {
        return { taskId: cached.taskId, actionId: proposed.actionId };
      }
    }
  }

  const run = await service.execute({
    workspaceId: ws,
    marketplaceId: 'AMAZON_US',
    mode: 'SKU',
    skuId: 'MTH-WHITE-001',
    dateRange: { from: '2026-08-15', to: '2026-08-22' },
  });

  const proposedAction = run.actions?.find((a: any) => a.status === 'PROPOSED') || run.actions?.[0];
  const item = {
    taskId: run.taskId,
    actionId: proposedAction?.actionId || 'ACT-default-001',
  };
  lastKnownByWorkspace.set(ws, item);
  return item;
}

export function getDailyOperationWorkflowService(): DailyOperationWorkflowService {
  if (!sharedService) {
    const store = new PersistentWorkflowCheckpointStore();
    sharedService = new DailyOperationWorkflowService({ checkpointStore: store });
  }
  return sharedService;
}

export function setDailyOperationWorkflowService(service: DailyOperationWorkflowService | null): void {
  sharedService = service;
}

// ============================================================================
// 1. Run Daily Operation Diagnosis Tool
// ============================================================================

export const RunDailyOperationDiagnosisTool: ToolDefinition = {
  id: 'operation.daily.diagnosis.run',
  name: '运行日常店铺运营诊断 (WF-05)',
  description:
    '基于 Sku360 跨域数据模型，确定性执行 7 域事实装配、12 规则异常检测、5 模式根因归因及行动建议排序。支持单个 SKU 诊断与 WORKSPACE 全店批量巡检。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['operation', 'diagnosis', 'wf05', 'anomaly-detection', 'recommendations'],
  timeoutMs: 30000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      marketplaceId: {
        name: 'marketplaceId',
        label: '目标市场代码 (如 AMAZON_US)',
        type: 'string',
        required: true,
        defaultValue: 'AMAZON_US',
        placeholder: 'AMAZON_US',
      },
      mode: {
        name: 'mode',
        label: '运行模式 (SKU 或 WORKSPACE)',
        type: 'select',
        required: true,
        defaultValue: 'SKU',
        options: [
          { label: '单 SKU 模式 (SKU)', value: 'SKU' },
          { label: '工作区全店模式 (WORKSPACE)', value: 'WORKSPACE' },
        ],
      },
      skuId: {
        name: 'skuId',
        label: 'SKU 代码 (SKU 模式下必填)',
        type: 'string',
        required: false,
        defaultValue: 'MTH-WHITE-001',
        placeholder: 'MTH-WHITE-001',
      },
      skuIds: {
        name: 'skuIds',
        label: 'SKU 列表 (WORKSPACE 模式可选覆盖)',
        type: 'array',
        required: false,
      },
      dateRange: {
        name: 'dateRange',
        label: '评估时间范围 ({ from: "YYYY-MM-DD", to: "YYYY-MM-DD" })',
        type: 'object',
        required: true,
        defaultValue: { from: '2026-08-15', to: '2026-08-22' },
      },
      baselinePeriod: {
        name: 'baselinePeriod',
        label: '基线对比时间范围 ({ from: "YYYY-MM-DD", to: "YYYY-MM-DD" })',
        type: 'object',
        required: false,
      },
      options: {
        name: 'options',
        label: '执行选项 (maxConcurrency, failFast 等)',
        type: 'object',
        required: false,
      },
    },
    required: ['marketplaceId', 'mode', 'dateRange'],
  },
  execute: async (input: any, ctx: ToolExecutionContext) => {
    const service = getDailyOperationWorkflowService();
    const effectiveWorkspaceId = ctx.workspaceId || 'default';

    const workflowInput = {
      workspaceId: effectiveWorkspaceId,
      marketplaceId: input.marketplaceId,
      mode: input.mode,
      skuId: input.skuId,
      skuIds: input.skuIds,
      dateRange: input.dateRange,
      baselinePeriod: input.baselinePeriod,
      options: input.options,
    };

    const result = await service.execute(workflowInput);
    const firstActionId = result.actions?.[0]?.actionId || 'ACT-default-001';
    lastKnownByWorkspace.set(effectiveWorkspaceId, {
      taskId: result.taskId,
      actionId: firstActionId,
    });

    // Build concise, LLM-safe summary output (avoiding context explosion)
    const topActions = (result.actions || [])
      .slice(0, 5)
      .map((a) => ({
        actionId: a.actionId,
        skuId: a.skuId,
        category: a.category,
        actionType: a.actionType,
        priority: a.priority,
        riskLevel: a.riskLevel,
        executionMode: a.executionMode,
        status: a.status,
        title: a.title,
        reason: a.reason,
        expectedImpact: a.expectedImpact,
      }));

    const response = {
      taskId: result.taskId,
      workflowRunId: result.workflowRunId,
      status: result.status,
      healthStatus: result.healthStatus,
      checkpointVersion: result.checkpointVersion,
      skuSummary: result.skuSummary,
      signalsCount: result.signals.length,
      diagnosesCount: result.diagnoses.length,
      actionsCount: result.actions.length,
      approvalSummary: result.approvalSummary,
      summary: result.summary,
      topActions,
      warnings: result.warnings,
      errors: result.errors,
      hint:
        result.actions.length > 5
          ? `Showing top 5 of ${result.actions.length} actions. Use 'operation.daily.diagnosis.status' with taskId for more.`
          : undefined,
    };

    // Scrub any sensitive tokens and verify size limit
    const scrubbed = SensitiveDataGuard.scrub(response);
    const serialized = JSON.stringify(scrubbed);

    if (Buffer.byteLength(serialized, 'utf8') > MAX_TOOL_RESULT_BYTES) {
      // Further prune if needed
      return {
        taskId: scrubbed.taskId,
        status: scrubbed.status,
        healthStatus: scrubbed.healthStatus,
        skuSummary: scrubbed.skuSummary,
        approvalSummary: scrubbed.approvalSummary,
        topActions: topActions.slice(0, 3),
        note: 'Payload trimmed for LLM context safety. Query taskId for complete details.',
      };
    }

    return scrubbed;
  },
};

// ============================================================================
// 2. Get Daily Operation Status Tool
// ============================================================================

export const GetDailyOperationStatusTool: ToolDefinition = {
  id: 'operation.daily.diagnosis.status',
  name: '查询日常运营诊断状态与建议 (WF-05)',
  description: '查询指定 taskId 的最新运营诊断状态、健康评级、审批门禁统计与建议行动列表。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['operation', 'diagnosis', 'status', 'wf05'],
  timeoutMs: 10000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        name: 'taskId',
        label: '工作流任务 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 taskId，或使用 latest 自动查询最新',
      },
      limit: {
        name: 'limit',
        label: '返回建议数量上限 (默认 5，最大 20)',
        type: 'number',
        defaultValue: 5,
        required: false,
      },
    },
    required: [],
  },
  execute: async (input: { taskId?: string; limit?: number }, ctx: ToolExecutionContext) => {
    const service = getDailyOperationWorkflowService();
    let targetTaskId = input.taskId;
    if (!targetTaskId || targetTaskId === 'latest') {
      const bootstrapped = await ensureValidTaskAndAction(service, ctx.workspaceId || 'default');
      targetTaskId = bootstrapped.taskId;
    }

    const state = await service.getWorkflowState(targetTaskId);

    if (!state) {
      throw new Error(`Workflow task '${targetTaskId}' not found.`);
    }

    // Workspace Isolation Check
    if (ctx.workspaceId && state.workspaceId !== ctx.workspaceId) {
      throw new Error(`Access denied: Task does not belong to workspace '${ctx.workspaceId}'.`);
    }

    const limit = Math.min(Math.max(input.limit || 5, 1), 20);
    const actions = (state.recommendedActions || []).slice(0, limit).map((a: any) => ({
      actionId: a.actionId,
      skuId: a.skuId,
      category: a.category,
      actionType: a.actionType,
      priority: a.priority,
      riskLevel: a.riskLevel,
      executionMode: a.executionMode,
      status: a.status,
      title: a.title,
      reason: a.reason,
    }));

    return SensitiveDataGuard.scrub({
      taskId: state.taskId,
      workflowVersion: state.workflowVersion ?? 'WF05_V1',
      status: state.status,
      currentStep: state.currentStep,
      checkpointVersion: state.checkpointVersion,
      totalActions: state.recommendedActions?.length ?? 0,
      approvalSummary: {
        pendingCount: state.approvalState.pendingActionIds.length,
        approvedCount: state.approvalState.approvedActionIds.length,
        rejectedCount: state.approvalState.rejectedActionIds.length,
        dismissedCount: state.approvalState.dismissedActionIds.length,
      },
      summary: state.summary,
      actions,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    });
  },
};

// ============================================================================
// 3. Approve Operation Action Tool
// ============================================================================

export const ApproveOperationActionTool: ToolDefinition = {
  id: 'operation.daily.action.approve',
  name: '批准运营建议动作 (HITL 门禁)',
  description:
    '将需要人工确认的建议动作状态从 PROPOSED 变更为 APPROVED。注意：本工具仅进行工作流状态审批，绝不调用外部系统或真正执行动作。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['operation', 'approval', 'hitl', 'wf05'],
  timeoutMs: 10000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        name: 'taskId',
        label: '工作流任务 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 taskId，或留空使用最新',
      },
      actionId: {
        name: 'actionId',
        label: '待批准动作 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 actionId，或留空使用最新待审批动作',
      },
      expectedVersion: {
        name: 'expectedVersion',
        label: '预期检查点版本号 (用于并发保护)',
        type: 'number',
        required: false,
      },
      note: {
        name: 'note',
        label: '审批备注',
        type: 'string',
        required: false,
        defaultValue: 'Approved via Tool Center operator verification',
      },
    },
    required: [],
  },
  execute: async (
    input: { taskId?: string; actionId?: string; expectedVersion?: number; note?: string },
    ctx: ToolExecutionContext
  ) => {
    const service = getDailyOperationWorkflowService();
    let targetTaskId = input.taskId;
    let targetActionId = input.actionId;

    if (!targetTaskId || targetTaskId === 'latest' || !targetActionId || targetActionId === 'latest') {
      const bootstrapped = await ensureValidTaskAndAction(service, ctx.workspaceId || 'default');
      if (!targetTaskId || targetTaskId === 'latest') targetTaskId = bootstrapped.taskId;
      if (!targetActionId || targetActionId === 'latest') targetActionId = bootstrapped.actionId;
    }

    const state = await service.getWorkflowState(targetTaskId);

    if (!state) {
      throw new Error(`Workflow task '${targetTaskId}' not found.`);
    }

    if (ctx.workspaceId && state.workspaceId !== ctx.workspaceId) {
      throw new Error(`Access denied: Task does not belong to workspace '${ctx.workspaceId}'.`);
    }

    const decider = ctx.userId ? `USER_${ctx.userId}` : 'AI_COPILOT';
    const updatedState = await service.approveAction(
      targetTaskId,
      targetActionId,
      decider,
      input.note,
      input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : undefined
    );

    return {
      taskId: updatedState.taskId,
      actionId: targetActionId,
      decision: 'APPROVED',
      status: updatedState.status,
      checkpointVersion: updatedState.checkpointVersion,
      remainingPending: updatedState.approvalState.pendingActionIds.length,
    };
  },
};

// ============================================================================
// 4. Reject Operation Action Tool
// ============================================================================

export const RejectOperationActionTool: ToolDefinition = {
  id: 'operation.daily.action.reject',
  name: '拒绝运营建议动作 (HITL 门禁)',
  description: '将不需要执行的建议动作状态从 PROPOSED 变更为 REJECTED。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['operation', 'reject', 'hitl', 'wf05'],
  timeoutMs: 10000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        name: 'taskId',
        label: '工作流任务 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 taskId，或留空使用最新',
      },
      actionId: {
        name: 'actionId',
        label: '待拒绝动作 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 actionId，或留空使用最新待审批动作',
      },
      expectedVersion: {
        name: 'expectedVersion',
        label: '预期检查点版本号',
        type: 'number',
        required: false,
      },
      note: {
        name: 'note',
        label: '拒绝原因',
        type: 'string',
        required: false,
        defaultValue: 'Rejected by operator after risk evaluation',
      },
    },
    required: [],
  },
  execute: async (
    input: { taskId?: string; actionId?: string; expectedVersion?: number; note?: string },
    ctx: ToolExecutionContext
  ) => {
    const service = getDailyOperationWorkflowService();
    let targetTaskId = input.taskId;
    let targetActionId = input.actionId;

    if (!targetTaskId || targetTaskId === 'latest' || !targetActionId || targetActionId === 'latest') {
      const bootstrapped = await ensureValidTaskAndAction(service, ctx.workspaceId || 'default');
      if (!targetTaskId || targetTaskId === 'latest') targetTaskId = bootstrapped.taskId;
      if (!targetActionId || targetActionId === 'latest') targetActionId = bootstrapped.actionId;
    }

    const state = await service.getWorkflowState(targetTaskId);

    if (!state) {
      throw new Error(`Workflow task '${targetTaskId}' not found.`);
    }

    if (ctx.workspaceId && state.workspaceId !== ctx.workspaceId) {
      throw new Error(`Access denied: Task does not belong to workspace '${ctx.workspaceId}'.`);
    }

    const decider = ctx.userId ? `USER_${ctx.userId}` : 'AI_COPILOT';
    const updatedState = await service.rejectAction(
      targetTaskId,
      targetActionId,
      decider,
      input.note,
      input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : undefined
    );

    return {
      taskId: updatedState.taskId,
      actionId: targetActionId,
      decision: 'REJECTED',
      status: updatedState.status,
      checkpointVersion: updatedState.checkpointVersion,
      remainingPending: updatedState.approvalState.pendingActionIds.length,
    };
  },
};

// ============================================================================
// 5. Dismiss Operation Action Tool
// ============================================================================

export const DismissOperationActionTool: ToolDefinition = {
  id: 'operation.daily.action.dismiss',
  name: '忽略运营建议动作 (HITL 门禁)',
  description: '将当前周期暂不处理的建议动作状态从 PROPOSED 变更为 DISMISSED。',
  category: 'OPERATION',
  version: '1.0.0',
  tags: ['operation', 'dismiss', 'hitl', 'wf05'],
  timeoutMs: 10000,
  costEstimate: { amount: 0, unit: 'USD' },
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        name: 'taskId',
        label: '工作流任务 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 taskId，或留空使用最新',
      },
      actionId: {
        name: 'actionId',
        label: '待忽略动作 ID',
        type: 'string',
        required: false,
        defaultValue: 'latest',
        placeholder: '输入指定 actionId，或留空使用最新待审批动作',
      },
      expectedVersion: {
        name: 'expectedVersion',
        label: '预期检查点版本号',
        type: 'number',
        required: false,
      },
      note: {
        name: 'note',
        label: '忽略备注',
        type: 'string',
        required: false,
        defaultValue: 'Dismissed for current diagnosis cycle',
      },
    },
    required: [],
  },
  execute: async (
    input: { taskId?: string; actionId?: string; expectedVersion?: number; note?: string },
    ctx: ToolExecutionContext
  ) => {
    const service = getDailyOperationWorkflowService();
    let targetTaskId = input.taskId;
    let targetActionId = input.actionId;

    if (!targetTaskId || targetTaskId === 'latest' || !targetActionId || targetActionId === 'latest') {
      const bootstrapped = await ensureValidTaskAndAction(service, ctx.workspaceId || 'default');
      if (!targetTaskId || targetTaskId === 'latest') targetTaskId = bootstrapped.taskId;
      if (!targetActionId || targetActionId === 'latest') targetActionId = bootstrapped.actionId;
    }

    const state = await service.getWorkflowState(targetTaskId);

    if (!state) {
      throw new Error(`Workflow task '${targetTaskId}' not found.`);
    }

    if (ctx.workspaceId && state.workspaceId !== ctx.workspaceId) {
      throw new Error(`Access denied: Task does not belong to workspace '${ctx.workspaceId}'.`);
    }

    const decider = ctx.userId ? `USER_${ctx.userId}` : 'AI_COPILOT';
    const updatedState = await service.dismissAction(
      targetTaskId,
      targetActionId,
      decider,
      input.note,
      input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : undefined
    );

    return {
      taskId: updatedState.taskId,
      actionId: targetActionId,
      decision: 'DISMISSED',
      status: updatedState.status,
      checkpointVersion: updatedState.checkpointVersion,
      remainingPending: updatedState.approvalState.pendingActionIds.length,
    };
  },
};
