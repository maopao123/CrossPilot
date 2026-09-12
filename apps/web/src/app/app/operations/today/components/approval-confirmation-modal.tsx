'use client';

import React from 'react';
import { RecommendedAction } from '@crosspilot/shared';
import { AlertOctagon, ShieldAlert, Check } from 'lucide-react';
import { AccessibleDialog } from '../../../../../components/accessible-dialog';

interface ApprovalConfirmationModalProps {
  action: RecommendedAction | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ApprovalConfirmationModal({
  action,
  onConfirm,
  onCancel,
  busy = false,
}: ApprovalConfirmationModalProps) {
  const recommendedQty =
    (action?.payload as any)?.recommendedQuantity ||
    (action?.payload as any)?.quantity ||
    action?.evidence?.find((e) => (e.metadata as any)?.recommendedQuantity)
      ?.metadata?.recommendedQuantity;

  return (
    <AccessibleDialog
      open={!!action}
      onClose={onCancel}
      titleId="approval-title"
      descriptionId="approval-desc"
      role="alertdialog"
      panelClassName="relative bg-surface border border-rose-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-gray-200 text-xs"
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
          <AlertOctagon className="w-6 h-6" />
        </div>
        <div>
          <h3 id="approval-title" className="text-base font-bold text-white tracking-tight">
            高风险行动审批确认
          </h3>
          <p id="approval-desc" className="text-xs text-gray-400 mt-0.5">
            该建议涉及重大资金变动或核心库存变动，需负责人二次确认。
          </p>
        </div>
      </div>

      {action && (
        <div className="bg-surface-elevated/70 p-4 rounded-xl border border-border/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 font-medium">目标 SKU:</span>
            <span className="font-mono font-bold text-blue-300 text-sm">
              {action.skuId}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 font-medium">行动标题:</span>
            <span className="font-semibold text-white truncate max-w-[280px]">
              {action.title}
            </span>
          </div>
          {recommendedQty !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 font-medium">推荐补货数量:</span>
              <span className="font-mono font-bold text-amber-300 text-sm">
                {recommendedQty} 件
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 font-medium">风险等级:</span>
            <span className="font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
              高风险 (HIGH RISK)
            </span>
          </div>
        </div>
      )}

      <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl flex items-start gap-2.5 text-amber-300">
        <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">重要提示：审批不等于真实执行 (Approval ≠ Execute)</p>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            本次批准仅确认该业务策略在 CrossPilot 决策层处于 APPROVED 状态，系统不会自动向 Amazon、ERP 或供应商下达采购订单。实际采购需在供应链模块按标准流程执行。
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-medium text-gray-300 bg-surface-elevated border border-border hover:text-white transition disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{busy ? '提交中...' : '确认批准 (Confirm Approval)'}</span>
        </button>
      </div>
    </AccessibleDialog>
  );
}
