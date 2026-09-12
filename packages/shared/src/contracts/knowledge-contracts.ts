/**
 * CrossPilot Knowledge & RAG Contracts
 * Standard typed definitions for Documents, Chunks, Retrieval, and Citations.
 */

export type KnowledgeType = 'AUTHORITY' | 'OPTIMIZATION' | 'INTENT';

export type KnowledgeSourceType =
  | 'INTERNAL_GUIDE'
  | 'AMAZON_POLICY'
  | 'AMAZON_GUIDELINE'
  | 'SEO_REFERENCE'
  | 'COSMO_RESEARCH'
  | 'GEO_RESEARCH'
  | 'RUFUS_QA_PATTERN';

export type KnowledgeRetrievalMode = 'LIVE' | 'DEGRADED' | 'STATIC_FALLBACK';

export type KnowledgeEvidenceGateStatus = 'SUFFICIENT' | 'DEGRADED_PASS' | 'INSUFFICIENT';

export interface KnowledgeDocument {
  id: string;
  workspaceId?: string;
  knowledgeType: KnowledgeType;
  sourceType: KnowledgeSourceType;
  title: string;
  source: string;
  sourceUrl?: string;
  marketplace?: string; // e.g. AMAZON_US or GLOBAL
  category?: string;
  version: string;
  effectiveAt?: string;
  capturedAt?: string;
  content: string;
  checksum: string;
  status?: string; // INDEXED, DRAFT, ARCHIVED
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeChunk {
  chunkId: string;
  documentId: string;
  knowledgeType: KnowledgeType;
  sourceType: KnowledgeSourceType;
  content: string;
  section?: string;
  heading?: string;
  marketplace?: string;
  category?: string;
  source: string;
  sourceUrl?: string;
  chunkIndex: number;
  tokenCount: number;
  embeddingVersion: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface RetrievedKnowledge {
  chunkId: string;
  documentId: string;
  citationId: string; // e.g. K-AUTH-001, K-OPT-001, K-INT-001
  knowledgeType: KnowledgeType;
  sourceType: KnowledgeSourceType;
  content: string;
  score: number;
  rank: number;
  title: string;
  source: string;
  sourceUrl?: string;
  marketplace?: string;
  category?: string;
  section?: string;
  heading?: string;
  effectiveAt?: string;
}

export interface KnowledgeRetrievalTrace {
  traceId: string;
  query: string;
  filters: {
    marketplace?: string;
    knowledgeTypes?: KnowledgeType[];
    category?: string;
  };
  embeddingModel: string;
  embeddingVersion: string;
  collection: string;
  topK: number;
  retrievedCount: number;
  dedupedCount: number;
  selectedCount: number;
  latencyMs: number;
  knowledgeTypes: KnowledgeType[];
  mode: KnowledgeRetrievalMode;
  costUsd: number | null;
  timestamp: string;
}

export interface KnowledgeRetrievalResult {
  items: RetrievedKnowledge[];
  status: KnowledgeEvidenceGateStatus;
  mode: KnowledgeRetrievalMode;
  stats: {
    totalRetrieved: number;
    dedupedCount: number;
    selectedCount: number;
    latencyMs: number;
    byType: Record<KnowledgeType, number>;
  };
  trace: KnowledgeRetrievalTrace;
}
