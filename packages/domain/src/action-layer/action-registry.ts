import { ErrorCodes, type CommerceActionType } from '@crosspilot/shared';
import { ActionLayerError } from './action-layer.error.js';

export interface MockToolContext {
  actionType: CommerceActionType;
  target: Record<string, unknown>;
  parameters: Record<string, unknown>;
  attempt: number;
}

export interface MockToolResult {
  success: boolean;
  message: string;
  retryable?: boolean;
  data?: Record<string, unknown>;
}

export type MockToolFn = (ctx: MockToolContext) => Promise<MockToolResult>;

const ACTION_TYPES: CommerceActionType[] = [
  'DECREASE_BID',
  'UPDATE_INVENTORY',
  'GENERATE_REPORT',
  'STOP_CAMPAIGN',
  'CHANGE_PRICE',
  'DELETE_LISTING',
];

export function isCommerceActionType(value: string): value is CommerceActionType {
  return (ACTION_TYPES as string[]).includes(value);
}

export class ActionToolRegistry {
  private readonly tools = new Map<CommerceActionType, MockToolFn>();

  register(actionType: CommerceActionType, tool: MockToolFn): void {
    this.tools.set(actionType, tool);
  }

  get(actionType: CommerceActionType): MockToolFn {
    const tool = this.tools.get(actionType);
    if (!tool) {
      throw new ActionLayerError(
        ErrorCodes.ACTION_TYPE_UNKNOWN,
        `No mock tool registered for ${actionType}`,
      );
    }
    return tool;
  }

  list(): CommerceActionType[] {
    return [...this.tools.keys()];
  }
}

function mockOutcome(parameters: Record<string, unknown>): string | undefined {
  const value = parameters.mockOutcome;
  return typeof value === 'string' ? value : undefined;
}

async function defaultMock(ctx: MockToolContext, successMessage: string): Promise<MockToolResult> {
  const outcome = mockOutcome(ctx.parameters);
  if (outcome === 'fail') {
    return { success: false, message: `Mock ${ctx.actionType} failed`, retryable: false };
  }
  if (outcome === 'timeout') {
    if (ctx.attempt < 2) {
      return { success: false, message: `Mock ${ctx.actionType} timed out`, retryable: true };
    }
    return { success: true, message: `${successMessage} after retry`, data: { retried: true } };
  }
  return { success: true, message: successMessage };
}

export function createDefaultMockRegistry(): ActionToolRegistry {
  const registry = new ActionToolRegistry();
  registry.register('DECREASE_BID', (ctx) =>
    defaultMock(ctx, `Mock bid decreased ${Number(ctx.parameters.percentage) || 0}%`),
  );
  registry.register('UPDATE_INVENTORY', (ctx) =>
    defaultMock(ctx, `Mock inventory updated to ${Number(ctx.parameters.quantity) || 0}`),
  );
  registry.register('GENERATE_REPORT', (ctx) =>
    defaultMock(ctx, `Mock report generated: ${String(ctx.parameters.reportType || 'ops')}`),
  );
  registry.register('STOP_CAMPAIGN', (ctx) =>
    defaultMock(ctx, `Mock campaign stopped: ${String(ctx.target.campaignId || '')}`),
  );
  registry.register('CHANGE_PRICE', (ctx) =>
    defaultMock(ctx, `Mock price changed ${Number(ctx.parameters.percentage) || 0}%`),
  );
  registry.register('DELETE_LISTING', (ctx) =>
    defaultMock(ctx, `Mock listing delete recorded for ${String(ctx.target.skuCode || '')}`),
  );
  return registry;
}
