import { ExecutionErrorClass } from '../contracts/execution-error.js';

export const METRIC_PROVIDERS = [
  'shopify',
  'erp',
  'playwright-rpa',
  'simulator',
  'human-gate',
  'other',
  'unknown',
] as const;
export type MetricProvider = (typeof METRIC_PROVIDERS)[number];

export const METRIC_MODES = [
  'dry_run',
  'simulated',
  'mock',
  'live',
  'unknown',
] as const;
export type MetricMode = (typeof METRIC_MODES)[number];

export const METRIC_DISPATCH_STATUSES = [
  'succeeded',
  'failed',
  'blocked',
  'waiting_approval',
] as const;
export type MetricDispatchStatus = (typeof METRIC_DISPATCH_STATUSES)[number];

export const METRIC_ADAPTER_STATUSES = [
  'success',
  'failed',
  'timeout',
  'cancelled',
] as const;
export type MetricAdapterStatus = (typeof METRIC_ADAPTER_STATUSES)[number];

export const METRIC_NEEDS_ATTENTION_REASONS = [
  'retry_exhausted',
  'auth_required',
  'verify_mismatch',
  'remote_conflict',
  'manual_required',
  'unknown',
] as const;
export type MetricNeedsAttentionReason = (typeof METRIC_NEEDS_ATTENTION_REASONS)[number];

export const METRIC_RECOVERY_STRATEGIES = [
  'query',
  'retry',
  'verify',
] as const;
export type MetricRecoveryStrategy = (typeof METRIC_RECOVERY_STRATEGIES)[number];

export const METRIC_SWEEP_RESULTS = [
  'completed',
  'aborted',
  'failed',
] as const;
export type MetricSweepResult = (typeof METRIC_SWEEP_RESULTS)[number];

export const METRIC_QUEUES = [
  'automation-recovery',
  'tasks',
  'closed-loop',
  'simulator',
  'outcome',
  'other',
] as const;
export type MetricQueue = (typeof METRIC_QUEUES)[number];

export const METRIC_VERIFY_RESULTS = [
  'verified',
  'mismatch',
  'timeout',
  'failed',
] as const;
export type MetricVerifyResult = (typeof METRIC_VERIFY_RESULTS)[number];

/**
 * Normalizes an arbitrary provider string into a strictly controlled low-cardinality provider label.
 */
export function normalizeMetricProvider(raw?: unknown): MetricProvider {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'unknown';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'shopify' || clean.startsWith('shopify')) return 'shopify';
  if (clean === 'erp' || clean.includes('erp')) return 'erp';
  if (clean.includes('playwright') || clean === 'rpa') return 'playwright-rpa';
  if (clean.includes('simulator')) return 'simulator';
  if (clean.includes('human') || clean.includes('gate')) return 'human-gate';
  return 'other';
}

/**
 * Normalizes execution mode into a controlled low-cardinality mode label.
 */
export function normalizeMetricMode(raw?: unknown): MetricMode {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'unknown';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'dry_run' || clean === 'dryrun') return 'dry_run';
  if (clean === 'simulated' || clean === 'simulation') return 'simulated';
  if (clean === 'mock') return 'mock';
  if (clean === 'live' || clean === 'production') return 'live';
  return 'unknown';
}

/**
 * Normalizes an action dispatch outcome status into a controlled low-cardinality dispatch status.
 */
export function normalizeMetricDispatchStatus(raw?: unknown): MetricDispatchStatus {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'failed';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'succeeded' || clean === 'success') return 'succeeded';
  if (clean === 'waiting_approval') return 'waiting_approval';
  if (clean === 'blocked') return 'blocked';
  return 'failed';
}

/**
 * Normalizes an adapter request outcome status.
 */
export function normalizeMetricAdapterStatus(raw?: unknown): MetricAdapterStatus {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'failed';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'success' || clean === 'succeeded' || clean === 'ok') return 'success';
  if (clean === 'timeout') return 'timeout';
  if (clean === 'cancelled' || clean === 'aborted') return 'cancelled';
  return 'failed';
}

export const KNOWN_ERROR_CLASSES = [
  'TRANSIENT',
  'RATE_LIMIT',
  'TIMEOUT',
  'AUTH',
  'PERMISSION',
  'VALIDATION',
  'CONFLICT',
  'NOT_FOUND',
  'PROVIDER_ERROR',
  'RPA_SELECTOR',
  'RPA_NAVIGATION',
  'VERIFY_MISMATCH',
  'UNKNOWN',
] as const;

/**
 * Normalizes error classes into standard ExecutionErrorClass string or 'none'.
 */
export function normalizeMetricErrorClass(raw?: unknown): string {
  if (!raw || raw === 'none' || raw === 'NONE') {
    return 'none';
  }
  const str = String(raw).trim().toUpperCase();
  if ((KNOWN_ERROR_CLASSES as readonly string[]).includes(str)) {
    return str;
  }
  return 'UNKNOWN';
}

/**
 * Normalizes NEEDS_ATTENTION reasons into a strictly controlled low-cardinality set.
 */
export function normalizeMetricReason(raw?: unknown): MetricNeedsAttentionReason {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'unknown';
  }
  const clean = raw.trim().toUpperCase();
  if (clean.includes('EXCEEDED') || clean.includes('MAX') || clean.includes('RETRY')) {
    return 'retry_exhausted';
  }
  if (clean.includes('AUTH') || clean.includes('PERMISSION') || clean.includes('REAUTHORIZE')) {
    return 'auth_required';
  }
  if (clean.includes('MISMATCH') || clean.includes('VERIFY')) {
    return 'verify_mismatch';
  }
  if (clean.includes('CONFLICT') || clean.includes('PAYLOAD')) {
    return 'remote_conflict';
  }
  if (clean.includes('MANUAL') || clean.includes('LOCAL_SYNC')) {
    return 'manual_required';
  }
  return 'unknown';
}

/**
 * Normalizes recovery strategy.
 */
export function normalizeMetricStrategy(raw?: unknown): MetricRecoveryStrategy {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'query';
  }
  const clean = raw.trim().toLowerCase();
  if (clean.includes('retry')) return 'retry';
  if (clean.includes('verify')) return 'verify';
  return 'query';
}

/**
 * Normalizes sweep result.
 */
export function normalizeMetricSweepResult(raw?: unknown): MetricSweepResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'completed';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'aborted') return 'aborted';
  if (clean === 'failed') return 'failed';
  return 'completed';
}

/**
 * Normalizes BullMQ queue names.
 */
export function normalizeMetricQueue(raw?: unknown): MetricQueue {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'other';
  }
  const clean = raw.trim().toLowerCase();
  if (clean.includes('recovery')) return 'automation-recovery';
  if (clean.includes('task')) return 'tasks';
  if (clean.includes('closed-loop') || clean.includes('closedloop')) return 'closed-loop';
  if (clean.includes('simulator')) return 'simulator';
  if (clean.includes('outcome')) return 'outcome';
  return 'other';
}

/**
 * Normalizes verification results.
 */
export function normalizeMetricVerifyResult(raw?: unknown): MetricVerifyResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'failed';
  }
  const clean = raw.trim().toLowerCase();
  if (clean === 'verified' || clean === 'success' || clean === 'match') return 'verified';
  if (clean === 'mismatch') return 'mismatch';
  if (clean === 'timeout') return 'timeout';
  return 'failed';
}
