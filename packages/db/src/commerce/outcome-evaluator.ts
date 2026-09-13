import { Prisma, PrismaClient } from '@prisma/client';
import { evaluateOutcome, type OutcomeEvaluationResult } from '@crosspilot/domain';
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

    const result = evaluateOutcome({
      actionType: outcome.action.actionType,
      baseline,
      after,
      observeWindowEnded: observeEnded,
    });

    await this.prisma.actionOutcome.update({
      where: { id: outcome.id },
      data: {
        metricsAfter:
          after === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
        delta:
          result.delta === null
            ? Prisma.DbNull
            : (JSON.parse(JSON.stringify(result.delta)) as Prisma.InputJsonValue),
        status: result.status,
        evaluationReason: result.evaluationReason,
        evaluatedAt: options.now ?? new Date(),
      },
    });

    return { evaluated: true, result };
  }
}
