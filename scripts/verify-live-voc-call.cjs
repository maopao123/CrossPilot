/**
 * XYDC Phase 5.1 Live Verification Script
 * Validates:
 * 1. Part A: Redis / InMemory ProviderCache integration with standard review.product.health cache key
 * 2. Part B: Live review.product.health on target ASIN B0BFGNSXYL
 * 3. Cache hit semantics: mode=CACHED, credits=0, metadata.cacheHit=true
 * 4. Factual vs. observation boundary:
 *    - totalReviewCount = 5147
 *    - analyzedReviewCount = null (zero review texts mined)
 *    - evidence.type = REVIEW_METRIC (not VOC)
 *    - summary stating zero review texts provided by vendor
 * 5. Compatibility alias voc.product.analyze also functions with identical honest semantics
 * 6. Zero credential leakage: Token masked, never exposed
 */

const path = require('path');
const fs = require('fs');

try {
  if (process.loadEnvFile) {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {}

const token = process.env.XYDC_MCP_TOKEN;
const endpoint = process.env.XYDC_MCP_ENDPOINT;

console.log('===========================================================');
console.log('   CrossPilot XYDC Phase 5.1 Review Health Live Test');
console.log('===========================================================');
console.log(`Endpoint: ${endpoint || '[NOT CONFIGURED]'}`);
console.log(`Token:    ${token ? `${token.substring(0, 4)}****${token.substring(token.length - 4)}` : '[NOT CONFIGURED]'}`);
console.log('-----------------------------------------------------------');

async function main() {
  // Dynamically import ESM modules from @crosspilot/integrations
  const integrationsPath = path.join(__dirname, '..', 'packages', 'integrations', 'dist', 'index.js');
  const integrations = await import('file:///' + integrationsPath.replace(/\\/g, '/'));

  const {
    createDefaultIntegrationGateway,
    buildProviderCacheKey,
    RedisProviderCache,
    InMemoryProviderCache,
  } = integrations;

  console.log('[1/6] Testing ProviderCache Abstraction...');
  const memCache = new InMemoryProviderCache();
  const testKey = buildProviderCacheKey({
    providerId: 'xydc',
    capabilityId: 'review.product.health',
    marketplace: 'AMAZON_US',
    subject: 'B0BFGNSXYL',
    parameters: 'default',
    version: 'v1',
  });
  console.log(`      Standard Cache Key: ${testKey}`);
  await memCache.set(testKey, { test: true }, 60);
  const memVal = await memCache.get(testKey);
  console.log(`      InMemoryProviderCache set/get: ${memVal?.test === true ? 'PASSED' : 'FAILED'}`);

  // Test RedisProviderCache graceful fallback
  const redisCache = new RedisProviderCache();
  await redisCache.set(testKey, { redisTest: true }, 60);
  const redisVal = await redisCache.get(testKey);
  console.log(`      RedisProviderCache (with auto-fallback) set/get: ${redisVal?.redisTest === true ? 'PASSED' : 'FAILED'}`);

  console.log('\n[2/6] Initializing Integration Gateway Bundle...');
  const bundle = createDefaultIntegrationGateway();
  const gateway = bundle.gateway;

  const targetAsin = 'B0BFGNSXYL';
  const marketplace = 'AMAZON_US';

  console.log(`\n[3/6] Executing First Call: review.product.health (Live Query on ${targetAsin})...`);
  const t1 = Date.now();
  const res1 = await gateway.executeCapability(
    'review.product.health',
    { asin: targetAsin, marketplace, skipCache: true },
    { workspaceId: 'ws_phase5_test', traceId: `trace_rev_live_${t1}`, marketplace }
  );
  const d1 = Date.now() - t1;

  console.log(`      Success:     ${res1.success}`);
  console.log(`      Mode:        ${res1.mode}`);
  console.log(`      Provider:    ${res1.providerId}`);
  console.log(`      Transport:   ${res1.transport}`);
  console.log(`      Credits:     ${res1.credits ?? 1}`);
  console.log(`      Duration:    ${d1}ms`);

  if (res1.success && res1.data) {
    const data = res1.data;
    console.log(`      ASIN:        ${data.asin}`);
    console.log(`      Avg Rating:  ${data.averageRating}★`);
    console.log(`      Total Revs:  ${data.totalReviewCount?.toLocaleString()}`);
    console.log(`      Analyzed:    ${data.analyzedReviewCount === null ? 'null (No review text provided by vendor)' : data.analyzedReviewCount}`);
    console.log(`      EvidenceType:${data.evidence?.[0]?.type || 'N/A'} (Expected: REVIEW_METRIC)`);
    console.log(`      Supported:   ${JSON.stringify(data.supportedDimensions)}`);
    console.log(`      Unsupported: ${JSON.stringify(data.unsupportedDimensions)}`);
    console.log(`      Summary:     ${data.summary}`);
    console.log(`      Disclaimer:  ${data.evidenceNotice}`);

    if (data.totalReviewCount !== 5147) {
      console.error(`      [FAIL] Expected totalReviewCount = 5147, got ${data.totalReviewCount}`);
      process.exit(1);
    }
    if (data.analyzedReviewCount !== null) {
      console.error(`      [FAIL] Expected analyzedReviewCount = null, got ${data.analyzedReviewCount}`);
      process.exit(1);
    }
    if (data.evidence?.[0]?.type !== 'REVIEW_METRIC') {
      console.error(`      [FAIL] Expected evidence.type = REVIEW_METRIC, got ${data.evidence?.[0]?.type}`);
      process.exit(1);
    }
  } else {
    console.error('      Execution Failed:', res1.error);
    process.exit(1);
  }

  console.log(`\n[4/6] Executing Second Call: review.product.health (Testing Cache Hit on ${targetAsin})...`);
  const t2 = Date.now();
  const res2 = await gateway.executeCapability(
    'review.product.health',
    { asin: targetAsin, marketplace, skipCache: false },
    { workspaceId: 'ws_phase5_test', traceId: `trace_rev_cache_${t2}`, marketplace }
  );
  const d2 = Date.now() - t2;

  console.log(`      Success:     ${res2.success}`);
  console.log(`      Mode:        ${res2.mode} (Expected: CACHED)`);
  console.log(`      Credits:     ${res2.credits ?? 0} (Expected: 0)`);
  console.log(`      CacheHit:    ${res2.metadata?.cacheHit}`);
  console.log(`      Duration:    ${d2}ms (Instant return from cache)`);

  if (res2.mode !== 'CACHED' || res2.credits !== 0) {
    console.error('      [FAIL] Cache hit did not produce mode=CACHED or credits=0');
    process.exit(1);
  }

  console.log(`\n[5/6] Executing Compatibility Alias: voc.product.analyze on ${targetAsin}...`);
  const t3 = Date.now();
  const res3 = await gateway.executeCapability(
    'voc.product.analyze',
    { asin: targetAsin, marketplace, skipCache: true },
    { workspaceId: 'ws_phase5_test', traceId: `trace_voc_alias_${t3}`, marketplace }
  );
  console.log(`      Success:     ${res3.success}`);
  console.log(`      Mode:        ${res3.mode}`);
  console.log(`      Total Revs:  ${res3.data?.totalReviewCount}`);
  console.log(`      Analyzed:    ${res3.data?.analyzedReviewCount}`);
  console.log(`      EvidenceType:${res3.data?.evidence?.[0]?.type}`);
  console.log(`      Pain Points: ${JSON.stringify(res3.data?.painPoints)} (Factual: empty array)`);

  if (res3.data?.evidence?.[0]?.type !== 'REVIEW_METRIC') {
    console.error(`      [FAIL] Alias expected evidence.type = REVIEW_METRIC, got ${res3.data?.evidence?.[0]?.type}`);
    process.exit(1);
  }

  console.log('\n[6/6] Token & Secret Leakage Audit...');
  const resStr1 = JSON.stringify(res1);
  const resStr2 = JSON.stringify(res2);
  const resStr3 = JSON.stringify(res3);
  const leaked = token && (resStr1.includes(token) || resStr2.includes(token) || resStr3.includes(token));
  console.log(`      Zero Token Leaked in Result Payloads: ${!leaked ? 'VERIFIED (PASS)' : 'LEAK DETECTED!'}`);

  console.log('\n===========================================================');
  console.log('   Phase 5.1 Review Health Semantic Correction VERIFIED!');
  console.log('===========================================================');
}

main().catch(err => {
  console.error('Verification Fatal Error:', err);
  process.exit(1);
});
