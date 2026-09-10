import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { ServiceHealthItem } from '@crosspilot/shared';
import { VectorRecord, VectorSearchResult, VectorStore } from './vector-store.interface.js';

export interface MilvusConfig {
  address?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
}

export class MilvusVectorStore implements VectorStore {
  private client: MilvusClient | null = null;
  private readonly config: MilvusConfig;

  constructor(config: MilvusConfig = {}) {
    this.config = {
      address: config.address || process.env.MILVUS_ADDRESS || 'localhost:19530',
      username: config.username || process.env.MILVUS_USERNAME,
      password: config.password || process.env.MILVUS_PASSWORD,
      timeoutMs: config.timeoutMs || 2000,
    };
  }

  public async connect(): Promise<void> {
    if (!this.client) {
      this.client = new MilvusClient({
        address: this.config.address || 'localhost:19530',
        username: this.config.username,
        password: this.config.password,
        timeout: this.config.timeoutMs,
      });
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.closeConnection();
      } catch {
        // ignore disconnect error
      }
      this.client = null;
    }
  }

  public async healthCheck(): Promise<ServiceHealthItem> {
    const start = Date.now();
    try {
      if (!this.client) {
        await this.connect();
      }
      const res = await this.client!.checkHealth();
      const latencyMs = Date.now() - start;

      if (res && res.isHealthy) {
        return {
          status: 'up',
          latencyMs,
          message: 'Milvus is healthy',
        };
      }
      return {
        status: 'down',
        latencyMs,
        message: res?.reasons?.join('; ') || 'Milvus reported unhealthy state',
      };
    } catch (error: any) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error?.message || 'Milvus connection failed',
      };
    }
  }

  public async insert(collectionName: string, vectors: VectorRecord[]): Promise<void> {
    if (!this.client) {
      await this.connect();
    }
    await this.client!.insert({
      collection_name: collectionName,
      data: vectors.map((v) => ({
        id: v.id,
        vector: v.vector,
        ...v.metadata,
      })),
    });
  }

  public async search(
    collectionName: string,
    vector: number[],
    topK: number,
  ): Promise<VectorSearchResult[]> {
    if (!this.client) {
      await this.connect();
    }
    const result = await this.client!.search({
      collection_name: collectionName,
      vector,
      limit: topK,
      output_fields: ['id', 'metadata'],
    });

    if (!result || !result.results) {
      return [];
    }

    return result.results.map((r: any) => ({
      id: String(r.id),
      score: Number(r.score || 0),
      metadata: r.metadata,
    }));
  }
}
