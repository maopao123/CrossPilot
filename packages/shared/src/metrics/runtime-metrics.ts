import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import {
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
} from './metric-labels.js';

export const DEFAULT_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120];
export const DEFAULT_SWEEP_BUCKETS = [0.1, 0.5, 1, 2, 5, 10, 30, 60];
export const DEFAULT_QUEUE_WAIT_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30, 60, 300];

export interface RuntimeMetricsOptions {
  registry?: Registry;
  prefix?: string;
  collectDefaultMetrics?: boolean;
}

export interface RecordActionDispatchParams {
  provider?: string;
  mode?: string;
  status: string;
  durationSeconds: number;
}

export interface RecordAdapterRequestParams {
  provider?: string;
  status: string;
  errorClass?: string;
  durationSeconds: number;
}

export interface RecordRetryParams {
  provider?: string;
  errorClass?: string;
}

export interface RecordTimeoutParams {
  provider?: string;
}

export interface RecordNeedsAttentionParams {
  provider?: string;
  reason?: string;
}

export interface RecordRecoveredParams {
  provider?: string;
  strategy?: string;
}

export interface RecordRecoverySweepParams {
  result: string;
  durationSeconds: number;
}

export interface ObserveQueueWaitParams {
  queue: string;
  waitSeconds: number;
}

export interface RecordVerifyParams {
  provider?: string;
  result: string;
  durationSeconds?: number;
}

export class RuntimeMetrics {
  private readonly registry: Registry;
  private readonly prefix: string;

  readonly actionDispatchTotal: Counter<string>;
  readonly actionDispatchDuration: Histogram<string>;

  readonly adapterRequestsTotal: Counter<string>;
  readonly adapterRequestDuration: Histogram<string>;

  readonly automationRetryTotal: Counter<string>;
  readonly automationTimeoutTotal: Counter<string>;
  readonly automationNeedsAttentionTotal: Counter<string>;
  readonly automationRecoveredTotal: Counter<string>;

  readonly recoverySweepTotal: Counter<string>;
  readonly recoverySweepDuration: Histogram<string>;
  readonly recoveryDueOperations: Gauge<string>;

  readonly queueWaitSeconds: Histogram<string>;

  readonly verifyTotal: Counter<string>;
  readonly verifyDuration: Histogram<string>;

  constructor(options: RuntimeMetricsOptions = {}) {
    this.registry = options.registry ?? new Registry();
    this.prefix = options.prefix ?? 'crosspilot_';

    if (options.collectDefaultMetrics) {
      try {
        collectDefaultMetrics({ register: this.registry, prefix: this.prefix });
      } catch {
        // fail-safe ignore
      }
    }

    this.actionDispatchTotal = new Counter({
      name: `${this.prefix}action_dispatch_total`,
      help: 'Total number of action dispatch executions',
      labelNames: ['provider', 'mode', 'status'] as const,
      registers: [this.registry],
    });

    this.actionDispatchDuration = new Histogram({
      name: `${this.prefix}action_dispatch_duration_seconds`,
      help: 'Latency of action dispatch executions in seconds',
      labelNames: ['provider', 'mode', 'status'] as const,
      buckets: DEFAULT_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.adapterRequestsTotal = new Counter({
      name: `${this.prefix}adapter_requests_total`,
      help: 'Total external adapter requests executed',
      labelNames: ['provider', 'status', 'error_class'] as const,
      registers: [this.registry],
    });

    this.adapterRequestDuration = new Histogram({
      name: `${this.prefix}adapter_request_duration_seconds`,
      help: 'Latency of external adapter requests in seconds',
      labelNames: ['provider', 'status'] as const,
      buckets: DEFAULT_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.automationRetryTotal = new Counter({
      name: `${this.prefix}automation_retry_total`,
      help: 'Total automation operation retry attempts scheduled or executed',
      labelNames: ['provider', 'error_class'] as const,
      registers: [this.registry],
    });

    this.automationTimeoutTotal = new Counter({
      name: `${this.prefix}automation_timeout_total`,
      help: 'Total automation operation or adapter timeout occurrences',
      labelNames: ['provider'] as const,
      registers: [this.registry],
    });

    this.automationNeedsAttentionTotal = new Counter({
      name: `${this.prefix}automation_needs_attention_total`,
      help: 'Total automation operations transitioned to NEEDS_ATTENTION',
      labelNames: ['provider', 'reason'] as const,
      registers: [this.registry],
    });

    this.automationRecoveredTotal = new Counter({
      name: `${this.prefix}automation_recovered_total`,
      help: 'Total automation operations successfully recovered and converged to COMPLETED/APPLIED',
      labelNames: ['provider', 'strategy'] as const,
      registers: [this.registry],
    });

    this.recoverySweepTotal = new Counter({
      name: `${this.prefix}recovery_sweep_total`,
      help: 'Total automation recovery sweep runs',
      labelNames: ['result'] as const,
      registers: [this.registry],
    });

    this.recoverySweepDuration = new Histogram({
      name: `${this.prefix}recovery_sweep_duration_seconds`,
      help: 'Duration of automation recovery sweep runs in seconds',
      buckets: DEFAULT_SWEEP_BUCKETS,
      registers: [this.registry],
    });

    this.recoveryDueOperations = new Gauge({
      name: `${this.prefix}recovery_due_operations`,
      help: 'Number of due operations discovered in current recovery sweep',
      registers: [this.registry],
    });

    this.queueWaitSeconds = new Histogram({
      name: `${this.prefix}queue_wait_seconds`,
      help: 'Queue wait time in seconds for BullMQ jobs before processing begins',
      labelNames: ['queue'] as const,
      buckets: DEFAULT_QUEUE_WAIT_BUCKETS,
      registers: [this.registry],
    });

    this.verifyTotal = new Counter({
      name: `${this.prefix}verify_total`,
      help: 'Total read-back or remote state verification attempts',
      labelNames: ['provider', 'result'] as const,
      registers: [this.registry],
    });

    this.verifyDuration = new Histogram({
      name: `${this.prefix}verify_duration_seconds`,
      help: 'Duration of remote state verification in seconds',
      labelNames: ['provider', 'result'] as const,
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });
  }

  recordActionDispatch(params: RecordActionDispatchParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      const mode = normalizeMetricMode(params.mode);
      const status = normalizeMetricDispatchStatus(params.status);
      const duration = Math.max(0, Number(params.durationSeconds) || 0);

      this.actionDispatchTotal.inc({ provider, mode, status }, 1);
      this.actionDispatchDuration.observe({ provider, mode, status }, duration);
    } catch {
      // Fail-safe: metrics failure must never break execution runtime
    }
  }

  recordAdapterRequest(params: RecordAdapterRequestParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      const status = normalizeMetricAdapterStatus(params.status);
      const error_class = normalizeMetricErrorClass(params.errorClass);
      const duration = Math.max(0, Number(params.durationSeconds) || 0);

      this.adapterRequestsTotal.inc({ provider, status, error_class }, 1);
      this.adapterRequestDuration.observe({ provider, status }, duration);
    } catch {
      // Fail-safe
    }
  }

  recordRetry(params: RecordRetryParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      const error_class = normalizeMetricErrorClass(params.errorClass);
      this.automationRetryTotal.inc({ provider, error_class }, 1);
    } catch {
      // Fail-safe
    }
  }

  recordTimeout(params: RecordTimeoutParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      this.automationTimeoutTotal.inc({ provider }, 1);
    } catch {
      // Fail-safe
    }
  }

  recordNeedsAttention(params: RecordNeedsAttentionParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      const reason = normalizeMetricReason(params.reason);
      this.automationNeedsAttentionTotal.inc({ provider, reason }, 1);
    } catch {
      // Fail-safe
    }
  }

  recordRecovered(params: RecordRecoveredParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      const strategy = normalizeMetricStrategy(params.strategy);
      this.automationRecoveredTotal.inc({ provider, strategy }, 1);
    } catch {
      // Fail-safe
    }
  }

  recordRecoverySweep(params: RecordRecoverySweepParams): void {
    try {
      const result = normalizeMetricSweepResult(params.result);
      const duration = Math.max(0, Number(params.durationSeconds) || 0);
      this.recoverySweepTotal.inc({ result }, 1);
      this.recoverySweepDuration.observe(duration);
    } catch {
      // Fail-safe
    }
  }

  setRecoveryDueOperations(count: number): void {
    try {
      this.recoveryDueOperations.set(Math.max(0, Math.floor(Number(count) || 0)));
    } catch {
      // Fail-safe
    }
  }

  observeQueueWait(params: ObserveQueueWaitParams): void {
    try {
      const queue = normalizeMetricQueue(params.queue);
      const wait = Math.max(0, Number(params.waitSeconds) || 0);
      this.queueWaitSeconds.observe({ queue }, wait);
    } catch {
      // Fail-safe
    }
  }

  recordVerify(params: RecordVerifyParams): void {
    try {
      const provider = normalizeMetricProvider(params.provider);
      const result = normalizeMetricVerifyResult(params.result);
      this.verifyTotal.inc({ provider, result }, 1);
      if (params.durationSeconds !== undefined) {
        const duration = Math.max(0, Number(params.durationSeconds) || 0);
        this.verifyDuration.observe({ provider, result }, duration);
      }
    } catch {
      // Fail-safe
    }
  }

  getRegistry(): Registry {
    return this.registry;
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetricsAsText(): Promise<string> {
    return this.registry.metrics();
  }

  reset(): void {
    try {
      this.actionDispatchTotal.reset();
      this.actionDispatchDuration.reset();
      this.adapterRequestsTotal.reset();
      this.adapterRequestDuration.reset();
      this.automationRetryTotal.reset();
      this.automationTimeoutTotal.reset();
      this.automationNeedsAttentionTotal.reset();
      this.automationRecoveredTotal.reset();
      this.recoverySweepTotal.reset();
      this.recoverySweepDuration.reset();
      this.recoveryDueOperations.reset();
      this.queueWaitSeconds.reset();
      this.verifyTotal.reset();
      this.verifyDuration.reset();
    } catch {
      // Fail-safe
    }
  }
}

/**
 * Creates an isolated RuntimeMetrics instance bound to the given registry.
 */
export function createRuntimeMetrics(registry?: Registry): RuntimeMetrics {
  return new RuntimeMetrics({ registry });
}

/**
 * Process-wide singleton RuntimeMetrics instance.
 * Uses an independent isolated Registry so it never pollutes the default global Registry.
 */
export const runtimeMetrics = new RuntimeMetrics();
