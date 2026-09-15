import { OpportunityScoreEngine, RawResearchInputs } from '../src/research/opportunity-score.engine.js';
import { ResearchEvidence, VocProductAnalysisResult } from '@crosspilot/shared';

describe('Multi-Category Truthfulness Regression Suite (Evidence-Grounded Design Rule)', () => {
  /**
   * Helper to construct raw research inputs for arbitrary categories.
   */
  const createCategoryInputs = (
    keyword: string,
    category: string,
    asin: string,
    vocAnalysis?: VocProductAnalysisResult | null,
    evidences: ResearchEvidence[] = [],
  ): RawResearchInputs => ({
    keyword,
    marketplace: 'AMAZON_US',
    representativeAsin: asin,
    keywordMetric: {
      source: 'XYDC',
      marketplace: 'AMAZON_US',
      keyword,
      searchVolume: 18500,
      abaRank: 22000,
      growth: '+15%',
      cpc: 1.1,
      capturedAt: new Date().toISOString(),
    },
    products: [
      {
        source: 'XYDC',
        marketplace: 'AMAZON_US',
        externalId: asin,
        asin,
        title: `${keyword} Top Competitor Item`,
        price: 26.99,
        rating: 4.4,
        reviewCount: 420,
        capturedAt: new Date().toISOString(),
      },
    ],
    topAsinTrend: {
      startValue: 1200,
      endValue: 980,
      minValue: 950,
      maxValue: 1400,
      averageValue: 1100,
      changeAbsolute: -220,
      changePercent: -18.3,
      direction: 'RANK_IMPROVED',
    },
    productReviewHealth: {
      asin,
      marketplace: 'AMAZON_US',
      averageRating: 4.4,
      totalReviewCount: 420,
      analyzedReviewCount: 0,
      summary: 'Solid rating',
      supportedDimensions: ['averageRating', 'totalReviewCount'],
      unsupportedDimensions: [],
      evidenceNotice: 'Quantitative metrics',
    },
    vocAnalysis,
    evidences,
  });

  /**
   * ==========================================================================
   * Category 1: Fruit Storage Container (Produce Saver)
   * Has verified evidence on "ventilation colander insert to drain moisture".
   * Expectation:
   * - Recommendation generated MUST match this specific evidenced feature.
   * - Recommendation must NOT contain irrelevant category claims (no toothbrush, no shoe dividers).
   * ==========================================================================
   */
  it('Category 1: fruit storage container generates recommendations strictly grounded in its VOC evidence', () => {
    const fruitEvidences: ResearchEvidence[] = [
      {
        evidenceId: 'evi_fruit_colander',
        source: 'FIRECRAWL',
        providerId: 'firecrawl',
        type: 'EXTERNAL_VOC',
        content: 'Buyers love built-in colander strainer basket that separates berries from bottom condensation',
        capturedAt: new Date().toISOString(),
        mode: 'LIVE',
      },
    ];

    const fruitVoc: VocProductAnalysisResult = {
      asin: 'B0FRUIT001',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      totalReviewCount: 30,
      analyzedReviewCount: 30,
      averageRating: null,
      analysisScope: {
        type: 'CATEGORY',
        query: 'fruit storage container',
        totalAnalyzedItems: 30,
        exactProductItems: 0,
        brandProductItems: 0,
        categoryItems: 30,
        genericItems: 0,
        uniqueSourcePages: 20,
        knownAuthorCount: 20,
        unknownAuthorCount: 10,
        uniqueKnownAuthors: 18,
      },
      painPoints: [
        {
          topic: 'Berries rot quickly when trapped in bottom moisture',
          frequency: 14,
          percentage: 46.7,
          sampleSize: 30,
          quotes: [],
          evidenceIds: ['evi_fruit_colander'],
        },
      ],
      praisePoints: [],
      buyerMotivations: [],
      desiredFeatures: [
        {
          feature: 'Removable colander basket insert with bottom drain valve for berries',
          frequency: 12,
          percentage: 40.0,
          sampleSize: 30,
          quotes: [],
          evidenceIds: ['evi_fruit_colander'],
        },
      ],
      summary: 'Fruit storage analysis',
      evidenceNotice: 'Live web discussions',
    };

    const opp = OpportunityScoreEngine.evaluate(
      createCategoryInputs(
        'fruit storage container',
        'Kitchen & Dining > Storage',
        'B0FRUIT001',
        fruitVoc,
        fruitEvidences,
      ),
    );

    const recs = opp.opportunities.filter((o) => o.level === 'RECOMMENDATION');
    expect(recs.length).toBeGreaterThan(0);

    // 1. Must be grounded in the fruit evidence
    const fruitRec = recs[0];
    expect(fruitRec.statement).toContain('Removable colander basket insert with bottom drain valve');
    expect(fruitRec.evidenceIds).toContain('evi_fruit_colander');

    // 2. Must NOT contain fabricated designs from other categories
    expect(fruitRec.statement).not.toContain('电动牙刷');
    expect(fruitRec.statement).not.toContain('靴子');
    expect(fruitRec.statement).not.toContain('喂食器');
  });

  /**
   * ==========================================================================
   * Category 2: Shoe Organizer (Closet Underbed Storage)
   * Has verified evidence on "adjustable heavy-duty dividers for tall winter boots".
   * Expectation:
   * - Recommendation generated MUST match this specific evidenced feature.
   * ==========================================================================
   */
  it('Category 2: shoe organizer generates recommendations strictly grounded in its VOC evidence', () => {
    const shoeEvidences: ResearchEvidence[] = [
      {
        evidenceId: 'evi_shoe_dividers',
        source: 'FIRECRAWL',
        providerId: 'firecrawl',
        type: 'EXTERNAL_VOC',
        content: 'Customers request reinforced adjustable velcro partitions to fit women high-top ankle boots',
        capturedAt: new Date().toISOString(),
        mode: 'LIVE',
      },
    ];

    const shoeVoc: VocProductAnalysisResult = {
      asin: 'B0SHOE0001',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      totalReviewCount: 40,
      analyzedReviewCount: 40,
      averageRating: null,
      analysisScope: {
        type: 'CATEGORY',
        query: 'shoe organizer',
        totalAnalyzedItems: 40,
        exactProductItems: 0,
        brandProductItems: 0,
        categoryItems: 40,
        genericItems: 0,
        uniqueSourcePages: 25,
        knownAuthorCount: 25,
        unknownAuthorCount: 15,
        uniqueKnownAuthors: 22,
      },
      painPoints: [
        {
          topic: 'Fixed slots are too tight for high-top boots and sneakers',
          frequency: 18,
          percentage: 45.0,
          sampleSize: 40,
          quotes: [],
          evidenceIds: ['evi_shoe_dividers'],
        },
      ],
      praisePoints: [],
      buyerMotivations: [],
      desiredFeatures: [
        {
          feature: 'Customizable velcro dividers supporting high-top boots and chunky sneakers',
          frequency: 15,
          percentage: 37.5,
          sampleSize: 40,
          quotes: [],
          evidenceIds: ['evi_shoe_dividers'],
        },
      ],
      summary: 'Shoe organizer analysis',
      evidenceNotice: 'Live discussions',
    };

    const opp = OpportunityScoreEngine.evaluate(
      createCategoryInputs(
        'shoe organizer',
        'Home & Kitchen > Storage',
        'B0SHOE0001',
        shoeVoc,
        shoeEvidences,
      ),
    );

    const recs = opp.opportunities.filter((o) => o.level === 'RECOMMENDATION');
    expect(recs.length).toBeGreaterThan(0);

    // 1. Must be grounded in the shoe evidence
    const shoeRec = recs[0];
    expect(shoeRec.statement).toContain('Customizable velcro dividers supporting high-top boots');
    expect(shoeRec.evidenceIds).toContain('evi_shoe_dividers');

    // 2. Must NOT contain fabricated designs from other categories
    expect(shoeRec.statement).not.toContain('排水孔');
    expect(shoeRec.statement).not.toContain('牙刷');
    expect(shoeRec.statement).not.toContain('保鲜盒');
  });

  /**
   * ==========================================================================
   * Category 3: Pet Feeder (Automatic Timed Feeder)
   * Part A (With Evidence): VOC mentions "anti-jam dual rotor mechanism for large kibble".
   * Part B (WITHOUT Evidence): No desired features in evidence ->
   * System MUST NOT fabricate physical structural design recommendations!
   * ==========================================================================
   */
  it('Category 3: pet feeder with evidence generates grounded advice; WITHOUT evidence, DOES NOT fabricate structural design', () => {
    // ------------------------------------------------------------------------
    // Part A: WITH verified evidence on anti-jam mechanism
    // ------------------------------------------------------------------------
    const petEvidences: ResearchEvidence[] = [
      {
        evidenceId: 'evi_pet_rotor',
        source: 'FIRECRAWL',
        providerId: 'firecrawl',
        type: 'EXTERNAL_VOC',
        content: 'Buyers complain kibble jams in narrow dispensing chute when food diameter exceeds 12mm',
        capturedAt: new Date().toISOString(),
        mode: 'LIVE',
      },
    ];

    const petVocWithEvidence: VocProductAnalysisResult = {
      asin: 'B0PET00001',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      totalReviewCount: 50,
      analyzedReviewCount: 50,
      averageRating: null,
      analysisScope: {
        type: 'CATEGORY',
        query: 'pet feeder',
        totalAnalyzedItems: 50,
        exactProductItems: 0,
        brandProductItems: 0,
        categoryItems: 50,
        genericItems: 0,
        uniqueSourcePages: 30,
        knownAuthorCount: 30,
        unknownAuthorCount: 20,
        uniqueKnownAuthors: 28,
      },
      painPoints: [
        {
          topic: 'Dry food jams in dispenser wheel causing missed meals',
          frequency: 22,
          percentage: 44.0,
          sampleSize: 50,
          quotes: [],
          evidenceIds: ['evi_pet_rotor'],
        },
      ],
      praisePoints: [],
      buyerMotivations: [],
      desiredFeatures: [
        {
          feature: 'Anti-jam dual silicone rotor mechanism accommodating 15mm freeze-dried food',
          frequency: 19,
          percentage: 38.0,
          sampleSize: 50,
          quotes: [],
          evidenceIds: ['evi_pet_rotor'],
        },
      ],
      summary: 'Pet feeder analysis',
      evidenceNotice: 'Live discussions',
    };

    const oppWithEvidence = OpportunityScoreEngine.evaluate(
      createCategoryInputs(
        'automatic pet feeder',
        'Pet Supplies > Feeding & Watering',
        'B0PET00001',
        petVocWithEvidence,
        petEvidences,
      ),
    );

    const recsWithEvidence = oppWithEvidence.opportunities.filter((o) => o.level === 'RECOMMENDATION');
    expect(recsWithEvidence.length).toBeGreaterThan(0);
    expect(recsWithEvidence[0].statement).toContain('Anti-jam dual silicone rotor mechanism');
    expect(recsWithEvidence[0].evidenceIds).toContain('evi_pet_rotor');

    // ------------------------------------------------------------------------
    // Part B: WITHOUT concrete feature evidence (Empty desiredFeatures & no structural claims)
    // ------------------------------------------------------------------------
    const petVocWithoutFeatureEvidence: VocProductAnalysisResult = {
      asin: 'B0PET00001',
      marketplace: 'AMAZON_US',
      vocSourceType: 'EXTERNAL_VOC',
      totalReviewCount: 20,
      analyzedReviewCount: 20,
      averageRating: null,
      analysisScope: {
        type: 'CATEGORY',
        query: 'automatic pet feeder',
        totalAnalyzedItems: 20,
        exactProductItems: 0,
        brandProductItems: 0,
        categoryItems: 20,
        genericItems: 0,
        uniqueSourcePages: 10,
        knownAuthorCount: 10,
        unknownAuthorCount: 10,
        uniqueKnownAuthors: 10,
      },
      painPoints: [], // No specific pain points with evidence
      praisePoints: [],
      buyerMotivations: [],
      desiredFeatures: [], // NO feature requests in evidence!
      summary: 'General sentiment overview without actionable structural features',
      evidenceNotice: 'Generic search snippets',
    };

    const oppWithoutEvidence = OpportunityScoreEngine.evaluate(
      createCategoryInputs(
        'automatic pet feeder',
        'Pet Supplies > Feeding & Watering',
        'B0PET00001',
        petVocWithoutFeatureEvidence,
        [], // No evidences provided
      ),
    );

    // 1. Zero structural design recommendations in opportunities!
    const recsWithoutEvidence = oppWithoutEvidence.opportunities.filter((o) => o.level === 'RECOMMENDATION');
    expect(recsWithoutEvidence).toHaveLength(0);

    // 2. Actionable recommendations in explanation must fallback to pure monitoring advice,
    // NEVER inventing ungrounded hardware/CAD/structural claims!
    expect(oppWithoutEvidence.explanation.actionableRecommendations).toEqual([
      '建议持续监测标杆竞品 BSR 波动并补充深层整页 VOC 评测。',
    ]);
  });
});
