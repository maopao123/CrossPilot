import crypto from 'node:crypto';
import {
  KnowledgeType,
  KnowledgeSourceType,
  KnowledgeRetrievalResult,
  KnowledgeRetrievalMode,
  RetrievedKnowledge,
  KnowledgeRetrievalTrace,
} from '@crosspilot/shared';
import { MilvusVectorStore } from '@crosspilot/integrations';
import { PlatformEmbeddingRuntime, RagError, RagErrorCode } from '@crosspilot/ai';

export interface ListingKnowledgeRetrievalQuery {
  productName: string;
  brand?: string;
  marketplace?: string; // e.g. AMAZON_US
  category?: string;
  keywords?: string[];
  requestedTypes?: KnowledgeType[];
  topKPerType?: {
    AUTHORITY?: number;
    OPTIMIZATION?: number;
    INTENT?: number;
  };
  forceDegraded?: boolean;
}

export class KnowledgeRetrievalService {
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
   * Main retrieval method for Listing Studio V2 (WF-02 Step 8)
   */
  async retrieveListingKnowledge(
    query: ListingKnowledgeRetrievalQuery,
  ): Promise<KnowledgeRetrievalResult> {
    const startTime = Date.now();
    const traceId = `tr-rag-${crypto.randomUUID().substring(0, 8)}`;
    const marketplace = (query.marketplace || 'AMAZON_US').toUpperCase();
    const requestedTypes: KnowledgeType[] = query.requestedTypes || ['AUTHORITY', 'OPTIMIZATION', 'INTENT'];

    const topKConfig: Record<KnowledgeType, number> = {
      AUTHORITY: query.topKPerType?.AUTHORITY ?? 3,
      OPTIMIZATION: query.topKPerType?.OPTIMIZATION ?? 3,
      INTENT: query.topKPerType?.INTENT ?? 2,
    };

    // Construct search query string
    const keyTerms = (query.keywords || []).slice(0, 5).join(' ');
    const queryString = `${query.productName} ${query.brand || ''} ${keyTerms} listing title bullet rules cosmo rufus compatibility`.trim();

    // Forced degradation test support
    if (query.forceDegraded) {
      return this.buildDegradedResult(queryString, requestedTypes, marketplace, startTime, traceId, 'FORCED_DEGRADED');
    }

    try {
      // 1. Generate query embedding
      const embConfig = this.embeddingRuntime.getConfig();
      const { embedding } = await this.embeddingRuntime.embedText(queryString);

      // 2. Query Milvus for each KnowledgeType with metadata filtering
      const retrievedItems: RetrievedKnowledge[] = [];
      let totalRetrieved = 0;
      let dedupedCount = 0;

      for (const kType of requestedTypes) {
        const topK = topKConfig[kType];
        if (topK <= 0) continue;

        // Build Milvus boolean filter: strict marketplace match + GLOBAL fallback
        const filterExpr = `knowledgeType == "${kType}" and (marketplace == "${marketplace}" or marketplace == "GLOBAL")`;

        const hits = await this.vectorStore.search(
          this.collectionName,
          embedding,
          topK * 2, // Fetch slightly more to allow deduplication
          filterExpr,
        );

        totalRetrieved += hits.length;

        // Deduplicate chunks (by content hash or duplicate section)
        const seenSignatures = new Set<string>();
        let rank = 1;

        for (const hit of hits) {
          const content = String(hit.metadata?.content || '').trim();
          const signature = content.substring(0, 100);
          if (seenSignatures.has(signature)) {
            dedupedCount++;
            continue;
          }
          seenSignatures.add(signature);

          const prefix = kType === 'AUTHORITY' ? 'AUTH' : kType === 'OPTIMIZATION' ? 'OPT' : 'INT';
          const citationId = `K-${prefix}-${String(rank).padStart(3, '0')}`;

          retrievedItems.push({
            chunkId: hit.id,
            documentId: String(hit.metadata?.documentId || ''),
            citationId,
            knowledgeType: kType,
            sourceType: (hit.metadata?.sourceType as KnowledgeSourceType) || 'INTERNAL_GUIDE',
            content,
            score: Number(hit.score.toFixed(4)),
            rank,
            title: String(hit.metadata?.title || 'Knowledge Reference'),
            source: String(hit.metadata?.source || 'CrossPilot Knowledge Base'),
            sourceUrl: hit.metadata?.sourceUrl ? String(hit.metadata.sourceUrl) : undefined,
            marketplace: hit.metadata?.marketplace ? String(hit.metadata.marketplace) : undefined,
            category: hit.metadata?.category ? String(hit.metadata.category) : undefined,
          });

          rank++;
          if (rank > topK) break;
        }
      }

      // 3. Evaluate Evidence Gate
      const byType = {
        AUTHORITY: retrievedItems.filter((i) => i.knowledgeType === 'AUTHORITY').length,
        OPTIMIZATION: retrievedItems.filter((i) => i.knowledgeType === 'OPTIMIZATION').length,
        INTENT: retrievedItems.filter((i) => i.knowledgeType === 'INTENT').length,
      };

      let gateStatus: 'SUFFICIENT' | 'DEGRADED_PASS' | 'INSUFFICIENT';
      if (byType.AUTHORITY > 0 && (byType.OPTIMIZATION > 0 || byType.INTENT > 0)) {
        gateStatus = 'SUFFICIENT';
      } else if (byType.AUTHORITY > 0) {
        gateStatus = 'DEGRADED_PASS';
      } else {
        gateStatus = 'INSUFFICIENT';
      }

      const latencyMs = Date.now() - startTime;
      const trace: KnowledgeRetrievalTrace = {
        traceId,
        query: queryString,
        filters: {
          marketplace,
          knowledgeTypes: requestedTypes,
          category: query.category,
        },
        embeddingModel: embConfig.model,
        embeddingVersion: embConfig.version,
        collection: this.collectionName,
        topK: Object.values(topKConfig).reduce((a, b) => a + b, 0),
        retrievedCount: totalRetrieved,
        dedupedCount,
        selectedCount: retrievedItems.length,
        latencyMs,
        knowledgeTypes: requestedTypes,
        mode: 'LIVE',
        costUsd: null,
        timestamp: new Date().toISOString(),
      };

      return {
        items: retrievedItems,
        status: gateStatus,
        mode: 'LIVE',
        stats: {
          totalRetrieved,
          dedupedCount,
          selectedCount: retrievedItems.length,
          latencyMs,
          byType,
        },
        trace,
      };
    } catch (err: any) {
      // Graceful fallback on connection/retrieval error - NEVER fake LIVE
      return this.buildDegradedResult(
        queryString,
        requestedTypes,
        marketplace,
        startTime,
        traceId,
        err.message || 'Milvus connection failed',
      );
    }
  }

  /**
   * Helper: Controlled static fallback when Milvus is unavailable
   */
  private buildDegradedResult(
    queryString: string,
    requestedTypes: KnowledgeType[],
    marketplace: string,
    startTime: number,
    traceId: string,
    errorReason: string,
  ): KnowledgeRetrievalResult {
    // Return explicit STATIC_FALLBACK items with provenance
    const fallbackItems: RetrievedKnowledge[] = [
      {
        chunkId: 'DOC-AMZ-POL-2026-01-c1',
        documentId: 'DOC-AMZ-POL-2026-01',
        citationId: 'K-AUTH-001',
        knowledgeType: 'AUTHORITY',
        sourceType: 'INTERNAL_GUIDE',
        title: 'Amazon US Product Detail Page Rules and Title Standards',
        content: 'Amazon Product Detail Page Rules (Sec. 2.1): Titles must not exceed 200 characters and must omit subjective rankings (#1 Best Seller, Free Shipping).',
        score: 0.0,
        rank: 1,
        source: 'Internal Guide (compiled from Amazon Seller Central PDP Rules)',
        marketplace: 'AMAZON_US',
      },
      {
        chunkId: 'DOC-AMZ-GUIDE-2026-04-c1',
        documentId: 'DOC-AMZ-GUIDE-2026-04',
        citationId: 'K-AUTH-002',
        knowledgeType: 'AUTHORITY',
        sourceType: 'INTERNAL_GUIDE',
        title: 'Amazon Stone and Countertop Accessory Authenticity Guidelines',
        content: 'Authenticity Policy: Natural stone items must represent real stone and must not claim synthetic resin as natural.',
        score: 0.0,
        rank: 2,
        source: 'Internal Guide (compiled from Amazon Authenticity & Material Claims Policy)',
        marketplace: 'AMAZON_US',
      },
      {
        chunkId: 'DOC-SEO-COSMO-01-c1',
        documentId: 'DOC-SEO-COSMO-01',
        citationId: 'K-OPT-001',
        knowledgeType: 'OPTIMIZATION',
        sourceType: 'COSMO_RESEARCH',
        title: 'Amazon COSMO Algorithm Alignment',
        content: 'Amazon COSMO Algorithm: Align product function with exact buyer use-case query (e.g. electric toothbrush handle compatibility).',
        score: 0.0,
        rank: 1,
        source: 'COSMO Research Reference',
        marketplace: 'AMAZON_US',
      },
      {
        chunkId: 'DOC-GEO-RUFUS-02-c1',
        documentId: 'DOC-GEO-RUFUS-02',
        citationId: 'K-OPT-002',
        knowledgeType: 'OPTIMIZATION',
        sourceType: 'GEO_RESEARCH',
        title: 'Generative Engine Optimization Playbook',
        content: 'Generative Engine Optimization: Explicitly state weight and slot dimensions in bullets to allow AI shopping assistants to answer factual specs directly.',
        score: 0.0,
        rank: 2,
        source: 'GEO Research Playbook',
        marketplace: 'GLOBAL',
      },
    ];

    const filteredItems = fallbackItems.filter((item) => requestedTypes.includes(item.knowledgeType));

    const byType = {
      AUTHORITY: filteredItems.filter((i) => i.knowledgeType === 'AUTHORITY').length,
      OPTIMIZATION: filteredItems.filter((i) => i.knowledgeType === 'OPTIMIZATION').length,
      INTENT: filteredItems.filter((i) => i.knowledgeType === 'INTENT').length,
    };

    const latencyMs = Date.now() - startTime;
    return {
      items: filteredItems,
      status: 'DEGRADED_PASS',
      mode: 'STATIC_FALLBACK',
      stats: {
        totalRetrieved: fallbackItems.length,
        dedupedCount: 0,
        selectedCount: filteredItems.length,
        latencyMs,
        byType,
      },
      trace: {
        traceId,
        query: queryString,
        filters: { marketplace, knowledgeTypes: requestedTypes },
        embeddingModel: 'static-fallback',
        embeddingVersion: 'fallback-v1',
        collection: this.collectionName,
        topK: 4,
        retrievedCount: fallbackItems.length,
        dedupedCount: 0,
        selectedCount: filteredItems.length,
        latencyMs,
        knowledgeTypes: requestedTypes,
        mode: 'STATIC_FALLBACK',
        costUsd: null,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
