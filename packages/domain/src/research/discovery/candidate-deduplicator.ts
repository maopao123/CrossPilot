/**
 * Candidate Deduplicator for Product Research Auto Discovery MVP
 * Merges redundant candidate opportunities and consolidates keyword & ASIN evidence.
 * Conforms to PRODUCT_RESEARCH_AUTO_DISCOVERY_MVP_SPEC.md §32 & §55 (Cases 3, 4, 5).
 */

import type { CandidateDraft, CandidateDedupResult } from '@crosspilot/shared';
import { KeywordNormalizer } from './keyword-normalizer.js';

export class CandidateDeduplicator {
  static deduplicate(candidates: CandidateDraft[]): {
    drafts: CandidateDraft[];
    dedupResults: CandidateDedupResult[];
  } {
    if (candidates.length <= 1) {
      return { drafts: [...candidates], dedupResults: [] };
    }

    const dedupResults: CandidateDedupResult[] = [];
    const mergedIds = new Set<string>();

    const working = candidates.map((c) => ({ ...c }));

    for (let i = 0; i < working.length; i++) {
      const draftA = working[i];
      if (mergedIds.has(draftA.id)) continue;

      const mergedForA: string[] = [];
      const reasonsForA: string[] = [];

      for (let j = i + 1; j < working.length; j++) {
        const draftB = working[j];
        if (mergedIds.has(draftB.id)) continue;

        const isExactDedupKey = draftA.dedupKey === draftB.dedupKey;

        // Check shared ASIN Jaccard
        const asinsA = new Set(draftA.representativeAsins);
        const asinsB = new Set(draftB.representativeAsins);
        let sharedAsins = 0;
        for (const asin of asinsA) {
          if (asinsB.has(asin)) sharedAsins++;
        }
        const totalAsins = new Set([...asinsA, ...asinsB]).size;
        const asinJaccard = totalAsins > 0 ? sharedAsins / totalAsins : 0;

        // Check token similarity of primary keywords and product types
        const tokenSim = KeywordNormalizer.calculateTokenSimilarity(draftA.primaryKeyword, draftB.primaryKeyword);
        const typeSim = KeywordNormalizer.calculateTokenSimilarity(draftA.productType, draftB.productType);

        let shouldMerge = false;
        let reason = '';

        if (isExactDedupKey) {
          shouldMerge = true;
          reason = `Identical canonical product dedup key (${draftA.dedupKey})`;
        } else if (typeSim >= 0.7 && asinJaccard >= 0.35) {
          shouldMerge = true;
          reason = `High product type similarity (${typeSim.toFixed(2)}) and shared ASIN overlap (${asinJaccard.toFixed(2)})`;
        } else if (tokenSim >= 0.8 && sharedAsins > 0) {
          shouldMerge = true;
          reason = `High keyword token similarity (${tokenSim.toFixed(2)}) with shared competitor presence`;
        }

        if (shouldMerge) {
          // Merge draftB into draftA
          for (const kw of [draftB.primaryKeyword, ...draftB.supportingKeywords]) {
            if (!draftA.supportingKeywords.includes(kw) && kw !== draftA.primaryKeyword) {
              draftA.supportingKeywords.push(kw);
            }
          }

          for (const asin of draftB.representativeAsins) {
            if (!draftA.representativeAsins.includes(asin)) {
              draftA.representativeAsins.push(asin);
            }
          }

          for (const eviId of draftB.evidenceIds) {
            if (!draftA.evidenceIds.includes(eviId)) {
              draftA.evidenceIds.push(eviId);
            }
          }

          // Update metric counts
          draftA.discoveryMetrics.keywordCount = draftA.supportingKeywords.length + 1;
          draftA.discoveryMetrics.asinSampleSize = draftA.representativeAsins.length;

          // If draftB had demand and draftA didn't, adopt it
          if (!draftA.discoveryMetrics.demand?.value && draftB.discoveryMetrics.demand?.value) {
            draftA.discoveryMetrics.demand = draftB.discoveryMetrics.demand;
          }

          mergedIds.add(draftB.id);
          mergedForA.push(draftB.id);
          reasonsForA.push(reason);
        }
      }

      if (mergedForA.length > 0) {
        dedupResults.push({
          keptCandidateId: draftA.id,
          mergedCandidateIds: mergedForA,
          reasons: reasonsForA,
        });
      }
    }

    const dedupedDrafts = working.filter((d) => !mergedIds.has(d.id));
    return {
      drafts: dedupedDrafts,
      dedupResults,
    };
  }
}
