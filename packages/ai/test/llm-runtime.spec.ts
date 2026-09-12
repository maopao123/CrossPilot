import { z } from 'zod';
import {
  PlatformLlmRuntime,
  LlmProvider,
  LlmRequest,
  LlmResult,
  OpenAiCompatibleProvider,
  ListingOutputStructuredSchema,
  ListingPromptBuilder,
} from '../src/index.js';

class MockTestLlmProvider implements LlmProvider {
  readonly id = 'mock-test-provider';
  readonly name = 'Mock Test Provider';

  public calls: Array<LlmRequest<any, any>> = [];
  public mockResponseText = '{"title": "Test Title", "bulletPoints": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"], "description": "Test description text here", "searchTerms": "test terms", "imageBriefs": [{"slot": 1, "objective": "Main Image", "keyMessage": "Key Msg", "visualDirection": "Studio white"}], "claims": [{"claim": "Claim 1", "factIds": ["f1"]}]}';
  public shouldFailWithCode: string | null = null;
  public failAttemptsCount = 0;

  async generateText<TOutput = any>(
    request: LlmRequest<any, TOutput>,
    ctx: { traceId: string },
  ): Promise<LlmResult<TOutput>> {
    this.calls.push(request);

    if (this.shouldFailWithCode) {
      if (this.failAttemptsCount > 0) {
        this.failAttemptsCount--;
        const isRetryable =
          this.shouldFailWithCode === 'LLM_RATE_LIMIT' ||
          this.shouldFailWithCode === 'LLM_TIMEOUT' ||
          this.shouldFailWithCode === 'LLM_PROVIDER_UNAVAILABLE';
        throw {
          code: this.shouldFailWithCode,
          message: `Simulated error ${this.shouldFailWithCode}`,
          retryable: isRetryable,
        };
      }
    }

    const output = request.outputSchema
      ? JSON.parse(this.mockResponseText)
      : (this.mockResponseText as any);

    return {
      output,
      rawText: this.mockResponseText,
      provider: this.id,
      model: request.model || 'mock-model',
      latencyMs: 42,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: null,
      },
      traceId: ctx.traceId,
      retryCount: 0,
      promptVersion: request.promptVersion,
    };
  }
}

describe('Epic 1: Unified LLM Runtime Suite', () => {
  it('should dispatch request through runtime and return structured output', async () => {
    const runtime = new PlatformLlmRuntime();
    const mockProvider = new MockTestLlmProvider();
    runtime.registerProvider(mockProvider, true);

    const schema = z.object({
      title: z.string(),
      score: z.number(),
    });

    mockProvider.mockResponseText = JSON.stringify({ title: 'Grounded Item', score: 95 });

    const res = await runtime.generateText({
      systemPrompt: 'System instruction',
      userPrompt: 'User prompt',
      outputSchema: schema,
    });

    expect(res.output).toEqual({ title: 'Grounded Item', score: 95 });
    expect(res.usage.inputTokens).toBe(100);
    expect(res.usage.estimatedCostUsd).toBeNull();
    expect(res.provider).toBe('mock-test-provider');
  });

  it('should retry bounded attempts on retryable rate limit or timeout and succeed', async () => {
    const runtime = new PlatformLlmRuntime();
    const mockProvider = new MockTestLlmProvider();
    mockProvider.shouldFailWithCode = 'LLM_RATE_LIMIT';
    mockProvider.failAttemptsCount = 2; // Fail twice then succeed
    runtime.registerProvider(mockProvider, true);

    const res = await runtime.generateText({
      systemPrompt: 'System',
      userPrompt: 'User',
      retryPolicy: { maxAttempts: 3, backoffMs: 10 },
    });

    expect(res.output).toBeDefined();
    expect(res.retryCount).toBe(2);
    expect(mockProvider.calls.length).toBe(3);
  });

  it('should NOT retry on non-retryable authentication error', async () => {
    const runtime = new PlatformLlmRuntime();
    const mockProvider = new MockTestLlmProvider();
    mockProvider.shouldFailWithCode = 'LLM_AUTH_ERROR';
    mockProvider.failAttemptsCount = 3;
    runtime.registerProvider(mockProvider, true);

    await expect(
      runtime.generateText({
        systemPrompt: 'System',
        userPrompt: 'User',
        retryPolicy: { maxAttempts: 3, backoffMs: 10 },
      }),
    ).rejects.toMatchObject({
      code: 'LLM_AUTH_ERROR',
      retryable: false,
    });

    expect(mockProvider.calls.length).toBe(1); // Exactly 1 call, zero retry
  });

  it('should perform 1-pass controlled repair on invalid schema output', async () => {
    const runtime = new PlatformLlmRuntime();
    const mockProvider = new MockTestLlmProvider();
    runtime.registerProvider(mockProvider, true);

    const schema = z.object({
      age: z.number(),
    });

    // First response has invalid type (string instead of number)
    mockProvider.mockResponseText = JSON.stringify({ age: 'twenty' });

    // When repair is called, provider can return valid JSON
    let callCount = 0;
    jest.spyOn(mockProvider, 'generateText').mockImplementation(async (req, ctx) => {
      callCount++;
      if (callCount === 1) {
        return {
          output: { age: 'twenty' },
          rawText: '{"age": "twenty"}',
          provider: mockProvider.id,
          model: 'mock-model',
          latencyMs: 20,
          usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70, estimatedCostUsd: null },
          traceId: ctx.traceId,
          retryCount: 0,
        };
      }
      // Repaired output
      return {
        output: { age: 20 },
        rawText: '{"age": 20}',
        provider: mockProvider.id,
        model: 'mock-model',
        latencyMs: 20,
        usage: { inputTokens: 60, outputTokens: 10, totalTokens: 70, estimatedCostUsd: null },
        traceId: ctx.traceId,
        retryCount: 0,
      };
    });

    const res = await runtime.generateText({
      systemPrompt: 'Sys',
      userPrompt: 'User',
      outputSchema: schema,
      repairAttempts: 1,
    });

    expect(res.output).toEqual({ age: 20 });
    expect(callCount).toBe(2);
  });

  it('should throw LLM_INVALID_OUTPUT if output still fails schema validation after repair', async () => {
    const runtime = new PlatformLlmRuntime();
    const mockProvider = new MockTestLlmProvider();
    mockProvider.mockResponseText = JSON.stringify({ wrongField: true });
    runtime.registerProvider(mockProvider, true);

    const schema = z.object({
      requiredNumber: z.number(),
    });

    await expect(
      runtime.generateText({
        systemPrompt: 'Sys',
        userPrompt: 'User',
        outputSchema: schema,
        repairAttempts: 0,
      }),
    ).rejects.toMatchObject({
      code: 'LLM_INVALID_OUTPUT',
      retryable: false,
    });
  });

  it('ListingPromptBuilder should build compliant prompt with version and fact boundaries', () => {
    const prompt = ListingPromptBuilder.buildPrompt({
      brand: 'POLEGAS',
      productName: 'Natural Marble Toothbrush Holder',
      marketplace: 'AMAZON_US',
      locale: 'en-US',
      features: [
        { id: 'f-1', name: 'Material', value: 'Natural Carrara Marble', isCore: true },
        { id: 'f-2', name: 'Weight', value: '3.57 lbs', isCore: true },
      ],
      marketplaceProfile: {
        titleMaxLength: 200,
        bulletsCount: 5,
        searchTermsMaxLength: 250,
        forbiddenPatterns: ['#1 Best Seller', 'FDA Approved'],
      },
    });

    expect(prompt.promptVersion).toBe('listing.generate.v2-rag');
    expect(prompt.systemPrompt).toContain('CRITICAL FACT BOUNDARY');
    expect(prompt.systemPrompt).toContain('STRICT FACT GROUNDING');
    expect(prompt.userPrompt).toContain('Natural Carrara Marble');
    expect(prompt.userPrompt).toContain('3.57 lbs');
  });
});
