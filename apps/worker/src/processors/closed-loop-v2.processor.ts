import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  V2RunStore,
  V2ConflictError,
  OutcomeEvaluator,
  resolveWorkspaceToday,
} from '@crosspilot/db';
import {
  evaluateSimulatorPolicy,
  type PolicyEvaluationResult,
} from '@crosspilot/domain';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export interface ClosedLoopRunAdvanceOptions {
  maxDays?: number;
  targetDate?: string;
  userId?: string;
}

export interface ClosedLoopRunAdvanceResult {
  runId: string;
  advancedDays: number;
  completedThrough: string | null;
  status: string;
}

/**
 * Advances an isolated closed-loop-v2 SimulationRun through the complete daily pipeline:
 * Decision / Autopilot Policy -> Execution Receipt -> World Engine Atomic Tick -> Outcome Evaluation & Retry.
 * Resumes strictly from DB state (completedThrough + 1 day), enabling idempotent restart & crash recovery.
 */
export async function advanceClosedLoopRun(
  prisma: PrismaClient | any,
  runId: string,
  options: ClosedLoopRunAdvanceOptions = {},
): Promise<ClosedLoopRunAdvanceResult> {
  const maxDays = options.maxDays ?? 1;
  const v2Store = new V2RunStore(prisma);

  let advancedDays = 0;
  let lastCompletedThrough: string | null = null;
  let currentStatus = 'RUNNING';

  for (let step = 0; step < maxDays; step++) {
    // 1. Refresh run state from database
    const run = await prisma.simulationRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new Error(`SimulationRun not found: ${runId}`);
    }

    currentStatus = run.status;
    if (run.status === 'PAUSED' || run.status === 'COMPLETED' || run.status === 'FAILED') {
      console.log(`[ClosedLoopRunner] Run ${runId} is ${run.status}. Stopping advancement at day boundary.`);
      break;
    }

    // Determine next simulated date strictly from database completedThrough
    let targetDate: string;
    if (run.completedThrough) {
      const completedStr =
        run.completedThrough instanceof Date
          ? run.completedThrough.toISOString().split('T')[0]
          : String(run.completedThrough).split('T')[0];
      targetDate = addDays(completedStr, 1);
    } else {
      const config = (run.config as any) ?? {};
      targetDate = config.startDate ?? '2026-09-01';
    }

    if (options.targetDate && targetDate > options.targetDate) {
      break;
    }

    // 2. Autopilot Policy & Decision (when policyEnabled and past warm-up phase)
    if (run.policyEnabled && run.stateSnapshot) {
      const worldState = run.stateSnapshot as any;
      const campaigns = worldState.campaigns || [];
      const history = (worldState.actionHistory as any[]) || [];

      // Scan campaigns for optimization opportunities
      for (const campaign of campaigns) {
        if (campaign.status === 'PAUSED') continue;

        // Query recent ad metrics for clicks & acos (never fabricate data)
        let clicks = 0;
        let acos = 0;
        if (prisma.adMetricDaily?.findMany) {
          const pastMetrics = await prisma.adMetricDaily.findMany({
            where: { campaignId: campaign.id },
            take: 7,
          });
          if (pastMetrics.length > 0) {
            clicks = pastMetrics.reduce((sum: number, m: any) => sum + Number(m.clicks || 0), 0);
            const spend = pastMetrics.reduce((sum: number, m: any) => sum + Number(m.spend || 0), 0);
            const sales = pastMetrics.reduce((sum: number, m: any) => sum + Number(m.sales || 0), 0);
            acos = sales > 0 ? spend / sales : 0;
          }
        }

        if (acos > 0.40 && clicks >= 100) {
          const limits = (run.policyLimits as any) ?? {};
          const maxSinglePct = limits.maxSingleBidChangePct ?? 0.20;
          const policyCheck: PolicyEvaluationResult = evaluateSimulatorPolicy({
            actionType: 'DECREASE_BID',
            campaignId: campaign.id,
            currentDate: targetDate,
            currentBidCents: campaign.bidCents,
            initialBidCents: campaign.bidCents,
            percentage: Math.min(10, Math.round(maxSinglePct * 100)),
            recent7DayClicks: clicks,
            actionHistory: history,
            policyLimits: {
              maxSingleDecreasePct: limits.maxSingleBidChangePct ?? 0.20,
              maxCumulativeDecreasePct: limits.maxCumulativeBidChangePct ?? 0.30,
              cooldownDays: limits.cooldownDays ?? 3,
              maxActionsPerDay: limits.maxDailyActionsPerTarget ?? 3,
              min7DayClicks: limits.min7DayClicks ?? 100,
              minBidFloorCents: Math.round((limits.minBidUSD ?? 0.20) * 100),
            },
          });

          if (policyCheck.decision === 'ALLOW') {
            const pct = Math.min(10, Math.round((limits.maxSingleBidChangePct ?? 0.20) * 100));

            // Create real PlannedAction in DB (FK valid for SimulationExecutionReceipt.actionId)
            const plannedAction = await prisma.plannedAction.create({
              data: {
                workspaceId: run.runWorkspaceId,
                actionType: 'DECREASE_BID',
                target: {
                  runId: run.id,
                  campaignId: campaign.id,
                  storeId: run.storeId,
                  expectedTargetVersion: campaign.targetVersion,
                },
                parameters: {
                  percentage: pct,
                  expectedTargetVersion: campaign.targetVersion,
                  _approval: {
                    mode: 'POLICY_AUTO',
                    expectedTargetVersion: campaign.targetVersion,
                  },
                },
                priority: 'HIGH',
                status: 'APPROVED',
                metadata: {
                  source: 'SIMULATOR_AUTOPILOT',
                  runId: run.id,
                },
              },
            });

            const cleanParameters = {
              percentage: pct,
              expectedTargetVersion: campaign.targetVersion,
            };

            const payloadHash = createHash('sha256')
              .update(
                JSON.stringify({
                  actionType: 'DECREASE_BID',
                  target: {
                    runId: run.id,
                    campaignId: campaign.id,
                    storeId: run.storeId,
                    expectedTargetVersion: campaign.targetVersion,
                  },
                  parameters: cleanParameters,
                }),
              )
              .digest('hex');

            // Apply action atomically via Store: mutates stateSnapshot in DB, writes receipt, updates PlannedAction
            const applyRes = await v2Store.applyAction({
              runId: run.id,
              actionId: plannedAction.id,
              actionType: 'DECREASE_BID',
              target: {
                runId: run.id,
                campaignId: campaign.id,
                storeId: run.storeId,
                expectedTargetVersion: campaign.targetVersion,
              },
              parameters: cleanParameters,
              userId: options.userId || 'system-autopilot',
              payloadHash,
              expectedTargetVersion: campaign.targetVersion,
            });

            // Update in-memory loop state with persisted outcome
            campaign.bidCents = applyRes.afterState.bidCents ?? campaign.bidCents;
            campaign.targetVersion = applyRes.afterState.targetVersion;
          }
        }
      }
    }

    // 3. World Engine Atomic Tick
    try {
      const tickResult = await v2Store.tickDay(run.controlWorkspaceId, run.id, targetDate, options.userId);
      lastCompletedThrough = tickResult.completedThrough;
      advancedDays += 1;
    } catch (err: any) {
      if (err instanceof V2ConflictError || err?.message?.includes('already been completed')) {
        console.warn(`[ClosedLoopRunner] Day ${targetDate} already ticked, skipping duplicate tick.`);
        lastCompletedThrough = targetDate;
        continue;
      }
      throw err;
    }

    // 4. Outcome Evaluation for mature windows
    try {
      const evaluator = new OutcomeEvaluator(prisma);
      const today = await resolveWorkspaceToday(prisma, run.runWorkspaceId);
      const dueOutcomes = await prisma.actionOutcome?.findMany?.({
        where: {
          workspaceId: run.runWorkspaceId,
          status: 'OBSERVING',
          observeEnd: { lte: today },
        },
        select: { id: true },
      }) ?? [];

      for (const row of dueOutcomes) {
        await evaluator.evaluateAndPersist(row.id);
      }
    } catch (err: any) {
      console.warn(`[ClosedLoopRunner] Outcome evaluation error in workspace ${run.runWorkspaceId}:`, err?.message);
    }

    // 5. Outcome Creation Retry (FIX-12)
    try {
      if (prisma.agentTask?.findMany) {
        const pendingRetries = await prisma.agentTask.findMany({
          where: {
            workspaceId: run.runWorkspaceId,
            taskType: 'OUTCOME_CREATION_RETRY',
            status: 'PENDING',
          },
        });

        for (const task of pendingRetries) {
          try {
            const payload = JSON.parse(task.inputJson || '{}');
            if (payload.actionId && payload.target) {
              const evaluator = new OutcomeEvaluator(prisma);
              const appliedDate = payload.appliedDate ? new Date(payload.appliedDate) : new Date();
              await evaluator.createForExecution(
                task.workspaceId,
                { id: payload.actionId, target: payload.target },
                appliedDate,
                { evaluationVersion: payload.evaluationVersion || 'closed-loop-v2' },
              );
              // Mark as COMPLETED only after successfully creating outcomes
              await prisma.agentTask.update({
                where: { id: task.id },
                data: {
                  status: 'COMPLETED',
                  completedAt: new Date(),
                  errorCode: null,
                  errorMessage: null,
                },
              });
            }
          } catch (retryErr: any) {
            console.warn(`[ClosedLoopRunner] Failed retry for task ${task.id}:`, retryErr?.message);
            // On failure, preserve PENDING status and record error
            await prisma.agentTask.update({
              where: { id: task.id },
              data: {
                status: 'PENDING',
                errorCode: 'OUTCOME_RETRY_FAILED',
                errorMessage: retryErr?.message || String(retryErr),
              },
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ClosedLoopRunner] Outcome retry error in workspace ${run.runWorkspaceId}:`, err?.message);
    }
  }

  return {
    runId,
    advancedDays,
    completedThrough: lastCompletedThrough,
    status: currentStatus,
  };
}

/**
 * Worker sweep: scans all RUNNING SimulationRun records in the database and advances each by one day.
 */
export async function runClosedLoopV2Sweep(prisma: PrismaClient | any): Promise<void> {
  let runs: { id: string }[] = [];
  try {
    runs = await prisma.simulationRun.findMany({
      where: { status: 'RUNNING' },
      select: { id: true },
    });
  } catch (err: any) {
    console.warn('⚠️ ClosedLoopV2 sweep skipped: cannot query SimulationRun:', err?.message || err);
    return;
  }

  for (const r of runs) {
    try {
      const result = await advanceClosedLoopRun(prisma, r.id, { maxDays: 1 });
      console.log(`🕐 ClosedLoopV2 advanced run ${r.id} to ${result.completedThrough} (status: ${result.status})`);
    } catch (err: any) {
      console.warn(`⚠️ ClosedLoopV2 failed for run ${r.id}:`, err?.message || err);
    }
  }
}
