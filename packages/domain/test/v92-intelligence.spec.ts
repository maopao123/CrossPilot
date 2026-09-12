import { ErrorCodes } from '@crosspilot/shared';
import {
  AmazonProductResearchRunner,
  EvidenceEngine,
  FactEngine,
  InMemoryIntelligenceStore,
  InMemoryPlaybookStore,
  PlaybookEngine,
  RecommendationEngine,
  VocIntelligenceEngine,
} from '../src/index.js';
import type { CreatePlaybookInput, PlaybookJsonSchema } from '@crosspilot/shared';

const researchInputSchema: PlaybookJsonSchema = {
  type: 'object',
  properties: {
    keyword: { type: 'string' },
    category: { type: 'string' },
    marketplace: { type: 'string' },
    searchVolume: { type: 'number' },
  },
  required: ['keyword', 'category'],
};

const researchOutputSchema: PlaybookJsonSchema = {
  type: 'object',
  properties: {
    decision: { type: 'string' },
    listingBrief: { type: 'string' },
    opportunityScore: { type: 'number' },
  },
  required: ['decision', 'listingBrief'],
};

function researchPlaybook(): CreatePlaybookInput {
  return {
    name: 'amazon-product-research',
    version: '1.0.0',
    status: 'ACTIVE',
    inputSchema: researchInputSchema,
    outputSchema: researchOutputSchema,
    definition: { kind: 'amazon-product-research' },
  };
}

describe('V9.2 Fact / Evidence / Recommendation / Research / VOC', () => {
  const ws = 'ws-intel';

  it('creates a fact with source, timestamp and value', async () => {
    const facts = new FactEngine(new InMemoryIntelligenceStore());
    const fact = await facts.createFact(ws, {
      factType: 'PRICE',
      metric: 'competitor_price_median',
      valueJson: { value: 29.99 },
      sourceProvider: 'amazon_listing',
      sourceReference: 'B0TEST',
    });
    expect(fact.id).toBeTruthy();
    expect(fact.valueJson).toEqual({ value: 29.99 });
    expect(fact.observedAt).toBeTruthy();
    expect(fact.sourceProvider).toBe('amazon_listing');
  });

  it('evidence must reference an existing fact', async () => {
    const store = new InMemoryIntelligenceStore();
    const evidence = new EvidenceEngine(store);
    await expect(
      evidence.createEvidence(ws, {
        factId: 'missing',
        sourceType: 'FACT',
        sourceId: 'missing',
        quote: 'nope',
        confidence: 0.5,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.FACT_NOT_FOUND });
  });

  it('recommendation requires evidence and lands in WAITING_APPROVAL', async () => {
    const store = new InMemoryIntelligenceStore();
    const facts = new FactEngine(store);
    const evidence = new EvidenceEngine(store);
    const recs = new RecommendationEngine(store);
    const fact = await facts.createFact(ws, {
      factType: 'PRICE',
      metric: 'competitor_price_median',
      valueJson: { value: 29.99 },
      sourceProvider: 'amazon_listing',
      sourceReference: 'B0TEST',
    });
    const ev = await evidence.createEvidence(ws, {
      factId: fact.id,
      sourceType: 'FACT',
      sourceId: fact.id,
      quote: 'median=29.99',
      confidence: 0.8,
    });
    const rec = await recs.createRecommendation(ws, {
      decision: 'ENTER_MARKET',
      reason: 'Price gap vs median',
      confidence: 0.7,
      evidenceIds: [ev.id],
    });
    expect(rec.status).toBe('WAITING_APPROVAL');
    await expect(
      recs.createRecommendation(ws, {
        decision: 'ENTER_MARKET',
        reason: 'no evidence',
        confidence: 0.1,
        evidenceIds: [],
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.RECOMMENDATION_EVIDENCE_REQUIRED });
  });

  it('recommendation lifecycle GENERATED→…→VERIFIED without provider dispatch', async () => {
    const store = new InMemoryIntelligenceStore();
    const facts = new FactEngine(store);
    const evidence = new EvidenceEngine(store);
    const recs = new RecommendationEngine(store);
    const fact = await facts.createFact(ws, {
      factType: 'PRICE',
      metric: 'competitor_price_median',
      valueJson: { value: 10 },
      sourceProvider: 'test',
      sourceReference: 'ref',
    });
    const ev = await evidence.createEvidence(ws, {
      factId: fact.id,
      sourceType: 'FACT',
      sourceId: fact.id,
      quote: 'q',
      confidence: 1,
    });
    const rec = await recs.createRecommendation(ws, {
      decision: 'WATCH',
      reason: 'ok',
      confidence: 0.5,
      evidenceIds: [ev.id],
    });
    const approved = await recs.transition(ws, rec.id, 'APPROVED');
    expect(approved.status).toBe('APPROVED');
    const executed = await recs.transition(ws, rec.id, 'EXECUTED');
    expect(executed.status).toBe('EXECUTED');
    expect(executed.executionDispatched).toBe(false);
    const verified = await recs.transition(ws, rec.id, 'VERIFIED');
    expect(verified.status).toBe('VERIFIED');
    await expect(recs.transition(ws, rec.id, 'APPROVED')).rejects.toMatchObject({
      code: ErrorCodes.RECOMMENDATION_INVALID_STATE,
    });
  });

  it('VOC intelligence classifies pain points and emits listing artifacts', () => {
    const voc = new VocIntelligenceEngine().analyze({
      reviews: [
        'The lid is flimsy and started to leak after a week',
        'I love the sturdy marble look and quality',
        'Wish they would add a drainage hole',
      ],
    });
    expect(voc.painPoints.length).toBeGreaterThan(0);
    expect(voc.outputs.listingImprovement).toBeTruthy();
    expect(voc.outputs.creativeBrief).toBeTruthy();
    expect(voc.outputs.customerServiceKnowledge).toContain('痛点：');
  });

  it('startRun still does not execute; executeRun runs amazon-product-research', async () => {
    const playbooks = new InMemoryPlaybookStore();
    const intel = new InMemoryIntelligenceStore();
    const engine = new PlaybookEngine(playbooks, intel);
    const pb = await engine.createPlaybook(ws, researchPlaybook());
    const started = await engine.startRun(
      ws,
      pb.id,
      {
        keyword: 'marble toothbrush holder',
        category: 'Bath',
        searchVolume: 32450,
        products: [
          { asin: 'B0AAA', title: 'A', price: 29.99, rating: 4.5, reviewCount: 200 },
          { asin: 'B0BBB', title: 'B', price: 24.5, rating: 4.1, reviewCount: 80 },
        ],
        reviews: ['The insert is flimsy and broke', 'Great quality holder'],
      },
      'user-1',
    );
    expect(started.status).toBe('CREATED');
    expect(started.run.output).toBeNull();

    const completed = await engine.executeRun(ws, started.runId);
    expect(completed.status).toBe('COMPLETED');
    expect(typeof completed.output?.decision).toBe('string');
    expect(String(completed.output?.listingBrief).length).toBeGreaterThan(10);
    expect(intel.facts.length).toBeGreaterThan(0);
    expect(intel.evidence.length).toBeGreaterThan(0);
    expect(intel.recommendations[0].status).toBe('WAITING_APPROVAL');
    expect(intel.recommendations[0].evidenceIds.length).toBeGreaterThan(0);
  });

  it('AmazonProductResearchRunner canHandle only research playbooks', () => {
    const runner = new AmazonProductResearchRunner(new InMemoryIntelligenceStore());
    expect(
      runner.canHandle({
        id: '1',
        workspaceId: ws,
        name: 'other',
        version: '1.0.0',
        status: 'ACTIVE',
        inputSchema: researchInputSchema,
        outputSchema: researchOutputSchema,
        definition: { kind: 'amazon-product-research' },
        createdAt: '',
        updatedAt: '',
      }),
    ).toBe(true);
  });
});
