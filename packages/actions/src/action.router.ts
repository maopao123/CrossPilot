import {
  ActionExecutionResult,
  ActionProposal,
  ActionDispatcherContext,
} from './action.types.js';
import { defaultRpaRegistry, RpaAdapter } from '@crosspilot/integrations/rpa';
import {
  AutomationMode,
  normalizeExecutionError,
  getAutomationTimeoutConfig,
  combineAbortSignals,
  runtimeLogger,
  RuntimeEvents,
} from '@crosspilot/shared';
import { verifyApprovedPayloadBinding } from './approval-binding.js';

export type { ActionDispatcherContext } from './action.types.js';

interface CachedOperationRecord {
  actionId: string;
  actionType: string;
  targetEntity?: string;
  targetId?: string;
  providerId?: string;
  mode: AutomationMode;
  payloadJson: string;
  result: ActionExecutionResult;
}

export class ActionRouter {
  /**
   * Note: This in-memory Map is ONLY a process-local deduplication cache for successfully completed operations.
   * It is NOT a durable cross-process or cross-worker idempotency guarantee.
   * Failed or pending attempts are never cached to avoid permanently freezing recoverable operations.
   */
  private readonly completedOperations = new Map<string, CachedOperationRecord>();

  constructor(private readonly rpaRegistry = defaultRpaRegistry) {}

  /**
   * Evaluates if proposal requires human gate, validates mode/provider, or dispatches to chosen runtime
   */
  async dispatch<T = any>(
    proposal: ActionProposal<T>,
    context: ActionDispatcherContext,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const traceId = context.traceId || `act_trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mode: AutomationMode = context.executionMode || 'LIVE';
    const operationId = context.operationId || proposal.id;

    const routerLogger = runtimeLogger.child({
      service: 'action-router',
      traceId,
      workspaceId: context.workspaceId,
      actionId: proposal.id,
      operationId,
      executionMode: mode,
      provider: context.providerId,
    });

    routerLogger.info({
      event: RuntimeEvents.ACTION_DISPATCH_STARTED,
      actionType: proposal.type,
      targetEntity: proposal.targetEntity,
      targetId: proposal.targetId,
    });

    const timeoutConfig = getAutomationTimeoutConfig();
    const executionTimeoutMs = context.timeoutMs ?? timeoutConfig.executionTimeoutMs;
    const combined = combineAbortSignals([context.signal], executionTimeoutMs);

    // 0. Check Human Gate FIRST (before checking any cache or dispatching)
    if (proposal.requiresHumanApproval && !context.isApproved) {
      combined.cleanup();
      routerLogger.warn({
        event: RuntimeEvents.ACTION_DISPATCH_BLOCKED,
        reason: 'APPROVAL_REQUIRED',
        durationMs: Date.now() - startTime,
      });
      return {
        actionId: proposal.id,
        status: 'WAITING_APPROVAL',
        approvalId: `appr_${proposal.id}`,
        traceId,
        durationMs: Date.now() - startTime,
        data: {
          message: 'High-risk action held at Human Gate. Waiting for human approval.',
          proposal,
        },
        executionEvidence: {
          mode,
          provider: 'human-gate',
          operationId,
          phase: 'READY',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
        },
      };
    }

    // 1. Check Idempotency via scoped workspaceId:operationId
    const cacheKey = context.operationId ? `${context.workspaceId}:${context.operationId}` : undefined;
    if (cacheKey && this.completedOperations.has(cacheKey)) {
      const cached = this.completedOperations.get(cacheKey)!;
      const currentPayloadJson = JSON.stringify(proposal.payload || {});

      // Verify that the cached operation strictly matches all identity attributes:
      // actionId, actionType, targetEntity, targetId, providerId, executionMode and payload
      if (
        cached.actionId === proposal.id &&
        cached.actionType === proposal.type &&
        cached.targetEntity === proposal.targetEntity &&
        cached.targetId === proposal.targetId &&
        cached.providerId === (context.providerId || '') &&
        cached.mode === mode &&
        cached.payloadJson === currentPayloadJson
      ) {
        // Only Mock mode can replay cached results; LIVE/SIMULATOR must not silently replay
        if (mode === 'MOCK') {
          combined.cleanup();
          routerLogger.info({
            event: RuntimeEvents.ACTION_DISPATCH_COMPLETED,
            isReplay: true,
            durationMs: Date.now() - startTime,
            phase: cached.result.executionEvidence?.phase || 'COMPLETED',
            effect: cached.result.executionEvidence?.effect || 'APPLIED',
            recovery: cached.result.executionEvidence?.recovery || 'NONE',
          });
          return {
            ...cached.result,
            traceId,
          };
        }
      }

      // Idempotency conflict: same operationId was dispatched with different parameters, target, provider, or mode
      const idempErrorMsg = `IDEMPOTENCY_CONFLICT: operationId '${context.operationId}' has already been executed with different parameters, target, provider, or mode`;
      const idempNormalized = normalizeExecutionError(idempErrorMsg, {
        provider: 'idempotency-cache',
        code: 'IDEMPOTENCY_CONFLICT',
      });
      combined.cleanup();
      routerLogger.warn({
        event: RuntimeEvents.ACTION_DISPATCH_BLOCKED,
        reason: 'IDEMPOTENCY_CONFLICT',
        durationMs: Date.now() - startTime,
      });
      return {
        actionId: proposal.id,
        status: 'FAILED',
        error: idempErrorMsg,
        traceId,
        durationMs: Date.now() - startTime,
        normalizedError: idempNormalized,
        executionEvidence: {
          mode,
          provider: 'idempotency-cache',
          operationId,
          phase: 'FAILED',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: idempNormalized.code,
          errorClass: idempNormalized.class,
          normalizedError: idempNormalized,
        },
      };
    }

    // 2. Check Target Alignment: Enforce that approved proposal targetId strictly matches
    // the execution payload target (skuCode/sku/targetId). Prevents executing a different entity
    // than the one reviewed and approved by the user (e.g. approving SKU-001 but executing SKU-00).
    const payload = (proposal.payload || {}) as Record<string, unknown>;
    const payloadTarget = String(
      payload.skuCode || payload.sku || (payload.targetId && typeof payload.targetId === 'string' ? payload.targetId : '') || '',
    ).trim();

    if (proposal.targetId && payloadTarget && proposal.targetId !== payloadTarget) {
      const targetMismatchMsg = `TARGET_MISMATCH: Approved proposal targetId "${proposal.targetId}" does not match execution payload target "${payloadTarget}"`;
      const targetNormalized = normalizeExecutionError(targetMismatchMsg, {
        provider: context.providerId || 'action-router',
        code: 'TARGET_MISMATCH',
      });
      combined.cleanup();
      routerLogger.warn({
        event: RuntimeEvents.ACTION_DISPATCH_BLOCKED,
        reason: 'TARGET_MISMATCH',
        durationMs: Date.now() - startTime,
      });
      return {
        actionId: proposal.id,
        status: 'FAILED',
        isMock: mode === 'MOCK',
        error: targetMismatchMsg,
        traceId,
        durationMs: Date.now() - startTime,
        normalizedError: targetNormalized,
        executionEvidence: {
          mode,
          provider: context.providerId || 'action-router',
          operationId,
          phase: 'FAILED',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: targetNormalized.code,
          errorClass: targetNormalized.class,
          normalizedError: targetNormalized,
        },
      };
    }

    // 2.1 Check Approved Payload Immutability: Enforce that approved proposal parameters
    // (skuCode, title, price, workflow) cannot be tampered with after approval.
    const payloadBindingCheck = verifyApprovedPayloadBinding(proposal, context);
    if (!payloadBindingCheck.valid) {
      const tamperedMsg = `PAYLOAD_TAMPERED: Approved execution parameters were tampered (${payloadBindingCheck.reason})`;
      const tamperedNormalized = normalizeExecutionError(tamperedMsg, {
        provider: context.providerId || 'action-router',
        code: 'PAYLOAD_TAMPERED',
      });
      combined.cleanup();
      routerLogger.warn({
        event: RuntimeEvents.ACTION_DISPATCH_BLOCKED,
        reason: 'PAYLOAD_TAMPERED',
        durationMs: Date.now() - startTime,
      });
      return {
        actionId: proposal.id,
        status: 'FAILED',
        isMock: mode === 'MOCK',
        error: tamperedMsg,
        traceId,
        durationMs: Date.now() - startTime,
        normalizedError: tamperedNormalized,
        executionEvidence: {
          mode,
          provider: context.providerId || 'action-router',
          operationId,
          phase: 'FAILED',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: tamperedNormalized.code,
          errorClass: tamperedNormalized.class,
          normalizedError: tamperedNormalized,
        },
      };
    }

    // 2.2 Demo Payload Guard: LIVE mode strictly forbids executing demo templates (WRITE_FORBIDDEN)
    const isDemoPayload =
      Boolean((proposal.payload as any)?.isDemoTemplate) ||
      Boolean((proposal.approvedPayload as any)?.isDemoTemplate);

    if (mode === 'LIVE' && isDemoPayload) {
      const demoErrorMsg = 'DEMO_PAYLOAD_FORBIDDEN: Demo template cannot be executed in LIVE mode (WRITE_FORBIDDEN)';
      const demoNormalized = normalizeExecutionError(demoErrorMsg, {
        provider: context.providerId || 'action-router',
        code: 'WRITE_FORBIDDEN',
      });
      combined.cleanup();
      routerLogger.warn({
        event: RuntimeEvents.ACTION_DISPATCH_BLOCKED,
        reason: 'WRITE_FORBIDDEN',
        durationMs: Date.now() - startTime,
      });
      return {
        actionId: proposal.id,
        status: 'FAILED',
        isMock: false,
        error: demoErrorMsg,
        traceId,
        durationMs: Date.now() - startTime,
        normalizedError: demoNormalized,
        executionEvidence: {
          mode,
          provider: context.providerId || 'action-router',
          operationId,
          phase: 'FAILED',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: demoNormalized.code,
          errorClass: demoNormalized.class,
          normalizedError: demoNormalized,
        },
      };
    }

    // 3. Dispatch by runtime
    let result: ActionExecutionResult;

    switch (proposal.type) {
      case 'RPA': {
        const adapter: RpaAdapter | undefined = context.providerId
          ? this.rpaRegistry.get(context.providerId)
          : this.rpaRegistry.getDefault(mode);

        if (!adapter) {
          const errorMsg = mode === 'LIVE'
            ? `AUTH_REQUIRED: No live RPA adapter configured for LIVE mode (provider: ${context.providerId || 'default'})`
            : `UNSUPPORTED: No RPA adapter available for ${mode} mode (provider: ${context.providerId || 'default'})`;
          const normalized = normalizeExecutionError(errorMsg, {
            provider: context.providerId || 'rpa',
            code: mode === 'LIVE' ? 'AUTH_REQUIRED' : 'UNSUPPORTED',
          });
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: errorMsg,
            traceId,
            durationMs: Date.now() - startTime,
            normalizedError: normalized,
            executionEvidence: {
              mode,
              provider: context.providerId || 'rpa',
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: mode === 'LIVE' ? 'REAUTHORIZE' : 'MANUAL',
              errorCode: normalized.code,
              errorClass: normalized.class,
              normalizedError: normalized,
            },
          };
          break;
        }

        const isMockAdapter = adapter.id === 'mock-rpa' || Boolean(adapter.supportedModes?.includes('MOCK'));
        const isLiveAdapter = adapter.id !== 'mock-rpa' && (!adapter.supportedModes || adapter.supportedModes.includes('LIVE'));
        const isSimulatorAdapter = Boolean(adapter.supportedModes?.includes('SIMULATOR'));

        // Strict pre-execution mode check: isolate mock and live providers before execute
        if (mode === 'MOCK' && !isMockAdapter) {
          const errorMsg = `INVALID_MODE: Provider '${adapter.id}' does not support MOCK mode`;
          const normalized = normalizeExecutionError(errorMsg, {
            provider: adapter.id,
            code: 'INVALID_PROVIDER_FOR_MODE',
          });
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: errorMsg,
            traceId,
            durationMs: Date.now() - startTime,
            normalizedError: normalized,
            executionEvidence: {
              mode: 'MOCK',
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: normalized.code,
              errorClass: normalized.class,
              normalizedError: normalized,
            },
          };
          break;
        }

        if (mode === 'SIMULATOR' && !isSimulatorAdapter) {
          const errorMsg = `UNSUPPORTED: Provider '${adapter.id}' does not support SIMULATOR mode`;
          const normalized = normalizeExecutionError(errorMsg, {
            provider: adapter.id,
            code: 'UNSUPPORTED',
          });
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: errorMsg,
            traceId,
            durationMs: Date.now() - startTime,
            normalizedError: normalized,
            executionEvidence: {
              mode: 'SIMULATOR',
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: normalized.code,
              errorClass: normalized.class,
              normalizedError: normalized,
            },
          };
          break;
        }

        if (mode === 'LIVE' && !isLiveAdapter) {
          const errorMsg = `AUTH_REQUIRED: Mock provider '${adapter.id}' cannot be executed in LIVE mode`;
          const normalized = normalizeExecutionError(errorMsg, {
            provider: adapter.id,
            code: 'AUTH_REQUIRED',
          });
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: errorMsg,
            traceId,
            durationMs: Date.now() - startTime,
            normalizedError: normalized,
            executionEvidence: {
              mode: 'LIVE',
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'REAUTHORIZE',
              errorCode: normalized.code,
              errorClass: normalized.class,
              normalizedError: normalized,
            },
          };
          break;
        }

        if (combined.signal.aborted) {
          const isTimeout = combined.isTimedOut();
          const code = isTimeout ? 'TIMEOUT' : 'CANCELLED';
          const errorMsg = isTimeout
            ? `Execution timed out before starting (${executionTimeoutMs}ms)`
            : 'Execution was cancelled by caller before starting';
          const norm = normalizeExecutionError(errorMsg, {
            provider: adapter.id,
            code,
          });
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: errorMsg,
            traceId,
            durationMs: Date.now() - startTime,
            normalizedError: norm,
            executionEvidence: {
              mode,
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'NONE',
              errorCode: norm.code,
              errorClass: norm.class,
              normalizedError: norm,
            },
          };
          break;
        }

        try {
          const payload = (proposal.payload || {}) as Record<string, unknown>;
          const workflow = String(payload.workflow || proposal.name || '');
          const rpaResult = await adapter.execute({
            workflow,
            params: payload,
            signal: combined.signal,
            timeoutMs: executionTimeoutMs,
          });

          const isMock = mode === 'MOCK' || adapter.id === 'mock-rpa';
          const isSimulator = mode === 'SIMULATOR';

          if (rpaResult.status === 'SUCCESS') {
            // Live bare SUCCESS without verified evidence cannot claim APPLIED
            const isVerified = Boolean(isMock || (isSimulator && rpaResult.jobId) || rpaResult.output?.verified);
            const unverifiedNormalized = isVerified
              ? undefined
              : normalizeExecutionError('UNVERIFIED_LIVE_EXECUTION', {
                  provider: adapter.id,
                  code: 'UNVERIFIED_LIVE_EXECUTION',
                });

            result = {
              actionId: proposal.id,
              status: isVerified ? 'SUCCEEDED' : 'FAILED',
              isMock,
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              normalizedError: unverifiedNormalized,
              executionEvidence: {
                mode, // Preserve mode! Never hardcode isMock ? 'MOCK' : 'LIVE'
                provider: adapter.id,
                operationId,
                phase: isVerified ? 'COMPLETED' : (rpaResult.jobId ? 'SUBMITTED' : 'FAILED'),
                effect: isVerified ? 'APPLIED' : 'UNKNOWN',
                recovery: isVerified ? 'NONE' : (adapter.getStatus ? 'QUERY' : 'MANUAL'),
                externalId: rpaResult.jobId || undefined,
                ...(isMock ? { verifiedAt: new Date().toISOString() } : {}),
                ...(isVerified
                  ? {}
                  : {
                      errorCode: 'UNVERIFIED_LIVE_EXECUTION',
                      errorClass: unverifiedNormalized?.class,
                      normalizedError: unverifiedNormalized,
                    }),
              },
            };
          } else if (rpaResult.status === 'RUNNING') {
            result = {
              actionId: proposal.id,
              status: 'RUNNING',
              isMock,
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              executionEvidence: {
                mode,
                provider: adapter.id,
                operationId,
                phase: 'SUBMITTED',
                effect: 'UNKNOWN',
                recovery: adapter.getStatus ? 'QUERY' : 'MANUAL',
                externalId: rpaResult.jobId || undefined,
              },
            };
          } else if (rpaResult.status === 'TIMEOUT') {
            const timeoutNormalized =
              rpaResult.normalizedError ||
              normalizeExecutionError(rpaResult.error || 'RPA execution timed out', {
                provider: adapter.id,
                code: 'TIMEOUT',
              });
            result = {
              actionId: proposal.id,
              status: 'FAILED',
              isMock,
              error: rpaResult.error || 'RPA execution timed out',
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              normalizedError: timeoutNormalized,
              executionEvidence: {
                mode,
                provider: adapter.id,
                operationId,
                phase: 'FAILED',
                effect: 'UNKNOWN',
                recovery: adapter.getStatus ? 'QUERY' : 'MANUAL',
                externalId: rpaResult.jobId || undefined,
                errorCode: timeoutNormalized.code,
                errorClass: timeoutNormalized.class,
                normalizedError: timeoutNormalized,
              },
            };
          } else {
            // FAILED status returned from adapter
            const failedNormalized =
              rpaResult.normalizedError ||
              normalizeExecutionError(rpaResult.error || 'RPA execution failed', {
                provider: adapter.id,
              });

            const hasRemoteJob = Boolean(rpaResult.jobId);
            const writeExecuted = Boolean(rpaResult.output && (rpaResult.output as any).writeExecuted);

            // Primary control path: typed normalized error
            let isExplicitPreflight =
              !hasRemoteJob &&
              (failedNormalized.class === 'VALIDATION' ||
                failedNormalized.class === 'AUTH' ||
                failedNormalized.class === 'PERMISSION' ||
                failedNormalized.code === 'CONFIG_ERROR' ||
                failedNormalized.code === 'AUTH_REQUIRED' ||
                failedNormalized.code === 'UNSUPPORTED_WORKFLOW' ||
                failedNormalized.code === 'PREFLIGHT');

            // Pre-write cancel: cancelled before writing (e.g. before save)
            const isPreWriteCancel =
              !hasRemoteJob &&
              !writeExecuted &&
              (failedNormalized.code === 'CANCELLED' ||
                failedNormalized.code === 'ABORTED_BEFORE_WRITE' ||
                failedNormalized.code === 'ABORTED');

            // LEGACY COMPATIBILITY FALLBACK: Only when rpaResult.normalizedError was missing
            // from adapter and typed classification did not match, check legacy raw string prefix.
            if (!isExplicitPreflight && !rpaResult.normalizedError && rpaResult.error) {
              const rawErr = rpaResult.error;
              isExplicitPreflight =
                !hasRemoteJob &&
                (rawErr.startsWith('CONFIG_ERROR') ||
                  rawErr.startsWith('AUTH_REQUIRED') ||
                  rawErr.startsWith('UNSUPPORTED_WORKFLOW') ||
                  rawErr.startsWith('PREFLIGHT'));
            }

            const isSafeNotApplied = (isExplicitPreflight || isPreWriteCancel) && !writeExecuted;

            result = {
              actionId: proposal.id,
              status: 'FAILED',
              isMock,
              error: rpaResult.error || 'RPA execution failed',
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              normalizedError: failedNormalized,
              executionEvidence: {
                mode,
                provider: adapter.id,
                operationId,
                phase: 'FAILED',
                effect: isSafeNotApplied ? 'NOT_APPLIED' : 'UNKNOWN',
                recovery: isPreWriteCancel
                  ? 'NONE'
                  : isExplicitPreflight
                    ? (failedNormalized.class === 'AUTH' ? 'REAUTHORIZE' : 'MANUAL')
                    : (adapter.getStatus ? 'QUERY' : 'MANUAL'),
                externalId: rpaResult.jobId || undefined,
                errorCode: failedNormalized.code,
                errorClass: failedNormalized.class,
                normalizedError: failedNormalized,
              },
            };
          }
        } catch (err: any) {
          // Unexpected exception during execution (e.g. process crash, connection dropped after submit, or adapter threw AbortError)
          // Conservative invariant: once adapter.execute(...) has been entered, remote effect is strictly UNKNOWN
          // unless the error carries explicit proof that write did not occur (writeExecuted === false).
          const isCancelled = combined.isCancelled() || err.name === 'AbortError';
          const isTimedOut = combined.isTimedOut() || err.name === 'TimeoutError';
          const caughtCode = isCancelled ? 'CANCELLED' : isTimedOut ? 'TIMEOUT' : undefined;
          const caughtNormalized = normalizeExecutionError(err, {
            provider: adapter.id,
            code: caughtCode,
          });

          const isProvenPreWrite = err?.writeExecuted === false || err?.output?.writeExecuted === false;
          const effect = isProvenPreWrite ? 'NOT_APPLIED' : 'UNKNOWN';
          const recovery = isProvenPreWrite ? 'NONE' : (adapter.getStatus ? 'QUERY' : 'MANUAL');

          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: err.message || 'RPA adapter threw an unexpected error',
            traceId,
            durationMs: Date.now() - startTime,
            normalizedError: caughtNormalized,
            executionEvidence: {
              mode,
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect,
              recovery,
              errorCode: caughtNormalized.code,
              errorClass: caughtNormalized.class,
              normalizedError: caughtNormalized,
            },
          };
        }
        break;
      }

      case 'API':
      case 'PYTHON':
      case 'AI':
      case 'BROWSER':
      case 'COMPUTER_USE':
      default: {
        const unsupportedMsg = `UNSUPPORTED: runtime ${proposal.type} is not implemented`;
        const unsupportedNormalized = normalizeExecutionError(unsupportedMsg, {
          provider: proposal.type,
          code: 'UNSUPPORTED_RUNTIME',
        });
        result = {
          actionId: proposal.id,
          status: 'FAILED',
          error: unsupportedMsg,
          traceId,
          durationMs: Date.now() - startTime,
          normalizedError: unsupportedNormalized,
          executionEvidence: {
            mode,
            provider: proposal.type,
            operationId,
            phase: 'FAILED',
            effect: 'NOT_APPLIED',
            recovery: 'MANUAL',
            errorCode: unsupportedNormalized.code,
            errorClass: unsupportedNormalized.class,
            normalizedError: unsupportedNormalized,
          },
        };
        break;
      }
    }

    // Only cache successful Mock executions. Failed, unknown, or non-Mock attempts are never permanently cached.
    if (cacheKey && result.status === 'SUCCEEDED' && mode === 'MOCK') {
      if (this.completedOperations.size > 2000) {
        const oldestKey = this.completedOperations.keys().next().value;
        if (oldestKey) this.completedOperations.delete(oldestKey);
      }
      this.completedOperations.set(cacheKey, {
        actionId: proposal.id,
        actionType: proposal.type,
        targetEntity: proposal.targetEntity,
        targetId: proposal.targetId,
        providerId: context.providerId || '',
        mode,
        payloadJson: JSON.stringify(proposal.payload || {}),
        result,
      });
    }

    combined.cleanup();

    if (result.status === 'SUCCEEDED') {
      routerLogger.info({
        event: RuntimeEvents.ACTION_DISPATCH_COMPLETED,
        durationMs: Date.now() - startTime,
        phase: result.executionEvidence?.phase || 'COMPLETED',
        effect: result.executionEvidence?.effect || 'APPLIED',
        recovery: result.executionEvidence?.recovery || 'NONE',
      });
    } else {
      const errorCode = result.normalizedError?.code || result.executionEvidence?.errorCode;
      const errorClass = result.normalizedError?.class || result.executionEvidence?.errorClass;
      const isExpectedWarn =
        errorCode === 'CANCELLED' ||
        errorClass === 'TIMEOUT' ||
        result.status === 'WAITING_APPROVAL';

      const logFn = isExpectedWarn ? routerLogger.warn.bind(routerLogger) : routerLogger.error.bind(routerLogger);
      logFn({
        event: RuntimeEvents.ACTION_DISPATCH_FAILED,
        durationMs: Date.now() - startTime,
        errorClass,
        errorCode,
        phase: result.executionEvidence?.phase || 'FAILED',
        effect: result.executionEvidence?.effect,
        recovery: result.executionEvidence?.recovery,
      });
    }

    return result;
  }
}
