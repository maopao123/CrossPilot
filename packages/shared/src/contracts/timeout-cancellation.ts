/**
 * Automation Runtime Timeout & Cancellation Propagation Contracts
 * Part of CrossPilot Automation Reliability & Observability Plan V2 Phase 2.
 */

export interface AutomationTimeoutConfig {
  httpTimeoutMs: number;
  executionTimeoutMs: number;
  verifyTimeoutMs: number;
  rpaNavigationTimeoutMs: number;
}

export const MIN_AUTOMATION_TIMEOUT_MS = 100;
export const MAX_AUTOMATION_TIMEOUT_MS = 600_000; // 10 minutes

export const DEFAULT_AUTOMATION_TIMEOUT_CONFIG: AutomationTimeoutConfig = Object.freeze({
  httpTimeoutMs: 10_000,
  executionTimeoutMs: 60_000,
  verifyTimeoutMs: 15_000,
  rpaNavigationTimeoutMs: 30_000,
});

/**
 * Parses and validates an integer timeout string from env with safe fallback and upper/lower bounds.
 */
function parseBoundedTimeout(
  rawValue: string | undefined,
  defaultValue: number,
  minBound: number = MIN_AUTOMATION_TIMEOUT_MS,
  maxBound: number = MAX_AUTOMATION_TIMEOUT_MS,
): number {
  if (rawValue == null || typeof rawValue !== 'string') {
    return defaultValue;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return defaultValue;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }
  if (parsed < minBound) {
    return minBound;
  }
  if (parsed > maxBound) {
    return maxBound;
  }
  return parsed;
}

/**
 * Loads and returns the unified Automation Timeout configuration from process.env or supplied env record.
 */
export function getAutomationTimeoutConfig(
  env: Record<string, string | undefined> = process.env,
): AutomationTimeoutConfig {
  return {
    httpTimeoutMs: parseBoundedTimeout(
      env.AUTOMATION_HTTP_TIMEOUT_MS,
      DEFAULT_AUTOMATION_TIMEOUT_CONFIG.httpTimeoutMs,
    ),
    executionTimeoutMs: parseBoundedTimeout(
      env.AUTOMATION_EXECUTION_TIMEOUT_MS,
      DEFAULT_AUTOMATION_TIMEOUT_CONFIG.executionTimeoutMs,
    ),
    verifyTimeoutMs: parseBoundedTimeout(
      env.AUTOMATION_VERIFY_TIMEOUT_MS,
      DEFAULT_AUTOMATION_TIMEOUT_CONFIG.verifyTimeoutMs,
    ),
    rpaNavigationTimeoutMs: parseBoundedTimeout(
      env.AUTOMATION_RPA_NAVIGATION_TIMEOUT_MS,
      DEFAULT_AUTOMATION_TIMEOUT_CONFIG.rpaNavigationTimeoutMs,
    ),
  };
}

export interface CombinedAbortSignalResult {
  signal: AbortSignal;
  cleanup: () => void;
  isTimedOut: () => boolean;
  isCancelled: () => boolean;
}

/**
 * Safe, leak-free AbortSignal combiner supporting both external signals and internal timeout deadlines.
 * Automatically cleans up timer and event listeners upon abort or explicit cleanup() call.
 */
export function combineAbortSignals(
  signals?: (AbortSignal | undefined | null)[],
  timeoutMs?: number,
): CombinedAbortSignalResult {
  const activeSignals = (signals || []).filter((s): s is AbortSignal => Boolean(s));

  // 1. Check if any provided signal is already aborted
  const alreadyAborted = activeSignals.find((s) => s.aborted);
  if (alreadyAborted) {
    const controller = new AbortController();
    controller.abort(alreadyAborted.reason || new Error('Aborted by caller'));
    return {
      signal: controller.signal,
      cleanup: () => {},
      isTimedOut: () => false,
      isCancelled: () => true,
    };
  }

  // 2. Check if immediate timeout <= 0 was requested
  if (timeoutMs !== undefined && timeoutMs <= 0) {
    const controller = new AbortController();
    const timeoutErr = new Error(`Operation timed out immediately (${timeoutMs}ms)`);
    timeoutErr.name = 'TimeoutError';
    controller.abort(timeoutErr);
    return {
      signal: controller.signal,
      cleanup: () => {},
      isTimedOut: () => true,
      isCancelled: () => false,
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  let cleanedUp = false;

  let timer: NodeJS.Timeout | null = null;
  const signalListeners: Array<{ signal: AbortSignal; listener: () => void }> = [];

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    for (const { signal, listener } of signalListeners) {
      signal.removeEventListener('abort', listener);
    }
    signalListeners.length = 0;
  };

  // Set timeout if specified and finite
  if (timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      const timeoutErr = new Error(`Operation timed out after ${timeoutMs}ms`);
      timeoutErr.name = 'TimeoutError';
      controller.abort(timeoutErr);
      cleanup();
    }, timeoutMs);
  }

  // Bind external signal listeners
  for (const sig of activeSignals) {
    const onAbort = () => {
      cancelled = true;
      controller.abort(sig.reason || new Error('Aborted by caller'));
      cleanup();
    };
    sig.addEventListener('abort', onAbort, { once: true });
    signalListeners.push({ signal: sig, listener: onAbort });
  }

  return {
    signal: controller.signal,
    cleanup,
    isTimedOut: () => timedOut,
    isCancelled: () => cancelled,
  };
}
