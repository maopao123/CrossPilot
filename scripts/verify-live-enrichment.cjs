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
const { CandidateEnrichmentService, EnrichedCandidateHandoffService, CandidateDecisionEngine } = require('../packages/domain/dist/index.js');

async function main() {
  console.log('================================================================');
  console.log('  CrossPilot Phase 2B Live Candidate Enrichment');
  console.log('================================================================\n');

  const token = SecretProvider.getSecret('XYDC_MCP_TOKEN');
  assert(token, 'XYDC_MCP_TOKEN must be configured');

  const bundle = createDefaultIntegrationGateway();
  IntegrationGateway.setInstance(bundle.gateway);
  const gateway = bundle.gateway;

  const executor = {
    execute: async (capabilityId, input, marketplace) => {
      const result = await gateway.executeCapability(capabilityId, input, {
        workspaceId: 'ws_phase2b',
        traceId: `tr_enr_${capabilityId}_${Date.now()}`,
        marketplace,
        source: 'CANDIDATE_ENRICHMENT',
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
    hasCapability: (id) => gateway.hasCapability(id),
    getCapabilityCost: (id) => gateway.getCapabilityCost(id),
  };

  const draft = {
    id: 'draft-amazon_us-toothbrush-holder',
    marketplace: 'AMAZON_US',
    title: 'Toothbrush Holder',
    productType: 'Toothbrush Holder',
    clusterId: 'cluster-toothbrush-holder',
    primaryKeyword: 'toothbrush holder',
    supportingKeywords: ['toothbrush holders for bathrooms'],
    representativeAsins: ['B0BFGNSXYL'],
    discoveryMetrics: {
      demand: { value: 27057, source: 'FACT', evidenceId: 'evi-kw-seed' },
      growth: { value: null, source: 'UNKNOWN' },
      keywordCount: 2,
      asinSampleSize: 1,
    },
    evidenceIds: ['evi-kw-seed'],
    discoveryReasons: [
      {
        code: 'DEMAND_SIGNAL',
        conclusion: 'Seed keyword has measurable ABA demand',
        metricIds: ['searchVolume'],
        evidenceIds: ['evi-kw-seed'],
      },
    ],
    missingRequirements: [],
    status: 'READY_FOR_ENRICHMENT',
    dedupKey: 'AMAZON_US:toothbrush holder',
    gateStatus: 'PASS',
  };

  const extraEvidence = [
    {
      id: 'evi-kw-seed',
      scope: 'KEYWORD',
      subjectId: 'kw-amazon_us-toothbrush-holder',
      source: 'xydc',
      content: 'Keyword search metric for toothbrush holder: searchVolume=27057',
      capturedAt: '2026-09-15T00:00:00Z',
    },
  ];

  const service = new CandidateEnrichmentService(executor);
  const run = await service.enrich({
    draft,
    marketplace: 'AMAZON_US',
    extraEvidence,
    options: {
      maxCompetitors: 1,
      enableReviewHealth: true,
      enableProductTrend: false,
      enableTextVoc: true,
    },
    budget: { maxProviderCalls: 6, maxExpensiveCalls: 1, maxCredits: 10 },
  });

  const competitor = run.enriched.competitors[0];
  const candidate = EnrichedCandidateHandoffService.toProductCandidate(run.enriched, run.evidence, run.request.manualInputs);
  const decision = CandidateDecisionEngine.evaluate(candidate);

  const summary = {
    candidateDraft: draft.title,
    representativeAsins: draft.representativeAsins,
    requestedSampleSize: run.enriched.competitorSample.requestedSampleSize,
    actualSampleSize: run.enriched.competitorSample.actualSampleSize,
    competitorDetails: competitor
      ? {
          asin: competitor.asin,
          title: competitor.title?.value ?? null,
          price: competitor.price?.value ?? null,
          rating: competitor.rating?.value ?? null,
          reviewCount: competitor.reviewCount?.value ?? null,
        }
      : null,
    vocProvider: run.missingCapabilities.includes('voc.product.analyze') ? 'UNAVAILABLE' : 'registry',
    vocSourceType: run.enriched.voc.sourceType,
    vocSampleCount: run.enriched.voc.analyzedItemCount,
    painPoints: run.enriched.voc.painPoints.map((p) => p.label),
    priceSample: run.enriched.pricePositioning.sampleSize,
    positioning: run.enriched.pricePositioning.positioning,
    suggestedTargetPrice: run.enriched.pricePositioning.suggestedTargetPrice || null,
    concept: run.enriched.concept.productType,
    hypotheses: run.enriched.differentiationHypotheses.map((h) => ({
      title: h.title,
      confidence: h.confidence,
      evidenceIds: h.evidenceIds.length,
      validationRequired: h.validationRequired,
    })),
    providerCalls: run.enriched.budgetUsage.providerCalls,
    credits: run.enriched.budgetUsage.credits ?? null,
    missingDimensions: run.enriched.missingRequirements,
    missingCapabilities: run.missingCapabilities,
    gate: run.enriched.gate.status,
    v2Decision: decision.verdict,
  };

  console.log(JSON.stringify(summary, null, 2));
  assert(run.enriched.competitorSample.actualSampleSize >= 1, 'live enrichment must retrieve at least 1 competitor');
  assert(competitor?.asin === 'B0BFGNSXYL');
  if (competitor?.price?.value != null) {
    assert.notStrictEqual(competitor.price.source, 'UNKNOWN');
  }
  assert.notStrictEqual(run.enriched.pricePositioning.suggestedTargetPrice?.source, 'FACT');
  assert.strictEqual(decision.verdict, 'NEEDS_VALIDATION');
  assert(candidate.risks.every((r) => r.status === 'UNVERIFIED'));
  const blob = JSON.stringify(run.enriched.voc).toLowerCase();
  assert(!blob.includes('amazon buyer review'));

  console.log('\n[LIVE ENRICHMENT PASSED]');
  process.stdout.write(`LIVE_ENRICHMENT_SUMMARY=${JSON.stringify(summary)}\n`);
}

main().catch((err) => {
  console.error('[FATAL LIVE ENRICHMENT]', err);
  process.exit(1);
});
