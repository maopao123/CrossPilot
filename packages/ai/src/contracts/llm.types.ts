import { z } from 'zod';

export const LlmErrorCode = {
  LLM_AUTH_ERROR: 'LLM_AUTH_ERROR',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_RATE_LIMIT: 'LLM_RATE_LIMIT',
  LLM_PROVIDER_UNAVAILABLE: 'LLM_PROVIDER_UNAVAILABLE',
  LLM_INVALID_OUTPUT: 'LLM_INVALID_OUTPUT',
  LLM_CONTEXT_TOO_LONG: 'LLM_CONTEXT_TOO_LONG',
  LLM_UNKNOWN_ERROR: 'LLM_UNKNOWN_ERROR',
} as const;

export type LlmErrorCode = (typeof LlmErrorCode)[keyof typeof LlmErrorCode];

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable?: boolean;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    code: LlmErrorCode,
    message: string,
    options?: { retryable?: boolean; details?: unknown; status?: number },
  ) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = options?.retryable;
    this.details = options?.details;
    this.status = options?.status;
    Object.setPrototypeOf(this, LlmError.prototype);
  }
}

export interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface LlmRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface LlmRequest<TInput = any, TOutput = any> {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  contextInput?: TInput;
  outputSchema?: z.ZodSchema<TOutput>;
  outputSchemaDescription?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  retryPolicy?: LlmRetryPolicy;
  repairAttempts?: number;
  promptVersion?: string;
}

export interface LlmResult<TOutput = any> {
  output: TOutput;
  rawText: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
  finishReason?: string;
  traceId: string;
  retryCount: number;
  promptVersion?: string;
}

export interface LlmProvider {
  readonly id: string;
  readonly name: string;
  generateText<TOutput = any>(
    request: LlmRequest<any, TOutput>,
    ctx: { traceId: string },
  ): Promise<LlmResult<TOutput>>;
}

export interface LlmRuntime {
  generateText<TInput = any, TOutput = any>(
    request: LlmRequest<TInput, TOutput>,
    ctx?: { traceId?: string; workspaceId?: string },
  ): Promise<LlmResult<TOutput>>;
}
