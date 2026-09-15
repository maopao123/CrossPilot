import { AnalystService } from '../src/modules/analyst/analyst.service';
import { AnalystTraceEmitter } from '../src/modules/analyst/analyst-trace.emitter';

describe('Analyst Truthfulness V2.1 Test Suite', () => {
  let service: AnalystService;
  let traceEmitter: AnalystTraceEmitter;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      analysisWaterfall: { findFirst: jest.fn() },
      profitDaily: { findMany: jest.fn(), aggregate: jest.fn() },
      searchTermMetricDaily: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      returnRecord: { findMany: jest.fn() },
      inventorySnapshot: { findMany: jest.fn(), findFirst: jest.fn() },
      inventoryBalance: { findFirst: jest.fn() },
      sku: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      review: { findMany: jest.fn().mockResolvedValue([]) },
      competitor: { findMany: jest.fn().mockResolvedValue([]) },
    };

    traceEmitter = new AnalystTraceEmitter();
    service = new AnalystService(mockPrisma, traceEmitter);
  });

  // 1. 修改 Ads 原始事实后 advertisingImpact 自动变化
  it('1. should automatically update advertisingImpact when raw adsCost changes', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      totalVariance: -250.0,
      advertisingImpact: 0,
      returnsImpact: 0,
      inventoryImpact: 0,
      priceImpact: 0,
      otherImpact: 0,
      session: { findings: [] },
    });

    // Baseline W10 adsCost: 100, W11 adsCost: 350 -> delta = 250 -> impact = -250
    const records1 = [
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-0${i + 1}`),
        netProfit: 100,
        adsCost: 100 / 7,
      })),
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
        netProfit: 75,
        adsCost: 350 / 7,
      })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records1);

    const wf1 = await service.getWaterfall('ws-test');
    expect(wf1!.breakdown.advertising).toBe(-250);

    // Now change W11 adsCost to 500 -> delta = 400 -> impact = -400
    const records2 = [
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-0${i + 1}`),
        netProfit: 100,
        adsCost: 100 / 7,
      })),
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
        netProfit: 75,
        adsCost: 500 / 7,
      })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records2);

    const wf2 = await service.getWaterfall('ws-test');
    expect(wf2!.breakdown.advertising).toBe(-400);
  });

  // 2. 修改 ReturnRecord / ProfitDaily 后 returnsImpact 自动变化
  it('2. should automatically update returnsImpact when raw returnLoss changes', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      totalVariance: -150.0,
      session: { findings: [] },
    });

    // Baseline W10 returnLoss: 50, W11 returnLoss: 200 -> delta = 150 -> impact = -150
    const records1 = [
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-0${i + 1}`),
        netProfit: 100,
        returnLoss: 50 / 7,
      })),
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
        netProfit: 80,
        returnLoss: 200 / 7,
      })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records1);

    const wf1 = await service.getWaterfall('ws-test');
    expect(wf1!.breakdown.returns).toBe(-150);

    // Change W11 returnLoss to 350 -> delta = 300 -> impact = -300
    const records2 = [
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-0${i + 1}`),
        netProfit: 100,
        returnLoss: 50 / 7,
      })),
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
        netProfit: 80,
        returnLoss: 350 / 7,
      })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records2);

    const wf2 = await service.getWaterfall('ws-test');
    expect(wf2!.breakdown.returns).toBe(-300);
  });

  // 3. 价格与折扣事实推导 (无 waterfall.priceImpact fallback)
  it('3. should derive priceImpact from raw pricing facts and not fallback to waterfall', async () => {
    // Session has no pricing findings, waterfall has legacy priceImpact: -999.0
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      priceImpact: -999.0, // Should NOT be read as truth fallback
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 70 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    const wf1 = await service.getWaterfall('ws-test');
    expect(wf1!.breakdown.price).toBe(0.0); // Zero waterfall fallback!

    // When pricing finding / discount evidence is added:
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          {
            findingType: 'PRICING',
            impactAmount: -310.0,
            evidenceJson: JSON.stringify({ promotionalDiscount: 310.0 }),
          },
        ],
      },
    });

    const wf2 = await service.getWaterfall('ws-test');
    expect(wf2!.breakdown.price).toBe(-310.0);
  });

  // 4. 修改库存事件后 inventoryImpact 自动变化
  it('4. should automatically update inventoryImpact when freight and stockout facts change', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: { findings: [] },
    });

    // deltaFreight = 210
    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100, otherCosts: 0 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 70, otherCosts: 30 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);
    mockPrisma.inventorySnapshot.findMany.mockResolvedValue([]);

    const wf1 = await service.getWaterfall('ws-test');
    expect(wf1!.breakdown.inventory).toBe(-210);

    // With 2 stockouts detected
    mockPrisma.inventorySnapshot.findMany.mockResolvedValue([
      { skuId: 'sku-1', fulfillable: 0 },
      { skuId: 'sku-1', fulfillable: 0 },
    ]);
    const wf2 = await service.getWaterfall('ws-test');
    expect(wf2!.breakdown.inventory).toBeLessThan(-210);
  });

  // 5. 成本与供应商返利事实推导 (无 waterfall.otherImpact fallback)
  it('5. should derive otherImpact from supplier/operational facts and not fallback to waterfall', async () => {
    // Session has no other findings, waterfall has legacy otherImpact: 999.0
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      otherImpact: 999.0, // Should NOT be read as truth fallback
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    const wf1 = await service.getWaterfall('ws-test');
    expect(wf1!.breakdown.other).toBe(0.0); // Zero waterfall fallback!

    // When operational cost / supplier rebate evidence is added:
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          {
            findingType: 'OTHER',
            impactAmount: 140.0,
            evidenceJson: JSON.stringify({ supplierRebate: 100.0, packagingSaving: 40.0 }),
          },
        ],
      },
    });

    const wf2 = await service.getWaterfall('ws-test');
    expect(wf2!.breakdown.other).toBe(140.0);
  });

  // 6. 任意一个 Domain Fact 与 Attribution 不一致，Gate 必须 BLOCK
  it('6. should BLOCK gate when Returns domain fact conflicts with ledger attribution', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          { findingType: 'RETURNS', impactAmount: -500.0 },
        ],
      },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100, returnLoss: 0 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80, returnLoss: 500 / 7 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    // ReturnRecord has 50 in W11 (conflicts with 500 delta)
    mockPrisma.returnRecord.findMany.mockResolvedValue([
      { returnDate: new Date('2026-03-10'), refundAmount: 50.0, orderItem: { sku: { skuCode: 'MTH-GREY-001' } } },
    ]);

    const res = await service.askAnalyst('Why did profit drop?', 'ws-test');
    expect(res.status).toBe('RECONCILIATION_FAILED');
    expect(res.isReconciled).toBe(false);
    expect(res.actionPlan).toEqual([]);
    expect(res.reconciliationError?.checks.find((c: any) => c.domain === 'RETURNS')?.status).toBe('FAIL');
  });

  // 7. 只有一个可信信号时，只生成一个 Action (无 fallback padding)
  it('7. should not pad actionPlan with fallback actions when fewer actions are generated', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      totalVariance: -140.0,
      session: {
        findings: [
          { findingType: 'OTHER', impactAmount: -140.0 },
        ],
      },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);
    mockPrisma.returnRecord.findMany.mockResolvedValue([]);
    mockPrisma.searchTermMetricDaily.findFirst.mockResolvedValue(null);

    const res = await service.askAnalyst('Why did profit drop?', 'ws-test');
    for (const act of res.actionPlan) {
      expect(act.target).not.toContain('22 Days Cover');
      expect(act.action).not.toContain('wasteSpend * 4');
    }
  });

  // 8. 没有足够 Evidence 时 actionPlan = []
  it('8. should return strictly empty actionPlan = [] when reconciliation gate fails', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          { findingType: 'ADVERTISING', impactAmount: -100.0 },
          { findingType: 'RETURNS', impactAmount: -100.0 },
          { findingType: 'INVENTORY', impactAmount: -100.0 },
          { findingType: 'PRICING', impactAmount: -100.0 },
        ],
      },
    });

    // Ledgers don't reconcile: actual variance is -140, factors sum to -400 (residual = 260)
    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    const res = await service.askAnalyst('Why did profit drop?', 'ws-test');
    expect(res.status).toBe('RECONCILIATION_FAILED');
    expect(res.actionPlan).toEqual([]);
  });

  // 9. 同一个 executionId 下 Final Status / Gate / Trace / Action Count 完全一致
  it('9. should ensure exact consistency between execution response and emitted trace events', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          { findingType: 'OTHER', impactAmount: -140.0 },
        ],
      },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);
    mockPrisma.returnRecord.findMany.mockResolvedValue([]);

    const executionId = 'exec-test-truth-v21';
    const res = await service.askAnalyst('Why did profit drop?', 'ws-test', executionId);

    expect(res.executionId).toBe(executionId);

    const events = traceEmitter.getEvents(executionId);
    expect(events.length).toBeGreaterThan(0);

    const startEvent = events.find((e) => e.type === 'TASK_START');
    expect(startEvent).toBeDefined();
    expect(startEvent?.executionId).toBe(executionId);

    const completeEvent = events.find((e) => e.type === 'TASK_COMPLETE');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.payload.gateStatus).toBe(res.status);
    expect(completeEvent?.payload.recommendationsCount).toBe(res.actionPlan.length);
  });

  // 10. 六维 Gate 必须使用两个完全独立的计算器进行对比，杜绝自比
  it('10. should have independent non-self calculations in all 6 domain checks', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          { findingType: 'ADVERTISING', impactAmount: -50.0, evidenceJson: JSON.stringify({ spend: 50 }) },
          { findingType: 'RETURNS', impactAmount: -40.0, evidenceJson: JSON.stringify({ refundAmount: 40 }) },
          { findingType: 'INVENTORY', impactAmount: -30.0, evidenceJson: JSON.stringify({ rushAirFreightCost: 30 }) },
          { findingType: 'PRICING', impactAmount: -20.0, evidenceJson: JSON.stringify({ promotionalDiscount: 20 }) },
          { findingType: 'OTHER', impactAmount: 0.0, evidenceJson: JSON.stringify({}) },
        ],
      },
    });

    // Sum of factors: -50 - 40 - 30 - 20 = -140.0
    // Previous profit: 700.0, Current profit: 560.0 -> totalVariance: -140.0
    const records = [
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-0${i + 1}`),
        netProfit: 100,
        adsCost: 0,
        returnLoss: 0,
        otherCosts: 0,
      })),
      ...Array(7).fill(null).map((_, i) => ({
        date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`),
        netProfit: 80,
        adsCost: 50 / 7,
        returnLoss: 40 / 7,
        otherCosts: 30 / 7,
      })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    // Return records matching -40 delta
    mockPrisma.returnRecord.findMany.mockResolvedValue([
      { returnDate: new Date('2026-03-10'), refundAmount: 40.0, orderItem: { sku: { skuCode: 'SKU-A' } } },
    ]);

    const res = await service.askAnalyst('Analyze profit variance', 'ws-test');
    expect(res.status).toBe('RECONCILED');

    const checks = (res.reconciliation?.checks || res.reconciliationError?.checks) as any[];
    expect(checks).toBeDefined();
    expect(checks.length).toBe(6);

    const domains = checks.map((c) => c.domain);
    expect(domains).toContain('MATH');
    expect(domains).toContain('ADVERTISING');
    expect(domains).toContain('RETURNS');
    expect(domains).toContain('INVENTORY');
    expect(domains).toContain('PRICE');
    expect(domains).toContain('COST');

    for (const check of checks) {
      expect(check).toHaveProperty('attributionValue');
      expect(check).toHaveProperty('domainFactCalculatedValue');
      expect(check).toHaveProperty('difference');
      expect(check).toHaveProperty('tolerance');
      expect(check).toHaveProperty('status');
      expect(check.evidenceIds.length).toBeGreaterThan(0);
    }
  });

  // 11. Returns 域必须按 W10 与 W11 分割计算 Delta，而非累加 14 天总额
  it('11. should partition ReturnRecords by W10 and W11 to compute returns delta rather than 14-day total', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          { findingType: 'RETURNS', impactAmount: -60.0 },
        ],
      },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100, returnLoss: 20 / 7 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80, returnLoss: 80 / 7 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    // W10 return: 20, W11 return: 80 -> Delta = -(80 - 20) = -60. Total 14-day would be 100!
    mockPrisma.returnRecord.findMany.mockResolvedValue([
      { returnDate: new Date('2026-03-03'), refundAmount: 20.0, orderItem: { sku: { skuCode: 'SKU-TEST' } } },
      { returnDate: new Date('2026-03-10'), refundAmount: 80.0, orderItem: { sku: { skuCode: 'SKU-TEST' } } },
    ]);

    const res = await service.askAnalyst('Returns audit', 'ws-test');
    const returnCheck = (res.reconciliation?.checks || res.reconciliationError?.checks)?.find(
      (c: any) => c.domain === 'RETURNS',
    );

    expect(returnCheck).toBeDefined();
    // domainFactCalculatedValue should be -60.0 (delta), NOT -100.0 (14-day sum)
    expect(returnCheck.domainFactCalculatedValue).toBe(-60.0);
    expect(returnCheck.attributionValue).toBe(-60.0);
    expect(returnCheck.status).toBe('PASS');
  });

  // 12. 动态加载 workspace SKU，不依赖硬编码 MTH 牙刷
  it('12. should dynamically discover workspace SKUs without hardcoded MTH fallbacks', async () => {
    mockPrisma.sku.findMany.mockResolvedValue([
      { skuCode: 'SHOE-ORG-001', product: { name: 'Running Shoes' } },
      { skuCode: 'SHOE-ORG-002', product: { name: 'Walking Shoes' } },
    ]);

    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    const res = await service.askAnalyst('Test dynamic skus', 'ws-test');
    expect(res.scopeDescription).toContain('SHOE-ORG-001');
    expect(res.scopeDescription).toContain('SHOE-ORG-002');
    expect(res.scopeDescription).not.toContain('Carrara White');
  });

  // 13. expectedImpactEstimate 中的假设计算必须明确标明为 Heuristic Assumption
  it('13. should mark expectedImpactEstimate assumptions as heuristic assumptions', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      session: {
        findings: [
          { findingType: 'ADVERTISING', impactAmount: -100.0 },
          { findingType: 'RETURNS', impactAmount: 0.0 },
          { findingType: 'INVENTORY', impactAmount: 0.0 },
          { findingType: 'PRICING', impactAmount: 0.0 },
          { findingType: 'OTHER', impactAmount: 0.0 },
        ],
      },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100, adsCost: 0 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 85.714, adsCost: 100 / 7 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);
    mockPrisma.returnRecord.findMany.mockResolvedValue([]);
    mockPrisma.searchTermMetricDaily.findFirst.mockResolvedValue({
      searchTerm: 'waste keyword',
      spend: 100.0,
      acos: 0.95,
    });

    const res = await service.askAnalyst('Check heuristic assumptions', 'ws-test');
    if (res.actionPlan.length > 0) {
      for (const action of res.actionPlan) {
        if (action.expectedImpactEstimate) {
          expect(action.expectedImpactEstimate.assumptions.some((a) => a.includes('Heuristic Assumption'))).toBe(true);
        }
      }
    }
  });
});
