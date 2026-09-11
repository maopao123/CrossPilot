'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '../../../lib/api-client';
import { getSeverityLabel } from '../../../constants/ui-labels';
import {
  Box,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Megaphone,
  Truck,
  Activity,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';

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

export default function BusinessOverviewPage() {
  const [timeline, setTimeline] = useState<BusinessEvent[]>([]);
  const [dailyData, setDailyData] = useState<DayAggregate[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<BusinessEvent | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      const [timelineRes, dailyRes] = await Promise.allSettled([
        ApiClient.get<BusinessEvent[]>('/api/v1/scenario/timeline'),
        ApiClient.get<{ days: DayAggregate[] }>('/api/v1/scenario/daily'),
      ]);

      if (timelineRes.status === 'fulfilled' && Array.isArray(timelineRes.value)) {
        setTimeline(timelineRes.value);
        setSelectedEvent(timelineRes.value[0]);
      }
      if (dailyRes.status === 'fulfilled' && dailyRes.value?.days) {
        setDailyData(dailyRes.value.days);
      }
    } catch (err) {
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
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载经营概览数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">01 经营概览</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded border border-emerald-500/30">
              90天全生命周期模拟
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            SKU 360 运营平台 • 天然大理石牙刷架 (Amazon 美国站)
          </p>
        </div>

        {/* 1-Click Demo Reset Action */}
        <div className="flex items-center space-x-3">
          {resetMessage && (
            <span className="text-xs text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded">
              {resetMessage}
            </span>
          )}
          <button
            onClick={handleResetDemo}
            disabled={resetting}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? '正在重置演示数据...' : '一键重置演示数据'}</span>
          </button>
        </div>
      </div>

      {/* 90-Day KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <span className="text-xs text-gray-400">90天总销售额</span>
          <div className="text-xl font-bold text-white mt-1">
            ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-emerald-400 flex items-center mt-0.5">
            日均: ${(totalRevenue / 90).toFixed(0)} / 天
          </span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <span className="text-xs text-gray-400">90天净利润</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            ${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-gray-400 mt-0.5">
            综合利润率: {overallMargin.toFixed(1)}%
          </span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <span className="text-xs text-gray-400">总订单件数</span>
          <div className="text-xl font-bold text-white mt-1">
            {totalOrders.toLocaleString()} 件
          </div>
          <span className="text-[11px] text-gray-400 mt-0.5">
            3 个变体协同出货
          </span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <span className="text-xs text-gray-400">广告总支出</span>
          <div className="text-xl font-bold text-white mt-1">
            ${totalAds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-amber-400 mt-0.5">
            ACOS: {totalRevenue > 0 ? ((totalAds / totalRevenue) * 100).toFixed(1) : 0}%
          </span>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <span className="text-xs text-gray-400">第 11 周利润异动</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            -$2,280.00
          </div>
          <Link href="/app/business-analyst" className="text-[11px] text-blue-400 hover:underline flex items-center mt-0.5">
            查看归因瀑布图 <ArrowRight className="w-3 h-3 ml-0.5" />
          </Link>
        </div>
      </div>

      {/* 10 Core Business Events (E01 - E10) Interactive Timeline */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">
              90天核心业务事件演进序列 (E01 — E10)
            </h2>
          </div>
          <span className="text-xs text-gray-400 bg-surface-elevated px-2.5 py-1 rounded border border-border">
            10 个关键业务事件 • 贯穿全流程
          </span>
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
                className={`p-2 rounded-lg border text-left transition flex flex-col justify-between cursor-pointer ${
                  isSelected ? `${severityColor} ring-2 ring-blue-500` : 'border-border bg-surface-elevated/50 hover:bg-surface-elevated text-gray-300'
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
              <div className="text-xs text-emerald-400 font-medium">💡 业务影响: {selectedEvent.impactSummary}</div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
              {selectedEvent.code === 'E02' && (
                <Link href="/app/advertising" className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center justify-center space-x-1">
                  <span>处理广告高 ACOS</span> <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
              {(selectedEvent.code === 'E04' || selectedEvent.code === 'E05') && (
                <Link href="/app/inventory" className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center justify-center space-x-1">
                  <span>执行补货决策 (12天可售)</span> <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
              {(selectedEvent.code === 'E06' || selectedEvent.code === 'E07') && (
                <Link href="/app/competitors" className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center justify-center space-x-1">
                  <span>下钻 VOC 评论证据</span> <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
              {selectedEvent.code === 'E08' && (
                <Link href="/app/listings" className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center justify-center space-x-1">
                  <span>Listing 工作台合规锁版</span> <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
              {selectedEvent.code === 'E10' && (
                <Link href="/app/business-analyst" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center justify-center space-x-1">
                  <span>进入 AI 经营分析瀑布图</span> <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SKU 360 Variants Matrix & Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* White SKU */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300">Carrara White (主力款)</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">平稳增长</span>
          </div>
          <div className="text-sm font-bold text-white mt-2">MTH-WHITE-001</div>
          <p className="text-xs text-gray-400 mt-1">
            日均销量 14~18 件 • 售价 $29.99 • 毛利率 23.4% • 退货率 2.1% 稳健
          </p>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
            <span className="text-gray-400">库存水位: 420 件</span>
            <Link href="/app/skus" className="text-blue-400 hover:underline">查看详情 &rarr;</Link>
          </div>
        </div>

        {/* Green SKU */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300">Emerald Green (爆款突发)</span>
            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">激增与断货</span>
          </div>
          <div className="text-sm font-bold text-white mt-2">MTH-GREEN-001</div>
          <p className="text-xs text-gray-400 mt-1">
            社媒带货激增至 35 件/天 • 触发 12天断货预警 (E04) • 补货 500 件入库
          </p>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
            <span className="text-amber-400 font-semibold">曾触及 12天可售天数预警</span>
            <Link href="/app/inventory" className="text-blue-400 hover:underline">库存补货 &rarr;</Link>
          </div>
        </div>

        {/* Grey SKU */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300">Beige Grey (退货改善)</span>
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">VOC 优化验证</span>
          </div>
          <div className="text-sm font-bold text-white mt-2">MTH-GREY-001</div>
          <p className="text-xs text-gray-400 mt-1">
            孔径 1.1&quot; 偏小退货率曾达 6.7% • VOC 提取推动 Listing 尺寸明确为 1.5&quot;
          </p>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
            <span className="text-purple-400 font-semibold">退货损失 -$620 溯源</span>
            <Link href="/app/reviews" className="text-blue-400 hover:underline">退货分析 &rarr;</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
