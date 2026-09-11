import { ActionExecutionResult, ActionProposal, ActionStatus } from './action.types.js';
import { defaultRpaRegistry, RpaAdapter } from '@crosspilot/integrations/rpa';

export interface ActionDispatcherContext {
  workspaceId: string;
  userId?: string;
  traceId?: string;
  isApproved?: boolean;
  operationId?: string;
}

export class ActionRouter {
  private readonly completedOperations = new Map<string, ActionExecutionResult>();

  constructor(private readonly rpaRegistry = defaultRpaRegistry) {}

  /**
   * Evaluates if proposal requires human gate, or dispatches directly to chosen runtime
   */
  async dispatch<T = any>(
    proposal: ActionProposal<T>,
    context: ActionDispatcherContext,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const traceId = context.traceId || `act_trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 0. Check Idempotency via operationId
    if (context.operationId && this.completedOperations.has(context.operationId)) {
      const cached = this.completedOperations.get(context.operationId)!;
      return {
        ...cached,
        traceId,
      };
    }

    // 1. Check Human Gate
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
      };
    }

    // 2. Dispatch by runtime
    try {
      let data: any;
      switch (proposal.type) {
        case 'RPA': {
          const adapter = this.rpaRegistry.getDefault();
          const rpaResult = await adapter.execute({
            workflow: proposal.name,
            params: proposal.payload as Record<string, unknown>,
          });
          data = rpaResult;
          break;
        }

        case 'API':
        case 'PYTHON':
        case 'AI':
        case 'BROWSER':
        default: {
          data = {
            executed: true,
            runtime: proposal.type,
            output: proposal.payload,
            timestamp: new Date().toISOString(),
          };
          break;
        }
      }

      const result: ActionExecutionResult = {
        actionId: proposal.id,
        status: 'SUCCEEDED',
        data,
        traceId,
        durationMs: Date.now() - startTime,
      };

      if (context.operationId) {
        if (this.completedOperations.size > 2000) {
          const oldestKey = this.completedOperations.keys().next().value;
          if (oldestKey) this.completedOperations.delete(oldestKey);
        }
        this.completedOperations.set(context.operationId, result);
      }

      return result;
    } catch (err: any) {
      return {
        actionId: proposal.id,
        status: 'FAILED',
        error: err.message || 'Action execution failed.',
        traceId,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
