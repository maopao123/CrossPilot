/**
 * Phase 6 Verification Script: Dual Provider Routing & Live Text VOC Execution
 *
 * Verifies:
 * 1. Router resolution:
 *    - review.product.health -> XYDC (Market Data)
 *    - voc.product.analyze   -> Firecrawl (External Text VOC)
 * 2. Live Firecrawl Execution:
 *    - Fetches real discussions & reviews (Reddit/Web/Retail)
 *    - Normalizes into RawTextItems
 *    - Pure code frequency & percentage calculation
 *    - 100% verbatim quote existence validation (quoteText in rawText)
 *    - Generates standard ResearchEvidence (type = EXTERNAL_VOC)
 * 3. Redis / Memory ProviderCache hit on repeated call (credits = 0)
 * 4. Token & secret redaction audit
 */

const assert = require('assert');
const path = require('path');

// Require compiled integrations bundle
const {
  createDefaultIntegrationGateway,
  SecretProvider,
  FIRECRAWL_PROVIDER_ID,
  XYDC_PROVIDER_ID,
} = require('../packages/integrations/dist/index.js');

async function main() {
  console.log('===========================================================');
  console.log('   CrossPilot Phase 6 Dual Provider & Text VOC Live Test  ');
  console.log('===========================================================');

  const xydcToken = SecretProvider.getSecret('XYDC_MCP_TOKEN');
  const firecrawlKey = SecretProvider.getSecret('FIRECRAWL_API_KEY');

  console.log('XYDC Token:      ', SecretProvider.maskToken(xydcToken));
  console.log('Firecrawl Key:   ', SecretProvider.maskToken(firecrawlKey));
  console.log('-----------------------------------------------------------');

  // 1. Initialize Gateway bundle
  console.log('[1/6] Initializing Integration Gateway with Dual Providers...');
  const bundle = createDefaultIntegrationGateway();
  const { router, gateway } = bundle;

  // 2. Verify Dual Provider Route Resolution
  console.log('[2/6] Verifying Provider Route Resolution Decoupling...');
  const healthRoute = router.resolveRoute('review.product.health');
  const vocRoute = router.resolveRoute('voc.product.analyze');

  console.log('      review.product.health -> Primary Provider:', healthRoute.primary?.providerId);
  console.log('      voc.product.analyze   -> Primary Provider:', vocRoute.primary?.providerId);
  console.log('      voc.product.analyze   -> Fallback Provider:', vocRoute.fallback?.providerId);

  assert.strictEqual(healthRoute.primary?.providerId, XYDC_PROVIDER_ID, 'review.product.health must route to XYDC');
  assert.strictEqual(vocRoute.primary?.providerId, FIRECRAWL_PROVIDER_ID, 'voc.product.analyze must route to Firecrawl');
  assert.strictEqual(vocRoute.fallback?.providerId, XYDC_PROVIDER_ID, 'voc.product.analyze fallback must be XYDC');
  console.log('      Route Resolution: VERIFIED (PASS)');

  // 3. Execute review.product.health (XYDC Provider)
  console.log('\n[3/6] Executing review.product.health via XYDC Provider...');
  const healthRes = await gateway.executeCapability(
    'review.product.health',
    { asin: 'B0BFGNSXYL', marketplace: 'AMAZON_US' },
    { workspaceId: 'test_ws', traceId: 'tr_health_001', marketplace: 'AMAZON_US' },
  );

  console.log('      Success:   ', healthRes.success);
  console.log('      Provider:  ', healthRes.providerId);
  console.log('      Mode:      ', healthRes.mode);
  console.log('      Rating:    ', healthRes.data?.averageRating + '★');
  console.log('      Total Revs:', healthRes.data?.totalReviewCount);
  assert.strictEqual(healthRes.success, true);
  assert.strictEqual(healthRes.providerId, XYDC_PROVIDER_ID);

  // 4. Execute voc.product.analyze (Firecrawl Provider Live Fetch)
  console.log('\n[4/6] Executing Live voc.product.analyze via Firecrawl Provider...');
  const startTime = Date.now();
  const vocRes = await gateway.executeCapability(
    'voc.product.analyze',
    {
      asin: 'B0BFGNSXYL',
      keyword: 'toothbrush holder marble bathroom',
      marketplace: 'AMAZON_US',
    },
    { workspaceId: 'test_ws', traceId: 'tr_voc_001', marketplace: 'AMAZON_US' },
  );

  const duration = Date.now() - startTime;
  console.log('      Success:       ', vocRes.success);
  console.log('      Provider:      ', vocRes.providerId);
  console.log('      Mode:          ', vocRes.mode);
  console.log('      Credits Used:  ', vocRes.credits);
  console.log('      Duration:      ', `${duration}ms`);

  assert.strictEqual(vocRes.success, true, 'Firecrawl VOC execution must succeed');
  assert.strictEqual(vocRes.providerId, FIRECRAWL_PROVIDER_ID, 'Must be executed by Firecrawl');

  const vocData = vocRes.data;
  console.log('      VOC Source:    ', vocData.vocSourceType);
  console.log('      Analyzed Items:', vocData.analyzedReviewCount);
  console.log('      Pain Points:   ', vocData.painPoints?.length);
  console.log('      Praise Points: ', vocData.praisePoints?.length);
  console.log('      Use Cases:     ', vocData.useCases?.length);
  console.log('      Questions:     ', vocData.questions?.length);
  console.log('      Desired Feats: ', vocData.desiredFeatures?.length);
  console.log('      Raw Texts:     ', vocData.rawTexts?.length);

  assert.strictEqual(vocData.vocSourceType, 'EXTERNAL_VOC', 'Source type must be EXTERNAL_VOC');
  assert.ok(vocData.analyzedReviewCount > 0, 'Must have analyzed real items');
  assert.ok(Array.isArray(vocData.painPoints), 'Pain points must be an array');
  assert.ok(vocData.painPoints.length > 0, 'Must have extracted pain points');

  // Verify Scope & Provenance (Phase 6.1)
  console.log('\n      Verifying Analysis Scope & Source Provenance (Phase 6.1):');
  const scope = vocData.analysisScope;
  assert.ok(scope, 'analysisScope must be populated');
  console.log('      - Analysis Scope Type:   ', scope.type);
  console.log('      - Total Analyzed Items:  ', scope.totalAnalyzedItems);
  console.log('      - Exact Product Items:   ', scope.exactProductItems);
  console.log('      - Category Items:        ', scope.categoryItems);
  console.log('      - Generic Items:         ', scope.genericItems);
  console.log('      - Unique Source Pages:   ', scope.uniqueSourcePages);
  console.log('      - Unique Domains:        ', Object.keys(scope.domainDistribution || {}).length);

  assert.strictEqual(scope.type, 'CATEGORY', 'Scope type must be CATEGORY for this search set');
  assert.strictEqual(scope.exactProductItems, 0, 'No direct ASIN mentions in web set');
  assert.strictEqual(scope.categoryItems, 17, '17 category items');
  assert.strictEqual(scope.uniqueSourcePages, 25, '25 unique source pages');
  console.log('      Analysis Scope & Provenance: VERIFIED (PASS)');

  // Verify Provider Usage & Cost Trace
  console.log('\n      Verifying Firecrawl Provider Usage & Cost Trace:');
  const usage = vocRes.providerUsage;
  assert.ok(usage, 'providerUsage must be populated in result');
  console.log('      - Provider:     ', usage.provider);
  console.log('      - Requests:     ', usage.requests);
  console.log('      - Pages Fetched:', usage.pagesFetched);
  console.log('      - Credits Used: ', usage.creditsUsed);
  console.log('      - Billing Unit: ', usage.billingUnit);

  assert.strictEqual(usage.provider, 'firecrawl');
  assert.strictEqual(usage.billingUnit, 'search_credits');
  assert.ok(usage.requests >= 1);
  assert.ok(usage.creditsUsed >= 1);
  console.log('      Provider Usage Tracking: VERIFIED (PASS)');

  // Verify Quote Verbatim Existence & Traceability
  console.log('\n      Verifying Verbatim Quote Integrity & Traceability:');
  let quotesChecked = 0;
  for (const pp of vocData.painPoints) {
    assert.strictEqual(pp.sampleSize, 25, 'sampleSize must be 25');
    assert.strictEqual(pp.scope, 'CATEGORY', 'Pain point scope must be CATEGORY');
    assert.ok(pp.denominatorText.includes('of 25 analyzed discussions'), 'denominatorText must state total sample');

    for (const q of pp.quotes) {
      assert.ok(q.url, `Quote must have a traceable URL! Found: ${q.url}`);
      assert.ok(q.sourceType, `Quote must have a sourceType! Found: ${q.sourceType}`);
      assert.ok(q.scope, `Quote must have a scope! Found: ${q.scope}`);

      // Find the corresponding raw text item
      const matchingRaw = vocData.rawTexts.find((r) => r.url === q.url || r.text.includes(q.quoteText));
      assert.ok(matchingRaw, `Raw text item must exist for quote from ${q.url}`);
      assert.ok(
        matchingRaw.text.includes(q.quoteText),
        `Quote "${q.quoteText.substring(0, 30)}..." MUST be an exact substring of raw text!`,
      );
      quotesChecked++;
    }
  }
  console.log(`      Checked ${quotesChecked} quotes across pain points: 100% VERBATIM MATCH & TRACEABLE (PASS)`);

  // Verify Code-calculated Frequency & Percentage
  console.log('\n      Verifying Deterministic Mathematical Metrics:');
  for (const pp of vocData.painPoints) {
    const expectedPercent = Number(((pp.frequency / vocData.analyzedReviewCount) * 100).toFixed(1));
    assert.strictEqual(
      pp.percentage,
      expectedPercent,
      `Percentage ${pp.percentage}% must strictly equal code calculation ${expectedPercent}%`,
    );
    assert.strictEqual(
      pp.frequency,
      pp.evidenceIds.length,
      `Frequency ${pp.frequency} must strictly equal length of evidenceIds`,
    );
  }
  console.log('      Code-computed Frequency & Percentage: 100% STRICT EQUALITY (PASS)');

  // Print top insights
  console.log('\n      Top Pain Point Sample:');
  const topPain = vocData.painPoints[0];
  console.log('      - Topic:       ', topPain.topic);
  console.log('      - Category:    ', topPain.category);
  console.log('      - Denominator: ', topPain.denominatorText);
  console.log('      - Frequency:   ', `${topPain.frequency} (${topPain.percentage}%)`);
  if (topPain.quotes[0]) {
    console.log('      - Real Quote:  ', `"${topPain.quotes[0].quoteText}"`);
    console.log('      - Source URL:  ', topPain.quotes[0].url);
    console.log('      - Quote Scope: ', topPain.quotes[0].scope);
  }

  // Verify Evidence objects
  assert.ok(vocData.evidence?.length > 0, 'Evidence array must be populated');
  assert.strictEqual(vocData.evidence[0].type, 'EXTERNAL_VOC');
  assert.strictEqual(vocData.evidence[0].source, 'FIRECRAWL');
  assert.strictEqual(vocData.evidence[0].providerId, 'firecrawl');
  assert.ok(vocData.evidence[0].metadata?.sourceUrl, 'Evidence must retain sourceUrl');
  assert.ok(vocData.evidence[0].metadata?.scope, 'Evidence must retain scope');

  // 5. Test Cache Hit
  console.log('\n[5/6] Testing ProviderCache Hit on Repeated Call...');
  const cacheRes = await gateway.executeCapability(
    'voc.product.analyze',
    {
      asin: 'B0BFGNSXYL',
      keyword: 'toothbrush holder marble bathroom',
      marketplace: 'AMAZON_US',
    },
    { workspaceId: 'test_ws', traceId: 'tr_voc_002', marketplace: 'AMAZON_US' },
  );

  console.log('      Success:   ', cacheRes.success);
  console.log('      Mode:      ', cacheRes.mode, '(Expected: CACHED)');
  console.log('      Credits:   ', cacheRes.credits, '(Expected: 0)');
  console.log('      Cache Hit: ', cacheRes.metadata?.cacheHit);
  assert.strictEqual(cacheRes.mode, 'CACHED');
  assert.strictEqual(cacheRes.credits, 0);
  assert.strictEqual(cacheRes.metadata?.cacheHit, true);

  // 6. Security & Secret Redaction Audit
  console.log('\n[6/6] Auditing Secret & Token Redaction...');
  const payloadStr = JSON.stringify(vocRes) + JSON.stringify(cacheRes);
  if (xydcToken && payloadStr.includes(xydcToken)) {
    throw new Error('SECURITY VIOLATION: Plaintext XYDC token leaked into payload!');
  }
  if (firecrawlKey && payloadStr.includes(firecrawlKey)) {
    throw new Error('SECURITY VIOLATION: Plaintext Firecrawl API key leaked into payload!');
  }
  console.log('      Zero Token Leaked in Result Payloads: VERIFIED (PASS)');

  console.log('\n===========================================================');
  console.log('   Phase 6 Dual Provider & Text VOC Fully VERIFIED! ✓    ');
  console.log('===========================================================');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
