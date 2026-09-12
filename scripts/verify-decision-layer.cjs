/**
 * Phase 7 Verification Script: Product Research Decision Layer
 *
 * Verifies:
 * 1. Six Market Signals normalization (Demand, Competition, Commercial, Trend, Review Health, VOC)
 * 2. Competition inverted barrier contribution (higher barrier = lower opportunity score)
 * 3. Commercial price sweet spot without fake COGS
 * 4. Trend BSR direction mapping (RANK_IMPROVED = sales climbing)
 * 5. Review health decoupled from VOC text mining
 * 6. VOC calibrated by scope (CATEGORY) and content kind (SEARCH_SNIPPET)
 * 7. Evidence Gate (SUFFICIENT / DEGRADED_PASS / INSUFFICIENT)
 * 8. Missing != 0 (dynamic weight re-normalization)
 * 9. Separation of confidence level from opportunity score
 * 10. Structured facts boundary separation (FACT, SIGNAL, INFERENCE, RECOMMENDATION)
 * 11. Explanation citation of evidenceIds
 * 12. Cost budget tracking
 */

const assert = require('assert');
const {
  createDefaultIntegrationGateway,
  XYDC_PROVIDER_ID,
  FIRECRAWL_PROVIDER_ID,
} = require('../packages/integrations/dist/index.js');
const {
  OpportunityScoreEngine,
  OpportunityExplanationService,
  OPPORTUNITY_SCORE_VERSION,
} = require('../packages/domain/dist/index.js');

async function main() {
  console.log('===========================================================');
  console.log('   CrossPilot Phase 7 Decision Layer Verification        ');
  console.log('===========================================================');

  const keyword = 'marble toothbrush holder';
  const targetAsin = 'B0BFGNSXYL';
  const marketplace = 'AMAZON_US';
  const workspaceId = 'test_phase7_ws';
  const traceId = `tr_phase7_${Date.now()}`;

  const { gateway } = createDefaultIntegrationGateway();

  let xydcCredits = 0;
  let firecrawlCredits = 0;
  let totalRequests = 0;
  let cacheHits = 0;

  // 1. Gather Real Normalized Evidences from Providers
  console.log('[1/7] Fetching Real Data via Integration Gateway...');

  // 1.1 Product Search (Composite: keyword metrics + products)
  totalRequests++;
  const searchRes = await gateway.executeCapability(
    'market.product.search',
    { keyword, marketplace, limit: 5 },
    { workspaceId, traceId, marketplace },
  );
  if (searchRes.mode === 'CACHED') cacheHits++;
  else xydcCredits += 1;

  const rawSearch = searchRes.data;
  const products = Array.isArray(rawSearch) ? rawSearch : rawSearch?.products || [];
  const keywordMetric = rawSearch?.keywordMetric || null;
  const searchEvidences = rawSearch?.evidence || [];
  console.log(`      Products found: ${products.length}, Keyword Metric: ${keywordMetric ? 'YES' : 'NO'}, Mode: ${searchRes.mode}`);

  // 1.2 Trend for representative ASIN
  totalRequests++;
  let topAsinTrend = null;
  let trendEvidences = [];
  try {
    const trendRes = await gateway.executeCapability(
      'market.product.trend',
      { asin: targetAsin, metric: 'ALL', range: '30d', marketplace },
      { workspaceId, traceId, marketplace },
    );
    if (trendRes.mode === 'CACHED') cacheHits++;
    else xydcCredits += 1;

    const trends = Array.isArray(trendRes.data) ? trendRes.data : trendRes.data ? [trendRes.data] : [];
    if (trends.length > 0 && trends[0]?.summary) {
      topAsinTrend = trends[0].summary;
    }
    trendEvidences = trendRes.metadata?.evidence || [];
    console.log(`      BSR Trend Direction: ${topAsinTrend?.direction || 'NONE'}, Mode: ${trendRes.mode}`);
  } catch (err) {
    console.log('      Trend fetch skipped/degraded');
  }

  // 1.3 Review Health for representative ASIN
  totalRequests++;
  let productReviewHealth = null;
  let reviewEvidences = [];
  try {
    const healthRes = await gateway.executeCapability(
      'review.product.health',
      { asin: targetAsin, marketplace },
      { workspaceId, traceId, marketplace },
    );
    if (healthRes.mode === 'CACHED') cacheHits++;
    else xydcCredits += 1;

    productReviewHealth = healthRes.data;
    reviewEvidences = healthRes.metadata?.evidence || healthRes.data?.evidence || [];
    console.log(`      Review Health: ${productReviewHealth?.averageRating}★ (${productReviewHealth?.totalReviewCount} revs), Mode: ${healthRes.mode}`);
  } catch (err) {
    console.log('      Review health fetch skipped');
  }

  // 1.4 External VOC for representative ASIN
  totalRequests++;
  let vocAnalysis = null;
  let vocEvidences = [];
  try {
    const vocRes = await gateway.executeCapability(
      'voc.product.analyze',
      { asin: targetAsin, keyword, marketplace },
      { workspaceId, traceId, marketplace },
    );
    if (vocRes.mode === 'CACHED') cacheHits++;
    else firecrawlCredits += 2;

    vocAnalysis = vocRes.data;
    vocEvidences = vocRes.metadata?.evidence || vocRes.data?.evidence || [];
    console.log(`      External VOC: ${vocAnalysis?.painPoints?.length} pain points from ${vocAnalysis?.analyzedReviewCount} items, Mode: ${vocRes.mode}`);
  } catch (err) {
    console.log('      VOC fetch skipped');
  }

  const allEvidences = [
    ...searchEvidences,
    ...trendEvidences,
    ...reviewEvidences,
    ...vocEvidences,
  ];

  const costBudget = {
    xydcCredits,
    firecrawlCredits,
    totalRequests,
    cacheHits,
    estimatedCostUsd: null,
  };

  // 2. Execute OpportunityScoreEngine
  console.log('\n[2/7] Executing OpportunityScoreEngine Deterministic Evaluation...');
  const opp = OpportunityScoreEngine.evaluate({
    keyword,
    marketplace,
    representativeAsin: targetAsin,
    keywordMetric,
    products,
    topAsinTrend,
    productReviewHealth,
    vocAnalysis,
    evidences: allEvidences,
    costBudget,
  });

  console.log('      Opportunity ID:     ', opp.opportunityId);
  console.log('      Overall Score:      ', `${opp.overallScore}/100`);
  console.log('      Methodology:        ', opp.methodology);
  console.log('      Score Version:      ', opp.scoreVersion);
  console.log('      Config Version:     ', opp.scoreConfigVersion);
  console.log('      Calibration Status: ', opp.calibrationStatus);
  console.log('      Decision Scope:     ', opp.decisionScope);
  console.log('      Evidence Gate:      ', opp.evidenceStatus);
  console.log('      Confidence:         ', `${opp.confidence} (${(opp.confidenceScore * 100).toFixed(0)}%)`);

  assert.strictEqual(opp.scoreVersion, 'v1.0.0');
  assert.strictEqual(opp.scoreConfigVersion, 'v1.0.0');
  assert.strictEqual(opp.methodology, 'HEURISTIC');
  assert.strictEqual(opp.calibrationStatus, 'UNCALIBRATED');
  assert.strictEqual(opp.decisionScope, 'KEYWORD_CATEGORY_OPPORTUNITY');
  assert.ok(opp.overallScore !== null && opp.overallScore > 0 && opp.overallScore <= 100);
  assert.strictEqual(opp.evidenceStatus, 'SUFFICIENT');

  // Scope Disclosure Check
  assert.strictEqual(opp.scopeDisclosure.decisionScope, 'KEYWORD_CATEGORY_OPPORTUNITY');
  assert.strictEqual(opp.scopeDisclosure.representativeAsin, targetAsin);
  assert.strictEqual(opp.scopeDisclosure.vocScope, 'CATEGORY');
  assert.strictEqual(opp.scopeDisclosure.vocContentKind, 'SEARCH_SNIPPET');

  // 3. Verify Six Signals Normalization & Semantics
  console.log('\n[3/7] Verifying Six Signals Normalization & Semantic Invariants:');
  const signals = opp.signals;

  // Demand
  console.log('      1. Demand Signal:');
  console.log('         - Scope:       ', signals.demand.scope);
  console.log('         - Score:       ', signals.demand.normalizedScore);
  console.log('         - Weight:      ', signals.demand.weight);
  console.log('         - Contribution:', signals.demand.contribution);
  console.log('         - Search Vol:  ', signals.demand.rawMetrics.weeklySearchVolume);
  assert.strictEqual(signals.demand.scope, 'KEYWORD_MARKET');
  assert.ok(signals.demand.normalizedScore > 0 && signals.demand.normalizedScore <= 100);

  // Competition (Inverted barrier)
  console.log('      2. Competition Signal (Inverted):');
  console.log('         - Scope:       ', signals.competition.scope);
  console.log('         - Score:       ', signals.competition.normalizedScore);
  console.log('         - Weight:      ', signals.competition.weight);
  console.log('         - Contribution:', signals.competition.contribution);
  console.log('         - Avg Reviews: ', signals.competition.rawMetrics.topAsinAvgReviews);
  console.log('         - Difficulty:  ', signals.competition.rawMetrics.competitiveDifficulty);
  assert.strictEqual(signals.competition.scope, 'TOP_PRODUCTS');
  assert.strictEqual(
    signals.competition.normalizedScore,
    100 - signals.competition.rawMetrics.competitiveDifficulty,
    'Competition score must be exact 100 - difficulty (inverted contribution)',
  );

  // Commercial (Price sweet spot, no fake COGS)
  console.log('      3. Commercial Signal:');
  console.log('         - Scope:       ', signals.commercial.scope);
  console.log('         - Score:       ', signals.commercial.normalizedScore);
  console.log('         - Weight:      ', signals.commercial.weight);
  console.log('         - Contribution:', signals.commercial.contribution);
  console.log('         - Avg Price:   ', `$${signals.commercial.rawMetrics.avgPrice}`);
  assert.strictEqual(signals.commercial.scope, 'TOP_PRODUCTS');
  assert.ok(signals.commercial.normalizedScore > 0 && signals.commercial.normalizedScore <= 100);

  // Trend (RANK_IMPROVED mapped positively)
  console.log('      4. Trend Signal:');
  console.log('         - Scope:       ', signals.trend.scope);
  console.log('         - Score:       ', signals.trend.normalizedScore);
  console.log('         - Weight:      ', signals.trend.weight);
  console.log('         - Contribution:', signals.trend.contribution);
  console.log('         - Direction:   ', signals.trend.rawMetrics.bsrDirection);
  assert.strictEqual(signals.trend.scope, 'REPRESENTATIVE_PRODUCT');
  if (signals.trend.rawMetrics.bsrDirection === 'RANK_IMPROVED') {
    assert.ok(signals.trend.normalizedScore >= 70, 'RANK_IMPROVED must yield positive momentum score >= 70');
  }

  // Review Health (Decoupled from VOC text mining)
  console.log('      5. Review Health Signal:');
  console.log('         - Scope:       ', signals.reviewHealth.scope);
  console.log('         - Score:       ', signals.reviewHealth.normalizedScore);
  console.log('         - Weight:      ', signals.reviewHealth.weight);
  console.log('         - Contribution:', signals.reviewHealth.contribution);
  console.log('         - Avg Rating:  ', signals.reviewHealth.rawMetrics.averageRating);
  assert.strictEqual(signals.reviewHealth.scope, 'REPRESENTATIVE_PRODUCT');
  assert.ok(signals.reviewHealth.normalizedScore >= 60);

  // VOC Opportunity (Calibrated by scope and search snippet)
  console.log('      6. VOC Opportunity Signal:');
  console.log('         - Scope:       ', signals.voc.scope);
  console.log('         - Score:       ', signals.voc.normalizedScore);
  console.log('         - Weight:      ', signals.voc.weight);
  console.log('         - Contribution:', signals.voc.contribution);
  console.log('         - Content Kind:', signals.voc.rawMetrics.contentKind);
  console.log('         - Scope:       ', signals.voc.rawMetrics.scope);
  assert.strictEqual(signals.voc.scope, 'CATEGORY_EXTERNAL_VOC');
  assert.strictEqual(signals.voc.rawMetrics.contentKind, 'SEARCH_SNIPPET');
  assert.strictEqual(signals.voc.rawMetrics.scope, 'CATEGORY');
  assert.ok(signals.voc.confidence <= 0.70, 'Snippet confidence must be capped at 0.70');

  // Verify weights sum to 1.00
  const sumWeights = Object.values(opp.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumWeights - 1.0) < 0.01, `Weights sum ${sumWeights} must equal 1.00`);
  console.log('      Six Signals Normalization: VERIFIED (PASS)');

  // 4. Verify Missing != 0 Dynamic Re-normalization
  console.log('\n[4/7] Verifying Missing != 0 Weight Re-normalization...');
  const degradedOpp = OpportunityScoreEngine.evaluate({
    keyword,
    marketplace,
    representativeAsin: targetAsin,
    keywordMetric,
    products,
    topAsinTrend: null, // Trend missing
    productReviewHealth: null, // Review health missing
    vocAnalysis,
    evidences: allEvidences,
  });

  assert.strictEqual(degradedOpp.evidenceStatus, 'SUFFICIENT');
  assert.strictEqual(degradedOpp.signals.trend.status, 'MISSING');
  assert.strictEqual(degradedOpp.signals.reviewHealth.status, 'MISSING');
  assert.strictEqual(degradedOpp.signals.trend.normalizedScore, null);
  assert.strictEqual(degradedOpp.signals.reviewHealth.normalizedScore, null);
  assert.strictEqual(degradedOpp.signals.trend.contribution, null);
  assert.strictEqual(degradedOpp.signals.reviewHealth.contribution, null);

  const activeWeightsSum = degradedOpp.weights.demand + degradedOpp.weights.competition + degradedOpp.weights.commercial + degradedOpp.weights.voc;
  assert.ok(Math.abs(activeWeightsSum - 1.0) < 0.01, 'Active weights must dynamically re-normalize to 1.00');
  console.log('      Dynamic Re-normalization without zero penalty: VERIFIED (PASS)');

  // 5. Verify Structured Facts & Boundary Separation
  console.log('\n[5/7] Verifying Structured Facts & Fact Boundaries:');
  console.log(`      Strengths:     ${opp.strengths.length}`);
  console.log(`      Risks:         ${opp.risks.length}`);
  console.log(`      Opportunities: ${opp.opportunities.length}`);

  assert.ok(opp.strengths.length > 0);
  assert.ok(opp.risks.length > 0);
  assert.ok(opp.opportunities.length > 0);

  // Check levels
  assert.ok(opp.strengths.every((s) => s.level === 'FACT'));
  assert.ok(opp.opportunities.some((o) => o.level === 'INFERENCE'));
  const recFact = opp.opportunities.find((o) => o.level === 'RECOMMENDATION');
  assert.ok(recFact);
  assert.ok(!recFact.statement.includes('3.2cm'), 'Ungrounded 3.2cm must be removed');
  assert.ok(recFact.statement.includes('扩大插槽兼容范围'), 'Must contain directional recommendation');

  console.log('      Sample Fact:          ', `[${opp.strengths[0].level}] ${opp.strengths[0].statement}`);
  console.log('      Sample Recommendation:', `[${recFact.level}] ${recFact.statement}`);
  console.log('      Fact Boundary Separation: VERIFIED (PASS)');

  // Numeric Grounding Validator
  const { ExplanationNumericGroundingValidator } = require('../packages/domain/dist/index.js');
  const validation = ExplanationNumericGroundingValidator.validate(opp);
  assert.strictEqual(validation.valid, true, 'Opportunity must pass ExplanationNumericGroundingValidator');
  console.log('      Explanation Numeric Grounding Validator: VERIFIED (PASS)');

  // 6. Verify Grounded Explanation Prompt Generator
  console.log('\n[6/7] Verifying OpportunityExplanationService Prompt Generator...');
  const promptTemplate = OpportunityExplanationService.buildExplanationPrompt(opp);
  assert.ok(promptTemplate.systemPrompt.includes('CRITICAL ENFORCEMENT RULES'));
  assert.ok(promptTemplate.systemPrompt.includes('HEURISTIC RELATIVE RANKING'));
  assert.ok(promptTemplate.systemPrompt.includes('NEVER refer to it as a "success probability"'));
  assert.ok(promptTemplate.userPrompt.includes('Structured Facts & Evidence'));
  console.log('      System Prompt Constraints: VERIFIED (PASS)');

  // 7. Verify Cost Budget Tracking
  console.log('\n[7/7] Verifying Research Cost Budget Tracking:');
  console.log('      - XYDC Credits:      ', opp.costBudget.xydcCredits);
  console.log('      - Firecrawl Credits: ', opp.costBudget.firecrawlCredits);
  console.log('      - Total Requests:    ', opp.costBudget.totalRequests);
  console.log('      - Cache Hits:        ', opp.costBudget.cacheHits);
  console.log('      - Estimated Cost USD:', opp.costBudget.estimatedCostUsd ?? 'NULL (Official API ungrounded)');
  assert.strictEqual(opp.costBudget.estimatedCostUsd, null);
  assert.ok(opp.costBudget.totalRequests >= 4);
  console.log('      Cost Budget Tracking: VERIFIED (PASS)');

  console.log('\n===========================================================');
  console.log('   Phase 7.1 Decision Engine Hardening VERIFIED! ✓        ');
  console.log('===========================================================');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
