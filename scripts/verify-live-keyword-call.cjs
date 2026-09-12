const path = require('path');
const assert = require('assert');

// 1. Ensure .env is loaded
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
const {
  MarketKeywordSearchTool,
} = require('../packages/tool-platform/dist/tools/market/market.tools.js');

async function main() {
  console.log('================================================================');
  console.log('  CrossPilot Phase 2: XYDC MCP get_keyword_info Live Call Test  ');
  console.log('================================================================\n');

  // Verify credentials presence
  const token = SecretProvider.getSecret('XYDC_MCP_TOKEN');
  const endpoint = SecretProvider.getSecret('XYDC_MCP_ENDPOINT');
  console.log(`[1] Configuration Check:`);
  console.log(`    Endpoint: ${endpoint || '[NOT_SET]'}`);
  console.log(`    Token:    ${SecretProvider.maskToken(token)}`);
  assert(token, 'XYDC_MCP_TOKEN must be configured in environment');
  assert(endpoint, 'XYDC_MCP_ENDPOINT must be configured in environment');

  // Initialize Gateway Bundle
  console.log('\n[2] Initializing Default Integration Gateway...');
  const bundle = createDefaultIntegrationGateway();
  IntegrationGateway.setInstance(bundle.gateway);
  console.log('    Gateway initialized with XYDC (Primary) and Mock (Fallback).');

  // Verify Routing for market.keyword.search
  console.log('\n[3] Routing Resolution Check:');
  const route = bundle.router.resolveRoute('market.keyword.search', { marketplace: 'AMAZON_US' });
  console.log(`    Primary Provider:   ${route.primary?.providerId} (Priority: ${route.primary?.priority})`);
  console.log(`    Primary Tool:       ${route.primary?.remoteToolName}`);
  console.log(`    Primary Transport:  ${route.primary?.transport}`);
  console.log(`    Fallback Provider:  ${route.fallback?.providerId} (Priority: ${route.fallback?.priority})`);
  assert.strictEqual(route.primary?.providerId, 'xydc');
  assert.strictEqual(route.primary?.remoteToolName, 'get_keyword_info');
  assert.strictEqual(route.primary?.transport, 'MCP');
  assert.strictEqual(route.fallback?.providerId, 'mock');

  // Execute Live Tool Call via IntegrationGateway
  const targetKeyword = 'toothbrush holder';
  console.log(`\n[4] Executing Gateway Capability: market.keyword.search (Keyword: '${targetKeyword}')...`);
  const gatewayStart = Date.now();
  const execResult = await bundle.gateway.executeCapability(
    'market.keyword.search',
    { keyword: targetKeyword, marketplace: 'AMAZON_US' },
    {
      workspaceId: 'ws_demo_live',
      traceId: `tr_kw_live_${Date.now()}`,
      marketplace: 'AMAZON_US',
    }
  );
  const gatewayDuration = Date.now() - gatewayStart;

  console.log(`\n[5] Gateway Execution Result:`);
  console.log(`    Success:       ${execResult.success}`);
  console.log(`    Provider ID:   ${execResult.providerId}`);
  console.log(`    Transport:     ${execResult.transport}`);
  console.log(`    Mode:          ${execResult.mode}`);
  console.log(`    Remote Tool:   ${execResult.remoteToolName}`);
  console.log(`    Duration:      ${execResult.durationMs}ms (Gateway total: ${gatewayDuration}ms)`);
  console.log(`    Fallback Used: ${execResult.fallbackUsed || false}`);

  // Assertions for Live Execution
  assert.strictEqual(execResult.success, true, 'Gateway execution must succeed');
  assert.strictEqual(execResult.providerId, 'xydc', 'Provider ID must be xydc');
  assert.strictEqual(execResult.transport, 'MCP', 'Transport must be MCP');
  assert.strictEqual(execResult.mode, 'LIVE', 'Mode must be LIVE for genuine remote MCP call');
  assert.strictEqual(execResult.remoteToolName, 'get_keyword_info', 'Remote tool must be get_keyword_info');
  assert.strictEqual(Boolean(execResult.fallbackUsed), false, 'Fallback must not be used');

  const keywords = execResult.data;
  assert(Array.isArray(keywords) && keywords.length > 0, 'Should return array of keywords');
  const kw = keywords[0];

  console.log(`\n[6] Normalized Keyword Metric Data:`);
  console.log(`    Keyword:       ${kw.keyword}`);
  console.log(`    Search Volume: ${kw.searchVolume != null ? kw.searchVolume.toLocaleString() : 'null'}`);
  console.log(`    ABA Rank:      ${kw.abaRank != null ? '#' + kw.abaRank : 'null'}`);
  console.log(`    CPC Bid:       ${kw.cpc != null ? '$' + kw.cpc : 'null'}`);
  console.log(`    Competition:   ${kw.competition != null ? kw.competition : 'null'}`);
  console.log(`    Top ASINs:     ${kw.topAsins ? kw.topAsins.join(', ') : 'null'}`);
  console.log(`    Relevance:     ${kw.relevance != null ? kw.relevance : 'null (Strictly no fake default)'}`);
  console.log(`    Growth:        ${kw.growth != null ? kw.growth : 'null (Strictly no fake default)'}`);
  console.log(`    Source:        ${kw.source}`);

  // Strict Fact Assertions
  assert.strictEqual(kw.keyword, targetKeyword);
  assert(kw.searchVolume > 10000, 'Search volume should be > 10,000 for toothbrush holder');
  assert(kw.abaRank > 0, 'ABA Rank should be positive');
  assert(kw.cpc > 0, 'CPC should be positive');
  assert(kw.competition > 0, 'Competition should be positive');
  assert(Array.isArray(kw.topAsins) && kw.topAsins.length > 0, 'Top ASINs should be populated');
  assert(kw.topAsins.includes('B0BFGNSXYL'), 'Top ASINs should contain B0BFGNSXYL');
  assert.strictEqual(kw.relevance, null, 'Relevance must be strictly null (not faked)');
  assert.strictEqual(kw.growth, null, 'Growth must be strictly null (not faked)');

  // Execute through ToolPlatform ToolDefinition
  console.log(`\n[7] Executing via Tool Platform (MarketKeywordSearchTool)...`);
  const toolResult = await MarketKeywordSearchTool.execute(
    { keyword: targetKeyword, marketplace: 'AMAZON_US' },
    {
      workspaceId: 'ws_demo_live',
      traceId: `tr_tool_kw_${Date.now()}`,
      userId: 'usr_admin',
    }
  );

  console.log(`    Tool Mode:     ${toolResult.mode}`);
  console.log(`    Tool Provider: ${toolResult.provider}`);
  console.log(`    Keywords Count:${toolResult.keywords.length}`);
  console.log(`    Evidence Count:${toolResult.evidence.length}`);
  console.log(`    Evidence Mode: ${toolResult.evidence[0]?.mode}`);
  console.log(`    Evidence Source:${toolResult.evidence[0]?.source}`);
  console.log(`    Evidence Transport:${toolResult.evidence[0]?.transport}`);
  console.log(`    Evidence Title:${toolResult.evidence[0]?.title}`);
  console.log(`    Evidence Content:\n    ${toolResult.evidence[0]?.content.split('\n').join('\n    ')}`);

  assert.strictEqual(toolResult.mode, 'LIVE', 'Tool mode must be LIVE');
  assert.strictEqual(toolResult.provider, 'xydc', 'Tool provider must be xydc');
  assert.strictEqual(toolResult.evidence[0]?.mode, 'LIVE', 'Evidence mode must be LIVE');
  assert.strictEqual(toolResult.evidence[0]?.providerId, 'xydc', 'Evidence provider must be xydc');
  assert.strictEqual(toolResult.evidence[0]?.source, 'XYDC', 'Evidence source must be XYDC');
  assert.strictEqual(toolResult.evidence[0]?.transport, 'MCP', 'Evidence transport must be MCP');

  // Verify Redaction & Security (Zero Token Leakage)
  console.log(`\n[8] Token Redaction & Leakage Audit:`);
  const fullJson = JSON.stringify({ execResult, toolResult });
  assert(!fullJson.includes(token), 'SECURITY VIOLATION: Plaintext token found in execution output!');
  console.log(`    [PASS] Full JSON string scanned (${fullJson.length} bytes), zero plain token leakage detected.`);

  console.log('\n================================================================');
  console.log('  [ALL CHECKS PASSED] get_keyword_info 100% LIVE VERIFIED!      ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN VERIFICATION]:', err);
  process.exit(1);
});
