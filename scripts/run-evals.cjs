#!/usr/bin/env node
/**
 * CrossPilot Golden Benchmark & Regression Eval Suite (Milestone 8)
 *
 * Runs automated deterministic test cases against:
 * 1. Listing Groundedness & Compliance Judge
 * 2. Financial Variance Waterfall Exact Math Closure (-2280 = -980 - 620 - 510 - 310 + 140)
 * 3. PPC Search Term Optimization & Negative Keyword Actions
 * 4. Inventory Planning & 12 Days Cover Alert
 * 5. Purchase Order State Machine Invariants
 */

const {
  ComplianceJudgeService,
  VarianceAttributionService,
  AdOptimizerService,
  InventoryPlanningService,
  PurchaseOrderStateMachine,
} = require('../packages/domain/dist/index.js');

console.log('🧪 ========================================================');
console.log('   CrossPilot Golden Benchmark Regression Suite (M8)');
console.log('========================================================\n');

const results = [];

function assertTest(suite, name, fn) {
  const start = Date.now();
  try {
    fn();
    const duration = Date.now() - start;
    results.push({ suite, name, passed: true, duration });
    console.log(`  ✅ [PASS] (${duration}ms) ${suite} › ${name}`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ suite, name, passed: false, error: err.message, duration });
    console.error(`  ❌ [FAIL] (${duration}ms) ${suite} › ${name}: ${err.message}`);
  }
}

// Suite 1: Compliance Judge & Listing Groundedness
assertTest('Compliance Judge', 'Reject listing with ungrounded FDA claims', () => {
  const check = ComplianceJudgeService.evaluateListing({
    title: '#1 Best Seller FDA Approved Antibacterial Toothbrush Holder',
    bulletPoints: ['Cures all bathroom mold.'],
  });
  if (check.status !== 'REJECTED') throw new Error(`Expected REJECTED, got ${check.status}`);
  if (!check.violations.some((v) => v.ruleCode === 'POL-FDA-001')) {
    throw new Error('Expected POL-FDA-001 violation');
  }
});

assertTest('Compliance Judge', 'Pass fact-grounded natural marble listing', () => {
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

assertTest('Compliance Judge', 'Flag slot diameter compatibility claim with warning', () => {
  const check = ComplianceJudgeService.evaluateListing({
    title: 'Universal Marble Toothbrush Holder',
    bulletPoints: ['Fits all electric toothbrushes with ease.'],
  });
  if (!check.violations.some((v) => v.ruleCode === 'FACT-DIM-004')) {
    throw new Error('Expected FACT-DIM-004 warning');
  }
});

// Suite 2: Financial Waterfall Exact Closure
assertTest('Financial Variance Waterfall', 'Week 11 profit drop -$2,280 decomposes with 0 residual', () => {
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
assertTest('Ad Optimizer', 'Flag 93.3% ACOS keyword "bathroom organizer" for Negative Exact', () => {
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
assertTest('Inventory Planning', 'Detect Green SKU critical stockout risk when cover drops below 15 days', () => {
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
assertTest('PO State Machine', 'Enforce strict transition DRAFT -> SUBMITTED -> CONFIRMED -> SHIPPED -> RECEIVED', () => {
  const allowed = PurchaseOrderStateMachine.canTransition('SHIPPED', 'RECEIVED');
  if (!allowed) throw new Error('SHIPPED -> RECEIVED should be allowed');

  const forbidden = PurchaseOrderStateMachine.canTransition('DRAFT', 'RECEIVED');
  if (forbidden) throw new Error('DRAFT -> RECEIVED should be strictly forbidden');
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
