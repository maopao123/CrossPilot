import {
  CandidateEnrichmentService,
  EnrichedCandidateHandoffService,
  CandidateDecisionEngine,
  CandidateEvidenceValidator,
  CapabilityExecutor,
} from '../src/index.js';
import type {
  CandidateDraft,
  CandidateEnrichmentRequest,
  EvidenceItem,
  VocProductAnalysisResult,
} from '@crosspilot/shared';

function baseDraft(overrides: Partial<CandidateDraft> = {}): CandidateDraft {
  return {
    id: 'draft-amazon_us-toothbrush-holder',
    marketplace: 'AMAZON_US',
    title: 'Toothbrush Holder',
    productType: 'Toothbrush Holder',
    clusterId: 'cluster-toothbrush-holder',
    primaryKeyword: 'toothbrush holder',
    supportingKeywords: ['electric toothbrush holder'],
    representativeAsins: ['B0BFGNSXYL', 'B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'],
    discoveryMetrics: {
      demand: { value: 27057, source: 'FACT', evidenceId: 'evi-kw-seed' },
      growth: { value: null, source: 'UNKNOWN' },
      keywordCount: 2,
      asinSampleSize: 5,
    },
    evidenceIds: ['evi-kw-seed'],
    discoveryReasons: [
      {
        code: 'DEMAND_SIGNAL',
        conclusion: 'Seed keyword has measurable ABA demand',
        metricIds: ['searchVolume'],
        evidenceIds: ['evi-kw-seed'],
      },
    ],
    missingRequirements: [],
    status: 'READY_FOR_ENRICHMENT',
    dedupKey: 'AMAZON_US:toothbrush holder',
    gateStatus: 'PASS',
    ...overrides,
  };
}

const seedEvidence: EvidenceItem = {
  id: 'evi-kw-seed',
  scope: 'KEYWORD',
  subjectId: 'kw-amazon_us-toothbrush-holder',
  source: 'xydc',
  content: 'Keyword search metric for "toothbrush holder": searchVolume=27057',
  capturedAt: '2026-09-15T00:00:00Z',
};

function detailExecutor(prices: Record<string, number | null>, extras?: {
  voc?: VocProductAnalysisResult;
  failAsins?: string[];
  vocCalls?: number;
  maxCallsBeforeVocBlock?: number;
}): CapabilityExecutor {
  let calls = 0;
  return {
    hasCapability: (id: string) =>
      id === 'market.product.detail' ||
      id === 'review.product.health' ||
      id === 'market.product.trend' ||
      id === 'voc.product.analyze',
    execute: async <TInput = any>(capabilityId: string, input: TInput): Promise<any> => {
      calls += 1;
      const asin = (input as any)?.asin as string;
      if (capabilityId === 'voc.product.analyze') {
        if (extras?.maxCallsBeforeVocBlock != null && calls > extras.maxCallsBeforeVocBlock) {
          return { success: false, error: { code: 'BUDGET', message: 'should not be called' } };
        }
        extras && (extras.vocCalls = (extras.vocCalls || 0) + 1);
        if (!extras?.voc) {
          return { success: true, providerId: 'firecrawl', data: { painPoints: [], analyzedReviewCount: 0 } };
        }
        return { success: true, providerId: 'firecrawl', data: extras.voc };
      }
      if (capabilityId === 'market.product.detail') {
        if (extras?.failAsins?.includes(asin)) {
          return { success: false, error: { code: 'NOT_FOUND', message: 'missing' } };
        }
        const price = prices[asin];
        return {
          success: true,
          providerId: 'xydc',
          costCredits: 1,
          data: {
            asin,
            title: `Product ${asin}`,
            price: price === undefined ? 12.99 : price,
            rating: 4.6,
            reviewCount: 100,
          },
        };
      }
      if (capabilityId === 'review.product.health') {
        return {
          success: true,
          providerId: 'xydc',
          data: { asin, averageRating: 4.6, totalReviewCount: 100, analyzedReviewCount: null },
        };
      }
      if (capabilityId === 'market.product.trend') {
        return { success: true, providerId: 'xydc', data: [{ metric: 'BSR', direction: 'STABLE' }] };
      }
      return { success: false, error: { code: 'UNSUPPORTED', message: capabilityId } };
    },
  };
}

describe('Product Research Phase 2B — Candidate Enrichment Acceptance (Cases 1-18)', () => {
  it('Case 1: Draft → EnrichedCandidate with competitors / price / concept / gate / evidenceIds', async () => {
    const service = new CandidateEnrichmentService(detailExecutor({ B0BFGNSXYL: 9.99, B08LIVE02: 12.5, B08LIVE03: 14 }));
    const run = await service.enrich({
      draft: baseDraft(),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 3, enableTextVoc: false, enableProductTrend: false, enableReviewHealth: false },
    });

    expect(run.enriched.title).toBe('Toothbrush Holder');
    expect(run.enriched.competitors.length).toBeGreaterThan(0);
    expect(run.enriched.pricePositioning.sampleSize).toBeGreaterThan(0);
    expect(run.enriched.concept.productType).toBe('Toothbrush Holder');
    expect(run.enriched.gate.status).toMatch(/READY_FOR_HANDOFF|DEGRADED_READY/);
    expect(run.enriched.evidenceIds.length).toBeGreaterThan(0);
  });

  it('Case 2: requested 5 competitors / 2 succeed → actualSampleSize=2', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor(
        { B0BFGNSXYL: 9.99, B08LIVE02: 11 },
        { failAsins: ['B08LIVE03', 'B08LIVE04', 'B08LIVE05'] },
      ),
    );
    const run = await service.enrich({
      draft: baseDraft(),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 5, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    expect(run.enriched.competitorSample.requestedSampleSize).toBe(5);
    expect(run.enriched.competitorSample.actualSampleSize).toBe(2);
    expect(run.enriched.competitors).toHaveLength(2);
  });

  it('Case 3: missing competitor price stays UNKNOWN / undefined, never 0', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: null }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const competitor = run.enriched.competitors[0];
    expect(competitor.price?.value ?? null).toBeNull();
    expect(competitor.price?.source === 'UNKNOWN' || competitor.price == null).toBe(true);
    expect(competitor.price?.value).not.toBe(0);
  });

  it('Case 4: External VOC sourceType is EXTERNAL_VOC and never claims Amazon buyer review', async () => {
    const voc: VocProductAnalysisResult = {
      asin: 'B0BFGNSXYL',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      totalReviewCount: null,
      analyzedReviewCount: 25,
      averageRating: null,
      painPoints: [
        {
          topic: 'drainage',
          frequency: 11,
          sampleSize: 25,
          scope: 'PRODUCT',
          quotes: [{ quoteText: 'water sits at the bottom', url: 'https://reddit.com/r/x' }],
        },
      ],
      praisePoints: [],
      buyerMotivations: [],
      summary: 'External public discussions',
      evidenceNotice: 'EXTERNAL_VOC',
    };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { voc, failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableReviewHealth: false, enableProductTrend: false, enableTextVoc: true },
    });
    expect(run.enriched.voc.sourceType).toBe('EXTERNAL_VOC');
    const blob = JSON.stringify(run.enriched.voc).toLowerCase();
    expect(blob.includes('amazon buyer review') || blob.includes('amazon 买家评论')).toBe(false);
  });

  it('Case 5: VOC denominator 11/25 → 44%; missing denominator → percentage null', async () => {
    const voc: VocProductAnalysisResult = {
      asin: 'B0BFGNSXYL',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      totalReviewCount: null,
      analyzedReviewCount: 25,
      averageRating: null,
      painPoints: [
        { topic: 'drainage', frequency: 11, sampleSize: 25, quotes: [{ quoteText: 'no drain' }] },
        { topic: 'wobble', frequency: 3, quotes: [{ quoteText: 'tips over' }] },
      ],
      praisePoints: [],
      buyerMotivations: [],
      summary: 'external',
      evidenceNotice: 'EXTERNAL_VOC',
    };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { voc, failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableReviewHealth: false, enableProductTrend: false },
    });
    const drainage = run.enriched.voc.painPoints.find((p) => p.label.toLowerCase().includes('drainage'));
    expect(drainage?.observationCount).toBe(11);
    expect(drainage?.denominator).toBe(25);
    expect(drainage?.percentage).toBe(44);
    const wobble = run.enriched.voc.painPoints.find((p) => p.label.toLowerCase().includes('wobble'));
    expect(wobble?.percentage).toBeNull();
  });

  it('Case 6: no VOC data → empty painPoints, missing textVoc, no fabricated themes', async () => {
    const service = new CandidateEnrichmentService({
      hasCapability: (id) => id === 'market.product.detail',
      execute: async <TInput = any, TOutput = any>(capabilityId: string, input: TInput): Promise<any> => {
        const anyInput = input as any;
        if (capabilityId === 'market.product.detail') {
          return { success: true, providerId: 'xydc', data: { asin: anyInput.asin, title: 'P', price: 10 } };
        }
        return { success: false, error: { code: 'UNAVAILABLE', message: 'no voc' } };
      },
    });
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: true },
    });
    expect(run.enriched.voc.sourceType).toBe('UNAVAILABLE');
    expect(run.enriched.voc.painPoints).toEqual([]);
    expect(run.enriched.voc.missingDimensions).toContain('textVoc');
  });

  it('Case 7: CATEGORY evidence cannot become ASIN buyer pain FACT', async () => {
    const categoryEvi: EvidenceItem = {
      id: 'evi-cat-fake',
      scope: 'CATEGORY',
      subjectId: 'Home & Kitchen',
      source: 'xydc',
      content: '该商品买家抱怨排水差',
      capturedAt: '2026-09-15T00:00:00Z',
    };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence, categoryEvi],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    expect(run.enriched.voc.painPoints.some((p) => p.evidenceIds.includes('evi-cat-fake'))).toBe(false);
  });

  it('Case 8: frozen price fixture yields identical min/median/max/positioning', async () => {
    const req: CandidateEnrichmentRequest = {
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL', 'B08LIVE02', 'B08LIVE03'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 3, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    };
    const run1 = await new CandidateEnrichmentService(detailExecutor({ B0BFGNSXYL: 10, B08LIVE02: 12, B08LIVE03: 20 })).enrich(req);
    const run2 = await new CandidateEnrichmentService(detailExecutor({ B0BFGNSXYL: 10, B08LIVE02: 12, B08LIVE03: 20 })).enrich(req);
    expect(run1.enriched.pricePositioning).toEqual(run2.enriched.pricePositioning);
    expect(run1.enriched.pricePositioning.min).toBe(10);
    expect(run1.enriched.pricePositioning.median).toBe(12);
    expect(run1.enriched.pricePositioning.max).toBe(20);
  });

  it('Case 9: suggested target price is ESTIMATE or ASSUMPTION, never FACT', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99, B08LIVE02: 12 }, { failAsins: ['B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft(),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 2, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    expect(run.enriched.pricePositioning.suggestedTargetPrice?.source).not.toBe('FACT');
    expect(['ESTIMATE', 'ASSUMPTION']).toContain(run.enriched.pricePositioning.suggestedTargetPrice?.source);
  });

  it('Case 10: differentiation without evidence is LOW + validationRequired', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    for (const hyp of run.enriched.differentiationHypotheses) {
      if (hyp.evidenceIds.length === 0) {
        expect(hyp.confidence).toBe('LOW');
        expect(hyp.validationRequired).toBe(true);
      }
    }
  });

  it('Case 11: unsupported LLM-like spec without evidence is HYPOTHESIS not FACT', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const unsupported = (run.enriched.concept.specifications || []).filter((s) => s.evidenceIds.length === 0);
    for (const spec of unsupported) {
      expect(spec.status).not.toBe('FACT');
    }
  });

  it('Case 12: Candidate A PRODUCT evidence is not attached to Candidate B', async () => {
    const foreign: EvidenceItem = {
      id: 'evi-asin-OTHER',
      scope: 'PRODUCT',
      subjectId: 'B0OTHER999',
      source: 'xydc',
      content: 'Title: Other product',
      capturedAt: '2026-09-15T00:00:00Z',
    };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence, foreign],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    expect(run.enriched.evidenceIds).not.toContain('evi-asin-OTHER');
    expect(run.evidence.some((e) => e.id === 'evi-asin-OTHER' && run.enriched.evidenceIds.includes(e.id))).toBe(false);
  });

  it('Case 13: handoff does not mutate evidence id / subjectId / scope', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const before = run.evidence.map((e) => ({ id: e.id, subjectId: e.subjectId, scope: e.scope }));
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(run.enriched, run.evidence);
    const afterById = new Map(run.evidence.map((e) => [e.id, e]));
    for (const snap of before) {
      const current = afterById.get(snap.id);
      expect(current?.subjectId).toBe(snap.subjectId);
      expect(current?.scope).toBe(snap.scope);
    }
    for (const evi of candidate.evidence) {
      const original = afterById.get(evi.id);
      expect(original).toBeDefined();
      expect(evi.subjectId).toBe(original!.subjectId);
      expect(evi.scope).toBe(original!.scope);
    }
  });

  it('Case 14: manual productCost FACT survives handoff', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
      manualInputs: { productCost: { value: 8, source: 'FACT', basis: 'user quote' } },
    });
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(
      run.enriched,
      run.evidence,
      run.request.manualInputs,
    );
    expect(candidate.economics.inputs.productCost.value).toBe(8);
    expect(candidate.economics.inputs.productCost.source).toBe('FACT');
  });

  it('Case 15: missing critical economics → V2 NEEDS_VALIDATION', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(run.enriched, run.evidence);
    const decision = CandidateDecisionEngine.evaluate(candidate);
    expect(decision.verdict).toBe('NEEDS_VALIDATION');
    expect(decision.verdict).not.toBe('SHORTLIST');
  });

  it('Case 16: no patent/compliance evidence → UNVERIFIED', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(run.enriched, run.evidence);
    expect(candidate.risks.find((r) => r.category === 'PATENT')?.status).toBe('UNVERIFIED');
    expect(candidate.risks.find((r) => r.category === 'COMPLIANCE')?.status).toBe('UNVERIFIED');
  });

  it('Case 17: budget exhaustion before text VOC keeps competitor data and degrades', async () => {
    const vocCalls = { vocCalls: 0 };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, vocCalls as any),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: true, enableReviewHealth: false, enableProductTrend: false },
      budget: { maxProviderCalls: 1, maxExpensiveCalls: 0 },
    });
    expect(run.enriched.competitors.length).toBeGreaterThan(0);
    expect(run.enriched.voc.sourceType).toBe('UNAVAILABLE');
    expect(run.status).toBe('DEGRADED');
    expect(run.enriched.budgetUsage.stoppedByBudget).toBe(true);
  });

  it('Case 18: identical frozen fixture → stable competitor selection / price / gate / evidence mapping', async () => {
    const req: CandidateEnrichmentRequest = {
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL', 'B08LIVE02'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 2, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    };
    const mk = () => new CandidateEnrichmentService(detailExecutor({ B0BFGNSXYL: 10, B08LIVE02: 14 }));
    const a = await mk().enrich(req);
    const b = await mk().enrich(req);
    expect(a.enriched.competitors.map((c) => c.asin)).toEqual(b.enriched.competitors.map((c) => c.asin));
    expect(a.enriched.pricePositioning).toEqual(b.enriched.pricePositioning);
    expect(a.enriched.gate.status).toBe(b.enriched.gate.status);
    expect(a.enriched.evidenceIds).toEqual(b.enriched.evidenceIds);
  });

  it('handoff evidence still passes CandidateEvidenceValidator with 0 violations', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(run.enriched, run.evidence);
    const val = CandidateEvidenceValidator.validateCandidateEvidence(
      candidate.id,
      candidate.marketResearch?.representativeAsin ?? undefined,
      candidate.evidence,
    );
    expect(val.valid).toBe(true);
    expect(val.violations).toHaveLength(0);
  });

  it('Case 19: KEYWORD/MARKET evidence from other candidates is not attached or handed off', async () => {
    const foreignKeyword: EvidenceItem = {
      id: 'evi-kw-other-candidate',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-electric-toothbrush-stand',
      source: 'xydc',
      content: 'Keyword metric for electric toothbrush stand',
      capturedAt: '2026-09-15T00:00:00Z',
    };
    const foreignMarket: EvidenceItem = {
      id: 'evi-mkt-other-candidate',
      scope: 'MARKET',
      subjectId: 'draft-amazon_us-bathroom-organizer',
      source: 'xydc',
      content: 'Market overview for bathroom organizer',
      capturedAt: '2026-09-15T00:00:00Z',
    };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence, foreignKeyword, foreignMarket],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    expect(run.enriched.evidenceIds).toContain('evi-kw-seed');
    expect(run.enriched.evidenceIds).not.toContain('evi-kw-other-candidate');
    expect(run.enriched.evidenceIds).not.toContain('evi-mkt-other-candidate');

    const candidate = EnrichedCandidateHandoffService.toProductCandidate(
      run.enriched,
      [...run.evidence, foreignKeyword, foreignMarket],
    );
    expect(candidate.evidence.some((e) => e.id === 'evi-kw-other-candidate')).toBe(false);
    expect(candidate.evidence.some((e) => e.id === 'evi-mkt-other-candidate')).toBe(false);
    expect(candidate.evidence.some((e) => e.id === 'evi-kw-seed')).toBe(true);
  });

  it('Case 20: PRODUCT_PLUS_CATEGORY VOC scope is preserved and not upgraded to PRODUCT', async () => {
    const voc: VocProductAnalysisResult = {
      asin: 'B0BFGNSXYL',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      analysisScope: { type: 'PRODUCT_PLUS_CATEGORY', totalAnalyzedItems: 22 } as any,
      totalReviewCount: null,
      analyzedReviewCount: 22,
      averageRating: null,
      painPoints: [
        {
          topic: 'drainage',
          frequency: 11,
          sampleSize: 22,
          scope: 'PRODUCT_PLUS_CATEGORY',
          quotes: [{ quoteText: 'water sits at the bottom' }],
        },
      ],
      praisePoints: [],
      buyerMotivations: [],
      summary: 'External public discussions',
      evidenceNotice: 'EXTERNAL_VOC',
    };
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { voc, failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableReviewHealth: false, enableProductTrend: false, enableTextVoc: true },
    });
    const drainage = run.enriched.voc.painPoints.find((p) => p.label.toLowerCase().includes('drainage'));
    expect(drainage).toBeDefined();
    expect(drainage?.scope).toBe('PRODUCT_PLUS_CATEGORY');
    expect(drainage?.scope).not.toBe('PRODUCT');
    const vocEvidence = run.evidence.filter((e) => drainage!.evidenceIds.includes(e.id));
    expect(vocEvidence.some((e) => e.scope === 'PRODUCT')).toBe(false);
  });

  it('Case 21: manual economics provenance is not auto-upgraded to FACT', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
      manualInputs: { productCost: { value: 8, source: 'ESTIMATE', basis: 'user estimate' } },
    });
    const candidate = EnrichedCandidateHandoffService.toProductCandidate(
      run.enriched,
      run.evidence,
      run.request.manualInputs,
    );
    expect(candidate.economics.inputs.productCost.value).toBe(8);
    expect(candidate.economics.inputs.productCost.source).toBe('ESTIMATE');
    expect(candidate.economics.inputs.productCost.source).not.toBe('FACT');
  });

  it('Case 22: generated evidence capturedAt is realtime, not a frozen fixture timestamp', async () => {
    const before = Date.now();
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    const generated = run.evidence.filter((e) => e.id.startsWith('evi-comp-'));
    expect(generated.length).toBeGreaterThan(0);
    for (const evi of generated) {
      expect(evi.capturedAt).not.toBe('2026-09-15T00:00:00Z');
      const ts = Date.parse(evi.capturedAt || '');
      expect(Number.isFinite(ts)).toBe(true);
      expect(ts).toBeGreaterThanOrEqual(before - 1000);
    }
  });

  it('Case 23: sampleSize=1 does not claim MAINSTREAM positioning', async () => {
    const service = new CandidateEnrichmentService(
      detailExecutor({ B0BFGNSXYL: 9.99 }, { failAsins: ['B08LIVE02', 'B08LIVE03', 'B08LIVE04', 'B08LIVE05'] }),
    );
    const run = await service.enrich({
      draft: baseDraft({ representativeAsins: ['B0BFGNSXYL'] }),
      marketplace: 'AMAZON_US',
      extraEvidence: [seedEvidence],
      options: { maxCompetitors: 1, enableTextVoc: false, enableReviewHealth: false, enableProductTrend: false },
    });
    expect(run.enriched.pricePositioning.sampleSize).toBe(1);
    expect(run.enriched.pricePositioning.positioning).toBe('UNKNOWN');
    expect(run.enriched.pricePositioning.suggestedTargetPrice?.source).toBe('ESTIMATE');
    expect(run.enriched.pricePositioning.suggestedTargetPrice?.value).toBe(9.99);
  });
});
