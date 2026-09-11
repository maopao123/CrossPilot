#!/usr/bin/env node
/**
 * CrossPilot Golden Benchmark & Regression Eval Suite (Milestone 8 + Listing Intelligence V2)
 *
 * Runs automated deterministic test cases against:
 * 1. Listing Groundedness & Compliance Judge
 * 2. Financial Variance Waterfall Exact Math Closure (-2280 = -980 - 620 - 510 - 310 + 140)
 * 3. PPC Search Term Optimization & Negative Keyword Actions
 * 4. Inventory Planning & 12 Days Cover Alert
 * 5. Purchase Order State Machine Invariants
 * 6. Listing Studio V2: 14-Step DAG & Marketplace Policy Profiles
 */

const {
  ComplianceJudgeService,
  VarianceAttributionService,
  AdOptimizerService,
  InventoryPlanningService,
  PurchaseOrderStateMachine,
  ListingWorkflowDagService,
  getMarketplacePolicyProfile,
} = require('../packages/domain/dist/index.js');

console.log('🧪 ========================================================');
console.log('   CrossPilot Golden Benchmark Regression Suite (M8 + V2)');
console.log('========================================================\n');

const results = [];

async function assertTest(suite, name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ suite, name, passed: true, duration });
    console.log(`  ✅ [PASS] (${duration}ms) ${suite} › ${name}`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ suite, name, passed: false, error: err.message, duration });
    console.error(`  ❌ [FAIL] (${duration}ms) ${suite} › ${name}: ${err.message}`);
  }
}

async function main() {
  // Suite 1: Compliance Judge & Listing Groundedness
  await assertTest('Compliance Judge', 'Reject listing with ungrounded FDA claims', () => {
    const check = ComplianceJudgeService.evaluateListing({
      title: '#1 Best Seller FDA Approved Antibacterial Toothbrush Holder',
      bulletPoints: ['Cures all bathroom mold.'],
    });
    if (check.status !== 'BLOCK' && check.status !== 'REJECTED') {
      throw new Error(`Expected BLOCK, got ${check.status}`);
    }
    if (!check.violations.some((v) => v.ruleCode === 'POL-FDA-001')) {
      throw new Error('Expected POL-FDA-001 violation');
    }
  });

  await assertTest('Compliance Judge', 'Pass fact-grounded natural marble listing', () => {
    const check = ComplianceJudgeService.evaluateListing({
      title: 'POLEGAS Natural Marble Toothbrush Holder - 1.5" Wide Slots (3.57 lbs)',
      bulletPoints: [
        '100% Genuine Marble with solid heavy non-slip base.',
        '1.5-inch slots fit standard manual and slim electric handles.',
        'Non-porous sealed stone wipes clean easily.',
      ],
    });
    if (check.status !== 'PASS') throw new Error(`Expected PASS, got ${check.status}`);
    if (check.violations.length !== 0) throw new Error(`Expected 0 violations, got ${check.violations.length}`);
  });

  await assertTest('Compliance Judge', 'Flag slot diameter compatibility claim with warning', () => {
    const check = ComplianceJudgeService.evaluateListing({
      title: 'Universal Marble Toothbrush Holder',
      bulletPoints: ['Fits all electric toothbrushes with ease.'],
    });
    if (!check.violations.some((v) => v.ruleCode === 'FACT-DIM-004')) {
      throw new Error('Expected FACT-DIM-004 warning');
    }
  });

  // Suite 2: Financial Waterfall Exact Closure
  await assertTest('Financial Variance Waterfall', 'Week 11 profit drop -$2,280 decomposes with 0 residual', () => {
    const wf = VarianceAttributionService.attributeVariance({
      previousProfit: 4120.0,
      currentProfit: 1840.0,
      advertisingImpact: -980.0,
      returnsImpact: -620.0,
      inventoryImpact: -510.0,
      priceImpact: -310.0,
      otherImpact: 140.0,
    });
    if (!wf.isExactMatch) throw new Error('Variance is not an exact match');
    if (wf.totalVariance !== -2280.0) throw new Error(`Expected total -2280, got ${wf.totalVariance}`);
    if (wf.formulaString !== '-2280 = -980 -620 -510 -310 +140') {
      throw new Error(`Formula mismatch: ${wf.formulaString}`);
    }
  });

  // Suite 3: Ad Optimizer Search Term Evaluation
  await assertTest('Ad Optimizer', 'Flag 93.3% ACOS keyword "bathroom organizer" for Negative Exact', () => {
    const res = AdOptimizerService.analyzeSearchTerm({
      searchTerm: 'bathroom organizer',
      impressions: 12500,
      clicks: 280,
      spend: 420.0,
      orders: 2,
      sales: 450.0,
    });
    if (res.action !== 'ADD_NEGATIVE_EXACT') {
      throw new Error(`Expected ADD_NEGATIVE_EXACT, got ${res.action}`);
    }
    if (res.acos < 0.9) throw new Error(`Expected ACOS > 0.9, got ${res.acos}`);
  });

  // Suite 4: Inventory Planning & Stockout Warning
  await assertTest('Inventory Planning', 'Detect Green SKU critical stockout risk when cover drops below 15 days', () => {
    const plan = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: 120,
      inboundQuantity: 0,
      avgDailySales: 10.2,
      leadTimeDays: 15,
      safetyStockDays: 7,
    });
    if (plan.daysCover >= 15) throw new Error(`Expected days cover < 15, got ${plan.daysCover}`);
    if (plan.riskLevel !== 'LOW_STOCK' && plan.riskLevel !== 'OUT_OF_STOCK') {
      throw new Error(`Expected stock risk level, got ${plan.riskLevel}`);
    }
    if (plan.recommendedQuantity <= 0) throw new Error('Expected positive reorder quantity');
  });

  // Suite 5: Purchase Order State Machine Invariants
  await assertTest('PO State Machine', 'Enforce strict transition DRAFT -> SUBMITTED -> CONFIRMED -> SHIPPED -> RECEIVED', () => {
    const allowed = PurchaseOrderStateMachine.canTransition('SHIPPED', 'RECEIVED');
    if (!allowed) throw new Error('SHIPPED -> RECEIVED should be allowed');

    const forbidden = PurchaseOrderStateMachine.canTransition('DRAFT', 'RECEIVED');
    if (forbidden) throw new Error('DRAFT -> RECEIVED should be strictly forbidden');
  });

  // Suite 6: Listing Studio V2 & Listing Intelligence DAG
  await assertTest('Listing Intelligence DAG', 'WF-02 14-Step DAG completes with grounded claims and creative brief', async () => {
    const dagResult = await ListingWorkflowDagService.executeWorkflowDag({
      skuCode: 'MTH-WHITE-001',
      productName: 'Natural Marble Toothbrush Holder',
      brand: 'POLEGAS',
      variantName: 'Carrara White',
      features: [
        { id: 'f_mat', name: 'Material', value: '100% Genuine Natural Marble', isCore: true },
        { id: 'f_slot', name: 'Slot Diameter', value: '1.5 inches', isCore: true },
        { id: 'f_wt', name: 'Weight', value: '3.57 lbs', isCore: true },
      ],
      skuWeightKg: 1.62,
    });

    if (!dagResult.success) throw new Error('DAG execution failed');
    if (dagResult.stepTraces.length !== 14) {
      throw new Error(`Expected 14 DAG step traces, got ${dagResult.stepTraces.length}`);
    }
    if (dagResult.groundingMetrics.groundingRate !== 1.0) {
      throw new Error(`Expected 100% grounding rate, got ${dagResult.groundingMetrics.groundingRate}`);
    }
    if (!dagResult.creativeBrief || dagResult.creativeBrief.imageBriefs.length < 5) {
      throw new Error('Expected at least 5 structured image briefs in creative brief');
    }
    if (dagResult.complianceResult.status !== 'PASS') {
      throw new Error(`Expected PASS in compliance, got ${dagResult.complianceResult.status}`);
    }
  });

  await assertTest('Marketplace Policy Profile', 'Load Amazon US profile with dynamic title and bullet rules', () => {
    const profile = getMarketplacePolicyProfile('AMAZON_US');
    if (profile.title.maxLength !== 200) {
      throw new Error(`Expected title max length 200, got ${profile.title.maxLength}`);
    }
    if (profile.bullets.maxCount !== 5) {
      throw new Error(`Expected 5 bullets, got ${profile.bullets.maxCount}`);
    }
    if (!profile.forbiddenPatterns.includes('fda approved')) {
      throw new Error('Expected "fda approved" in forbidden patterns');
    }
  });

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n📊 ========================================================');
  console.log(`   Evaluation Summary: ${passed}/${total} PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All Golden Benchmark regression tests passed successfully!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unhandled benchmark error:', err);
  process.exit(1);
});
