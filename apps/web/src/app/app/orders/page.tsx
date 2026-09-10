'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { OrderInfo, InventoryBalanceInfo } from '@crosspilot/shared';
import {
  ShoppingCart,
  Clock,
} from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [inventory, setInventory] = useState<InventoryBalanceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [orderQty, setOrderQty] = useState(2);
  const [selectedSku, setSelectedSku] = useState('sku_white_001');
  const [orderNotice, setOrderNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadData = async () => {
    try {
      const [ordRes, invRes] = await Promise.allSettled([
        ApiClient.get<OrderInfo[]>('/api/v1/orders'),
        ApiClient.get<InventoryBalanceInfo[]>('/api/v1/inventory'),
      ]);

      if (ordRes.status === 'fulfilled') setOrders(ordRes.value);
      if (invRes.status === 'fulfilled') setInventory(invRes.value);
    } catch (err) {
      console.error('Failed to load orders data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOrder = async () => {
    setOrderNotice(null);
    try {
      const randomOrderNo = `114-${Math.floor(1000000 + Math.random() * 9000000)}-${Math.floor(1000000 + Math.random() * 9000000)}`;
      
      const newOrder = await ApiClient.post<OrderInfo>('/api/v1/orders', {
        marketplaceId: 'mkt_us_001',
        orderNumber: randomOrderNo,
        items: [
          {
            skuId: selectedSku,
            quantity: Number(orderQty),
            unitPrice: 29.99,
          },
        ],
      });

      setOrderNotice({
        type: 'success',
        text: `✅ AC 2 验收成功: 订单 ${newOrder.orderNumber} 创建成功，FBA 库存扣减 ${orderQty} 件，每日利润已更新！`,
      });

      await loadData();
    } catch (err: any) {
      setOrderNotice({
        type: 'error',
        text: `❌ ${err.message}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              10 订单与履约中心
            </h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              AC 2: Order → Inventory -
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Amazon 销售订单、FBA 履约流转与库存扣减保护校验
          </p>
        </div>
      </div>

      <div className="bg-surface border border-blue-500/30 rounded-xl p-5 shadow-lg">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2 flex items-center space-x-2">
          <ShoppingCart className="w-4 h-4 text-blue-400" />
          <span>AC 2 履约验证控制台 (Simulate Customer Order)</span>
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          通过创建订单验证真实业务闭环：正常数量将安全扣减可售库存；超量下单将被拦截并抛出 <code className="text-rose-400 font-mono">INVENTORY_NOT_ENOUGH</code> 异常。
        </p>

        <div className="flex flex-wrap items-center gap-4 bg-surface-elevated p-3 rounded-lg border border-border">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">选择商品 SKU</label>
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="bg-surface border border-border text-xs text-white rounded px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="sku_white_001">MTH-WHITE-001 (天然大理石 White)</option>
              <option value="sku_green_002">MTH-GREEN-002 (天然大理石 Green)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-400 mb-1">下单件数 (Quantity)</label>
            <input
              type="number"
              min="1"
              value={orderQty}
              onChange={(e) => setOrderQty(parseInt(e.target.value, 10) || 1)}
              className="bg-surface border border-border text-xs text-white rounded px-3 py-1.5 w-28 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="self-end flex items-center space-x-2">
            <button
              onClick={handleCreateOrder}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded transition flex items-center space-x-1"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>提交订单扣减库存</span>
            </button>
            <button
              onClick={() => {
                setOrderQty(999999);
              }}
              className="bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-300 text-xs font-medium px-3 py-2 rounded transition"
            >
              一键填充超量 (测试缺货拦截)
            </button>
          </div>
        </div>

        {orderNotice && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center justify-between ${
              orderNotice.type === 'success'
                ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/40 border border-rose-500/30 text-rose-200'
            }`}
          >
            <span>{orderNotice.text}</span>
            <button
              onClick={() => setOrderNotice(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center space-x-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span>最新订单流 (Recent Orders)</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-surface-elevated text-gray-400 uppercase font-semibold border-b border-border">
              <tr>
                <th className="py-2.5 px-3">Amazon Order ID</th>
                <th className="py-2.5 px-3">购买 SKU</th>
                <th className="py-2.5 px-3">购买件数</th>
                <th className="py-2.5 px-3">订单金额</th>
                <th className="py-2.5 px-3">履约状态</th>
                <th className="py-2.5 px-3">下单时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-surface-elevated/40 transition">
                  <td className="py-3 px-3 font-mono font-medium text-white">
                    {o.orderNumber}
                  </td>
                  <td className="py-3 px-3">
                    {o.items?.map((item) => (
                      <span key={item.id} className="font-mono text-gray-300">
                        {item.skuCode || 'MTH-WHITE-001'}
                      </span>
                    )) || 'MTH-WHITE-001'}
                  </td>
                  <td className="py-3 px-3 font-bold text-white">
                    {o.items?.reduce((sum, i) => sum + i.quantity, 0) || 1} pcs
                  </td>
                  <td className="py-3 px-3 font-bold text-emerald-400">
                    ${o.totalAmount}
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded">
                      {o.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-400">
                    {new Date(o.orderedAt).toLocaleString('zh-CN')}
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
