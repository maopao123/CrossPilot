import {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingRuntime,
} from '../contracts/embedding.types.js';
import { OpenAiCompatibleEmbeddingProvider } from '../providers/openai-compatible-embedding.provider.js';

export class PlatformEmbeddingRuntime implements EmbeddingRuntime {
  private static instance: PlatformEmbeddingRuntime | null = null;
  private provider: EmbeddingProvider;

  constructor(provider?: EmbeddingProvider) {
    this.provider = provider || new OpenAiCompatibleEmbeddingProvider();
  }

  static getInstance(): PlatformEmbeddingRuntime {
    if (!this.instance) {
      this.instance = new PlatformEmbeddingRuntime();
    }
    return this.instance;
  }

  static setInstance(runtime: PlatformEmbeddingRuntime): void {
    this.instance = runtime;
  }

  static resetInstance(): void {
    this.instance = null;
  }

  setProvider(provider: EmbeddingProvider): void {
    this.provider = provider;
  }

  getConfig(): EmbeddingProviderConfig {
    return this.provider.getConfig();
  }

  async embedText(text: string): Promise<EmbeddingResult> {
    return this.provider.embedText(text);
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    return this.provider.embedBatch(texts);
  }
}
