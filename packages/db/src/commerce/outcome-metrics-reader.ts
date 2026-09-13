import { PrismaClient } from '@prisma/client';
import {
  aggregateAdMetrics,
  aggregateChannelMetrics,
  aggregateProfitMetrics,
  mergeOutcomeMetrics,
  type OutcomeMetrics,
} from '@crosspilot/domain';

function toDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * PRD §2.6 时间基准：workspace 有 simulation_states 行时「今天」= sim_date，
 * 否则取宿主机当天（UTC 日期截断，与 @db.Date 语义对齐）。
 * now 可注入，便于测试。
 */
export async function resolveWorkspaceToday(
  prisma: Pick<PrismaClient, 'simulationState'>,
  workspaceId: string,
  now: Date = new Date(),
): Promise<Date> {
  const state = await prisma.simulationState.findUnique({ where: { workspaceId } });
  const base = state?.simDate ?? now;
  return new Date(base.toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

/**
 * ActionOutcome 指标读取层：按 workspaceId + targetType/targetId + [start,end] 聚合。
 * 数据源透传，不做 MOCK：sku → channel_daily_metrics + profit_daily；
 * campaign / ad_target → ad_metric_daily（先校验 campaign 属于该 workspace）。
 * 日期参数为 YYYY-MM-DD 字符串，@db.Date 语义（UTC 午夜）。
 */
export class OutcomeMetricsReader {
  constructor(private readonly prisma: PrismaClient) {}

  async readWindowMetrics(input: {
    workspaceId: string;
    targetType: string;
    targetId: string;
    start: string;
    end: string;
  }): Promise<OutcomeMetrics | null> {
    const { workspaceId, targetType, targetId, start, end } = input;
    const range = { gte: toDate(start), lte: toDate(end) };

    if (targetType === 'sku') {
      const [channelRows, profitRows] = await Promise.all([
        this.prisma.channelDailyMetric.findMany({
          where: { workspaceId, skuId: targetId, metricDate: range },
        }),
        this.prisma.profitDaily.findMany({
          where: { workspaceId, skuId: targetId, date: range },
        }),
      ]);
      return mergeOutcomeMetrics([
        aggregateChannelMetrics(
          channelRows.map((r) => ({
            sessions: r.sessions,
            addToCart: r.addToCart,
            checkout: r.checkout,
            orders: r.orders,
            revenue: Number(r.revenue),
          })),
        ),
        aggregateProfitMetrics(
          profitRows.map((r) => ({ revenue: Number(r.revenue), netProfit: Number(r.netProfit) })),
        ),
      ]);
    }

    if (targetType === 'campaign' || targetType === 'ad_target') {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: targetId, workspaceId },
        select: { id: true },
      });
      if (!campaign) return null;
      const adRows = await this.prisma.adMetricDaily.findMany({
        where: { campaignId: campaign.id, metricDate: range },
      });
      return mergeOutcomeMetrics([
        aggregateAdMetrics(
          adRows.map((r) => ({
            impressions: r.impressions,
            clicks: r.clicks,
            spend: Number(r.spend),
            orders: r.orders,
            sales: Number(r.sales),
          })),
        ),
      ]);
    }

    // listing 等目标 V1 无指标数据源 → 整体缺失（不伪造）
    return null;
  }
}
