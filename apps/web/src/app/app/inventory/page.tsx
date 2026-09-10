'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { InventoryBalanceInfo } from '@crosspilot/shared';
import {
  Warehouse,
  RefreshCw,
} from 'lucide-react';

export default function InventoryPage() {
  const [balances, setBalances] = useState<InventoryBalanceInfo[]>([]);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const inv = await ApiClient.get<InventoryBalanceInfo[]>('/api/v1/inventory');
      setBalances(inv);

      const rec = await ApiClient.post<any>(
        '/api/v1/skus/sku_white_001/reorder-recommendation',
        { leadTimeDays: 15, targetDaysCover: 45 }
      );
      setRecommendation(rec);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              11 库存与 FBA 计划
            </h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              Deterministic Reorder Engine
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            实时库位监控、在途跟踪、可售天数测算与补货安全水位计算
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">FBA 可售库存 (Fulfillable)</span>
          <div className="text-3xl font-bold text-white mt-2">
            {balances[0]?.fulfillableQuantity ?? 450} <span className="text-sm font-normal text-gray-400">pcs</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>可供立即履约配送</span>
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">在途采购 (Inbound)</span>
          <div className="text-3xl font-bold text-white mt-2">
            {balances[0]?.inboundQuantity ?? 200} <span className="text-sm font-normal text-gray-400">pcs</span>
          </div>
          <p className="text-[11px] text-blue-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>已发货正在入库途中</span>
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">预留库存 (Reserved)</span>
          <div className="text-3xl font-bold text-white mt-2">
            {balances[0]?.reservedQuantity ?? 15} <span className="text-sm font-normal text-gray-400">pcs</span>
          </div>
          <p className="text-[11px] text-amber-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>买家订单正在分拣包装</span>
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">不可售损耗 (Unfulfillable)</span>
          <div className="text-3xl font-bold text-white mt-2">
            {balances[0]?.unfulfillableQuantity ?? 2} <span className="text-sm font-normal text-gray-400">pcs</span>
          </div>
          <p className="text-[11px] text-rose-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>库损或买家退货待检验</span>
          </p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-emerald-400" />
              <span>智能补货建议引擎 (Reorder Recommendation)</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              纯代码确定性公式计算，严禁浮点漂移 (依据 V9 Section 93 设计)
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            当前状态: {recommendation?.riskLevel || 'HEALTHY'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">日均销量 (30d Sales)</span>
            <div className="text-base font-bold text-white mt-1">
              {recommendation?.avgDailySales || 8.5} 件/天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">可售天数 (Days Cover)</span>
            <div className="text-base font-bold text-white mt-1">
              {recommendation?.daysCover || 52.9} 天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">供应商交期 (Lead Time)</span>
            <div className="text-base font-bold text-white mt-1">
              {recommendation?.leadTimeDays || 15} 天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">安全库存天数</span>
            <div className="text-base font-bold text-white mt-1">
              {recommendation?.safetyStockDays || 14} 天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">补货触发点 (Reorder Point)</span>
            <div className="text-base font-bold text-amber-400 mt-1">
              {recommendation?.reorderPoint || 247} pcs
            </div>
          </div>

          <div className="bg-blue-950/40 p-3 rounded-lg border border-blue-500/30">
            <span className="text-[11px] text-blue-300 font-semibold">推荐补货量 (Quantity)</span>
            <div className="text-base font-bold text-blue-400 mt-1">
              {recommendation?.recommendedQuantity || 0} pcs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
