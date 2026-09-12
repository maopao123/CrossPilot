'use client';

import React, { useState } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import {
  DailyOperationWorkflowStep,
  WorkflowExecutionStatus,
  WorkflowStepTrace,
} from '@crosspilot/shared';

interface WorkflowProgressBannerProps {
  status: WorkflowExecutionStatus | null;
  currentStep?: DailyOperationWorkflowStep;
  stepTraces?: WorkflowStepTrace[];
  lastEventMessage?: string;
  isStreaming?: boolean;
}

const STEP_LABELS: Record<DailyOperationWorkflowStep, string> = {
  VALIDATE_INPUT: '1. 校验输入与分析周期',
  RESOLVE_SKUS: '2. 解析目标 SKU 范围',
  LOAD_CONTEXT: '3. 跨域装配 SKU 360 业务事实',
  DETECT_SIGNALS: '4. 确定性异常信号侦测',
  DIAGNOSE: '5. 多域根因归因与因果链诊断',
  RECOMMEND: '6. 生成跨域行动建议与风险评分',
  AGGREGATE: '7. 跨 SKU 优先级排序与指标汇总',
  APPROVAL_GATE: '8. 人工审批把关门禁 (HITL)',
  FINALIZE: '9. 固化审计轨迹与工作流结案',
};

export function WorkflowProgressBanner({
  status,
  currentStep,
  stepTraces = [],
  lastEventMessage,
  isStreaming = false,
}: WorkflowProgressBannerProps) {
  const [showTraces, setShowTraces] = useState(false);

  if (!status || (status === 'COMPLETED' && !isStreaming && !showTraces)) {
    return null;
  }

  const isRunning = status === 'RUNNING';
  const isWaitingApproval = status === 'WAITING_APPROVAL';

  const getStepProgressMessage = () => {
    if (lastEventMessage) return lastEventMessage;
    switch (currentStep) {
      case 'VALIDATE_INPUT':
        return '正在校验站点与时间周期参数...';
      case 'RESOLVE_SKUS':
        return '正在解析需分析的活跃产品 SKU 列表...';
      case 'LOAD_CONTEXT':
        return '正在跨域装配 SKU 360 业务事实 (广告/库存/利润/VOC)...';
      case 'DETECT_SIGNALS':
        return '正在通过纯代码规则引擎扫描异常信号...';
      case 'DIAGNOSE':
        return '正在分析根因驱动模型与因果关系...';
      case 'RECOMMEND':
        return '正在根据因果诊断生成行动建议与风险把关...';
      case 'AGGREGATE':
        return '正在执行跨 SKU 优先级与财务影响排序...';
      case 'APPROVAL_GATE':
        return 'DAG 执行完毕，等待人工操作员审批核心建议...';
      case 'FINALIZE':
        return '正在固化持久化检查点与数据库同步...';
      default:
        return 'DAG 工作流执行中...';
    }
  };

  return (
    <div className="bg-surface border border-blue-500/30 rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
            {isRunning ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : isWaitingApproval ? (
              <Clock className="w-4 h-4 text-amber-400" />
            ) : (
              <Activity className="w-4 h-4 text-emerald-400" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">
                WF-05 运行状态:
              </span>
              <span
                className={`text-xs font-mono font-medium ${
                  isRunning
                    ? 'text-blue-400'
                    : isWaitingApproval
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {status}
              </span>
              {currentStep && (
                <span className="text-[11px] bg-surface-elevated text-gray-300 px-2 py-0.5 rounded border border-border">
                  {STEP_LABELS[currentStep] || currentStep}
                </span>
              )}
            </div>

            <p className="text-xs text-gray-300 mt-0.5">
              {getStepProgressMessage()}
            </p>
          </div>
        </div>

        {/* Toggle Step Details */}
        {stepTraces.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTraces(!showTraces)}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1 bg-surface-elevated/70 px-2.5 py-1.5 rounded-md border border-border transition"
          >
            <span>{showTraces ? '收起步骤轨迹' : '查看执行轨迹'}</span>
            {showTraces ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Collapsible Step Traces */}
      {showTraces && stepTraces.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {stepTraces.map((trace, idx) => (
              <div
                key={idx}
                className="bg-surface-elevated/50 p-2.5 rounded-lg border border-border/40 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {trace.status === 'COMPLETED' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  ) : trace.status === 'RUNNING' ? (
                    <RotateCcw className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
                  ) : trace.status === 'FAILED' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  )}
                  <span className="text-gray-200 truncate font-medium">
                    {STEP_LABELS[trace.step] || trace.step}
                  </span>
                </div>
                {trace.durationMs !== undefined && (
                  <span className="text-[10px] text-gray-400 font-mono flex-shrink-0 ml-2">
                    {trace.durationMs}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
