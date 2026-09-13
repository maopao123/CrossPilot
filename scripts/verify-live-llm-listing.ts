/**
 * Live E2E Verification Script: Real Aliyun DashScope LLM Runtime + Listing Generation
 *
 * Runs the 14-step WF-02 Listing Generation DAG with:
 * 1. Real OpenAI-Compatible Provider connected to DashScope (compatible-mode, qwen3.8-max)
 * 2. Real ListingPromptBuilder (listing.generate.v1)
 * 3. Zod Schema Validation & Structured Output
 * 4. Factual Grounding Evaluation against verified Product Facts
 * 5. Compliance Evaluation against Amazon Policies
 */

import { ListingWorkflowDagService } from '../packages/domain/src/listing/listing-workflow-dag.service.js';
import { PlatformLlmRuntime, OpenAiCompatibleProvider } from '../packages/ai/src/index.js';
import { SecretProvider } from '../packages/integrations/src/index.js';
import { ModelRouter, ALIYUN_COMPAT_BASE_URL } from '../packages/shared/src/index.js';

async function main() {
  console.log('================================================================');
  console.log('CrossPilot V9 Epic 1: Live LLM Listing Generation Verification');
  console.log('================================================================\n');

  // Verify API Key (Aliyun DashScope: LLM_API_KEY / DASHSCOPE_API_KEY / EMBEDDING_API_KEY 同厂商共用)
  const apiKey =
    SecretProvider.getSecret('LLM_API_KEY') ||
    SecretProvider.getSecret('DASHSCOPE_API_KEY') ||
    SecretProvider.getSecret('EMBEDDING_API_KEY');
  if (!apiKey) {
    console.error('❌ No DashScope key found. Set LLM_API_KEY / DASHSCOPE_API_KEY / EMBEDDING_API_KEY in .env');
    process.exit(1);
  }
  console.log(`✅ Loaded DashScope API key: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);

  // Initialize Real Runtime with Aliyun DashScope (qwen3.8-max)
  const dashscopeProvider = new OpenAiCompatibleProvider({
    apiKey,
    baseUrl: ALIYUN_COMPAT_BASE_URL,
    defaultModel: ModelRouter.llmRouter.heavyReasoning,
    timeoutMs: 45000,
  });

  const runtime = new PlatformLlmRuntime({
    provider: dashscopeProvider,
  });

  console.log(`✅ Initialized PlatformLlmRuntime with OpenAiCompatibleProvider (${ModelRouter.llmRouter.heavyReasoning})`);

  // Execute 14-Step DAG with Real Verified Product Facts for B0BFGNSXYL
  console.log('\n--- Executing 14-Step Workflow DAG with Real LLM ---');
  const startTime = Date.now();

  const result = await ListingWorkflowDagService.executeWorkflowDag({
    skuCode: 'MTH-WHITE-001',
    productName: 'Natural Marble Toothbrush Holder',
    brand: 'GFWARE',
    variantName: 'Carrara White',
    features: [
      { id: 'f_mat', name: 'Material', value: '100% Genuine Natural Carrara Marble Stone', isCore: true },
      { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches (38mm) Wide Universal Compartments', isCore: true },
      { id: 'f_wt', name: 'Net Weight', value: '3.57 lbs (1.62 kg) Solid Heavy Base', isCore: true },
      { id: 'f_finish', name: 'Surface Finish', value: 'Sealed Polished Water-Resistant Finish', isCore: false },
      { id: 'f_pads', name: 'Base Protection', value: 'Cushioned Non-Slip EVA Countertop Pads', isCore: false },
    ],
    skuWeightKg: 1.62,
    images: ['https://m.media-amazon.com/images/I/71xyzExample.jpg'],
    keywords: [
      { keyword: 'marble toothbrush holder', normalizedKeyword: 'marble toothbrush holder', source: 'SEARCH_TERM', priority: 1, volume: 14500 },
      { keyword: 'electric toothbrush stand', normalizedKeyword: 'electric toothbrush stand', source: 'EXCEL', priority: 1, volume: 9800 },
      { keyword: 'bathroom vanity organizer countertop', normalizedKeyword: 'bathroom vanity organizer countertop', source: 'MANUAL', priority: 2, volume: 4200 },
    ],
    rufusQa: [
      {
        id: 'rufus-01',
        question: 'Does this toothbrush holder fit standard Oral-B and Sonicare electric toothbrush handles?',
        answer: 'Yes, the 1.5-inch wide slots comfortably accommodate standard manual and electric toothbrush handles.',
        source: 'TXT',
      },
      {
        id: 'rufus-02',
        question: 'Will it slide or tip over easily when pulling out a brush?',
        answer: 'No, weighing 3.57 lbs with non-slip EVA pads on the bottom, it stays firmly weighted on wet vanity counters.',
        source: 'MANUAL',
      },
    ],
    marketplace: 'AMAZON_US',
    llmRuntime: runtime,
  });

  const totalDuration = Date.now() - startTime;
  console.log(`\nDAG Execution Finished in ${totalDuration}ms`);

  // Verify Results
  console.log('\n================ Execution Summary ================');
  console.log(`Success:           ${result.success}`);
  console.log(`Generation Mode:   ${result.generationMode}`);
  console.log(`Model Used:        ${result.listingDraft.modelUsed}`);
  console.log(`Prompt Version:    ${result.listingDraft.promptVersion}`);
  console.log(`LLM Tokens Used:   Total=${result.listingDraft.llmUsage?.totalTokens} (Prompt=${result.listingDraft.llmUsage?.inputTokens}, Output=${result.listingDraft.llmUsage?.outputTokens})`);
  console.log(`Knowledge Mode:    ${result.listingDraft.knowledgeMode}`);
  console.log(`Knowledge Gate:    ${result.listingDraft.knowledgeGateStatus}`);
  console.log(`Knowledge Items:   ${result.listingDraft.knowledgeEvidence?.length || 0} items retrieved`);
  (result.listingDraft.knowledgeEvidence || []).forEach((k) => {
    console.log(`  - [${k.citationId}] (${k.authorityLevel}, Score: ${k.score}) ${k.title} [${k.documentId}]`);
  });
  console.log(`Grounding Rate:    ${(result.groundingMetrics.groundingRate * 100).toFixed(1)}% (${result.groundingMetrics.supportedClaimsCount}/${result.groundingMetrics.totalClaims} supported, ${result.groundingMetrics.repairedCount} repaired)`);
  console.log(`Keyword Coverage:  ${(result.keywordCoverage.coverageRate * 100).toFixed(1)}% (${result.keywordCoverage.usedKeywordsCount}/${result.keywordCoverage.totalKeywords})`);
  console.log(`Compliance Status: ${result.complianceResult.status} (Violations: ${result.complianceResult.violations.length})`);
  console.log(`Human Review Gate: ${result.humanReviewState}`);
  console.log(`Declared Rate:     ${((result.groundingMetrics.declaredClaimGroundingRate ?? 1.0) * 100).toFixed(1)}%`);
  console.log(`Surface Rate:      ${((result.groundingMetrics.finalSurfaceGroundingRate ?? 1.0) * 100).toFixed(1)}% (${result.groundingMetrics.supportedVerifiableClaims}/${result.groundingMetrics.totalVerifiableClaims} verifiable claims supported)`);
  console.log(`Post-Repair Rescan:${result.groundingMetrics.postRepairRescan}`);

  console.log('\n--- Declared Feature Claims Breakdown ---');
  (result.listingDraft.declaredClaims || result.listingDraft.claims).forEach((c, idx) => {
    const derivStr = c.derivation ? ` [Derivation: ${c.derivation.type}${c.derivation.formula ? ' (' + c.derivation.formula + ')' : ''}]` : '';
    const repStr = c.repairedFrom ? ` [Repaired from: "${c.repairedFrom}"]` : '';
    console.log(`[Declared ${idx + 1}] [${c.claimType}] [Risk: ${c.riskLevel}] [Status: ${c.groundingStatus}]${derivStr}${repStr}`);
    console.log(`   Text: "${c.text}"`);
    console.log(`   FactIds: [${c.factIds.join(', ')}]`);
  });

  console.log('\n--- Surface Atomic Claims Breakdown (Title, 5 Bullets, Description) ---');
  (result.listingDraft.surfaceClaims || []).forEach((c, idx) => {
    const derivStr = c.derivation ? ` [Derivation: ${c.derivation.type}]` : '';
    const repStr = c.repairedFrom ? ` [Repaired from: "${c.repairedFrom}"]` : '';
    console.log(`[Surface ${idx + 1}] [${c.sourceSection} ${c.sourceIndex ?? 0}] [${c.verificationType || 'FACT_VERIFIABLE'}] [Status: ${c.groundingStatus}]${derivStr}${repStr}`);
    console.log(`   Text Span: "${c.textSpan || c.text}"`);
    console.log(`   FactIds: [${c.factIds.join(', ')}]`);
    if (c.groundingStatus !== 'SUPPORTED') {
      console.log(`   Reason: "${c.reason}" (UnsupportedSpan: "${c.unsupportedSpan}")`);
    }
  });

  console.log('\n--- Generated Listing Title ---');
  console.log(result.listingDraft.title);

  console.log('\n--- Generated 5 Bullet Points ---');
  result.listingDraft.bulletPoints.forEach((bp, i) => {
    console.log(`[BP ${i + 1}] ${bp}`);
  });

  console.log('\n--- Image Briefs Plan ---');
  result.listingDraft.imageBriefs.forEach((ib) => {
    console.log(`Slot ${ib.slot}: ${ib.objective} -> ${ib.keyMessage} (Facts: ${ib.factIds.join(', ')})`);
  });

  console.log('\n--- A+ Plan ---');
  console.log(`Strategy: ${result.listingDraft.aPlusPlan?.strategy}`);
  result.listingDraft.aPlusPlan?.modules.forEach((m: any, i: number) => {
    console.log(`Module ${i + 1} [${m.moduleType}]: ${m.headline} - ${m.body}`);
  });

  console.log('\n--- 14 DAG Step Traces ---');
  result.stepTraces.forEach((t) => {
    console.log(`Step ${t.stepNumber} [${t.stepName}]: ${t.summary} (${t.latencyMs}ms)`);
  });

  // Strict Epic 1.2 Quality Assertions
  if (result.generationMode !== 'AI') {
    console.error(`\n❌ Expected generationMode 'AI', received '${result.generationMode}'`);
    process.exit(1);
  }

  if (result.listingDraft.bulletPoints.length !== 5) {
    console.error(`\n❌ Expected 5 bullet points, received ${result.listingDraft.bulletPoints.length}`);
    process.exit(1);
  }

  if (result.groundingMetrics.unsupportedClaimsCount !== 0) {
    console.error(`\n❌ Expected final unsupportedClaimsCount === 0, received ${result.groundingMetrics.unsupportedClaimsCount}`);
    process.exit(1);
  }

  if (result.groundingMetrics.finalUnsupportedCount !== 0) {
    console.error(`\n❌ Expected finalUnsupportedCount === 0, received ${result.groundingMetrics.finalUnsupportedCount}`);
    process.exit(1);
  }

  if (result.groundingMetrics.finalPartialCount !== 0) {
    console.error(`\n❌ Expected finalPartialCount === 0, received ${result.groundingMetrics.finalPartialCount}`);
    process.exit(1);
  }

  if (result.groundingMetrics.finalSurfaceGroundingRate !== 1.0) {
    console.error(`\n❌ Expected finalSurfaceGroundingRate === 1.0, received ${result.groundingMetrics.finalSurfaceGroundingRate}`);
    process.exit(1);
  }

  if (result.complianceResult.status !== 'PASS') {
    console.error(`\n❌ Expected complianceResult.status === 'PASS', received ${result.complianceResult.status}`);
    process.exit(1);
  }

  if (result.humanReviewState !== 'WAITING_APPROVAL') {
    console.error(`\n❌ Expected humanReviewState === 'WAITING_APPROVAL', received ${result.humanReviewState}`);
    process.exit(1);
  }

  // Epic 2 Real Milvus RAG Assertions
  if (result.listingDraft.knowledgeMode !== 'LIVE') {
    console.error(`\n❌ Expected knowledgeMode 'LIVE', received '${result.listingDraft.knowledgeMode}'`);
    process.exit(1);
  }

  if (result.listingDraft.knowledgeGateStatus !== 'SUFFICIENT') {
    console.error(`\n❌ Expected knowledgeGateStatus 'SUFFICIENT', received '${result.listingDraft.knowledgeGateStatus}'`);
    process.exit(1);
  }

  if (!result.listingDraft.knowledgeEvidence || result.listingDraft.knowledgeEvidence.length === 0) {
    console.error(`\n❌ Expected knowledgeEvidence.length > 0`);
    process.exit(1);
  }

  for (const ke of result.listingDraft.knowledgeEvidence) {
    if (!ke.citationId || !/^K-(AUTH|OPT|INT)-\d{3}$/.test(ke.citationId)) {
      console.error(`\n❌ Invalid citationId format in knowledgeEvidence: ${ke.citationId}`);
      process.exit(1);
    }
  }
  console.log('✅ Epic 2 Real Milvus RAG Quality Assertions Passed (Mode: LIVE, Gate: SUFFICIENT, Citations Valid)');

  console.log('\n================================================================');
  console.log('🎉 LIVE VERIFICATION SUCCESSFUL: Epic 2 Real Milvus RAG is 100% OPERATIONAL');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
