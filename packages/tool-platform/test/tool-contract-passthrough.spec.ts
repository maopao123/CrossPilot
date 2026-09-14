import {
  createDefaultToolRegistry,
  ToolExecutor,
  ToolRegistry,
  ToolExecutionResult,
  ToolErrorEnvelope,
  BiVarianceAttributeTool,
} from '../src/index.js';
import { EvidenceMeta } from '@crosspilot/shared';

describe('Batch C: Tool Contract Incremental Extension & Runtime Pass-through', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = createDefaultToolRegistry();
    executor = new ToolExecutor(registry);
  });

  describe('Producer: BiVarianceAttributeTool', () => {
    it('populates evidenceMeta conforming to EvidenceMeta contract on successful execution', async () => {
      const result: ToolExecutionResult = await executor.execute(
        'bi.variance.attribute',
        {
          previousProfit: 5000,
          currentProfit: 3200,
          advertisingImpact: -800,
          returnsImpact: -400,
          inventoryImpact: -300,
          priceImpact: -200,
          otherImpact: -100,
        },
        { workspaceId: 'ws_batch_c_test', source: 'TOOL_CENTER' },
      );

      expect(result.success).toBe(true);
      expect(result.traceId).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.data).toBeDefined();
      expect(result.data.totalVariance).toBe(-1800);

      // Verify evidenceMeta is present and valid
      expect(result.evidenceMeta).toBeDefined();
      expect(Array.isArray(result.evidenceMeta)).toBe(true);
      expect(result.evidenceMeta!.length).toBeGreaterThanOrEqual(1);

      const meta: EvidenceMeta = result.evidenceMeta![0];
      expect(meta.evidenceId).toMatch(/^evi_bi_variance_/);
      expect(meta.sourceType).toBe('DERIVED');
      expect(meta.sourceRef).toBe('VarianceAttributionService.attributeVariance');
      expect(meta.observedAt).toBeNull();
      expect(meta.capturedAt).toBeDefined();
      expect(meta.valueStatus).toBe('DERIVED');
      expect(meta.freshness).toBe('UNKNOWN');
      expect(meta.confidence).toBe(1.0);
    });

    it('populates errorEnvelope matching error on invalid numeric input', async () => {
      const result: ToolExecutionResult = await executor.execute(
        'bi.variance.attribute',
        {
          previousProfit: NaN,
          currentProfit: 3000,
        },
        { workspaceId: 'ws_batch_c_test' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('INVALID_PROFIT_INPUT');
      expect(result.errorEnvelope).toBeDefined();

      const envelope: ToolErrorEnvelope = result.errorEnvelope!;
      expect(envelope.code).toBe(result.error!.code);
      expect(envelope.category).toBe('VALIDATION');
      expect(envelope.message).toContain('finite numbers');
      expect(envelope.why).toBeDefined();
      expect(envelope.retryable).toBe(false);
      expect(envelope.suggestedFix).toEqual({
        previousProfit: 'number',
        currentProfit: 'number',
      });
    });

    it('populates errorEnvelope on schema validation failure', async () => {
      const result: ToolExecutionResult = await executor.execute(
        'bi.variance.attribute',
        {
          // missing previousProfit and currentProfit
        },
        { workspaceId: 'ws_batch_c_test' },
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.errorEnvelope).toBeDefined();
      expect(result.errorEnvelope!.code).toBe('VALIDATION_ERROR');
      expect(result.errorEnvelope!.category).toBe('VALIDATION');
      expect(result.errorEnvelope!.retryable).toBe(false);
    });

    it('populates errorEnvelope on tool not found', async () => {
      const result: ToolExecutionResult = await executor.execute(
        'unknown.tool.id',
        {},
        { workspaceId: 'ws_batch_c_test' },
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
      expect(result.errorEnvelope).toBeDefined();
      expect(result.errorEnvelope!.code).toBe('TOOL_NOT_FOUND');
      expect(result.errorEnvelope!.category).toBe('UNSUPPORTED');
      expect(result.errorEnvelope!.retryable).toBe(false);
    });
  });

  describe('Consumer: Downstream compatibility with legacy results', () => {
    it('consumer safely reads legacy tool response without evidenceMeta or errorEnvelope', () => {
      // Construct a legacy response (simulating an older tool or cached response)
      const legacyResult: ToolExecutionResult = {
        success: true,
        data: { netProfit: 123.45 },
        traceId: 'trace_legacy_001',
        durationMs: 42,
        cost: { amount: 0, unit: 'USD' },
      };

      // Consumer helper function
      function consumeToolResult(res: ToolExecutionResult) {
        return {
          ok: res.success,
          trace: res.traceId,
          duration: res.durationMs,
          hasEvidence: Array.isArray(res.evidenceMeta) && res.evidenceMeta.length > 0,
          evidenceCount: res.evidenceMeta?.length ?? 0,
          errorCategory: res.errorEnvelope?.category ?? null,
        };
      }

      const consumed = consumeToolResult(legacyResult);
      expect(consumed.ok).toBe(true);
      expect(consumed.trace).toBe('trace_legacy_001');
      expect(consumed.hasEvidence).toBe(false);
      expect(consumed.evidenceCount).toBe(0);
      expect(consumed.errorCategory).toBeNull();
    });

    it('consumer safely reads new format with evidenceMeta without data loss', () => {
      const modernResult: ToolExecutionResult = {
        success: true,
        data: { deltaProfit: -500 },
        traceId: 'trace_modern_001',
        durationMs: 15,
        evidenceMeta: [
          {
            evidenceId: 'evi_001',
            sourceType: 'DERIVED',
            valueStatus: 'KNOWN',
            freshness: 'FRESH',
            confidence: 0.95,
          },
        ],
      };

      function consumeToolResult(res: ToolExecutionResult) {
        return {
          ok: res.success,
          trace: res.traceId,
          evidenceMeta: res.evidenceMeta,
        };
      }

      const consumed = consumeToolResult(modernResult);
      expect(consumed.ok).toBe(true);
      expect(consumed.evidenceMeta).toHaveLength(1);
      expect(consumed.evidenceMeta![0].evidenceId).toBe('evi_001');
      expect(consumed.evidenceMeta![0].confidence).toBe(0.95);
    });
  });
});
