import { SecretProvider } from '@crosspilot/integrations';
import {
  LlmError,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmUsage,
} from '../contracts/llm.types.js';

export interface OpenAiCompatibleConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai-compatible';
  readonly name = 'OpenAI-Compatible Model Gateway';

  constructor(private readonly config: OpenAiCompatibleConfig = {}) {}

  private resolveApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      SecretProvider.getSecret('LLM_API_KEY') ||
      SecretProvider.getSecret('DEEPSEEK_API_KEY') ||
      SecretProvider.getSecret('OPENAI_API_KEY')
    );
  }

  private resolveBaseUrl(): string {
    const customUrl =
      this.config.baseUrl ||
      SecretProvider.getSecret('LLM_BASE_URL') ||
      SecretProvider.getSecret('DEEPSEEK_BASE_URL');
    if (customUrl) return customUrl.replace(/\/+$/, '');

    // Default inference based on available key
    if (SecretProvider.getSecret('DEEPSEEK_API_KEY')) {
      return 'https://api.deepseek.com';
    }
    return 'https://api.openai.com/v1';
  }

  private resolveModel(requestedModel?: string): string {
    if (requestedModel && requestedModel.trim()) return requestedModel.trim();
    if (this.config.defaultModel) return this.config.defaultModel;

    const envModel =
      SecretProvider.getSecret('LLM_MODEL') ||
      SecretProvider.getSecret('DEEPSEEK_MODEL');
    if (envModel) return envModel;

    // Default to deepseek-chat if deepseek is configured, otherwise gpt-4o-mini
    if (this.resolveBaseUrl().includes('deepseek')) {
      return 'deepseek-chat';
    }
    return 'gpt-4o-mini';
  }

  async generateText<TOutput = any>(
    request: LlmRequest<any, TOutput>,
    ctx: { traceId: string },
  ): Promise<LlmResult<TOutput>> {
    const startTime = Date.now();
    const apiKey = this.resolveApiKey();

    if (!apiKey) {
      throw {
        code: 'LLM_AUTH_ERROR',
        message: 'No LLM API key configured. Provide LLM_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY.',
        retryable: false,
      } as LlmError;
    }

    const baseUrl = this.resolveBaseUrl();
    const model = this.resolveModel(request.model);
    const timeoutMs = request.timeoutMs || this.config.timeoutMs || 30000;

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];

    const bodyPayload: Record<string, unknown> = {
      model,
      messages,
      temperature: request.temperature ?? 0.3,
    };

    if (request.maxTokens) {
      bodyPayload.max_tokens = request.maxTokens;
    }

    if (request.outputSchema) {
      bodyPayload.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        let errBody = '';
        try {
          errBody = await response.text();
        } catch {
          // ignore
        }

        const redactedErr = SecretProvider.redact(errBody);
        const status = response.status;

        if (status === 401 || status === 403) {
          throw {
            code: 'LLM_AUTH_ERROR',
            message: `LLM Authentication failed (${status}): ${redactedErr}`,
            retryable: false,
            status,
          } as LlmError;
        }

        if (status === 429) {
          throw {
            code: 'LLM_RATE_LIMIT',
            message: `LLM Rate limit reached (${status}): ${redactedErr}`,
            retryable: true,
            status,
          } as LlmError;
        }

        if (status >= 500) {
          throw {
            code: 'LLM_PROVIDER_UNAVAILABLE',
            message: `LLM Provider server error (${status}): ${redactedErr}`,
            retryable: true,
            status,
          } as LlmError;
        }

        if (status === 400 && redactedErr.toLowerCase().includes('context_length')) {
          throw {
            code: 'LLM_CONTEXT_TOO_LONG',
            message: `LLM Context length exceeded: ${redactedErr}`,
            retryable: false,
            status,
          } as LlmError;
        }

        throw {
          code: 'LLM_UNKNOWN_ERROR',
          message: `LLM Provider error (${status}): ${redactedErr}`,
          retryable: false,
          status,
        } as LlmError;
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;
      const rawText = data?.choices?.[0]?.message?.content || '';
      const finishReason = data?.choices?.[0]?.finish_reason;

      const rawUsage = data?.usage;
      const usage: LlmUsage = {
        inputTokens: typeof rawUsage?.prompt_tokens === 'number' ? rawUsage.prompt_tokens : null,
        outputTokens: typeof rawUsage?.completion_tokens === 'number' ? rawUsage.completion_tokens : null,
        totalTokens: typeof rawUsage?.total_tokens === 'number' ? rawUsage.total_tokens : null,
        estimatedCostUsd: null, // Strict Cost Grounding: null unless official pricing table is loaded
      };

      let output: any = rawText;
      if (request.outputSchema) {
        try {
          const parsed = JSON.parse(rawText);
          output = parsed;
        } catch (jsonErr: any) {
          throw {
            code: 'LLM_INVALID_OUTPUT',
            message: `Failed to parse LLM response as JSON: ${jsonErr.message}`,
            details: { rawText },
            retryable: false,
          } as LlmError;
        }
      }

      return {
        output,
        rawText,
        provider: this.id,
        model,
        latencyMs,
        usage,
        finishReason,
        traceId: ctx.traceId,
        retryCount: 0,
        promptVersion: request.promptVersion,
      };
    } catch (err: any) {
      clearTimeout(timer);

      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw {
          code: 'LLM_TIMEOUT',
          message: `LLM request timed out after ${timeoutMs}ms`,
          retryable: true,
        } as LlmError;
      }

      if (err.code && err.code.startsWith('LLM_')) {
        throw err;
      }

      throw {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message: `Network/Fetch error connecting to LLM provider: ${err.message}`,
        retryable: true,
        details: { originalError: err.message },
      } as LlmError;
    }
  }
}
