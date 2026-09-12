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
const {
  MarketProductTrendTool,
} = require('../packages/tool-platform/dist/tools/market/market.tools.js');

async function main() {
  console.log('===============================================================');
  console.log('  CrossPilot Phase 4: XYDC MCP market.product.trend Live Test   ');
  console.log('===============================================================\n_');

  // [1] Configuration Check
  const token = SecretProvider.getSecret('XYDC_MCP_TOKEN');
  const endpoint = SecretProvider.getSecret('XYDC_MCP_ENDPOINT');
  console.log('[1] Configuration Check:');
  console.log('    Endpoint: ' + (endpoint || '[NOT_SET]'));
  console.log('    Token:    ' + SecretProvider.maskToken(token));
  assert(token, 'XYDC_MCP_TOKEN must be configured in environment');
  assert(endpoint, 'XYDC_MCP_ENDPOINT must be configured in environment');

  // [2] Initialize Gateway Bundle
  console.log('\n[2] Initializing Default Integration Gateway...');
  const bundle = createDefaultIntegrationGateway();
  IntegrationGateway.setInstance(bundle.gateway);
  console.log('    Gateway initialized with XYDC (Primary) and Mock (Fallback).');

  // [3] Routing Resolution Check
  console.log('\n[3] Routing Resolution Check:');
  const route = bundle.router.resolveRoute('market.product.trend', { marketplace: 'AMAZON_US' });
  console.log('    Primary Provider:   ' + route.primary?.providerId);
  console.log('    Primary Tool:       ' + route.primary?.remoteToolName);
  console.log('    Primary Transport:  ' + route.primary?.transport);
  console.log('    Fallback Provider:  ' + route.fallback?.providerId);
  assert.strictEqual(route.primary?.providerId, 'xydc');
  assert.strictEqual(route.primary?.transport, 'MCP');
  assert.strictEqual(route.fallback?.providerId, 'mock');

  // [4] First Live Execution: ASIN B0BFGNSXYL, Range 30d, Metric ALL
  const targetAsin = 'B0BFGNSXYL';
  console.log('\n[4] Executing Gateway Capability (LIVE): market.product.trend (ASIN: ' + targetAsin + ', Range: 30d, Metric: ALL)...');
  const liveStart = Date.now();
  const liveResult = await bundle.gateway.executeCapability(
    'market.product.trend',
    { asin: targetAsin, range: '30d', metric: 'ALL', marketplace: 'AMAZON_US' },
    {
      workspaceId: 'ws_phase4_live',
      traceId: 'tr_trend_live_' + Date.now(),
      marketplace: 'AMAZON_US',
    }
  );
  const liveDuration = Date.now() - liveStart;

  console.log('\n[5] Live Execution Result:');
  console.log('    Success:       ' + liveResult.success);
  console.log('    Provider ID:   ' + liveResult.providerId);
  console.log('    Transport:     ' + liveResult.transport);
  console.log('    Mode:          ' + liveResult.mode);
  console.log('    Duration:      ' + liveDuration + 'ms (Gateway reported: ' + liveResult.durationMs + 'ms)');
  console.log('    Fallback Used: ' + (liveResult.fallbackUsed ?? false));

  assert.strictEqual(liveResult.success, true, 'Execution must succeed');
  assert.strictEqual(liveResult.providerId, 'xydc', 'Provider must be xydc');
  assert.strictEqual(liveResult.transport, 'MCP', 'Transport must be MCP');
  assert.strictEqual(liveResult.mode, 'LIVE', 'Mode must be LIVE for initial call');

  const trends = liveResult.data;
  assert(Array.isArray(trends), 'liveResult.data must be an array of MarketTrend');
  console.log('    Returned Trends Count: ' + trends.length);

  // Inspect each trend metric & deterministic summary
  console.log('\n[6] Trend Metrics & Deterministic Summaries Analysis:');
  for (const t of trends) {
    console.log('    --------------------------------------------------------');
    console.log('    Metric:        ' + t.metric);
    console.log('    Points Count:  ' + t.points.length);
    if (t.points.length > 0) {
      console.log('    First Date:    ' + t.points[0].date + ' (Value: ' + t.points[0].value + ')');
      console.log('    Last Date:     ' + t.points[t.points.length - 1].date + ' (Value: ' + t.points[t.points.length - 1].value + ')');
    }
    if (t.summary) {
      console.log('    Summary:');
      console.log('      Start:       ' + t.summary.startValue);
      console.log('      End:         ' + t.summary.endValue);
      console.log('      Min:         ' + t.summary.minValue);
      console.log('      Max:         ' + t.summary.maxValue);
      console.log('      Average:     ' + t.summary.averageValue);
      console.log('      Change:      ' + t.summary.changeAbsolute + ' (' + t.summary.changePercent + '%) was ' + t.summary.direction);

      assert.notStrictEqual(t.summary.minValue, 999999, 'Must not contain fake 999999');
      if (t.metric === 'BSR') {
        assert(
          ['RANK_IMPROVED', 'RANK_DECLINED', 'STABLE'].includes(t.summary.direction),
          'BSR direction must be valid, got ' + t.summary.direction
        );
      } else if (t.metric === 'PRICE') {
        assert(
          ['PRICE_UP', 'PRICE_DOWN', 'STABLE'].includes(t.summary.direction),
          'Price direction must be valid, got ' + t.summary.direction
        );
      }
    }
  }

  // [7] Composite Trace Inspection
  console.log('\n[7] Composite Trace & Credit Consumption Inspection:');
  const trace = liveResult.compositeTrace;
  if (trace) {
    console.log('    Total Duration: ' + trace.totalDurationMs + 'ms');
    console.log('    Total Credits:  ' + trace.totalCredits);
    console.log('    Steps (' + trace.steps.length + '):');
    trace.steps.forEach((step) => {
      console.log('      - Step ' + step.step + ' [' + step.toolName + ']: ' + step.durationMs + 'ms, ' + step.credits + ' credits, success=' + step.success + ', items=' + step.itemCount);
    });
  }

  // [8] Second Execution: Cache Test (same query)
  console.log('\n[8] Executing Gateway Capability (CACHE TEST): same query...');
  const cacheStart = Date.now();
  const cacheResult = await bundle.gateway.executeCapability(
    'market.product.trend',
    { asin: targetAsin, range: '30d', metric: 'ALL', marketplace: 'AMAZON_US' },
    {
      workspaceId: 'ws_phase4_cache',
      traceId: 'tr_trend_cache_' + Date.now(),
      marketplace: 'AMAZON_US',
    }
  );
  const cacheDuration = Date.now() - cacheStart;

  console.log('    Success:       ' + cacheResult.success);
  console.log('    Provider ID:   ' + cacheResult.providerId);
  console.log('    Mode:          ' + cacheResult.mode);
  console.log('    Duration:      ' + cacheDuration + 'ms');
  console.log('    Cache Hit:     ' + cacheResult.metadata?.cacheHit);

  assert.strictEqual(cacheResult.success, true);
  assert.strictEqual(cacheResult.mode, 'CACHED', 'Subsequent call must be CACHED');
  assert.strictEqual(cacheResult.metadata?.cacheHit, true, 'metadata.cacheHit must be true');
  assert(cacheDuration < 50, 'Cache response must be fast (<50ms), took ' + cacheDuration + 'ms');

  // [9] Tool Platform Integration Test via MarketProductTrendTool
  console.log('\n[9] Tool Platform Execution Check (MarketProductTrendTool)...');
  const toolResult = await MarketProductTrendTool.execute(
    { asin: targetAsin, range: '30d', metric: 'BSR', marketplace: 'AMAZON_US' },
    { workspaceId: 'ws_tool_test', traceId: 'tr_tool_' + Date.now() }
  );
  console.log('    Tool Provider: ' + toolResult.provider);
  console.log('    Tool Mode:     ' + toolResult.mode);
  console.log('    Tool Trends:   ' + toolResult.trends.length);
  console.log('    Tool Evidence: ' + toolResult.evidence.length);
  assert(toolResult.trends.length > 0, 'Tool must return trends');
  assert(toolResult.evidence.length > 0, 'Tool must generate evidence');

  // [10] Zero Token Leak Audit
  console.log('\n[10] Zero Token Leakage Audit:');
  const serialized = JSON.stringify({ liveResult, cacheResult, toolResult });
  assert(!serialized.includes(token), 'Security violation: raw token leaked into execution results');
  console.log('    VERIFIED: Zero raw credentials leaked in payloads or traces.');

  console.log('\n==============================================================');
  console.log('  Phase 4 Verification COMPLETE: ALL 10 GATES PASSED!          ');
  console.log('==============================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR] Phase 4 Verification Failed:', err);
  process.exit(1);
});
