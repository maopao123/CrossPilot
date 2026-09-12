import { ListingWorkflowDagService } from '../src/listing/listing-workflow-dag.service';
import { ClaimGroundingService } from '../src/listing/claim-grounding.service';
import { UnitConversionService } from '../src/listing/unit-conversion.service';
import {
  PlatformLlmRuntime,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmError,
  LlmErrorCode,
  ListingPromptBuilder,
  ListingOutputStructured,
  ListingOutputStructuredSchema,
} from '@crosspilot/ai';

describe('Listing LLM Golden Cases (Case A ~ P)', () => {
  const baseFeatures = [
    { id: 'f_mat', name: 'Material', value: 'Natural Carrara Marble', isCore: true },
    { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches (38mm)', isCore: true },
    { id: 'f_wt', name: 'Weight', value: '3.57 lbs (1.62 kg)', isCore: true },
  ];

  const full5Features = [
    { id: 'f_mat', name: 'Material', value: '100% Genuine Natural Marble Stone', isCore: true },
    { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches (38mm)', isCore: true },
    { id: 'f_wt', name: 'Weight', value: '3.57 lbs (1.62 kg) Heavy Base', isCore: true },
    { id: 'f_pad', name: 'Protective Base', value: 'Non-slip EVA cushioned bottom pads', isCore: false },
    { id: 'f_finish', name: 'Finish', value: 'Polished sealed water-resistant finish', isCore: false },
  ];

  const validSampleOutput: ListingOutputStructured = {
    title: 'POLEGAS Natural Marble Toothbrush Holder - 1.5 Inch Wide Slots, Heavy 3.57 lbs Stone Base',
    bulletPoints: [
      'GENUINE NATURAL CARRARA MARBLE: Carved from solid marble stone with distinct veining. Weighs 3.57 lbs to prevent tipping.',
      '1.5 INCH WIDE COMPARTMENTS: Precision-engineered slots accommodate slim manual brushes and standard electric toothbrush handles.',
      'COUNTERTOP SAFE DESIGN: Fitted with soft non-slip base pads to protect bathroom countertops from moisture and scratches.',
      'CONTEMPORARY LUXURY AESTHETIC: Minimalist stone profile complements modern master baths, guest suites, and vanities.',
      'SEALED WATER-RESISTANT FINISH: Non-porous sealed surface prevents soap residue accumulation and cleans effortlessly.',
    ],
    description: 'Elevate your bathroom vanity with the POLEGAS Natural Marble Toothbrush Holder. Carved from authentic Carrara marble weighing 3.57 lbs, it holds both manual and electric toothbrushes securely.',
    searchTerms: 'marble toothbrush holder heavy stone stand bathroom caddy electric toothbrush vanity organizer',
    imageBriefs: [
      {
        slot: 1,
        objective: 'Hero Main Image',
        keyMessage: 'Pure white studio background shot showing natural stone grain',
        visualDirection: 'Crisp studio lighting on pure white RGB 255,255,255 background, 85% frame fill.',
        factIds: ['f_mat'],
      },
      {
        slot: 2,
        objective: 'Dimension & Fit',
        keyMessage: '1.5 inch slot fits electric toothbrush handles',
        visualDirection: 'Top-down angle callout showing caliper measurement of 1.5" diameter slot.',
        factIds: ['f_slot'],
      },
      {
        slot: 3,
        objective: 'Stability Demo',
        keyMessage: 'Solid 3.57 lbs heavy stone base stays stable',
        visualDirection: 'Side profile showing substantial stone base with weight indicator callout.',
        factIds: ['f_wt'],
      },
      {
        slot: 4,
        objective: 'Bathroom Setting',
        keyMessage: 'Luxury bathroom vanity decor integration',
        visualDirection: 'Modern master bathroom counter with marble countertop styling.',
        factIds: ['f_mat'],
      },
      {
        slot: 5,
        objective: 'Cleaning & Maintenance',
        keyMessage: 'Water-resistant sealed stone, easy wipe clean',
        visualDirection: 'Water bead rolling off polished stone surface.',
        factIds: ['f_mat'],
      },
    ],
    aPlusPlan: {
      strategy: 'Brand Story + Problem-Solution Specs Grid',
      modules: [
        {
          moduleType: 'STANDARD_HEADER_IMAGE_TEXT',
          objective: 'Brand craftsmanship and genuine natural stone origin',
          headline: 'Artisanal Natural Marble for the Modern Home',
          body: 'Each piece is hand-selected and crafted from natural marble stone.',
          visualBrief: 'Panoramic view of marble texture and polished finished holder.',
          factIds: ['f_mat'],
        },
      ],
    },
    claims: [
      { claim: 'Material: Natural Carrara Marble', factIds: ['f_mat'] },
      { claim: 'Slot Diameter: 1.5 inches (38mm)', factIds: ['f_slot'] },
      { claim: 'Weight: 3.57 lbs (1.62 kg)', factIds: ['f_wt'] },
    ],
    rufusCoverage: [
      {
        questionId: 'rufus-q-01',
        question: 'Does this toothbrush holder fit Oral-B and Sonicare electric handles?',
        coveredBy: ['BULLET', 'TITLE'],
        answerSnippet: '1.5 inch wide slots accommodate standard electric toothbrush handles.',
      },
    ],
  };

  const createMockRuntime = (mockFn: (req: LlmRequest, ctx: { traceId: string }) => Promise<LlmResult>): PlatformLlmRuntime => {
    const mockProvider: LlmProvider = {
      id: 'mock-llm-provider',
      name: 'mock-llm-provider',
      generateText: mockFn,
    };
    return new PlatformLlmRuntime({
      provider: mockProvider,
    });
  };

  // Case A: Normal Grounded Listing (AI Mode, 100% Grounding, Compliance PASS)
  it('Case A: Normal grounded listing should output AI mode, 100% grounding, Compliance PASS', async () => {
    const runtime = createMockRuntime(async () => ({
      output: validSampleOutput,
      rawText: JSON.stringify(validSampleOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 180,
      traceId: 'trace-case-a',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      variantName: 'Carrara White',
      features: baseFeatures,
      skuWeightKg: 1.62,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('AI');
    expect(result.listingDraft.generationMode).toBe('AI');
    expect(result.listingDraft.modelUsed).toBe('deepseek-chat');
    expect(result.listingDraft.title).toContain('POLEGAS');
    expect(result.listingDraft.bulletPoints).toHaveLength(5);
    expect(result.complianceResult.status).toBe('PASS');
    expect(result.complianceResult.violations).toHaveLength(0);
    expect(result.groundingMetrics.groundingRate).toBe(1.0);
    expect(result.groundingMetrics.unsupportedClaimCount).toBe(0);
    expect(result.humanReviewState).toBe('WAITING_APPROVAL');
  });

  // Case B: Missing Product Fact -> Prompt Constraint Prevents Invention
  it('Case B: Missing product fact should have strict constraint in prompt against invention', async () => {
    const sparseFeatures = [
      { id: 'f_mat', name: 'Material', value: 'Natural Carrara Marble', isCore: true },
      // No slot diameter, no weight
    ];

    const prompt = ListingPromptBuilder.buildPrompt({
      brand: 'POLEGAS',
      productName: 'Natural Marble Toothbrush Holder',
      marketplace: 'AMAZON_US',
      locale: 'en-US',
      features: sparseFeatures,
      keywords: [{ keyword: 'marble toothbrush holder', priority: 1, volume: 14500 }],
      marketplaceProfile: {
        titleMaxLength: 200,
        bulletsCount: 5,
        searchTermsMaxLength: 250,
        forbiddenPatterns: ['fda approved', '#1 best seller'],
      },
      rufusQa: [],
    });

    expect(prompt.systemPrompt).toContain('STRICT FACT GROUNDING');
    expect(prompt.systemPrompt).toContain('NEVER invent or hallucinate physical dimensions');
    expect(prompt.userPrompt).toContain('Natural Carrara Marble');
    expect(prompt.userPrompt).not.toContain('Slot Diameter');
  });

  // Case C: Injected Prohibited Claim (FDA Approved / #1 Best Seller) -> Compliance Blocks
  it('Case C: Injected prohibited claim should be blocked by ComplianceJudgeService', async () => {
    const fdaPoisonedOutput: ListingOutputStructured = {
      ...validSampleOutput,
      title: 'POLEGAS Natural Marble Toothbrush Holder - FDA Approved #1 Best Seller',
      bulletPoints: [
        'FDA APPROVED CLINICAL GRADE: Certified safe and #1 Best Seller on Amazon.',
        ...validSampleOutput.bulletPoints.slice(1),
      ],
    };

    const runtime = createMockRuntime(async () => ({
      output: fdaPoisonedOutput,
      rawText: JSON.stringify(fdaPoisonedOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-c',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.complianceResult.status).toBe('BLOCK');
    expect(result.complianceResult.violations.length).toBeGreaterThanOrEqual(1);
    const rules = result.complianceResult.violations.map((v) => v.ruleCode);
    expect(rules).toEqual(expect.arrayContaining(['POL-FDA-001', 'POL-RANK-002']));
  });

  // Case D: Keyword Coverage Check and Unused High-Priority Detection
  it('Case D: Keyword coverage check should detect used vs unused high priority keywords', async () => {
    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      keywords: [
        { keyword: 'marble toothbrush holder', normalizedKeyword: 'marble toothbrush holder', source: 'SEARCH_TERM', priority: 1, volume: 14500 },
        { keyword: 'electric toothbrush stand', normalizedKeyword: 'electric toothbrush stand', source: 'EXCEL', priority: 1, volume: 9800 },
        { keyword: 'exotic rare bamboo shelf', normalizedKeyword: 'exotic rare bamboo shelf', source: 'MANUAL', priority: 1, volume: 8000 },
      ],
      forceTemplateFallback: true, // Legacy template covers marble toothbrush holder and electric toothbrush stand, but not exotic rare bamboo shelf
    });

    expect(result.keywordCoverage.usedKeywords).toContain('marble toothbrush holder');
    expect(result.keywordCoverage.unusedHighPriorityKeywords).toContain('exotic rare bamboo shelf');
    expect(result.keywordCoverage.coverageRate).toBeLessThan(1.0);
  });

  // Case E: Invalid Structured Output -> Zod Schema Fails and 1-Pass Repair Tested
  it('Case E: Invalid structured output should trigger 1-pass repair in PlatformLlmRuntime', async () => {
    let callCount = 0;
    const mockProvider: LlmProvider = {
      id: 'mock-repair-provider',
      name: 'mock-repair-provider',
      generateText: async (): Promise<LlmResult> => {
        callCount++;
        if (callCount === 1) {
          // Return invalid payload: only 2 bullet points instead of 5
          const invalidPayload = {
            ...validSampleOutput,
            bulletPoints: ['Point 1', 'Point 2'],
          };
          return {
            output: invalidPayload,
            rawText: JSON.stringify(invalidPayload),
            model: 'mock-repair-model',
            provider: 'mock-repair-provider',
            usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700, estimatedCostUsd: null },
            latencyMs: 120,
            traceId: 'trace-repair-attempt-1',
            retryCount: 0,
          };
        } else {
          // Repaired valid payload
          return {
            output: validSampleOutput,
            rawText: JSON.stringify(validSampleOutput),
            model: 'mock-repair-model',
            provider: 'mock-repair-provider',
            usage: { inputTokens: 700, outputTokens: 650, totalTokens: 1350, estimatedCostUsd: null },
            latencyMs: 140,
            traceId: 'trace-repair-attempt-2',
            retryCount: 0,
          };
        }
      },
    };

    const repairRuntime = new PlatformLlmRuntime({
      provider: mockProvider,
    });

    const llmResult = await repairRuntime.generateText({
      systemPrompt: 'You are an AI Listing Architect.',
      userPrompt: 'Generate listing JSON',
      outputSchema: ListingOutputStructuredSchema,
      repairAttempts: 1,
      retryPolicy: { maxAttempts: 1, backoffMs: 10 },
    });

    expect(callCount).toBe(2);
    expect(llmResult.retryCount).toBe(1);
    expect(llmResult.output).toBeDefined();
    expect((llmResult.output as ListingOutputStructured).bulletPoints).toHaveLength(5);
  });

  // Case F: Provider Timeout/Failure -> LLM_TIMEOUT -> TEMPLATE_FALLBACK
  it('Case F: Provider timeout should return LLM_TIMEOUT and trigger TEMPLATE_FALLBACK without crashing', async () => {
    const timeoutProvider: LlmProvider = {
      id: 'failing-provider',
      name: 'failing-provider',
      generateText: async () => {
        throw new LlmError(LlmErrorCode.LLM_TIMEOUT, 'Request timed out after 30000ms', {
          retryable: true,
        });
      },
    };

    const failingRuntime = new PlatformLlmRuntime({
      provider: timeoutProvider,
    });

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: failingRuntime,
    });

    expect(result.success).toBe(true);
    expect(result.generationMode).toBe('TEMPLATE_FALLBACK');
    expect(result.listingDraft.generationMode).toBe('TEMPLATE_FALLBACK');
    expect(result.listingDraft.modelUsed).toContain('TEMPLATE_FALLBACK');
    expect(result.listingDraft.modelUsed).toContain('LLM_TIMEOUT');
    expect(result.listingDraft.title).toContain('POLEGAS');
    expect(result.listingDraft.bulletPoints).toHaveLength(5);
  });

  // Case G: Ungrounded Claims / Nonexistent FactIds -> Grounding Degradation Detected
  it('Case G: Output with ungrounded claims should result in lower grounding rate and warning metrics', async () => {
    const ungroundedOutput: ListingOutputStructured = {
      ...validSampleOutput,
      claims: [
        { claim: 'Material: Natural Carrara Marble', factIds: ['f_mat'] },
        { claim: 'Fits Sonicare DiamondClean perfectly', factIds: ['f_unverified_fit'] }, // Nonexistent factId
        { claim: 'Withstands 500 degrees Celsius', factIds: ['f_hallucinated_heat'] }, // Nonexistent factId
      ],
    };

    const runtime = createMockRuntime(async () => ({
      output: ungroundedOutput,
      rawText: JSON.stringify(ungroundedOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-g',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
      skipClaimRepair: true,
    });

    expect(result.groundingMetrics.totalClaims).toBe(3);
    expect(result.groundingMetrics.groundedClaims).toBe(1);
    expect(result.groundingMetrics.unsupportedClaimCount).toBe(2);
    expect(result.groundingMetrics.groundingRate).toBe(0.33);
  });

  // Case H: Valid FactId + Unsupported Embellishment -> Flagged as PARTIALLY_SUPPORTED & Repaired
  it('Case H: Valid factId with absolute anti-tip embellishment should be flagged as PARTIALLY_SUPPORTED and repaired', async () => {
    const embellishedOutput: ListingOutputStructured = {
      ...validSampleOutput,
      claims: [
        { claim: "Solid stone base weighs 3.57 lbs and won't tip over on wet counters", factIds: ['f_wt'] },
        { claim: 'Material: Natural Carrara Marble', factIds: ['f_mat'] },
      ],
    };

    // 1. Verify raw detection logic
    const rawEval = ClaimGroundingService.evaluateClaims(embellishedOutput.claims, baseFeatures);
    expect(rawEval.claims[0].groundingStatus).toBe('PARTIALLY_SUPPORTED');
    expect(rawEval.claims[0].unsupportedSpan).toMatch(/won'?t\s*tip/i);
    expect(rawEval.claims[0].riskLevel).toBe('HIGH');

    // 2. Verify full DAG execution with repair
    const runtime = createMockRuntime(async () => ({
      output: embellishedOutput,
      rawText: JSON.stringify(embellishedOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-h',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.initialUnsupportedCount).toBe(1);
    expect(result.groundingMetrics.repairedCount).toBeGreaterThanOrEqual(1);
    expect(result.groundingMetrics.unsupportedClaimsCount).toBe(0);
    expect(result.groundingMetrics.partiallySupportedClaimsCount).toBe(0);
    expect(result.groundingMetrics.groundingRate).toBe(1.0);
    expect(result.listingDraft.claims[0].groundingStatus).toBe('SUPPORTED');
    expect(result.listingDraft.claims[0].text).not.toContain("won't tip over");
  });

  // Case I: Brand Compatibility Hallucination -> Flagged as PARTIALLY_SUPPORTED & Neutralized
  it('Case I: Brand compatibility hallucination (Oral-B/Sonicare) should be flagged and neutralized to generic handles', async () => {
    const brandHallucinatedOutput: ListingOutputStructured = {
      ...validSampleOutput,
      claims: [
        { claim: '1.5 inch wide slots comfortably fit Oral-B and Sonicare models', factIds: ['f_slot'] },
        { claim: 'Material: Natural Carrara Marble', factIds: ['f_mat'] },
      ],
    };

    // 1. Verify raw detection
    const rawEval = ClaimGroundingService.evaluateClaims(brandHallucinatedOutput.claims, baseFeatures);
    expect(rawEval.claims[0].groundingStatus).toBe('PARTIALLY_SUPPORTED');
    expect(rawEval.claims[0].unsupportedSpan).toMatch(/Oral-B/i);
    expect(rawEval.claims[0].riskLevel).toBe('HIGH');

    // 2. Verify full DAG execution with repair
    const runtime = createMockRuntime(async () => ({
      output: brandHallucinatedOutput,
      rawText: JSON.stringify(brandHallucinatedOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-i',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.initialUnsupportedCount).toBe(1);
    expect(result.groundingMetrics.unsupportedClaimsCount).toBe(0);
    expect(result.listingDraft.claims[0].groundingStatus).toBe('SUPPORTED');
    expect(result.listingDraft.claims[0].text).not.toContain('Oral-B');
    expect(result.listingDraft.claims[0].text).not.toContain('Sonicare');
    expect(result.listingDraft.claims[0].text).toMatch(/standard|electric/i);
  });

  // Case J: Deterministic Unit Conversion -> Grounded as SUPPORTED with derivation metadata
  it('Case J: Metric conversion of imperial fact (1.5 inch -> 38.1 mm, 3.57 lbs -> 1.62 kg) should be grounded as SUPPORTED via UNIT_CONVERSION', async () => {
    const imperialFeatures = [
      { id: 'f_mat', name: 'Material', value: 'Natural Carrara Marble', isCore: true },
      { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches', isCore: true },
      { id: 'f_wt', name: 'Weight', value: '3.57 lbs', isCore: true },
    ];

    const unitConversionOutput: ListingOutputStructured = {
      ...validSampleOutput,
      claims: [
        { claim: 'Slot diameter measures 38.1 mm wide for universal handle clearance', factIds: ['f_slot'] },
        { claim: 'Substantial 1.62 kg solid stone base ensures stability', factIds: ['f_wt'] },
      ],
    };

    const evalResult = ClaimGroundingService.evaluateClaims(unitConversionOutput.claims, imperialFeatures);
    expect(evalResult.metrics.supportedClaimsCount).toBe(2);
    expect(evalResult.metrics.unsupportedClaimsCount).toBe(0);
    expect(evalResult.metrics.groundingRate).toBe(1.0);

    // Verify derivation metadata
    const slotClaim = evalResult.claims[0];
    expect(slotClaim.groundingStatus).toBe('SUPPORTED');
    expect(slotClaim.derivation).toBeDefined();
    expect(slotClaim.derivation?.type).toBe('UNIT_CONVERSION');
    expect(slotClaim.derivation?.sourceFactIds).toContain('f_slot');
    expect(slotClaim.derivation?.derivedValue).toContain('38.1mm');

    const wtClaim = evalResult.claims[1];
    expect(wtClaim.groundingStatus).toBe('SUPPORTED');
    expect(wtClaim.derivation).toBeDefined();
    expect(wtClaim.derivation?.type).toBe('UNIT_CONVERSION');
    expect(wtClaim.derivation?.sourceFactIds).toContain('f_wt');
    expect(wtClaim.derivation?.derivedValue).toContain('1.62 kg');
  });

  // Case K: Unverified Durability & Surface Treatment -> PARTIALLY_SUPPORTED & Repaired
  it('Case K: Unverified durability claims (resists stains for years) should be flagged and repaired', async () => {
    const unverifiedDurabilityOutput: ListingOutputStructured = {
      ...validSampleOutput,
      claims: [
        { claim: 'Handcrafted from polished marble that resists stains for years', factIds: ['f_mat'] },
      ],
    };

    // 1. Verify raw detection
    const rawEval = ClaimGroundingService.evaluateClaims(unverifiedDurabilityOutput.claims, baseFeatures);
    expect(rawEval.claims[0].groundingStatus).toBe('PARTIALLY_SUPPORTED');
    expect(rawEval.claims[0].riskLevel).toBe('HIGH');
    expect(rawEval.claims[0].unsupportedSpan).toMatch(/resists stains|for years/i);

    // 2. Verify full DAG execution with repair
    const runtime = createMockRuntime(async () => ({
      output: unverifiedDurabilityOutput,
      rawText: JSON.stringify(unverifiedDurabilityOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-k',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: baseFeatures,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.initialUnsupportedCount).toBe(1);
    expect(result.groundingMetrics.repairedCount).toBeGreaterThanOrEqual(1);
    expect(result.groundingMetrics.unsupportedClaimsCount).toBe(0);
    expect(result.listingDraft.claims[0].groundingStatus).toBe('SUPPORTED');
    expect(result.listingDraft.claims[0].text).not.toContain('for years');
  });

  // Case L: Hidden body text expansion (guaranteed not to tip over on wet counters)
  it('Case L: Hidden body text expansion should be caught by surface grounding and repaired', async () => {
    const hiddenExpansionOutput: ListingOutputStructured = {
      ...validSampleOutput,
      bulletPoints: [
        'GENUINE NATURAL CARRARA MARBLE: Carved from solid marble stone. Weighs 3.57 lbs and guaranteed not to tip over on wet counters.',
        ...validSampleOutput.bulletPoints.slice(1),
      ],
      claims: [
        { claim: 'Weight: 3.57 lbs (1.62 kg)', factIds: ['f_wt'] },
      ],
    };

    // 1. With skipClaimRepair: true -> surface grounding catches the ungrounded span
    const runtimeDegraded = createMockRuntime(async () => ({
      output: hiddenExpansionOutput,
      rawText: JSON.stringify(hiddenExpansionOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-l-degraded',
      retryCount: 0,
    }));

    const resultDegraded = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: full5Features,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtimeDegraded,
      skipClaimRepair: true,
    });

    expect(resultDegraded.groundingMetrics.finalSurfaceGroundingRate).toBeLessThan(1.0);
    expect(resultDegraded.groundingMetrics.finalUnsupportedCount).toBeGreaterThanOrEqual(1);

    // 2. With repair enabled -> repaired to stable countertop placement and re-scanned
    const runtimeRepaired = createMockRuntime(async () => ({
      output: hiddenExpansionOutput,
      rawText: JSON.stringify(hiddenExpansionOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-l-repaired',
      retryCount: 0,
    }));

    const resultRepaired = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: full5Features,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtimeRepaired,
      skipClaimRepair: false,
    });

    expect(resultRepaired.groundingMetrics.postRepairRescan).toBe(true);
    expect(resultRepaired.groundingMetrics.finalSurfaceGroundingRate).toBe(1.0);
    expect(resultRepaired.groundingMetrics.finalUnsupportedCount).toBe(0);
    expect(resultRepaired.listingDraft.bulletPoints[0]).not.toContain('guaranteed not to tip');
  });

  // Case M: Temporal durability (maintains its finish for years)
  it('Case M: Unverified temporal durability claims should be flagged and repaired', async () => {
    const temporalOutput: ListingOutputStructured = {
      ...validSampleOutput,
      bulletPoints: [
        'SEALED WATER-RESISTANT FINISH: Non-porous sealed surface maintains its elegant appearance for years without fading.',
        ...validSampleOutput.bulletPoints.slice(1),
      ],
    };

    const runtime = createMockRuntime(async () => ({
      output: temporalOutput,
      rawText: JSON.stringify(temporalOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-m',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: full5Features,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.postRepairRescan).toBe(true);
    expect(result.groundingMetrics.finalSurfaceGroundingRate).toBe(1.0);
    expect(result.groundingMetrics.finalUnsupportedCount).toBe(0);
    expect(result.listingDraft.bulletPoints[0]).not.toContain('for years');
  });

  // Case N: Unverified usage objects (toothpaste and small toiletries)
  it('Case N: Unverified usage objects should be flagged and repaired', async () => {
    const unverifiedUsageOutput: ListingOutputStructured = {
      ...validSampleOutput,
      bulletPoints: [
        '1.5 INCH WIDE COMPARTMENTS: Perfect for toothbrushes, toothpaste, and small toiletries.',
        ...validSampleOutput.bulletPoints.slice(1),
      ],
    };

    const runtime = createMockRuntime(async () => ({
      output: unverifiedUsageOutput,
      rawText: JSON.stringify(unverifiedUsageOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-n',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: full5Features,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.finalSurfaceGroundingRate).toBe(1.0);
    expect(result.groundingMetrics.finalUnsupportedCount).toBe(0);
    expect(result.listingDraft.bulletPoints[0]).not.toContain('toothpaste, and small toiletries');
  });

  // Case O: Subjective marketing copy without engineering claim
  it('Case O: Subjective marketing copy should be categorized as SUBJECTIVE_MARKETING and not trigger false alarms', async () => {
    const subjectiveMarketingOutput: ListingOutputStructured = {
      ...validSampleOutput,
      bulletPoints: [
        'CONTEMPORARY LUXURY AESTHETIC: Adds an elegant, one-of-a-kind touch to your bathroom vanity decor.',
        ...validSampleOutput.bulletPoints.slice(1),
      ],
    };

    const runtime = createMockRuntime(async () => ({
      output: subjectiveMarketingOutput,
      rawText: JSON.stringify(subjectiveMarketingOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-o',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: full5Features,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.finalSurfaceGroundingRate).toBe(1.0);
    expect(result.groundingMetrics.finalUnsupportedCount).toBe(0);
    const hasSubjective = result.listingDraft.surfaceClaims?.some(
      (c) => c.verificationType === 'SUBJECTIVE_MARKETING',
    );
    expect(hasSubjective).toBe(true);
  });

  // Case P: Post-Repair Re-scan full lifecycle
  it('Case P: Post-Repair Re-scan should re-extract and verify all claims after repair', async () => {
    const ungroundedOutput: ListingOutputStructured = {
      ...validSampleOutput,
      bulletPoints: [
        'GENUINE NATURAL CARRARA MARBLE: Carved from solid marble. Heavy base stays firmly in place on wet countertops.',
        'COUNTERTOP SAFE DESIGN: Fitted with soft non-slip base pads to prevent sliding on wet surfaces.',
        'SEALED FINISH: Ideal for humid bathroom environments.',
        ...validSampleOutput.bulletPoints.slice(3),
      ],
    };

    const runtime = createMockRuntime(async () => ({
      output: ungroundedOutput,
      rawText: JSON.stringify(ungroundedOutput),
      model: 'deepseek-chat',
      provider: 'mock-llm-provider',
      usage: { inputTokens: 1200, outputTokens: 650, totalTokens: 1850, estimatedCostUsd: null },
      latencyMs: 150,
      traceId: 'trace-case-p',
      retryCount: 0,
    }));

    const result = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      features: full5Features,
      images: ['https://example.com/img1.jpg'],
      llmRuntime: runtime,
    });

    expect(result.groundingMetrics.postRepairRescan).toBe(true);
    expect(result.groundingMetrics.repairedCount).toBeGreaterThanOrEqual(1);
    expect(result.groundingMetrics.finalSurfaceGroundingRate).toBe(1.0);
    expect(result.groundingMetrics.finalUnsupportedCount).toBe(0);
    expect(result.groundingMetrics.totalVerifiableClaims).toBeGreaterThan(0);
    expect(result.groundingMetrics.supportedVerifiableClaims).toBe(result.groundingMetrics.totalVerifiableClaims);
  });
});
