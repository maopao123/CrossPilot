'use client';

import React from 'react';
import {
  DailyOperationTaskSummaryDto,
  RecommendedAction,
  BusinessSignal,
  DiagnosisHealthStatus,
} from '@crosspilot/shared';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Flame,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface SkuRiskRankingTableProps {
  summary: DailyOperationTaskSummaryDto | null;
  actions: RecommendedAction[];
  signals?: BusinessSignal[];
  selectedSku: string | null;
  onSelectSku: (skuId: string) => void;
}

export function SkuRiskRankingTable({
  summary,
  actions,
  signals = [],
  selectedSku,
  onSelectSku,
}: SkuRiskRankingTableProps) {
  if (!summary) return null;

  // Extract unique SKUs from summary, actions, or signals
  const skuSet = new Set<string>();
  actions.forEach((a) => a.skuId && skuSet.add(a.skuId));
  signals.forEach((s) => s.skuId && skuSet.add(s.skuId));
  if (summary.topRisks) {
    summary.topRisks.forEach((r) => r.skuId && skuSet.add(r.skuId));
  }

  // Fallback if none found
  const skus = Array.from(skuSet);
  if (skus.length === 0) {
    return null;
  }

  // Compile SKU stats
  const skuStats = skus.map((skuId) => {
    const skuActions = actions.filter((a) => a.skuId === skuId);
    const skuSignals = signals.filter((s) => s.skuId === skuId);

    const p1Count = skuActions.filter((a) => a.priority === 'P1').length;
    const p2Count = skuActions.filter((a) => a.priority === 'P2').length;
    const pendingApprovals = skuActions.filter(
      (a) => a.status === 'PROPOSED' && a.executionMode === 'APPROVAL_REQUIRED'
    ).length;

    // Top issue
    const topRisk = summary.topRisks?.find((r) => r.skuId === skuId);
    const topSignal = skuSignals.find((s) => s.severity === 'CRITICAL') || skuSignals[0];
    const topIssueTitle = topRisk?.title || topSignal?.title || (p1Count > 0 ? '紧急指标异常' : '状态稳定');

    // Total financial impact
    const totalImpact = skuActions.reduce(
      (sum, a) => sum + Math.abs(a.impactAmount || 0),
      0
    );

    // Derive health for this SKU based on P1 / Critical
    let health: DiagnosisHealthStatus = 'HEALTHY';
    if (p1Count > 0 || skuSignals.some((s) => s.severity === 'CRITICAL')) {
      health = 'CRITICAL';
    } else if (p2Count > 0 || skuSignals.some((s) => s.severity === 'WARNING')) {
      health = 'NEEDS_ATTENTION';
    }

    return {
      skuId,
      health,
      p1Count,
      p2Count,
      topIssueTitle,
      totalImpact,
      pendingApprovals,
      actionsCount: skuActions.length,
    };
  });

  // Sort: CRITICAL first, then P1 count, then impact
  skuStats.sort((a, b) => {
    const weight = { CRITICAL: 3, NEEDS_ATTENTION: 2, HEALTHY: 1 };
    const diff = weight[b.health] - weight[a.health];
    if (diff !== 0) return diff;
    if (b.p1Count !== a.p1Count) return b.p1Count - a.p1Count;
    return b.totalImpact - a.totalImpact;
  });

  const getHealthBadge = (health: DiagnosisHealthStatus) => {
    switch (health) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/30">
            <AlertOctagon className="w-3 h-3" />
            严重 (Critical)
          </span>
        );
      case 'NEEDS_ATTENTION':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            需关注 (Warning)
          </span>
        );
      case 'HEALTHY':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            健康 (Healthy)
          </span>
        );
    }
  };

  return (
    <section className="bg-surface border border-border rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">
            产品风险矩阵与优先级排名 (SKU Risk Ranking)
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            点击 SKU 即可直接联动筛选下方行动建议清单
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-elevated/50 text-gray-400 font-medium">
              <th className="py-2.5 px-3">SKU 编码</th>
              <th className="py-2.5 px-3">健康状态</th>
              <th className="py-2.5 px-3 text-center">P1 紧急</th>
              <th className="py-2.5 px-3 text-center">P2 优先</th>
              <th className="py-2.5 px-3">核心问题 / 风险主因</th>
              <th className="py-2.5 px-3 text-right">量化财务影响</th>
              <th className="py-2.5 px-3 text-center">待审批</th>
              <th className="py-2.5 px-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {skuStats.map((item) => {
              const isSelected = selectedSku === item.skuId;

              return (
                <tr
                  key={item.skuId}
                  onClick={() => onSelectSku(item.skuId)}
                  className={`hover:bg-surface-elevated/80 transition cursor-pointer ${
                    isSelected ? 'bg-blue-600/15 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <td className="py-3 px-3 font-mono font-bold text-blue-300">
                    {item.skuId}
                  </td>
                  <td className="py-3 px-3">{getHealthBadge(item.health)}</td>
                  <td className="py-3 px-3 text-center font-bold text-rose-400">
                    {item.p1Count > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Flame className="w-3 h-3 text-rose-400" />
                        {item.p1Count}
                      </span>
                    ) : (
                      <span className="text-gray-500">0</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center font-medium text-amber-400">
                    {item.p2Count > 0 ? item.p2Count : <span className="text-gray-500">0</span>}
                  </td>
                  <td className="py-3 px-3 text-gray-200 font-medium truncate max-w-[220px]">
                    {item.topIssueTitle}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-gray-200 font-medium">
                    {item.totalImpact > 0 ? (
                      <span className="text-white font-bold">
                        ${item.totalImpact.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {item.pendingApprovals > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded text-[11px]">
                        <Clock className="w-3 h-3" />
                        {item.pendingApprovals}
                      </span>
                    ) : (
                      <span className="text-gray-500">0</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSku(item.skuId);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                    >
                      <span>{isSelected ? '已选中' : '筛选'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
