'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiClient } from '../../../../lib/api-client';
import { displayAmount, displayCount, displayPercentFromRate } from '../../../../lib/catalog';
import { Sku360Overview } from '@crosspilot/shared';
import { getStatusLabel } from '../../../../constants/ui-labels';
import {
  ArrowLeft,
  Warehouse,
  Truck,
  TrendingUp,
  RotateCcw,
  DollarSign,
} from 'lucide-react';

export default function Sku360Page() {
  const params = useParams();
  const skuId = params?.skuId as string;
  const [data, setData] = useState<Sku360Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSkuOverview() {
      try {
        setLoadError(null);
        const res = await ApiClient.get<Sku360Overview>(
          `/api/v1/skus/${skuId}/overview`,
        );
        setData(res);
      } catch (err) {
        setLoadError('无法载入 SKU 360 数据');
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    if (skuId) loadSkuOverview();
  }, [skuId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载 SKU 360 数据...
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="py-20 text-center text-rose-400 text-sm">
        {loadError || 'SKU 不存在或无数据'}
      </div>
    );
  }

  const sku = data?.sku;
  const inv = data?.inventory;
  const quote = data?.quote;
  const sales = data?.salesSummary;
  const profit = data?.profitSummary;
  const returns = data?.returnsSummary;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/products"
          className="inline-flex items-center space-x-1 text-xs text-gray-400 hover:text-white mb-2 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回产品列表</span>
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">
              360
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-gray-400">
                  {sku?.skuCode}
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded">
                  {getStatusLabel(sku?.status)}
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mt-0.5">
                {data?.product?.name} — {sku?.variantName}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right">
              <span className="text-xs text-gray-400">当前售价</span>
              <div className="text-xl font-bold text-white">
                ${displayAmount(sku?.sellingPrice)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">
              FBA 库存状态
            </span>
            <Warehouse className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              {displayCount(inv?.fulfillableQuantity)} <span className="text-xs font-normal text-gray-400">件</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-border">
              <span>在途库存: {displayCount(inv?.inboundQuantity)} 件</span>
              <span className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                inv?.riskLevel === 'HEALTHY'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {getStatusLabel(inv?.riskLevel)}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              可售天数: <strong>{displayCount(inv?.daysCover)} 天</strong>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">
              采购与成本
            </span>
            <Truck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              ${displayAmount(quote?.unitCost)} <span className="text-xs font-normal text-gray-400">/ 件</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-border">
              <span>供应商: {quote?.supplierName || 'N/A'}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              生产交期: <strong>{displayCount(quote?.leadTimeDays)} 天</strong>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">
              销售与订单
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              ${displayAmount(sales?.revenue)}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-border">
              <span>销量: <strong>{displayCount(sales?.unitsSold)} 件</strong></span>
              <span>订单: <strong>{displayCount(sales?.ordersCount)} 单</strong></span>
            </div>
            <div className="text-xs text-emerald-400 mt-1 font-medium">
              30天日均销量: {sales?.unitsSold === undefined || sales?.unitsSold === null ? 'N/A' : `~${(Number(sales.unitsSold) / 30).toFixed(1)} 件/天`}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">
              退货与品质
            </span>
            <RotateCcw className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              {displayPercentFromRate(returns?.returnRate)} <span className="text-xs font-normal text-gray-400">退货率</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-border">
              <span>退货件数: {displayCount(returns?.count)} 件</span>
              <span>退款: ${displayAmount(returns?.refundTotal)}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              健康阈值: &lt; 5.0%
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>SKU 真实经营利润明细</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">总销售额</span>
            <div className="text-base font-bold text-white mt-1">${displayAmount(profit?.revenue)}</div>
          </div>
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">商品采购成本 (COGS)</span>
            <div className="text-base font-bold text-rose-400 mt-1">-${displayAmount(profit?.cogs)}</div>
          </div>
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">Amazon 销售佣金 (15%)</span>
            <div className="text-base font-bold text-rose-400 mt-1">-${displayAmount(profit?.amazonFees)}</div>
          </div>
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">FBA 配送费</span>
            <div className="text-base font-bold text-rose-400 mt-1">-${displayAmount(profit?.fbaFee)}</div>
          </div>
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">PPC 广告花费</span>
            <div className="text-base font-bold text-rose-400 mt-1">-${displayAmount(profit?.adsCost)}</div>
          </div>
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">退货损失</span>
            <div className="text-base font-bold text-rose-400 mt-1">-${displayAmount(profit?.returnLoss)}</div>
          </div>
          <div className="bg-emerald-950/40 p-3 rounded-lg border border-emerald-500/30">
            <span className="text-[11px] text-emerald-300 font-semibold">净利润</span>
            <div className="text-base font-bold text-emerald-400 mt-1">${displayAmount(profit?.netProfit)}</div>
            <span className="text-[10px] text-emerald-400">
              利润率: {profit?.margin === undefined || profit?.margin === null ? 'N/A' : `${(profit.margin * 100).toFixed(1)}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
