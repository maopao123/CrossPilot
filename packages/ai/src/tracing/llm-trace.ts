import { SecretProvider } from '@crosspilot/integrations';
import { LlmResult } from '../contracts/llm.types.js';

export interface FormattedLlmTrace {
  traceId: string;
  provider: string;
  model: string;
  promptVersion?: string;
  latencyMs: number;
  tokens: {
    input: number | null;
    output: number | null;
    total: number | null;
  };
  retryCount: number;
  finishReason?: string;
  status: 'SUCCEEDED' | 'FAILED';
  error?: string;
}

export class LlmTraceLogger {
  static formatTrace(result: LlmResult, status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED', error?: string): FormattedLlmTrace {
    return {
      traceId: result.traceId,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
      tokens: {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
        total: result.usage.totalTokens,
      },
      retryCount: result.retryCount,
      finishReason: result.finishReason,
      status,
      error: error ? SecretProvider.redact(error) : undefined,
    };
  }
}
