import { ServiceHealthItem } from '@crosspilot/shared';

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<ServiceHealthItem>;
  insert(collectionName: string, vectors: VectorRecord[]): Promise<void>;
  search(collectionName: string, vector: number[], topK: number): Promise<VectorSearchResult[]>;
}
