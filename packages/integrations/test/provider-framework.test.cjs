/**
 * Provider Framework & XYDC Unit Test Suite
 */

const assert = require('assert');
const path = require('path');

// Require compiled package
const {
  SecretProvider,
  XydcMapper,
  ProviderRegistry,
  CapabilityBindingRegistry,
  ProviderRouter,
  IntegrationGateway,
  createDefaultIntegrationGateway,
  XYDC_PROVIDER_ID,
  MOCK_PROVIDER_ID,
  InMemoryProviderCache,
  RedisProviderCache,
  buildProviderCacheKey,
  FIRECRAWL_PROVIDER_ID,
  FirecrawlMapper,
} = require('../dist/index.js');

console.log('--- Starting Provider Framework Test Suite ---');

async function testSecretProvider() {
  console.log('[Test 1] SecretProvider credentials & redaction');
  
  // Set secret
  SecretProvider.setSecret('TEST_TOKEN', 'secret_xyz_12345678');
  assert.strictEqual(SecretProvider.getSecret('TEST_TOKEN'), 'secret_xyz_12345678');

  // Mask token
  const masked = SecretProvider.maskToken('xydc_live_99887766');
  assert.strictEqual(masked, 'xydc****7766');
  assert.strictEqual(SecretProvider.maskToken(''), '[NOT_SET]');

  // Redact payload
  const sensitiveObj = {
    apiKey: 'my_secret_key',
    token: 'auth_token_value',
    data: {
      clientSecret: 'shhh',
      normalField: 'hello world'
    },
    list: [{ token: 'item_tok', value: 123 }]
  };

  const redacted = SecretProvider.redact(sensitiveObj);
  assert.strictEqual(redacted.apiKey, 'my_s****_key');
  assert.strictEqual(redacted.token, 'auth****alue');
  assert.strictEqual(redacted.data.normalField, 'hello world');
  assert.strictEqual(redacted.data.clientSecret, '****'); // masked
  
  SecretProvider.clearOverrides();
  console.log('✓ SecretProvider passed');
}

async function testXydcMapper() {
  console.log('[Test 2] XydcMapper contract normalization');

  const rawProduct = {
    asin: 'B08XYZ1234',
    title: 'Ergonomic Desk Chair',
    brand_name: 'WorkErgo',
    category_path: 'Office Products > Chairs',
    price: 189.99,
    sales_monthly: 4500,
    revenue_monthly: 854955,
    customer_rating: 4.6,
    review_count: 3200,
    bsr_rank: 120,
    main_image_url: 'https://images.example.com/chair.jpg',
  };

  const normalized = XydcMapper.toMarketProduct(rawProduct, 'AMAZON_US');
  assert.strictEqual(normalized.source, 'XYDC');
  assert.strictEqual(normalized.asin, 'B08XYZ1234');
  assert.strictEqual(normalized.title, 'Ergonomic Desk Chair');
  assert.strictEqual(normalized.brand, 'WorkErgo');
  assert.strictEqual(normalized.monthlySales, 4500);
  assert.strictEqual(normalized.monthlyRevenue, 854955);
  assert.strictEqual(normalized.rating, 4.6);
  assert.strictEqual(normalized.bsr, 120);

  const rawOverview = {
    keyword: 'ergonomic chair',
    monthly_search_volume: 125000,
    average_price: 175.5,
    average_rating: 4.5,
    average_reviews: 2100,
    competitors_count: 58,
    opportunity_index: 8.5,
    competition_intensity: 6.2,
    trending_keywords: [{ kw: 'ergonomic mesh chair', vol: 35000, growth_rate: '+28%' }],
    top_asins: [rawProduct],
  };

  const overview = XydcMapper.toMarketOverview(rawOverview, 'AMAZON_US', 'LIVE');
  assert.strictEqual(overview.seedKeyword, 'ergonomic chair');
  assert.strictEqual(overview.searchVolumeMonthly, 125000);
  assert.strictEqual(overview.avgPrice, 175.5);
  assert.strictEqual(overview.opportunityScore, 8.5);
  assert.strictEqual(overview.competitionScore, 6.2);
  assert.strictEqual(overview.topProducts.length, 1);
  assert.strictEqual(overview.trendingKeywords[0].keyword, 'ergonomic mesh chair');
  assert.ok(overview.evidence.length > 0);

  // Test Real XYDC Entity Mapping
  const realEntity = {
    asin: 'B0BFGNSXYL',
    country: 'US',
    title: 'GFWARE Toothbrush Holders for Bathrooms Countertop',
    price: '9.99',
    currency: 'USD',
    stars: '4.6',
    ratings: 5147,
    smallPicUrl: 'https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY128_.jpg',
    bigPicUrl: 'https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY512_.jpg',
    amazonUrl: 'https://www.amazon.com/dp/B0BFGNSXYL',
  };

  const productFromEntity = XydcMapper.toMarketProductFromEntity(realEntity, 'AMAZON_US');
  assert.strictEqual(productFromEntity.source, 'XYDC');
  assert.strictEqual(productFromEntity.asin, 'B0BFGNSXYL');
  assert.strictEqual(productFromEntity.title, 'GFWARE Toothbrush Holders for Bathrooms Countertop');
  assert.strictEqual(productFromEntity.price, 9.99);
  assert.strictEqual(productFromEntity.rating, 4.6);
  assert.strictEqual(productFromEntity.reviewCount, 5147);
  assert.strictEqual(productFromEntity.imageUrl, 'https://m.media-amazon.com/images/I/613FPhzNozL._AC_UY512_.jpg');
  assert.strictEqual(productFromEntity.brand, null);
  assert.strictEqual(productFromEntity.category, null);
  assert.strictEqual(productFromEntity.monthlySales, null);
  assert.strictEqual(productFromEntity.monthlyRevenue, null);
  assert.strictEqual(productFromEntity.bsr, null);

  // Test Real XYDC Keyword Entity Mapping
  const realKwEntity = {
    searchTerm: 'toothbrush holder',
    clickConversionRate: '0.197068',
    competitiveDifficulty: 80,
    organicRotation: '1.800000',
    abaReport: {
      reportFromDate: '2026-08-30',
      reportToDate: '2026-09-05',
      searchFrequencyRank: 4775,
      weeklySearchVolume: 27057,
      topAsins: [
        { asin: 'B0BFGNSXYL', clickShare: '0.067', conversionShare: '0.052' },
        { asin: 'B0B8VG753F', clickShare: '0.055', conversionShare: '0.050' },
      ],
    },
    costPerClick: {
      value: '0.93',
      minSuggestedBid: '0.74',
      maxSuggestedBid: '1.11',
    },
  };

  const kwMetric = XydcMapper.toKeywordMetricFromEntity(realKwEntity, 'AMAZON_US');
  assert.strictEqual(kwMetric.source, 'XYDC');
  assert.strictEqual(kwMetric.keyword, 'toothbrush holder');
  assert.strictEqual(kwMetric.searchVolume, 27057);
  assert.strictEqual(kwMetric.abaRank, 4775);
  assert.strictEqual(kwMetric.cpc, 0.93);
  assert.strictEqual(kwMetric.competition, 0.8);
  assert.deepStrictEqual(kwMetric.topAsins, ['B0BFGNSXYL', 'B0B8VG753F']);
  assert.strictEqual(kwMetric.relevance, null);
  assert.strictEqual(kwMetric.growth, null);

  const kwEvidence = XydcMapper.toKeywordEvidence(kwMetric, 1, 'LIVE');
  assert.strictEqual(kwEvidence.mode, 'LIVE');
  assert.strictEqual(kwEvidence.source, 'XYDC');
  assert.strictEqual(kwEvidence.providerId, 'xydc');
  assert.strictEqual(kwEvidence.transport, 'MCP');
  assert.strictEqual(kwEvidence.type, 'KEYWORD');

  console.log('✓ XydcMapper passed');
}

async function testProviderRouterAndGateway() {
  console.log('[Test 3] ProviderRouter resolution & IntegrationGateway execution');

  const bundle = createDefaultIntegrationGateway();
  const gateway = bundle.gateway;

  // Test executing market.market.overview (default mock fallback)
  const result = await gateway.executeCapability(
    'market.market.overview',
    { keyword: 'wireless earbuds' },
    { workspaceId: 'ws_test', traceId: 'trace_test_01' }
  );

  assert.strictEqual(result.success, true);
  assert.ok(result.data, 'Result data should be present');
  assert.strictEqual(result.data.seedKeyword, 'wireless earbuds');
  assert.ok(result.durationMs >= 0);
  assert.ok(['LIVE', 'MOCK', 'DEGRADED'].includes(result.mode));
  assert.ok(result.capturedAt);

  // Test executing market.product.search
  const searchRes = await gateway.executeCapability(
    'market.product.search',
    { keyword: 'yoga mat' },
    { workspaceId: 'ws_test', traceId: 'trace_test_02' }
  );
  assert.strictEqual(searchRes.success, true);
  const products = Array.isArray(searchRes.data) ? searchRes.data : searchRes.data?.products;
  assert.ok(Array.isArray(products), 'Search should return array of MarketProduct');
  assert.ok(products.length > 0);
  assert.strictEqual(products[0].marketplace, 'AMAZON_US');
  assert.ok(searchRes.data.keywordMetric !== undefined, 'Search should preserve keywordMetric context');
  assert.ok(searchRes.data.query !== undefined, 'Search should preserve query context');

  // Test executing market.keyword.search
  const kwRes = await gateway.executeCapability(
    'market.keyword.search',
    { keyword: 'running shoes' },
    { workspaceId: 'ws_test', traceId: 'trace_test_03' }
  );
  assert.strictEqual(kwRes.success, true);
  assert.ok(Array.isArray(kwRes.data));

  // Test executing market.product.trend
  const trendRes = await gateway.executeCapability(
    'market.product.trend',
    { asin: 'B0CX123456' },
    { workspaceId: 'ws_test', traceId: 'trace_test_04' }
  );
  assert.strictEqual(trendRes.success, true);
  // Test executing market.product.detail (LIVE or Graceful Fallback)
  const detailRes = await gateway.executeCapability(
    'market.product.detail',
    { asin: 'B0BFGNSXYL' },
    { workspaceId: 'ws_test', traceId: 'trace_test_05', marketplace: 'AMAZON_US' }
  );
  assert.strictEqual(detailRes.success, true);
  assert.ok(detailRes.data.asin, 'Product ASIN should be returned');
  assert.ok(['xydc', 'mock'].includes(detailRes.providerId));
  assert.ok(['LIVE', 'DEGRADED', 'MOCK'].includes(detailRes.mode));

  console.log('✓ ProviderRouter & IntegrationGateway passed');
}

async function testCompositeProductSearchLogic() {
  console.log('[Test 4] Composite Product Search Logic & Null Semantics');

  // 1. ASIN deduplication & sanitation
  const rawAsins = ['B0BFGNSXYL', 'B0BFGNSXYL', '  B0B8VG753F  ', '', null, undefined, 'B08P4ZZTNG'];
  const sanitized = Array.from(new Set(rawAsins.map(a => (a || '').trim())))
    .filter(a => a.length >= 8 && a.length <= 12);
  assert.strictEqual(sanitized.length, 3);
  assert.deepStrictEqual(sanitized, ['B0BFGNSXYL', 'B0B8VG753F', 'B08P4ZZTNG']);

  // 2. XydcMapper strict null verification
  const entity = {
    asin: 'B0TESTASIN1',
    country: 'US',
    title: 'Test Bathroom Organizer',
    price: '19.99',
    stars: '4.5',
    ratings: 820,
    bigPicUrl: 'https://example.com/pic.jpg',
    amazonUrl: 'https://amazon.com/dp/B0TESTASIN1',
  };
  const product = XydcMapper.toMarketProductFromEntity(entity, 'AMAZON_US');
  assert.strictEqual(product.asin, 'B0TESTASIN1');
  assert.strictEqual(product.price, 19.99);
  assert.strictEqual(product.rating, 4.5);
  assert.strictEqual(product.reviewCount, 820);
  assert.strictEqual(product.brand, null, 'Unreturned brand must strictly be null');
  assert.strictEqual(product.category, null, 'Unreturned category must strictly be null');
  assert.strictEqual(product.monthlySales, null, 'Unreturned monthlySales must strictly be null');
  assert.strictEqual(product.monthlyRevenue, null, 'Unreturned monthlyRevenue must strictly be null');
  assert.strictEqual(product.bsr, null, 'Unreturned bsr must strictly be null');

  // 3. Batch mapping helper
  const products = XydcMapper.toMarketProductsFromEntities([entity], 'AMAZON_US');
  assert.strictEqual(products.length, 1);
  assert.strictEqual(products[0].asin, 'B0TESTASIN1');

  // 4. Product Evidence generation
  const evidence = XydcMapper.toProductEvidence(product, {
    providerId: 'xydc',
    transport: 'MCP',
    mode: 'LIVE',
    executionTimeMs: 120,
  });
  assert.strictEqual(evidence.source, 'XYDC');
  assert.strictEqual(evidence.providerId, 'xydc');
  assert.strictEqual(evidence.transport, 'MCP');
  assert.strictEqual(evidence.type, 'MARKET_PRODUCT');
  assert.strictEqual(evidence.mode, 'LIVE');

  console.log('✓ Composite Product Search Logic & Null Semantics passed');
}

async function testTrendMapperAndDeterministicMetrics() {
  console.log('[Test 5] Phase 4 Trend Mappers & Deterministic Metrics Computation');

  // 1. Test BSR summary calculation (lower rank is superior)
  const bsrPoints = [
    { date: '2026-08-01', value: 1500 },
    { date: '2026-08-02', value: 1200 },
    { date: '2026-08-03', value: 800 },
  ];
  const bsrSummary = XydcMapper.computeTrendSummary(bsrPoints, 'BSR');
  assert.strictEqual(bsrSummary.startValue, 1500);
  assert.strictEqual(bsrSummary.endValue, 800);
  assert.strictEqual(bsrSummary.minValue, 800);
  assert.strictEqual(bsrSummary.maxValue, 1500);
  assert.strictEqual(bsrSummary.changeAbsolute, -700);
  assert.strictEqual(bsrSummary.direction, 'RANK_IMPROVED');

  // 1b. Test BSR decline
  const bsrDecline = [
    { date: '2026-08-01', value: 500 },
    { date: '2026-08-02', value: 900 },
  ];
  const bsrDeclineSummary = XydcMapper.computeTrendSummary(bsrDecline, 'BSR');
  assert.strictEqual(bsrDeclineSummary.direction, 'RANK_DECLINED');

  // 2. Test Price summary calculation
  const pricePoints = [
    { date: '2026-08-01', value: 9.99 },
    { date: '2026-08-02', value: 11.99 },
  ];
  const priceSummary = XydcMapper.computeTrendSummary(pricePoints, 'PRICE');
  assert.strictEqual(priceSummary.startValue, 9.99);
  assert.strictEqual(priceSummary.endValue, 11.99);
  assert.strictEqual(priceSummary.changeAbsolute, 2);
  assert.strictEqual(priceSummary.direction, 'PRICE_UP');

  // 3. Test null preservation & zero fake defaults
  const nullPoints = [
    { date: '2026-08-01', value: null },
    { date: '2026-08-02', value: 10.0 },
    { date: '2026-08-03', value: null },
  ];
  const nullSummary = XydcMapper.computeTrendSummary(nullPoints, 'PRICE');
  assert.strictEqual(nullSummary.startValue, 10.0);
  assert.strictEqual(nullSummary.endValue, 10.0);
  assert.notStrictEqual(nullSummary.minValue, 0);
  assert.notStrictEqual(nullSummary.maxValue, 999999);

  // 4. Test toBsrTrend mapper
  const rawBsrData = {
    asin: 'B0BFGNSXYL',
    categoryTree: [
      { categoryId: '1055398', name: 'Home & Kitchen', root: true },
      { categoryId: '13749821', name: 'Toothbrush Holders', root: false },
    ],
    trends: [
      {
        date: '2026-08-01',
        values: [
          { categoryId: '1055398', rank: 1127 },
          { categoryId: '13749821', rank: 2 },
        ],
      },
      {
        date: '2026-08-02',
        values: [
          { categoryId: '1055398', rank: 850 },
          { categoryId: '13749821', rank: 1 },
        ],
      },
    ],
  };
  const bsrTrend = XydcMapper.toBsrTrend(rawBsrData, 'AMAZON_US', 'B0BFGNSXYL');
  assert.strictEqual(bsrTrend.metric, 'BSR');
  assert.strictEqual(bsrTrend.points.length, 2);
  assert.strictEqual(bsrTrend.points[0].value, 1127);
  assert.strictEqual(bsrTrend.points[1].value, 850);
  assert.strictEqual(bsrTrend.summary.direction, 'RANK_IMPROVED');
  assert.strictEqual(bsrTrend.metadata.rootCategoryName, 'Home & Kitchen');

  console.log('✓ Phase 4 Trend Mappers & Deterministic Metrics Computation passed');
}

async function testPhase5ProviderCacheAndVoc() {
  console.log('[Test 6] Phase 5.1 Review Health & VOC Semantic Correction Contracts');

  // 1. Standard Cache Key Generator
  const key = buildProviderCacheKey({
    providerId: 'xydc',
    capabilityId: 'review.product.health',
    marketplace: 'AMAZON_US',
    subject: 'B0BFGNSXYL',
    parameters: 'default',
    version: 'v1',
  });
  assert.strictEqual(
    key,
    'provider:xydc:review.product.health:AMAZON_US:B0BFGNSXYL:default:v1',
  );

  // 2. InMemoryProviderCache TTL
  const cache = new InMemoryProviderCache();
  await cache.set(key, { value: 123 }, 3600);
  const fetched = await cache.get(key);
  assert.strictEqual(fetched.value, 123);

  // 3. XydcMapper toReviewHealthResult
  const mockEntity = {
    asin: 'B0BFGNSXYL',
    stars: 4.6,
    ratings: 5147,
  };
  const health = XydcMapper.toReviewHealthResult('B0BFGNSXYL', 'AMAZON_US', mockEntity);
  assert.strictEqual(health.asin, 'B0BFGNSXYL');
  assert.strictEqual(health.averageRating, 4.6);
  assert.strictEqual(health.totalReviewCount, 5147);
  assert.strictEqual(health.analyzedReviewCount, null); // Strictly null for XYDC
  assert.strictEqual(
    health.summary.includes('当前公开累计评价数：5,147，平均星级：4.6。当前 Provider 未提供单条 Review 文本，因此尚未进行文本级 VOC 分析。'),
    true,
  );
  assert.strictEqual(Array.isArray(health.supportedDimensions), true);
  assert.strictEqual(health.supportedDimensions.includes('averageRating'), true);
  assert.strictEqual(health.supportedDimensions.includes('totalReviewCount'), true);
  assert.strictEqual(Array.isArray(health.unsupportedDimensions), true);
  assert.strictEqual(health.unsupportedDimensions.includes('painPoints'), true);
  assert.strictEqual(health.evidenceNotice.includes('非物理工程质检结论'), true);

  // 4. Review Metric Evidence verification
  const healthEvidence = XydcMapper.toReviewMetricEvidence(health.asin, health, 1, 'LIVE');
  assert.strictEqual(healthEvidence.type, 'REVIEW_METRIC');
  assert.strictEqual(healthEvidence.source, 'XYDC');
  assert.strictEqual(healthEvidence.providerId, 'xydc');
  assert.strictEqual(healthEvidence.content.includes('已分析 Review 文本数: 0 (当前 Provider 未提供单条评论文本)'), true);

  // 5. XydcMapper toVocAnalysisResult (compatibility alias)
  const voc = XydcMapper.toVocAnalysisResult('B0BFGNSXYL', 'AMAZON_US', mockEntity);
  assert.strictEqual(voc.asin, 'B0BFGNSXYL');
  assert.strictEqual(voc.averageRating, 4.6);
  assert.strictEqual(voc.totalReviewCount, 5147);
  assert.strictEqual(voc.analyzedReviewCount, null);
  assert.strictEqual(voc.totalReviewsAnalyzed, null);
  assert.strictEqual(Array.isArray(voc.painPoints), true);
  assert.strictEqual(voc.painPoints.length, 0); // Factual boundary: zero fabricated pain points
  const vocEvidence = XydcMapper.toVocEvidence(voc.asin, voc, 1, 'LIVE');
  assert.strictEqual(vocEvidence.type, 'REVIEW_METRIC'); // Evidence type is REVIEW_METRIC, not VOC

  // 6. Gateway execution of review.product.health (Mock Fallback)
  const bundle = createDefaultIntegrationGateway();
  const resHealth = await bundle.gateway.executeCapability(
    'review.product.health',
    { asin: 'B0BFGNSXYL', marketplace: 'AMAZON_US' },
    { workspaceId: 'test_ws', traceId: 'test_tr', marketplace: 'AMAZON_US' },
  );
  assert.strictEqual(resHealth.success, true);
  assert.strictEqual(resHealth.data.asin, 'B0BFGNSXYL');
  assert.strictEqual(resHealth.data.averageRating, 4.6);
  assert.strictEqual(resHealth.data.totalReviewCount, 5147);
  assert.strictEqual(resHealth.data.analyzedReviewCount, null);

  // 7. Gateway execution of voc.product.analyze (Mock Fallback)
  const resVoc = await bundle.gateway.executeCapability(
    'voc.product.analyze',
    { asin: 'B0BFGNSXYL', marketplace: 'AMAZON_US' },
    { workspaceId: 'test_ws', traceId: 'test_tr', marketplace: 'AMAZON_US' },
  );
  assert.strictEqual(resVoc.success, true);
  assert.strictEqual(resVoc.data.asin, 'B0BFGNSXYL');

  console.log('✓ Phase 5.1 Review Health & VOC Semantic Correction Contracts passed');
}

async function testPhase6DualProviderAndTextVoc() {
  console.log('[Test 7] Phase 6 Dual Provider Routing & Text VOC Contracts');

  // 1. Test RawTextItem normalization & deduplication
  const sampleSearchItems = [
    {
      url: 'https://www.reddit.com/r/CleaningTips/comments/123/toothbrush_holder',
      title: 'Tips for toothbrush holder',
      description: 'The slot opening is too narrow for my electric brush handle, very tight fit.',
    },
    {
      url: 'https://www.reddit.com/r/CleaningTips/comments/123/toothbrush_holder', // duplicate URL
      title: 'Tips for toothbrush holder',
      description: 'The slot opening is too narrow for my electric brush handle, very tight fit.',
    },
    {
      url: 'https://www.walmart.com/reviews/product/999',
      title: 'Marble toothbrush holder',
      description: 'Very heavy and sturdy marble base, prevents tipping over on the counter. Beautiful modern aesthetic.',
    },
    {
      url: 'https://www.youtube.com/watch?v=xyz',
      title: 'Bathroom organization review',
      description: 'Water drainage is an issue at the bottom, builds up slimy mold if you do not wash it.',
    },
  ];

  const rawTexts = FirecrawlMapper.toRawTextItems(sampleSearchItems);
  assert.strictEqual(rawTexts.length, 3, 'Duplicate URL must be filtered out');
  assert.strictEqual(rawTexts[0].sourceType, 'REDDIT');
  assert.strictEqual(rawTexts[1].sourceType, 'REVIEWS');
  assert.strictEqual(rawTexts[2].sourceType, 'YOUTUBE');

  // 2. Test VOC Extraction & Quote Validation
  const { result: vocResult, evidences } = FirecrawlMapper.extractVoc('B0BFGNSXYL', 'AMAZON_US', rawTexts, 'LIVE');
  assert.strictEqual(vocResult.vocSourceType, 'EXTERNAL_VOC');
  assert.strictEqual(vocResult.analyzedReviewCount, 3);
  assert.strictEqual(evidences.length, 3);
  assert.strictEqual(evidences[0].type, 'EXTERNAL_VOC');

  // Strict check: Quotes must be verbatim substrings
  for (const pp of vocResult.painPoints) {
    for (const q of pp.quotes) {
      const match = rawTexts.find((r) => r.text.includes(q.quoteText));
      assert.ok(match, `Quote "${q.quoteText}" must exist verbatim in raw texts!`);
    }
    // Strict check: frequency and percentage
    assert.strictEqual(pp.frequency, pp.evidenceIds.length);
    const expectedPercent = Number(((pp.frequency / 3) * 100).toFixed(1));
    assert.strictEqual(pp.percentage, expectedPercent);
  }

  // 3. Test Dual Provider Router Resolution
  const bundle = createDefaultIntegrationGateway();
  const healthRoute = bundle.router.resolveRoute('review.product.health');
  const vocRoute = bundle.router.resolveRoute('voc.product.analyze');

  assert.strictEqual(healthRoute.primary.providerId, XYDC_PROVIDER_ID, 'review.product.health must route to XYDC');
  assert.strictEqual(vocRoute.primary.providerId, FIRECRAWL_PROVIDER_ID, 'voc.product.analyze must route to Firecrawl');
  assert.strictEqual(vocRoute.fallback.providerId, XYDC_PROVIDER_ID, 'voc.product.analyze fallback must be XYDC');

  console.log('✓ Phase 6 Dual Provider Routing & Text VOC Contracts passed');
}

async function testPhase61ExternalVocScopeAndProvenance() {
  console.log('[Test 8] Phase 6.1 External VOC Scope, Provenance & Cost Trace');

  // 1. Test Scope Classification
  const sampleItems = [
    {
      url: 'https://www.amazon.com/dp/B0BFGNSXYL',
      title: 'GFware Marble Toothbrush Holder',
      description: 'Review for B0BFGNSXYL: the slot opening is too narrow for wide electric toothbrush handles.',
    },
    {
      url: 'https://www.walmart.com/reviews/product/123',
      title: 'Better Homes & Gardens Marble Toothbrush Holder',
      description: 'Great marble toothbrush holder, heavy natural stone weight prevents tipping or sliding on vanity.',
    },
    {
      url: 'https://www.reddit.com/r/Organization/comments/456',
      title: 'Bathroom countertop organizing tips',
      description: 'Water drainage issues causing mold and grime at bottom of bathroom caddy and organizer.',
    },
    {
      url: 'https://www.youtube.com/watch?v=gfware_test',
      title: 'GFWARE Bathroom line test',
      description: 'Reviewing GFWARE toothbrush holder and soap dispenser set for the bathroom.',
    },
  ];

  const rawTexts = FirecrawlMapper.toRawTextItems(sampleItems, 'B0BFGNSXYL', 'toothbrush holder marble bathroom');
  assert.strictEqual(rawTexts.length, 4);

  // Check individual scope determination
  assert.strictEqual(rawTexts[0].metadata.scope, 'EXACT_PRODUCT', 'Item with ASIN must be EXACT_PRODUCT');
  assert.strictEqual(rawTexts[1].metadata.scope, 'CATEGORY', 'Item with marble toothbrush holder must be CATEGORY');
  assert.strictEqual(rawTexts[2].metadata.scope, 'GENERIC', 'General bathroom organizer must be GENERIC');
  assert.strictEqual(rawTexts[3].metadata.scope, 'BRAND_PRODUCT', 'Item with brand GFWARE must be BRAND_PRODUCT');

  // Check domain extraction
  assert.strictEqual(rawTexts[0].metadata.domain, 'www.amazon.com');
  assert.strictEqual(rawTexts[1].metadata.domain, 'www.walmart.com');
  assert.strictEqual(rawTexts[2].metadata.domain, 'www.reddit.com');
  assert.strictEqual(rawTexts[3].metadata.domain, 'www.youtube.com');

  // 2. Test Analysis Scope & Diversity
  const { result: vocResult, evidences } = FirecrawlMapper.extractVoc('B0BFGNSXYL', 'AMAZON_US', rawTexts, 'LIVE', 'toothbrush holder marble');
  const scope = vocResult.analysisScope;
  assert.ok(scope, 'analysisScope must be generated');
  assert.strictEqual(scope.type, 'PRODUCT_PLUS_CATEGORY', 'Mix of exact and category must be PRODUCT_PLUS_CATEGORY');
  assert.strictEqual(scope.totalAnalyzedItems, 4);
  assert.strictEqual(scope.exactProductItems, 1);
  assert.strictEqual(scope.brandProductItems, 1);
  assert.strictEqual(scope.categoryItems, 1);
  assert.strictEqual(scope.genericItems, 1);
  assert.strictEqual(scope.uniqueSourcePages, 4);
  assert.strictEqual(Object.keys(scope.domainDistribution).length, 4);

  // 3. Test Denominator Semantics & Scope
  for (const pp of vocResult.painPoints) {
    assert.strictEqual(pp.sampleSize, 4, 'sampleSize must be 4');
    assert.strictEqual(pp.scope, 'PRODUCT_PLUS_CATEGORY');
    assert.ok(pp.denominatorText.includes('of 4 analyzed discussions'), 'denominatorText must state total sample size');
  }

  // 4. Test Quote Provenance & URL
  for (const pp of vocResult.painPoints) {
    for (const q of pp.quotes) {
      assert.ok(q.url, 'Quote must have traceable URL');
      assert.ok(q.sourceType, 'Quote must have sourceType');
      assert.ok(q.scope, 'Quote must have scope attached');
      const foundInRaw = rawTexts.some((r) => r.text.includes(q.quoteText));
      assert.ok(foundInRaw, 'Quote must exist verbatim in raw text');
    }
  }

  // 5. Test Evidence Provenance Metadata
  for (const evi of evidences) {
    assert.strictEqual(evi.providerId, 'firecrawl');
    assert.strictEqual(evi.type, 'EXTERNAL_VOC');
    assert.ok(evi.metadata.sourceUrl, 'Evidence must have sourceUrl');
    assert.ok(evi.metadata.scope, 'Evidence must have scope');
    assert.ok(evi.metadata.domain, 'Evidence must have domain');
    assert.strictEqual(evi.metadata.targetAsin, 'B0BFGNSXYL');
  }

  console.log('✓ Phase 6.1 External VOC Scope, Provenance & Cost Trace passed');
}

async function runAll() {
  try {
    await testSecretProvider();
    await testXydcMapper();
    await testProviderRouterAndGateway();
    await testCompositeProductSearchLogic();
    await testTrendMapperAndDeterministicMetrics();
    await testPhase5ProviderCacheAndVoc();
    await testPhase6DualProviderAndTextVoc();
    await testPhase61ExternalVocScopeAndProvenance();
    console.log('\n=======================================');
    console.log('ALL PROVIDER FRAMEWORK TESTS PASSED! ✓');
    console.log('=======================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  }
}

runAll();

