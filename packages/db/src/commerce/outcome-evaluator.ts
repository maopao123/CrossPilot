import { Prisma, PrismaClient } from '@prisma/client';
import {
  evaluateOutcome,
  evaluateOutcomeV2,
  computeOutcomeWindows,
  computeOutcomeWindowsV2,
  resolveOutcomeTarget,
  type OutcomeEvaluationResult,
} from '@crosspilot/domain';
import { OUTCOME_WINDOW_DAYS } from '@crosspilot/shared';
import { OutcomeMetricsReader, resolveWorkspaceToday } from './outcome-metrics-reader.js';

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * ActionOutcome 评估执行器（api reevaluate 与 worker 共用同一实现）：
 * 重新聚合 baseline / observe 两窗口指标 → domain 纯函数判定 → 落终态。
 * 终态不可逆：非 force 时仅 OBSERVING 且观察窗已结束（observe_end <= today）才评估；
 * today 按 workspace 时间基准（sim_date 优先，PRD §2.6）。
 */
export class OutcomeEvaluator {
  private readonly reader: OutcomeMetricsReader;

  constructor(private readonly prisma: PrismaClient) {
    this.reader = new OutcomeMetricsReader(prisma);
  }

  async evaluateAndPersist(
    outcomeId: string,
    options: { force?: boolean; now?: Date } = {},
  ): Promise<{ evaluated: boolean; result?: OutcomeEvaluationResult }> {
    const outcome = await this.prisma.actionOutcome.findUnique({
      where: { id: outcomeId },
      include: { action: { select: { actionType: true } } },
    });
    if (!outcome) throw new Error(`ActionOutcome ${outcomeId} not found`);

    const today = await resolveWorkspaceToday(this.prisma, outcome.workspaceId, options.now);
    const observeEnded = dateKey(outcome.observeEnd) <= dateKey(today);

    if (!options.force) {
      if (outcome.status !== 'OBSERVING') return { evaluated: false };
      if (!observeEnded) return { evaluated: false };
    }

    const [baseline, after] = await Promise.all([
      this.reader.readWindowMetrics({
        workspaceId: outcome.workspaceId,
        targetType: outcome.targetType,
        targetId: outcome.targetId,
        start: dateKey(outcome.baselineStart),
        end: dateKey(outcome.baselineEnd),
      }),
      this.reader.readWindowMetrics({
        workspaceId: outcome.workspaceId,
        targetType: outcome.targetType,
        targetId: outcome.targetId,
        start: dateKey(outcome.observeStart),
        end: dateKey(outcome.observeEnd),
      }),
    ]);

    const isV2 = outcome.evaluationVersion === 'closed-loop-v2' || outcome.evaluationVersion === 'v2';
    
    // Check multiple interventions on same target in observation window
    let multipleInterventions = false;
    if (isV2) {
      const overlapping = await this.prisma.actionOutcome.count({
        where: {
          workspaceId: outcome.workspaceId,
          targetType: outcome.targetType,
          targetId: outcome.targetId,
          id: { not: outcome.id },
          observeStart: { lte: outcome.observeEnd },
          observeEnd: { gte: outcome.observeStart },
        },
      });
      if (overlapping > 0) {
        multipleInterventions = true;
      }
    }

    const result = isV2
      ? evaluateOutcomeV2({
          actionType: outcome.action.actionType,
          baseline,
          after,
          windowDays: outcome.windowDays,
          observeWindowEnded: observeEnded,
        })
      : evaluateOutcome({
          actionType: outcome.action.actionType,
          baseline,
          after,
          observeWindowEnded: observeEnded,
        });

    const finalStatus = multipleInterventions ? 'INCONCLUSIVE' : result.status;
    const finalReason = multipleInterventions
      ? `MULTIPLE_INTERVENTIONS: 观察窗内存在同目标其他干预，按规格（§7.1）增量不归因于单个 Action，降级为 INCONCLUSIVE；${result.evaluationReason ?? ''}`
      : result.evaluationReason;

    await this.prisma.actionOutcome.update({
      where: { id: outcome.id },
      data: {
        metricsAfter:
          after === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
        delta:
          result.delta === null
            ? Prisma.DbNull
            : (JSON.parse(JSON.stringify(result.delta)) as Prisma.InputJsonValue),
        status: finalStatus,
        evaluationReason: finalReason,
        evaluationVersion: isV2 ? 'closed-loop-v2' : outcome.evaluationVersion,
        interventionVerified: !multipleInterventions,
        dataCoverage: isV2 ? { baselineDays: 7, observeDays: outcome.windowDays } : undefined,
        evaluatedAt: options.now ?? new Date(),
      },
    });

    return {
      evaluated: true,
      result: {
        ...result,
        status: finalStatus,
        evaluationReason: finalReason,
      },
    };
  }

  /**
   * Action 执行成功（ActionExecution SUCCESS）后创建 7/14/30 天观察窗 Outcome。
   * 失败时向调用方抛出异常，以便记录 OUTCOME_CREATION_RETRY（R2-5）。
   */
  async createForExecution(
    workspaceId: string,
    action: { id: string; target: Record<string, unknown> },
    executedAt: Date,
    options?: { evaluationVersion?: string },
  ): Promise<void> {
    let evaluationVersion = options?.evaluationVersion;
    if (!evaluationVersion) {
      if (action.target?.runId) {
        evaluationVersion = 'closed-loop-v2';
      } else if (this.prisma.simulationRun?.findFirst) {
        const run = await this.prisma.simulationRun.findFirst({
          where: { runWorkspaceId: workspaceId },
          select: { id: true },
        });
        if (run) {
          evaluationVersion = 'closed-loop-v2';
        }
      }
    }
    if (!evaluationVersion) {
      evaluationVersion = 'legacy-v1';
    }

    let resolvedSkuId = action.target.skuId as string | undefined;
    if (!resolvedSkuId && typeof action.target.skuCode === 'string' && this.prisma.sku?.findFirst) {
      const sku = await this.prisma.sku.findFirst({
        where: { workspaceId, skuCode: action.target.skuCode as string },
        select: { id: true },
      });
      if (sku) resolvedSkuId = sku.id;
    }

    const target = resolveOutcomeTarget(action.target, resolvedSkuId);
    if (!target) {
      console.warn(
        `⚠️ ActionOutcome skipped for action ${action.id}: target cannot be resolved (${JSON.stringify(action.target)})`,
      );
      return;
    }

    const t0 = dateKey(executedAt);
    for (const windowDays of OUTCOME_WINDOW_DAYS) {
      const window =
        evaluationVersion === 'closed-loop-v2'
          ? computeOutcomeWindowsV2(t0, windowDays)
          : computeOutcomeWindows(t0, windowDays);

      const baseline = await this.reader.readWindowMetrics({
        workspaceId,
        ...target,
        start: window.baselineStart,
        end: window.baselineEnd,
      });

      try {
        await this.prisma.actionOutcome.create({
          data: {
            workspaceId,
            actionId: action.id,
            targetType: target.targetType,
            targetId: target.targetId,
            baselineStart: new Date(`${window.baselineStart}T00:00:00.000Z`),
            baselineEnd: new Date(`${window.baselineEnd}T00:00:00.000Z`),
            observeStart: new Date(`${window.observeStart}T00:00:00.000Z`),
            observeEnd: new Date(`${window.observeEnd}T00:00:00.000Z`),
            windowDays,
            evaluationVersion,
            metricsBefore:
              baseline === null
                ? Prisma.JsonNull
                : (JSON.parse(JSON.stringify(baseline)) as Prisma.InputJsonValue),
            status: 'OBSERVING',
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          console.warn(
            `⚠️ ActionOutcome already exists for action ${action.id}, window ${windowDays}d, skipping`,
          );
          continue;
        }
        throw err;
      }
    }
  }
}
