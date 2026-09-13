import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCodes,
  OUTCOME_WINDOW_DAYS,
  type ActionOutcomeRecord,
  type OutcomeListResponse,
  type OutcomeSummaryDto,
} from '@crosspilot/shared';
import {
  computeOutcomeWindows,
  dateKey,
  resolveOutcomeTarget,
} from '@crosspilot/domain';
import {
  OutcomeEvaluator,
  OutcomeMetricsReader,
  resolveWorkspaceToday,
} from '@crosspilot/db';
import { PrismaService } from '../prisma/prisma.service.js';

function isP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

function normalizeJson(value: unknown): unknown {
  if (value === null || value === Prisma.JsonNull || value === Prisma.DbNull) return null;
  return value;
}

function toDateKey(value: Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

@Injectable()
export class OutcomeTrackingService {
  private readonly evaluator: OutcomeEvaluator;
  private readonly reader: OutcomeMetricsReader;

  constructor(private readonly prisma: PrismaService) {
    this.evaluator = new OutcomeEvaluator(prisma);
    this.reader = new OutcomeMetricsReader(prisma);
  }

  async list(
    workspaceId: string,
    query: { status?: string; targetType?: string; windowDays?: string; page?: string; pageSize?: string },
  ): Promise<OutcomeListResponse> {
    const page = Math.max(1, Number.parseInt(query.page ?? '', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? '', 10) || 20));
    let windowDays: number | undefined;
    if (query.windowDays) {
      windowDays = Number.parseInt(query.windowDays, 10);
      if (!Number.isFinite(windowDays) || windowDays <= 0) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: `windowDays 必须是正整数，收到 '${query.windowDays}'`,
        });
      }
    }

    const where: Prisma.ActionOutcomeWhereInput = {
      workspaceId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(windowDays ? { windowDays } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.actionOutcome.count({ where }),
      this.prisma.actionOutcome.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { windowDays: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((row) => this.toRecord(row)), total, page, pageSize };
  }

  /** 近 90 天（按 workspace 时间基准）各状态计数 + 终态累计 profit delta */
  async summary(workspaceId: string): Promise<OutcomeSummaryDto> {
    const today = await resolveWorkspaceToday(this.prisma, workspaceId);
    const todayKey = dateKey(today);
    const sinceKey = dateKey(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000));

    const rows = await this.prisma.actionOutcome.findMany({
      where: { workspaceId, createdAt: { gte: new Date(`${sinceKey}T00:00:00.000Z`) } },
      select: { status: true, delta: true },
    });

    const byStatus: Partial<Record<string, number>> = {};
    let profitDelta = 0;
    let hasProfitDelta = false;
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (row.status === 'OBSERVING') continue;
      const delta = normalizeJson(row.delta) as
        | Record<string, { before?: number; after?: number }>
        | null;
      const profit = delta?.profit;
      if (
        profit &&
        typeof profit.before === 'number' &&
        typeof profit.after === 'number' &&
        Number.isFinite(profit.before) &&
        Number.isFinite(profit.after)
      ) {
        profitDelta += profit.after - profit.before;
        hasProfitDelta = true;
      }
    }

    return {
      workspaceId,
      today: todayKey,
      since: sinceKey,
      total: rows.length,
      byStatus,
      profitDelta: hasProfitDelta ? Math.round((profitDelta + Number.EPSILON) * 100) / 100 : null,
    };
  }

  /** GET /actions/:id/outcomes —— 某 Action 的 7/14/30 天 Outcome 列表（跨 workspace 404） */
  async forAction(workspaceId: string, actionId: string): Promise<ActionOutcomeRecord[]> {
    const action = await this.prisma.plannedAction.findFirst({
      where: { id: actionId, workspaceId },
      select: { id: true },
    });
    if (!action) {
      throw new NotFoundException({
        code: ErrorCodes.ACTION_NOT_FOUND,
        message: `Action '${actionId}' not found in workspace`,
      });
    }
    const rows = await this.prisma.actionOutcome.findMany({
      where: { workspaceId, actionId },
      orderBy: { windowDays: 'asc' },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async reevaluate(workspaceId: string, id: string): Promise<ActionOutcomeRecord> {
    const row = await this.prisma.actionOutcome.findFirst({ where: { id, workspaceId } });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCodes.OUTCOME_NOT_FOUND,
        message: `Outcome '${id}' not found in workspace`,
      });
    }
    const today = await resolveWorkspaceToday(this.prisma, workspaceId);
    if (toDateKey(row.observeEnd) > dateKey(today)) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT_ERROR,
        message: `观察窗未结束（observe_end=${toDateKey(row.observeEnd)}，today=${dateKey(today)}），保持 OBSERVING，禁止重评`,
      });
    }
    try {
      await this.evaluator.evaluateAndPersist(id, { force: true });
    } catch (err) {
      if (isP2002(err)) {
        throw new ConflictException({
          code: ErrorCodes.CONFLICT_ERROR,
          message: `Outcome '${id}' 正在被并发重评（唯一约束冲突），请稍后重试`,
        });
      }
      throw err;
    }
    const updated = await this.prisma.actionOutcome.findFirst({ where: { id, workspaceId } });
    return this.toRecord(updated ?? row);
  }

  /**
   * Action 执行成功（ActionExecution SUCCESS）后创建 7/14/30 天观察窗 Outcome。
   * 任何失败只打 error 日志，绝不影响 execute 主流程（PRD §2.4 链路串联）。
   */
  async createForExecution(
    workspaceId: string,
    action: { id: string; target: Record<string, unknown> },
    executedAt: Date,
  ): Promise<void> {
    try {
      const resolvedSkuId = await this.resolveSkuIdByCode(workspaceId, action.target);
      const target = resolveOutcomeTarget(action.target, resolvedSkuId);
      if (!target) {
        console.warn(
          `⚠️ ActionOutcome skipped for action ${action.id}: target 无法解析（target=${JSON.stringify(action.target)}）`,
        );
        return;
      }
      const t0 = dateKey(executedAt);
      for (const windowDays of OUTCOME_WINDOW_DAYS) {
        const window = computeOutcomeWindows(t0, windowDays);
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
              metricsBefore:
                baseline === null
                  ? Prisma.JsonNull
                  : (JSON.parse(JSON.stringify(baseline)) as Prisma.InputJsonValue),
              status: 'OBSERVING',
            },
          });
        } catch (err) {
          if (isP2002(err)) {
            console.warn(
              `⚠️ ActionOutcome 已存在（action=${action.id}, window=${windowDays}d），跳过重复创建`,
            );
            continue;
          }
          throw err;
        }
      }
    } catch (err: any) {
      console.error(
        '❌ ActionOutcome 创建失败（不影响 execute 主流程）:',
        err?.message || err,
      );
    }
  }

  private async resolveSkuIdByCode(
    workspaceId: string,
    target: Record<string, unknown>,
  ): Promise<string | undefined> {
    if (typeof target.skuId === 'string' && target.skuId) return target.skuId;
    if (typeof target.skuCode !== 'string' || !target.skuCode) return undefined;
    const sku = await this.prisma.sku.findFirst({
      where: { workspaceId, skuCode: target.skuCode },
      select: { id: true },
    });
    return sku?.id;
  }

  private toRecord(row: {
    id: string;
    workspaceId: string;
    actionId: string;
    storeId: string | null;
    targetType: string;
    targetId: string;
    baselineStart: Date;
    baselineEnd: Date;
    observeStart: Date;
    observeEnd: Date;
    windowDays: number;
    metricsBefore: Prisma.JsonValue;
    metricsAfter: Prisma.JsonValue | null;
    delta: Prisma.JsonValue | null;
    status: string;
    evaluationReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    evaluatedAt: Date | null;
  }): ActionOutcomeRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      actionId: row.actionId,
      storeId: row.storeId ?? undefined,
      targetType: row.targetType,
      targetId: row.targetId,
      baselineStart: toDateKey(row.baselineStart),
      baselineEnd: toDateKey(row.baselineEnd),
      observeStart: toDateKey(row.observeStart),
      observeEnd: toDateKey(row.observeEnd),
      windowDays: row.windowDays,
      metricsBefore: normalizeJson(row.metricsBefore) as ActionOutcomeRecord['metricsBefore'],
      metricsAfter: normalizeJson(row.metricsAfter) as ActionOutcomeRecord['metricsAfter'],
      delta: normalizeJson(row.delta) as ActionOutcomeRecord['delta'],
      status: row.status as ActionOutcomeRecord['status'],
      evaluationReason: row.evaluationReason ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      evaluatedAt: row.evaluatedAt ? row.evaluatedAt.toISOString() : undefined,
    };
  }
}
