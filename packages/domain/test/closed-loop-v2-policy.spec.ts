import {
  evaluateSimulatorPolicy,
  DEFAULT_SIMULATOR_POLICY_LIMITS,
} from '../src/action-layer/index.js';

describe('CL-5: Closed-loop v2 Simulator Policy Guardrails', () => {
  const CAMPAIGN_A = 'camp_white';
  const CAMPAIGN_B = 'camp_green';

  describe('1. Action Magnitude & Limits', () => {
    it('allows a single decrease of 20% or less', () => {
      const result = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-01',
        currentBidCents: 100,
        initialBidCents: 100,
        percentage: 20,
        recent7DayClicks: 150,
      });

      expect(result.decision).toBe('ALLOW');
    });

    it('rejects a single decrease exceeding 20%', () => {
      const result = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-01',
        currentBidCents: 100,
        initialBidCents: 100,
        percentage: 25,
        recent7DayClicks: 150,
      });

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('SINGLE_DECREASE_EXCEEDED');
    });

    it('rejects when cumulative reduction exceeds 30% from initial bid', () => {
      // Initial bid = 100¢. Already decreased to 80¢ (20% reduction).
      // A further 15% reduction would bring bid to 68¢ (32% cumulative reduction > 30% cap).
      const result = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-10',
        currentBidCents: 80,
        initialBidCents: 100,
        percentage: 15,
        recent7DayClicks: 150,
      });

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('CUMULATIVE_LIMIT_EXCEEDED');
    });
  });

  describe('2. Cooldown Period (3 Days)', () => {
    it('rejects an action on D+1 or D+2 on the same campaign', () => {
      const actionHistory = [
        { campaignId: CAMPAIGN_A, actionType: 'DECREASE_BID', date: '2026-09-01', percentage: 10 },
      ];

      // D+1 (2026-09-02) -> 1 day elapsed
      const resultD1 = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-02',
        currentBidCents: 90,
        initialBidCents: 100,
        percentage: 10,
        recent7DayClicks: 150,
        actionHistory,
      });
      expect(resultD1.decision).toBe('REJECT');
      expect(resultD1.reason).toContain('COOLDOWN_ACTIVE');

      // D+2 (2026-09-03) -> 2 days elapsed
      const resultD2 = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-03',
        currentBidCents: 90,
        initialBidCents: 100,
        percentage: 10,
        recent7DayClicks: 150,
        actionHistory,
      });
      expect(resultD2.decision).toBe('REJECT');
      expect(resultD2.reason).toContain('COOLDOWN_ACTIVE');
    });

    it('allows an action on D+3 (3 days elapsed) or on a different campaign', () => {
      const actionHistory = [
        { campaignId: CAMPAIGN_A, actionType: 'DECREASE_BID', date: '2026-09-01', percentage: 10 },
      ];

      // D+3 (2026-09-04) on Campaign A
      const resultD3 = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-04',
        currentBidCents: 90,
        initialBidCents: 100,
        percentage: 10,
        recent7DayClicks: 150,
        actionHistory,
      });
      expect(resultD3.decision).toBe('ALLOW');

      // D+1 on different campaign B
      const resultB = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_B,
        currentDate: '2026-09-02',
        currentBidCents: 120,
        initialBidCents: 120,
        percentage: 10,
        recent7DayClicks: 150,
        actionHistory,
      });
      expect(resultB.decision).toBe('ALLOW');
    });
  });

  describe('3. Daily Quota (Max 3 Actions/Day)', () => {
    it('rejects 4th action on the same date', () => {
      const actionHistory = [
        { campaignId: 'c1', actionType: 'DECREASE_BID', date: '2026-09-05' },
        { campaignId: 'c2', actionType: 'DECREASE_BID', date: '2026-09-05' },
        { campaignId: 'c3', actionType: 'DECREASE_BID', date: '2026-09-05' },
      ];

      const result = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: 'c4',
        currentDate: '2026-09-05',
        currentBidCents: 100,
        initialBidCents: 100,
        percentage: 10,
        recent7DayClicks: 150,
        actionHistory,
      });

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('DAILY_LIMIT_EXCEEDED');
    });
  });

  describe('4. Human Escalation for STOP_CAMPAIGN', () => {
    it('escalates STOP_CAMPAIGN to REQUIRE_MANUAL_APPROVAL', () => {
      const result = evaluateSimulatorPolicy({
        actionType: 'STOP_CAMPAIGN',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-01',
        currentBidCents: 100,
        initialBidCents: 100,
      });

      expect(result.decision).toBe('REQUIRE_MANUAL_APPROVAL');
      expect(result.reason).toContain('human approval');
    });
  });

  describe('5. Data Quality and Bid Floor Constraints', () => {
    it('rejects if recent 7-day clicks < 100', () => {
      const result = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-01',
        currentBidCents: 100,
        initialBidCents: 100,
        percentage: 10,
        recent7DayClicks: 65, // Below 100
      });

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('DATA_THRESHOLD_UNMET');
    });

    it('rejects if proposed bid falls below 20 cents', () => {
      const result = evaluateSimulatorPolicy({
        actionType: 'DECREASE_BID',
        campaignId: CAMPAIGN_A,
        currentDate: '2026-09-01',
        currentBidCents: 22,
        initialBidCents: 25,
        percentage: 20, // 22 * 0.8 = 18 cents < 20 cents floor
        recent7DayClicks: 150,
      });

      expect(result.decision).toBe('REJECT');
      expect(result.reason).toContain('BID_FLOOR_EXCEEDED');
    });
  });
});
