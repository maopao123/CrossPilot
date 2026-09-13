'use client';

import React, { useState } from 'react';
import {
  RecommendedAction,
  ActionPriority,
  ActionRiskLevel,
  ActionStatus,
  ActionCategory,
  ImpactType,
} from '@crosspilot/shared';
import {
  Flame,
  CheckCircle2,
  XCircle,
  Eye,
  Check,
  X,
  MinusCircle,
  Filter,
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  DollarSign,
  Search,
} from 'lucide-react';
import { ActionOutcomeBadges } from './action-outcome-badge';

interface ActionListProps {
  actions: RecommendedAction[];
  onSelectAction: (action: RecommendedAction) => void;
  onApproveAction: (action: RecommendedAction) => void;
  onRejectAction: (action: RecommendedAction) => void;
  onDismissAction: (action: RecommendedAction) => void;
  selectedSkuFilter: string | null;
  onClearSkuFilter: () => void;
  isViewer?: boolean;
  busyActionId?: string | null;
}

export function ActionList({
  actions,
  onSelectAction,
  onApproveAction,
  onRejectAction,
  onDismissAction,
  selectedSkuFilter,
  onClearSkuFilter,
  isViewer = false,
  busyActionId = null,
}: ActionListProps) {
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');

  // Filter actions
  const filteredActions = actions.filter((action) => {
    if (selectedSkuFilter && action.skuId !== selectedSkuFilter) {
      return false;
    }
    if (priorityFilter !== 'ALL' && action.priority !== priorityFilter) {
      return false;
    }
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'PENDING' && action.status !== 'PROPOSED') return false;
      if (statusFilter === 'APPROVED' && action.status !== 'APPROVED') return false;
      if (statusFilter === 'REJECTED' && action.status !== 'REJECTED') return false;
      if (statusFilter === 'DISMISSED' && action.status !== 'DISMISSED') return false;
    }
    if (categoryFilter !== 'ALL' && action.category !== categoryFilter) {
      return false;
    }
    if (riskFilter !== 'ALL' && action.riskLevel !== riskFilter) {
      return false;
    }
    return true;
  });

  const getPriorityBadge = (priority: ActionPriority) => {
    switch (priority) {
      case 'P1':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <Flame className="w-3 h-3" />
            P1 紧急
          </span>
        );
      case 'P2':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            P2 优先
          </span>
        );
      case 'P3':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
            P3 优化
          </span>
        );
    }
  };

  const getRiskBadge = (risk: ActionRiskLevel) => {
    switch (risk) {
      case 'HIGH':
        return (
          <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
            高风险 (HIGH)
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            中风险 (MEDIUM)
          </span>
        );
      case 'LOW':
        return (
          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            低风险 (LOW)
          </span>
        );
    }
  };

  const getImpactBadge = (impactType?: ImpactType, amount?: number, text?: string) => {
    let typeLabel = '定性说明';
    let typeColor = 'bg-gray-700/50 text-gray-300 border-gray-600/40';

    if (impactType === 'MEASURED') {
      typeLabel = '实测损失 (Measured)';
      typeColor = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    } else if (impactType === 'ESTIMATED') {
      typeLabel = '预估收益 (Estimated)';
      typeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    }

    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${typeColor}`}>
          {typeLabel}
        </span>
        {amount !== undefined && (
          <span className="font-mono font-bold text-white">
            ${Math.abs(amount).toLocaleString()}
          </span>
        )}
        {text && !amount && (
          <span className="text-gray-300 text-xs">{text}</span>
        )}
      </div>
    );
  };

  const getStatusBadge = (status: ActionStatus) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            已批准 (Approved)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            已驳回 (Rejected)
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30">
            <MinusCircle className="w-3.5 h-3.5" />
            已忽略 (Dismissed)
          </span>
        );
      case 'PROPOSED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            待审批 (Proposed)
          </span>
        );
    }
  };

  return (
    <section className="bg-surface border border-border rounded-xl p-5 mb-6 shadow-sm">
      {/* Title & Filters */}
      <div className="flex flex-col gap-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white tracking-tight">
              今日运营行动建议清单 (Today&apos;s Actions)
            </h2>
            <span className="bg-blue-600/20 text-blue-400 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-blue-500/30">
              {filteredActions.length} / {actions.length} 项
            </span>
          </div>

          {selectedSkuFilter && (
            <div className="flex items-center gap-2 bg-surface-elevated px-3 py-1.5 rounded-md border border-border text-xs">
              <span className="text-gray-400">已按 SKU 筛选:</span>
              <span className="font-mono font-bold text-blue-400">{selectedSkuFilter}</span>
              <button
                type="button"
                onClick={onClearSkuFilter}
                className="text-gray-400 hover:text-white ml-1 text-xs"
              >
                ✕ 清除
              </button>
            </div>
          )}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-gray-400 mr-2">
            <Filter className="w-3.5 h-3.5" />
            <span>筛选:</span>
          </div>

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全部优先级</option>
            <option value="P1">P1 紧急</option>
            <option value="P2">P2 优先</option>
            <option value="P3">P3 优化</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全部领域分类</option>
            <option value="INVENTORY">库存 (INVENTORY)</option>
            <option value="ADVERTISING">广告 (ADVERTISING)</option>
            <option value="PROFIT">利润 (PROFIT)</option>
            <option value="PRODUCT_QUALITY">品质与 VOC</option>
            <option value="COMPETITOR">竞品 (COMPETITOR)</option>
          </select>

          {/* Risk filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全部风险等级</option>
            <option value="HIGH">高风险 (HIGH)</option>
            <option value="MEDIUM">中风险 (MEDIUM)</option>
            <option value="LOW">低风险 (LOW)</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-elevated border border-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">全部状态</option>
            <option value="PENDING">待审批 (Proposed)</option>
            <option value="APPROVED">已批准 (Approved)</option>
            <option value="REJECTED">已驳回 (Rejected)</option>
            <option value="DISMISSED">已忽略 (Dismissed)</option>
          </select>
        </div>
      </div>

      {/* Action Cards List */}
      {filteredActions.length === 0 ? (
        <div className="p-8 text-center bg-surface-elevated/40 rounded-xl border border-border/60">
          <p className="text-sm text-gray-400">
            暂无符合当前筛选条件的行动建议
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredActions.map((action) => {
            const isProposed = action.status === 'PROPOSED';
            const isApprovalRequired = action.executionMode === 'APPROVAL_REQUIRED';

            return (
              <div
                key={action.actionId}
                className="p-4 rounded-xl bg-surface-elevated/70 border border-border/80 hover:border-blue-500/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
              >
                {/* Left Section: Action Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {getPriorityBadge(action.priority)}
                    <span className="font-mono text-xs font-bold text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-800/40">
                      {action.skuId}
                    </span>
                    <span className="text-[11px] text-gray-400 bg-surface px-2 py-0.5 rounded border border-border">
                      {action.category}
                    </span>
                    {getRiskBadge(action.riskLevel)}
                    {getStatusBadge(action.status)}
                    {/* V10 Epic A 执行结果徽标：actionId 为 WF-05 建议 ID，通常无对应 Outcome，组件静默降级不展示 */}
                    <ActionOutcomeBadges actionId={action.actionId} />
                  </div>

                  {/* Title & Reason */}
                  <h3 className="text-sm font-bold text-white tracking-tight leading-snug">
                    {action.title}
                  </h3>
                  <p className="text-xs text-gray-300 mt-1 line-clamp-2 leading-relaxed">
                    {action.reason}
                  </p>

                  {/* Expected Impact */}
                  <div className="mt-2 flex items-center gap-4">
                    {getImpactBadge(
                      action.impactType,
                      action.impactAmount,
                      action.expectedImpact
                    )}
                  </div>
                </div>

                {/* Right Section: Interactive Actions */}
                <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                  {/* View Details Drawer Button */}
                  <button
                    type="button"
                    onClick={() => onSelectAction(action)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-surface border border-border hover:text-white hover:border-gray-500 transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>查看证据链</span>
                  </button>

                  {/* Decision buttons (only for PROPOSED + APPROVAL_REQUIRED + non-viewer) */}
                  {isProposed && isApprovalRequired && !isViewer && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyActionId === action.actionId || !!busyActionId}
                        onClick={() => onApproveAction(action)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>批准</span>
                      </button>

                      <button
                        type="button"
                        disabled={!!busyActionId}
                        onClick={() => onRejectAction(action)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/30 transition disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>驳回</span>
                      </button>

                      <button
                        type="button"
                        disabled={!!busyActionId}
                        onClick={() => onDismissAction(action)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-700/40 hover:bg-gray-700 text-gray-300 border border-border transition disabled:opacity-50"
                      >
                        <span>忽略</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
