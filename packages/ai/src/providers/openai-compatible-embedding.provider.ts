import { SecretProvider } from '@crosspilot/integrations';
import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  RagError,
  RagErrorCode,
} from '../contracts/embedding.types.js';

export interface OpenAiCompatibleEmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimension?: number;
  version?: string;
  timeoutMs?: number;
  maxBatchSize?: number;
}

export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai-compatible-embeddings';
  readonly name = 'OpenAI-Compatible Embedding Provider';

  private readonly config: Required<EmbeddingProviderConfig> & {
    apiKey: string;
    maxBatchSize: number;
  };

  constructor(options: OpenAiCompatibleEmbeddingConfig = {}) {
    const apiKey =
      options.apiKey ||
      SecretProvider.getSecret('EMBEDDING_API_KEY') ||
      SecretProvider.getSecret('DASHSCOPE_API_KEY') ||
      SecretProvider.getSecret('OPENAI_API_KEY') ||
      '';

    const baseUrl =
      options.baseUrl ||
      SecretProvider.getSecret('EMBEDDING_BASE_URL') ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1';

    const model =
      options.model ||
      SecretProvider.getSecret('EMBEDDING_MODEL') ||
      'text-embedding-v3';

    const dimension =
      options.dimension ||
      Number(SecretProvider.getSecret('EMBEDDING_DIMENSIONS') || 1024);

    const version =
      options.version ||
      SecretProvider.getSecret('EMBEDDING_VERSION') ||
      `${model}-${dimension}`;

    const timeoutMs = options.timeoutMs || 10000;
    const maxBatchSize = options.maxBatchSize || 20;

    this.config = {
      provider: 'openai-compatible',
      apiKey,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      model,
      dimension,
      version,
      timeoutMs,
      maxBatchSize,
    };
  }

  getConfig(): EmbeddingProviderConfig {
    return {
      provider: this.config.provider,
      model: this.config.model,
      dimension: this.config.dimension,
      version: this.config.version,
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
    };
  }

  private async executeFetchWithRetry(
    bodyPayload: Record<string, unknown>,
    attempt = 1,
    maxAttempts = 3,
  ): Promise<any> {
    if (!this.config.apiKey) {
      throw new RagError(
        RagErrorCode.RAG_EMBEDDING_ERROR,
        'Embedding API key is not configured. Set EMBEDDING_API_KEY or DASHSCOPE_API_KEY.',
        { retryable: false },
      );
    }

    const endpoint = `${this.config.baseUrl}/embeddings`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const retryable = response.status === 429 || response.status >= 500;

        if (retryable && attempt < maxAttempts) {
          const delay = Math.min(2000, Math.pow(2, attempt) * 250);
          await new Promise((r) => setTimeout(r, delay));
          return this.executeFetchWithRetry(bodyPayload, attempt + 1, maxAttempts);
        }

        throw new RagError(
          RagErrorCode.RAG_EMBEDDING_ERROR,
          `Embedding Provider returned HTTP ${response.status}: ${SecretProvider.redact(errorText)}`,
          { retryable, status: response.status, details: errorText },
        );
      }

      return await response.json();
    } catch (err: any) {
      clearTimeout(timer);
      if (err instanceof RagError) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new RagError(
          RagErrorCode.RAG_EMBEDDING_ERROR,
          `Embedding request timed out after ${this.config.timeoutMs}ms`,
          { retryable: true },
        );
      }
      if (attempt < maxAttempts) {
        const delay = Math.min(2000, Math.pow(2, attempt) * 250);
        await new Promise((r) => setTimeout(r, delay));
        return this.executeFetchWithRetry(bodyPayload, attempt + 1, maxAttempts);
      }
      throw new RagError(
        RagErrorCode.RAG_EMBEDDING_ERROR,
        `Embedding network error: ${SecretProvider.redact(err.message || 'Unknown network error')}`,
        { retryable: true, details: err },
      );
    }
  }

  async embedText(text: string): Promise<EmbeddingResult> {
    const json = await this.executeFetchWithRetry({
      model: this.config.model,
      input: text,
      dimensions: this.config.dimension,
    });

    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      throw new RagError(
        RagErrorCode.RAG_EMBEDDING_ERROR,
        'Invalid response format from embedding provider: missing data array',
      );
    }

    const item = json.data[0];
    const embedding = item.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new RagError(
        RagErrorCode.RAG_EMBEDDING_ERROR,
        'Embedding vector is missing or empty in provider response',
      );
    }

    if (embedding.length !== this.config.dimension) {
      // Some models (like DashScope text-embedding-v3) default to 1024
      // Record mismatch if severe
      if (Math.abs(embedding.length - this.config.dimension) > 0) {
        this.config.dimension = embedding.length;
      }
    }

    return {
      embedding,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? null,
            totalTokens: json.usage.total_tokens ?? null,
            costUsd: null, // Prohibit estimated fake USD cost
          }
        : undefined,
    };
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [] };
    }

    // Process in batches if texts exceed maxBatchSize
    const allEmbeddings: number[][] = [];
    let promptTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += this.config.maxBatchSize) {
      const batch = texts.slice(i, i + this.config.maxBatchSize);
      const json = await this.executeFetchWithRetry({
        model: this.config.model,
        input: batch,
        dimensions: this.config.dimension,
      });

      if (!json.data || !Array.isArray(json.data)) {
        throw new RagError(
          RagErrorCode.RAG_EMBEDDING_ERROR,
          'Invalid response format from batch embedding provider',
        );
      }

      // Sort by index to maintain original order
      const sorted = [...json.data].sort(
        (a: any, b: any) => (a.index ?? 0) - (b.index ?? 0),
      );

      for (const item of sorted) {
        allEmbeddings.push(item.embedding);
      }

      if (json.usage) {
        promptTokens += json.usage.prompt_tokens || 0;
        totalTokens += json.usage.total_tokens || 0;
      }
    }

    return {
      embeddings: allEmbeddings,
      usage: {
        promptTokens: promptTokens || null,
        totalTokens: totalTokens || null,
        costUsd: null,
      },
    };
  }
}
