'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { AccessibleDialog } from '../../../../../components/accessible-dialog';

interface OccConflictModalProps {
  isOpen: boolean;
  message?: string;
  isActionAlreadyDecided?: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

export function OccConflictModal({
  isOpen,
  message,
  isActionAlreadyDecided = false,
  onRefresh,
  onClose,
}: OccConflictModalProps) {
  return (
    <AccessibleDialog
      open={isOpen}
      onClose={onClose}
      titleId="occ-conflict-title"
      descriptionId="occ-conflict-desc"
      role="alertdialog"
      panelClassName="relative bg-surface border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-gray-200 text-xs"
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 id="occ-conflict-title" className="text-base font-bold text-white tracking-tight">
            {isActionAlreadyDecided ? '行动已完成决断' : '数据版本冲突'}
          </h3>
          <p id="occ-conflict-desc" className="text-xs text-gray-300 mt-1 leading-relaxed">
            {isActionAlreadyDecided
              ? '该行动已被其他操作完成。已展示最新状态，请勿重复提交。'
              : '当前任务已被其他操作更新。请刷新最新状态后重新操作。'}
          </p>
        </div>
      </div>

      {message && (
        <div className="bg-surface-elevated/70 p-3 rounded-lg border border-border/70 text-[11px] text-gray-400">
          {message}
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 bg-surface-elevated hover:text-white transition"
        >
          稍后处理
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition active:scale-95 flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refresh Latest State / 立即刷新最新状态</span>
        </button>
      </div>
    </AccessibleDialog>
  );
}
