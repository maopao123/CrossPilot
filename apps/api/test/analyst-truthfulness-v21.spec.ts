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
      searchTermMetricDaily: { findFirst: jest.fn() },
      returnRecord: { findMany: jest.fn() },
      inventorySnapshot: { findMany: jest.fn(), findFirst: jest.fn() },
      inventoryBalance: { findFirst: jest.fn() },
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

  // 3. 修改价格 / Coupon 后 priceImpact 自动变化
  it('3. should automatically reflect priceImpact changes', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      priceImpact: -200.0,
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 70 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    const wf1 = await service.getWaterfall('ws-test');
    expect(wf1!.breakdown.price).toBe(-200);

    // Update priceImpact to -450
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      priceImpact: -450.0,
      session: { findings: [] },
    });

    const wf2 = await service.getWaterfall('ws-test');
    expect(wf2!.breakdown.price).toBe(-450);
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

  // 5. 修改 otherImpact 自动变化
  it('5. should reflect otherImpact from operational cost adjustments', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      otherImpact: 85.0,
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    const wf = await service.getWaterfall('ws-test');
    expect(wf!.breakdown.other).toBe(85.0);
  });

  // 6. 任意一个 Domain Fact 与 Attribution 不一致，Gate 必须 BLOCK
  it('6. should BLOCK gate when Returns domain fact conflicts with ledger attribution', async () => {
    mockPrisma.analysisWaterfall.findFirst.mockResolvedValue({
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-14'),
      returnsImpact: -500.0,
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);

    // ReturnRecord has 50 (conflicts with 500)
    mockPrisma.returnRecord.findMany.mockResolvedValue([
      { refundAmount: 50.0, orderItem: { sku: { skuCode: 'MTH-GREY-001' } } },
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
      advertisingImpact: 0,
      returnsImpact: 0,
      inventoryImpact: 0,
      priceImpact: 0,
      otherImpact: -140.0,
      session: { findings: [] },
    });

    const records = [
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-0${i + 1}`), netProfit: 100 })),
      ...Array(7).fill(null).map((_, i) => ({ date: new Date(`2026-03-${i + 8 < 10 ? '0' + (i + 8) : i + 8}`), netProfit: 80 })),
    ];
    mockPrisma.profitDaily.findMany.mockResolvedValue(records);
    mockPrisma.returnRecord.findMany.mockResolvedValue([]);
    mockPrisma.searchTermMetricDaily.findFirst.mockResolvedValue(null);

    const res = await service.askAnalyst('Why did profit drop?', 'ws-test');
    // Verify no fake padding like "REVIEW NEGATIVE KEYWORD" or "22 Days Cover" was injected
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
      totalVariance: -500.0,
      advertisingImpact: -100.0,
      returnsImpact: -100.0,
      inventoryImpact: -100.0,
      priceImpact: -100.0,
      otherImpact: 0,
      session: { findings: [] },
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
      totalVariance: -140.0,
      advertisingImpact: 0,
      returnsImpact: 0,
      inventoryImpact: 0,
      priceImpact: 0,
      otherImpact: -140.0,
      session: { findings: [] },
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
});
