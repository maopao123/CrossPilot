'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '../../../lib/api-client';
import { ProductInfo } from '@crosspilot/shared';
import { getStatusLabel } from '../../../constants/ui-labels';
import { Box, Plus, ArrowRight } from 'lucide-react';

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const data = await ApiClient.get<ProductInfo[]>('/api/v1/products');
        setProducts(data);
      } catch (err) {
        console.error('无法载入产品列表:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  if (loading && products.length === 0) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">
        正在加载产品中心数据...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="cp-title">产品中心</h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              核心商品目录
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            统一商品目录、变体维度、技术参数与生命周期状态
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            disabled
            title="本阶段不支持在页面新建产品，请使用已有目录"
            className="flex items-center space-x-2 bg-blue-600/40 text-white text-xs font-semibold px-3 py-2 rounded-lg opacity-60 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>新建产品（未开放）</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {products.map((prod) => (
          <div
            key={prod.id}
            className="bg-surface border border-border rounded-xl p-6 shadow-sm"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-gray-400">
                      {prod.brand} • {prod.category}
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-semibold">
                      {getStatusLabel(prod.status)}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-0.5">
                    {prod.name}
                  </h2>
                </div>
              </div>

              <div className="flex items-center space-x-4 text-xs text-gray-400">
                <span>目标售价: <strong className="text-white">${prod.targetPrice || 29.99}</strong></span>
                <span>站点: <strong className="text-blue-400">Amazon 美国站</strong></span>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                变体 SKU 列表 ({prod.skus?.length || 0} 个变体)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-surface-elevated/60 text-gray-400 uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">SKU 编码</th>
                      <th className="py-2.5 px-3">变体名称</th>
                      <th className="py-2.5 px-3">ASIN</th>
                      <th className="py-2.5 px-3">售价</th>
                      <th className="py-2.5 px-3">重量 / 材质</th>
                      <th className="py-2.5 px-3">状态</th>
                      <th className="py-2.5 px-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prod.skus?.map((sku) => (
                      <tr key={sku.id} className="hover:bg-surface-elevated/40 transition">
                        <td className="py-3 px-3 font-mono font-medium text-white">
                          {sku.skuCode}
                        </td>
                        <td className="py-3 px-3 font-medium">
                          {sku.variantName}
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-400">
                          {sku.asin || 'B0XXXXXXX'}
                        </td>
                        <td className="py-3 px-3 font-bold text-white">
                          ${sku.sellingPrice}
                        </td>
                        <td className="py-3 px-3 text-gray-400">
                          {sku.weightKg ? `${sku.weightKg} kg` : '1.62 kg'} • {sku.material === 'Natural Marble' ? '天然大理石' : (sku.material || '天然大理石')}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-semibold">
                            {getStatusLabel(sku.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link
                            href={`/app/skus/${sku.id}`}
                            className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 font-semibold"
                          >
                            <span>SKU 360</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
