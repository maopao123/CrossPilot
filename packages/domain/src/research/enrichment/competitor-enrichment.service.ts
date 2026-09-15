import type { CandidateDraft, CompetitorSnapshot, ProvenanceValue } from '@crosspilot/shared';
import { DEFAULT_MAX_COMPETITORS, HARD_MAX_COMPETITORS } from '@crosspilot/shared';

export class CompetitorEnrichmentService {
  static selectAsins(draft: CandidateDraft, maxCompetitors?: number): string[] {
    const cap = Math.min(HARD_MAX_COMPETITORS, Math.max(1, maxCompetitors ?? DEFAULT_MAX_COMPETITORS));
    const seen = new Set<string>();
    const selected: string[] = [];
    for (const raw of draft.representativeAsins || []) {
      const asin = (raw || '').trim();
      if (!asin || seen.has(asin)) continue;
      seen.add(asin);
      selected.push(asin);
      if (selected.length >= cap) break;
    }
    return selected;
  }

  static toNullableFact<T>(value: T | null | undefined, evidenceId?: string): ProvenanceValue<T> | undefined {
    if (value == null || value === ('' as any)) {
      return { value: null, source: 'UNKNOWN', evidenceId };
    }
    return { value, source: 'FACT', evidenceId };
  }

  static toSnapshot(params: {
    asin: string;
    title?: string | null;
    price?: number | null;
    rating?: number | null;
    reviewCount?: number | null;
    trendDirection?: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';
    sourceKeywordIds: string[];
    evidenceIds: string[];
    trendEvidenceIds?: string[];
  }): CompetitorSnapshot {
    const snapshot: CompetitorSnapshot = {
      asin: params.asin,
      sourceKeywordIds: [...params.sourceKeywordIds],
      evidenceIds: [...params.evidenceIds],
    };
    snapshot.title = this.toNullableFact(params.title ?? null, params.evidenceIds[0]);
    snapshot.price = this.toNullableFact(params.price ?? null, params.evidenceIds[0]);
    snapshot.rating = this.toNullableFact(params.rating ?? null, params.evidenceIds[0]);
    snapshot.reviewCount = this.toNullableFact(params.reviewCount ?? null, params.evidenceIds[0]);
    if (params.trendDirection) {
      snapshot.trend = {
        direction: params.trendDirection,
        evidenceIds: params.trendEvidenceIds || [],
      };
    }
    return snapshot;
  }
}
