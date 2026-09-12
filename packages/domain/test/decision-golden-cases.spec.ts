import { OpportunityScoreEngine } from '../src/research/opportunity-score.engine';
import { ExplanationNumericGroundingValidator } from '../src/research/explanation-numeric-validator';
import {
  KeywordMetric,
  MarketProduct,
  TrendSummary,
  ProductReviewHealthResult,
  VocProductAnalysisResult,
  ResearchEvidence,
} from '@crosspilot/shared';

describe('Decision Golden Cases A through H (Synthetic Fixtures)', () => {
  const highDemandKeyword: KeywordMetric = {
    source: 'XYDC',
    marketplace: 'US',
    keyword: 'smart travel pillow',
    searchVolume: 65000,
    abaRank: 3200,
    cpc: 0.85,
    capturedAt: new Date().toISOString(),
  };

  const lowBarrierProducts: MarketProduct[] = [
    {
      asin: 'B0TEST01',
      externalId: 'B0TEST01',
      source: 'XYDC',
      marketplace: 'US',
      title: 'Travel Pillow A',
      price: 34.99,
      rating: 4.1,
      reviewCount: 95,
      capturedAt: new Date().toISOString(),
    },
    {
      asin: 'B0TEST02',
      externalId: 'B0TEST02',
      source: 'XYDC',
      marketplace: 'US',
      title: 'Travel Pillow B',
      price: 39.99,
      rating: 4.0,
      reviewCount: 130,
      capturedAt: new Date().toISOString(),
    },
  ];

  const redOceanProducts: MarketProduct[] = [
    {
      asin: 'B0RED01',
      externalId: 'B0RED01',
      source: 'XYDC',
      marketplace: 'US',
      title: 'Dominant Pillow Leader',
      price: 12.99,
      rating: 4.8,
      reviewCount: 12500,
      capturedAt: new Date().toISOString(),
    },
    {
      asin: 'B0RED02',
      externalId: 'B0RED02',
      source: 'XYDC',
      marketplace: 'US',
      title: 'Giant Competitor',
      price: 13.49,
      rating: 4.7,
      reviewCount: 8200,
      capturedAt: new Date().toISOString(),
    },
  ];

  const strongTrend: TrendSummary = {
    startValue: 8000,
    endValue: 3500,
    minValue: 3000,
    maxValue: 8500,
    averageValue: 5000,
    changeAbsolute: -4500,
    changePercent: -56.25,
    direction: 'RANK_IMPROVED',
  };

  const moderateReviewHealth: ProductReviewHealthResult = {
    asin: 'B0TEST01',
    marketplace: 'US',
    averageRating: 4.1,
    totalReviewCount: 110,
    analyzedReviewCount: 0,
    supportedDimensions: ['averageRating', 'totalReviewCount'],
    unsupportedDimensions: ['reviewTextMining'],
    summary: 'Moderate review health',
    evidenceNotice: 'Quantitative review health',
  };

  const strongVocAnalysis: VocProductAnalysisResult = {
    asin: 'B0TEST01',
    marketplace: 'US',
    vocSourceType: 'EXTERNAL_VOC',
    totalReviewCount: 110,
    analyzedReviewCount: 30,
    averageRating: null,
    analysisScope: {
      type: 'CATEGORY',
      targetAsin: 'B0TEST01',
      query: 'travel pillow',
      totalAnalyzedItems: 30,
      exactProductItems: 0,
      brandProductItems: 0,
      categoryItems: 28,
      genericItems: 2,
      uniqueSourcePages: 20,
      knownAuthorCount: 15,
      unknownAuthorCount: 15,
      uniqueKnownAuthors: 12,
      searchSnippetCount: 30,
      fullTextCount: 0,
    },
    painPoints: [
      {
        topic: 'Lack of chin support causing neck strain on long flights',
        category: 'PRODUCT_DESIGN',
        frequency: 10,
        percentage: 33.3,
        sampleSize: 30,
        scope: 'CATEGORY',
        severity: 'HIGH',
        quotes: [],
        evidenceIds: ['evi_voc_1'],
      },
    ],
    praisePoints: [],
    buyerMotivations: [],
    desiredFeatures: [
      {
        feature: '360 degree ergonomic contour with memory foam lock',
        frequency: 8,
        percentage: 26.6,
        sampleSize: 30,
        scope: 'CATEGORY',
        quotes: [],
        evidenceIds: ['evi_voc_2'],
      },
    ],
    summary: 'Strong category pain points',
    evidenceNotice: 'Snippet VOC',
  };

  const sampleEvidences: ResearchEvidence[] = [
    { evidenceId: 'evi_kw_1', source: 'XYDC', providerId: 'xydc', type: 'KEYWORD', content: 'Search vol 65000', capturedAt: '', mode: 'LIVE' },
    { evidenceId: 'evi_prod_1', source: 'XYDC', providerId: 'xydc', type: 'MARKET_PRODUCT', content: 'Product low reviews', capturedAt: '', mode: 'LIVE' },
    { evidenceId: 'evi_trend_1', source: 'XYDC', providerId: 'xydc', type: 'TREND', content: 'Trend improved', capturedAt: '', mode: 'LIVE' },
    { evidenceId: 'evi_rev_1', source: 'XYDC', providerId: 'xydc', type: 'REVIEW_METRIC', content: 'Review 4.1 stars', capturedAt: '', mode: 'LIVE' },
  ];

  // Case A: High Demand + Low Competition (Ideal Blue Ocean)
  it('Case A: High Demand + Low Competition yields High score (>= 75) and SUFFICIENT status', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: highDemandKeyword,
      products: lowBarrierProducts,
      topAsinTrend: strongTrend,
      productReviewHealth: moderateReviewHealth,
      vocAnalysis: strongVocAnalysis,
      evidences: sampleEvidences,
    });

    expect(opp.evidenceStatus).toBe('SUFFICIENT');
    expect(opp.overallScore).not.toBeNull();
    expect(opp.overallScore!).toBeGreaterThanOrEqual(75);
    expect(opp.signals.demand.normalizedScore).toBeGreaterThanOrEqual(90);
    expect(opp.signals.competition.normalizedScore).toBeGreaterThanOrEqual(80);
  });

  // Case B: High Demand + Extreme Competition (Red Ocean)
  it('Case B: High Demand + Extreme Competition yields lower score (< 55)', () => {
    const redOceanKeyword: KeywordMetric = {
      ...highDemandKeyword,
      cpc: 3.5, // High CPC penalty
    };
    const matureTrend: TrendSummary = {
      startValue: 3000,
      endValue: 3800,
      minValue: 2900,
      maxValue: 3900,
      averageValue: 3350,
      changeAbsolute: 800,
      changePercent: 26.6,
      direction: 'RANK_DECLINED',
    };
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: redOceanKeyword,
      products: redOceanProducts,
      topAsinTrend: matureTrend,
      productReviewHealth: { ...moderateReviewHealth, averageRating: 4.8 }, // 4.8 rating = mature, hard to disrupt
      vocAnalysis: null,
      evidences: sampleEvidences,
    });

    expect(opp.evidenceStatus).toBe('SUFFICIENT');
    expect(opp.signals.competition.normalizedScore).toBeLessThanOrEqual(20);
    expect(opp.overallScore!).toBeLessThan(55);
  });

  // Case C: Missing Demand Signal -> cannot be SUFFICIENT
  it('Case C: Missing Demand signal degrades status to at most DEGRADED_PASS', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: null, // Demand missing
      products: lowBarrierProducts,
      topAsinTrend: strongTrend,
      productReviewHealth: moderateReviewHealth,
      vocAnalysis: strongVocAnalysis,
      evidences: sampleEvidences,
    });

    expect(opp.signals.demand.status).toBe('MISSING');
    expect(opp.evidenceStatus).toBe('DEGRADED_PASS');
    expect(opp.overallScore).not.toBeNull();
  });

  // Case D: Missing Competition Signal -> cannot be SUFFICIENT
  it('Case D: Missing Competition signal degrades status to at most DEGRADED_PASS', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: highDemandKeyword,
      products: [], // Competition & Commercial missing
      topAsinTrend: strongTrend,
      productReviewHealth: moderateReviewHealth,
      vocAnalysis: strongVocAnalysis,
      evidences: sampleEvidences,
    });

    expect(opp.signals.competition.status).toBe('MISSING');
    expect(opp.evidenceStatus).toBe('DEGRADED_PASS');
    expect(opp.overallScore).not.toBeNull();
  });

  // Case E: Missing both Critical Signals (Demand & Competition) -> INSUFFICIENT
  it('Case E: Missing both Demand and Competition fails gate with INSUFFICIENT', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: null,
      products: [],
      topAsinTrend: strongTrend,
      productReviewHealth: moderateReviewHealth,
      vocAnalysis: strongVocAnalysis,
      evidences: sampleEvidences,
    });

    expect(opp.evidenceStatus).toBe('INSUFFICIENT');
    expect(opp.overallScore).toBeNull();
  });

  // Case F: Low total available signals (< 3) -> INSUFFICIENT
  it('Case F: Fewer than 3 signals available fails gate with INSUFFICIENT', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: highDemandKeyword, // Signal 1: demand
      products: [], // Competition and Commercial are MISSING
      topAsinTrend: strongTrend, // Signal 2: trend
      productReviewHealth: null,
      vocAnalysis: null,
      evidences: sampleEvidences.slice(0, 2),
    });

    // Only 2 signals available (demand, trend) -> availableCount < 3
    expect(opp.evidenceStatus).toBe('INSUFFICIENT');
    expect(opp.overallScore).toBeNull();
  });

  // Case G: High Review Barrier (> 5000) -> low competition score (<= 30)
  it('Case G: Average reviews > 5000 yields low competition score (<= 30)', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      products: redOceanProducts,
    });

    expect(opp.signals.competition.normalizedScore).toBeLessThanOrEqual(30);
  });

  // Case H: Strong VOC Pain Points -> high VOC score (>= 75)
  it('Case H: Strong VOC Pain Points yield high VOC opportunity score (>= 75)', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      vocAnalysis: strongVocAnalysis,
    });

    expect(opp.signals.voc.normalizedScore).toBeGreaterThanOrEqual(75);
  });

  // Numeric Grounding Validator Gate Test
  it('Validates that ExplanationNumericGroundingValidator catches ungrounded engineering dimensions', () => {
    const opp = OpportunityScoreEngine.evaluate({
      keyword: 'smart travel pillow',
      marketplace: 'US',
      keywordMetric: highDemandKeyword,
      products: lowBarrierProducts,
      vocAnalysis: strongVocAnalysis,
    });

    // Engine output should be valid without ungrounded 3.2cm
    const validation = ExplanationNumericGroundingValidator.validate(opp);
    expect(validation.valid).toBe(true);
    expect(validation.violations).toHaveLength(0);

    // If an ungrounded 3.2cm is injected into a recommendation, validator flags it
    const tamperedOpp = {
      ...opp,
      explanation: {
        ...opp.explanation,
        actionableRecommendations: [
          '建议加宽孔径至 3.2cm',
        ],
      },
    };
    const tamperedValidation = ExplanationNumericGroundingValidator.validate(tamperedOpp);
    expect(tamperedValidation.valid).toBe(false);
    expect(tamperedValidation.violations.length).toBeGreaterThan(0);
    expect(tamperedValidation.violations[0].reason).toContain('3.2cm');
  });
});
