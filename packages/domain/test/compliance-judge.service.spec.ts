import { ComplianceJudgeService } from '../src/compliance/compliance-judge.service';

describe('ComplianceJudgeService', () => {
  it('should pass compliant natural marble listing', () => {
    const result = ComplianceJudgeService.evaluateListing({
      title: 'POLEGAS Natural Marble Toothbrush Holder - Heavy Stone Base for Bathroom',
      bulletPoints: [
        '100% Real Marble: Handcrafted from natural stone, solid 3.57 lbs non-slip base.',
        '4 Functional Slots: 1 large slot for toothpaste, 3 slots for toothbrushes (1.5 inch diameter).',
        'Easy to Clean: Non-porous polished finish resists water spots.',
      ],
      description: 'Upgrade your bathroom decor with luxurious natural marble.',
    });

    expect(result.status).toBe('PASS');
    expect(result.riskLevel).toBe('LOW');
    expect(result.violations).toHaveLength(0);
  });

  it('should block unverified medical claims and ranking claims', () => {
    const result = ComplianceJudgeService.evaluateListing({
      title: '#1 Best Seller FDA Approved Antibacterial Marble Toothbrush Holder',
      bulletPoints: [
        'Cures all bathroom germs and fits all electric toothbrushes.',
      ],
    });

    expect(result.status).toBe('BLOCK');
    expect(result.riskLevel).toBe('HIGH');
    expect(result.violations.some((v) => v.ruleCode === 'POL-FDA-001')).toBe(true);
    expect(result.violations.some((v) => v.ruleCode === 'POL-RANK-002')).toBe(true);
  });

  it('should return INSUFFICIENT when title or bullet points are missing', () => {
    const result = ComplianceJudgeService.evaluateListing({
      title: '',
      bulletPoints: [],
    });

    expect(result.status).toBe('INSUFFICIENT');
    expect(result.riskLevel).toBe('MEDIUM');
  });
});
