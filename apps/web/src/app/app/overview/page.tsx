'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../lib/api-client';
import { HealthCheckResponse, WorkspaceSummary } from '@crosspilot/shared';
import {
  Activity,
  Box,
  CheckCircle2,
  AlertCircle,
  Database,
  Server,
  Layers,
  Cpu,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Package,
} from 'lucide-react';

export default function BusinessOverviewPage() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [hData, wsData] = await Promise.allSettled([
          ApiClient.get<HealthCheckResponse>('/api/v1/health'),
          ApiClient.get<WorkspaceSummary>('/api/v1/workspaces/current'),
        ]);

        if (hData.status === 'fulfilled') {
          setHealth(hData.value);
        }
        if (wsData.status === 'fulfilled') {
          setWorkspace(wsData.value);
        }
      } catch (err) {
        console.error('Failed to load overview data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              01 经营驾驶舱
            </h1>
            <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              Milestone 0: Repo / Infra
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            SKU 360 全生命周期运营平台 • 当前工作区: {workspace?.name || 'CrossPilot Demo'}
          </p>
        </div>

        {/* Global Live Status */}
        <div className="flex items-center space-x-2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs">
          <div className={`w-2.5 h-2.5 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
          <span className="text-gray-400">System Infra:</span>
          <span className="font-semibold text-white uppercase">{health?.status || 'INITIALIZING'}</span>
        </div>
      </div>

      {/* Demo Case Hero Banner (V9 Section 1.3) */}
      <div className="bg-gradient-to-r from-blue-950/40 via-surface to-surface border border-blue-500/20 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Box className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Demo Core Case
                </span>
                <span className="text-xs bg-gray-800 text-gray-300 px-1.5 py-0.2 rounded">
                  Amazon US
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Natural Marble Toothbrush Holder (天然大理石牙刷架)
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Real Marble • 3.57 lbs Base • 1 Large + 3 Small Holes • Anti-slip Bottom
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end md:self-auto">
            <span className="text-xs text-gray-400">Variants:</span>
            <span className="text-xs bg-surface-elevated border border-border text-gray-200 px-2 py-1 rounded">White</span>
            <span className="text-xs bg-surface-elevated border border-border text-gray-200 px-2 py-1 rounded">Green</span>
            <span className="text-xs bg-surface-elevated border border-border text-gray-200 px-2 py-1 rounded">Beige Grey</span>
          </div>
        </div>
      </div>

      {/* Infrastructure Readiness Grid (Milestone 0 Acceptance) */}
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-primary" />
          <span>基础架构状态与就绪矩阵 (Milestone 0 Infra)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* NestJS API */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">NestJS API</span>
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-base font-bold text-white">
                  {health?.services?.api?.status === 'up' ? 'Online' : 'Active'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Modular Monolith / REST & SSE
              </p>
            </div>
          </div>

          {/* PostgreSQL */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">PostgreSQL (Prisma)</span>
              <Database className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-3">
              <div className="flex items-center space-x-2">
                {health?.services?.postgres?.status === 'up' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
                <span className="text-base font-bold text-white">
                  {health?.services?.postgres?.status === 'up' ? 'Connected' : 'Schema Ready'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Source of Truth • Multi-tenant
              </p>
            </div>
          </div>

          {/* Redis */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">Redis (Queue / Cache)</span>
              <Activity className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-3">
              <div className="flex items-center space-x-2">
                {health?.services?.redis?.status === 'up' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
                <span className="text-base font-bold text-white">
                  {health?.services?.redis?.status === 'up' ? 'Connected' : 'Configured'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                BullMQ Worker & PubSub Cache
              </p>
            </div>
          </div>

          {/* Milvus */}
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">Milvus (Vector DB)</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3">
              <div className="flex items-center space-x-2">
                {health?.services?.milvus?.status === 'up' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-cyan-400" />
                )}
                <span className="text-base font-bold text-white">
                  {health?.services?.milvus?.status === 'up' ? 'Connected' : 'Adapter Ready'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Policy & Review Vector RAG
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SKU 360 Core Commerce Metrics Preview (Reserved for Milestone 1) */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">SKU 360 经营闭环指标看板</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              确定性计算交给代码，模糊分析交给 Agent (遵循 V9 Section 3.3 原则)
            </p>
          </div>
          <span className="text-xs text-gray-400 bg-surface-elevated border border-border px-2.5 py-1 rounded">
            Scope: M0 Ready • M1 Next
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">30天销售额 (Revenue)</span>
            <div className="text-lg font-bold text-white mt-1">$30,870</div>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center mt-0.5">
              <ArrowUpRight className="w-3 h-3" /> +14.2%
            </span>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">净利润 (Net Profit)</span>
            <div className="text-lg font-bold text-white mt-1">$5,960</div>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center mt-0.5">
              Margin: 19.3%
            </span>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">广告花费 (Ads Spend)</span>
            <div className="text-lg font-bold text-white mt-1">$3,500</div>
            <span className="text-[10px] text-blue-400 font-medium flex items-center mt-0.5">
              ACOS: 21.8%
            </span>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">FBA 可售库存</span>
            <div className="text-lg font-bold text-white mt-1">420 pcs</div>
            <span className="text-[10px] text-amber-400 font-medium flex items-center mt-0.5">
              Days Cover: 28d
            </span>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">订单量 (Orders)</span>
            <div className="text-lg font-bold text-white mt-1">942</div>
            <span className="text-[10px] text-gray-400 font-medium flex items-center mt-0.5">
              CVR: 12.6%
            </span>
          </div>

          <div className="bg-surface-elevated p-3 rounded-lg border border-border">
            <span className="text-[11px] text-gray-400">退货率 (Return Rate)</span>
            <div className="text-lg font-bold text-white mt-1">3.4%</div>
            <span className="text-[10px] text-gray-400 font-medium flex items-center mt-0.5">
              Target &lt; 5%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
