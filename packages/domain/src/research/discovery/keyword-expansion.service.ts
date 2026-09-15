/**
 * Keyword Expansion Service for Product Research Auto Discovery MVP
 * Builds the Keyword <-> ASIN Graph with budget guards and evidence tracking.
 * Strictly adheres to Truthfulness: Missing data -> UNKNOWN, real sample sizes.
 */

import type {
  ProductDiscoveryRequest,
  KeywordNode,
  AsinNode,
  KeywordAsinEdge,
  DiscoveryBudgetState,
  EvidenceItem,
  ProvenanceValue,
} from '@crosspilot/shared';
import {
  DEFAULT_DISCOVERY_BUDGET,
  DEFAULT_DISCOVERY_LIMITS,
} from '@crosspilot/shared';
import { KeywordNormalizer } from './keyword-normalizer.js';

export interface CapabilityExecutor {
  execute<TInput = any, TOutput = any>(
    capabilityId: string,
    input: TInput,
    marketplace: string,
  ): Promise<{
    success: boolean;
    data?: TOutput;
    providerId?: string;
    costCredits?: number;
    isExpensive?: boolean;
    error?: { code: string; message: string };
  }>;
  hasCapability(capabilityId: string): boolean;
}

export interface ExpansionGraphResult {
  keywordNodes: KeywordNode[];
  asinNodes: AsinNode[];
  edges: KeywordAsinEdge[];
  evidence: EvidenceItem[];
  budgetState: DiscoveryBudgetState;
  missingCapabilities: string[];
  stats: {
    keywordsReceived: number;
    keywordsAccepted: number;
    keywordsDeduplicated: number;
    asinsReceived: number;
    asinsAccepted: number;
  };
}

export class KeywordExpansionService {
  constructor(private readonly executor?: CapabilityExecutor) {}

  async expand(
    request: ProductDiscoveryRequest,
    preloadedData?: {
      keywords?: Partial<KeywordNode>[];
      asins?: Partial<AsinNode>[];
      evidence?: EvidenceItem[];
    },
  ): Promise<ExpansionGraphResult> {
    const limits = {
      maxExpandedKeywords: request.limits?.maxExpandedKeywords ?? DEFAULT_DISCOVERY_LIMITS.maxExpandedKeywords,
      maxRepresentativeAsins: request.limits?.maxRepresentativeAsins ?? DEFAULT_DISCOVERY_LIMITS.maxRepresentativeAsins,
    };

    const budgetState: DiscoveryBudgetState = {
      maxProviderCalls: request.budget?.maxProviderCalls ?? DEFAULT_DISCOVERY_BUDGET.maxProviderCalls,
      usedProviderCalls: 0,
      maxCredits: request.budget?.maxCredits ?? DEFAULT_DISCOVERY_BUDGET.maxCredits,
      usedCredits: 0,
      maxExpensiveCalls: request.budget?.maxExpensiveCalls ?? DEFAULT_DISCOVERY_BUDGET.maxExpensiveCalls,
      usedExpensiveCalls: 0,
      stoppedByBudget: false,
    };

    const keywordMap = new Map<string, KeywordNode>();
    const asinMap = new Map<string, AsinNode>();
    const edges: KeywordAsinEdge[] = [];
    const evidenceList: EvidenceItem[] = [];
    const missingCapabilities = new Set<string>();

    let keywordsReceived = 0;
    let keywordsAccepted = 0;
    let keywordsDeduplicated = 0;
    let asinsReceived = 0;
    let asinsAccepted = 0;

    // Helper to check and consume budget
    const consumeBudget = (credits = 1, isExpensive = false): boolean => {
      if (budgetState.usedProviderCalls >= (budgetState.maxProviderCalls ?? Infinity)) {
        budgetState.stoppedByBudget = true;
        return false;
      }
      if (isExpensive && budgetState.usedExpensiveCalls >= (budgetState.maxExpensiveCalls ?? Infinity)) {
        budgetState.stoppedByBudget = true;
        return false;
      }
      if (budgetState.maxCredits != null && (budgetState.usedCredits ?? 0) + credits > budgetState.maxCredits) {
        budgetState.stoppedByBudget = true;
        return false;
      }

      budgetState.usedProviderCalls += 1;
      budgetState.usedCredits = (budgetState.usedCredits ?? 0) + credits;
      if (isExpensive) {
        budgetState.usedExpensiveCalls += 1;
      }
      return true;
    };

    // If preloaded fixtures are provided (for acceptance tests or offline fixtures)
    if (preloadedData?.evidence) {
      evidenceList.push(...preloadedData.evidence);
    }

    if (preloadedData?.asins) {
      for (const a of preloadedData.asins) {
        if (!a.asin) continue;
        asinsReceived++;
        asinMap.set(a.asin, {
          asin: a.asin,
          marketplace: a.marketplace || request.marketplace,
          title: a.title,
          price: a.price,
          rating: a.rating,
          reviewCount: a.reviewCount,
          sourceKeywords: a.sourceKeywords || [],
          discoveredKeywords: a.discoveredKeywords || [],
          evidenceIds: a.evidenceIds || [],
        });
        asinsAccepted++;
      }
    }

    if (preloadedData?.keywords) {
      for (const k of preloadedData.keywords) {
        if (!k.rawKeyword) continue;
        keywordsReceived++;
        const norm = KeywordNormalizer.normalize(k.rawKeyword);
        const existing = Array.from(keywordMap.values()).find((node) => node.normalizedKeyword === norm);
        if (existing) {
          keywordsDeduplicated++;
          // Merge representative ASINs and evidence
          if (k.representativeAsins) {
            for (const asin of k.representativeAsins) {
              if (!existing.representativeAsins.includes(asin)) {
                existing.representativeAsins.push(asin);
              }
            }
          }
          if (k.evidenceIds) {
            for (const eviId of k.evidenceIds) {
              if (!existing.evidenceIds.includes(eviId)) {
                existing.evidenceIds.push(eviId);
              }
            }
          }
        } else {
          const id = k.id || `kw-${request.marketplace.toLowerCase()}-${norm.replace(/\s+/g, '-')}`;
          keywordMap.set(id, {
            id,
            rawKeyword: k.rawKeyword,
            normalizedKeyword: norm,
            marketplace: k.marketplace || request.marketplace,
            origin: k.origin || 'KEYWORD_EXPANSION',
            metrics: {
              searchVolume: k.metrics?.searchVolume,
              abaRank: k.metrics?.abaRank,
              cpc: k.metrics?.cpc,
              competition: k.metrics?.competition,
              growth: k.metrics?.growth ?? { value: null, source: 'UNKNOWN' },
              trendDirection: k.metrics?.trendDirection ?? { value: 'UNKNOWN', source: 'UNKNOWN' },
            },
            representativeAsins: k.representativeAsins || [],
            evidenceIds: k.evidenceIds || [],
          });
          keywordsAccepted++;
        }
      }
    }

    // ==========================================
    // Multi-round Graph Expansion (Spec §12 & §13)
    // Round 0: Seed Keyword Search (Keyword -> ASIN)
    // Round 1: Seed ASIN Reverse Keywords (ASIN -> Keywords)
    // Round 2: High-Value Expanded Keyword Enrichment (Keyword -> ASIN)
    // ==========================================
    const seedRaw = request.seed.keyword.trim();
    const seedNorm = KeywordNormalizer.normalize(seedRaw);
    const seedId = `kw-${request.marketplace.toLowerCase()}-${seedNorm.replace(/\s+/g, '-')}`;

    if (!keywordMap.has(seedId) && this.executor) {
      keywordsReceived++;
      const hasKwSearch = this.executor.hasCapability('market.keyword.search');
      if (!hasKwSearch) {
        missingCapabilities.add('market.keyword.search');
      } else if (consumeBudget(1)) {
        try {
          // --- ROUND 0: Seed Keyword Search ---
          const callResult = await this.executor.execute('market.keyword.search', { keyword: seedRaw }, request.marketplace);
          if (callResult.success && callResult.data) {
            const rawList: any[] = Array.isArray(callResult.data)
              ? callResult.data
              : callResult.data
                ? [callResult.data]
                : [];

            const seedMetric =
              rawList.find((m: any) => m?.keyword && KeywordNormalizer.normalize(m.keyword) === seedNorm) ||
              rawList[0];

            const seedEviId = `evi-kw-${seedId}-${Date.now()}`;
            evidenceList.push({
              id: seedEviId,
              scope: 'KEYWORD',
              subjectId: seedId,
              source: callResult.providerId || 'XYDC',
              content: `Keyword search metric for "${seedRaw}": searchVolume=${seedMetric?.searchVolume ?? 'UNKNOWN'}, abaRank=${seedMetric?.abaRank ?? 'UNKNOWN'}`,
              capturedAt: new Date().toISOString(),
              confidence: 0.95,
            });

            const topAsins: string[] = Array.isArray(seedMetric?.topAsins) ? seedMetric.topAsins : [];
            const seedNode: KeywordNode = {
              id: seedId,
              rawKeyword: seedRaw,
              normalizedKeyword: seedNorm,
              marketplace: request.marketplace,
              origin: 'SEED',
              metrics: {
                searchVolume: seedMetric?.searchVolume != null ? { value: Number(seedMetric.searchVolume), source: 'FACT', evidenceId: seedEviId } : undefined,
                abaRank: seedMetric?.abaRank != null ? { value: Number(seedMetric.abaRank), source: 'FACT', evidenceId: seedEviId } : undefined,
                cpc: seedMetric?.cpc != null ? { value: Number(seedMetric.cpc), source: 'FACT', evidenceId: seedEviId } : undefined,
                competition: seedMetric?.competition != null ? { value: Number(seedMetric.competition), source: 'FACT', evidenceId: seedEviId } : undefined,
                growth: seedMetric?.growth != null ? { value: Number(seedMetric.growth), source: 'FACT', evidenceId: seedEviId } : { value: null, source: 'UNKNOWN' },
                trendDirection: seedMetric?.trendDirection ? { value: seedMetric.trendDirection, source: 'FACT', evidenceId: seedEviId } : { value: 'UNKNOWN', source: 'UNKNOWN' },
              },
              representativeAsins: topAsins,
              evidenceIds: [seedEviId],
            };
            keywordMap.set(seedId, seedNode);
            keywordsAccepted++;

            // Register Round 0 Top ASINs
            for (const asin of topAsins) {
              if (asinMap.size >= limits.maxRepresentativeAsins) break;
              asinsReceived++;
              if (!asinMap.has(asin)) {
                const asinEviId = `evi-asin-${asin}-${Date.now()}`;
                evidenceList.push({
                  id: asinEviId,
                  scope: 'PRODUCT',
                  subjectId: asin,
                  source: callResult.providerId || 'XYDC',
                  content: `Discovered representative ASIN ${asin} from seed keyword "${seedRaw}"`,
                  capturedAt: new Date().toISOString(),
                  confidence: 0.9,
                });
                asinMap.set(asin, {
                  asin,
                  marketplace: request.marketplace,
                  sourceKeywords: [seedRaw],
                  discoveredKeywords: [],
                  evidenceIds: [asinEviId],
                });
                asinsAccepted++;
              }
              edges.push({
                keywordId: seedId,
                asin,
                relation: 'TOP_ASIN',
                evidenceIds: [seedEviId],
              });
            }

            // Ingest additional related keywords from Round 0 response array
            for (const m of rawList) {
              if (!m?.keyword) continue;
              const mNorm = KeywordNormalizer.normalize(m.keyword);
              if (mNorm === seedNorm) continue;
              if (keywordMap.size >= limits.maxExpandedKeywords) break;

              // Filter out brand / accessory if constraint enabled
              if (request.constraints?.excludeBrandTerms && KeywordNormalizer.analyzeBrandTerms(m.keyword).isBrandDependent) continue;
              if (request.constraints?.excludeAccessoryIntent && (KeywordNormalizer.detectIntent(m.keyword) === 'ACCESSORY' || KeywordNormalizer.detectIntent(m.keyword) === 'REPLACEMENT')) continue;

              const mId = `kw-${request.marketplace.toLowerCase()}-${mNorm.replace(/\s+/g, '-')}`;
              if (!keywordMap.has(mId)) {
                keywordsReceived++;
                const mEviId = `evi-kw-${mId}-${Date.now()}`;
                evidenceList.push({
                  id: mEviId,
                  scope: 'KEYWORD',
                  subjectId: mId,
                  source: callResult.providerId || 'XYDC',
                  content: `Expanded keyword from seed search: "${m.keyword}", searchVolume=${m.searchVolume ?? 'UNKNOWN'}, abaRank=${m.abaRank ?? 'UNKNOWN'}`,
                  capturedAt: new Date().toISOString(),
                  confidence: 0.95,
                });

                const mTopAsins = Array.isArray(m.topAsins) ? m.topAsins : [];
                keywordMap.set(mId, {
                  id: mId,
                  rawKeyword: m.keyword,
                  normalizedKeyword: mNorm,
                  marketplace: request.marketplace,
                  origin: 'KEYWORD_EXPANSION',
                  metrics: {
                    searchVolume: m.searchVolume != null ? { value: Number(m.searchVolume), source: 'FACT', evidenceId: mEviId } : undefined,
                    abaRank: m.abaRank != null ? { value: Number(m.abaRank), source: 'FACT', evidenceId: mEviId } : undefined,
                    cpc: m.cpc != null ? { value: Number(m.cpc), source: 'FACT', evidenceId: mEviId } : undefined,
                    competition: m.competition != null ? { value: Number(m.competition), source: 'FACT', evidenceId: mEviId } : undefined,
                    growth: m.growth != null ? { value: Number(m.growth), source: 'FACT', evidenceId: mEviId } : { value: null, source: 'UNKNOWN' },
                    trendDirection: { value: 'UNKNOWN', source: 'UNKNOWN' },
                  },
                  representativeAsins: mTopAsins,
                  evidenceIds: [mEviId],
                });
                keywordsAccepted++;

                for (const asin of mTopAsins) {
                  if (asinMap.size < limits.maxRepresentativeAsins && !asinMap.has(asin)) {
                    asinsReceived++;
                    const asinEviId = `evi-asin-${asin}-${Date.now()}`;
                    evidenceList.push({
                      id: asinEviId,
                      scope: 'PRODUCT',
                      subjectId: asin,
                      source: callResult.providerId || 'XYDC',
                      content: `Discovered representative ASIN ${asin} from expanded keyword "${m.keyword}"`,
                      capturedAt: new Date().toISOString(),
                      confidence: 0.9,
                    });
                    asinMap.set(asin, {
                      asin,
                      marketplace: request.marketplace,
                      sourceKeywords: [m.keyword],
                      discoveredKeywords: [],
                      evidenceIds: [asinEviId],
                    });
                    asinsAccepted++;
                  }
                  edges.push({
                    keywordId: mId,
                    asin,
                    relation: 'TOP_ASIN',
                    evidenceIds: [mEviId],
                  });
                }
              }
            }
          }
        } catch {
          // Failure handled gracefully
        }
      }

      // --- ROUND 1: Seed ASIN Reverse Keywords (Spec §12: Path A) ---
      const reverseCap = this.executor.hasCapability('market.asin.keywords')
        ? 'market.asin.keywords'
        : this.executor.hasCapability('market.keyword.asin_analysis')
          ? 'market.keyword.asin_analysis'
          : null;

      if (!reverseCap) {
        missingCapabilities.add('market.asin.keywords');
      } else {
        const asinsToReverse = Array.from(asinMap.values()).slice(0, 3);
        for (const asinNode of asinsToReverse) {
          if (budgetState.stoppedByBudget) break;
          if (keywordMap.size >= limits.maxExpandedKeywords) break;
          if (!consumeBudget(1)) break;

          try {
            const revResult = await this.executor.execute(reverseCap, { asin: asinNode.asin }, request.marketplace);
            if (revResult.success && revResult.data) {
              const revList: any[] = Array.isArray(revResult.data)
                ? revResult.data
                : Array.isArray((revResult.data as any)?.keywords)
                  ? (revResult.data as any).keywords
                  : Array.isArray((revResult.data as any)?.list)
                    ? (revResult.data as any).list
                    : [];

              for (const item of revList) {
                if (keywordMap.size >= limits.maxExpandedKeywords) break;
                const rawKw = typeof item === 'string' ? item : item?.keyword || item?.rawKeyword;
                if (!rawKw || typeof rawKw !== 'string' || !rawKw.trim()) continue;

                if (request.constraints?.excludeBrandTerms && KeywordNormalizer.analyzeBrandTerms(rawKw).isBrandDependent) continue;
                if (request.constraints?.excludeAccessoryIntent && (KeywordNormalizer.detectIntent(rawKw) === 'ACCESSORY' || KeywordNormalizer.detectIntent(rawKw) === 'REPLACEMENT')) continue;

                const normKw = KeywordNormalizer.normalize(rawKw);
                const kwId = `kw-${request.marketplace.toLowerCase()}-${normKw.replace(/\s+/g, '-')}`;

                keywordsReceived++;
                if (!keywordMap.has(kwId)) {
                  const revEviId = `evi-kw-rev-${kwId}-${Date.now()}`;
                  evidenceList.push({
                    id: revEviId,
                    scope: 'KEYWORD',
                    subjectId: kwId,
                    source: revResult.providerId || 'XYDC',
                    content: `Reverse ASIN keyword from ${asinNode.asin}: "${rawKw}", searchVolume=${typeof item === 'object' ? (item.searchVolume ?? 'UNKNOWN') : 'UNKNOWN'}`,
                    capturedAt: new Date().toISOString(),
                    confidence: 0.92,
                  });

                  keywordMap.set(kwId, {
                    id: kwId,
                    rawKeyword: rawKw,
                    normalizedKeyword: normKw,
                    marketplace: request.marketplace,
                    origin: 'ASIN_REVERSE_LOOKUP',
                    metrics: {
                      searchVolume: typeof item === 'object' && item.searchVolume != null ? { value: Number(item.searchVolume), source: 'FACT', evidenceId: revEviId } : undefined,
                      abaRank: typeof item === 'object' && item.abaRank != null ? { value: Number(item.abaRank), source: 'FACT', evidenceId: revEviId } : undefined,
                      cpc: typeof item === 'object' && item.cpc != null ? { value: Number(item.cpc), source: 'FACT', evidenceId: revEviId } : undefined,
                      competition: typeof item === 'object' && item.competition != null ? { value: Number(item.competition), source: 'FACT', evidenceId: revEviId } : undefined,
                      growth: typeof item === 'object' && item.growth != null ? { value: Number(item.growth), source: 'FACT', evidenceId: revEviId } : { value: null, source: 'UNKNOWN' },
                      trendDirection: { value: 'UNKNOWN', source: 'UNKNOWN' },
                    },
                    representativeAsins: [asinNode.asin],
                    evidenceIds: [revEviId],
                  });
                  keywordsAccepted++;
                } else {
                  keywordsDeduplicated++;
                  const existing = keywordMap.get(kwId)!;
                  if (!existing.representativeAsins.includes(asinNode.asin)) {
                    existing.representativeAsins.push(asinNode.asin);
                  }
                }

                if (!asinNode.discoveredKeywords.includes(rawKw)) {
                  asinNode.discoveredKeywords.push(rawKw);
                }

                edges.push({
                  keywordId: kwId,
                  asin: asinNode.asin,
                  relation: 'DISCOVERED_RELATION',
                  evidenceIds: [...asinNode.evidenceIds],
                });
              }
            }
          } catch {
            // Graceful handling
          }
        }
      }

      // --- ROUND 2: High-Value Expanded Keyword Enrichment (Spec §12: Path B) ---
      if (hasKwSearch && !budgetState.stoppedByBudget) {
        const candidateKeywordsForEnrichment = Array.from(keywordMap.values())
          .filter((k) => k.origin !== 'SEED' && k.representativeAsins.length <= 1)
          .sort((a, b) => (b.metrics.searchVolume?.value ?? 0) - (a.metrics.searchVolume?.value ?? 0))
          .slice(0, 2);

        for (const kwNode of candidateKeywordsForEnrichment) {
          if (budgetState.stoppedByBudget) break;
          if (asinMap.size >= limits.maxRepresentativeAsins) break;
          if (!consumeBudget(1)) break;

          try {
            const enrichResult = await this.executor.execute('market.keyword.search', { keyword: kwNode.rawKeyword }, request.marketplace);
            if (enrichResult.success && enrichResult.data) {
              const list = Array.isArray(enrichResult.data) ? enrichResult.data : [enrichResult.data];
              const matched = list.find((m: any) => m?.keyword && KeywordNormalizer.normalize(m.keyword) === kwNode.normalizedKeyword) || list[0];
              if (matched) {
                const newTopAsins: string[] = Array.isArray(matched.topAsins) ? matched.topAsins : [];
                for (const asin of newTopAsins) {
                  if (asinMap.size < limits.maxRepresentativeAsins && !asinMap.has(asin)) {
                    asinsReceived++;
                    const asinEviId = `evi-asin-${asin}-${Date.now()}`;
                    evidenceList.push({
                      id: asinEviId,
                      scope: 'PRODUCT',
                      subjectId: asin,
                      source: enrichResult.providerId || 'XYDC',
                      content: `Discovered representative ASIN ${asin} from secondary search "${kwNode.rawKeyword}"`,
                      capturedAt: new Date().toISOString(),
                      confidence: 0.9,
                    });
                    asinMap.set(asin, {
                      asin,
                      marketplace: request.marketplace,
                      sourceKeywords: [kwNode.rawKeyword],
                      discoveredKeywords: [],
                      evidenceIds: [asinEviId],
                    });
                    asinsAccepted++;
                  }
                  if (!kwNode.representativeAsins.includes(asin)) {
                    kwNode.representativeAsins.push(asin);
                  }
                  edges.push({
                    keywordId: kwNode.id,
                    asin,
                    relation: 'TOP_ASIN',
                    evidenceIds: [...kwNode.evidenceIds],
                  });
                }
              }
            }
          } catch {
            // Graceful handling
          }
        }
      }
    }

    // Build reciprocal edges from existing nodes if edges list is empty
    if (edges.length === 0) {
      for (const kw of keywordMap.values()) {
        for (const asin of kw.representativeAsins) {
          edges.push({
            keywordId: kw.id,
            asin,
            relation: 'TOP_ASIN',
            evidenceIds: [...kw.evidenceIds],
          });
          const asinNode = asinMap.get(asin);
          if (asinNode && !asinNode.sourceKeywords.includes(kw.rawKeyword)) {
            asinNode.sourceKeywords.push(kw.rawKeyword);
          }
        }
      }
    }

    return {
      keywordNodes: Array.from(keywordMap.values()),
      asinNodes: Array.from(asinMap.values()),
      edges,
      evidence: evidenceList,
      budgetState,
      missingCapabilities: Array.from(missingCapabilities),
      stats: {
        keywordsReceived,
        keywordsAccepted,
        keywordsDeduplicated,
        asinsReceived,
        asinsAccepted,
      },
    };
  }
}
