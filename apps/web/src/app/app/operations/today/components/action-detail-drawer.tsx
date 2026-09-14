'use client';

import React, { useState } from 'react';
import {
  RecommendedAction,
  OperationEvidenceItem,
  ImpactType,
  CausalStrength,
} from '@crosspilot/shared';
import { AccessibleDialog } from '../../../../../components/accessible-dialog';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Clock,
  Layers,
  FileText,
  Activity,
  Check,
  MinusCircle,
  HelpCircle,
} from 'lucide-react';

interface ActionDetailDrawerProps {
  action: RecommendedAction | null;
  onClose: () => void;
  onApprove: (action: RecommendedAction, note?: string) => void;
  onReject: (action: RecommendedAction, note?: string) => void;
  onDismiss: (action: RecommendedAction, note?: string) => void;
  isViewer?: boolean;
  busyActionId?: string | null;
}

export function ActionDetailDrawer({
  action,
  onClose,
  onApprove,
  onReject,
  onDismiss,
  isViewer = false,
  busyActionId = null,
}: ActionDetailDrawerProps) {
  const [decisionNote, setDecisionNote] = useState('');

  if (!action) return null;

  const isProposed = action.status === 'PROPOSED';
  const isApprovalRequired = action.executionMode === 'APPROVAL_REQUIRED';

  const getCausalStrengthLabel = (strength?: CausalStrength) => {
    switch (strength) {
      case 'PROVEN':
        return { label: '确证事实 (Confirmed)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'STRONG':
        return { label: '强因果证据 (Strong Evidence)', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
      case 'INDICATIVE':
        return { label: '指示性驱动 (Possible Driver)', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      default:
        return { label: '待确证 (Not Confirmed)', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30' };
    }
  };

  const getImpactTypeLabel = (impactType?: ImpactType) => {
    switch (impactType) {
      case 'MEASURED':
        return {
          title: '实测损失 (Measured Fact)',
          desc: '数据为已发生的实际消耗或账面直接损失',
          badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        };
      case 'ESTIMATED':
        return {
          title: '预估收益/损失 (Estimated Value)',
          desc: '基于历史均值或动销模型演算推导出的机会损失',
          badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        };
      case 'QUALITATIVE':
      default:
        return {
          title: '定性收益 (Qualitative Impact)',
          desc: '客户满意度改善、预期对齐或风控合规防御',
          badgeClass: 'bg-gray-700/50 text-gray-300 border-gray-600/40',
        };
    }
  };

  const impactInfo = getImpactTypeLabel(action.impactType);
  const busy = busyActionId === action.actionId || !!busyActionId;

  return (
    <AccessibleDialog
      open
      onClose={onClose}
      titleId="action-drawer-title"
      descriptionId="action-drawer-desc"
      className="fixed inset-0 z-50 overflow-hidden"
      panelClassName="fixed inset-y-0 right-0 w-screen max-w-2xl bg-surface border-l border-border shadow-2xl flex flex-col outline-none"
    >
        <div className="w-full h-full flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center justify-between bg-surface-elevated">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-blue-300 bg-blue-950/40 px-2.5 py-1 rounded border border-blue-800/40">
                {action.skuId}
              </span>
              <span className="text-xs text-gray-300 font-medium">
                {action.category}
              </span>
              <span className="text-[11px] text-gray-400 bg-surface px-2 py-0.5 rounded border border-border">
                {action.actionType}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-surface transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-gray-200">
            {/* 1. Action Overview */}
            <div className="bg-surface-elevated/40 p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-2">
                <span id="action-drawer-title" className="text-xs font-semibold text-white">推荐行动 (Recommended Action)</span>
                <span className="text-[11px] font-mono text-gray-400">ID: {action.actionId}</span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight leading-snug">
                {action.title}
              </h2>
              <p id="action-drawer-desc" className="text-xs text-gray-300 mt-2 leading-relaxed">
                {action.reason}
              </p>

              {action.targetEntity && (
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-[11px] text-gray-400">
                  <span>操作目标实体:</span>
                  <span className="font-semibold text-white">{action.targetEntity}</span>
                  {action.targetId && (
                    <span className="font-mono text-blue-300">({action.targetId})</span>
                  )}
                </div>
              )}
            </div>

            {/* 2. Impact & Risk Analysis */}
            <div className="bg-surface-elevated/40 p-4 rounded-xl border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">影响量化与风险评估</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${impactInfo.badgeClass}`}>
                  {impactInfo.title}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-surface p-3 rounded-lg border border-border/60">
                  <span className="text-[11px] text-gray-400">财务影响</span>
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {action.impactAmount !== undefined
                      ? `$${Math.abs(action.impactAmount).toLocaleString()}`
                      : action.expectedImpact || '定性改善'}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{impactInfo.desc}</p>
                </div>

                <div className="bg-surface p-3 rounded-lg border border-border/60">
                  <span className="text-[11px] text-gray-400">执行风险等级</span>
                  <div className="text-lg font-bold text-white mt-1">
                    {action.riskLevel === 'HIGH' ? (
                      <span className="text-rose-400">高风险 (HIGH)</span>
                    ) : action.riskLevel === 'MEDIUM' ? (
                      <span className="text-amber-400">中风险 (MEDIUM)</span>
                    ) : (
                      <span className="text-emerald-400">低风险 (LOW)</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    模式: {action.executionMode === 'APPROVAL_REQUIRED' ? '需人工审批' : '参考建议'}
                  </p>
                </div>
              </div>
            </div>

            {/* Automation Execution Evidence Card */}
            {((action as any).executionEvidence || (action as any).parameters?._evidence || (action as any).metadata?.executionEvidence) && (() => {
              const exec = (action as any).executionEvidence || (action as any).parameters?._evidence || (action as any).metadata?.executionEvidence;
              const isNeedsAttention = exec.phase === 'NEEDS_ATTENTION';
              return (
                <div className={`p-4 rounded-xl border ${isNeedsAttention ? 'bg-rose-500/10 border-rose-500/30' : 'bg-surface-elevated/40 border-border'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`w-4 h-4 ${isNeedsAttention ? 'text-rose-400' : 'text-emerald-400'}`} />
                      <span className="text-xs font-semibold text-white">执行真实性证据 (Execution Truthfulness)</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-gray-300">
                      {(exec.mode || '未知')} / {(exec.provider || '未知')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-2">
                    <div className="bg-surface p-2 rounded border border-border/40">
                      <span className="text-gray-400">执行阶段: </span>
                      <span className={`font-semibold ${exec.phase === 'COMPLETED' ? 'text-emerald-400' : isNeedsAttention ? 'text-rose-400' : 'text-amber-400'}`}>
                        {exec.phase}
                      </span>
                    </div>
                    <div className="bg-surface p-2 rounded border border-border/40">
                      <span className="text-gray-400">生效判定: </span>
                      <span className={`font-semibold ${exec.effect === 'APPLIED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {exec.effect}
                      </span>
                    </div>
                    {exec.externalId && (
                      <div className="col-span-2 bg-surface p-2 rounded border border-border/40">
                        <span className="text-gray-400">外部实体单号: </span>
                        <span className="text-white font-medium">{exec.externalId}</span>
                      </div>
                    )}
                    {exec.verifiedAt && (
                      <div className="col-span-2 bg-surface p-2 rounded border border-border/40">
                        <span className="text-gray-400">验证时刻: </span>
                        <span className="text-gray-300">{exec.verifiedAt}</span>
                      </div>
                    )}
                  </div>

                  {isNeedsAttention && (
                    <div className="mt-2 text-xs text-rose-300 flex items-start gap-2 bg-rose-950/30 p-2.5 rounded-lg border border-rose-500/20">
                      <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">需要人工介入处理 (NEEDS_ATTENTION):</span>
                        <p className="mt-0.5">重试已达上限或操作失败 (恢复策略: {exec.recovery || 'MANUAL'})，请核查外部 ERP 系统或转由人工审批流跟进。</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. Evidence Drilldown (Direct Business Facts) */}
            <div className="bg-surface-elevated/40 p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-white">支撑证据链 (Supporting Evidence)</span>
                </div>
                <span className="text-[10px] text-gray-400">纯代码确定性事实，禁止虚构</span>
              </div>

              {action.evidence && action.evidence.length > 0 ? (
                <div className="space-y-2">
                  {action.evidence.map((evi: OperationEvidenceItem, idx: number) => {
                    const confidenceVal = (evi.metadata?.causalConfidence as CausalStrength) || (evi.metadata?.confidence as CausalStrength);
                    const conf = getCausalStrengthLabel(confidenceVal);
                    return (
                      <div
                        key={idx}
                        className="bg-surface p-3 rounded-lg border border-border/60 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white text-xs">{evi.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${conf.color}`}>
                            {conf.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">{evi.content}</p>
                        {evi.metadata && Object.keys(evi.metadata).length > 0 && (
                          <div className="mt-2 bg-surface-elevated/70 p-2 rounded font-mono text-[11px] text-gray-300 grid grid-cols-2 gap-2 border border-border/40">
                            {Object.entries(evi.metadata).map(([k, v]) => (
                              <div key={k} className="truncate">
                                <span className="text-gray-500">{k}: </span>
                                <span className="text-white font-medium">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-xs py-2">无直接证据明细项</p>
              )}
            </div>

            {/* 4. Conflict / Guard Warnings */}
            {action.conflictDetected && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">检测到行动冲突:</span>
                  <p className="mt-0.5">{action.conflictReason || '与其他建议存在业务互斥，请审慎核对'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer / HITL Actions */}
          <div className="p-5 border-t border-border bg-surface-elevated flex flex-col gap-3">
            {/* Note input for decisions */}
            {isProposed && isApprovalRequired && !isViewer && (
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">
                  审批或驳回附言 (可选):
                </label>
                <input
                  type="text"
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="如：经与供应链主管确认，下周到货延迟..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              {/* Left: Strict invariant disclaimer */}
              <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span>审批不会直接修改外部系统 (Approval ≠ Execute)</span>
              </div>

              {/* Right: Action Buttons */}
              <div className="flex items-center gap-2">
                {isProposed && isApprovalRequired && !isViewer ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDismiss(action, decisionNote)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-surface border border-border hover:bg-surface-elevated transition disabled:opacity-50"
                    >
                      忽略 (Dismiss)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onReject(action, decisionNote)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition disabled:opacity-50"
                    >
                      驳回 (Reject)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onApprove(action, decisionNote)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition active:scale-95 disabled:opacity-50"
                    >
                      批准 (Approve)
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-surface border border-border hover:text-white transition"
                  >
                    关闭
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
    </AccessibleDialog>
  );
}
