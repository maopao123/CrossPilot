'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { displayAmount, displayCount } from '../../../lib/catalog';
import { InventoryBalanceInfo } from '@crosspilot/shared';
import { getStatusLabel } from '../../../constants/ui-labels';
import {
  Warehouse,
  RefreshCw,
} from 'lucide-react';

export default function InventoryPage() {
  const [balances, setBalances] = useState<InventoryBalanceInfo[]>([]);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isViewer, setIsViewer] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setIsViewer(ApiClient.isViewer());
      const inv = await ApiClient.get<InventoryBalanceInfo[]>('/api/v1/inventory');
      setBalances(Array.isArray(inv) ? inv : []);

      const firstSkuId = Array.isArray(inv) && inv[0]?.skuId ? inv[0].skuId : null;
      if (firstSkuId && !ApiClient.isViewer()) {
        const rec = await ApiClient.post<any>(
          `/api/v1/skus/${firstSkuId}/reorder-recommendation`,
          { leadTimeDays: 15, targetDaysCover: 45 }
        );
        setRecommendation(rec);
      } else {
        setRecommendation(null);
      }
    } catch (err) {
      setLoadError('无法载入库存数据');
      setBalances([]);
      setRecommendation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && balances.length === 0) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载库存数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              11 库存 / FBA
            </h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              确定性补货计算引擎
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            实时库位监控、在途跟踪、可售天数测算与补货安全水位计算
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">FBA 可售库存</span>
          <div className="text-3xl font-bold text-white mt-2">
            {displayCount(balances[0]?.fulfillableQuantity)} <span className="text-sm font-normal text-gray-400">件</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>可供立即履约配送</span>
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">在途采购库存</span>
          <div className="text-3xl font-bold text-white mt-2">
            {displayCount(balances[0]?.inboundQuantity)} <span className="text-sm font-normal text-gray-400">件</span>
          </div>
          <p className="text-[11px] text-blue-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>已发货正在入库途中</span>
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">预留库存</span>
          <div className="text-3xl font-bold text-white mt-2">
            {displayCount(balances[0]?.reservedQuantity)} <span className="text-sm font-normal text-gray-400">件</span>
          </div>
          <p className="text-[11px] text-amber-400 mt-1 flex items-center space-x-1">
            <span>●</span>
            <span>买家订单正在分拣包装</span>
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <span className="text-xs text-gray-400 font-semibold uppercase">不可售库存</span>
          <div className="text-3xl font-bold text-white mt-2">
            {displayCount(balances[0]?.unfulfillableQuantity)} <span className="text-sm font-normal text-gray-400">件</span>
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
              <span>智能补货建议引擎</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              纯代码确定性公式计算，严禁浮点漂移 (依据 V9 Section 93 设计)
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            当前状态: {getStatusLabel(recommendation?.riskLevel || 'HEALTHY')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">日均销量 (30天)</span>
            <div className="text-base font-bold text-white mt-1">
              {displayAmount(recommendation?.avgDailySales, 1)} 件/天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">可售天数</span>
            <div className="text-base font-bold text-white mt-1">
              {displayAmount(recommendation?.daysCover, 1)} 天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">供应商生产交期</span>
            <div className="text-base font-bold text-white mt-1">
              {displayCount(recommendation?.leadTimeDays)} 天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">安全库存天数</span>
            <div className="text-base font-bold text-white mt-1">
              {displayCount(recommendation?.safetyStockDays)} 天
            </div>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">补货触发点</span>
            <div className="text-base font-bold text-amber-400 mt-1">
              {displayCount(recommendation?.reorderPoint)} 件
            </div>
          </div>

          <div className="bg-blue-950/40 p-3 rounded-lg border border-blue-500/30">
            <span className="text-[11px] text-blue-300 font-semibold">推荐补货量</span>
            <div className="text-base font-bold text-blue-400 mt-1">
              {displayCount(recommendation?.recommendedQuantity)} 件
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
