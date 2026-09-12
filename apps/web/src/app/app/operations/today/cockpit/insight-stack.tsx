'use client';

import React, { useState } from 'react';
import type { OperationsInsightCard } from '@crosspilot/shared';
import { StatusPill } from '@/components/ui/page-header';
import { getSeverityLabel } from '@/constants/ui-labels';
import { cn } from '@/lib/cn';

function tone(severity: OperationsInsightCard['severity']): 'danger' | 'warning' | 'neutral' {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'neutral';
}

export function InsightStack({
  title,
  kicker,
  cards,
  empty,
}: {
  title: string;
  kicker: string;
  cards: OperationsInsightCard[];
  empty: string;
}) {
  const [openId, setOpenId] = useState<string | null>(cards[0]?.id ?? null);

  if (!cards.length) {
    return (
      <section className="cp-panel px-5 py-6">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-[13px] text-fg-muted">{empty}</p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-[13px] text-fg-muted">{kicker}</p>
      </div>
      <div className="space-y-2">
        {cards.map((card) => {
          const open = openId === card.id;
          return (
            <article
              key={card.id}
              className={cn(
                'cp-panel overflow-hidden',
                card.severity === 'CRITICAL' && 'border-rose-500/30',
                card.severity === 'WARNING' && 'border-amber-500/25',
              )}
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : card.id)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={tone(card.severity)}>{getSeverityLabel(card.severity)}</StatusPill>
                    <StatusPill>{card.source}</StatusPill>
                  </div>
                  <h3 className="mt-2 text-[15px] font-semibold tracking-tight">{card.title}</h3>
                  <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-fg-muted">{card.problem}</p>
                </div>
                <span className="mt-1 text-[12px] text-fg-muted">{open ? '收起' : '证据'}</span>
              </button>
              {open ? (
                <div className="grid gap-4 border-t border-border px-5 py-4 md:grid-cols-2">
                  <Block label="问题" body={card.problem} />
                  <Block label="影响" body={card.impact} />
                  <Block
                    label="证据"
                    body={card.evidence.length ? card.evidence.join('\n') : '未存证据原文'}
                  />
                  <Block label="建议" body={card.recommendation} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted">{label}</div>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-fg">{body}</p>
    </div>
  );
}
