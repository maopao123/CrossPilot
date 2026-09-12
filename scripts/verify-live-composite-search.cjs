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
  MarketProductSearchTool,
} = require('../packages/tool-platform/dist/tools/market/market.tools.js');

async function main() {
  console.log('================================================================');
  console.log('  CrossPilot: XYDC Phase 3 Composite Product Search Live Call   ');
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

  // Verify Routing for market.product.search
  console.log('\n[3] Routing Resolution Check:');
  const route = bundle.router.resolveRoute('market.product.search', { marketplace: 'AMAZON_US' });
  console.log(`    Primary Provider:   ${route.primary?.providerId} (Priority: ${route.primary?.priority})`);
  console.log(`    Primary Tool:       ${route.primary?.remoteToolName}`);
  console.log(`    Primary Transport:  ${route.primary?.transport}`);
  console.log(`    Primary Status:     ${route.primary?.metadata?.status}`);
  console.log(`    Fallback Provider:  ${route.fallback?.providerId} (Priority: ${route.fallback?.priority})`);
  assert.strictEqual(route.primary?.providerId, 'xydc');
  assert.strictEqual(route.primary?.remoteToolName, 'get_keyword_info+get_asin_info');
  assert.strictEqual(route.primary?.transport, 'MCP');
  assert.strictEqual(route.fallback?.providerId, 'mock');

  // Execute Live Composite Call via IntegrationGateway
  const targetKeyword = 'toothbrush holder';
  console.log(`\n[4] Executing Gateway Capability: market.product.search (Keyword: '${targetKeyword}')...`);
  const gatewayStart = Date.now();
  const execResult = await bundle.gateway.executeCapability(
    'market.product.search',
    { keyword: targetKeyword, marketplace: 'AMAZON_US', limit: 3 },
    {
      workspaceId: 'ws_demo_live',
      traceId: `tr_live_${Date.now()}`,
      marketplace: 'AMAZON_US',
    }
  );
  const gatewayDuration = Date.now() - gatewayStart;

  console.log(`\n[5] Gateway Composite Execution Result:`);
  console.log(`    Success:       ${execResult.success}`);
  console.log(`    Provider ID:   ${execResult.providerId}`);
  console.log(`    Transport:     ${execResult.transport}`);
  console.log(`    Mode:          ${execResult.mode}`);
  console.log(`    Remote Tool:   ${execResult.remoteToolName}`);
  console.log(`    Duration:      ${execResult.durationMs}ms (Gateway total: ${gatewayDuration}ms)`);
  console.log(`    Credits:       ${execResult.credits} Credits`);
  console.log(`    Fallback Used: ${execResult.fallbackUsed || false}`);

  // Assertions for Live Execution
  assert.strictEqual(execResult.success, true, 'Gateway execution must succeed');
  assert.strictEqual(execResult.providerId, 'xydc', 'Provider ID must be xydc');
  assert.strictEqual(execResult.transport, 'MCP', 'Transport must be MCP');
  assert.strictEqual(execResult.mode, 'LIVE', 'Mode must be LIVE for genuine remote MCP call');
  assert.strictEqual(execResult.fallbackUsed || false, false, 'Fallback must NOT be used');

  // Verify Composite Trace
  console.log(`\n[6] Composite Trace Lineage:`);
  assert(execResult.compositeTrace, 'compositeTrace must be present');
  console.log(`    Total Steps:    ${execResult.compositeTrace.steps.length}`);
  console.log(`    Total Duration: ${execResult.compositeTrace.totalDurationMs}ms`);
  console.log(`    Total Credits:  ${execResult.compositeTrace.totalCredits} Credits`);
  assert.strictEqual(execResult.compositeTrace.steps.length, 2, 'Must have exactly 2 composite steps');
  assert.strictEqual(execResult.compositeTrace.steps[0].toolName, 'get_keyword_info');
  assert.strictEqual(execResult.compositeTrace.steps[1].toolName, 'get_asin_info');
  assert.strictEqual(execResult.compositeTrace.steps[0].success, true);
  assert.strictEqual(execResult.compositeTrace.steps[1].success, true);
  execResult.compositeTrace.steps.forEach((s, idx) => {
    console.log(`    - Step ${idx + 1} [${s.toolName}]: duration=${s.durationMs}ms, credits=${s.credits}, items=${s.itemCount ?? 1}`);
  });

  // Verify Keyword Metric Context
  const searchData = execResult.data;
  const kwMetric = searchData.keywordMetric;
  console.log(`\n[7] Preserved Keyword Metric Context:`);
  console.log(`    Keyword:        ${kwMetric.keyword}`);
  console.log(`    Search Volume:  ${kwMetric.searchVolume}`);
  console.log(`    ABA Rank:       #${kwMetric.abaRank}`);
  console.log(`    CPC:            $${kwMetric.cpc}`);
  console.log(`    Competition:    ${kwMetric.competition}`);
  console.log(`    Relevance:      ${kwMetric.relevance}`);
  console.log(`    Growth:         ${kwMetric.growth}`);
  console.log(`    Top ASINs:      ${JSON.stringify(kwMetric.topAsins)}`);

  assert.strictEqual(kwMetric.keyword, targetKeyword);
  assert(kwMetric.searchVolume > 10000, 'Search volume should be > 10000');
  assert(kwMetric.abaRank > 0, 'ABA rank should be > 0');
  assert(kwMetric.cpc > 0, 'CPC should be > 0');
  assert.strictEqual(kwMetric.relevance, null, 'Relevance must be null');
  assert.strictEqual(kwMetric.growth, null, 'Growth must be null');
  assert(Array.isArray(kwMetric.topAsins) && kwMetric.topAsins.length >= 1, 'Top ASINs must contain items');

  // Verify Products
  console.log(`\n[8] Batch Products Result (${searchData.products.length} products):`);
  assert(searchData.products.length >= 1, 'Products list must contain at least 1 item');
  searchData.products.forEach((p, idx) => {
    console.log(`    [${idx + 1}] ASIN: ${p.asin} | Price: $${p.price} | Rating: ${p.rating} | Reviews: ${p.reviewCount} | Title: ${p.title.slice(0, 35)}...`);
    assert(p.asin && p.asin.length >= 8, 'ASIN must be valid');
    assert(p.title && p.title.length > 0, 'Title must be non-empty');
    assert(p.price > 0, 'Price must be positive');
    assert(p.rating >= 4.0, 'Rating must be >= 4.0');
    assert(p.reviewCount > 0, 'ReviewCount must be positive');
    assert.strictEqual(p.brand, null, 'Brand must be null');
    assert.strictEqual(p.category, null, 'Category must be null');
    assert.strictEqual(p.monthlySales, null, 'MonthlySales must be null');
    assert.strictEqual(p.monthlyRevenue, null, 'MonthlyRevenue must be null');
    assert.strictEqual(p.bsr, null, 'BSR must be null');
  });

  // Verify Evidences
  console.log(`\n[9] Evidences Verification (${searchData.evidence.length} evidences):`);
  assert(searchData.evidence.length >= 2, 'Must have at least 2 evidence records (KEYWORD + MARKET_PRODUCT)');
  const kwEvidence = searchData.evidence.find(e => e.type === 'KEYWORD');
  const prodEvidence = searchData.evidence.find(e => e.type === 'MARKET_PRODUCT');
  assert(kwEvidence, 'KEYWORD evidence must exist');
  assert(prodEvidence, 'MARKET_PRODUCT evidence must exist');
  assert.strictEqual(kwEvidence.source, 'XYDC');
  assert.strictEqual(kwEvidence.providerId, 'xydc');
  assert.strictEqual(kwEvidence.transport, 'MCP');
  assert.strictEqual(kwEvidence.mode, 'LIVE');
  assert.strictEqual(prodEvidence.source, 'XYDC');
  assert.strictEqual(prodEvidence.providerId, 'xydc');
  assert.strictEqual(prodEvidence.transport, 'MCP');
  assert.strictEqual(prodEvidence.mode, 'LIVE');
  console.log(`    - Keyword Evidence: [${kwEvidence.type}] source=${kwEvidence.source}, mode=${kwEvidence.mode}`);
  console.log(`    - Product Evidence: [${prodEvidence.type}] source=${prodEvidence.source}, mode=${prodEvidence.mode}`);

  // Execute through ToolPlatform ToolDefinition
  console.log(`\n[10] Executing via Tool Platform (MarketProductSearchTool)...`);
  const toolResult = await MarketProductSearchTool.execute(
    { keyword: targetKeyword, marketplace: 'AMAZON_US', limit: 3 },
    {
      workspaceId: 'ws_demo_live',
      traceId: `tr_tool_${Date.now()}`,
      userId: 'usr_admin',
    }
  );

  console.log(`    Tool Mode:       ${toolResult.mode}`);
  console.log(`    Tool Provider:   ${toolResult.provider}`);
  console.log(`    Tool Total:      ${toolResult.total}`);
  console.log(`    Tool Evidences:  ${toolResult.evidence.length}`);
  console.log(`    Tool KwMetric:   ${toolResult.keywordMetric ? toolResult.keywordMetric.keyword : 'NONE'}`);
  console.log(`    Tool Trace:      ${toolResult.compositeTrace ? `${toolResult.compositeTrace.totalCredits} Credits, ${toolResult.compositeTrace.totalDurationMs}ms` : 'NONE'}`);
  assert.strictEqual(toolResult.mode, 'LIVE');
  assert.strictEqual(toolResult.provider, 'xydc');
  assert(toolResult.products.length >= 1);
  assert(toolResult.keywordMetric !== null);

  console.log('\n================================================================');
  console.log('  ALL CHECKS PASSED: market.product.search COMPOSITE LIVE = YES ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL TEST FAILURE]', err);
  process.exit(1);
});
