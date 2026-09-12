'use client';

import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Package,
  Flame,
  Clock,
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
      <div className="cp-metric-strip mb-5 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="cp-metric h-20 bg-surface-elevated" />
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
    <div className="cp-metric-strip mb-5">
      <div className={`cp-metric ${healthVisual.bg}`}>
        <div className="flex items-center justify-between">
          <span className="cp-metric-label">经营健康</span>
          <HealthIcon className={`h-4 w-4 ${healthVisual.color}`} />
        </div>
        <div className={`mt-1 text-sm font-semibold ${healthVisual.color}`}>
          {healthVisual.title.replace(/ \(.+\)$/, '')}
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">{healthVisual.desc}</p>
      </div>

      <div className="cp-metric">
        <div className="flex items-center justify-between text-fg-muted">
          <span className="cp-metric-label">SKU 覆盖</span>
          <Package className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div className="cp-metric-value">
          {summary.skuSummary?.evaluated ?? 0}
          <span className="ml-1 text-[12px] font-normal text-fg-muted">
            / {summary.skuSummary?.total ?? 0}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">
          受影响 {summary.skuSummary?.affected ?? 0}
          {summary.skuSummary?.failed ? ` · 失败 ${summary.skuSummary.failed}` : ''}
        </p>
      </div>

      <div className="cp-metric">
        <div className="flex items-center justify-between text-fg-muted">
          <span className="cp-metric-label">P1 紧急</span>
          <Flame className="h-4 w-4 text-rose-500" strokeWidth={1.5} />
        </div>
        <div className="cp-metric-value text-rose-600 dark:text-rose-400">
          {summary.actionSummary?.p1Count ?? 0}
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">
          P2 {summary.actionSummary?.p2Count ?? 0} · P3 {summary.actionSummary?.p3Count ?? 0}
        </p>
      </div>

      <div className="cp-metric">
        <div className="flex items-center justify-between text-fg-muted">
          <span className="cp-metric-label">严重信号</span>
          <TrendingDown className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
        </div>
        <div className="cp-metric-value text-amber-700 dark:text-amber-400">
          {summary.signalSummary?.criticalCount ?? 0}
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">
          预警 {summary.signalSummary?.warningCount ?? 0}
        </p>
      </div>

      <div className="cp-metric">
        <div className="flex items-center justify-between text-fg-muted">
          <span className="cp-metric-label">待审批</span>
          <Clock className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div className="cp-metric-value">
          {summary.approvalSummary?.pendingCount ?? 0}
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">
          已批 {summary.approvalSummary?.approvedCount ?? 0} · 驳回 {summary.approvalSummary?.rejectedCount ?? 0}
        </p>
      </div>
    </div>
  );
}
