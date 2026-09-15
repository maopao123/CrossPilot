import {
  CandidateComparisonEngine,
  CandidateDecisionEngine,
  CandidateEconomicsService,
  CandidateEvidenceValidator,
  OpportunityScoreEngine,
} from '../src/research/index.js';
import {
  EvidenceItem,
  ProductCandidate,
} from '@crosspilot/shared';
import { RawResearchInputs } from '../src/research/opportunity-score.engine.js';

describe('Product Research V2 MVP Mandatory Acceptance Tests', () => {
  const createTestCandidate = (
    id: string,
    title: string,
    overrides?: Partial<ProductCandidate>,
  ): ProductCandidate => {
    const baseEconomicsInputs = {
      sellingPrice: { value: 29.99, source: 'FACT' as const, basis: 'Amazon target price point' },
      productCost: { value: 8.5, source: 'FACT' as const, basis: 'Supplier verified invoice quote' },
      referralFeeRate: { value: 0.15, source: 'ESTIMATE' as const, basis: 'Amazon 15% standard commission' },
      fbaFeePerUnit: { value: 5.2, source: 'ESTIMATE' as const, basis: 'FBA large standard tier' },
      freightPerUnit: { value: 2.1, source: 'ESTIMATE' as const, basis: 'Sea freight DDP per unit' },
      dutyPerUnit: { value: 0.6, source: 'ESTIMATE' as const, basis: 'Tariff classification 7%' },
      adsCostPerUnit: { value: 3.5, source: 'ASSUMPTION' as const, basis: 'Initial PPC target ACOS 25%' },
      returnRate: { value: 0.04, source: 'ASSUMPTION' as const, basis: 'Historical category benchmark 4%' },
      returnLossPerUnit: { value: 9.0, source: 'ESTIMATE' as const, basis: 'Inspection and restocking loss' },
      storageFeePerUnit: { value: 0.35, source: 'ESTIMATE' as const, basis: 'Monthly standard storage' },
      otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE' as const, basis: 'Custom barcode and polybag' },
    };

    const calculatedEconomics = CandidateEconomicsService.calculateEconomics(baseEconomicsInputs, 'USD');

    const defaultCandidate: ProductCandidate = {
      id,
      title,
      marketplace: 'AMAZON_US',
      category: 'Home & Kitchen > Storage & Organization',
      concept: {
        productType: 'Collapsible Storage Box',
        targetCustomer: 'Urban apartment renters seeking closet organization',
        useCase: 'Seasonal garment and sheet storage under bed or in closet',
        targetPrice: 29.99,
        specifications: { material: 'Heavyweight cationic linen + 2.5mm MDF board', dimensions: '16x12x10 inches' },
        differentiationHypotheses: ['Reinforced metal handles', 'Transparent PVC label window'],
      },
      marketResearch: {
        seedKeyword: 'linen storage box',
        searchVolumeMonthly: 36000,
        competitiveDifficulty: 42,
        opportunityScore: 78,
        competitorSampleSize: 3,
        representativeAsin: 'B0TESTASIN1',
      },
      economics: calculatedEconomics,
      risks: [
        {
          riskId: `${id}-risk-patent`,
          category: 'PATENT',
          title: 'Design patent clearance on handle structure',
          status: 'PASS',
          severity: 'HIGH',
          evidenceIds: [`${id}-evi-patent-report`],
        },
        {
          riskId: `${id}-risk-moisture`,
          category: 'QUALITY',
          title: 'Fabric mold prevention in high humidity transit',
          status: 'PASS',
          severity: 'MEDIUM',
          evidenceIds: [`${id}-evi-qc-report`],
        },
      ],
      evidence: [
        {
          id: `${id}-evi-quote`,
          scope: 'PRODUCT',
          subjectId: id,
          source: 'SUPPLIER_OFFICIAL_QUOTE',
          content: `Supplier quote FOB Ningbo $8.50/unit for ${id}`,
          capturedAt: new Date().toISOString(),
        },
        {
          id: `${id}-evi-kw`,
          scope: 'KEYWORD',
          subjectId: 'linen storage box',
          source: 'XYDC_ABA',
          content: 'Monthly search volume 36,000, ABA Rank #14,200',
          capturedAt: new Date().toISOString(),
        },
        {
          id: `${id}-evi-cat`,
          scope: 'CATEGORY',
          subjectId: 'Home & Kitchen > Storage & Organization',
          source: 'FIRECRAWL_VOC',
          content: 'Analysis of 25 discussions: 28% complain about chemical smell from synthetic glue',
          capturedAt: new Date().toISOString(),
        },
      ],
      assumptions: [
        {
          id: `${id}-asm-ads`,
          field: 'adsCostPerUnit',
          description: 'Initial ad spend estimated at $3.50/unit for first 90 days',
          assumedValue: 3.5,
          sourceReason: 'Based on CPC $0.90 and 25% conversion rate assumption',
          impactLevel: 'MEDIUM',
          validated: true,
        },
      ],
      missingRequirements: [],
      decision: 'SHORTLIST',
    };

    return {
      ...defaultCandidate,
      ...overrides,
      concept: { ...defaultCandidate.concept, ...(overrides?.concept ?? {}) },
      economics: overrides?.economics ?? defaultCandidate.economics,
    };
  };

  /**
   * ==========================================================================
   * Case 1: Missing Critical Economics Gate
   * Candidate A lacks productCost. Candidate B has complete information.
   * Expectation:
   * - Candidate A verdict MUST be 'NEEDS_VALIDATION'.
   * - Candidate A CANNOT gain a higher recommendation rank than B due to missing economics.
   * ==========================================================================
   */
  it('Case 1: Candidate A lacking product cost must be NEEDS_VALIDATION and cannot outrank complete Candidate B', () => {
    // Candidate A with missing product cost (UNKNOWN)
    const incompleteEconomicsInputs = {
      sellingPrice: { value: 29.99, source: 'FACT' as const, basis: 'Target retail price' },
      productCost: { value: null, source: 'UNKNOWN' as const, basis: 'Supplier quote pending' },
      referralFeeRate: { value: 0.15, source: 'ESTIMATE' as const },
      fbaFeePerUnit: { value: 5.2, source: 'ESTIMATE' as const },
      freightPerUnit: { value: 2.1, source: 'ESTIMATE' as const },
      dutyPerUnit: { value: 0.6, source: 'ESTIMATE' as const },
      adsCostPerUnit: { value: 3.5, source: 'ASSUMPTION' as const },
      returnRate: { value: 0.04, source: 'ASSUMPTION' as const },
      returnLossPerUnit: { value: 9.0, source: 'ESTIMATE' as const },
      storageFeePerUnit: { value: 0.35, source: 'ESTIMATE' as const },
      otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE' as const },
    };

    const candA = createTestCandidate('CANDIDATE-A', 'Candidate A (Missing Cost)', {
      economics: CandidateEconomicsService.calculateEconomics(incompleteEconomicsInputs, 'USD'),
      marketResearch: {
        seedKeyword: 'ultra popular widget',
        searchVolumeMonthly: 120000, // Very high search volume!
        competitiveDifficulty: 20,
        opportunityScore: 95, // High market score!
        competitorSampleSize: 3,
      },
    });

    // Candidate B with complete information and moderate market score
    const candB = createTestCandidate('CANDIDATE-B', 'Candidate B (Complete)', {
      marketResearch: {
        seedKeyword: 'modest niche widget',
        searchVolumeMonthly: 25000,
        competitiveDifficulty: 40,
        opportunityScore: 72,
        competitorSampleSize: 3,
      },
    });

    // 1. Evaluate Candidate A decision
    const decisionA = CandidateDecisionEngine.evaluate(candA);
    expect(decisionA.verdict).toBe('NEEDS_VALIDATION');
    expect(decisionA.reasons.some((r) => r.includes('关键财务数据缺失'))).toBe(true);

    // 2. Evaluate Candidate B decision
    const decisionB = CandidateDecisionEngine.evaluate(candB);
    expect(decisionB.verdict).toBe('SHORTLIST');

    // 3. Compare them horizontally
    const comparison = CandidateComparisonEngine.compare([candA, candB]);
    expect(comparison.comparable).toBe(true);

    // Candidate B (SHORTLIST) MUST be ranked ahead of Candidate A (NEEDS_VALIDATION)
    expect(comparison.ranking[0]).toBe('CANDIDATE-B');
    expect(comparison.ranking[1]).toBe('CANDIDATE-A');

    // Verify comparison reason explicitly captures Candidate A's missing data
    const pairReasons = comparison.pairwiseReasons['CANDIDATE-A_vs_CANDIDATE-B'];
    const econReason = pairReasons.find((r) => r.dimension === 'ECONOMICS');
    expect(econReason).toBeDefined();
    expect(econReason?.conclusion).toBe('B_BETTER');
    expect(econReason?.explanation).toContain('缺失关键财务数据');
  });

  /**
   * ==========================================================================
   * Case 2: Determinism Invariant
   * Running the system twice with identical inputs yields 100% deterministic outputs.
   * ==========================================================================
   */
  it('Case 2: Deterministic execution produces identical metrics, economics, risk evaluation, and decision', () => {
    const cand1 = createTestCandidate('CANDIDATE-DETERMINISTIC', 'Deterministic Test Candidate');
    const cand2 = createTestCandidate('CANDIDATE-DETERMINISTIC', 'Deterministic Test Candidate');

    const econ1 = CandidateEconomicsService.calculateEconomics(cand1.economics.inputs, 'USD');
    const econ2 = CandidateEconomicsService.calculateEconomics(cand2.economics.inputs, 'USD');

    // Financial calculations must be bit-exact
    expect(econ1.scenarios.base.contributionProfit).toBe(econ2.scenarios.base.contributionProfit);
    expect(econ1.scenarios.base.contributionMargin).toBe(econ2.scenarios.base.contributionMargin);
    expect(econ1.scenarios.conservative.contributionProfit).toBe(econ2.scenarios.conservative.contributionProfit);
    expect(econ1.scenarios.optimistic.contributionProfit).toBe(econ2.scenarios.optimistic.contributionProfit);

    const decision1 = CandidateDecisionEngine.evaluate(cand1);
    const decision2 = CandidateDecisionEngine.evaluate(cand2);

    expect(decision1.verdict).toBe(decision2.verdict);
    expect(decision1.hardRiskGatePassed).toBe(decision2.hardRiskGatePassed);
    expect(decision1.economicsGatePassed).toBe(decision2.economicsGatePassed);
    expect(decision1.evidenceCompleteness).toBe(decision2.evidenceCompleteness);
    expect(decision1.reasons).toEqual(decision2.reasons);
  });

  /**
   * ==========================================================================
   * Case 3: Monotonicity & Economics Gate State Transition
   * Only increasing Candidate A's productCost causes Contribution Profit & Margin
   * to decrease monotonically, and triggers decision downgrades (SHORTLIST -> WATCH -> BLOCKED).
   * ==========================================================================
   */
  it('Case 3: Increasing productCost decreases contribution profit/margin monotonically and updates decision at thresholds', () => {
    const costLevels = [6.0, 8.5, 9.5, 10.5, 16.0];
    const profits: number[] = [];
    const margins: number[] = [];
    const decisions: string[] = [];

    for (const cost of costLevels) {
      const inputs = {
        sellingPrice: { value: 29.99, source: 'FACT' as const },
        productCost: { value: cost, source: 'FACT' as const },
        referralFeeRate: { value: 0.15, source: 'ESTIMATE' as const },
        fbaFeePerUnit: { value: 5.2, source: 'ESTIMATE' as const },
        freightPerUnit: { value: 2.1, source: 'ESTIMATE' as const },
        dutyPerUnit: { value: 0.6, source: 'ESTIMATE' as const },
        adsCostPerUnit: { value: 3.5, source: 'ASSUMPTION' as const },
        returnRate: { value: 0.04, source: 'ASSUMPTION' as const },
        returnLossPerUnit: { value: 9.0, source: 'ESTIMATE' as const },
        storageFeePerUnit: { value: 0.35, source: 'ESTIMATE' as const },
        otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE' as const },
      };

      const econ = CandidateEconomicsService.calculateEconomics(inputs, 'USD');
      const candidate = createTestCandidate(`CAND-COST-${cost}`, `Cost Test ${cost}`, { economics: econ });
      const decision = CandidateDecisionEngine.evaluate(candidate);

      profits.push(econ.scenarios.base.contributionProfit);
      margins.push(econ.scenarios.base.contributionMargin);
      decisions.push(decision.verdict);
    }

    // 1. Strict Monotonicity: Each step of increasing cost must strictly decrease profit & margin
    for (let i = 1; i < costLevels.length; i++) {
      expect(profits[i]).toBeLessThan(profits[i - 1]);
      expect(margins[i]).toBeLessThan(margins[i - 1]);
    }

    // 2. Decision Gate State Transitions:
    // Low cost ($6.00) -> SHORTLIST (healthy margin > 20%)
    expect(decisions[0]).toBe('SHORTLIST');
    // High cost ($10.50) -> WATCH (thin margin ~7.9% < 12%)
    expect(decisions[3]).toBe('WATCH');
    // Extreme cost ($16.00) -> BLOCKED (loss-making product profit < 0)
    expect(decisions[4]).toBe('BLOCKED');
  });

  /**
   * ==========================================================================
   * Case 4: Why A > B Traceability Invariant
   * Querying "Why A > B?" produces comparison reasons where every item is linked
   * to Metric IDs and Evidence/Assumption IDs. No ungrounded free text.
   * ==========================================================================
   */
  it('Case 4: Pairwise reasons must be strictly grounded in metrics, evidence, or assumptions', () => {
    const candA = createTestCandidate('CANDIDATE-A', 'High Margin Product', {
      economics: CandidateEconomicsService.calculateEconomics(
        {
          sellingPrice: { value: 39.99, source: 'FACT' as const },
          productCost: { value: 8.0, source: 'FACT' as const, evidenceId: 'evi-quote-supplier-a' },
          referralFeeRate: { value: 0.15, source: 'ESTIMATE' as const },
          fbaFeePerUnit: { value: 5.5, source: 'ESTIMATE' as const },
          freightPerUnit: { value: 2.0, source: 'ESTIMATE' as const },
          dutyPerUnit: { value: 0.5, source: 'ESTIMATE' as const },
          adsCostPerUnit: { value: 4.0, source: 'ASSUMPTION' as const, assumptionId: 'asm-ads-a' },
          returnRate: { value: 0.04, source: 'ASSUMPTION' as const },
          returnLossPerUnit: { value: 9.0, source: 'ESTIMATE' as const },
          storageFeePerUnit: { value: 0.4, source: 'ESTIMATE' as const },
          otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE' as const },
        },
        'USD',
      ),
    });

    const candB = createTestCandidate('CANDIDATE-B', 'Low Margin Product', {
      economics: CandidateEconomicsService.calculateEconomics(
        {
          sellingPrice: { value: 24.99, source: 'FACT' as const },
          productCost: { value: 9.5, source: 'FACT' as const, evidenceId: 'evi-quote-supplier-b' },
          referralFeeRate: { value: 0.15, source: 'ESTIMATE' as const },
          fbaFeePerUnit: { value: 4.8, source: 'ESTIMATE' as const },
          freightPerUnit: { value: 2.2, source: 'ESTIMATE' as const },
          dutyPerUnit: { value: 0.6, source: 'ESTIMATE' as const },
          adsCostPerUnit: { value: 4.5, source: 'ASSUMPTION' as const, assumptionId: 'asm-ads-b' },
          returnRate: { value: 0.05, source: 'ASSUMPTION' as const },
          returnLossPerUnit: { value: 9.0, source: 'ESTIMATE' as const },
          storageFeePerUnit: { value: 0.35, source: 'ESTIMATE' as const },
          otherCostsPerUnit: { value: 0.5, source: 'ESTIMATE' as const },
        },
        'USD',
      ),
    });

    const comparison = CandidateComparisonEngine.compare([candA, candB]);
    const reasons = comparison.pairwiseReasons['CANDIDATE-A_vs_CANDIDATE-B'];

    expect(reasons).toBeDefined();
    expect(reasons.length).toBeGreaterThan(0);

    for (const reason of reasons) {
      // 1. Must have explicit dimension and conclusion
      expect(['ECONOMICS', 'RISK_PROFILE', 'EVIDENCE_CONFIDENCE', 'MARKET_DEMAND']).toContain(reason.dimension);
      expect(['A_BETTER', 'B_BETTER', 'SIMILAR', 'NOT_COMPARABLE']).toContain(reason.conclusion);

      // 2. Must link to at least one metric ID
      expect(reason.metricIds.length).toBeGreaterThan(0);

      // 3. Must have substantive explanation
      expect(reason.explanation.length).toBeGreaterThan(10);
      expect(reason.explanation).not.toBe('A 综合潜力更高'); // No ungrounded vague text!

      // 4. If conclusion is A_BETTER or B_BETTER on economics, must link to evidence or assumptions
      if (reason.dimension === 'ECONOMICS' && (reason.conclusion === 'A_BETTER' || reason.conclusion === 'B_BETTER')) {
        expect(reason.evidenceIds.length + reason.assumptionIds.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * ==========================================================================
   * Case 5: Evidence Subject Consistency Gate
   * Injecting Candidate B's PRODUCT evidence into Candidate A fails subject consistency validation
   * and is rejected from supporting A's product conclusion.
   * ==========================================================================
   */
  it('Case 5: Cross-candidate PRODUCT evidence injection fails subject consistency validation and is rejected', () => {
    const candidateAId = 'CANDIDATE-A';
    const candidateBId = 'CANDIDATE-B';

    const injectedEvidences: EvidenceItem[] = [
      {
        id: 'evi-valid-a',
        scope: 'PRODUCT',
        subjectId: candidateAId,
        source: 'SUPPLIER_QUOTE',
        content: 'Valid quote for Candidate A',
      },
      {
        id: 'evi-injected-b-into-a',
        scope: 'PRODUCT',
        subjectId: candidateBId, // Injected evidence belonging to B!
        source: 'AMAZON_PRODUCT_PAGE',
        content: 'Specific CAD drawing and stress test for Candidate B only',
      },
      {
        id: 'evi-valid-cat',
        scope: 'CATEGORY',
        subjectId: 'Home & Kitchen > Storage',
        source: 'FIRECRAWL',
        content: 'Category level discussions',
      },
    ];

    const result = CandidateEvidenceValidator.validateCandidateEvidence(candidateAId, 'ASIN_A', injectedEvidences);

    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].evidenceId).toBe('evi-injected-b-into-a');
    expect(result.violations[0].scope).toBe('PRODUCT');
    expect(result.violations[0].subjectId).toBe(candidateBId);
    expect(result.violations[0].reason).toContain('cannot be attributed to Candidate "CANDIDATE-A"');

    // Injected evidence must be rejected from validEvidences
    expect(result.validEvidences.map((e) => e.id)).toEqual(['evi-valid-a', 'evi-valid-cat']);
    expect(result.rejectedEvidences.map((e) => e.id)).toEqual(['evi-injected-b-into-a']);
  });

  /**
   * ==========================================================================
   * Case 6: No Valid ASIN with Valid Category VOC
   * When no valid ASIN exists, Product Trend = MISSING, Product Review = MISSING.
   * But Category VOC = AVAILABLE (scope: CATEGORY_EXTERNAL_VOC) without impersonating Product Evidence.
   * ==========================================================================
   */
  it('Case 6: No valid ASIN yields MISSING product trend/reviews while preserving valid Category VOC', () => {
    const inputs: RawResearchInputs = {
      keyword: 'storage container',
      marketplace: 'AMAZON_US',
      representativeAsin: undefined, // No valid ASIN!
      products: [], // No products found
      topAsinTrend: null,
      productReviewHealth: null,
      vocAnalysis: {
        asin: 'CATEGORY',
        marketplace: 'AMAZON_US',
        vocSourceType: 'EXTERNAL_VOC',
        analysisScope: {
          type: 'CATEGORY',
          query: 'storage container',
          totalAnalyzedItems: 25,
          exactProductItems: 0,
          brandProductItems: 0,
          categoryItems: 25,
          genericItems: 0,
          uniqueSourcePages: 20,
          knownAuthorCount: 15,
          unknownAuthorCount: 10,
          uniqueKnownAuthors: 15,
        },
        totalReviewCount: 25,
        analyzedReviewCount: 25,
        averageRating: null,
        painPoints: [
          {
            topic: 'Lid latch breaks easily after repeated opening',
            category: 'DURABILITY',
            frequency: 8,
            percentage: 32,
            sampleSize: 25,
            scope: 'CATEGORY',
            quotes: [],
          },
        ],
        praisePoints: [],
        buyerMotivations: [],
        summary: 'Category level discussions on storage containers',
        evidenceNotice: 'Search snippets on category discussions',
      },
    };

    const opp = OpportunityScoreEngine.evaluate(inputs);

    // 1. Single-product signals MUST be MISSING
    expect(opp.signals.trend.status).toBe('MISSING');
    expect(opp.signals.trend.normalizedScore).toBeNull();
    expect(opp.signals.trend.subjectId).toBe('NO_REPRESENTATIVE_ASIN');

    expect(opp.signals.reviewHealth.status).toBe('MISSING');
    expect(opp.signals.reviewHealth.normalizedScore).toBeNull();
    expect(opp.signals.reviewHealth.subjectId).toBe('NO_REPRESENTATIVE_ASIN');

    // 2. Category VOC MUST be AVAILABLE with scope CATEGORY_EXTERNAL_VOC
    expect(opp.signals.voc.status).toBe('AVAILABLE');
    expect(opp.signals.voc.scope).toBe('CATEGORY_EXTERNAL_VOC');
    expect(opp.signals.voc.rawMetrics.sampleSize).toBe(25);
    expect(opp.signals.voc.rawMetrics.topPainPointPercentage).toBe(32);

    // 3. Representative ASIN in scope disclosure must be null, not a fake ASIN
    expect(opp.scopeDisclosure.representativeAsin).toBeNull();
  });
});
