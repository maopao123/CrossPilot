'use client';

import React from 'react';
import type { OperationsVocView } from '@crosspilot/shared';
import { Button } from '@/components/ui/button';

export function VocPanel({
  voc,
  isViewer,
  busy,
  onAnalyze,
}: {
  voc: OperationsVocView | null;
  isViewer: boolean;
  busy: boolean;
  onAnalyze: () => Promise<void>;
}) {
  const pains = voc?.painPoints ?? [];
  const sample = voc?.sampleSize ?? 0;
  const freq = sample > 0 && pains.length > 0 ? Math.round((pains.length / sample) * 100) : null;

  return (
    <section className="cp-panel px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Customer voice</h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Pain points from recent reviews. This is pattern matching, not a live scrape.
          </p>
        </div>
        {!isViewer ? (
          <Button variant="secondary" disabled={busy || !voc?.recentReviews.length} onClick={onAnalyze}>
            {busy ? 'Analyzing…' : 'Re-run VOC'}
          </Button>
        ) : null}
      </div>

      {!voc || (!pains.length && !voc.listingSuggestion) ? (
        <p className="mt-4 text-[13px] text-fg-muted">No VOC sample in this workspace yet.</p>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {pains.slice(0, 3).map((pain) => (
              <div key={pain} className="border-l-2 border-amber-500/50 pl-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted">Problem</div>
                <p className="mt-1 text-[14px] leading-relaxed">{pain}</p>
                {freq !== null ? (
                  <p className="mt-2 text-[12px] text-fg-muted">Frequency in sample {freq}%</p>
                ) : null}
              </div>
            ))}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-muted">Listing suggestion</div>
            <p className="mt-1 text-[13px] leading-relaxed">
              {voc.listingSuggestion || voc.productImprovement || 'No listing rewrite stored'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
