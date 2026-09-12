'use client';

import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Package,
  Flame,
  Clock,
  CheckSquare,
  TrendingDown,
} from 'lucide-react';
import { DailyOperationTaskSummaryDto, DiagnosisHealthStatus } from '@crosspilot/shared';

interface BusinessHealthSummaryProps {
  summary: DailyOperationTaskSummaryDto | null;
  isLoading?: boolean;
}

export function BusinessHealthSummary({
  summary,
  isLoading = false,
}: BusinessHealthSummaryProps) {
  if (isLoading && !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-24 bg-surface rounded-xl border border-border/60"
          />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const healthStatus: DiagnosisHealthStatus = summary.healthStatus || 'HEALTHY';

  const getHealthVisual = () => {
    switch (healthStatus) {
      case 'CRITICAL':
        return {
          title: '严重风险 (CRITICAL)',
          desc: `${summary.actionSummary?.p1Count || 0} 项核心 P1 动作需立即关注`,
          color: 'text-rose-400',
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/30',
          icon: AlertOctagon,
        };
      case 'NEEDS_ATTENTION':
        return {
          title: '需要关注 (NEEDS_ATTENTION)',
          desc: `${summary.actionSummary?.p2Count || 0} 项运营优化建议待审查`,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          icon: AlertTriangle,
        };
      case 'HEALTHY':
      default:
        return {
          title: '运营健康 (HEALTHY)',
          desc: '各项核心业务指标平稳，无异常缺口',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          icon: CheckCircle2,
        };
    }
  };

  const healthVisual = getHealthVisual();
  const HealthIcon = healthVisual.icon;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {/* 1. Global Health Status Card */}
      <div
        className={`col-span-1 sm:col-span-2 lg:col-span-1 rounded-xl p-4 border flex flex-col justify-between ${healthVisual.bg} ${healthVisual.border}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">总体经营健康</span>
          <HealthIcon className={`w-5 h-5 ${healthVisual.color}`} />
        </div>
        <div className="mt-2">
          <div className={`text-base font-bold tracking-tight ${healthVisual.color}`}>
            {healthVisual.title}
          </div>
          <p className="text-[11px] text-gray-300 mt-1 leading-snug">
            {healthVisual.desc}
          </p>
        </div>
      </div>

      {/* 2. SKU Coverage Card */}
      <div className="rounded-xl p-4 bg-surface border border-border flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-xs font-medium">SKU 诊断覆盖</span>
          <Package className="w-4 h-4 text-blue-400" />
        </div>
        <div className="mt-2">
          <div className="text-2xl font-bold text-white tracking-tight">
            {summary.skuSummary?.evaluated ?? 0}
            <span className="text-xs font-normal text-gray-400 ml-1.5">
              / {summary.skuSummary?.total ?? 0} 款
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            受影响: <span className="text-amber-300 font-semibold">{summary.skuSummary?.affected ?? 0}</span> 款
            {summary.skuSummary?.failed ? (
              <span className="text-rose-400 ml-1">({summary.skuSummary.failed} 款失败)</span>
            ) : null}
          </p>
        </div>
      </div>

      {/* 3. P1 Urgent Actions Card */}
      <div className="rounded-xl p-4 bg-surface border border-border flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-xs font-medium">P1 紧急行动</span>
          <Flame className="w-4 h-4 text-rose-400" />
        </div>
        <div className="mt-2">
          <div className="text-2xl font-bold text-rose-400 tracking-tight">
            {summary.actionSummary?.p1Count ?? 0}
            <span className="text-xs font-normal text-gray-400 ml-1.5">
              项 (共 {summary.actionSummary?.totalCount ?? 0} 项)
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            P2: <span className="text-amber-300 font-medium">{summary.actionSummary?.p2Count ?? 0}</span> 项 • P3: <span className="text-gray-300 font-medium">{summary.actionSummary?.p3Count ?? 0}</span> 项
          </p>
        </div>
      </div>

      {/* 4. Critical Risk Signals Card */}
      <div className="rounded-xl p-4 bg-surface border border-border flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-xs font-medium">严重业务风险</span>
          <TrendingDown className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-2">
          <div className="text-2xl font-bold text-amber-400 tracking-tight">
            {summary.signalSummary?.criticalCount ?? 0}
            <span className="text-xs font-normal text-gray-400 ml-1.5">
              个严重信号
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            预警信号: <span className="text-gray-300 font-medium">{summary.signalSummary?.warningCount ?? 0}</span> 个
          </p>
        </div>
      </div>

      {/* 5. Awaiting Approval Card */}
      <div className="rounded-xl p-4 bg-surface border border-border flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-gray-400">
          <span className="text-xs font-medium">待决策把关 (HITL)</span>
          <Clock className="w-4 h-4 text-blue-400" />
        </div>
        <div className="mt-2">
          <div className="text-2xl font-bold text-blue-400 tracking-tight">
            {summary.approvalSummary?.pendingCount ?? 0}
            <span className="text-xs font-normal text-gray-400 ml-1.5">
              项待审批
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            已批准: <span className="text-emerald-400 font-medium">{summary.approvalSummary?.approvedCount ?? 0}</span> • 驳回: <span className="text-gray-400">{summary.approvalSummary?.rejectedCount ?? 0}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
