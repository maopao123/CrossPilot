import {
  // Shared contracts
  BusinessSignal,
  RecommendedAction,
  DiagnosisResult,
  DailyOperationDiagnosisState,
  OperationEvidenceItem,
  SignalDomain,
  SignalSeverity,
  SignalDirection,
  DetectionMethod,
  ActionCategory,
  ActionPriority,
  ActionRiskLevel,
  ActionExecutionMode,
  ActionStatus,
  EvidenceSourceCategory,
} from '@crosspilot/shared';

import {
  AnomalyThresholdConfig,
  DEFAULT_ANOMALY_THRESHOLDS,
  ThresholdResolver,
  ThresholdOverrideRule,
  validateAnomalyThresholdConfig,
  AnomalyThresholdValidationError,
} from '../src/operations/anomaly-threshold.config.js';

describe('Epic 3 Phase 1: Operations Intelligence Contracts & Anomaly Configuration', () => {
  describe('1. Shared Contracts Structure & Type Integrity', () => {
    it('should correctly model a BusinessSignal with all required fields and evidence', () => {
      const evidence: OperationEvidenceItem = {
        evidenceId: 'EV-DB-001',
        category: 'DATABASE',
        title: 'Daily Financial Snapshot',
        content: 'Net profit dropped from $3,540.00 to $2,560.00 (-27.7%)',
        source: 'orders_daily',
        sourceId: 'row-2026-09-10',
        capturedAt: '2026-09-11T00:00:00.000Z',
        metadata: { rowCount: 1 },
      };

      const signal: BusinessSignal = {
        signalId: 'SIG-001',
        workspaceId: 'ws-demo',
        skuId: 'SKU-MARBLE-001',
        asin: 'B0BFGNSXYL',
        domain: 'PROFIT',
        code: 'PROFIT_DROP',
        metric: 'netProfit',
        currentValue: 2560.0,
        baselineValue: 3540.0,
        changePct: -0.277,
        thresholdValue: 0.20,
        severity: 'CRITICAL',
        direction: 'DOWN',
        detectedBy: 'FORMULA',
        ruleId: 'R-PROF-01',
        title: 'Net Profit Dropped 27.7%',
        description: 'Net profit dropped 27.7% compared to previous 7-day baseline.',
        evidence: [evidence],
        detectedAt: '2026-09-11T00:00:00.000Z',
        metadata: { baselinePeriodDays: 7 },
      };

      expect(signal.signalId).toBe('SIG-001');
      expect(signal.domain).toBe('PROFIT');
      expect(signal.severity).toBe('CRITICAL');
      expect(signal.evidence).toHaveLength(1);
      expect(signal.evidence[0].category).toBe('DATABASE');
    });

    it('should distinguish EvidenceSourceCategory across RAG, DATABASE, CALCULATED_METRIC, etc.', () => {
      const categories: EvidenceSourceCategory[] = [
        'RAG',
        'DATABASE',
        'CALCULATED_METRIC',
        'BUSINESS_SIGNAL',
        'RULE',
        'EXTERNAL_DATA',
      ];

      expect(categories).toHaveLength(6);

      const metricEvidence: OperationEvidenceItem = {
        evidenceId: 'EV-METRIC-01',
        category: 'CALCULATED_METRIC',
        title: 'Variance Attribution Factor',
        content: 'Ad spend variance attributed -$980.00 to overall profit delta.',
        source: 'VarianceAttributionService',
        sourceId: 'attributeVariance',
        capturedAt: new Date().toISOString(),
      };

      const ragEvidence: OperationEvidenceItem = {
        evidenceId: 'EV-RAG-01',
        category: 'RAG',
        title: 'Listing Policy Reference',
        content: 'Promotional claims like Best Seller are strictly prohibited.',
        source: 'MilvusKnowledgeStore',
        sourceId: 'K-AUTH-001',
        capturedAt: new Date().toISOString(),
      };

      expect(metricEvidence.category).toBe('CALCULATED_METRIC');
      expect(ragEvidence.category).toBe('RAG');
      expect(ragEvidence.sourceId).toBe('K-AUTH-001');
    });

    it('should correctly model RecommendedAction with P1/P2/P3, risk level, and execution mode', () => {
      const action: RecommendedAction = {
        actionId: 'ACT-001',
        workspaceId: 'ws-demo',
        skuId: 'SKU-MARBLE-001',
        sourceSignalIds: ['SIG-001', 'SIG-002'],
        category: 'ADVERTISING',
        priority: 'P1',
        title: 'Add Negative Exact to Search Term "electric toothbrush stand cheap"',
        reason: 'Search term consumed 28 clicks with 0 orders and $42.50 wasted spend.',
        evidence: [
          {
            evidenceId: 'EV-AD-01',
            category: 'DATABASE',
            title: 'Search Term Report',
            content: '28 clicks, 0 orders, $42.50 spend',
            source: 'sp_search_term_report',
            capturedAt: '2026-09-11T00:00:00.000Z',
          },
        ],
        expectedImpact: 'Eliminate ~$180/month unprofitable ad waste',
        riskLevel: 'LOW',
        executionMode: 'APPROVAL_REQUIRED',
        status: 'PROPOSED',
        targetEntity: 'CampaignNegativeKeyword',
        targetId: 'camp-991',
        payload: {
          campaignId: 'camp-991',
          keywordText: 'electric toothbrush stand cheap',
          matchType: 'NEGATIVE_EXACT',
        },
        createdAt: '2026-09-11T00:00:00.000Z',
      };

      expect(action.priority).toBe('P1');
      expect(action.executionMode).toBe('APPROVAL_REQUIRED');
      expect(action.riskLevel).toBe('LOW');
      expect(action.status).toBe('PROPOSED');
      expect(action.sourceSignalIds).toContain('SIG-001');
    });

    it('should correctly model DiagnosisResult with PrimaryDriver and SecondaryDrivers', () => {
      const diagnosis: DiagnosisResult = {
        diagnosisId: 'DIAG-001',
        workspaceId: 'ws-demo',
        skuId: 'SKU-MARBLE-001',
        asin: 'B0BFGNSXYL',
        title: 'Net Profit Decline Driven by Advertising Inefficiency & Return Spike',
        summary: 'Ad spend expansion without sales conversion was the primary driver (-$980, 46.4%), followed by return rate surge (-$620, 29.4%).',
        primaryDriver: {
          domain: 'ADVERTISING',
          metric: 'adSpendVariance',
          impactAmount: -980.0,
          contributionRatio: 0.464,
          direction: 'DOWN',
          description: 'ACOS expanded from 24% to 39% due to broad match waste.',
        },
        secondaryDrivers: [
          {
            domain: 'RETURNS',
            metric: 'refundCostVariance',
            impactAmount: -620.0,
            contributionRatio: 0.294,
            direction: 'DOWN',
            description: 'Return rate doubled to 6.2% following recent batch shipment.',
          },
          {
            domain: 'INVENTORY',
            metric: 'stockoutLossVariance',
            impactAmount: -510.0,
            contributionRatio: 0.242,
            direction: 'DOWN',
            description: 'Stockout during peak weekend resulted in lost unit sales.',
          },
        ],
        confidence: 0.94,
        evidence: [],
        affectedDomains: ['PROFIT', 'ADVERTISING', 'RETURNS', 'INVENTORY'],
        affectedSkus: ['SKU-MARBLE-001'],
        calculatedAt: '2026-09-11T00:00:00.000Z',
      };

      expect(diagnosis.primaryDriver.domain).toBe('ADVERTISING');
      expect(diagnosis.secondaryDrivers).toHaveLength(2);
      expect(diagnosis.confidence).toBeGreaterThan(0.9);
      expect(diagnosis.affectedDomains).toContain('RETURNS');
    });

    it('should correctly encapsulate DailyOperationDiagnosisState', () => {
      const state: DailyOperationDiagnosisState = {
        mode: 'SKU',
        dateRange: {
          from: '2026-09-04T00:00:00.000Z',
          to: '2026-09-11T00:00:00.000Z',
        },
        workspaceId: 'ws-test',
        skuIds: ['SKU-001'],
        signals: [],
        diagnoses: [],
        recommendedActions: [],
        summary: {
          criticalCount: 2,
          warningCount: 1,
          infoCount: 0,
          affectedSkuCount: 1,
          status: 'CRITICAL',
          primaryIssueDomain: 'PROFIT',
        },
        executedAt: '2026-09-11T01:00:00.000Z',
      };

      expect(state.mode).toBe('SKU');
      expect(state.summary?.status).toBe('CRITICAL');
      expect(state.summary?.criticalCount).toBe(2);
    });
  });

  describe('2. Anomaly Threshold Configuration & Defaults', () => {
    it('should have all 12 core rules defined in DEFAULT_ANOMALY_THRESHOLDS', () => {
      expect(DEFAULT_ANOMALY_THRESHOLDS.version).toBe('1.0.0');

      // Rule 1: R-PROF-01
      expect(DEFAULT_ANOMALY_THRESHOLDS.profitDropPctThreshold).toBe(0.20);
      // Rule 2: R-PROF-02
      expect(DEFAULT_ANOMALY_THRESHOLDS.criticalMarginRateThreshold).toBe(0.05);

      // Rule 3: R-ADS-01
      expect(DEFAULT_ANOMALY_THRESHOLDS.maxAcosThreshold).toBe(0.35);
      expect(DEFAULT_ANOMALY_THRESHOLDS.acosTargetDeviationThreshold).toBe(0.30);
      // Rule 4: R-ADS-02
      expect(DEFAULT_ANOMALY_THRESHOLDS.adSpendGrowthMaxThreshold).toBe(0.25);
      // Rule 5: R-ADS-03
      expect(DEFAULT_ANOMALY_THRESHOLDS.zeroConversionClicksThreshold).toBe(20);

      // Rule 6: R-INV-01
      expect(DEFAULT_ANOMALY_THRESHOLDS.minDaysCoverLeadTimeFactor).toBe(1.0);
      expect(DEFAULT_ANOMALY_THRESHOLDS.criticalDaysCoverFloor).toBe(15);
      // Rule 7: R-INV-02
      expect(DEFAULT_ANOMALY_THRESHOLDS.stockoutUnitsThreshold).toBe(0);
      // Rule 8: R-INV-03
      expect(DEFAULT_ANOMALY_THRESHOLDS.excessDaysCoverThreshold).toBe(90);

      // Rule 9: R-RET-01
      expect(DEFAULT_ANOMALY_THRESHOLDS.returnRateSpikeThreshold).toBe(0.05);
      expect(DEFAULT_ANOMALY_THRESHOLDS.returnRateGrowthThreshold).toBe(0.50);

      // Rule 10: R-REV-01
      expect(DEFAULT_ANOMALY_THRESHOLDS.ratingDeteriorationFloor).toBe(4.3);
      expect(DEFAULT_ANOMALY_THRESHOLDS.recentNegativeReviewRatioThreshold).toBe(0.20);

      // Rule 11: R-COMP-01
      expect(DEFAULT_ANOMALY_THRESHOLDS.competitorPriceDropPctThreshold).toBe(0.10);
      // Rule 12: R-COMP-02
      expect(DEFAULT_ANOMALY_THRESHOLDS.competitorRatingAdvantageDelta).toBe(0.30);
    });

    it('should ensure DEFAULT_ANOMALY_THRESHOLDS is deeply frozen and immutable', () => {
      expect(Object.isFrozen(DEFAULT_ANOMALY_THRESHOLDS)).toBe(true);
      expect(() => {
        (DEFAULT_ANOMALY_THRESHOLDS as any).profitDropPctThreshold = 0.50;
      }).toThrow();
    });

    it('should validate default configuration without errors', () => {
      const errors = validateAnomalyThresholdConfig(DEFAULT_ANOMALY_THRESHOLDS);
      expect(errors).toEqual([]);
    });
  });

  describe('3. Multi-Tier Threshold Resolver & Priority Hierarchy', () => {
    it('should resolve system defaults when context is empty', () => {
      const resolver = new ThresholdResolver();
      const config = resolver.resolve({});

      expect(config.profitDropPctThreshold).toBe(0.20);
      expect(config.maxAcosThreshold).toBe(0.35);
      expect(config.criticalDaysCoverFloor).toBe(15);
      expect(config.version).toBe('1.0.0');
    });

    it('should apply Marketplace/Category override on top of System Default', () => {
      const resolver = new ThresholdResolver();
      resolver.registerRule({
        scope: 'MARKETPLACE_CATEGORY',
        scopeKey: 'AMAZON_US:HOME_KITCHEN',
        overrides: {
          maxAcosThreshold: 0.28, // tighter ACOS for competitive category
          excessDaysCoverThreshold: 120, // larger seasonal storage allowed
        },
      });

      // Context matching category
      const config = resolver.resolve({
        marketplaceId: 'AMAZON_US',
        category: 'HOME_KITCHEN',
      });

      expect(config.maxAcosThreshold).toBe(0.28);
      expect(config.excessDaysCoverThreshold).toBe(120);
      // Unoverridden fields stay system default
      expect(config.profitDropPctThreshold).toBe(0.20);
      expect(config.criticalDaysCoverFloor).toBe(15);
    });

    it('should prioritize exact marketplace:category over broad marketplace', () => {
      const resolver = new ThresholdResolver();
      // Broad marketplace rule
      resolver.registerRule({
        scope: 'MARKETPLACE_CATEGORY',
        scopeKey: 'AMAZON_US',
        overrides: {
          maxAcosThreshold: 0.32,
        },
      });
      // Specific marketplace:category rule
      resolver.registerRule({
        scope: 'MARKETPLACE_CATEGORY',
        scopeKey: 'AMAZON_US:ELECTRONICS',
        overrides: {
          maxAcosThreshold: 0.22,
        },
      });

      // Query Electronics in AMAZON_US
      const electronicsConfig = resolver.resolve({
        marketplaceId: 'AMAZON_US',
        category: 'ELECTRONICS',
      });
      expect(electronicsConfig.maxAcosThreshold).toBe(0.22);

      // Query other category in AMAZON_US
      const beautyConfig = resolver.resolve({
        marketplaceId: 'AMAZON_US',
        category: 'BEAUTY',
      });
      expect(beautyConfig.maxAcosThreshold).toBe(0.32);
    });

    it('should enforce full 4-tier override hierarchy: System -> Marketplace -> Workspace -> SKU', () => {
      const resolver = new ThresholdResolver();

      // 1. System Default is maxAcosThreshold = 0.35

      // 2. Marketplace/Category Override sets maxAcosThreshold = 0.30
      resolver.registerRule({
        scope: 'MARKETPLACE_CATEGORY',
        scopeKey: 'AMAZON_US:HOME_KITCHEN',
        overrides: {
          maxAcosThreshold: 0.30,
          profitDropPctThreshold: 0.18,
          criticalDaysCoverFloor: 20,
        },
      });

      // 3. Workspace Override sets maxAcosThreshold = 0.25
      resolver.registerRule({
        scope: 'WORKSPACE',
        scopeKey: 'ws-alpha',
        overrides: {
          maxAcosThreshold: 0.25,
          criticalDaysCoverFloor: 25, // Workspace requires higher safety stock
        },
      });

      // 4. SKU Override sets maxAcosThreshold = 0.40 (e.g. launch phase allows higher ACOS)
      resolver.registerRule({
        scope: 'SKU',
        scopeKey: 'SKU-LAUNCH-01',
        overrides: {
          maxAcosThreshold: 0.40,
        },
      });

      // Case A: Query workspace with SKU-LAUNCH-01
      const skuResult = resolver.resolveWithTrace({
        marketplaceId: 'AMAZON_US',
        category: 'HOME_KITCHEN',
        workspaceId: 'ws-alpha',
        skuId: 'SKU-LAUNCH-01',
      });

      // SKU override wins for maxAcosThreshold
      expect(skuResult.config.maxAcosThreshold).toBe(0.40);
      // Workspace override wins for criticalDaysCoverFloor (SKU did not override)
      expect(skuResult.config.criticalDaysCoverFloor).toBe(25);
      // Marketplace override wins for profitDropPctThreshold (Workspace/SKU did not override)
      expect(skuResult.config.profitDropPctThreshold).toBe(0.18);
      // System default preserved for unoverridden values
      expect(skuResult.config.criticalMarginRateThreshold).toBe(0.05);

      // Verify trace details
      expect(skuResult.trace.appliedOverrides).toHaveLength(3);
      expect(skuResult.trace.appliedOverrides[0].scope).toBe('MARKETPLACE_CATEGORY');
      expect(skuResult.trace.appliedOverrides[1].scope).toBe('WORKSPACE');
      expect(skuResult.trace.appliedOverrides[2].scope).toBe('SKU');
      expect(skuResult.trace.appliedOverrides[2].overriddenKeys).toContain('maxAcosThreshold');

      // Case B: Query standard SKU in ws-alpha
      const standardSkuResult = resolver.resolve({
        marketplaceId: 'AMAZON_US',
        category: 'HOME_KITCHEN',
        workspaceId: 'ws-alpha',
        skuId: 'SKU-STANDARD-02',
      });
      // In ws-alpha, workspace override (0.25) wins since SKU-STANDARD-02 has no SKU override
      expect(standardSkuResult.maxAcosThreshold).toBe(0.25);
      expect(standardSkuResult.criticalDaysCoverFloor).toBe(25);

      // Case C: Query outside ws-alpha (different workspace)
      const otherWsResult = resolver.resolve({
        marketplaceId: 'AMAZON_US',
        category: 'HOME_KITCHEN',
        workspaceId: 'ws-other',
      });
      // Marketplace override (0.30) wins
      expect(otherWsResult.maxAcosThreshold).toBe(0.30);
      expect(otherWsResult.criticalDaysCoverFloor).toBe(20);

      // Case D: Query completely different marketplace
      const euResult = resolver.resolve({
        marketplaceId: 'AMAZON_DE',
        workspaceId: 'ws-other',
      });
      // Falls back to System Default (0.35, 15)
      expect(euResult.maxAcosThreshold).toBe(0.35);
      expect(euResult.criticalDaysCoverFloor).toBe(15);
    });

    it('should respect effectiveFrom and effectiveTo time windows', () => {
      const resolver = new ThresholdResolver();

      // Rule effective only during Prime Day week 2026-07-10 to 2026-07-17
      resolver.registerRule({
        scope: 'WORKSPACE',
        scopeKey: 'ws-promo',
        effectiveFrom: '2026-07-10T00:00:00.000Z',
        effectiveTo: '2026-07-17T23:59:59.999Z',
        overrides: {
          maxAcosThreshold: 0.50, // allow aggressive spending during event
        },
      });

      // 1. Before window
      const beforeResult = resolver.resolve({
        workspaceId: 'ws-promo',
        asOf: '2026-07-01T00:00:00.000Z',
      });
      expect(beforeResult.maxAcosThreshold).toBe(0.35);

      // 2. Inside window
      const duringResult = resolver.resolve({
        workspaceId: 'ws-promo',
        asOf: '2026-07-12T12:00:00.000Z',
      });
      expect(duringResult.maxAcosThreshold).toBe(0.50);

      // 3. After window
      const afterResult = resolver.resolve({
        workspaceId: 'ws-promo',
        asOf: '2026-07-20T00:00:00.000Z',
      });
      expect(afterResult.maxAcosThreshold).toBe(0.35);
    });
  });

  describe('4. Strict Threshold Validation & Error Rejection', () => {
    it('should reject invalid click count (< 1 or non-integer) at registration time', () => {
      const resolver = new ThresholdResolver();

      expect(() => {
        resolver.registerRule({
          scope: 'SKU',
          scopeKey: 'SKU-ERR-01',
          overrides: {
            zeroConversionClicksThreshold: 0,
          },
        });
      }).toThrow(AnomalyThresholdValidationError);

      expect(() => {
        resolver.registerRule({
          scope: 'SKU',
          scopeKey: 'SKU-ERR-02',
          overrides: {
            zeroConversionClicksThreshold: 12.5,
          },
        });
      }).toThrow(AnomalyThresholdValidationError);
    });

    it('should reject rating deterioration outside [1.0, 5.0]', () => {
      const errorsLow = validateAnomalyThresholdConfig({ ratingDeteriorationFloor: 0.8 });
      expect(errorsLow.length).toBeGreaterThan(0);

      const errorsHigh = validateAnomalyThresholdConfig({ ratingDeteriorationFloor: 5.5 });
      expect(errorsHigh.length).toBeGreaterThan(0);

      const validErrors = validateAnomalyThresholdConfig({ ratingDeteriorationFloor: 4.2 });
      expect(validErrors).toHaveLength(0);
    });

    it('should reject returnRateSpikeThreshold outside [0, 1.0]', () => {
      const errorsNeg = validateAnomalyThresholdConfig({ returnRateSpikeThreshold: -0.05 });
      expect(errorsNeg.length).toBeGreaterThan(0);

      const errorsOver = validateAnomalyThresholdConfig({ returnRateSpikeThreshold: 1.25 });
      expect(errorsOver.length).toBeGreaterThan(0);
    });

    it('should reject excessDaysCoverThreshold less than or equal to criticalDaysCoverFloor', () => {
      const errors = validateAnomalyThresholdConfig({
        criticalDaysCoverFloor: 30,
        excessDaysCoverThreshold: 20,
      });
      expect(errors.some((e) => e.includes('excessDaysCoverThreshold must be strictly greater than criticalDaysCoverFloor'))).toBe(true);
    });

    it('should reject non-finite numbers (NaN, Infinity)', () => {
      const errorsNaN = validateAnomalyThresholdConfig({
        profitDropPctThreshold: NaN,
        maxAcosThreshold: Infinity,
      });
      expect(errorsNaN.length).toBe(2);
    });

    it('should support clearing rules by scope', () => {
      const resolver = new ThresholdResolver();
      resolver.registerRule({
        scope: 'SKU',
        scopeKey: 'SKU-01',
        overrides: { maxAcosThreshold: 0.40 },
      });
      resolver.registerRule({
        scope: 'WORKSPACE',
        scopeKey: 'ws-01',
        overrides: { maxAcosThreshold: 0.30 },
      });

      expect(resolver.getRules()).toHaveLength(2);
      resolver.clearRules('SKU');
      expect(resolver.getRules()).toHaveLength(1);
      expect(resolver.getRules()[0].scope).toBe('WORKSPACE');

      resolver.clearRules();
      expect(resolver.getRules()).toHaveLength(0);
    });
  });
});
