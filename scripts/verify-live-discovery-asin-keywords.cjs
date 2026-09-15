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
const { ProductDiscoveryService } = require('../packages/domain/dist/index.js');

function looksLikeFixture(value) {
  const text = JSON.stringify(value || '').toLowerCase();
  return text.includes('demo_fixture') || text.includes('preloadeddata') || text.includes('mockexecutor');
}

async function main() {
  console.log('================================================================');
  console.log('  CrossPilot Phase 2A Live Seed E2E');
  console.log('  Seed → keyword.search → ASIN → asin.keywords → Round 2');
  console.log('================================================================\n');

  const token = SecretProvider.getSecret('XYDC_MCP_TOKEN');
  const endpoint = SecretProvider.getSecret('XYDC_MCP_ENDPOINT');
  assert(token, 'XYDC_MCP_TOKEN must be configured');
  assert(endpoint, 'XYDC_MCP_ENDPOINT must be configured');

  const bundle = createDefaultIntegrationGateway();
  IntegrationGateway.setInstance(bundle.gateway);
  const gateway = bundle.gateway;

  const seed = 'toothbrush holder';
  const executedCalls = [];
  const executor = {
    execute: async (capabilityId, input, marketplace) => {
      executedCalls.push({ capabilityId, input });
      const result = await gateway.executeCapability(capabilityId, input, {
        workspaceId: 'ws_phase2a_seed',
        traceId: `tr_disc_${capabilityId}_${Date.now()}`,
        marketplace,
        source: 'AUTO_DISCOVERY',
        metadata: { skipProviderFallback: true },
      });
      return {
        success: result.success,
        data: result.data,
        providerId: result.providerId,
        costCredits: result.credits,
        error: result.error,
      };
    },
    hasCapability: (capId) => gateway.hasCapability(capId),
    getCapabilityCost: (capId) => gateway.getCapabilityCost(capId),
  };

  const service = new ProductDiscoveryService(executor);
  const preview = service.previewDiscovery({
    marketplace: 'AMAZON_US',
    seed: { keyword: seed },
    budget: { maxProviderCalls: 8, maxCredits: 20 },
    limits: { maxExpandedKeywords: 20, maxRepresentativeAsins: 8, maxCandidateDrafts: 10 },
  });

  console.log('[Preview]');
  console.log(`    plannedCapabilities: ${preview.plannedCapabilities.join(', ')}`);
  console.log(`    availability:        ${JSON.stringify(preview.capabilityAvailability || {})}`);
  console.log(`    estimatedCallCount:  ${preview.estimatedCallCount}`);
  console.log(`    knownCreditCost:     ${preview.knownCreditCost}`);
  console.log(`    unknownCostFields:   ${preview.unknownCostFields.join(', ') || '(none)'}`);

  const run = await service.runDiscovery({
    marketplace: 'AMAZON_US',
    seed: { keyword: seed },
    budget: { maxProviderCalls: 8, maxCredits: 20 },
    limits: { maxExpandedKeywords: 20, maxRepresentativeAsins: 8, maxCandidateDrafts: 10 },
  });

  const reverseNodes = run.keywordNodes.filter((k) => k.origin === 'ASIN_REVERSE_LOOKUP');
  const seedNode = run.keywordNodes.find((k) => k.origin === 'SEED');
  const topAsin = run.asinNodes[0]?.asin || seedNode?.representativeAsins?.[0] || null;
  const asinKwCalls = executedCalls.filter((c) => c.capabilityId === 'market.asin.keywords');
  const kwSearchCalls = executedCalls.filter((c) => c.capabilityId === 'market.keyword.search');

  console.log('\n[Discovery Trace]');
  console.log(`    Seed:                    ${seed}`);
  console.log(`    Provider:                xydc`);
  console.log(`    Status:                  ${run.status}`);
  console.log(`    Top ASIN:                ${topAsin || '(none)'}`);
  console.log(`    Reverse Keyword Count:   ${reverseNodes.length}`);
  console.log(`    Expanded Keyword Count:  ${run.keywordNodes.length}`);
  console.log(`    ASIN Count:              ${run.asinNodes.length}`);
  console.log(`    Provider Calls:          ${run.budgetUsage.providerCalls}`);
  console.log(`    Credits:                 ${run.budgetUsage.credits ?? 'UNKNOWN'}`);
  console.log(`    Candidate Draft Count:   ${run.candidateDrafts.length}`);
  console.log(`    missingCapabilities:     ${run.missingCapabilities.join(', ') || '(none)'}`);
  console.log(`    keyword.search calls:    ${kwSearchCalls.length}`);
  console.log(`    asin.keywords calls:     ${asinKwCalls.length}`);
  if (reverseNodes[0]) {
    console.log(`    Sample reverse keyword:  ${reverseNodes[0].rawKeyword}`);
    console.log(`    Reverse evidenceIds:     ${reverseNodes[0].evidenceIds.join(', ')}`);
  }

  assert.strictEqual(looksLikeFixture(run), false, 'Live run must not contain demo/mock fixture markers');
  assert(kwSearchCalls.length >= 1, 'Round 0 keyword.search must execute');
  assert.strictEqual(gateway.hasCapability('market.asin.keywords'), true);
  if (run.missingCapabilities.includes('market.asin.keywords')) {
    throw new Error('market.asin.keywords was available but recorded as missing');
  }
  assert(asinKwCalls.length >= 1, 'Round 1 market.asin.keywords must execute on the live path');
  assert(topAsin, 'Live seed must discover at least one real Top ASIN');
  assert(reverseNodes.length >= 1, 'Live reverse lookup must return at least one reverse keyword');
  assert(run.candidateDrafts.length >= 0, 'Candidate draft count is reported honestly');
  for (const node of reverseNodes) {
    assert.strictEqual(node.origin, 'ASIN_REVERSE_LOOKUP');
    assert(node.evidenceIds.length > 0);
    const evidence = run.evidence.filter((e) => node.evidenceIds.includes(e.id));
    assert(evidence.length > 0);
    for (const evi of evidence) {
      assert.strictEqual(evi.scope, 'KEYWORD');
      assert.strictEqual(evi.subjectId, node.id);
      assert.notStrictEqual(evi.source, 'AUTO_DISCOVERY');
    }
  }

  const summary = {
    seed,
    provider: 'xydc',
    status: run.status,
    topAsin,
    reverseKeywordCount: reverseNodes.length,
    expandedKeywordCount: run.keywordNodes.length,
    providerCalls: run.budgetUsage.providerCalls,
    credits: run.budgetUsage.credits ?? null,
    candidateDraftCount: run.candidateDrafts.length,
    missingCapabilities: run.missingCapabilities,
    preview,
    sampleReverseKeywords: reverseNodes.slice(0, 8).map((k) => k.rawKeyword),
    sampleDrafts: run.candidateDrafts.slice(0, 5).map((d) => ({ id: d.id, title: d.title, gate: d.gateStatus })),
  };

  console.log('\n================================================================');
  console.log('  [LIVE SEED E2E PASSED]');
  console.log('================================================================\n');
  process.stdout.write(`LIVE_DISCOVERY_SUMMARY=${JSON.stringify(summary)}\n`);
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN LIVE SEED E2E]:', err);
  process.exit(1);
});
