'use client';

import React from 'react';
import {
  Play,
  RotateCcw,
  Calendar,
  Globe,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { WorkflowExecutionStatus, DiagnosisMode } from '@crosspilot/shared';

interface OperationsHeaderProps {
  marketplaceId: string;
  onMarketplaceChange?: (marketplace: string) => void;
  dateRange: { from: string; to: string };
  baselinePeriod?: { from: string; to: string };
  workflowStatus: WorkflowExecutionStatus | null;
  lastUpdated: string | null;
  isRunning: boolean;
  onRunDiagnosis: (mode: DiagnosisMode) => void;
  mode: DiagnosisMode;
  onModeChange: (mode: DiagnosisMode) => void;
  isViewer?: boolean;
}

export function OperationsHeader({
  marketplaceId,
  dateRange,
  baselinePeriod,
  workflowStatus,
  lastUpdated,
  isRunning,
  onRunDiagnosis,
  mode,
  onModeChange,
  isViewer = false,
}: OperationsHeaderProps) {
  const formatDate = (iso: string) => {
    try {
      return iso.split('T')[0];
    } catch {
      return iso;
    }
  };

  const getStatusBadge = () => {
    switch (workflowStatus) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            运行中
          </span>
        );
      case 'WAITING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            待人工审批
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            已完成
          </span>
        );
      case 'PARTIAL_SUCCESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            部分成功
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
            执行失败
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
            未运行
          </span>
        );
    }
  };

  return (
    <header className="bg-surface border border-border rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Title & Metadata */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">
              今日运营看板
            </h1>
            <span className="text-xs text-gray-400 font-mono">
              Operations Today (WF-05)
            </span>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            多域自动化主动诊断 • 异常根因识别 • 行动建议优先级 • HITL 决策把关
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-300">
            <div className="flex items-center gap-1.5 bg-surface-elevated/70 px-2.5 py-1 rounded-md border border-border/50">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-400">站点:</span>
              <span className="font-semibold text-white">
                {marketplaceId === 'AMAZON_US' ? 'Amazon US (美国站)' : marketplaceId}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-surface-elevated/70 px-2.5 py-1 rounded-md border border-border/50">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-gray-400">周期:</span>
              <span className="font-medium text-white">
                {formatDate(dateRange.from)} ~ {formatDate(dateRange.to)}
              </span>
              {baselinePeriod && (
                <span className="text-[11px] text-gray-400 ml-1">
                  (基线: {formatDate(baselinePeriod.from)} ~ {formatDate(baselinePeriod.to)})
                </span>
              )}
            </div>

            {lastUpdated && (
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span>最后更新: {new Date(lastUpdated).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Controls & Run Button */}
        <div className="flex items-center gap-3 self-start lg:self-center">
          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg bg-surface-elevated p-1 border border-border/80 text-xs">
            <button
              type="button"
              onClick={() => onModeChange('WORKSPACE')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                mode === 'WORKSPACE'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              全店巡检 (Workspace)
            </button>
            <button
              type="button"
              onClick={() => onModeChange('SKU')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                mode === 'SKU'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              单品聚焦 (SKU)
            </button>
          </div>

          {/* Trigger Button */}
          {!isViewer ? (
            <button
              type="button"
              onClick={() => onRunDiagnosis(mode)}
              disabled={isRunning}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-xs transition shadow-sm ${
                isRunning
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
              }`}
            >
              {isRunning ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>诊断运行中...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>执行日常诊断</span>
                </>
              )}
            </button>
          ) : (
            <span className="text-xs text-gray-500 bg-surface-elevated px-3 py-2 rounded-md border border-border flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
              只读模式 (Viewer)
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
