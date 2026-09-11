'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { SupplierInfo, PurchaseOrderInfo } from '@crosspilot/shared';
import { getStatusLabel } from '../../../constants/ui-labels';
import {
  Truck,
  Plus,
  PackageCheck,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [supData, poData] = await Promise.allSettled([
        ApiClient.get<SupplierInfo[]>('/api/v1/suppliers'),
        ApiClient.get<PurchaseOrderInfo[]>('/api/v1/purchase-orders'),
      ]);

      if (supData.status === 'fulfilled') setSuppliers(supData.value);
      if (poData.status === 'fulfilled') setPurchaseOrders(poData.value);
    } catch (err) {
      console.error('无法载入供应链数据:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReceivePo = async (po: PurchaseOrderInfo) => {
    try {
      setActionMsg('正在执行采购订单入库核收...');
      const itemsToReceive = po.items?.map((item) => ({
        skuId: item.skuId,
        receivedQuantity: item.quantity,
      })) || [
        {
          skuId: 'sku_white_001',
          receivedQuantity: 500,
        },
      ];

      await ApiClient.post(`/api/v1/purchase-orders/${po.id}/receive`, {
        items: itemsToReceive,
      });

      setActionMsg(`✅ 验收成功: PO ${po.poNumber} 入库完成，FBA 可售库存已自动增加！`);
      await loadData();
    } catch (err: any) {
      setActionMsg(`❌ 入库失败: ${err.message}`);
    }
  };

  if (loading && suppliers.length === 0) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载供应链与采购数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              06 供应链与采购
            </h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              采购入库 → 库存协同
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            供应商档案、阶梯报价、PO 履约流转与 FBA 入库状态机
          </p>
        </div>
      </div>

      {actionMsg && (
        <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 flex items-center justify-between">
          <span>{actionMsg}</span>
          <button
            onClick={() => setActionMsg(null)}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <Truck className="w-4 h-4 text-blue-400" />
          <span>核心供应商名录</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map((sup) => (
            <div
              key={sup.id}
              className="bg-surface-elevated border border-border rounded-lg p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">{sup.name}</h3>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded">
                    {getStatusLabel(sup.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  联系人: {sup.contactPerson || '陈总'} • 电话: {sup.phone || '138-0000-8888'}
                </p>
                <p className="text-xs text-gray-400">
                  地址: {sup.address || '福建省泉州市南安水头石材工业园'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-gray-300">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>生产交期: <strong>{sup.leadTimeDays} 天</strong></span>
                </span>
                <span className="text-gray-400">
                  供货 SKU: <strong>Natural Marble 系列</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <PackageCheck className="w-4 h-4 text-emerald-400" />
              <span>采购订单列表</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              状态流转: 草稿 → 已确认 → 已发货 → 已收货
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-surface-elevated text-gray-400 uppercase font-semibold border-b border-border">
              <tr>
                <th className="py-2.5 px-3">PO 单号</th>
                <th className="py-2.5 px-3">供应商</th>
                <th className="py-2.5 px-3">采购明细</th>
                <th className="py-2.5 px-3">采购总额</th>
                <th className="py-2.5 px-3">状态</th>
                <th className="py-2.5 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-surface-elevated/40 transition">
                  <td className="py-3 px-3 font-mono font-medium text-white">
                    {po.poNumber}
                  </td>
                  <td className="py-3 px-3">
                    {po.supplierName || '福建天然石材厂'}
                  </td>
                  <td className="py-3 px-3">
                    {po.items?.map((item) => (
                      <span key={item.id} className="block text-gray-300">
                        {item.skuCode || 'MTH-WHITE-001'} × {item.quantity} 件 (@${item.unitCost})
                      </span>
                    )) || '500 件'}
                  </td>
                  <td className="py-3 px-3 font-bold text-white">
                    ${po.totalAmount}
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {getStatusLabel(po.status)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {po.status === 'RECEIVED' ? (
                      <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>已入库 (库存已增加)</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReceivePo(po)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-2.5 py-1 rounded transition text-xs cursor-pointer"
                      >
                        入库核收 (增加库存)
                      </button>
                    )}
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
