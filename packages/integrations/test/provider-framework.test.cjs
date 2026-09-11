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
  assert.ok(Array.isArray(searchRes.data), 'Search should return array of MarketProduct');
  assert.ok(searchRes.data.length > 0);
  assert.strictEqual(searchRes.data[0].marketplace, 'AMAZON_US');

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
  assert.ok(trendRes.data.points.length > 0);

  console.log('✓ ProviderRouter & IntegrationGateway passed');
}

async function runAll() {
  try {
    await testSecretProvider();
    await testXydcMapper();
    await testProviderRouterAndGateway();
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
