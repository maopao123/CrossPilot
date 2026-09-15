import { AnalystService } from '../src/modules/analyst/analyst.service';

describe('AnalystService - Reconciliation Gate & Unified Source of Truth', () => {
  let service: AnalystService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      analysisWaterfall: {
        findFirst: jest.fn(),
      },
      profitDaily: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      searchTermMetricDaily: {
        findFirst: jest.fn(),
      },
      returnRecord: {
        findMany: jest.fn(),
      },
      inventoryBalance: {
        findFirst: jest.fn(),
      },
    };

    service = new AnalystService(mockPrisma);
  });

  describe('Bug ①: Unified Source of Truth in getWaterfall', () => {
    it('should derive totalVariance strictly from currentProfit - previousProfit, never unanchored waterfall record', async () => {
      mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-14'),
        totalVariance: -2280.0, // Stored discordant record in DB
        advertisingImpact: -980.0,
        returnsImpact: -620.0,
        inventoryImpact: -510.0,
        priceImpact: -310.0,
        otherImpact: 140.0,
        formulaExplained: 'raw formula',
        session: {
          findings: [
            { findingType: 'ADVERTISING', impactAmount: -980.0 },
            { findingType: 'RETURNS', impactAmount: -620.0 },
            { findingType: 'INVENTORY', impactAmount: -510.0 },
            { findingType: 'PRICING', impactAmount: -310.0 },
            { findingType: 'OTHER', impactAmount: 140.0 },
          ],
        },
      });

      // 14 days of profitDaily: first 7 days sum to 1665.95, next 7 days sum to 1440.79
      const dailyRecords = [
        ...Array(7).fill(null).map((_, i) => ({
          date: new Date(`2026-03-0${i + 1}`),
          netProfit: (1665.95 / 7).toFixed(2),
        })),
        ...Array(7).fill(null).map((_, i) => ({
          date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
          netProfit: (1440.79 / 7).toFixed(2),
        })),
      ];
      mockPrisma.profitDaily.findMany.mockResolvedValue(dailyRecords);

      const result = await service.getWaterfall('ws-1');

      expect(result).toBeDefined();
      // previousProfit = ~1665.95, currentProfit = ~1440.79
      // Invariant: totalVariance MUST equal current - previous (~ -225.16), NOT -2280
      expect(result!.totalVariance).toBeCloseTo(-225.16, 1);
      expect(result!.attribution.totalVariance).toBeCloseTo(-225.16, 1);
      expect(result!.attribution.isExactMatch).toBe(false);
      expect(result!.attribution.residual).toBeCloseTo(2054.84, 1);
    });
  });

  describe('Bug ③: Fail-Closed Reconciliation Gate in askAnalyst', () => {
    it('should BLOCK final attribution and actionPlan when mathematical residual exists', async () => {
      mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-14'),
        totalVariance: -2280.0,
        advertisingImpact: -980.0,
        returnsImpact: -620.0,
        inventoryImpact: -510.0,
        priceImpact: -310.0,
        otherImpact: 140.0,
        session: { findings: [] },
      });

      // Data has profit difference of -225.16 but factors sum to -2280
      const dailyRecords = [
        ...Array(7).fill(null).map((_, i) => ({
          date: new Date(`2026-03-0${i + 1}`),
          netProfit: 238.0,
        })),
        ...Array(7).fill(null).map((_, i) => ({
          date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
          netProfit: 205.8,
        })),
      ];
      mockPrisma.profitDaily.findMany.mockResolvedValue(dailyRecords);
      mockPrisma.searchTermMetricDaily.findFirst.mockResolvedValue({
        searchTerm: 'bathroom organizer',
        spend: 420.0,
      });
      mockPrisma.returnRecord.findMany.mockResolvedValue([
        { refundAmount: 620.0, orderItem: { sku: { skuCode: 'MTH-GREY-001' } } },
      ]);
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        fulfillableQuantity: 120,
        sku: { skuCode: 'MTH-GREEN-001' },
      });

      const res = await service.askAnalyst('为什么第11周利润骤降？', 'ws-1');

      // Gate Verification
      expect(res.status).toBe('RECONCILIATION_FAILED');
      expect(res.isReconciled).toBe(false);
      expect(res.actionPlan).toEqual([]); // Action recommendations MUST be blocked
      expect(res.waterfallSummary.isExactMatch).toBe(false);
      expect(res.answer).toContain('⚠️ **利润归因对账失败 (Reconciliation Gate Blocked)**');
      expect(res.answer).toContain('未解释差额 (Residual)');
      expect(res.reconciliationError).toBeDefined();
    });

    it('should BLOCK final attribution when Domain Tool (Returns) contradicts Ledger', async () => {
      // Waterfall expects returnsImpact: -620
      mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-14'),
        totalVariance: -2280.0,
        advertisingImpact: -980.0,
        returnsImpact: -620.0,
        inventoryImpact: -510.0,
        priceImpact: -310.0,
        otherImpact: 140.0,
        session: {
          findings: [
            { findingType: 'ADVERTISING', impactAmount: -980.0 },
            { findingType: 'RETURNS', impactAmount: -620.0 },
            { findingType: 'INVENTORY', impactAmount: -510.0 },
            { findingType: 'PRICING', impactAmount: -310.0 },
            { findingType: 'OTHER', impactAmount: 140.0 },
          ],
        },
      });

      // Daily profits match exactly: 4120.00 in Week 10, 1840.00 in Week 11 -> variance = -2280.00
      const w10Profits = [588.57, 588.57, 588.57, 588.57, 588.57, 588.57, 588.58]; // sum = 4120.00
      const w11Profits = [262.86, 262.86, 262.86, 262.86, 262.86, 262.86, 262.84]; // sum = 1840.00

      const dailyRecords = [
        ...w10Profits.map((p, i) => ({
          date: new Date(`2026-03-0${i + 1}`),
          netProfit: p,
        })),
        ...w11Profits.map((p, i) => ({
          date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
          netProfit: p,
        })),
      ];
      mockPrisma.profitDaily.findMany.mockResolvedValue(dailyRecords);
      mockPrisma.searchTermMetricDaily.findFirst.mockResolvedValue({
        searchTerm: 'bathroom organizer',
        spend: 420.0,
      });
      // Return tool returns 0 (Conflict: 0 vs -620)
      mockPrisma.returnRecord.findMany.mockResolvedValue([]);
      mockPrisma.profitDaily.aggregate.mockResolvedValue({ _sum: { returnLoss: 0 } });
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        fulfillableQuantity: 120,
        sku: { skuCode: 'MTH-GREEN-001' },
      });

      const res = await service.askAnalyst('为什么第11周利润骤降？', 'ws-1');

      // Gate must intercept Domain Tool vs Ledger conflict
      expect(res.status).toBe('RECONCILIATION_FAILED');
      expect(res.isReconciled).toBe(false);
      expect(res.actionPlan).toEqual([]);
      expect(res.answer).toContain('证据源冲突警告 (Domain Tool vs Ledger)');
      expect(res.reconciliationError?.isReturnConsistent).toBe(false);
    });

    it('should PASS gate and generate actionPlan when math and domain tools are fully reconciled', async () => {
      mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-14'),
        totalVariance: -2280.0,
        advertisingImpact: -980.0,
        returnsImpact: -620.0,
        inventoryImpact: -510.0,
        priceImpact: -310.0,
        otherImpact: 140.0,
        session: {
          findings: [
            { findingType: 'ADVERTISING', impactAmount: -980.0, evidenceJson: JSON.stringify({ spend: 420.0 }) },
            { findingType: 'RETURNS', impactAmount: -620.0, evidenceJson: JSON.stringify({ refundAmount: 620.0 }) },
            { findingType: 'INVENTORY', impactAmount: -510.0, evidenceJson: JSON.stringify({ rushAirFreightCost: 315.0 }) },
            { findingType: 'PRICING', impactAmount: -310.0, evidenceJson: JSON.stringify({ promotionalDiscount: 310.0 }) },
            { findingType: 'OTHER', impactAmount: 140.0, evidenceJson: JSON.stringify({ supplierRebate: 100.0, packagingSaving: 40.0 }) },
          ],
        },
      });

      // Perfect reconciliation: 4120.00 - 1840.00 = -2280.00 exactly to the cent
      const w10Profits = [588.57, 588.57, 588.57, 588.57, 588.57, 588.57, 588.58]; // sum = 4120.00
      const w11Profits = [262.86, 262.86, 262.86, 262.86, 262.86, 262.86, 262.84]; // sum = 1840.00

      const dailyRecords = [
        ...w10Profits.map((p, i) => ({
          date: new Date(`2026-03-0${i + 1}`),
          netProfit: p,
        })),
        ...w11Profits.map((p, i) => ({
          date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
          netProfit: p,
        })),
      ];
      mockPrisma.profitDaily.findMany.mockResolvedValue(dailyRecords);
      mockPrisma.searchTermMetricDaily.findFirst.mockResolvedValue({
        searchTerm: 'bathroom organizer',
        spend: 420.0,
      });
      // Return tool returns 620 in W11 matching -620 delta
      mockPrisma.returnRecord.findMany.mockResolvedValue([
        { returnDate: new Date('2026-03-10'), refundAmount: 620.0, orderItem: { sku: { skuCode: 'MTH-GREY-001' } } },
      ]);
      mockPrisma.inventoryBalance.findFirst.mockResolvedValue({
        fulfillableQuantity: 120,
        sku: { skuCode: 'MTH-GREEN-001' },
      });

      const res = await service.askAnalyst('为什么第11周利润骤降？', 'ws-1');

      // Gate Passed
      expect(res.status).toBe('RECONCILED');
      expect(res.isReconciled).toBe(true);
      expect(res.waterfallSummary.isExactMatch).toBe(true);
      expect(res.waterfallSummary.residual).toBe(0);
      expect(res.actionPlan.length).toBe(3);
      expect(res.answer).toContain('100% exact closure');

      // Truthfulness V2: Verify formal RecommendedAction binding
      for (const action of res.actionPlan) {
        expect(action.actionId).toBeDefined();
        expect(action.riskLevel).toBeDefined();
        expect(action.executionMode).toBe('APPROVAL_REQUIRED');
        expect(Array.isArray(action.evidenceIds)).toBe(true);
        expect(action.evidenceIds!.length).toBeGreaterThan(0);
        expect(action.sourceDiagnosisIds).toBeDefined();
        expect(action.expectedImpactFormula).toBeDefined();
      }

      // Truthfulness V2: Verify all tools strictly enforce scope: WORKSPACE & time bounds
      expect(res.toolExecutions.length).toBe(6);
      for (const trace of res.toolExecutions) {
        expect(trace.input).toHaveProperty('scope', 'WORKSPACE');
        expect(trace.tool).toBeDefined();
      }
      expect(res.toolExecutions[0].tool).toBe('query_profit_summary');
      expect(res.toolExecutions[1].tool).toBe('query_ad_metrics');
      expect(res.toolExecutions[2].tool).toBe('query_return_summary');
      expect(res.toolExecutions[3].tool).toBe('query_inventory_risk');
      expect(res.toolExecutions[4].tool).toBe('calculate_variance');
      expect(res.toolExecutions[5].tool).toBe('cross_domain_consistency_gate');
    });
  });
});
