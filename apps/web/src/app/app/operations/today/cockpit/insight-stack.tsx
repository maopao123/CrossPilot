'use client';

import React, { useState } from 'react';
import type { OperationsInsightCard } from '@crosspilot/shared';
import { StatusPill } from '@/components/ui/page-header';
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
                    <StatusPill tone={tone(card.severity)}>{card.severity}</StatusPill>
                    <StatusPill>{card.source}</StatusPill>
                  </div>
                  <h3 className="mt-2 text-[15px] font-semibold tracking-tight">{card.title}</h3>
                  <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-fg-muted">{card.problem}</p>
                </div>
                <span className="mt-1 text-[12px] text-fg-muted">{open ? 'Hide' : 'Evidence'}</span>
              </button>
              {open ? (
                <div className="grid gap-4 border-t border-border px-5 py-4 md:grid-cols-2">
                  <Block label="Problem" body={card.problem} />
                  <Block label="Impact" body={card.impact} />
                  <Block
                    label="Evidence"
                    body={card.evidence.length ? card.evidence.join('\n') : 'No supporting quote stored'}
                  />
                  <Block label="Recommendation" body={card.recommendation} />
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
