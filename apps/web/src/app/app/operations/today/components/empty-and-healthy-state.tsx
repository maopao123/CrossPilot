'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { DailyOperationTaskSummaryDto } from '@crosspilot/shared';

interface EmptyAndHealthyStateProps {
  summary: DailyOperationTaskSummaryDto | null;
  onRetry?: () => void;
  isRunning?: boolean;
}

export function EmptyAndHealthyState({
  summary,
  onRetry,
  isRunning = false,
}: EmptyAndHealthyStateProps) {
  if (!summary) {
    return (
      <div className="bg-surface border border-border rounded-xl p-12 text-center my-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-fg">
          尚未执行今日诊断
        </h3>
        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
          点击右上角“执行日常诊断”，系统将全自动跨域拉取广告、库存、退货与利润指标，主动发现风险并生成行动建议。
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRunning}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition active:scale-95"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>立即执行全店诊断</span>
          </button>
        )}
      </div>
    );
  }

  // 1. Fully Healthy State (No Action Required)
  if (
    summary.healthStatus === 'HEALTHY' &&
    (!summary.actions || summary.actions.length === 0)
  ) {
    return (
      <div className="bg-surface border border-emerald-500/30 rounded-xl p-10 text-center my-6 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-fg">
          经营健康，暂无待办
        </h3>
        <p className="text-xs text-gray-300 mt-1 max-w-lg mx-auto leading-relaxed">
          本次诊断共评估了 {summary.skuSummary?.evaluated || 0} 款 SKU。广告 ACOS、周转库存可用天数、退货率及毛利率均在既定安全阈值内，无需采取人工干预措施。
        </p>

        <div className="flex items-center justify-center gap-6 mt-5 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>0 项 P1 紧急风险</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>0 项待审批建议</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>合规与风控状态良好</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Partial Success State
  if (summary.status === 'PARTIAL_SUCCESS') {
    return (
      <div className="bg-surface border border-amber-500/30 rounded-xl p-6 my-6 shadow-sm">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold tracking-tight text-fg">
              部分产品评估成功
            </h3>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              系统成功分析了 {summary.skuSummary?.evaluated || 0} 款 SKU，但有{' '}
              <span className="text-rose-400 font-bold">
                {summary.skuSummary?.failed || 0}
              </span>{' '}
              款 SKU 数据不完整或加载超时。已正常分析的 SKU 建议仍完整可用。
            </p>

            {summary.errors && summary.errors.length > 0 && (
              <div className="mt-3 bg-surface-elevated/80 p-3 rounded-lg border border-border text-xs text-rose-300 font-mono space-y-1">
                {summary.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Failed State
  if (summary.status === 'FAILED') {
    return (
      <div className="bg-surface border border-rose-500/30 rounded-xl p-8 text-center my-6 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold tracking-tight text-fg">
          诊断执行失败
        </h3>
        <p className="text-xs text-rose-300 mt-1 max-w-md mx-auto leading-relaxed">
          {summary.errors && summary.errors.length > 0
            ? summary.errors.join('; ')
            : '数据源装配或持久化事务中断，请检查网络与后端服务状态后重试。'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRunning}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition active:scale-95"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>重新执行诊断</span>
          </button>
        )}
      </div>
    );
  }

  return null;
}
