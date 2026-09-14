/**
 * Closed-loop v2 Simulator Autopilot Policy Guardrails (CL-5)
 *
 * Enforces strict safety limits on automated actions:
 * - Single decrease <= 20%
 * - Cumulative decrease <= 30% from initial bid
 * - Cooldown period of 3 completed simulation days between actions on the same campaign
 * - Daily quota of <= 3 automated actions per run
 * - Minimum 100 clicks in past 7 days
 * - STOP_CAMPAIGN always requires manual human approval
 */

export interface SimulatorPolicyLimits {
  /** Maximum bid reduction percentage in a single action (e.g. 0.20 = 20%) */
  maxSingleDecreasePct: number;
  /** Maximum cumulative bid reduction percentage relative to baseline bid (e.g. 0.30 = 30%) */
  maxCumulativeDecreasePct: number;
  /** Minimum days elapsed between automated actions on the same campaign (default: 3 days) */
  cooldownDays: number;
  /** Maximum automated actions across the run in a single day (default: 3) */
  maxActionsPerDay: number;
  /** Minimum ad clicks in past 7 days required for auto-approval (default: 100) */
  min7DayClicks: number;
  /** Minimum bid floor in cents (default: 20 cents) */
  minBidFloorCents: number;
}

export const DEFAULT_SIMULATOR_POLICY_LIMITS: SimulatorPolicyLimits = {
  maxSingleDecreasePct: 0.2,
  maxCumulativeDecreasePct: 0.3,
  cooldownDays: 3,
  maxActionsPerDay: 3,
  min7DayClicks: 100,
  minBidFloorCents: 20,
};

export interface PolicyActionRecord {
  campaignId: string;
  actionType: string;
  date: string; // YYYY-MM-DD
  percentage?: number;
}

export interface PolicyEvaluationInput {
  actionType: 'DECREASE_BID' | 'STOP_CAMPAIGN' | string;
  campaignId: string;
  currentDate: string; // YYYY-MM-DD
  currentBidCents: number;
  initialBidCents: number;
  percentage?: number; // e.g. 20 for 20%
  recent7DayClicks?: number;
  actionHistory?: PolicyActionRecord[];
  policyLimits?: Partial<SimulatorPolicyLimits>;
}

export interface PolicyEvaluationResult {
  decision: 'ALLOW' | 'REJECT' | 'REQUIRE_MANUAL_APPROVAL';
  reason: string;
}

function parseDateDays(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / (24 * 60 * 60 * 1000));
}

export function evaluateSimulatorPolicy(input: PolicyEvaluationInput): PolicyEvaluationResult {
  const limits = { ...DEFAULT_SIMULATOR_POLICY_LIMITS, ...input.policyLimits };

  // 1. STOP_CAMPAIGN must always be escalated to human approval
  if (input.actionType === 'STOP_CAMPAIGN') {
    return {
      decision: 'REQUIRE_MANUAL_APPROVAL',
      reason: 'STOP_CAMPAIGN requires explicit human approval in Autopilot v2',
    };
  }

  // 2. Only DECREASE_BID is eligible for automated approval
  if (input.actionType !== 'DECREASE_BID') {
    return {
      decision: 'REJECT',
      reason: `Action type ${input.actionType} is not supported for automated execution`,
    };
  }

  const percentage = input.percentage ?? 0;
  if (percentage <= 0) {
    return {
      decision: 'REJECT',
      reason: 'Decrease percentage must be greater than 0%',
    };
  }

  // 3. Single decrease limit
  if (percentage > limits.maxSingleDecreasePct * 100) {
    return {
      decision: 'REJECT',
      reason: `SINGLE_DECREASE_EXCEEDED: Single decrease of ${percentage}% exceeds maximum limit of ${(limits.maxSingleDecreasePct * 100).toFixed(0)}%`,
    };
  }

  const history = input.actionHistory ?? [];

  // 4. Daily action quota across the run
  const actionsToday = history.filter((a) => a.date === input.currentDate);
  if (actionsToday.length >= limits.maxActionsPerDay) {
    return {
      decision: 'REJECT',
      reason: `DAILY_LIMIT_EXCEEDED: Run has reached maximum limit of ${limits.maxActionsPerDay} actions for ${input.currentDate}`,
    };
  }

  // 5. Cooldown check on the same campaign
  const campaignHistory = history.filter((a) => a.campaignId === input.campaignId);
  if (campaignHistory.length > 0) {
    const currentDayVal = parseDateDays(input.currentDate);
    for (const pastAction of campaignHistory) {
      const pastDayVal = parseDateDays(pastAction.date);
      const elapsedDays = currentDayVal - pastDayVal;
      if (elapsedDays < limits.cooldownDays && elapsedDays >= 0) {
        return {
          decision: 'REJECT',
          reason: `COOLDOWN_ACTIVE: Campaign ${input.campaignId} had an action on ${pastAction.date} (${elapsedDays} days ago); minimum cooldown is ${limits.cooldownDays} days`,
        };
      }
    }
  }

  // 6. Data threshold check: must have sufficient data (clicks >= min7DayClicks)
  if (input.recent7DayClicks === undefined || input.recent7DayClicks === null || input.recent7DayClicks < limits.min7DayClicks) {
    return {
      decision: 'REJECT',
      reason: `DATA_THRESHOLD_UNMET: Recent 7-day clicks (${input.recent7DayClicks ?? 'missing'}) below minimum required (${limits.min7DayClicks})`,
    };
  }

  // 7. Cumulative reduction check
  const proposedBidCents = Math.round(input.currentBidCents * (1 - percentage / 100));
  const cumulativeReductionCents = input.initialBidCents - proposedBidCents;
  const cumulativeRatio = cumulativeReductionCents / (input.initialBidCents || 1);

  if (cumulativeRatio > limits.maxCumulativeDecreasePct) {
    return {
      decision: 'REJECT',
      reason: `CUMULATIVE_LIMIT_EXCEEDED: Proposed bid (${proposedBidCents}¢) represents a cumulative ${(cumulativeRatio * 100).toFixed(1)}% reduction from initial bid (${input.initialBidCents}¢), exceeding the ${(limits.maxCumulativeDecreasePct * 100).toFixed(0)}% cap`,
    };
  }

  // 8. Bid floor check
  if (proposedBidCents < limits.minBidFloorCents) {
    return {
      decision: 'REJECT',
      reason: `BID_FLOOR_EXCEEDED: Proposed bid (${proposedBidCents}¢) is below the minimum floor of ${limits.minBidFloorCents}¢`,
    };
  }

  return {
    decision: 'ALLOW',
    reason: `Automated bid decrease of ${percentage}% approved under Policy limits`,
  };
}
