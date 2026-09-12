import { KnowledgeChunk, KnowledgeDocument } from '@crosspilot/shared';
import { MilvusVectorStore, VectorRecord } from '@crosspilot/integrations';
import { PlatformEmbeddingRuntime } from '@crosspilot/ai';
import { KnowledgeChunkerService } from './knowledge-chunker.service.js';
import { SEED_KNOWLEDGE_DOCUMENTS } from './knowledge-seed-data.js';

export interface IngestionResult {
  documentId: string;
  title: string;
  chunksCreated: number;
  vectorsInserted: number;
  embeddingDimension: number;
  collection: string;
}

export class KnowledgeIngestionService {
  private readonly vectorStore: MilvusVectorStore;
  private readonly embeddingRuntime: PlatformEmbeddingRuntime;
  private readonly collectionName: string;

  constructor(options?: {
    vectorStore?: MilvusVectorStore;
    embeddingRuntime?: PlatformEmbeddingRuntime;
    collectionName?: string;
  }) {
    this.vectorStore = options?.vectorStore || new MilvusVectorStore();
    this.embeddingRuntime = options?.embeddingRuntime || PlatformEmbeddingRuntime.getInstance();
    this.collectionName = options?.collectionName || process.env.MILVUS_COLLECTION || 'listing_knowledge_chunks';
  }

  /**
   * Ingest a single KnowledgeDocument into Milvus index
   */
  async ingestDocument(doc: KnowledgeDocument): Promise<IngestionResult> {
    const config = this.embeddingRuntime.getConfig();
    const chunks = KnowledgeChunkerService.chunkDocument(doc, {
      embeddingVersion: config.version,
    });

    if (chunks.length === 0) {
      return {
        documentId: doc.id,
        title: doc.title,
        chunksCreated: 0,
        vectorsInserted: 0,
        embeddingDimension: config.dimension,
        collection: this.collectionName,
      };
    }

    // Ensure Milvus collection exists and is loaded
    await this.vectorStore.initKnowledgeCollection(this.collectionName, config.dimension);

    // Extract text for batch embedding
    const textsToEmbed = chunks.map((c) => `${c.heading ? c.heading + ': ' : ''}${c.content}`);
    const { embeddings } = await this.embeddingRuntime.embedBatch(textsToEmbed);

    const records: VectorRecord[] = chunks.map((chunk, i) => ({
      id: chunk.chunkId,
      vector: embeddings[i],
      metadata: {
        documentId: chunk.documentId,
        knowledgeType: chunk.knowledgeType,
        sourceType: chunk.sourceType,
        marketplace: chunk.marketplace || 'GLOBAL',
        category: chunk.category || 'ALL',
        source: chunk.source,
        title: doc.title,
        content: chunk.content,
        embeddingVersion: chunk.embeddingVersion,
        checksum: doc.checksum,
      },
    }));

    // Idempotent: delete existing chunks for this document first if present
    try {
      const existingIds = chunks.map((c) => c.chunkId);
      await this.vectorStore.delete(this.collectionName, existingIds);
    } catch {
      // Ignore if not found
    }

    await this.vectorStore.insert(this.collectionName, records);

    return {
      documentId: doc.id,
      title: doc.title,
      chunksCreated: chunks.length,
      vectorsInserted: records.length,
      embeddingDimension: config.dimension,
      collection: this.collectionName,
    };
  }

  /**
   * Ingest a batch of documents (e.g. seed knowledge)
   */
  async ingestBatch(docs: KnowledgeDocument[]): Promise<IngestionResult[]> {
    const config = this.embeddingRuntime.getConfig();
    await this.vectorStore.initKnowledgeCollection(this.collectionName, config.dimension);

    const results: IngestionResult[] = [];
    for (const doc of docs) {
      const res = await this.ingestDocument(doc);
      results.push(res);
    }
    await this.vectorStore.flush(this.collectionName);
    return results;
  }

  /**
   * Rebuild the entire knowledge search index from Source of Truth documents
   */
  async rebuildKnowledgeIndex(docs: KnowledgeDocument[] = SEED_KNOWLEDGE_DOCUMENTS): Promise<IngestionResult[]> {
    const config = this.embeddingRuntime.getConfig();
    try {
      await this.vectorStore.dropCollection(this.collectionName);
    } catch {
      // Ignore if drop fails
    }
    await this.vectorStore.initKnowledgeCollection(this.collectionName, config.dimension);
    return this.ingestBatch(docs);
  }
}
