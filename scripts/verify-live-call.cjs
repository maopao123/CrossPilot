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
  MarketProductDetailTool,
} = require('../packages/tool-platform/dist/tools/market/market.tools.js');

async function main() {
  console.log('================================================================');
  console.log('  CrossPilot: XYDC MCP First Live Tool Call Verification Test   ');
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

  // Verify Routing for market.product.detail
  console.log('\n[3] Routing Resolution Check:');
  const route = bundle.router.resolveRoute('market.product.detail', { marketplace: 'AMAZON_US' });
  console.log(`    Primary Provider:   ${route.primary?.providerId} (Priority: ${route.primary?.priority})`);
  console.log(`    Primary Tool:       ${route.primary?.remoteToolName}`);
  console.log(`    Primary Transport:  ${route.primary?.transport}`);
  console.log(`    Fallback Provider:  ${route.fallback?.providerId} (Priority: ${route.fallback?.priority})`);
  assert.strictEqual(route.primary?.providerId, 'xydc');
  assert.strictEqual(route.primary?.remoteToolName, 'get_asin_info');
  assert.strictEqual(route.primary?.transport, 'MCP');
  assert.strictEqual(route.fallback?.providerId, 'mock');

  // Execute Live Tool Call via IntegrationGateway
  const targetAsin = 'B0BFGNSXYL';
  console.log(`\n[4] Executing Gateway Capability: market.product.detail (ASIN: ${targetAsin})...`);
  const gatewayStart = Date.now();
  const execResult = await bundle.gateway.executeCapability(
    'market.product.detail',
    { asin: targetAsin, marketplace: 'AMAZON_US' },
    {
      workspaceId: 'ws_demo_live',
      traceId: `tr_live_${Date.now()}`,
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
  assert.strictEqual(execResult.remoteToolName, 'get_asin_info', 'Remote tool must be get_asin_info');

  const product = execResult.data;
  console.log(`\n[6] Normalized Product Data:`);
  console.log(`    ASIN:          ${product.asin}`);
  console.log(`    Title:         ${product.title}`);
  console.log(`    Price:         $${product.price}`);
  console.log(`    Rating:        ${product.rating} / 5.0`);
  console.log(`    Reviews:       ${product.reviewCount}`);
  console.log(`    Image URL:     ${product.imageUrl ? product.imageUrl.slice(0, 60) + '...' : '[NONE]'}`);
  console.log(`    Source URL:    ${product.sourceUrl}`);
  console.log(`    Source:        ${product.source}`);

  assert.strictEqual(product.asin, targetAsin);
  assert(product.title.includes('Toothbrush Holders'), 'Title should contain Toothbrush Holders');
  assert(product.price > 0, 'Price should be positive');
  assert(product.rating >= 4.0, 'Rating should be >= 4.0');
  assert(product.reviewCount > 1000, 'Review count should be > 1000');
  assert(product.imageUrl.includes('amazon.com'), 'Image URL should be from amazon');
  assert.strictEqual(product.brand, null, 'Brand should be null when not returned by XYDC');
  assert.strictEqual(product.category, null, 'Category should be null when not returned by XYDC');
  assert.strictEqual(product.monthlySales, null, 'Monthly sales should be null when not returned by XYDC');
  assert.strictEqual(product.bsr, null, 'BSR should be null when not returned by XYDC');

  // Execute through ToolPlatform ToolDefinition
  console.log(`\n[7] Executing via Tool Platform (MarketProductDetailTool)...`);
  const toolResult = await MarketProductDetailTool.execute(
    { asin: targetAsin, marketplace: 'AMAZON_US' },
    {
      workspaceId: 'ws_demo_live',
      traceId: `tr_tool_${Date.now()}`,
      userId: 'usr_admin',
    }
  );

  console.log(`    Tool Mode:     ${toolResult.mode}`);
  console.log(`    Tool Provider: ${toolResult.provider}`);
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
  console.log('  [ALL CHECKS PASSED] XYDC MCP First Live Call 100% VERIFIED!   ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN VERIFICATION]:', err);
  process.exit(1);
});
