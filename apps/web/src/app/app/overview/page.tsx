'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '../../../lib/api-client';
import { getSeverityLabel } from '../../../constants/ui-labels';
import { useBusinessContext } from '../../../components/business-context-provider';
import { RotateCcw, ArrowRight, ChevronRight } from 'lucide-react';
import { PageHeader, StatusPill } from '../../../components/ui/page-header';
import { Button } from '../../../components/ui/button';
import { PageLoading, InlineError } from '../../../components/ui/skeleton';

interface BusinessEvent {
  code: string;
  day: number;
  title: string;
  skuCode?: string;
  description: string;
  impactSummary: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'COMPLETED' | 'RESOLVED' | 'ACTIVE';
}

interface DayAggregate {
  day: number;
  date: string;
  totalOrders: number;
  totalRevenue: number;
  totalAdsCost: number;
  totalNetProfit: number;
  margin: number;
}

interface WaterfallSummary {
  totalVariance?: number;
}

export default function BusinessOverviewPage() {
  const { workspaceName, skus } = useBusinessContext();
  const [timeline, setTimeline] = useState<BusinessEvent[]>([]);
  const [dailyData, setDailyData] = useState<DayAggregate[]>([]);
  const [waterfall, setWaterfall] = useState<WaterfallSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      const [timelineRes, dailyRes, waterfallRes] = await Promise.allSettled([
        ApiClient.get<BusinessEvent[]>('/api/v1/scenario/timeline'),
        ApiClient.get<{ days: DayAggregate[] }>('/api/v1/scenario/daily'),
        ApiClient.get<WaterfallSummary | null>('/api/v1/analyst/waterfall'),
      ]);

      if (timelineRes.status === 'fulfilled' && Array.isArray(timelineRes.value)) {
        setTimeline(timelineRes.value);
        setSelectedEvent(timelineRes.value[0]);
      }
      if (dailyRes.status === 'fulfilled' && dailyRes.value?.days) {
        setDailyData(dailyRes.value.days);
      }
      if (waterfallRes.status === 'fulfilled' && waterfallRes.value) {
        setWaterfall(waterfallRes.value);
      } else {
        setWaterfall(null);
      }
      const failed =
        timelineRes.status === 'rejected' &&
        dailyRes.status === 'rejected' &&
        waterfallRes.status === 'rejected';
      setLoadError(failed ? '无法载入经营概览数据' : null);
    } catch (err) {
      setLoadError('无法载入经营概览数据');
      console.error('无法载入业务概览数据:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const handleResetDemo = async () => {
    try {
      setResetting(true);
      setResetMessage(null);
      const res = await ApiClient.post<{ message: string }>('/api/v1/demo/reset', {
        workspaceSlug: 'crosspilot-demo',
      });
      setResetMessage(res.message || '演示基准数据重置成功！');
      await fetchOverviewData();
    } catch (err: any) {
      setResetMessage(`重置失败: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  // Aggregated totals across 90 days
  const totalRevenue = dailyData.reduce((sum, d) => sum + d.totalRevenue, 0);
  const totalOrders = dailyData.reduce((sum, d) => sum + d.totalOrders, 0);
  const totalAds = dailyData.reduce((sum, d) => sum + d.totalAdsCost, 0);
  const totalProfit = dailyData.reduce((sum, d) => sum + d.totalNetProfit, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  if (loading && dailyData.length === 0) {
    return <PageLoading label="正在加载经营概览数据..." />;
  }

  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="cp-page">
      <PageHeader
        title="经营概览"
        badge={<StatusPill tone="warning">场景数据 · 非实时店铺账</StatusPill>}
        description={`${workspaceName || '当前工作区'} · 90 天演示时间线`}
        actions={
          <>
            {resetMessage ? (
              <span className="text-[12px] text-fg-muted">{resetMessage}</span>
            ) : null}
            <Link
              href="/app/operations/today"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
            >
              处理今日待办 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Button
              variant="ghost"
              onClick={handleResetDemo}
              disabled={resetting || ApiClient.isViewer()}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${resetting ? 'animate-spin' : ''}`} />
              {resetting ? '正在重置…' : '重置演示数据'}
            </Button>
          </>
        }
      />

      {loadError ? <InlineError message={loadError} /> : null}

      <div className="cp-metric-strip">
        <div className="cp-metric">
          <div className="cp-metric-label">90 天销售额</div>
          <div className="cp-metric-value">
            {dailyData.length === 0 ? 'N/A' : money(totalRevenue)}
          </div>
          <div className="mt-1 text-[11px] text-fg-muted">日均 ${(totalRevenue / 90).toFixed(0)}</div>
        </div>
        <div className="cp-metric">
          <div className="cp-metric-label">90 天净利润</div>
          <div className="cp-metric-value text-emerald-700 dark:text-emerald-400">
            {money(totalProfit)}
          </div>
          <div className="mt-1 text-[11px] text-fg-muted">利润率 {overallMargin.toFixed(1)}%</div>
        </div>
        <div className="cp-metric">
          <div className="cp-metric-label">订单件数</div>
          <div className="cp-metric-value">{totalOrders.toLocaleString()}</div>
        </div>
        <div className="cp-metric">
          <div className="cp-metric-label">广告支出</div>
          <div className="cp-metric-value">{money(totalAds)}</div>
          <div className="mt-1 text-[11px] text-fg-muted">
            ACOS {totalRevenue > 0 ? ((totalAds / totalRevenue) * 100).toFixed(1) : 0}%
          </div>
        </div>
        <div className="cp-metric">
          <div className="cp-metric-label">利润异动</div>
          <div className={`cp-metric-value ${typeof waterfall?.totalVariance === 'number' && waterfall.totalVariance < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
            {typeof waterfall?.totalVariance === 'number'
              ? `${waterfall.totalVariance < 0 ? '-' : ''}$${Math.abs(waterfall.totalVariance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '暂无瀑布数据'}
          </div>
          <Link href="/app/business-analyst" className="mt-1 inline-flex items-center text-[11px] text-accent hover:underline">
            {typeof waterfall?.totalVariance === 'number' ? '查看归因' : 'Demo Scenario'} <ArrowRight className="ml-0.5 h-3 w-3" />
          </Link>
        </div>
      </div>

      <section className="cp-panel p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">90 天业务事件</h2>
          <span className="text-[12px] text-fg-muted">{timeline.length} 条场景事件</span>
        </div>

        {/* Event Chips Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 mb-4">
          {timeline.map((event) => {
            const isSelected = selectedEvent?.code === event.code;
            const severityColor =
              event.severity === 'CRITICAL'
                ? 'border-rose-500/50 text-rose-400 bg-rose-950/20'
                : event.severity === 'WARNING'
                ? 'border-amber-500/50 text-amber-400 bg-amber-950/20'
                : 'border-blue-500/50 text-blue-400 bg-blue-950/20';

            return (
              <button
                key={event.code}
                onClick={() => setSelectedEvent(event)}
                className={`flex cursor-pointer flex-col justify-between rounded-lg border p-2 text-left ${
                  isSelected ? `${severityColor} ring-1 ring-accent` : 'border-border bg-surface-elevated/50 text-fg hover:bg-surface-elevated'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span>{event.code}</span>
                  <span>第{event.day}天</span>
                </div>
                <div className="text-[11px] font-medium truncate mt-1">{event.title}</div>
              </button>
            );
          })}
        </div>

        {/* Selected Event Card Detail */}
        {selectedEvent && (
          <div className="bg-surface-elevated border border-border rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800">
                  {selectedEvent.code} (第 {selectedEvent.day} 天)
                </span>
                <span className="text-xs font-semibold text-gray-300">{selectedEvent.skuCode || '全部 SKU'}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                  selectedEvent.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : selectedEvent.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {getSeverityLabel(selectedEvent.severity)}
                </span>
              </div>
              <h3 className="text-base font-bold text-white">{selectedEvent.title}</h3>
              <p className="text-xs text-gray-300">{selectedEvent.description}</p>
              <div className="text-xs font-medium text-fg-muted">影响：{selectedEvent.impactSummary}</div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
              {selectedEvent.code === 'E02' && (
                <Link href="/app/advertising" className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-fg">
                  处理广告 ACOS <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {(selectedEvent.code === 'E04' || selectedEvent.code === 'E05') && (
                <Link href="/app/inventory" className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-fg">
                  查看补货建议 <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {(selectedEvent.code === 'E06' || selectedEvent.code === 'E07') && (
                <Link href="/app/competitors" className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-fg">
                  查看 VOC 证据 <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {selectedEvent.code === 'E08' && (
                <Link href="/app/listings" className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-fg">
                  打开 Listing 工作台 <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {selectedEvent.code === 'E10' && (
                <Link href="/app/business-analyst" className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-fg">
                  打开利润归因 <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="cp-table-wrap">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-border text-[12px] text-fg-muted">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">场景角色</th>
              <th className="px-4 py-2 font-medium">说明</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-mono text-fg">
                {skus.find((s) => s.skuCode === 'MTH-WHITE-001')?.skuCode || 'WHITE'}
              </td>
              <td className="px-4 py-3">主力款</td>
              <td className="px-4 py-3 text-fg-muted">场景数据 · Demo Scenario</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={skus.find((s) => s.skuCode === 'MTH-WHITE-001') ? `/app/skus/${skus.find((s) => s.skuCode === 'MTH-WHITE-001')!.id}` : '/app/skus'}
                  className="text-accent hover:underline"
                >
                  详情
                </Link>
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-mono text-fg">
                {skus.find((s) => s.skuCode === 'MTH-GREEN-001')?.skuCode || 'GREEN'}
              </td>
              <td className="px-4 py-3">需求激增</td>
              <td className="px-4 py-3 text-fg-muted">场景数据 · 关注可售天数</td>
              <td className="px-4 py-3 text-right">
                <Link href="/app/inventory" className="text-accent hover:underline">库存</Link>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-fg">
                {skus.find((s) => s.skuCode === 'MTH-GREY-001')?.skuCode || 'GREY'}
              </td>
              <td className="px-4 py-3">退货改善</td>
              <td className="px-4 py-3 text-fg-muted">场景数据 · 尺寸相关退货</td>
              <td className="px-4 py-3 text-right">
                <Link href="/app/reviews" className="text-accent hover:underline">退货</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
