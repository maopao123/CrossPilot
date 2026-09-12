'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { displayAmount } from '../../../lib/catalog';
import {
  TrendingUp,
  RotateCcw,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

export default function ProfitPage() {
  const [summary, setSummary] = useState<any>(null);
  const [dailyRecords, setDailyRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnMsg, setReturnMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isViewer, setIsViewer] = useState(false);
  const [simulateSkuId, setSimulateSkuId] = useState<string | null>(null);
  const [simulateOrderItemId, setSimulateOrderItemId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setIsViewer(ApiClient.isViewer());
      setLoadError(null);
      const [sumRes, dailyRes, ordersRes] = await Promise.allSettled([
        ApiClient.get<any>('/api/v1/profit/summary'),
        ApiClient.get<any[]>('/api/v1/profit/daily'),
        ApiClient.get<any[]>('/api/v1/orders'),
      ]);

      if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
      else setLoadError('无法载入利润汇总');
      if (dailyRes.status === 'fulfilled') setDailyRecords(dailyRes.value);
      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
        const firstItem = ordersRes.value[0]?.items?.[0];
        setSimulateOrderItemId(firstItem?.id || null);
        setSimulateSkuId(firstItem?.skuId || null);
      }
    } catch (err) {
      console.error('无法载入利润数据:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSimulateReturn = async () => {
    try {
      setReturnMsg('正在创建退货记录并重新计算全天净利润与利润率...');
      const refundAmount = 29.99;
      
      if (!simulateOrderItemId || !simulateSkuId) {
        setReturnMsg('❌ 没有可用订单项，无法模拟退货');
        return;
      }
      const res = await ApiClient.post<any>('/api/v1/returns', {
        orderItemId: simulateOrderItemId,
        skuId: simulateSkuId,
        refundAmount,
        reason: '买家自主退货：表面有细微划痕',
        returnDate: new Date().toISOString(),
      });

      setReturnMsg(
        `✅ 退货核销成功: 退款 $${refundAmount} 已计入退货损失，当日净利润重算为 $${res.updatedProfit.netProfit.toFixed(2)}，利润率变动为 ${(res.updatedProfit.margin * 100).toFixed(2)}% (高精度十进制计算)`
      );

      await loadData();
    } catch (err: any) {
      setReturnMsg(`❌ 退货重算失败: ${err.message}`);
    }
  };

  if (loading && !summary) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载利润中心数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              13 利润中心
            </h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              退货核销 → 利润高精度重算
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            SKU 真实财务核算：销售额、成本、佣金、FBA、广告、退货、净利润
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleSimulateReturn}
            disabled={isViewer || !simulateOrderItemId}
            className="flex items-center space-x-2 bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-50 text-rose-300 border border-rose-500/40 text-xs font-semibold px-3 py-2 rounded-lg transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>模拟退货重算利润</span>
          </button>
        </div>
      </div>

      {returnMsg && (
        <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between">
          <span>{returnMsg}</span>
          <button
            onClick={() => setReturnMsg(null)}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400 font-medium">销售额</span>
          <div className="text-xl font-bold text-white mt-1">
            ${displayAmount(summary?.revenue)}
          </div>
          <span className="text-[10px] text-emerald-400 flex items-center mt-1">
            <ArrowUpRight className="w-3 h-3" /> Amazon 美国站
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400 font-medium">采购成本 (COGS)</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            -${displayAmount(summary?.cogs)}
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            供应商报价: $8.50 / 件
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400 font-medium">Amazon 佣金与 FBA</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            -${summary ? displayAmount((summary.amazonFees ?? 0) + (summary.fbaFee ?? 0)) : 'N/A'}
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            15% 佣金 + $4.5/件 FBA
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400 font-medium">PPC 广告花费</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            -${displayAmount(summary?.adsCost)}
          </div>
          <span className="text-[10px] text-blue-400 mt-1 block">
            ACOS: 12.3%
          </span>
        </div>

        <div className="bg-surface border border-border p-4 rounded-xl">
          <span className="text-xs text-gray-400 font-medium">退货损失</span>
          <div className="text-xl font-bold text-rose-400 mt-1">
            -${displayAmount(summary?.returnLoss)}
          </div>
          <span className="text-[10px] text-amber-400 mt-1 block">
            退款总额 (退货损失)
          </span>
        </div>

        <div className="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl">
          <span className="text-xs text-emerald-300 font-semibold">净利润</span>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            ${displayAmount(summary?.netProfit)}
          </div>
          <span className="text-[10px] text-emerald-300 font-medium mt-1 block">
            利润率: {summary?.margin === undefined || summary?.margin === null ? 'N/A' : `${(summary.margin * 100).toFixed(1)}%`} • ROI: {summary?.roi === undefined || summary?.roi === null ? 'N/A' : `${(summary.roi * 100).toFixed(1)}%`}
          </span>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-gray-400" />
          <span>每日利润明细账目</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-surface-elevated text-gray-400 uppercase font-semibold border-b border-border">
              <tr>
                <th className="py-2.5 px-3">日期</th>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">销售额</th>
                <th className="py-2.5 px-3">成本 (COGS)</th>
                <th className="py-2.5 px-3">佣金 + FBA</th>
                <th className="py-2.5 px-3">广告费</th>
                <th className="py-2.5 px-3">退货损失</th>
                <th className="py-2.5 px-3">净利润</th>
                <th className="py-2.5 px-3 text-right">利润率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dailyRecords.map((r) => (
                <tr key={r.id} className="hover:bg-surface-elevated/40 transition">
                  <td className="py-3 px-3 font-mono font-medium text-white">
                    {r.date}
                  </td>
                  <td className="py-3 px-3 font-mono text-gray-300">
                    {r.skuCode || 'MTH-WHITE-001'}
                  </td>
                  <td className="py-3 px-3 font-bold text-white">
                    ${r.revenue.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-rose-400">
                    -${r.cogs.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-rose-400">
                    -${(r.amazonFees + r.fbaFee).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-rose-400">
                    -${r.adsCost.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-rose-400 font-medium">
                    -${r.returnLoss.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 font-bold text-emerald-400">
                    ${r.netProfit.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-white">
                    {(r.margin * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
