'use client';

import React from 'react';
import Link from 'next/link';
import {
  Layers,
  Database,
  Cpu,
  Server,
  Code2,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  BrainCircuit,
  ArrowRight,
} from 'lucide-react';

export default function ArchitecturePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">架构设计与面试深度对线指南</h1>
            <span className="text-xs bg-cyan-500/20 text-cyan-400 font-semibold px-2 py-0.5 rounded border border-cyan-500/30">
              Milestone 10: System Blueprint & Defense Guide
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            CrossPilot 统一技术栈、确定性领域服务、Agent / Tool 边界与深度答辩考点
          </p>
        </div>

        <Link
          href="/app/overview"
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center space-x-1"
        >
          <span>返回经营驾驶舱 &rarr;</span>
        </Link>
      </div>

      {/* 1. Core Engineering Architecture */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2 border-b border-border pb-3">
          <Layers className="w-5 h-5 text-blue-400" />
          <span>1. 整体工程分层架构 (Monorepo Architecture)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-2">
            <div className="font-bold text-blue-400 text-sm">前端与展示层 (apps/web)</div>
            <p className="text-gray-300">Next.js 14 App Router + Tailwind CSS</p>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li>14 大经营子页面模块</li>
              <li>交互式 1-Click Demo Reset</li>
              <li>SSE 实时决策轨迹流展示</li>
              <li>SSR & 静态预渲染 100% 通过</li>
            </ul>
          </div>

          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-2">
            <div className="font-bold text-emerald-400 text-sm">后端服务与网关 (apps/api)</div>
            <p className="text-gray-300">NestJS 10 模块化单体架构</p>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li>Product / Sku / PO / Order 核心 API</li>
              <li>Inventory / Profit / Ads / VOC 模块</li>
              <li>JWT + Workspace 多租户隔离守卫</li>
              <li>SSE AgentTask 流式端点</li>
            </ul>
          </div>

          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-2">
            <div className="font-bold text-purple-400 text-sm">数据与持久化层 (Data Tier)</div>
            <p className="text-gray-300">PostgreSQL + Redis + Milvus</p>
            <ul className="text-gray-400 space-y-1 list-disc list-inside">
              <li>PostgreSQL 16: 业务单一事实源 (Prisma)</li>
              <li>Redis 7: BullMQ 异步队列与会话缓存</li>
              <li>Milvus 2.4: 亚马逊政策与买家原声向量库</li>
              <li>全量 Docker Compose 容器化编排</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 2. Core Domain Invariants */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2 border-b border-border pb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>2. 核心确定性领域服务与不变量 (Pure Domain Services)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-2">
            <span className="font-bold text-emerald-300 text-sm block">① 财务四舍五入与确定性瀑布闭环</span>
            <p className="text-gray-300">
              杜绝 IEEE 754 浮点漂移。所有货币计算采用高精度整数分位四舍五入（roundMoney）。
            </p>
            <div className="bg-surface p-2.5 rounded font-mono text-emerald-400 text-[11px]">
              -2280 = -980(Ads) - 620(Returns) - 510(Inventory) - 310(Price) + 140(Other)
            </div>
            <p className="text-[11px] text-gray-400">
              闭环残差恒为 0，严禁将未对账的数字交由 LLM 捏造。
            </p>
          </div>

          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-2">
            <span className="font-bold text-amber-300 text-sm block">② 补货水位与断货防御模型</span>
            <p className="text-gray-300">
              Green 变体社媒爆单后，库存降至 120 pcs，可售天数断崖至 11.8 天（&lt; 15天前置期）。
            </p>
            <div className="bg-surface p-2.5 rounded font-mono text-amber-400 text-[11px]">
              Reorder Point = (LeadTime + SafetyStockDays) × DailySales = 22 × 10.2 = 224 pcs
            </div>
            <p className="text-[11px] text-gray-400">
              触发 CRITICAL 级别补货告警，1-Click 直达 PO 自动补货 500 pcs。
            </p>
          </div>
        </div>
      </div>

      {/* 3. Interview Defense FAQs (V9 Section 288-290) */}
      <div className="bg-surface border border-border rounded-xl p-5 shadow-lg space-y-4">
        <h3 className="text-base font-bold text-white flex items-center space-x-2 border-b border-border pb-3">
          <HelpCircle className="w-5 h-5 text-amber-400" />
          <span>3. 架构师答辩对线矩阵 (Interview Defense Points)</span>
        </h3>

        <div className="space-y-3 text-xs">
          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-1.5">
            <h4 className="font-bold text-white text-sm flex items-center space-x-2">
              <span className="text-blue-400">Q1:</span>
              <span>为什么做这个平台？和市面上的普通 ERP（如领星、店小秘）有何本质区别？</span>
            </h4>
            <p className="text-gray-300 leading-relaxed">
              <strong>传统 ERP 是“被动记录型工具”</strong>：主要做记账、拉单、扣库存和报表展示，运营人员必须人工跨 5 个页面肉眼找原因；
              <strong>CrossPilot 是“统一因果运营工作台”</strong>：它打破了数据孤岛，将市场 VOC 痛点、产品真实参数、广告投放搜索词、断货预警与财务损益全部串联在 SKU 360 闭环下。当利润下跌时，AI Business Analyst 会自动调用底层确定性工具，完成全要素因果归因并直接给出可执行动作（如一键添加否定关键词、补货转 PO、Listing 尺寸锁版）。
            </p>
          </div>

          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-1.5">
            <h4 className="font-bold text-white text-sm flex items-center space-x-2">
              <span className="text-purple-400">Q2:</span>
              <span>为什么不是 Helium 10 或 Jungle Scout？</span>
            </h4>
            <p className="text-gray-300 leading-relaxed">
              <strong>Helium 10 等工具聚焦在公网市场大盘与站外选品</strong>，无法感知卖家内部的真实采购成本、FBA在途库存、退货瑕疵率以及真实的净利润；
              <strong>CrossPilot 实现了“站外大盘 + 站内经营数据”的全面打通</strong>：通过把竞品追踪、Listing 生成合规质检、广告调价和 FBA 补货串成闭环，验证了 AI Native Operations Platform 的完整形态。
            </p>
          </div>

          <div className="bg-surface-elevated border border-border p-4 rounded-xl space-y-1.5">
            <h4 className="font-bold text-white text-sm flex items-center space-x-2">
              <span className="text-emerald-400">Q3:</span>
              <span>为什么不在所有地方都用 Agent？哪些地方用确定性代码？</span>
            </h4>
            <p className="text-gray-300 leading-relaxed">
              <strong>确定性业务法则</strong>：金额计算（Revenue, Profit, Margin）、库存进出（Inbound, Fulfillment, Safety Stock）、ACOS/ROAS 财务指标绝对不能交给 LLM 臆造，否则会发生财务灾难；
              <strong>AI / Agent 专注发挥擅长领域</strong>：模糊语义理解、VOC 评论痛点聚类、符合亚马逊政策的事实内容生成、跨业务域规划工具调度与异常原因解释。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
