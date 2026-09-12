import fs from 'fs';
import path from 'path';
import { OpportunityScoreEngine } from '../src/research/opportunity-score.engine';
import { ExplanationNumericGroundingValidator } from '../src/research/explanation-numeric-validator';
import { RawResearchInputs } from '../src/research/opportunity-score.engine';

describe('Real Case Regression Test (marble toothbrush holder)', () => {
  const fixturePath = path.join(__dirname, 'fixtures/real-marble-case.fixture.json');
  const fixtureData: RawResearchInputs = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  it('reproduces exact baseline score 58 and all hardened invariants', () => {
    const opp = OpportunityScoreEngine.evaluate(fixtureData);

    // 1. Overall Score & Invariants
    expect(opp.overallScore).toBe(58);
    expect(opp.scoreVersion).toBe('v1.0.0');
    expect(opp.scoreConfigVersion).toBe('v1.0.0');
    expect(opp.methodology).toBe('HEURISTIC');
    expect(opp.calibrationStatus).toBe('UNCALIBRATED');
    expect(opp.decisionScope).toBe('KEYWORD_CATEGORY_OPPORTUNITY');
    expect(opp.evidenceStatus).toBe('SUFFICIENT');
    expect(opp.confidence).toBe('HIGH');
    expect(opp.confidenceScore).toBe(0.85);

    // 2. Six Normalized Signals
    expect(opp.signals.demand.normalizedScore).toBe(39);
    expect(opp.signals.demand.weight).toBe(0.25);
    expect(opp.signals.demand.contribution).toBe(9.75);
    expect(opp.signals.demand.scope).toBe('KEYWORD_MARKET');

    expect(opp.signals.competition.normalizedScore).toBe(35);
    expect(opp.signals.competition.weight).toBe(0.20);
    expect(opp.signals.competition.contribution).toBe(7.00);
    expect(opp.signals.competition.scope).toBe('TOP_PRODUCTS');

    expect(opp.signals.commercial.normalizedScore).toBe(65);
    expect(opp.signals.commercial.weight).toBe(0.15);
    expect(opp.signals.commercial.contribution).toBe(9.75);
    expect(opp.signals.commercial.scope).toBe('TOP_PRODUCTS');

    expect(opp.signals.trend.normalizedScore).toBe(75);
    expect(opp.signals.trend.weight).toBe(0.15);
    expect(opp.signals.trend.contribution).toBe(11.25);
    expect(opp.signals.trend.scope).toBe('REPRESENTATIVE_PRODUCT');

    expect(opp.signals.reviewHealth.normalizedScore).toBe(75);
    expect(opp.signals.reviewHealth.weight).toBe(0.10);
    expect(opp.signals.reviewHealth.contribution).toBe(7.50);
    expect(opp.signals.reviewHealth.scope).toBe('REPRESENTATIVE_PRODUCT');

    expect(opp.signals.voc.normalizedScore).toBe(87);
    expect(opp.signals.voc.weight).toBe(0.15);
    expect(opp.signals.voc.contribution).toBe(13.05);
    expect(opp.signals.voc.scope).toBe('CATEGORY_EXTERNAL_VOC');

    // 3. Cost Budget: Estimated USD must be null
    expect(opp.costBudget.estimatedCostUsd).toBeNull();
    expect(opp.costBudget.xydcCredits).toBeGreaterThanOrEqual(0);
    expect(opp.costBudget.firecrawlCredits).toBeGreaterThanOrEqual(0);

    // 4. Grounding Validator: All facts and recommendations must be grounded (no 3.2cm)
    const validation = ExplanationNumericGroundingValidator.validate(opp);
    expect(validation.valid).toBe(true);
    expect(validation.violations).toHaveLength(0);

    // 5. Scope Disclosure
    expect(opp.scopeDisclosure.decisionScope).toBe('KEYWORD_CATEGORY_OPPORTUNITY');
    expect(opp.scopeDisclosure.representativeAsin).toBe('B0BFGNSXYL');
    expect(opp.scopeDisclosure.vocScope).toBe('CATEGORY');
    expect(opp.scopeDisclosure.vocContentKind).toBe('SEARCH_SNIPPET');
    expect(opp.scopeDisclosure.vocSampleSize).toBe(25);
  });
});
