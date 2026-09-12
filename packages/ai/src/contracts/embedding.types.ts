/**
 * CrossPilot Embedding & RAG Error Contracts
 */

export const RagErrorCode = {
  RAG_EMBEDDING_ERROR: 'RAG_EMBEDDING_ERROR',
  RAG_VECTOR_STORE_UNAVAILABLE: 'RAG_VECTOR_STORE_UNAVAILABLE',
  RAG_DIMENSION_MISMATCH: 'RAG_DIMENSION_MISMATCH',
  RAG_NO_RESULTS: 'RAG_NO_RESULTS',
  RAG_COLLECTION_MISSING: 'RAG_COLLECTION_MISSING',
} as const;

export type RagErrorCode = (typeof RagErrorCode)[keyof typeof RagErrorCode];

export class RagError extends Error {
  readonly code: RagErrorCode;
  readonly retryable?: boolean;
  readonly details?: unknown;
  readonly status?: number;

  constructor(
    code: RagErrorCode,
    message: string,
    options?: { retryable?: boolean; details?: unknown; status?: number },
  ) {
    super(message);
    this.name = 'RagError';
    this.code = code;
    this.retryable = options?.retryable;
    this.details = options?.details;
    this.status = options?.status;
    Object.setPrototypeOf(this, RagError.prototype);
  }
}

export interface EmbeddingUsage {
  promptTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
}

export interface EmbeddingResult {
  embedding: number[];
  usage?: EmbeddingUsage;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  usage?: EmbeddingUsage;
}

export interface EmbeddingProviderConfig {
  provider: string; // e.g. 'dashscope'
  model: string; // e.g. 'text-embedding-v3'
  dimension: number; // e.g. 1024
  version: string; // e.g. 'dashscope-v3-1024'
  baseUrl?: string;
  timeoutMs?: number;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly name: string;
  getConfig(): EmbeddingProviderConfig;
  embedText(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
}

export interface EmbeddingRuntime {
  embedText(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
  getConfig(): EmbeddingProviderConfig;
}
