import { createHash } from 'crypto';
import {
  V2Config,
  V2WorldState,
  createDefaultV2Config,
  createInitialV2WorldState,
} from './types.js';
import { simulateV2Day, V2DayOutput, V2ExternalEvent } from './world-engine.js';
import {
  generateLedgerEntries,
  summarizeDailyProfit,
  V2LedgerEntry,
  V2ProfitSummary,
} from './finance-ledger.js';

export type ScenarioPartition = 'train' | 'held-out';

export interface ScenarioDefinition {
  id: string;
  name: string;
  partition: ScenarioPartition;
  description: string;
  externalEvents: V2ExternalEvent[];
  configOverride?: Partial<V2Config>;
}

export interface SimulationExperimentManifest {
  manifestVersion: string;
  policyVersion: string;
  evaluationVersion: string;
  seeds: number[];
  scenarios: ScenarioDefinition[];
}

export type ExperimentGroup = 'CONTROL' | 'RULE' | 'CROSSPILOT';

export interface SingleRunResult {
  runId: string;
  group: ExperimentGroup;
  scenarioId: string;
  seed: number;
  completedDays: number;
  totalRevenueCents: number;
  totalCostCents: number;
  totalProfitCents: number;
  totalOrders: number;
  stockoutDays: number;
  actionsExecuted: number;
  policyViolations: number;
  status: 'COMPLETED' | 'FAILED' | 'PAUSED_BUDGET';
  dailyHashes: string[];
  finalStateHash: string;
}

export interface PairedComparisonResult {
  scenarioId: string;
  seed: number;
  controlProfitCents: number;
  ruleProfitCents: number;
  crossPilotProfitCents: number;
  ruleAbsoluteDeltaCents: number;
  ruleRelativeDeltaPct: number | null;
  crossPilotAbsoluteDeltaCents: number;
  crossPilotRelativeDeltaPct: number | null;
}

export interface BootstrapSummary {
  mean: number;
  median: number;
  min: number;
  max: number;
  ciLower95: number;
  ciUpper95: number;
}

export interface ExperimentSummaryReport {
  manifestHash: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  pausedRuns: number;
  pairedComparisons: PairedComparisonResult[];
  ruleBootstrap: BootstrapSummary;
  crossPilotBootstrap: BootstrapSummary;
}

export function computeManifestHash(manifest: SimulationExperimentManifest): string {
  return createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');
}

/**
 * Calculates absolute and relative profit delta between strategy and control.
 * Truthful reporting:
 * - If control <= 0, relative delta is null (cannot divide by zero or negative baseline).
 * - If strategy profit is lower than control, reports negative delta honestly (no sugarcoating).
 */
export function calculatePairwiseDeltas(
  strategyProfitCents: number,
  controlProfitCents: number,
): { absoluteDeltaCents: number; relativeDeltaPct: number | null } {
  const absoluteDeltaCents = strategyProfitCents - controlProfitCents;
  let relativeDeltaPct: number | null = null;

  if (controlProfitCents > 0) {
    relativeDeltaPct = Math.round((absoluteDeltaCents / controlProfitCents) * 10000) / 10000;
  }

  return { absoluteDeltaCents, relativeDeltaPct };
}

/**
 * Deterministic bootstrap confidence interval (95%) over paired profit deltas across seeds.
 */
export function computeBootstrapStats(values: number[], resamples = 1000, seed = 42): BootstrapSummary {
  if (!values || values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, ciLower95: 0, ciUpper95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = Math.round((sum / values.length) * 100) / 100;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Bootstrap resampling for 95% CI
  const bootstrapMeans: number[] = [];
  let rngState = seed;
  const nextRand = () => {
    rngState = (rngState * 1664525 + 1013904223) % 4294967296;
    return rngState / 4294967296;
  };

  const n = values.length;
  for (let r = 0; r < resamples; r++) {
    let sampleSum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(nextRand() * n);
      sampleSum += values[idx];
    }
    bootstrapMeans.push(sampleSum / n);
  }

  bootstrapMeans.sort((a, b) => a - b);
  const lowerIdx = Math.floor(resamples * 0.025);
  const upperIdx = Math.floor(resamples * 0.975);

  return {
    mean,
    median: Math.round(median * 100) / 100,
    min,
    max,
    ciLower95: Math.round(bootstrapMeans[lowerIdx] * 100) / 100,
    ciUpper95: Math.round(bootstrapMeans[upperIdx] * 100) / 100,
  };
}

export interface ReplaySimulationInput {
  seed: number;
  config: V2Config;
  initialState: V2WorldState;
  externalEvents: V2ExternalEvent[];
  days: number;
  actionScript?: Array<{ day: number; action: (state: V2WorldState) => void }>;
}

export interface ReplaySimulationOutput {
  dailySummaries: V2ProfitSummary[];
  dailyHashes: string[];
  finalStateHash: string;
  totalProfitCents: number;
}

/**
 * Runs a multi-day deterministic simulation for replay consistency verification.
 */
export function runDeterministicSimulation(input: ReplaySimulationInput): ReplaySimulationOutput {
  let currentState = { ...input.initialState };
  const dailySummaries: V2ProfitSummary[] = [];
  const dailyHashes: string[] = [];

  for (let d = 1; d <= input.days; d++) {
    // Check if any scheduled action applies today before tick
    if (input.actionScript) {
      const scheduled = input.actionScript.filter((s) => s.day === d);
      for (const item of scheduled) {
        item.action(currentState);
      }
    }

    const dayOutput = simulateV2Day(currentState, input.config, input.externalEvents);
    const ledgerEntries = generateLedgerEntries(dayOutput, input.config, currentState.storeId);
    const summary = summarizeDailyProfit(dayOutput.date, ledgerEntries);
    dailySummaries.push(summary);

    // Compute deterministic daily hash
    const dailyHash = createHash('sha256')
      .update(
        JSON.stringify({
          date: dayOutput.date,
          skuOutputs: dayOutput.skuOutputs,
          profitSummary: summary,
        }),
      )
      .digest('hex');
    dailyHashes.push(dailyHash);

    currentState = dayOutput.nextState;
  }

  const finalStateHash = createHash('sha256')
    .update(JSON.stringify(currentState))
    .digest('hex');

  const totalProfitCents = dailySummaries.reduce((acc, l) => acc + l.contributionProfitCents, 0);

  return {
    dailySummaries,
    dailyHashes,
    finalStateHash,
    totalProfitCents,
  };
}

