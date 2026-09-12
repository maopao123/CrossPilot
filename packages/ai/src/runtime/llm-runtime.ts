import { SecretProvider } from '@crosspilot/integrations';
import {
  LlmError,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmRuntime,
} from '../contracts/llm.types.js';
import { OpenAiCompatibleProvider } from '../providers/openai-compatible.provider.js';

export interface PlatformLlmRuntimeOptions {
  provider?: LlmProvider;
  defaultProviderId?: string;
}

export class PlatformLlmRuntime implements LlmRuntime {
  private static instance: PlatformLlmRuntime;
  private providers = new Map<string, LlmProvider>();
  private defaultProviderId = 'openai-compatible';

  constructor(options?: PlatformLlmRuntimeOptions) {
    if (options?.provider) {
      this.registerProvider(options.provider, true);
    } else {
      this.registerProvider(new OpenAiCompatibleProvider());
    }
    if (options?.defaultProviderId) {
      this.defaultProviderId = options.defaultProviderId;
    }
  }

  static getInstance(): PlatformLlmRuntime {
    if (!PlatformLlmRuntime.instance) {
      PlatformLlmRuntime.instance = new PlatformLlmRuntime();
    }
    return PlatformLlmRuntime.instance;
  }

  registerProvider(provider: LlmProvider, isDefault = false): void {
    this.providers.set(provider.id, provider);
    if (isDefault || !this.providers.has(this.defaultProviderId)) {
      this.defaultProviderId = provider.id;
    }
  }

  getProvider(providerId?: string): LlmProvider {
    const id = providerId || this.defaultProviderId;
    const provider = this.providers.get(id);
    if (!provider) {
      throw {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message: `LLM Provider '${id}' is not registered in runtime.`,
        retryable: false,
      } as LlmError;
    }
    return provider;
  }

  async generateText<TInput = any, TOutput = any>(
    request: LlmRequest<TInput, TOutput>,
    ctx?: { traceId?: string; workspaceId?: string },
  ): Promise<LlmResult<TOutput>> {
    const traceId =
      ctx?.traceId ||
      `llm_tr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const provider = this.getProvider();

    const retryPolicy = request.retryPolicy || {
      maxAttempts: 3,
      backoffMs: 1000,
    };

    let attempt = 0;
    let lastError: LlmError | null = null;

    while (attempt < retryPolicy.maxAttempts) {
      attempt++;
      try {
        const rawResult = await provider.generateText<TOutput>(request, { traceId });

        // If schema is provided, perform strict Zod validation
        if (request.outputSchema) {
          const parseResult = request.outputSchema.safeParse(rawResult.output);
          if (!parseResult.success) {
            // Attempt 1-pass controlled repair if repairAttempts > 0
            const allowRepair = (request.repairAttempts ?? 1) > 0;
            if (allowRepair) {
              const repairedResult = await this.attemptOutputRepair(
                request,
                rawResult.rawText,
                parseResult.error.errors,
                provider,
                traceId,
              );
              if (repairedResult) {
                return {
                  ...repairedResult,
                  retryCount: (attempt - 1) + 1,
                };
              }
            }

            throw {
              code: 'LLM_INVALID_OUTPUT',
              message: `LLM output failed schema validation: ${parseResult.error.message}`,
              details: {
                zodIssues: parseResult.error.issues,
                rawOutput: rawResult.output,
              },
              retryable: false,
            } as LlmError;
          }

          return {
            ...rawResult,
            output: parseResult.data,
            retryCount: attempt - 1,
          };
        }

        return {
          ...rawResult,
          retryCount: attempt - 1,
        };
      } catch (err: any) {
        const normalized: LlmError = err.code && err.code.startsWith('LLM_')
          ? err
          : {
              code: 'LLM_UNKNOWN_ERROR',
              message: SecretProvider.redact(err.message || 'Unknown LLM execution error'),
              retryable: false,
              details: err,
            };

        lastError = normalized;

        // Bounded retry check: only retry if explicitly marked retryable and attempts remaining
        if (normalized.retryable && attempt < retryPolicy.maxAttempts) {
          const waitMs = retryPolicy.backoffMs * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        throw normalized;
      }
    }

    throw lastError || {
      code: 'LLM_PROVIDER_UNAVAILABLE',
      message: 'LLM execution exhausted all retry attempts.',
      retryable: false,
    };
  }

  /**
   * 1-Pass Controlled Repair for malformed JSON or schema violation
   */
  private async attemptOutputRepair<TOutput>(
    originalRequest: LlmRequest<any, TOutput>,
    rawText: string,
    errors: any[],
    provider: LlmProvider,
    traceId: string,
  ): Promise<LlmResult<TOutput> | null> {
    try {
      const repairPrompt = `Your previous output did not conform to the expected JSON schema.
Validation errors encountered:
${JSON.stringify(errors, null, 2)}

Previous Output:
${rawText}

Please correct the JSON output so that all fields strictly follow the required types and constraints.
Respond ONLY with the corrected valid JSON object.`;

      const repairRequest: LlmRequest<any, TOutput> = {
        systemPrompt: 'You are an expert JSON output repair assistant. Output strictly valid JSON conforming to the requested schema.',
        userPrompt: repairPrompt,
        outputSchema: originalRequest.outputSchema,
        temperature: 0.1,
        timeoutMs: 15000,
        repairAttempts: 0, // Prevent infinite repair recursion
        promptVersion: `${originalRequest.promptVersion || 'prompt'}.repair.v1`,
      };

      const repairRes = await provider.generateText<TOutput>(repairRequest, { traceId: `${traceId}_repair` });
      if (originalRequest.outputSchema) {
        const recheck = originalRequest.outputSchema.safeParse(repairRes.output);
        if (recheck.success) {
          return {
            ...repairRes,
            output: recheck.data,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
