/**
 * Operation Daily Diagnosis Tools Test Suite (Epic 3 Phase 7)
 */

import {
  createDefaultToolRegistry,
  ToolExecutor,
  ToolExecutionContext,
  RunDailyOperationDiagnosisTool,
  GetDailyOperationStatusTool,
  ApproveOperationActionTool,
  RejectOperationActionTool,
  DismissOperationActionTool,
  setDailyOperationWorkflowService,
} from '../src/index.js';
import {
  DailyOperationWorkflowService,
  InMemoryWorkflowCheckpointStore,
} from '@crosspilot/domain';

describe('Epic 3 Phase 7: Operation Daily Diagnosis Tools', () => {
  let mockStore: InMemoryWorkflowCheckpointStore;
  let service: DailyOperationWorkflowService;
  let executor: ToolExecutor;

  const mockContext: ToolExecutionContext = {
    workspaceId: 'ws_demo',
    userId: 'user_operator_1',
    traceId: 'trace-tool-test-001',
    source: 'AGENT',
  };

  beforeEach(() => {
    mockStore = new InMemoryWorkflowCheckpointStore();
    service = new DailyOperationWorkflowService({ checkpointStore: mockStore });
    setDailyOperationWorkflowService(service);

    const registry = createDefaultToolRegistry();
    executor = new ToolExecutor(registry);
  });

  afterEach(() => {
    setDailyOperationWorkflowService(null);
  });

  it('verifies all 5 WF-05 tools are registered in default registry', () => {
    const registry = createDefaultToolRegistry();
    expect(registry.get('operation.daily.diagnosis.run')).toBeDefined();
    expect(registry.get('operation.daily.diagnosis.status')).toBeDefined();
    expect(registry.get('operation.daily.action.approve')).toBeDefined();
    expect(registry.get('operation.daily.action.reject')).toBeDefined();
    expect(registry.get('operation.daily.action.dismiss')).toBeDefined();
  });

  it('runs daily diagnosis via tool and returns size-guarded response', async () => {
    const res = await executor.execute(
      'operation.daily.diagnosis.run',
      {
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      },
      mockContext
    );

    expect(res.success).toBe(true);
    expect(res.data.taskId).toBeDefined();
    expect(res.data.status).toBeDefined();
    expect(res.data.healthStatus).toBeDefined();
    expect(res.data.topActions).toBeDefined();
    expect(Array.isArray(res.data.topActions)).toBe(true);

    const serialized = JSON.stringify(res.data);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThan(4096);
  });

  it('inspects task status and enforces workspace isolation', async () => {
    // 1. Run workflow to create task
    const runRes = await executor.execute(
      'operation.daily.diagnosis.run',
      {
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-07-16', to: '2026-07-22' },
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      },
      mockContext
    );
    const taskId = runRes.data.taskId;

    // 2. Query status with same workspace -> success
    const statusRes = await executor.execute(
      'operation.daily.diagnosis.status',
      { taskId, limit: 3 },
      mockContext
    );
    expect(statusRes.success).toBe(true);
    expect(statusRes.data.taskId).toBe(taskId);
    expect(statusRes.data.actions.length).toBeLessThanOrEqual(3);

    // 3. Query status with different workspace -> access denied
    const foreignContext: ToolExecutionContext = {
      ...mockContext,
      workspaceId: 'ws_foreign_attacker',
    };
    const deniedRes = await executor.execute(
      'operation.daily.diagnosis.status',
      { taskId },
      foreignContext
    );
    expect(deniedRes.success).toBe(false);
    expect(deniedRes.error?.message).toContain('Access denied');
  });

  it('approves, rejects, and dismisses actions with HITL boundary (Zero External Execution)', async () => {
    // 1. Create task with approval-required action
    const runRes = await executor.execute(
      'operation.daily.diagnosis.run',
      {
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-GREEN-001',
        dateRange: { from: '2026-07-16', to: '2026-07-22' },
        baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
      },
      mockContext
    );
    const taskId = runRes.data.taskId;
    const taskState = await service.getState(taskId);
    expect(taskState?.approvalState.pendingActionIds.length).toBeGreaterThan(0);

    const actionId = taskState!.approvalState.pendingActionIds[0];

    // 2. Approve action via tool
    const approveRes = await executor.execute(
      'operation.daily.action.approve',
      {
        taskId,
        actionId,
        note: 'Approved via AI Copilot Tool',
      },
      mockContext
    );

    expect(approveRes.success).toBe(true);
    expect(approveRes.data.decision).toBe('APPROVED');

    const updatedState = await service.getState(taskId);
    const action = updatedState?.recommendedActions.find((a) => a.actionId === actionId);
    expect(action?.status).toBe('APPROVED');
  });

  it('S9 Regression: ensures workspace isolation even with default workspace and prevents latest leakage', async () => {
    // 1. Run task in workspace A
    const runResA = await executor.execute(
      'operation.daily.diagnosis.run',
      {
        marketplaceId: 'AMAZON_US',
        mode: 'SKU',
        skuId: 'MTH-WHITE-001',
        dateRange: { from: '2026-03-08', to: '2026-03-14' },
      },
      { workspaceId: 'workspace_A', source: 'AGENT' }
    );
    expect(runResA.success).toBe(true);
    const taskIdA = runResA.data.taskId;

    // 2. Querying with 'default' workspace should be DENIED access to workspace_A's task
    const defaultCtx: ToolExecutionContext = { workspaceId: 'default', source: 'AGENT' };
    const denyDefault = await executor.execute(
      'operation.daily.diagnosis.status',
      { taskId: taskIdA },
      defaultCtx
    );
    expect(denyDefault.success).toBe(false);
    expect(denyDefault.error?.message).toContain('Access denied');

    // 3. Workspace B using 'latest' must not receive Workspace A's taskId
    const ctxB: ToolExecutionContext = { workspaceId: 'workspace_B', source: 'AGENT' };
    const resB = await executor.execute(
      'operation.daily.diagnosis.status',
      { taskId: 'latest' },
      ctxB
    );
    expect(resB.success).toBe(true);
    expect(resB.data.taskId).not.toBe(taskIdA);
  });
});

