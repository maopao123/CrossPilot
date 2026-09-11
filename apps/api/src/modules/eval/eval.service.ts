import { Injectable } from '@nestjs/common';
import {
  ComplianceJudgeService,
  VarianceAttributionService,
  AdOptimizerService,
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
        casesCount: 4,
        description: 'Verifies zero ungrounded medical claims, material truth, and slot diameter warnings.',
      },
      {
        name: 'Financial & Variance Waterfall Suite',
        casesCount: 3,
        description: 'Verifies exact mathematical closure on the -$2,280 profit decomposition.',
      },
      {
        name: 'PPC Search Term Optimization Suite',
        casesCount: 3,
        description: 'Verifies high ACOS threshold triggers negative exact actions.',
      },
    ];
  }

  runBenchmarks(): {
    summary: { total: number; passed: number; failed: number; passRate: string };
    results: EvalCaseResult[];
  } {
    const results: EvalCaseResult[] = [];

    // Case 1: Compliance - Prohibited FDA Claim
    const start1 = Date.now();
    const check1 = ComplianceJudgeService.evaluateListing({
      title: 'FDA Approved Antibacterial Stone Caddy',
      bulletPoints: ['Cures all bathroom mold.'],
    });
    const passed1 = check1.status === 'REJECTED' && check1.violations.some((v) => v.ruleCode === 'POL-FDA-001');
    results.push({
      suite: 'Listing Groundedness & Compliance Suite',
      name: 'Reject unverified FDA / medical claims',
      expected: 'REJECTED with POL-FDA-001 violation',
      actual: `${check1.status} (${check1.violations.map((v) => v.ruleCode).join(', ')})`,
      passed: passed1,
      score: passed1 ? 1.0 : 0.0,
      durationMs: Date.now() - start1,
    });

    // Case 2: Compliance - Compliant Product Listing
    const start2 = Date.now();
    const check2 = ComplianceJudgeService.evaluateListing({
      title: 'POLEGAS Natural Marble Toothbrush Holder (Carrara White)',
      bulletPoints: ['100% Genuine Marble, 3.57 lbs non-slip base, 1.5" slots.'],
    });
    const passed2 = check2.status === 'PASS';
    results.push({
      suite: 'Listing Groundedness & Compliance Suite',
      name: 'Pass verified factual natural stone listing',
      expected: 'PASS',
      actual: check2.status,
      passed: passed2,
      score: passed2 ? 1.0 : 0.0,
      durationMs: Date.now() - start2,
    });

    // Case 3: Compliance - Slot Diameter Warning
    const start3 = Date.now();
    const check3 = ComplianceJudgeService.evaluateListing({
      title: 'Universal Marble Holder',
      bulletPoints: ['Fits all electric toothbrushes.'],
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
    const passed4 = wf.isExactMatch && wf.totalVariance === -2280.0;
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
    const passed5 = adOpt.action === 'ADD_NEGATIVE_EXACT';
    results.push({
      suite: 'PPC Search Term Optimization Suite',
      name: 'Recommend Negative Exact for 93.3% ACOS keyword',
      expected: 'ADD_NEGATIVE_EXACT',
      actual: adOpt.action,
      passed: passed5,
      score: passed5 ? 1.0 : 0.0,
      durationMs: Date.now() - start5,
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
