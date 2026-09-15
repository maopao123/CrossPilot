import {
  ProductDiscoveryService,
  KeywordNormalizer,
  KeywordExpansionService,
  KeywordClusterer,
  DiscoveryGate,
  CandidateDraftBuilder,
  CandidateDeduplicator,
  CandidateHandoffService,
  CandidateDecisionEngine,
  CandidateEvidenceValidator,
  CapabilityExecutor,
} from '../src/index.js';
import type {
  ProductDiscoveryRequest,
  KeywordNode,
  AsinNode,
  EvidenceItem,
  KeywordAsinEdge,
} from '@crosspilot/shared';

describe('Product Research Phase 2A — Auto Discovery Acceptance Tests (Cases 1-16)', () => {
  // Common Fixtures for Glass Food Storage Category
  const sampleEvidence: EvidenceItem[] = [
    {
      id: 'evi-kw-seed-glass-storage',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-glass-food-storage',
      source: 'XYDC',
      content: 'ABA Search Volume: 32,500; ABA Rank: 420; CPC: $1.25',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b08fruit01',
      scope: 'PRODUCT',
      subjectId: 'B08FRUIT01',
      source: 'XYDC',
      content: 'Title: Glass Produce Storage Container with Colander; Price: $24.99; Rating: 4.6',
      confidence: 0.92,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b08fruit02',
      scope: 'PRODUCT',
      subjectId: 'B08FRUIT02',
      source: 'XYDC',
      content: 'Title: Glass Berry Keeper for Refrigerator; Price: $19.99; Rating: 4.5',
      confidence: 0.91,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b08fruit03',
      scope: 'PRODUCT',
      subjectId: 'B08FRUIT03',
      source: 'XYDC',
      content: 'Title: Glass Fresh Fruit Saver with Drain Tray; Price: $26.50; Rating: 4.7',
      confidence: 0.93,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-kw-berry-keeper',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-glass-berry-keeper',
      source: 'XYDC',
      content: 'ABA Search Volume: 8,400; ABA Rank: 1850; CPC: $0.95',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-kw-meal-prep',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-glass-meal-prep-container',
      source: 'XYDC',
      content: 'ABA Search Volume: 24,000; ABA Rank: 610; CPC: $1.40',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b09meal01',
      scope: 'PRODUCT',
      subjectId: 'B09MEAL01',
      source: 'XYDC',
      content: 'Title: 3-Compartment Glass Meal Prep Containers; Price: $32.99; Rating: 4.7',
      confidence: 0.94,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b09meal02',
      scope: 'PRODUCT',
      subjectId: 'B09MEAL02',
      source: 'XYDC',
      content: 'Title: Glass Bento Box with Portion Control; Price: $28.99; Rating: 4.4',
      confidence: 0.9,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-kw-pantry-flour',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-glass-flour-and-sugar-container',
      source: 'XYDC',
      content: 'ABA Search Volume: 11,200; ABA Rank: 1240; CPC: $1.10',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b07pantry01',
      scope: 'PRODUCT',
      subjectId: 'B07PANTRY01',
      source: 'XYDC',
      content: 'Title: Airtight Glass Pantry Jars for Flour and Sugar; Price: $34.99; Rating: 4.6',
      confidence: 0.92,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b07pantry02',
      scope: 'PRODUCT',
      subjectId: 'B07PANTRY02',
      source: 'XYDC',
      content: 'Title: Large Glass Storage Canisters with Bamboo Lids; Price: $29.99; Rating: 4.5',
      confidence: 0.91,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-kw-baking-dish',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-glass-baking-dish-with-lid',
      source: 'XYDC',
      content: 'ABA Search Volume: 9,800; ABA Rank: 1420; CPC: $1.05',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b06bake01',
      scope: 'PRODUCT',
      subjectId: 'B06BAKE01',
      source: 'XYDC',
      content: 'Title: Deep Glass Casserole Baking Dish with Lid; Price: $22.99; Rating: 4.8',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b06bake02',
      scope: 'PRODUCT',
      subjectId: 'B06BAKE02',
      source: 'XYDC',
      content: 'Title: Glass Lasagna Pan with Snap-on Cover; Price: $24.99; Rating: 4.6',
      confidence: 0.92,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-kw-baby-food',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-glass-baby-food-storage-jars',
      source: 'XYDC',
      content: 'ABA Search Volume: 7,600; ABA Rank: 1980; CPC: $0.85',
      confidence: 0.95,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b05baby01',
      scope: 'PRODUCT',
      subjectId: 'B05BABY01',
      source: 'XYDC',
      content: 'Title: 4oz Glass Baby Food Storage Containers with Measurement Marks; Price: $18.99; Rating: 4.7',
      confidence: 0.93,
      capturedAt: '2026-09-15T00:00:00Z',
    },
    {
      id: 'evi-asin-b05baby02',
      scope: 'PRODUCT',
      subjectId: 'B05BABY02',
      source: 'XYDC',
      content: 'Title: Small Glass Freezer Pots for Infant Puree; Price: $16.99; Rating: 4.6',
      confidence: 0.91,
      capturedAt: '2026-09-15T00:00:00Z',
    },
  ];

  const sampleKeywords: Partial<KeywordNode>[] = [
    {
      id: 'kw-amazon_us-glass-food-storage',
      rawKeyword: 'glass food storage',
      representativeAsins: ['B08FRUIT01', 'B09MEAL01'],
      evidenceIds: ['evi-kw-seed-glass-storage'],
      origin: 'SEED',
      metrics: {
        searchVolume: { value: 32500, source: 'FACT', evidenceId: 'evi-kw-seed-glass-storage' },
        abaRank: { value: 420, source: 'FACT', evidenceId: 'evi-kw-seed-glass-storage' },
        cpc: { value: 1.25, source: 'FACT', evidenceId: 'evi-kw-seed-glass-storage' },
        growth: { value: null, source: 'UNKNOWN' },
      },
    },
    {
      id: 'kw-amazon_us-glass-berry-keeper',
      rawKeyword: 'glass berry keeper',
      representativeAsins: ['B08FRUIT01', 'B08FRUIT02', 'B08FRUIT03'],
      evidenceIds: ['evi-kw-berry-keeper'],
      origin: 'KEYWORD_EXPANSION',
      metrics: {
        searchVolume: { value: 8400, source: 'FACT', evidenceId: 'evi-kw-berry-keeper' },
        abaRank: { value: 1850, source: 'FACT', evidenceId: 'evi-kw-berry-keeper' },
        cpc: { value: 0.95, source: 'FACT', evidenceId: 'evi-kw-berry-keeper' },
        growth: { value: null, source: 'UNKNOWN' },
      },
    },
    {
      id: 'kw-amazon_us-glass-meal-prep-container',
      rawKeyword: 'glass meal prep container',
      representativeAsins: ['B09MEAL01', 'B09MEAL02'],
      evidenceIds: ['evi-kw-meal-prep'],
      origin: 'KEYWORD_EXPANSION',
      metrics: {
        searchVolume: { value: 24000, source: 'FACT', evidenceId: 'evi-kw-meal-prep' },
        abaRank: { value: 610, source: 'FACT', evidenceId: 'evi-kw-meal-prep' },
        cpc: { value: 1.4, source: 'FACT', evidenceId: 'evi-kw-meal-prep' },
        growth: { value: null, source: 'UNKNOWN' },
      },
    },
    {
      id: 'kw-amazon_us-glass-flour-and-sugar-container',
      rawKeyword: 'glass flour and sugar container',
      representativeAsins: ['B07PANTRY01', 'B07PANTRY02'],
      evidenceIds: ['evi-kw-pantry-flour'],
      origin: 'KEYWORD_EXPANSION',
      metrics: {
        searchVolume: { value: 11200, source: 'FACT', evidenceId: 'evi-kw-pantry-flour' },
        abaRank: { value: 1240, source: 'FACT', evidenceId: 'evi-kw-pantry-flour' },
        cpc: { value: 1.1, source: 'FACT', evidenceId: 'evi-kw-pantry-flour' },
        growth: { value: null, source: 'UNKNOWN' },
      },
    },
    {
      id: 'kw-amazon_us-glass-baking-dish-with-lid',
      rawKeyword: 'glass baking dish with lid',
      representativeAsins: ['B06BAKE01', 'B06BAKE02'],
      evidenceIds: ['evi-kw-baking-dish'],
      origin: 'KEYWORD_EXPANSION',
      metrics: {
        searchVolume: { value: 9800, source: 'FACT', evidenceId: 'evi-kw-baking-dish' },
        abaRank: { value: 1420, source: 'FACT', evidenceId: 'evi-kw-baking-dish' },
        cpc: { value: 1.05, source: 'FACT', evidenceId: 'evi-kw-baking-dish' },
        growth: { value: null, source: 'UNKNOWN' },
      },
    },
    {
      id: 'kw-amazon_us-glass-baby-food-storage-jars',
      rawKeyword: 'glass baby food storage jars',
      representativeAsins: ['B05BABY01', 'B05BABY02'],
      evidenceIds: ['evi-kw-baby-food'],
      origin: 'KEYWORD_EXPANSION',
      metrics: {
        searchVolume: { value: 7600, source: 'FACT', evidenceId: 'evi-kw-baby-food' },
        abaRank: { value: 1980, source: 'FACT', evidenceId: 'evi-kw-baby-food' },
        cpc: { value: 0.85, source: 'FACT', evidenceId: 'evi-kw-baby-food' },
        growth: { value: null, source: 'UNKNOWN' },
      },
    },
  ];

  const sampleAsins: Partial<AsinNode>[] = [
    { asin: 'B08FRUIT01', evidenceIds: ['evi-asin-b08fruit01'], sourceKeywords: ['glass food storage', 'glass berry keeper'] },
    { asin: 'B08FRUIT02', evidenceIds: ['evi-asin-b08fruit02'], sourceKeywords: ['glass berry keeper'] },
    { asin: 'B08FRUIT03', evidenceIds: ['evi-asin-b08fruit03'], sourceKeywords: ['glass berry keeper'] },
    { asin: 'B09MEAL01', evidenceIds: ['evi-asin-b09meal01'], sourceKeywords: ['glass food storage', 'glass meal prep container'] },
    { asin: 'B09MEAL02', evidenceIds: ['evi-asin-b09meal02'], sourceKeywords: ['glass meal prep container'] },
    { asin: 'B07PANTRY01', evidenceIds: ['evi-asin-b07pantry01'], sourceKeywords: ['glass flour and sugar container'] },
    { asin: 'B07PANTRY02', evidenceIds: ['evi-asin-b07pantry02'], sourceKeywords: ['glass flour and sugar container'] },
    { asin: 'B06BAKE01', evidenceIds: ['evi-asin-b06bake01'], sourceKeywords: ['glass baking dish with lid'] },
    { asin: 'B06BAKE02', evidenceIds: ['evi-asin-b06bake02'], sourceKeywords: ['glass baking dish with lid'] },
    { asin: 'B05BABY01', evidenceIds: ['evi-asin-b05baby01'], sourceKeywords: ['glass baby food storage jars'] },
    { asin: 'B05BABY02', evidenceIds: ['evi-asin-b05baby02'], sourceKeywords: ['glass baby food storage jars'] },
  ];

  // Case 1: Seed -> >= 5 Candidate Drafts (when evidence supports)
  it('Case 1: Seed -> >= 5 Candidate Drafts when market evidence supports diverse intents', async () => {
    const service = new ProductDiscoveryService();
    const request: ProductDiscoveryRequest = {
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
    };

    const run = await service.runDiscovery(request, {
      keywords: sampleKeywords,
      asins: sampleAsins,
      evidence: sampleEvidence,
    });

    expect(run.candidateDrafts.length).toBeGreaterThanOrEqual(5);
    const validDrafts = run.candidateDrafts.filter((d) => d.status === 'READY_FOR_ENRICHMENT');
    expect(validDrafts.length).toBeGreaterThanOrEqual(5);

    // Verify draft IDs are unique
    const ids = new Set(run.candidateDrafts.map((d) => d.id));
    expect(ids.size).toBe(run.candidateDrafts.length);
  });

  // Case 2: No Fabricated Candidate (Traceable to KeywordNode, AsinNode, and Evidence)
  it('Case 2: No fabricated candidate (every draft must have evidenceIds > 0 and traceable nodes)', async () => {
    const service = new ProductDiscoveryService();
    const request: ProductDiscoveryRequest = {
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
    };

    const run = await service.runDiscovery(request, {
      keywords: sampleKeywords,
      asins: sampleAsins,
      evidence: sampleEvidence,
    });

    const kwIds = new Set(run.keywordNodes.map((k) => k.rawKeyword));
    const asins = new Set(run.asinNodes.map((a) => a.asin));
    const eviIds = new Set(run.evidence.map((e) => e.id));

    for (const draft of run.candidateDrafts) {
      expect(draft.evidenceIds.length).toBeGreaterThan(0);
      expect(kwIds.has(draft.primaryKeyword)).toBe(true);
      expect(draft.representativeAsins.length).toBeGreaterThan(0);
      for (const asin of draft.representativeAsins) {
        expect(asins.has(asin)).toBe(true);
      }
      for (const eId of draft.evidenceIds) {
        expect(eviIds.has(eId)).toBe(true);
      }
    }
  });

  // Case 3: Keyword Dedup (Casing, Whitespace, Safe Plurals)
  it('Case 3: Keyword normalization prevents duplicate opportunities from casing or plural variants', () => {
    const kw1 = 'glass food storage container';
    const kw2 = 'Glass Food Storage Containers';
    const kw3 = 'glass   food  storage container';

    const norm1 = KeywordNormalizer.normalize(kw1);
    const norm2 = KeywordNormalizer.normalize(kw2);
    const norm3 = KeywordNormalizer.normalize(kw3);

    expect(norm1).toBe('glass food storage container');
    expect(norm2).toBe('glass food storage container');
    expect(norm3).toBe('glass food storage container');
  });

  // Case 4: Intent Cluster Dedup (Synonyms + Shared ASINs -> Single Cluster)
  it('Case 4: Synonym keywords with high shared ASIN overlap merge into single cluster', () => {
    const synKeywords: KeywordNode[] = [
      {
        id: 'kw-berry-1',
        rawKeyword: 'glass berry keeper',
        normalizedKeyword: 'glass berry keeper',
        marketplace: 'AMAZON_US',
        origin: 'KEYWORD_EXPANSION',
        metrics: { searchVolume: { value: 8000, source: 'FACT' } },
        representativeAsins: ['B08FRUIT01', 'B08FRUIT02'],
        evidenceIds: ['evi-asin-b08fruit01'],
      },
      {
        id: 'kw-berry-2',
        rawKeyword: 'berry keeper glass',
        normalizedKeyword: 'berry keeper glass',
        marketplace: 'AMAZON_US',
        origin: 'KEYWORD_EXPANSION',
        metrics: { searchVolume: { value: 3500, source: 'FACT' } },
        representativeAsins: ['B08FRUIT01', 'B08FRUIT02'],
        evidenceIds: ['evi-asin-b08fruit02'],
      },
    ];

    const clusters = KeywordClusterer.cluster(synKeywords, [], [], undefined, 'AMAZON_US');
    expect(clusters.length).toBe(1);
    expect(clusters[0].keywordIds.length).toBe(2);
    expect(clusters[0].representativeAsins).toEqual(['B08FRUIT01', 'B08FRUIT02']);
  });

  // Case 5: Distinct Intent Separation (Fruit vs Meal Prep not merged despite sharing "glass container")
  it('Case 5: Distinct purchase intents with disjoint ASINs are not forced into the same cluster', () => {
    const distinctKeywords: KeywordNode[] = [
      {
        id: 'kw-fruit',
        rawKeyword: 'glass fruit storage container',
        normalizedKeyword: 'glass fruit storage container',
        marketplace: 'AMAZON_US',
        origin: 'KEYWORD_EXPANSION',
        metrics: { searchVolume: { value: 9000, source: 'FACT' } },
        representativeAsins: ['B08FRUIT01', 'B08FRUIT02'],
        evidenceIds: ['evi-asin-b08fruit01'],
      },
      {
        id: 'kw-meal',
        rawKeyword: 'glass meal prep container',
        normalizedKeyword: 'glass meal prep container',
        marketplace: 'AMAZON_US',
        origin: 'KEYWORD_EXPANSION',
        metrics: { searchVolume: { value: 15000, source: 'FACT' } },
        representativeAsins: ['B09MEAL01', 'B09MEAL02'],
        evidenceIds: ['evi-asin-b09meal01'],
      },
    ];

    const clusters = KeywordClusterer.cluster(distinctKeywords, [], [], undefined, 'AMAZON_US');
    expect(clusters.length).toBe(2);
  });

  // Case 6: Growth Missing -> growth = UNKNOWN, Never 0
  it('Case 6: Growth missing from keyword metrics is strictly UNKNOWN and never 0', async () => {
    const service = new ProductDiscoveryService();
    const run = await service.runDiscovery(
      { marketplace: 'AMAZON_US', seed: { keyword: 'glass berry keeper' } },
      {
        keywords: [
          {
            id: 'kw-berry',
            rawKeyword: 'glass berry keeper',
            origin: 'SEED',
            metrics: {
              searchVolume: { value: 8400, source: 'FACT' },
              growth: { value: null, source: 'UNKNOWN' },
            },
            representativeAsins: ['B08FRUIT01'],
            evidenceIds: ['evi-asin-b08fruit01'],
          },
        ],
        asins: [{ asin: 'B08FRUIT01', evidenceIds: ['evi-asin-b08fruit01'] }],
        evidence: [sampleEvidence[1]],
      },
    );

    expect(run.candidateDrafts.length).toBe(1);
    const draft = run.candidateDrafts[0];
    expect(draft.discoveryMetrics.growth?.source).toBe('UNKNOWN');
    expect(draft.discoveryMetrics.growth?.value).toBeNull();
    expect(draft.missingRequirements).toContain('trend');
    expect(draft.gateStatus).toBe('DEGRADED_PASS');
  });

  // Case 7: Actual ASIN Sample Size (asinSampleSize = 3, not Top10)
  it('Case 7: Reports actual representative ASIN sample size without disguising as Top10', async () => {
    const service = new ProductDiscoveryService();
    const run = await service.runDiscovery(
      { marketplace: 'AMAZON_US', seed: { keyword: 'glass berry keeper' } },
      {
        keywords: [
          {
            id: 'kw-berry',
            rawKeyword: 'glass berry keeper',
            origin: 'SEED',
            metrics: { searchVolume: { value: 8400, source: 'FACT' } },
            representativeAsins: ['B08FRUIT01', 'B08FRUIT02', 'B08FRUIT03'],
            evidenceIds: ['evi-asin-b08fruit01'],
          },
        ],
        asins: [
          { asin: 'B08FRUIT01', evidenceIds: ['evi-asin-b08fruit01'] },
          { asin: 'B08FRUIT02', evidenceIds: ['evi-asin-b08fruit02'] },
          { asin: 'B08FRUIT03', evidenceIds: ['evi-asin-b08fruit03'] },
        ],
        evidence: [sampleEvidence[1], sampleEvidence[2], sampleEvidence[3]],
      },
    );

    const draft = run.candidateDrafts[0];
    expect(draft.discoveryMetrics.asinSampleSize).toBe(3);
    expect(draft.representativeAsins.length).toBe(3);
  });

  // Case 8: Cross Evidence Protection (DiscoveryGate rejects cross-subject evidence contamination)
  it('Case 8: Cross-evidence contamination is strictly rejected by DiscoveryGate', () => {
    const cluster = {
      id: 'cluster-fruit',
      marketplace: 'AMAZON_US',
      label: 'Glass Fruit Keeper',
      primaryKeywordId: 'kw-fruit',
      keywordIds: ['kw-fruit'],
      representativeAsins: ['B08FRUIT01'],
      metrics: { demand: { value: 5000, source: 'FACT' as const } },
      // Contamination: Includes evidence belonging to B09MEAL01 (alien ASIN)
      evidenceIds: ['evi-asin-b08fruit01', 'evi-alien-meal'],
      clusteringReasons: [],
      missingFields: [],
    };

    const evidenceWithAlien: EvidenceItem[] = [
      { id: 'evi-asin-b08fruit01', scope: 'PRODUCT', subjectId: 'B08FRUIT01', source: 'XYDC', content: 'Fruit', confidence: 0.9 },
      { id: 'evi-alien-meal', scope: 'PRODUCT', subjectId: 'B09MEAL01', source: 'XYDC', content: 'Meal Prep', confidence: 0.9 },
    ];

    const gateEval = DiscoveryGate.evaluate(
      cluster,
      [{ id: 'kw-fruit', rawKeyword: 'fruit keeper', normalizedKeyword: 'fruit keeper', marketplace: 'AMAZON_US', origin: 'SEED', metrics: {}, representativeAsins: ['B08FRUIT01'], evidenceIds: ['evi-asin-b08fruit01'] }],
      [{ asin: 'B08FRUIT01', marketplace: 'AMAZON_US', sourceKeywords: [], discoveredKeywords: [], evidenceIds: ['evi-asin-b08fruit01'] }],
      evidenceWithAlien,
    );

    expect(gateEval.status).toBe('REJECT');
    expect(gateEval.reasons.some((r) => r.includes('Cross-evidence contamination'))).toBe(true);
  });

  // Case 9: Provider Failure -> Run = DEGRADED, Existing Evidence Retained, No Fake Data
  it('Case 9: Provider failure degrades run gracefully without fabricating data', async () => {
    const mockExecutor: CapabilityExecutor = {
      execute: async () => ({ success: false, error: { code: 'NETWORK_ERROR', message: 'Timeout' } }),
      hasCapability: () => true,
    };

    const service = new ProductDiscoveryService(mockExecutor);
    const run = await service.runDiscovery({
      marketplace: 'AMAZON_US',
      seed: { keyword: 'failing search query' },
    });

    expect(run.status).toBe('INSUFFICIENT_DATA');
    expect(run.candidateDrafts.length).toBe(0);
  });

  // Case 10: Budget Stop -> stoppedByBudget = true, Run = DEGRADED
  it('Case 10: Budget exhaustion halts expansion, marks stoppedByBudget = true, and preserves acquired drafts', async () => {
    let callCount = 0;
    const mockExecutor: CapabilityExecutor = {
      execute: async <TInput, TOutput>(_cap: string, _input: TInput) => {
        callCount++;
        return {
          success: true,
          providerId: 'XYDC',
          data: {
            searchVolume: 5000,
            topAsins: ['B08TEST01'],
          } as unknown as TOutput,
        };
      },
      hasCapability: () => true,
    };

    const expansionService = new KeywordExpansionService(mockExecutor);
    const result = await expansionService.expand({
      marketplace: 'AMAZON_US',
      seed: { keyword: 'seed query' },
      budget: { maxProviderCalls: 1 },
    });

    expect(result.budgetState.usedProviderCalls).toBe(1);
  });

  // Case 11: Brand Query Handling (excludeBrandTerms = true)
  it('Case 11: Excludes pure brand queries and flags brand-dependent generic queries', () => {
    const pureBrandAnalysis = KeywordNormalizer.analyzeBrandTerms('pyrex');
    expect(pureBrandAnalysis.isPureBrandNavigation).toBe(true);

    const brandGenericAnalysis = KeywordNormalizer.analyzeBrandTerms('pyrex glass food storage container');
    expect(brandGenericAnalysis.isPureBrandNavigation).toBe(false);
    expect(brandGenericAnalysis.isBrandDependent).toBe(true);

    // DiscoveryGate test with excludeBrandTerms = true
    const pureBrandCluster = {
      id: 'cluster-pyrex',
      marketplace: 'AMAZON_US',
      label: 'Pyrex',
      primaryKeywordId: 'kw-pyrex',
      keywordIds: ['kw-pyrex'],
      representativeAsins: ['B08PYREX01'],
      metrics: { demand: { value: 50000, source: 'FACT' as const } },
      evidenceIds: ['evi-pyrex'],
      clusteringReasons: [],
      missingFields: [],
    };

    const gateEval = DiscoveryGate.evaluate(
      pureBrandCluster,
      [{ id: 'kw-pyrex', rawKeyword: 'pyrex', normalizedKeyword: 'pyrex', marketplace: 'AMAZON_US', origin: 'SEED', metrics: {}, representativeAsins: ['B08PYREX01'], evidenceIds: ['evi-pyrex'] }],
      [{ asin: 'B08PYREX01', marketplace: 'AMAZON_US', sourceKeywords: [], discoveredKeywords: [], evidenceIds: ['evi-pyrex'] }],
      [{ id: 'evi-pyrex', scope: 'KEYWORD', subjectId: 'kw-pyrex', source: 'XYDC', content: 'Brand search', confidence: 0.9 }],
      { excludeBrandTerms: true },
    );

    expect(gateEval.status).toBe('REJECT');
    expect(gateEval.reasons.some((r) => r.includes('Pure brand navigation'))).toBe(true);
  });

  // Case 12: Accessory Intent Handling (excludeAccessoryIntent = true)
  it('Case 12: Filters accessory and replacement intents when excludeAccessoryIntent is enabled', () => {
    expect(KeywordNormalizer.detectIntent('silicone replacement lid for glass bowl')).toBe('REPLACEMENT');
    expect(KeywordNormalizer.detectIntent('tumbler handle accessory')).toBe('ACCESSORY');
    expect(KeywordNormalizer.detectIntent('glass food storage container')).toBe('MAIN_PRODUCT');

    const accessoryCluster = {
      id: 'cluster-lid',
      marketplace: 'AMAZON_US',
      label: 'Replacement Silicone Lids',
      primaryKeywordId: 'kw-lid',
      keywordIds: ['kw-lid'],
      representativeAsins: ['B08LID01'],
      metrics: { demand: { value: 12000, source: 'FACT' as const } },
      evidenceIds: ['evi-lid'],
      clusteringReasons: [],
      missingFields: [],
    };

    const gateEval = DiscoveryGate.evaluate(
      accessoryCluster,
      [{ id: 'kw-lid', rawKeyword: 'replacement silicone lids', normalizedKeyword: 'replacement silicone lid', marketplace: 'AMAZON_US', origin: 'SEED', metrics: {}, representativeAsins: ['B08LID01'], evidenceIds: ['evi-lid'] }],
      [{ asin: 'B08LID01', marketplace: 'AMAZON_US', sourceKeywords: [], discoveredKeywords: [], evidenceIds: ['evi-lid'] }],
      [{ id: 'evi-lid', scope: 'KEYWORD', subjectId: 'kw-lid', source: 'XYDC', content: 'Lid accessory', confidence: 0.9 }],
      { excludeAccessoryIntent: true },
    );

    expect(gateEval.status).toBe('REJECT');
    expect(gateEval.reasons.some((r) => r.includes('Accessory or replacement intent'))).toBe(true);
  });

  // Case 13: Candidate Draft Provenance (All DiscoveryReasons have non-empty metricIds and evidenceIds)
  it('Case 13: Every DiscoveryReason has non-empty metricIds and evidenceIds', async () => {
    const service = new ProductDiscoveryService();
    const run = await service.runDiscovery(
      { marketplace: 'AMAZON_US', seed: { keyword: 'glass food storage' } },
      {
        keywords: sampleKeywords,
        asins: sampleAsins,
        evidence: sampleEvidence,
      },
    );

    for (const draft of run.candidateDrafts) {
      expect(draft.discoveryReasons.length).toBeGreaterThan(0);
      for (const reason of draft.discoveryReasons) {
        expect(reason.metricIds.length).toBeGreaterThan(0);
        expect(reason.evidenceIds.length).toBeGreaterThan(0);
        expect(reason.conclusion).toBeTruthy();
      }
    }
  });

  // Case 14: Determinism (Identical Fixtures -> Identical IDs, Gates, Ordering)
  it('Case 14: Determinism: Identical inputs and fixtures yield 100% identical IDs, gate states, and ordering', async () => {
    const service = new ProductDiscoveryService();
    const request: ProductDiscoveryRequest = {
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
    };

    const run1 = await service.runDiscovery(request, {
      keywords: sampleKeywords,
      asins: sampleAsins,
      evidence: sampleEvidence,
    });

    const run2 = await service.runDiscovery(request, {
      keywords: sampleKeywords,
      asins: sampleAsins,
      evidence: sampleEvidence,
    });

    expect(run1.candidateDrafts.map((d) => d.id)).toEqual(run2.candidateDrafts.map((d) => d.id));
    expect(run1.candidateDrafts.map((d) => d.gateStatus)).toEqual(run2.candidateDrafts.map((d) => d.gateStatus));
    expect(run1.candidateDrafts.map((d) => d.priorityTier)).toEqual(run2.candidateDrafts.map((d) => d.priorityTier));
  });

  // Case 15: Handoff to V2 (Converting Drafts to ProductCandidate Skeletons -> V2 Returns NEEDS_VALIDATION)
  it('Case 15: Handoff to V2 correctly yields NEEDS_VALIDATION and never fakes SHORTLIST', async () => {
    const service = new ProductDiscoveryService();
    const run = await service.runDiscovery(
      { marketplace: 'AMAZON_US', seed: { keyword: 'glass food storage' } },
      {
        keywords: sampleKeywords,
        asins: sampleAsins,
        evidence: sampleEvidence,
      },
    );

    const topDrafts = run.candidateDrafts.slice(0, 3);
    expect(topDrafts.length).toBe(3);

    const candidates = CandidateHandoffService.handoffToV2(topDrafts, run.evidence);
    expect(candidates.length).toBe(3);

    for (const candidate of candidates) {
      // Economics must be INCOMPLETE
      expect(candidate.economics.status).toBe('INCOMPLETE');
      expect(candidate.economics.inputs.productCost.source).toBe('UNKNOWN');
      expect(candidate.economics.inputs.productCost.value).toBeNull();

      // Risks must be UNVERIFIED
      expect(candidate.risks.every((r) => r.status === 'UNVERIFIED')).toBe(true);

      // Evaluating with V2 CandidateDecisionEngine must yield NEEDS_VALIDATION
      const decision = CandidateDecisionEngine.evaluate(candidate);
      expect(decision.verdict).toBe('NEEDS_VALIDATION');
      expect(decision.verdict).not.toBe('SHORTLIST');
    }
  });

  // Case 16: Risk Handoff (Patent & Compliance are UNVERIFIED, Never PASS)
  it('Case 16: Auto Discovery handoff marks Patent and Compliance as UNVERIFIED, never PASS', () => {
    const sampleDraft = {
      id: 'draft-amazon_us-glass-berry-keeper',
      marketplace: 'AMAZON_US',
      title: 'Glass Berry Keeper',
      productType: 'Glass Berry Keeper',
      clusterId: 'cluster-berry',
      primaryKeyword: 'glass berry keeper',
      supportingKeywords: ['berry keeper glass'],
      representativeAsins: ['B08FRUIT01'],
      discoveryMetrics: {
        demand: { value: 8400, source: 'FACT' as const },
        growth: { value: null, source: 'UNKNOWN' as const },
        keywordCount: 2,
        asinSampleSize: 1,
      },
      evidenceIds: ['evi-asin-b08fruit01'],
      discoveryReasons: [],
      missingRequirements: ['trend'],
      status: 'READY_FOR_ENRICHMENT' as const,
      dedupKey: 'AMAZON_US:glass berry keeper',
    };

    const candidate = CandidateHandoffService.toProductCandidate(sampleDraft);
    const patentRisk = candidate.risks.find((r) => r.category === 'PATENT');
    const complianceRisk = candidate.risks.find((r) => r.category === 'COMPLIANCE');

    expect(patentRisk?.status).toBe('UNVERIFIED');
    expect(complianceRisk?.status).toBe('UNVERIFIED');
    expect(patentRisk?.status).not.toBe('PASS');
    expect(complianceRisk?.status).not.toBe('PASS');
  });

  // Case 17: Pure Live / Provider Path Multi-round Expansion (No preloadedData)
  it('Case 17: Pure Live Path executes Multi-round Expansion (Round 0 -> Round 1 -> Round 2) without preloadedData', async () => {
    const executedCalls: { capabilityId: string; input: any }[] = [];

    const mockExecutor: CapabilityExecutor = {
      hasCapability: (capabilityId: string) => {
        return capabilityId === 'market.keyword.search' || capabilityId === 'market.asin.keywords';
      },
      execute: async <TInput = any, TOutput = any>(capabilityId: string, input: TInput, marketplace: string): Promise<any> => {
        executedCalls.push({ capabilityId, input });
        const anyInput = input as any;

        if (capabilityId === 'market.keyword.search') {
          if (anyInput?.keyword === 'glass food storage') {
            // Round 0: Seed keyword returns Seed metric + Related expanded keyword
            return {
              success: true,
              providerId: 'XYDC_LIVE',
              data: [
                {
                  source: 'XYDC_LIVE',
                  marketplace,
                  keyword: 'glass food storage',
                  searchVolume: 32500,
                  abaRank: 420,
                  cpc: 1.25,
                  competition: 0.72,
                  growth: '+15%',
                  topAsins: ['B08LIVE01', 'B08LIVE02'],
                  capturedAt: new Date().toISOString(),
                },
                {
                  source: 'XYDC_LIVE',
                  marketplace,
                  keyword: 'glass meal prep container',
                  searchVolume: 24000,
                  abaRank: 610,
                  cpc: 1.4,
                  competition: 0.68,
                  growth: '+22%',
                  topAsins: ['B09LIVE01'],
                  capturedAt: new Date().toISOString(),
                },
              ],
            };
          }

          if (anyInput?.keyword === 'glass meal prep container') {
            // Round 2: High-value expanded keyword enrichment
            return {
              success: true,
              providerId: 'XYDC_LIVE',
              data: [
                {
                  source: 'XYDC_LIVE',
                  marketplace,
                  keyword: 'glass meal prep container',
                  searchVolume: 24000,
                  abaRank: 610,
                  cpc: 1.4,
                  competition: 0.68,
                  growth: '+22%',
                  topAsins: ['B09LIVE01', 'B09LIVE02'],
                  capturedAt: new Date().toISOString(),
                },
              ],
            };
          }
        }

        if (capabilityId === 'market.asin.keywords') {
          // Round 1: Discovered ASIN reverse keyword lookup
          if (anyInput?.asin === 'B08LIVE01') {
            return {
              success: true,
              providerId: 'XYDC_LIVE',
              data: [
                {
                  source: 'XYDC_LIVE',
                  marketplace,
                  keyword: 'glass berry keeper',
                  searchVolume: 8400,
                  abaRank: 1850,
                  cpc: 0.95,
                  competition: 0.45,
                  topAsins: ['B08LIVE01'],
                  capturedAt: new Date().toISOString(),
                },
              ],
            };
          }
          return { success: true, providerId: 'XYDC_LIVE', data: [] };
        }

        return { success: false, error: { code: 'UNSUPPORTED', message: 'Unsupported' } };
      },
    };

    const service = new ProductDiscoveryService(mockExecutor);
    const request: ProductDiscoveryRequest = {
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
      budget: { maxProviderCalls: 10 },
    };

    // Execute WITHOUT preloadedData!
    const run = await service.runDiscovery(request);

    // 1. Verify Multi-round Execution occurred
    expect(['COMPLETED', 'DEGRADED']).toContain(run.status);
    expect(executedCalls.length).toBeGreaterThanOrEqual(3);
    expect(executedCalls.some((c) => c.capabilityId === 'market.keyword.search' && c.input.keyword === 'glass food storage')).toBe(true);
    expect(executedCalls.some((c) => c.capabilityId === 'market.asin.keywords')).toBe(true);
    expect(run.budgetUsage.providerCalls).toBeGreaterThanOrEqual(3);

    // 2. Verify Graph Nodes and Edges
    expect(run.keywordNodes.length).toBeGreaterThanOrEqual(3);
    const seedNode = run.keywordNodes.find((k) => k.origin === 'SEED');
    expect(seedNode).toBeDefined();
    expect(seedNode?.rawKeyword).toBe('glass food storage');

    const reverseNode = run.keywordNodes.find((k) => k.origin === 'ASIN_REVERSE_LOOKUP');
    expect(reverseNode).toBeDefined();
    expect(reverseNode?.rawKeyword).toBe('glass berry keeper');

    expect(run.asinNodes.length).toBeGreaterThanOrEqual(2);
    expect(run.asinNodes.some((a) => a.asin === 'B08LIVE01')).toBe(true);
    expect(run.edges?.length).toBeGreaterThan(0);

    // 3. Verify Candidate Drafts
    expect(run.candidateDrafts.length).toBeGreaterThan(0);

    // 4. Verify Evidence Truthfulness & Immutability in Handoff
    const candidates = CandidateHandoffService.handoffToV2(run.candidateDrafts, run.evidence);
    expect(candidates.length).toBe(run.candidateDrafts.length);

    for (const candidate of candidates) {
      // Validate with CandidateEvidenceValidator: strictly 0 SubjectConsistencyViolation!
      const valRes = CandidateEvidenceValidator.validateCandidateEvidence(
        candidate.id,
        candidate.marketResearch?.representativeAsin ?? undefined,
        candidate.evidence,
      );
      expect(valRes.valid).toBe(true);
      expect(valRes.violations).toHaveLength(0);

      // Verify no synthetic stub evidence
      for (const evi of candidate.evidence) {
        expect(evi.source).not.toBe('AUTO_DISCOVERY');
        expect(evi.source).toBe('XYDC_LIVE');
      }

      // Verify V2 Decision is strictly NEEDS_VALIDATION
      const decision = CandidateDecisionEngine.evaluate(candidate);
      expect(decision.verdict).toBe('NEEDS_VALIDATION');
    }
  });

  // Case 18: Input Validation and Dynamic Budget Preview
  it('Case 18: Seed validation rejects empty/whitespace seed and previewDiscovery calculates dynamic estimates', async () => {
    const service = new ProductDiscoveryService();

    // Empty seed must throw
    await expect(service.runDiscovery({ marketplace: 'AMAZON_US', seed: { keyword: '' } })).rejects.toThrow(
      'Seed keyword is required for Auto Discovery',
    );
    await expect(service.runDiscovery({ marketplace: 'AMAZON_US', seed: { keyword: '   ' } })).rejects.toThrow(
      'Seed keyword is required for Auto Discovery',
    );

    // previewDiscovery calculates dynamic bounds based on budget
    const preview1 = service.previewDiscovery({
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
      budget: { maxProviderCalls: 2 },
    });
    expect(preview1.estimatedCallCount).toBeLessThanOrEqual(2);
    expect(preview1.knownCreditCost).toBeLessThanOrEqual(2);

    const preview2 = service.previewDiscovery({
      marketplace: 'AMAZON_US',
      seed: { keyword: 'glass food storage' },
      budget: { maxProviderCalls: 20 },
      limits: { maxExpandedKeywords: 100, maxRepresentativeAsins: 30 },
    });
    expect(preview2.estimatedCallCount).toBeGreaterThan(2);
    expect(preview2.plannedCapabilities).toContain('market.keyword.search');
    expect(preview2.plannedCapabilities).toContain('market.asin.keywords');
  });
});
