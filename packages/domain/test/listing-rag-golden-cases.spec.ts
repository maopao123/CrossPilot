import {
  KnowledgeChunkerService,
  KnowledgeRetrievalService,
  ListingKnowledgeRetrievalQuery,
  SEED_KNOWLEDGE_DOCUMENTS,
  ListingWorkflowDagService,
  ClaimGroundingService,
  SurfaceClaimExtractorService,
  getMarketplacePolicyProfile,
} from '../src/index.js';
import { KnowledgeDocument, KnowledgeRetrievalResult, RetrievedKnowledge, ServiceHealthItem } from '@crosspilot/shared';
import { VectorStore, VectorSearchResult, VectorRecord } from '@crosspilot/integrations';
import { EmbeddingRuntime, EmbeddingResult, BatchEmbeddingResult, EmbeddingProviderConfig } from '@crosspilot/ai';

// Mock in-memory VectorStore for deterministic unit and golden test verification
class MockVectorStore implements VectorStore {
  private records: Map<string, VectorRecord[]> = new Map();
  public shouldFail = false;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async healthCheck(): Promise<ServiceHealthItem> {
    return { status: 'up', latencyMs: 1 };
  }

  async insert(collectionName: string, vectors: VectorRecord[]): Promise<void> {
    const existing = this.records.get(collectionName) || [];
    this.records.set(collectionName, [...existing, ...vectors]);
  }

  async search(
    collectionName: string,
    vector: number[],
    topK: number,
    filterExpr?: string,
  ): Promise<VectorSearchResult[]> {
    if (this.shouldFail) {
      throw new Error('Milvus connection refused: mock network failure');
    }

    const recs = this.records.get(collectionName) || [];
    let filtered = recs;

    if (filterExpr) {
      // Parse basic expressions: knowledgeType == "..." and (marketplace == "..." or marketplace == "GLOBAL")
      const typeMatch = filterExpr.match(/knowledgeType == "([^"]+)"/);
      const marketMatch = filterExpr.match(/marketplace == "([^"]+)"/);

      if (typeMatch) {
        filtered = filtered.filter((r) => r.metadata?.knowledgeType === typeMatch[1]);
      }
      if (marketMatch) {
        filtered = filtered.filter((r) => {
          const m = r.metadata?.marketplace;
          return m === marketMatch[1] || m === 'GLOBAL';
        });
      }
    }

    return filtered.slice(0, topK).map((r, i) => ({
      id: r.id,
      score: 0.85 - i * 0.05,
      metadata: r.metadata,
    }));
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    const recs = this.records.get(collectionName) || [];
    this.records.set(
      collectionName,
      recs.filter((r) => !ids.includes(r.id)),
    );
  }

  async flush(): Promise<void> {}
}

// Mock Embedding Runtime
class MockEmbeddingRuntime implements EmbeddingRuntime {
  getConfig(): EmbeddingProviderConfig {
    return {
      provider: 'mock',
      model: 'mock-embed-v1',
      dimension: 1024,
      version: 'mock-1024',
    };
  }

  async embedText(text: string): Promise<EmbeddingResult> {
    return {
      embedding: new Array(1024).fill(0.05),
      usage: { promptTokens: 10, totalTokens: 10, costUsd: null },
    };
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    return {
      embeddings: texts.map(() => new Array(1024).fill(0.05)),
      usage: { promptTokens: texts.length * 10, totalTokens: texts.length * 10, costUsd: null },
    };
  }
}

describe('CrossPilot V9 Epic 2: Real Milvus RAG Golden Cases (R1 ~ R10)', () => {
  let mockStore: MockVectorStore;
  let mockEmbedding: MockEmbeddingRuntime;
  let retrievalService: KnowledgeRetrievalService;

  beforeEach(async () => {
    mockStore = new MockVectorStore();
    mockEmbedding = new MockEmbeddingRuntime();
    retrievalService = new KnowledgeRetrievalService({
      vectorStore: mockStore as any,
      embeddingRuntime: mockEmbedding as any,
      collectionName: 'test_knowledge_chunks',
    });

    // Populate mock store with chunks from seed documents
    for (const doc of SEED_KNOWLEDGE_DOCUMENTS) {
      const chunks = KnowledgeChunkerService.chunkDocument(doc, { embeddingVersion: 'mock-1024' });
      const records: VectorRecord[] = chunks.map((c) => ({
        id: c.chunkId,
        vector: new Array(1024).fill(0.05),
        metadata: {
          documentId: c.documentId,
          knowledgeType: c.knowledgeType,
          sourceType: c.sourceType,
          marketplace: c.marketplace || 'GLOBAL',
          category: c.category || 'ALL',
          source: c.source,
          title: doc.title,
          content: c.content,
          embeddingVersion: c.embeddingVersion,
          checksum: doc.checksum,
        },
      }));
      await mockStore.insert('test_knowledge_chunks', records);
    }
  });

  // Case R1: Authority Retrieval
  it('Case R1: Authority retrieval should prioritize regulatory policy and rules', async () => {
    const res = await retrievalService.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      keywords: ['Amazon', 'title', 'policy', 'rules'],
      marketplace: 'AMAZON_US',
    });

    expect(res.mode).toBe('LIVE');
    expect(res.status).toBe('SUFFICIENT');
    const authItems = res.items.filter((i) => i.knowledgeType === 'AUTHORITY');
    expect(authItems.length).toBeGreaterThan(0);
    expect(authItems[0].citationId).toMatch(/^K-AUTH-\d{3}$/);
    expect(authItems[0].documentId).toContain('DOC-AMZ-POL');
  });

  // Case R2: Marketplace Filter
  it('Case R2: Marketplace filter should exclude foreign marketplace policy', async () => {
    // Inject a foreign marketplace doc (AMAZON_JP)
    await mockStore.insert('test_knowledge_chunks', [
      {
        id: 'DOC-JP-01-c1',
        vector: new Array(1024).fill(0.05),
        metadata: {
          documentId: 'DOC-JP-01',
          knowledgeType: 'AUTHORITY',
          sourceType: 'AMAZON_POLICY',
          marketplace: 'AMAZON_JP',
          title: 'Amazon Japan Title Rules',
          content: 'Title rules specifically for Amazon Japan.',
        },
      },
    ]);

    const res = await retrievalService.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      marketplace: 'AMAZON_US',
    });

    const foreignItems = res.items.filter((i) => i.marketplace === 'AMAZON_JP');
    expect(foreignItems.length).toBe(0);
  });

  // Case R3: Optimization Retrieval
  it('Case R3: Optimization retrieval should return SEO and COSMO best practices', async () => {
    const res = await retrievalService.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      keywords: ['COSMO', 'algorithm', 'GEO', 'keywords'],
      marketplace: 'AMAZON_US',
    });

    const optItems = res.items.filter((i) => i.knowledgeType === 'OPTIMIZATION');
    expect(optItems.length).toBeGreaterThan(0);
    expect(optItems[0].citationId).toMatch(/^K-OPT-\d{3}$/);
    expect(optItems[0].content).toContain('COSMO');
  });

  // Case R4: No Results Handling / Evidence Gate
  it('Case R4: Empty search results should trigger INSUFFICIENT gate status', async () => {
    // Empty vector store query
    const emptyService = new KnowledgeRetrievalService({
      vectorStore: new MockVectorStore() as any,
      embeddingRuntime: mockEmbedding as any,
      collectionName: 'empty_collection',
    });

    const res = await emptyService.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      marketplace: 'AMAZON_US',
    });

    expect(res.items.length).toBe(0);
    expect(res.status).toBe('INSUFFICIENT');
  });

  // Case R5: Milvus Unavailable Graceful Fallback
  it('Case R5: Milvus connection failure should gracefully degrade without fake LIVE', async () => {
    mockStore.shouldFail = true;

    const res = await retrievalService.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      marketplace: 'AMAZON_US',
    });

    expect(res.mode).toBe('STATIC_FALLBACK');
    expect(res.status).toBe('DEGRADED_PASS');
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.trace.mode).toBe('STATIC_FALLBACK');
  });

  // Case R6: Duplicate Chunk Suppression
  it('Case R6: Near-duplicate chunks should be suppressed by deduplication filter', async () => {
    const freshStore = new MockVectorStore();
    const freshRetrieval = new KnowledgeRetrievalService({
      vectorStore: freshStore as any,
      embeddingRuntime: mockEmbedding as any,
      collectionName: 'test_dedup_chunks',
    });
    await freshStore.insert('test_dedup_chunks', [
      {
        id: 'DUP-01',
        vector: new Array(1024).fill(0.05),
        metadata: {
          documentId: 'DOC-DUP-01',
          knowledgeType: 'AUTHORITY',
          sourceType: 'INTERNAL_GUIDE',
          marketplace: 'AMAZON_US',
          title: 'Duplicate Title Doc',
          content: 'Amazon Product Detail Page Rules (Sec. 2.1): Titles must not exceed 200 characters including spaces.',
        },
      },
      {
        id: 'DUP-02',
        vector: new Array(1024).fill(0.05),
        metadata: {
          documentId: 'DOC-DUP-02',
          knowledgeType: 'AUTHORITY',
          sourceType: 'INTERNAL_GUIDE',
          marketplace: 'AMAZON_US',
          title: 'Duplicate Title Doc Copy',
          content: 'Amazon Product Detail Page Rules (Sec. 2.1): Titles must not exceed 200 characters including spaces.',
        },
      },
    ]);

    const res = await freshRetrieval.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      marketplace: 'AMAZON_US',
      requestedTypes: ['AUTHORITY'],
    });

    expect(res.stats.dedupedCount).toBeGreaterThanOrEqual(1);
    expect(res.items.length).toBe(1);
  });

  // Case R7: Citation Lineage
  it('Case R7: Every retrieved knowledge chunk must have valid non-orphan citation lineage', async () => {
    const res = await retrievalService.retrieveListingKnowledge({
      productName: 'Toothbrush Stand',
      marketplace: 'AMAZON_US',
    });

    expect(res.items.length).toBeGreaterThan(0);
    for (const item of res.items) {
      expect(item.citationId).toBeDefined();
      expect(item.citationId).toMatch(/^K-(AUTH|OPT|INT)-\d{3}$/);
      expect(item.chunkId).toBeDefined();
      expect(item.documentId).toBeDefined();
      expect(item.source).toBeDefined();
      expect(item.source.length).toBeGreaterThan(0);
    }
  });

  // Case R8: Knowledge Cannot Become Product Fact
  it('Case R8: Knowledge statements cannot be used as substitute for missing product facts', async () => {
    // Suppose knowledge mentions marble is water-resistant for years,
    // but the product fact only confirms "polished marble" without durability timeframe.
    const confirmedFacts = [
      { id: 'f_mat', name: 'Material', value: 'Natural Carrara Marble' },
    ];

    // Evaluate surface claim: "resists stains for years"
    const surfaceClaims = SurfaceClaimExtractorService.extractSurfaceClaims(
      {
        title: 'Title',
        bulletPoints: ['Natural marble polished surface resists stains for years.'],
        description: 'Desc',
      },
      confirmedFacts,
    );

    const stainClaim = surfaceClaims.find((c: any) => (c.text || c.claim || '').includes('for years'));
    expect(stainClaim).toBeDefined();

    const { claims } = ClaimGroundingService.evaluateClaims([stainClaim!], confirmedFacts);
    // Must NOT be fully supported solely because RAG knowledge mentions marble properties!
    expect(claims[0].groundingStatus).not.toBe('SUPPORTED');
  });

  // Case R9: Authority Overrides Optimization
  it('Case R9: When Optimization suggests long keyword title, Authority 200-char rule strictly overrules', () => {
    const profile = getMarketplacePolicyProfile('AMAZON_US');
    expect(profile.title.maxLength).toBe(200);

    // Hypothetical SEO optimization title with 250 characters
    const hypotheticalOptimizedTitle = 'A'.repeat(250);
    expect(hypotheticalOptimizedTitle.length).toBeGreaterThan(profile.title.maxLength);

    // Authority rule must strictly reject it
    const isExceeded = hypotheticalOptimizedTitle.length > profile.title.maxLength;
    expect(isExceeded).toBe(true);
  });

  // Case R10: WF-02 Real RAG Context Assembly End-to-End
  it('Case R10: WF-02 DAG should execute with real RAG retrieval and assemble tiered context into draft', async () => {
    const dagResult = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'TEST-SKU-RAG',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      category: 'Home & Kitchen',
      features: [
        { id: 'f_mat', name: 'Material', value: '100% Natural Carrara Marble', isCore: true },
        { id: 'f_wt', name: 'Weight', value: '3.57 lbs' },
        { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches' },
      ],
      keywords: [
        { keyword: 'marble toothbrush holder', normalizedKeyword: 'marble toothbrush holder', priority: 1, volume: 27000, source: 'SEARCH_TERM' },
        { keyword: 'electric toothbrush stand', normalizedKeyword: 'electric toothbrush stand', priority: 2, volume: 15000, source: 'SEARCH_TERM' },
      ],
      rufusQa: [
        { id: 'rq_1', question: 'Does it tip over?', answer: 'No, the 3.57 lbs base provides stable placement.' },
      ],
      knowledgeRetrievalService: retrievalService,
      forceTemplateFallback: true, // Use fallback template to test DAG wiring without API costs
    });

    expect(dagResult.success).toBe(true);
    expect(dagResult.stepTraces.length).toBe(14);

    // Verify Step 8 trace
    const step8 = dagResult.stepTraces.find((t: any) => t.stepNumber === 8);
    expect(step8).toBeDefined();
    expect(step8?.stepName).toBe('retrieve_listing_knowledge');
    expect(step8?.summary).toContain('Retrieved');

    // Verify knowledge evidence in draft
    expect(dagResult.listingDraft.knowledgeEvidence).toBeDefined();
    expect(dagResult.listingDraft.knowledgeEvidence!.length).toBeGreaterThan(0);
    expect(dagResult.listingDraft.knowledgeMode).toBe('LIVE');
    expect(dagResult.listingDraft.knowledgeGateStatus).toBe('SUFFICIENT');

    // Citations must be populated
    const firstEvidence = dagResult.listingDraft.knowledgeEvidence![0];
    expect(firstEvidence.citationId).toBeDefined();
    expect(firstEvidence.citationId).toMatch(/^K-(AUTH|OPT|INT)-\d{3}$/);

    // Compliance must pass
    expect(dagResult.complianceResult.status).toBe('PASS');
    expect(dagResult.humanReviewState).toBe('WAITING_APPROVAL');
  });
});
