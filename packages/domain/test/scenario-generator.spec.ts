import { ScenarioGeneratorService, CORE_BUSINESS_EVENTS } from '../src/scenario/scenario-generator';

describe('ScenarioGeneratorService', () => {
  it('should generate 90 days of deterministic metrics and all 10 core business events', () => {
    const scenario = ScenarioGeneratorService.generate90Days();

    expect(scenario.days).toHaveLength(90);
    expect(scenario.events).toHaveLength(10);
    expect(CORE_BUSINESS_EVENTS.map((e) => e.code)).toEqual([
      'E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10',
    ]);

    // Verify Green SKU reorder warning in Week 8 (around Day 52)
    const greenDay52 = scenario.skuMetrics.find((m) => m.day === 52 && m.skuCode === 'MTH-GREEN-001');
    expect(greenDay52).toBeDefined();
    expect(greenDay52!.daysCover).toBeLessThan(15);

    // Verify Week 11 waterfall attribution matches Section 286 exactly
    const wf = scenario.waterfallWeek11;
    expect(wf.variance).toBe(-2280);
    expect(wf.breakdown.advertising).toBe(-980);
    expect(wf.breakdown.returns).toBe(-620);
    expect(wf.breakdown.inventory).toBe(-510);
    expect(wf.breakdown.price).toBe(-310);
    expect(wf.breakdown.other).toBe(140);
    expect(
      wf.breakdown.advertising +
      wf.breakdown.returns +
      wf.breakdown.inventory +
      wf.breakdown.price +
      wf.breakdown.other
    ).toBe(-2280);
  });
});
