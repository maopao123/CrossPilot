import { ErrorCodes, type CommerceActionType } from '@crosspilot/shared';
import { ActionLayerError } from './action-layer.error.js';
import type { ActionToolRegistry, MockToolResult } from './action-registry.js';

export interface MockExecutionAttempt {
  attempt: number;
  result: MockToolResult;
}

export interface MockExecutionOutcome {
  status: 'SUCCESS' | 'FAILED';
  attempts: MockExecutionAttempt[];
  output: Record<string, unknown>;
  error?: string;
}

export async function executeMockAction(
  registry: ActionToolRegistry,
  input: {
    actionType: CommerceActionType;
    target: Record<string, unknown>;
    parameters: Record<string, unknown>;
  },
  options: { maxAttempts?: number } = {},
): Promise<MockExecutionOutcome> {
  const tool = registry.get(input.actionType);
  const maxAttempts = options.maxAttempts ?? 3;
  const attempts: MockExecutionAttempt[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await tool({
      actionType: input.actionType,
      target: input.target,
      parameters: input.parameters,
      attempt,
    });
    attempts.push({ attempt, result });
    if (result.success) {
      return {
        status: 'SUCCESS',
        attempts,
        output: {
          success: true,
          message: result.message,
          attempts: attempt,
          ...(result.data || {}),
        },
      };
    }
    if (!result.retryable) {
      break;
    }
  }

  const last = attempts[attempts.length - 1]?.result;
  return {
    status: 'FAILED',
    attempts,
    output: {
      success: false,
      message: last?.message || 'Mock execution failed',
      attempts: attempts.length,
    },
    error: last?.message || ErrorCodes.ACTION_EXECUTION_FAILED,
  };
}
