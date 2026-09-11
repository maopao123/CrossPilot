import { Injectable } from '@nestjs/common';
import {
  ComplianceJudgeService,
  VarianceAttributionService,
  AdOptimizerService,
  InventoryPlanningService,
  PurchaseOrderStateMachine,
  ListingWorkflowDagService,
  getMarketplacePolicyProfile,
} from '@crosspilot/domain';

export interface EvalCaseResult {
  suite: string;
  name: string;
  expected: any;
  actual: any;
  passed: boolean;
  score: number;
  durationMs: number;
  reason?: string;
}

@Injectable()
export class EvalService {
  getBenchmarkSuites() {
    return [
      {
        name: 'Listing Groundedness & Compliance Suite',
        casesCount: 3,
        description: 'Verifies zero ungrounded medical claims, material truth, and slot diameter warnings.',
      },
      {
        name: 'Financial & Variance Waterfall Suite',
        casesCount: 1,
        description: 'Verifies exact mathematical closure on the -$2,280 profit decomposition.',
      },
      {
        name: 'PPC Search Term Optimization Suite',
        casesCount: 1,
        description: 'Verifies high ACOS threshold triggers negative exact actions.',
      },
      {
        name: 'Inventory Planning & Stockout Warning Suite',
        casesCount: 1,
        description: 'Detects critical stockout risk when days cover drops below lead time.',
      },
      {
        name: 'Purchase Order State Machine Invariants Suite',
        casesCount: 1,
        description: 'Enforces strictly verified transition rules across PO lifecycle.',
      },
      {
        name: 'Listing Studio V2 & Listing Intelligence Suite',
        casesCount: 2,
        description: 'Verifies 14-Step DAG claim grounding, Image Briefs generation, and Marketplace Policy Profiles.',
      },
    ];
  }

  async runBenchmarks(): Promise<{
    summary: { total: number; passed: number; failed: number; passRate: string };
    results: EvalCaseResult[];
  }> {
    const results: EvalCaseResult[] = [];

    // Case 1: Compliance - Prohibited FDA Claim
    const start1 = Date.now();
    const check1 = ComplianceJudgeService.evaluateListing({
      title: '#1 Best Seller FDA Approved Antibacterial Toothbrush Holder',
      bulletPoints: ['Cures all bathroom mold.'],
    });
    const passed1 = (check1.status === 'BLOCK' || check1.status === 'REJECTED') && check1.violations.some((v) => v.ruleCode === 'POL-FDA-001');
    results.push({
      suite: 'Listing Groundedness & Compliance Suite',
      name: 'Reject unverified FDA / medical claims',
      expected: 'BLOCK with POL-FDA-001 violation',
      actual: `${check1.status} (${check1.violations.map((v) => v.ruleCode).join(', ')})`,
      passed: passed1,
      score: passed1 ? 1.0 : 0.0,
      durationMs: Date.now() - start1,
    });

    // Case 2: Compliance - Compliant Product Listing
    const start2 = Date.now();
    const check2 = ComplianceJudgeService.evaluateListing({
      title: 'POLEGAS Natural Marble Toothbrush Holder - 1.5" Wide Slots (3.57 lbs)',
      bulletPoints: [
        '100% Genuine Marble with solid heavy non-slip base.',
        '1.5-inch slots fit standard manual and slim electric handles.',
        'Non-porous sealed stone wipes clean easily.',
      ],
    });
    const passed2 = check2.status === 'PASS' && check2.violations.length === 0;
    results.push({
      suite: 'Listing Groundedness & Compliance Suite',
      name: 'Pass verified factual natural stone listing',
      expected: 'PASS (0 violations)',
      actual: check2.status,
      passed: passed2,
      score: passed2 ? 1.0 : 0.0,
      durationMs: Date.now() - start2,
    });

    // Case 3: Compliance - Slot Diameter Warning
    const start3 = Date.now();
    const check3 = ComplianceJudgeService.evaluateListing({
      title: 'Universal Marble Holder',
      bulletPoints: ['Fits all electric toothbrushes with ease.'],
    });
    const passed3 = check3.violations.some((v) => v.ruleCode === 'FACT-DIM-004');
    results.push({
      suite: 'Listing Groundedness & Compliance Suite',
      name: 'Flag generic "fits all electric toothbrushes" claim',
      expected: 'Trigger FACT-DIM-004 warning',
      actual: check3.violations.map((v) => v.ruleCode).join(', '),
      passed: passed3,
      score: passed3 ? 1.0 : 0.0,
      durationMs: Date.now() - start3,
    });

    // Case 4: Variance Waterfall - Exact Math Match
    const start4 = Date.now();
    const wf = VarianceAttributionService.attributeVariance({
      previousProfit: 4120.0,
      currentProfit: 1840.0,
      advertisingImpact: -980.0,
      returnsImpact: -620.0,
      inventoryImpact: -510.0,
      priceImpact: -310.0,
      otherImpact: 140.0,
    });
    const passed4 = wf.isExactMatch && wf.totalVariance === -2280.0 && wf.formulaString === '-2280 = -980 -620 -510 -310 +140';
    results.push({
      suite: 'Financial & Variance Waterfall Suite',
      name: 'Verify Week 11 -$2,280 waterfall exact closure',
      expected: '-2280 = -980 -620 -510 -310 +140',
      actual: wf.formulaString,
      passed: passed4,
      score: passed4 ? 1.0 : 0.0,
      durationMs: Date.now() - start4,
    });

    // Case 5: Advertising - Flag 93.3% ACOS Search Term
    const start5 = Date.now();
    const adOpt = AdOptimizerService.analyzeSearchTerm({
      searchTerm: 'bathroom organizer',
      impressions: 12500,
      clicks: 280,
      spend: 420.0,
      orders: 2,
      sales: 450.0,
    });
    const passed5 = adOpt.action === 'ADD_NEGATIVE_EXACT' && adOpt.acos > 0.9;
    results.push({
      suite: 'PPC Search Term Optimization Suite',
      name: 'Recommend Negative Exact for 93.3% ACOS keyword',
      expected: 'ADD_NEGATIVE_EXACT',
      actual: adOpt.action,
      passed: passed5,
      score: passed5 ? 1.0 : 0.0,
      durationMs: Date.now() - start5,
    });

    // Case 6: Inventory Planning - Green SKU 12 Days Cover Alert
    const start6 = Date.now();
    const plan = InventoryPlanningService.calculatePlanning({
      fulfillableQuantity: 120,
      inboundQuantity: 0,
      avgDailySales: 10.2,
      leadTimeDays: 15,
      safetyStockDays: 7,
    });
    const passed6 = plan.daysCover < 15 && (plan.riskLevel === 'LOW_STOCK' || plan.riskLevel === 'OUT_OF_STOCK') && plan.recommendedQuantity > 0;
    results.push({
      suite: 'Inventory Planning & Stockout Warning Suite',
      name: 'Detect Green SKU critical stockout risk when cover drops below 15 days',
      expected: 'daysCover < 15 and LOW_STOCK risk level',
      actual: `daysCover=${plan.daysCover}, riskLevel=${plan.riskLevel}, recommendedQuantity=${plan.recommendedQuantity}`,
      passed: passed6,
      score: passed6 ? 1.0 : 0.0,
      durationMs: Date.now() - start6,
    });

    // Case 7: Purchase Order State Machine Invariants
    const start7 = Date.now();
    const allowed = PurchaseOrderStateMachine.canTransition('SHIPPED', 'RECEIVED');
    const forbidden = PurchaseOrderStateMachine.canTransition('DRAFT', 'RECEIVED');
    const passed7 = allowed && !forbidden;
    results.push({
      suite: 'Purchase Order State Machine Invariants Suite',
      name: 'Enforce strict transition DRAFT -> SUBMITTED -> CONFIRMED -> SHIPPED -> RECEIVED',
      expected: 'SHIPPED->RECEIVED allowed, DRAFT->RECEIVED forbidden',
      actual: `SHIPPED->RECEIVED: ${allowed}, DRAFT->RECEIVED: ${forbidden}`,
      passed: passed7,
      score: passed7 ? 1.0 : 0.0,
      durationMs: Date.now() - start7,
    });

    // Case 8: Listing Studio V2 - 14-Step DAG
    const start8 = Date.now();
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
    const passed8 =
      dagResult.success &&
      dagResult.stepTraces.length === 14 &&
      dagResult.groundingMetrics.groundingRate === 1.0 &&
      dagResult.creativeBrief?.imageBriefs?.length >= 5 &&
      dagResult.complianceResult.status === 'PASS';
    results.push({
      suite: 'Listing Studio V2 & Listing Intelligence Suite',
      name: 'WF-02 14-Step DAG claim grounding and creative brief generation',
      expected: '14 step traces, 100% grounding rate, >=5 image briefs, PASS',
      actual: `${dagResult.stepTraces.length} steps, ${(dagResult.groundingMetrics.groundingRate * 100).toFixed(0)}% grounding, ${dagResult.creativeBrief?.imageBriefs?.length || 0} image briefs, ${dagResult.complianceResult.status}`,
      passed: passed8,
      score: passed8 ? 1.0 : 0.0,
      durationMs: Date.now() - start8,
    });

    // Case 9: Listing Studio V2 - Marketplace Policy Profile Limits
    const start9 = Date.now();
    const profile = getMarketplacePolicyProfile('AMAZON_US');
    const passed9 =
      profile.title.maxLength === 200 &&
      profile.bullets.maxCount === 5 &&
      profile.forbiddenPatterns.includes('fda approved');
    results.push({
      suite: 'Listing Studio V2 & Listing Intelligence Suite',
      name: 'MarketplacePolicyProfile dynamic title/bullets/forbidden rules',
      expected: 'Title max 200, Bullets max 5, contains "fda approved"',
      actual: `Title max ${profile.title.maxLength}, Bullets max ${profile.bullets.maxCount}, Forbidden: ${profile.forbiddenPatterns.length} rules`,
      passed: passed9,
      score: passed9 ? 1.0 : 0.0,
      durationMs: Date.now() - start9,
    });

    const passedCount = results.filter((r) => r.passed).length;
    const total = results.length;

    return {
      summary: {
        total,
        passed: passedCount,
        failed: total - passedCount,
        passRate: `${((passedCount / total) * 100).toFixed(1)}%`,
      },
      results,
    };
  }
}
