import { ErrorCodes } from '@crosspilot/shared';
import {
  ActionLayerError,
  assessRisk,
  createDefaultMockRegistry,
  executeMockAction,
  inferActionType,
  planFromRecommendation,
  validateActionPayload,
} from '../src/index.js';

describe('V9.3 action planner', () => {
  it('maps an ACOS / bid recommendation to DECREASE_BID 20%', () => {
    const draft = planFromRecommendation(
      'DECREASE_KEYWORD_BID',
      'ACOS increased; decrease keyword bid 20%',
      { campaignId: 'camp-1', keyword: 'marble holder' },
    );
    expect(draft.actionType).toBe('DECREASE_BID');
    expect(draft.parameters.percentage).toBe(20);
    expect(draft.target.campaignId).toBe('camp-1');
    expect(draft.needApproval).toBe(true);
    expect(draft.riskLevel).toBe('medium');
  });

  it('refuses to invent an action_type outside the whitelist', () => {
    expect(() => inferActionType('IMPROVE_LISTING', 'Widen the handle hole')).toThrow(ActionLayerError);
    try {
      inferActionType('IMPROVE_LISTING', 'Widen the handle hole');
    } catch (err) {
      expect((err as ActionLayerError).code).toBe(ErrorCodes.ACTION_PLANNER_UNSUPPORTED);
    }
  });

  it('requires an explicit campaign target for DECREASE_BID', () => {
    expect(() =>
      planFromRecommendation('Lower bid', 'ACOS spike', { campaignId: '' }),
    ).toThrow(/campaignId/);
  });
});

describe('V9.3 risk validator', () => {
  it('marks DELETE_LISTING and STOP_CAMPAIGN as high risk', () => {
    expect(assessRisk('DELETE_LISTING').risk).toBe('high');
    expect(assessRisk('STOP_CAMPAIGN').needApproval).toBe(true);
    expect(assessRisk('CHANGE_PRICE', { percentage: 25 }).risk).toBe('high');
    expect(assessRisk('CHANGE_PRICE', { percentage: 10 }).risk).toBe('medium');
    expect(assessRisk('GENERATE_REPORT').needApproval).toBe(false);
    expect(assessRisk('GENERATE_REPORT').risk).toBe('low');
  });

  it('rejects unknown types and incomplete schemas', () => {
    expect(() => validateActionPayload('DECREASE_BID', {}, { percentage: 20 })).toThrow(
      ActionLayerError,
    );
    expect(() =>
      validateActionPayload('DECREASE_BID', { campaignId: 'c1' }, { percentage: 90 }),
    ).toThrow(/percentage/);
  });
});

describe('V9.3 mock executor', () => {
  const registry = createDefaultMockRegistry();

  it('returns a fake success for DECREASE_BID', async () => {
    const result = await executeMockAction(registry, {
      actionType: 'DECREASE_BID',
      target: { campaignId: 'c1', keyword: 'broad' },
      parameters: { percentage: 20 },
    });
    expect(result.status).toBe('SUCCESS');
    expect(String(result.output.message)).toMatch(/Mock 已将竞价下调 20%/);
  });

  it('simulates failure without retry', async () => {
    const result = await executeMockAction(registry, {
      actionType: 'DECREASE_BID',
      target: { campaignId: 'c1' },
      parameters: { percentage: 20, mockOutcome: 'fail' },
    });
    expect(result.status).toBe('FAILED');
    expect(result.attempts).toHaveLength(1);
  });

  it('simulates timeout then retry to success', async () => {
    const result = await executeMockAction(registry, {
      actionType: 'DECREASE_BID',
      target: { campaignId: 'c1' },
      parameters: { percentage: 20, mockOutcome: 'timeout' },
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.attempts.length).toBeGreaterThan(1);
    expect(result.output.retried).toBe(true);
  });
});
