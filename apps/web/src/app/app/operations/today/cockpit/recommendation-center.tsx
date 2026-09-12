'use client';

import React, { useState } from 'react';
import type { OperationsRecommendationView, PlannedActionRecord } from '@crosspilot/shared';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/page-header';
import { getStatusLabel } from '@/constants/ui-labels';

function pillTone(status: string): 'warning' | 'success' | 'accent' | 'neutral' | 'danger' {
  if (status === 'WAITING_APPROVAL' || status === 'GENERATED' || status === 'CREATED' || status === 'EXECUTING') {
    return 'warning';
  }
  if (status === 'APPROVED' || status === 'EXECUTED' || status === 'VERIFIED' || status === 'SUCCESS') {
    return 'success';
  }
  if (status === 'REJECTED' || status === 'FAILED') return 'danger';
  return 'neutral';
}

export function RecommendationCenter({
  items,
  isViewer,
  busyId,
  onApprove,
  onDraftFromVoc,
  canDraft,
  draftBusy,
  onPlan,
  onPlanAcos,
  onApproveAction,
  onExecuteAction,
  actionBusyId,
}: {
  items: OperationsRecommendationView[];
  isViewer: boolean;
  busyId: string | null;
  onApprove: (id: string) => Promise<void>;
  onDraftFromVoc?: () => Promise<void>;
  canDraft?: boolean;
  draftBusy?: boolean;
  onPlan?: (recommendationId: string) => Promise<void>;
  onPlanAcos?: () => Promise<void>;
  onApproveAction?: (actionId: string) => Promise<void>;
  onExecuteAction?: (actionId: string) => Promise<void>;
  actionBusyId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(
    items.find((item) => item.action?.status === 'WAITING_APPROVAL' || item.status === 'WAITING_APPROVAL')?.id ??
      items[0]?.id ??
      null,
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Recommended actions</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Recommendation is why. The planned action is what the mock executor will run. Amazon is never written.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDraft && onDraftFromVoc ? (
            <Button variant="secondary" disabled={draftBusy} onClick={onDraftFromVoc}>
              {draftBusy ? 'Drafting…' : 'Draft from VOC'}
            </Button>
          ) : null}
          {!isViewer && onPlanAcos ? (
            <Button variant="secondary" disabled={!!actionBusyId} onClick={onPlanAcos}>
              {actionBusyId === 'plan-acos' ? 'Planning…' : 'Plan ACOS action'}
            </Button>
          ) : null}
        </div>
      </div>

      {!items.length ? (
        <div className="cp-panel px-5 py-6">
          <p className="text-[13px] text-fg-muted">No recommendations yet. Plan an ACOS bid decrease to run the Action Layer demo.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const open = openId === item.id;
            const canApprove = !isViewer && item.status === 'WAITING_APPROVAL';
            return (
              <article key={item.id} className="cp-panel">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={pillTone(item.status)}>{getStatusLabel(item.status)}</StatusPill>
                      <span className="text-[12px] text-fg-muted">{item.generatedBy}</span>
                    </div>
                    <h3 className="mt-2 text-[15px] font-semibold tracking-tight">{item.decision}</h3>
                    <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-fg-muted">{item.reason}</p>
                    {item.action ? <ActionSummary action={item.action} /> : null}
                  </div>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-border px-5 py-4">
                    <Meta label="Reason" value={item.reason} />
                    <Meta
                      label="Evidence"
                      value={item.evidenceQuotes.length ? item.evidenceQuotes.join('\n') : 'No evidence quotes stored'}
                    />
                    {item.action ? <ActionDetail action={item.action} /> : (
                      <p className="text-[13px] text-fg-muted">No structured action yet. Planner will only accept a whitelisted action_type.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {canApprove ? (
                        <Button disabled={busyId === item.id} onClick={() => onApprove(item.id)}>
                          {busyId === item.id ? 'Confirming…' : 'Confirm recommendation'}
                        </Button>
                      ) : null}
                      {!isViewer && !item.action && onPlan ? (
                        <Button variant="secondary" disabled={!!actionBusyId} onClick={() => onPlan(item.id)}>
                          Plan action
                        </Button>
                      ) : null}
                      {!isViewer && item.action?.status === 'WAITING_APPROVAL' && onApproveAction ? (
                        <Button disabled={actionBusyId === item.action.id} onClick={() => onApproveAction(item.action!.id)}>
                          {actionBusyId === item.action.id ? 'Approving…' : 'Approve action'}
                        </Button>
                      ) : null}
                      {!isViewer && item.action?.status === 'APPROVED' && onExecuteAction ? (
                        <Button disabled={actionBusyId === item.action.id} onClick={() => onExecuteAction(item.action!.id)}>
                          {actionBusyId === item.action.id ? 'Executing…' : 'Run mock executor'}
                        </Button>
                      ) : null}
                      {isViewer && item.action?.status === 'WAITING_APPROVAL' ? (
                        <p className="text-[12px] text-fg-muted">VIEWER can read the planned action but cannot approve or execute.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ActionSummary({ action }: { action: PlannedActionRecord }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-fg-muted">
      <StatusPill tone={pillTone(action.status)}>{getStatusLabel(action.status)}</StatusPill>
      <span>{action.lastMessage || action.actionType}</span>
      <span>Risk {action.riskLevel}</span>
    </div>
  );
}

function ActionDetail({ action }: { action: PlannedActionRecord }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-elevated px-4 py-3">
      <Meta label="Generated action" value={action.lastMessage || action.actionType} />
      <Meta label="Risk" value={action.riskLevel} />
      <Meta label="Approval" value={action.needApproval ? 'Required' : 'Not required'} />
      <Meta label="Execution" value={action.status === 'SUCCESS' ? 'SUCCESS' : action.status === 'FAILED' ? 'FAILED' : 'Pending'} />
      <Meta
        label="Target"
        value={JSON.stringify(action.target)}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted">{label}</div>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed">{value}</p>
    </div>
  );
}
