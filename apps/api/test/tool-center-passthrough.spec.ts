import { ToolCenterService, RecordedToolRun } from '../src/modules/tool-center/tool-center.service.js';
import { ToolExecutionResult, ToolErrorEnvelope } from '@crosspilot/tool-platform';
import { EvidenceMeta } from '@crosspilot/shared';

describe('Batch C: ToolCenterService Runtime Pass-Through & Consumer Verification', () => {
  let service: ToolCenterService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'usr_test_001' }),
      },
      agentTask: {
        create: jest.fn().mockResolvedValue({ id: 'task_mock_001' }),
      },
      toolExecution: {
        create: jest.fn().mockResolvedValue({ id: 'exec_mock_001' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ToolCenterService(mockPrisma);
  });

  it('consumer (ToolCenterService) losslessly passes through evidenceMeta from real producer (bi.variance.attribute)', async () => {
    const result: ToolExecutionResult = await service.executeTool(
      'bi.variance.attribute',
      {
        previousProfit: 6000,
        currentProfit: 4500,
        advertisingImpact: -1000,
        returnsImpact: -300,
        inventoryImpact: -200,
      },
      'ws_test_consumer',
      'usr_test_001',
      'TOOL_CENTER',
    );

    // 1. Return value preserves success and business data
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.totalVariance).toBe(-1500);

    // 2. Return value losslessly preserves evidenceMeta
    expect(result.evidenceMeta).toBeDefined();
    expect(Array.isArray(result.evidenceMeta)).toBe(true);
    expect(result.evidenceMeta!.length).toBeGreaterThan(0);

    const meta: EvidenceMeta = result.evidenceMeta![0];
    expect(meta.evidenceId).toMatch(/^evi_bi_variance_/);
    expect(meta.sourceType).toBe('DERIVED');
    expect(meta.valueStatus).toBe('DERIVED');
    expect(meta.freshness).toBe('UNKNOWN');
    expect(meta.confidence).toBe(1.0);

    // 3. In-memory execution record also retains evidenceMeta
    const executions = await service.listExecutions(10, 'ws_test_consumer');
    expect(executions.length).toBeGreaterThan(0);
    const recorded = executions[0];
    expect(recorded.evidenceMeta).toBeDefined();
    expect(recorded.evidenceMeta![0].evidenceId).toBe(meta.evidenceId);
  });

  it('consumer (ToolCenterService) losslessly passes through errorEnvelope on execution error', async () => {
    const result: ToolExecutionResult = await service.executeTool(
      'bi.variance.attribute',
      {
        previousProfit: NaN,
        currentProfit: 4500,
      },
      'ws_test_consumer',
      'usr_test_001',
      'TOOL_CENTER',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('INVALID_PROFIT_INPUT');

    // Verify errorEnvelope pass-through
    expect(result.errorEnvelope).toBeDefined();
    const envelope: ToolErrorEnvelope = result.errorEnvelope!;
    expect(envelope.code).toBe('INVALID_PROFIT_INPUT');
    expect(envelope.category).toBe('VALIDATION');
    expect(envelope.retryable).toBe(false);
    expect(envelope.message).toContain('finite numbers');

    // Verify recorded execution contains errorEnvelope
    const executions = await service.listExecutions(10, 'ws_test_consumer');
    const recorded = executions.find((e) => e.status === 'FAILED');
    expect(recorded).toBeDefined();
    expect(recorded!.errorEnvelope).toBeDefined();
    expect(recorded!.errorEnvelope!.code).toBe('INVALID_PROFIT_INPUT');
  });

  it('consumer (ToolCenterService) backward-compatibility: gracefully handles responses lacking evidenceMeta/errorEnvelope', async () => {
    // Construct a legacy tool run in service's recentExecutions buffer
    const legacyRecord: RecordedToolRun = {
      id: 'run_legacy_001',
      toolId: 'legacy.tool',
      toolName: 'Legacy Tool',
      category: 'DATA',
      input: { foo: 'bar' },
      output: { success: true },
      status: 'SUCCESS',
      durationMs: 50,
      traceId: 'trace_legacy_001',
      source: 'TOOL_CENTER',
      createdAt: new Date().toISOString(),
      workspaceId: 'ws_legacy_test',
      // evidenceMeta and errorEnvelope intentionally undefined
    };

    (service as any).recentExecutions.unshift(legacyRecord);

    const executions = await service.listExecutions(10, 'ws_legacy_test');
    expect(executions).toHaveLength(1);
    expect(executions[0].id).toBe('run_legacy_001');
    expect(executions[0].evidenceMeta).toBeUndefined();
    expect(executions[0].errorEnvelope).toBeUndefined();
    expect(executions[0].status).toBe('SUCCESS');
  });
});
