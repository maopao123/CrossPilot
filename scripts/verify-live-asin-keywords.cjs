const path = require('path');
const assert = require('assert');

try {
  if (process.loadEnvFile) {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  }
} catch (e) {}

const {
  createDefaultIntegrationGateway,
  IntegrationGateway,
  SecretProvider,
} = require('../packages/integrations/dist/provider-framework/index.js');

function looksLikeFixture(value) {
  const text = JSON.stringify(value || '').toLowerCase();
  return text.includes('demo') || text.includes('mock') || text.includes('preloaded') || text.includes('fixture');
}

async function main() {
  console.log('================================================================');
  console.log('  CrossPilot Phase 2A Live Verification');
  console.log('  Gateway → XYDC → market.asin.keywords → get_asin_keywords');
  console.log('================================================================\n');

  const token = SecretProvider.getSecret('XYDC_MCP_TOKEN');
  const endpoint = SecretProvider.getSecret('XYDC_MCP_ENDPOINT');
  console.log('[1] Configuration Check:');
  console.log(`    Endpoint: ${endpoint || '[NOT_SET]'}`);
  console.log(`    Token:    ${SecretProvider.maskToken(token)}`);
  assert(token, 'XYDC_MCP_TOKEN must be configured');
  assert(endpoint, 'XYDC_MCP_ENDPOINT must be configured');

  console.log('\n[2] Initializing Integration Gateway...');
  const bundle = createDefaultIntegrationGateway();
  IntegrationGateway.setInstance(bundle.gateway);

  const liveContext = {
    workspaceId: 'ws_phase2a_live',
    traceId: `tr_asin_kw_${Date.now()}`,
    marketplace: 'AMAZON_US',
    metadata: { skipProviderFallback: true },
  };

  console.log('\n[3] Routing Resolution:');
  const route = bundle.router.resolveRoute('market.asin.keywords', liveContext);
  console.log(`    Primary Provider:  ${route.primary?.providerId}`);
  console.log(`    Remote Tool:       ${route.primary?.remoteToolName}`);
  console.log(`    Transport:         ${route.primary?.transport}`);
  assert.strictEqual(route.primary?.providerId, 'xydc');
  assert.strictEqual(route.primary?.remoteToolName, 'get_asin_keywords');
  assert.strictEqual(bundle.gateway.hasCapability('market.asin.keywords'), true);

  const seedKeyword = 'toothbrush holder';
  console.log(`\n[4] Resolve a real Top ASIN via market.keyword.search (${seedKeyword})...`);
  const kwResult = await bundle.gateway.executeCapability(
    'market.keyword.search',
    { keyword: seedKeyword, marketplace: 'AMAZON_US' },
    liveContext,
  );
  assert.strictEqual(kwResult.success, true, 'keyword.search must succeed for live ASIN resolution');
  assert.strictEqual(kwResult.providerId, 'xydc');
  assert.strictEqual(kwResult.mode, 'LIVE');
  assert.strictEqual(Boolean(kwResult.fallbackUsed), false);
  const kwList = Array.isArray(kwResult.data) ? kwResult.data : [];
  const seedMetric = kwList.find((m) => m?.keyword === seedKeyword) || kwList[0];
  const liveAsin = Array.isArray(seedMetric?.topAsins) ? seedMetric.topAsins.find((a) => typeof a === 'string' && a.trim()) : null;
  assert(liveAsin, 'keyword.search must return at least one real Top ASIN');
  console.log(`    Live ASIN: ${liveAsin}`);

  console.log(`\n[5] Executing market.asin.keywords for ${liveAsin}...`);
  const execResult = await bundle.gateway.executeCapability(
    'market.asin.keywords',
    { asin: liveAsin, marketplace: 'AMAZON_US', page_size: 20 },
    liveContext,
  );

  console.log(`    Success:      ${execResult.success}`);
  console.log(`    Provider ID:  ${execResult.providerId}`);
  console.log(`    Remote Tool:  ${execResult.remoteToolName}`);
  console.log(`    Mode:         ${execResult.mode}`);
  console.log(`    Credits:      ${execResult.credits ?? 'UNKNOWN'}`);
  console.log(`    Fallback:     ${execResult.fallbackUsed || false}`);
  if (!execResult.success) {
    console.log(`    Error:        ${execResult.error?.code} ${execResult.error?.message}`);
  }

  assert.strictEqual(execResult.success, true, 'Gateway execution must succeed');
  assert.strictEqual(execResult.providerId, 'xydc');
  assert.strictEqual(execResult.remoteToolName, 'get_asin_keywords');
  assert.strictEqual(execResult.mode, 'LIVE');
  assert.strictEqual(Boolean(execResult.fallbackUsed), false);

  const payload = execResult.data || {};
  const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
  console.log(`\n[6] Normalized AsinKeywordResult:`);
  console.log(`    ASIN:              ${payload.asin}`);
  console.log(`    Keyword count:     ${keywords.length}`);
  console.log(`    Total (provider):  ${payload.total ?? 'null'}`);
  if (keywords[0]) {
    console.log(`    First keyword:     ${keywords[0].keyword}`);
    console.log(`    searchRank:        ${keywords[0].searchRank}`);
    console.log(`    trafficShare:      ${keywords[0].trafficShare}`);
    console.log(`    adPosition:        ${keywords[0].adPosition}`);
  }

  assert.strictEqual(payload.asin, liveAsin);
  assert(keywords.length >= 1, 'must return at least 1 real keyword');
  assert(typeof keywords[0].keyword === 'string' && keywords[0].keyword.trim().length > 0);
  assert.strictEqual(looksLikeFixture(execResult), false, 'Live result must not contain DEMO/MOCK fixture text');

  const leaked = JSON.stringify(execResult).includes(token);
  assert.strictEqual(leaked, false, 'plaintext token must not leak');

  console.log('\n================================================================');
  console.log('  [LIVE VERIFICATION PASSED] get_asin_keywords');
  console.log(`  ASIN=${liveAsin} reverseKeywords=${keywords.length} credits=${execResult.credits ?? 'UNKNOWN'}`);
  console.log('================================================================\n');

  return {
    liveAsin,
    reverseKeywordCount: keywords.length,
    credits: execResult.credits ?? null,
    sampleKeywords: keywords.slice(0, 5).map((k) => k.keyword),
  };
}

main()
  .then((summary) => {
    process.stdout.write(`LIVE_ASIN_KEYWORDS_SUMMARY=${JSON.stringify(summary)}\n`);
  })
  .catch((err) => {
    console.error('\n[FATAL ERROR IN LIVE VERIFICATION]:', err);
    process.exit(1);
  });
