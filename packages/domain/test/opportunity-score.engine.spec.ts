import { OpportunityScoreEngine } from '../src/research/opportunity-score.engine';
import {
  KeywordMetric,
  MarketProduct,
  TrendSummary,
  ProductReviewHealthResult,
  VocProductAnalysisResult,
  ResearchEvidence,
} from '@crosspilot/shared';

describe('OpportunityScoreEngine', () => {
  const mockKeywordMetric: KeywordMetric = {
    source: 'XYDC',
    marketplace: 'US',
    keyword: 'marble toothbrush holder',
    searchVolume: 32450,
    abaRank: 18240,
    growth: '+12.5%',
    cpc: 1.25,
    capturedAt: new Date().toISOString(),
  };

  const mockProducts: MarketProduct[] = [
    {
      asin: 'B0BFGNSXYL',
      externalId: 'B0BFGNSXYL',
      source: 'XYDC',
      marketplace: 'US',
      title: 'GFWARE Natural Marble Toothbrush Holder',
      brand: 'GFWARE',
      price: 29.99,
      rating: 4.5,
      reviewCount: 380,
      bsr: 4520,
      capturedAt: new Date().toISOString(),
    },
    {
      asin: 'B08XYZ1234',
      externalId: 'B08XYZ1234',
      source: 'XYDC',
      marketplace: 'US',
      title: 'Generic Resin Toothbrush Holder Stand',
      brand: 'Generic',
      price: 24.99,
      rating: 4.2,
      reviewCount: 190,
      bsr: 8900,
      capturedAt: new Date().toISOString(),
    },
  ];

  const mockTrend: TrendSummary = {
    startValue: 6500,
    endValue: 4520,
    minValue: 4200,
    maxValue: 7100,
    averageValue: 5300,
    changeAbsolute: -1980,
    changePercent: -30.4,
    direction: 'RANK_IMPROVED', // Rank improved = sales climbing
  };

  const mockReviewHealth: ProductReviewHealthResult = {
    asin: 'B0BFGNSXYL',
    marketplace: 'US',
    averageRating: 4.5,
    totalReviewCount: 380,
    analyzedReviewCount: 0,
    supportedDimensions: ['averageRating', 'totalReviewCount'],
    unsupportedDimensions: ['reviewTextMining'],
    summary: 'Rating 4.5 across 380 reviews',
    evidenceNotice: 'Quantitative review health data',
  };

  const mockVoc: VocProductAnalysisResult = {
    asin: 'B0BFGNSXYL',
    marketplace: 'US',
    vocSourceType: 'EXTERNAL_VOC',
    analysisScope: {
      type: 'CATEGORY',
      targetAsin: 'B0BFGNSXYL',
      query: 'marble toothbrush holder',
      totalAnalyzedItems: 25,
      exactProductItems: 0,
      brandProductItems: 0,
      categoryItems: 22,
      genericItems: 3,
      uniqueSourcePages: 18,
      knownAuthorCount: 14,
      unknownAuthorCount: 11,
      uniqueKnownAuthors: 12,
      searchSnippetCount: 25,
      fullTextCount: 0,
    },
    totalReviewCount: 380,
    analyzedReviewCount: 25,
    averageRating: null,
    painPoints: [
      {
        topic: 'Water and moisture drainage issues causing mold/grime at bottom',
        category: 'MAINTENANCE',
        frequency: 7,
        percentage: 28.0,
        sampleSize: 25,
        scope: 'CATEGORY',
        severity: 'MEDIUM',
        quotes: [],
        evidenceIds: ['evi_extvoc_fc_1'],
      },
    ],
    praisePoints: [
      {
        topic: 'Heavy natural stone weight prevents tipping or sliding on vanity',
        category: 'PRODUCT_DESIGN',
        frequency: 6,
        percentage: 24.0,
        sampleSize: 25,
        scope: 'CATEGORY',
        quotes: [],
        evidenceIds: ['evi_extvoc_fc_2'],
      },
    ],
    buyerMotivations: [],
    desiredFeatures: [
      {
        feature: 'Bottom drainage holes or removable base for effortless rinsing',
        frequency: 5,
        percentage: 20.0,
        sampleSize: 25,
        scope: 'CATEGORY',
        quotes: [],
        evidenceIds: ['evi_extvoc_fc_3'],
      },
    ],
    summary: 'Category VOC analysis',
    evidenceNotice: 'Search snippets category VOC',
  };

  const mockEvidences: ResearchEvidence[] = [
    {
      evidenceId: 'evi_kw_1',
      source: 'XYDC',
      providerId: 'xydc',
      type: 'KEYWORD',
      content: 'Keyword marble toothbrush holder search volume 32450',
      capturedAt: new Date().toISOString(),
      mode: 'LIVE',
    },
    {
      evidenceId: 'evi_prod_1',
      source: 'XYDC',
      providerId: 'xydc',
      type: 'MARKET_PRODUCT',
      content: 'B0BFGNSXYL product details',
      capturedAt: new Date().toISOString(),
      mode: 'LIVE',
    },
    {
      evidenceId: 'evi_trend_1',
      source: 'XYDC',
      providerId: 'xydc',
      type: 'TREND',
      content: 'BSR trend RANK_IMPROVED',
      capturedAt: new Date().toISOString(),
      mode: 'LIVE',
    },
    {
      evidenceId: 'evi_rev_1',
      source: 'XYDC',
      providerId: 'xydc',
      type: 'REVIEW_METRIC',
      content: 'Review health 4.5 stars',
      capturedAt: new Date().toISOString(),
      mode: 'LIVE',
    },
    {
      evidenceId: 'evi_extvoc_fc_1',
      source: 'FIRECRAWL',
      providerId: 'firecrawl',
      type: 'EXTERNAL_VOC',
      content: 'Drainage issues snippet',
      capturedAt: new Date().toISOString(),
      mode: 'LIVE',
      confidenceScore: 0.70,
    },
  ];

  it('should compute deterministic score with all 6 signals and pass SUFFICIENT gate', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'marble toothbrush holder',
      marketplace: 'US',
      representativeAsin: 'B0BFGNSXYL',
      keywordMetric: mockKeywordMetric,
      products: mockProducts,
      topAsinTrend: mockTrend,
      productReviewHealth: mockReviewHealth,
      vocAnalysis: mockVoc,
      evidences: mockEvidences,
    });

    expect(opp.evidenceStatus).toBe('SUFFICIENT');
    expect(opp.overallScore).not.toBeNull();
    expect(opp.overallScore).toBeGreaterThan(60);
    expect(opp.overallScore).toBeLessThanOrEqual(100);
    expect(opp.scoreVersion).toBe('v1.0.0');
    expect(opp.scoreConfigVersion).toBe('v1.0.0');
    expect(opp.methodology).toBe('HEURISTIC');
    expect(opp.calibrationStatus).toBe('UNCALIBRATED');
    expect(opp.decisionScope).toBe('KEYWORD_CATEGORY_OPPORTUNITY');
    expect(opp.costBudget.estimatedCostUsd).toBeNull();
    expect(opp.scopeDisclosure.decisionScope).toBe('KEYWORD_CATEGORY_OPPORTUNITY');
    expect(opp.scopeDisclosure.productSampleSize).toBe(2);
    expect(opp.scopeDisclosure.representativeAsin).toBe('B0BFGNSXYL');
    expect(opp.confidence).toBe('HIGH');
    expect(opp.missingSignals).toHaveLength(0);

    // Verify signal scopes
    expect(opp.signals.demand.scope).toBe('KEYWORD_MARKET');
    expect(opp.signals.competition.scope).toBe('TOP_PRODUCTS');
    expect(opp.signals.commercial.scope).toBe('TOP_PRODUCTS');
    expect(opp.signals.trend.scope).toBe('REPRESENTATIVE_PRODUCT');
    expect(opp.signals.reviewHealth.scope).toBe('REPRESENTATIVE_PRODUCT');
    expect(opp.signals.voc.scope).toBe('CATEGORY_EXTERNAL_VOC');

    // Verify weights sum to 1.0
    const totalWeight = Object.values(opp.weights).reduce((a, b) => a + b, 0);
    expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.01);

    // Verify Competition signal is inverted (low review barrier = high opportunity score)
    expect(opp.signals.competition.normalizedScore).toBeGreaterThan(60);
    expect(opp.signals.competition.rawMetrics.topAsinAvgReviews).toBe(285);

    // Verify Trend signal mapped RANK_IMPROVED positively
    expect(opp.signals.trend.normalizedScore).toBeGreaterThanOrEqual(70);

    // Verify Commercial signal price sweet spot ($29.99 is sweet spot 90 + 5 stable bonus = 95)
    expect(opp.signals.commercial.normalizedScore).toBe(95);

    // Verify Structured facts boundary separation & lack of ungrounded 3.2cm
    expect(opp.strengths.length).toBeGreaterThan(0);
    expect(opp.strengths.every((s) => s.level === 'FACT')).toBe(true);
    expect(opp.opportunities.some((o) => o.level === 'INFERENCE')).toBe(true);
    const rec = opp.opportunities.find((o) => o.level === 'RECOMMENDATION');
    expect(rec).toBeDefined();
    expect(rec?.statement).not.toContain('3.2cm');
    expect(rec?.statement).toContain('Bottom drainage holes');
  });

  it('should re-normalize weights when signals are MISSING and not treat missing as 0', () => {
    // Trend and VOC are missing
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'marble toothbrush holder',
      marketplace: 'US',
      representativeAsin: 'B0BFGNSXYL',
      keywordMetric: mockKeywordMetric,
      products: mockProducts,
      topAsinTrend: null,
      productReviewHealth: mockReviewHealth,
      vocAnalysis: null,
      evidences: mockEvidences.slice(0, 2),
    });

    // 4 available signals (demand, competition, commercial, reviewHealth) -> SUFFICIENT
    expect(opp.evidenceStatus).toBe('SUFFICIENT');
    expect(opp.signals.trend.status).toBe('MISSING');
    expect(opp.signals.voc.status).toBe('MISSING');
    expect(opp.signals.trend.normalizedScore).toBeNull();
    expect(opp.signals.voc.normalizedScore).toBeNull();
    expect(opp.signals.trend.contribution).toBeNull();
    expect(opp.signals.voc.contribution).toBeNull();

    // Re-normalized weights for available signals must sum to 1.0
    const activeWeights = [
      opp.weights.demand,
      opp.weights.competition,
      opp.weights.commercial,
      opp.weights.reviewHealth,
    ];
    const sumActive = activeWeights.reduce((a, b) => a + b, 0);
    expect(Math.abs(sumActive - 1.0)).toBeLessThan(0.01);
    expect(opp.weights.trend).toBe(0);
    expect(opp.weights.voc).toBe(0);

    // Score must be calculated without being dragged down by zeros
    expect(opp.overallScore).not.toBeNull();
    expect(opp.overallScore).toBeGreaterThan(70);
  });

  it('should fail Evidence Gate with INSUFFICIENT when fewer than 3 signals are available', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'unknown widget',
      marketplace: 'US',
      keywordMetric: null,
      products: [],
      topAsinTrend: null,
      productReviewHealth: null,
      vocAnalysis: null,
      evidences: [],
    });

    expect(opp.evidenceStatus).toBe('INSUFFICIENT');
    expect(opp.overallScore).toBeNull();
    expect(opp.confidence).toBe('LOW');
  });

  it('should pass with DEGRADED_PASS when 3 signals are available', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'marble toothbrush holder',
      marketplace: 'US',
      keywordMetric: mockKeywordMetric,
      products: mockProducts,
      topAsinTrend: null,
      productReviewHealth: null,
      vocAnalysis: null,
      evidences: mockEvidences.slice(0, 2),
    });

    // Available: demand, competition, commercial (3 signals)
    expect(opp.evidenceStatus).toBe('DEGRADED_PASS');
    expect(opp.overallScore).not.toBeNull();
    expect(opp.confidence).toBe('MEDIUM');
  });
});
