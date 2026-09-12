import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
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
      const sdk = await import('@zilliz/milvus2-sdk-node');
      const ClientClass = sdk.MilvusClient || (sdk as any).default?.MilvusClient;
      this.client = new ClientClass({
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

  public async hasCollection(collectionName: string): Promise<boolean> {
    if (!this.client) {
      await this.connect();
    }
    const res = await this.client!.hasCollection({ collection_name: collectionName });
    return Boolean(res?.value);
  }

  public async initKnowledgeCollection(
    collectionName = 'listing_knowledge_chunks',
    dim = 1024,
  ): Promise<void> {
    if (!this.client) {
      await this.connect();
    }
    const exists = await this.hasCollection(collectionName);
    if (!exists) {
      const sdk = await import('@zilliz/milvus2-sdk-node');
      const DataType = sdk.DataType || (sdk as any).default?.DataType;
      await this.client!.createCollection({
        collection_name: collectionName,
        fields: [
          { name: 'id', data_type: DataType.VarChar, is_primary_key: true, max_length: 128 },
          { name: 'vector', data_type: DataType.FloatVector, dim },
          { name: 'documentId', data_type: DataType.VarChar, max_length: 128 },
          { name: 'knowledgeType', data_type: DataType.VarChar, max_length: 32 },
          { name: 'sourceType', data_type: DataType.VarChar, max_length: 64 },
          { name: 'marketplace', data_type: DataType.VarChar, max_length: 32 },
          { name: 'category', data_type: DataType.VarChar, max_length: 64 },
          { name: 'source', data_type: DataType.VarChar, max_length: 128 },
          { name: 'title', data_type: DataType.VarChar, max_length: 256 },
          { name: 'content', data_type: DataType.VarChar, max_length: 4096 },
          { name: 'embeddingVersion', data_type: DataType.VarChar, max_length: 64 },
          { name: 'checksum', data_type: DataType.VarChar, max_length: 64 },
        ],
      });
      await this.client!.createIndex({
        collection_name: collectionName,
        field_name: 'vector',
        index_type: 'HNSW',
        metric_type: 'COSINE',
        params: { M: 8, efConstruction: 64 },
      });
    }
    await this.client!.loadCollectionSync({ collection_name: collectionName });
  }

  public async flush(collectionName: string): Promise<void> {
    if (!this.client) {
      await this.connect();
    }
    await this.client!.flushSync({ collection_names: [collectionName] });
  }

  public async delete(collectionName: string, ids: string[]): Promise<void> {
    if (!this.client || ids.length === 0) {
      return;
    }
    await this.client!.delete({
      collection_name: collectionName,
      ids,
    });
  }

  public async dropCollection(collectionName: string): Promise<void> {
    if (!this.client) {
      await this.connect();
    }
    const exists = await this.hasCollection(collectionName);
    if (exists) {
      try {
        await this.client!.releaseCollection({ collection_name: collectionName });
      } catch {
        // ignore if not loaded
      }
      await this.client!.dropCollection({ collection_name: collectionName });
    }
  }

  public async insert(collectionName: string, vectors: VectorRecord[]): Promise<void> {
    if (vectors.length === 0) return;
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
    filterExpr?: string,
    outputFields?: string[],
  ): Promise<VectorSearchResult[]> {
    if (!this.client) {
      await this.connect();
    }
    const defaultFields = [
      'id',
      'documentId',
      'knowledgeType',
      'sourceType',
      'marketplace',
      'category',
      'source',
      'title',
      'content',
      'embeddingVersion',
      'checksum',
    ];
    const searchParams: any = {
      collection_name: collectionName,
      vector,
      limit: topK,
      output_fields: outputFields || defaultFields,
      consistency_level: 'Strong',
    };
    if (filterExpr) {
      searchParams.filter = filterExpr;
    }

    const result = await this.client!.search(searchParams);

    if (!result || !result.results) {
      return [];
    }

    return result.results.map((r: any) => {
      const { id, score, ...metadata } = r;
      return {
        id: String(id),
        score: Number(score || 0),
        metadata,
      };
    });
  }
}
