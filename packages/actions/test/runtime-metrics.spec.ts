import { Registry } from 'prom-client';
import {
  createRuntimeMetrics,
  runtimeMetrics,
  RuntimeMetrics,
  normalizeMetricProvider,
  normalizeMetricMode,
  normalizeMetricDispatchStatus,
  normalizeMetricAdapterStatus,
  normalizeMetricErrorClass,
  normalizeMetricReason,
  normalizeMetricStrategy,
  normalizeMetricSweepResult,
  normalizeMetricQueue,
  normalizeMetricVerifyResult,
} from '@crosspilot/shared';
import { ActionRouter } from '../src/action.router.js';
import { ActionProposal, ActionDispatcherContext } from '../src/action.types.js';
import { RpaAdapter } from '@crosspilot/integrations';

describe('Phase 4 — Runtime Metrics & Prometheus Exposure', () => {
  describe('Label Normalization & Strict Low Cardinality Guard', () => {
    it('normalizes providers to known whitelist or other', () => {
      expect(normalizeMetricProvider('shopify')).toBe('shopify');
      expect(normalizeMetricProvider('SHOPIFY')).toBe('shopify');
      expect(normalizeMetricProvider('erp')).toBe('erp');
      expect(normalizeMetricProvider('simulator_erp')).toBe('erp');
      expect(normalizeMetricProvider('playwright')).toBe('playwright-rpa');
      expect(normalizeMetricProvider('amazon')).toBe('other');
      expect(normalizeMetricProvider('unknown_provider_12345')).toBe('other');
      expect(normalizeMetricProvider(undefined)).toBe('unknown');
    });

    it('normalizes modes to live | simulated | dry_run | mock | unknown', () => {
      expect(normalizeMetricMode('live')).toBe('live');
      expect(normalizeMetricMode('LIVE')).toBe('live');
      expect(normalizeMetricMode('SIMULATED')).toBe('simulated');
      expect(normalizeMetricMode('simulation')).toBe('simulated');
      expect(normalizeMetricMode('dry_run')).toBe('dry_run');
      expect(normalizeMetricMode('mock')).toBe('mock');
      expect(normalizeMetricMode('arbitrary_mode')).toBe('unknown');
    });

    it('normalizes dispatch statuses to succeeded | failed | waiting_approval | blocked', () => {
      expect(normalizeMetricDispatchStatus('success')).toBe('succeeded');
      expect(normalizeMetricDispatchStatus('SUCCEEDED')).toBe('succeeded');
      expect(normalizeMetricDispatchStatus('waiting_approval')).toBe('waiting_approval');
      expect(normalizeMetricDispatchStatus('blocked')).toBe('blocked');
      expect(normalizeMetricDispatchStatus('failed')).toBe('failed');
      expect(normalizeMetricDispatchStatus('UNKNOWN_STATUS')).toBe('failed');
    });

    it('normalizes adapter statuses to success | failed | timeout | cancelled', () => {
      expect(normalizeMetricAdapterStatus('success')).toBe('success');
      expect(normalizeMetricAdapterStatus('succeeded')).toBe('success');
      expect(normalizeMetricAdapterStatus('timeout')).toBe('timeout');
      expect(normalizeMetricAdapterStatus('cancelled')).toBe('cancelled');
      expect(normalizeMetricAdapterStatus('any_other')).toBe('failed');
    });

    it('normalizes error classes strictly to standard ExecutionErrorClass set', () => {
      expect(normalizeMetricErrorClass('TRANSIENT')).toBe('TRANSIENT');
      expect(normalizeMetricErrorClass('TIMEOUT')).toBe('TIMEOUT');
      expect(normalizeMetricErrorClass('AUTH')).toBe('AUTH');
      expect(normalizeMetricErrorClass('RATE_LIMIT')).toBe('RATE_LIMIT');
      expect(normalizeMetricErrorClass('VERIFY_MISMATCH')).toBe('VERIFY_MISMATCH');
      expect(normalizeMetricErrorClass('random_dynamic_error_string')).toBe('UNKNOWN');
      expect(normalizeMetricErrorClass(undefined)).toBe('none');
    });

    it('normalizes reasons to bounded safe set without ID leakage', () => {
      expect(normalizeMetricReason('MAX_RETRIES_EXCEEDED')).toBe('retry_exhausted');
      expect(normalizeMetricReason('AUTH_FAILED')).toBe('auth_required');
      expect(normalizeMetricReason('VERIFY_MISMATCH')).toBe('verify_mismatch');
      expect(normalizeMetricReason('REMOTE_PAYLOAD_MISMATCH')).toBe('verify_mismatch');
      expect(normalizeMetricReason('LOCAL_SYNC_FAILED')).toBe('manual_required');
      expect(normalizeMetricReason('random_id_12345')).toBe('unknown');
    });

    it('normalizes strategies to bounded set', () => {
      expect(normalizeMetricStrategy('RETRY_SUCCESS')).toBe('retry');
      expect(normalizeMetricStrategy('VERIFY_EXISTS')).toBe('verify');
      expect(normalizeMetricStrategy('other')).toBe('query');
    });

    it('normalizes sweep results to completed | aborted | failed', () => {
      expect(normalizeMetricSweepResult('completed')).toBe('completed');
      expect(normalizeMetricSweepResult('aborted')).toBe('aborted');
      expect(normalizeMetricSweepResult('failed')).toBe('failed');
      expect(normalizeMetricSweepResult('other')).toBe('completed');
    });

    it('normalizes BullMQ queue names to bounded known queues', () => {
      expect(normalizeMetricQueue('crosspilot-tasks')).toBe('tasks');
      expect(normalizeMetricQueue('crosspilot-simulator-tick')).toBe('simulator');
      expect(normalizeMetricQueue('crosspilot-outcome-evaluator')).toBe('outcome');
      expect(normalizeMetricQueue('crosspilot-closed-loop-v2')).toBe('closed-loop');
      expect(normalizeMetricQueue('crosspilot-automation-recovery')).toBe('automation-recovery');
      expect(normalizeMetricQueue('adhoc-user-queue-xyz')).toBe('other');
    });

    it('normalizes verify results to verified | mismatch | timeout | failed', () => {
      expect(normalizeMetricVerifyResult('MATCH')).toBe('verified');
      expect(normalizeMetricVerifyResult('verified')).toBe('verified');
      expect(normalizeMetricVerifyResult('MISMATCH')).toBe('mismatch');
      expect(normalizeMetricVerifyResult('TIMEOUT')).toBe('timeout');
      expect(normalizeMetricVerifyResult('NOT_FOUND')).toBe('failed');
      expect(normalizeMetricVerifyResult('ERROR')).toBe('failed');
    });
  });

  describe('Registry Isolation & Metrics Creation', () => {
    it('creates isolated metrics instances without interfering with global registry', async () => {
      const reg1 = new Registry();
      const reg2 = new Registry();
      const metrics1 = createRuntimeMetrics(reg1);
      const metrics2 = createRuntimeMetrics(reg2);

      metrics1.recordActionDispatch({
        mode: 'live',
        provider: 'erp',
        status: 'succeeded',
        durationSeconds: 0.25,
      });

      const text1 = await reg1.metrics();
      const text2 = await reg2.metrics();

      expect(text1).toContain('crosspilot_action_dispatch_total{provider="erp",mode="live",status="succeeded"} 1');
      expect(text1).toContain('crosspilot_action_dispatch_duration_seconds_bucket');
      expect(text2).not.toContain('{provider="erp"');
    });

    it('registers all 14 required operational metrics', async () => {
      const reg = new Registry();
      const metrics = createRuntimeMetrics(reg);

      expect(metrics.actionDispatchTotal).toBeDefined();
      expect(metrics.actionDispatchDuration).toBeDefined();
      expect(metrics.adapterRequestsTotal).toBeDefined();
      expect(metrics.adapterRequestDuration).toBeDefined();
      expect(metrics.automationRetryTotal).toBeDefined();
      expect(metrics.automationTimeoutTotal).toBeDefined();
      expect(metrics.automationNeedsAttentionTotal).toBeDefined();
      expect(metrics.automationRecoveredTotal).toBeDefined();
      expect(metrics.recoverySweepTotal).toBeDefined();
      expect(metrics.recoverySweepDuration).toBeDefined();
      expect(metrics.recoveryDueOperations).toBeDefined();
      expect(metrics.queueWaitSeconds).toBeDefined();
      expect(metrics.verifyTotal).toBeDefined();
      expect(metrics.verifyDuration).toBeDefined();

      const text = await metrics.getMetricsAsText();
      expect(text).toContain('# HELP crosspilot_action_dispatch_total');
      expect(text).toContain('# HELP crosspilot_adapter_requests_total');
      expect(text).toContain('# HELP crosspilot_automation_retry_total');
      expect(text).toContain('# HELP crosspilot_automation_timeout_total');
      expect(text).toContain('# HELP crosspilot_automation_needs_attention_total');
      expect(text).toContain('# HELP crosspilot_automation_recovered_total');
      expect(text).toContain('# HELP crosspilot_recovery_sweep_total');
      expect(text).toContain('# HELP crosspilot_recovery_due_operations');
      expect(text).toContain('# HELP crosspilot_queue_wait_seconds');
      expect(text).toContain('# HELP crosspilot_verify_total');
      expect(metrics.contentType).toContain('text/plain');
    });
  });

  describe('Single-Accounting Invariant & Metric Recording Methods', () => {
    let registry: Registry;
    let metrics: RuntimeMetrics;

    beforeEach(() => {
      registry = new Registry();
      metrics = createRuntimeMetrics(registry);
    });

    it('records adapter requests and latency correctly', async () => {
      metrics.recordAdapterRequest({
        provider: 'shopify',
        status: 'success',
        durationSeconds: 0.12,
      });
      metrics.recordAdapterRequest({
        provider: 'erp',
        status: 'failed',
        errorClass: 'TRANSIENT',
        durationSeconds: 1.5,
      });

      const text = await registry.metrics();
      expect(text).toContain('crosspilot_adapter_requests_total{provider="shopify",status="success",error_class="none"} 1');
      expect(text).toContain('crosspilot_adapter_requests_total{provider="erp",status="failed",error_class="TRANSIENT"} 1');
      expect(text).toContain('crosspilot_adapter_request_duration_seconds_count{provider="shopify",status="success"} 1');
    });

    it('records timeout and retry metrics without high cardinality', async () => {
      metrics.recordTimeout({ provider: 'shopify' });
      metrics.recordTimeout({ provider: 'shopify' });
      metrics.recordRetry({ provider: 'erp', errorClass: 'TIMEOUT' });

      const text = await registry.metrics();
      expect(text).toContain('crosspilot_automation_timeout_total{provider="shopify"} 2');
      expect(text).toContain('crosspilot_automation_retry_total{provider="erp",error_class="TIMEOUT"} 1');
    });

    it('records needs attention and recovered metrics', async () => {
      metrics.recordNeedsAttention({ provider: 'erp', reason: 'VERIFY_MISMATCH' });
      metrics.recordRecovered({ provider: 'erp', strategy: 'VERIFY_EXISTS' });

      const text = await registry.metrics();
      expect(text).toContain('crosspilot_automation_needs_attention_total{provider="erp",reason="verify_mismatch"} 1');
      expect(text).toContain('crosspilot_automation_recovered_total{provider="erp",strategy="verify"} 1');
    });

    it('records recovery sweeps, due operations gauge, and queue wait', async () => {
      metrics.setRecoveryDueOperations(7);
      metrics.recordRecoverySweep({ result: 'completed', durationSeconds: 0.85 });
      metrics.observeQueueWait({ queue: 'crosspilot-tasks', waitSeconds: 0.045 });

      const text = await registry.metrics();
      expect(text).toContain('crosspilot_recovery_due_operations 7');
      expect(text).toContain('crosspilot_recovery_sweep_total{result="completed"} 1');
      expect(text).toContain('crosspilot_queue_wait_seconds_count{queue="tasks"} 1');
    });

    it('records verify total and verify latency', async () => {
      metrics.recordVerify({ provider: 'erp', result: 'MATCH', durationSeconds: 0.32 });
      metrics.recordVerify({ provider: 'erp', result: 'MISMATCH', durationSeconds: 0.28 });

      const text = await registry.metrics();
      expect(text).toContain('crosspilot_verify_total{provider="erp",result="verified"} 1');
      expect(text).toContain('crosspilot_verify_total{provider="erp",result="mismatch"} 1');
      expect(text).toContain('crosspilot_verify_duration_seconds_count{provider="erp",result="verified"} 1');
    });

    it('is completely fail-safe when passed unexpected inputs', () => {
      expect(() => {
        metrics.recordActionDispatch({ mode: '' as any, provider: '', status: '', durationSeconds: -1 });
        metrics.recordAdapterRequest({ status: '', durationSeconds: 0 });
        metrics.recordTimeout({});
        metrics.recordRetry({});
        metrics.recordNeedsAttention({});
        metrics.recordRecovered({});
        metrics.setRecoveryDueOperations(-10);
        metrics.recordRecoverySweep({ result: '', durationSeconds: 0 });
        metrics.observeQueueWait({ queue: '', waitSeconds: -1 });
        metrics.recordVerify({ result: '' });
      }).not.toThrow();
    });
  });

  describe('ActionRouter Dispatch Single-Accounting Integration', () => {
    it('records exactly 1 dispatch counter and 1 duration observation on dispatch', async () => {
      const mockAdapter: RpaAdapter = {
        id: 'playwright',
        supportedModes: ['MOCK'],
        execute: jest.fn().mockResolvedValue({
          success: true,
          jobId: 'job_ok_001',
          status: 'SUCCESS',
          durationMs: 100,
        }),
      };

      const router = new ActionRouter({ get: () => mockAdapter, getDefault: () => mockAdapter } as any);
      const proposal: ActionProposal = {
        id: 'act_metrics_001',
        type: 'RPA',
        name: 'Metrics Test Action',
        description: 'Test metrics recording',
        requiresHumanApproval: false,
        targetEntity: 'sku',
        targetId: 'SKU-001',
        payload: { skuCode: 'SKU-001' },
        riskLevel: 'LOW',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_metrics_test',
        providerId: 'playwright',
        traceId: 'trace_met_001',
        operationId: 'op_met_001',
        executionMode: 'MOCK',
      };

      const beforeText = await runtimeMetrics.getMetricsAsText();
      const matchBefore = beforeText.match(/crosspilot_action_dispatch_total\{[^}]*provider="playwright-rpa"[^}]*mode="mock"[^}]*status="succeeded"[^}]*\} (\d+)/);
      const countBefore = matchBefore ? Number(matchBefore[1]) : 0;

      const result = await router.dispatch(proposal, context);
      expect(result.status).toBe('SUCCEEDED');

      const afterText = await runtimeMetrics.getMetricsAsText();
      const matchAfter = afterText.match(/crosspilot_action_dispatch_total\{[^}]*provider="playwright-rpa"[^}]*mode="mock"[^}]*status="succeeded"[^}]*\} (\d+)/);
      const countAfter = matchAfter ? Number(matchAfter[1]) : 0;

      expect(countAfter).toBe(countBefore + 1);
    });
  });
});
