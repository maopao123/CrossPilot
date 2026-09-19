import {
  ActionExecutionResult,
  ActionProposal,
  ActionDispatcherContext,
} from './action.types.js';
import { defaultRpaRegistry, RpaAdapter } from '@crosspilot/integrations/rpa';
import { AutomationMode } from '@crosspilot/shared';

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

    // 0. Check Human Gate FIRST (before checking any cache or dispatching)
    if (proposal.requiresHumanApproval && !context.isApproved) {
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
          return {
            ...cached.result,
            traceId,
          };
        }
      }

      // Idempotency conflict: same operationId was dispatched with different parameters, target, provider, or mode
      return {
        actionId: proposal.id,
        status: 'FAILED',
        error: `IDEMPOTENCY_CONFLICT: operationId '${context.operationId}' has already been executed with different parameters, target, provider, or mode`,
        traceId,
        durationMs: Date.now() - startTime,
        executionEvidence: {
          mode,
          provider: 'idempotency-cache',
          operationId,
          phase: 'FAILED',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: 'IDEMPOTENCY_CONFLICT',
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
      return {
        actionId: proposal.id,
        status: 'FAILED',
        isMock: mode === 'MOCK',
        error: `TARGET_MISMATCH: Approved proposal targetId "${proposal.targetId}" does not match execution payload target "${payloadTarget}"`,
        traceId,
        durationMs: Date.now() - startTime,
        executionEvidence: {
          mode,
          provider: context.providerId || 'action-router',
          operationId,
          phase: 'FAILED',
          effect: 'NOT_APPLIED',
          recovery: 'MANUAL',
          errorCode: 'TARGET_MISMATCH',
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
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: mode === 'LIVE'
              ? `AUTH_REQUIRED: No live RPA adapter configured for LIVE mode (provider: ${context.providerId || 'default'})`
              : `UNSUPPORTED: No RPA adapter available for ${mode} mode (provider: ${context.providerId || 'default'})`,
            traceId,
            durationMs: Date.now() - startTime,
            executionEvidence: {
              mode,
              provider: context.providerId || 'rpa',
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: mode === 'LIVE' ? 'REAUTHORIZE' : 'MANUAL',
              errorCode: mode === 'LIVE' ? 'AUTH_REQUIRED' : 'UNSUPPORTED',
            },
          };
          break;
        }

        const isMockAdapter = adapter.id === 'mock-rpa' || Boolean(adapter.supportedModes?.includes('MOCK'));
        const isLiveAdapter = adapter.id !== 'mock-rpa' && (!adapter.supportedModes || adapter.supportedModes.includes('LIVE'));
        const isSimulatorAdapter = Boolean(adapter.supportedModes?.includes('SIMULATOR'));

        // Strict pre-execution mode check: isolate mock and live providers before execute
        if (mode === 'MOCK' && !isMockAdapter) {
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: `INVALID_MODE: Provider '${adapter.id}' does not support MOCK mode`,
            traceId,
            durationMs: Date.now() - startTime,
            executionEvidence: {
              mode: 'MOCK',
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: 'INVALID_PROVIDER_FOR_MODE',
            },
          };
          break;
        }

        if (mode === 'SIMULATOR' && !isSimulatorAdapter) {
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: `UNSUPPORTED: Provider '${adapter.id}' does not support SIMULATOR mode`,
            traceId,
            durationMs: Date.now() - startTime,
            executionEvidence: {
              mode: 'SIMULATOR',
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: 'UNSUPPORTED',
            },
          };
          break;
        }

        if (mode === 'LIVE' && !isLiveAdapter) {
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: `AUTH_REQUIRED: Mock provider '${adapter.id}' cannot be executed in LIVE mode`,
            traceId,
            durationMs: Date.now() - startTime,
            executionEvidence: {
              mode: 'LIVE',
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'NOT_APPLIED',
              recovery: 'REAUTHORIZE',
              errorCode: 'AUTH_REQUIRED',
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
          });

          const isMock = mode === 'MOCK' || adapter.id === 'mock-rpa';
          const isSimulator = mode === 'SIMULATOR';

          if (rpaResult.status === 'SUCCESS') {
            // Live bare SUCCESS without verified evidence cannot claim APPLIED
            const isVerified = Boolean(isMock || (isSimulator && rpaResult.jobId) || rpaResult.output?.verified);

            result = {
              actionId: proposal.id,
              status: isVerified ? 'SUCCEEDED' : 'FAILED',
              isMock,
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              executionEvidence: {
                mode, // Preserve mode! Never hardcode isMock ? 'MOCK' : 'LIVE'
                provider: adapter.id,
                operationId,
                phase: isVerified ? 'COMPLETED' : (rpaResult.jobId ? 'SUBMITTED' : 'FAILED'),
                effect: isVerified ? 'APPLIED' : 'UNKNOWN',
                recovery: isVerified ? 'NONE' : (adapter.getStatus ? 'QUERY' : 'MANUAL'),
                externalId: rpaResult.jobId || undefined,
                ...(isMock ? { verifiedAt: new Date().toISOString() } : {}),
                ...(isVerified ? {} : { errorCode: 'UNVERIFIED_LIVE_EXECUTION' }),
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
            result = {
              actionId: proposal.id,
              status: 'FAILED',
              isMock,
              error: rpaResult.error || 'RPA execution timed out',
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              executionEvidence: {
                mode,
                provider: adapter.id,
                operationId,
                phase: 'FAILED',
                effect: 'UNKNOWN',
                recovery: adapter.getStatus ? 'QUERY' : 'MANUAL',
                externalId: rpaResult.jobId || undefined,
                errorCode: 'TIMEOUT',
              },
            };
          } else {
            // FAILED status returned from adapter
            // Typed preflight/config distinction: only pre-dispatch errors without a remote jobId
            // (e.g. local config error, missing credentials, unsupported workflow) definitely have effect NOT_APPLIED.
            // Any failure once dispatched to a remote system (hasRemoteJob === true) retains effect UNKNOWN for safety,
            // preserving remote externalId for auditability and recovery.
            const hasRemoteJob = Boolean(rpaResult.jobId);
            const isExplicitPreflight =
              !hasRemoteJob &&
              (Boolean(rpaResult.error?.startsWith('CONFIG_ERROR')) ||
                Boolean(rpaResult.error?.startsWith('AUTH_REQUIRED')) ||
                Boolean(rpaResult.error?.startsWith('UNSUPPORTED_WORKFLOW')) ||
                Boolean(rpaResult.error?.startsWith('PREFLIGHT')));

            const errorCode = rpaResult.error?.startsWith('CONFIG_ERROR')
              ? 'CONFIG_ERROR'
              : (rpaResult.error?.startsWith('AUTH_REQUIRED') ? 'AUTH_REQUIRED' : 'RPA_FAILED');

            result = {
              actionId: proposal.id,
              status: 'FAILED',
              isMock,
              error: rpaResult.error || 'RPA execution failed',
              data: rpaResult as any,
              traceId,
              durationMs: Date.now() - startTime,
              executionEvidence: {
                mode,
                provider: adapter.id,
                operationId,
                phase: 'FAILED',
                effect: isExplicitPreflight ? 'NOT_APPLIED' : 'UNKNOWN',
                recovery: isExplicitPreflight ? 'REAUTHORIZE' : (adapter.getStatus ? 'QUERY' : 'MANUAL'),
                externalId: rpaResult.jobId || undefined,
                errorCode,
              },
            };
          }
        } catch (err: any) {
          // Unexpected exception during execution (e.g. process crash, connection dropped after submit)
          // Conservative invariant: remote effect is UNKNOWN
          result = {
            actionId: proposal.id,
            status: 'FAILED',
            error: err.message || 'RPA adapter threw an unexpected error',
            traceId,
            durationMs: Date.now() - startTime,
            executionEvidence: {
              mode,
              provider: adapter.id,
              operationId,
              phase: 'FAILED',
              effect: 'UNKNOWN',
              recovery: adapter.getStatus ? 'QUERY' : 'MANUAL',
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
        result = {
          actionId: proposal.id,
          status: 'FAILED',
          error: `UNSUPPORTED: runtime ${proposal.type} is not implemented`,
          traceId,
          durationMs: Date.now() - startTime,
          executionEvidence: {
            mode,
            provider: proposal.type,
            operationId,
            phase: 'FAILED',
            effect: 'NOT_APPLIED',
            recovery: 'MANUAL',
            errorCode: 'UNSUPPORTED_RUNTIME',
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

    return result;
  }
}
