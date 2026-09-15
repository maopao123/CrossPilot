/**
 * Keyword Clusterer for Product Research Auto Discovery MVP
 * Groups keywords into intention-based clusters using token similarity and shared ASIN overlap.
 * Strictly separates distinct buyer intents and prevents blind summing of search volumes.
 */

import type {
  KeywordNode,
  AsinNode,
  KeywordAsinEdge,
  KeywordCluster,
  DiscoveryClusteringConfig,
  ProvenanceValue,
} from '@crosspilot/shared';
import { DEFAULT_CLUSTERING_CONFIG } from '@crosspilot/shared';
import { KeywordNormalizer } from './keyword-normalizer.js';

export class KeywordClusterer {
  static cluster(
    keywords: KeywordNode[],
    asins: AsinNode[],
    edges: KeywordAsinEdge[],
    config: DiscoveryClusteringConfig = DEFAULT_CLUSTERING_CONFIG,
    marketplace = 'AMAZON_US',
  ): KeywordCluster[] {
    if (keywords.length === 0) return [];

    // Map each keyword to its ASIN set
    const kwAsinMap = new Map<string, Set<string>>();
    for (const kw of keywords) {
      kwAsinMap.set(kw.id, new Set(kw.representativeAsins));
    }
    for (const edge of edges) {
      const set = kwAsinMap.get(edge.keywordId);
      if (set) {
        set.add(edge.asin);
      }
    }

    // Map ASIN to its evidence IDs
    const asinEvidenceMap = new Map<string, string[]>();
    for (const a of asins) {
      asinEvidenceMap.set(a.asin, a.evidenceIds || []);
    }

    // Disjoint-set / Union-Find for clustering
    const parent = new Map<string, string>();
    for (const kw of keywords) {
      parent.set(kw.id, kw.id);
    }

    const find = (id: string): string => {
      const p = parent.get(id);
      if (!p || p === id) return id;
      const root = find(p);
      parent.set(id, root);
      return root;
    };

    const union = (id1: string, id2: string) => {
      const root1 = find(id1);
      const root2 = find(id2);
      if (root1 !== root2) {
        parent.set(root2, root1);
      }
    };

    const clusterReasonsMap = new Map<string, string[]>();
    const addReason = (rootId: string, reason: string) => {
      if (!clusterReasonsMap.has(rootId)) {
        clusterReasonsMap.set(rootId, []);
      }
      const list = clusterReasonsMap.get(rootId)!;
      if (!list.includes(reason)) {
        list.push(reason);
      }
    };

    // Pairwise comparison for clustering
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const kw1 = keywords[i];
        const kw2 = keywords[j];

        const asins1 = kwAsinMap.get(kw1.id) || new Set();
        const asins2 = kwAsinMap.get(kw2.id) || new Set();

        // Calculate Shared ASIN Jaccard
        let sharedAsinCount = 0;
        for (const asin of asins1) {
          if (asins2.has(asin)) sharedAsinCount++;
        }
        const totalUniqueAsins = new Set([...asins1, ...asins2]).size;
        const asinJaccard = totalUniqueAsins > 0 ? sharedAsinCount / totalUniqueAsins : 0;

        // Calculate Token Similarity
        const tokenSim = KeywordNormalizer.calculateTokenSimilarity(kw1.normalizedKeyword, kw2.normalizedKeyword);

        // Check for specific divergent intent modifiers (Distinct intent separation, Spec §55 Case 5)
        const hasDistinctIntentModifiers = this.hasConflictingIntentModifiers(
          kw1.normalizedKeyword,
          kw2.normalizedKeyword,
        );

        if (hasDistinctIntentModifiers) {
          continue;
        }

        // Also check if any existing members of cluster(kw1) conflict with any members of cluster(kw2)
        const root1 = find(kw1.id);
        const root2 = find(kw2.id);
        if (root1 === root2) continue;

        const members1 = keywords.filter((k) => find(k.id) === root1);
        const members2 = keywords.filter((k) => find(k.id) === root2);
        let hasTransitiveConflict = false;
        for (const m1 of members1) {
          for (const m2 of members2) {
            if (this.hasConflictingIntentModifiers(m1.normalizedKeyword, m2.normalizedKeyword)) {
              hasTransitiveConflict = true;
              break;
            }
          }
          if (hasTransitiveConflict) break;
        }
        if (hasTransitiveConflict) {
          continue;
        }

        let shouldMerge = false;
        let mergeReason = '';

        if (kw1.normalizedKeyword === kw2.normalizedKeyword) {
          shouldMerge = true;
          mergeReason = 'Identical normalized keyword';
        } else if (
          (asinJaccard >= 0.4 && sharedAsinCount >= 2) ||
          asinJaccard >= 0.6
        ) {
          shouldMerge = true;
          mergeReason = `High shared ASIN overlap (Jaccard: ${asinJaccard.toFixed(2)}, ${sharedAsinCount} shared ASINs)`;
        } else if (
          tokenSim >= config.tokenSimilarityThreshold &&
          sharedAsinCount >= 1
        ) {
          shouldMerge = true;
          mergeReason = `Token similarity (${tokenSim.toFixed(2)}) backed by shared ASIN overlap (${sharedAsinCount} shared)`;
        } else if (tokenSim >= 0.75 && totalUniqueAsins === 0) {
          shouldMerge = true;
          mergeReason = `High token similarity (${tokenSim.toFixed(2)}) without contradictory ASIN signals`;
        }

        if (shouldMerge) {
          union(kw1.id, kw2.id);
          addReason(find(kw1.id), mergeReason);
        }
      }
    }

    // Group keywords by cluster root
    const clusterGroups = new Map<string, KeywordNode[]>();
    for (const kw of keywords) {
      const root = find(kw.id);
      if (!clusterGroups.has(root)) {
        clusterGroups.set(root, []);
      }
      clusterGroups.get(root)!.push(kw);
    }

    // Build KeywordCluster objects
    const clusters: KeywordCluster[] = [];

    for (const [rootId, group] of clusterGroups.entries()) {
      // Deterministically select primary keyword:
      // 1. Keyword with highest Search Volume
      // 2. Or lowest ABA Rank
      // 3. Or SEED keyword
      // 4. Or lexicographically lowest id
      const sortedGroup = [...group].sort((a, b) => {
        const volA = a.metrics.searchVolume?.value ?? -1;
        const volB = b.metrics.searchVolume?.value ?? -1;
        if (volA !== volB) return volB - volA;

        const rankA = a.metrics.abaRank?.value ?? 9999999;
        const rankB = b.metrics.abaRank?.value ?? 9999999;
        if (rankA !== rankB) return rankA - rankB;

        if (a.origin === 'SEED' && b.origin !== 'SEED') return -1;
        if (b.origin === 'SEED' && a.origin !== 'SEED') return 1;

        return a.id.localeCompare(b.id);
      });

      const primary = sortedGroup[0];
      const keywordIds = sortedGroup.map((k) => k.id);

      // Collect representative ASINs
      const repAsinsSet = new Set<string>();
      for (const k of sortedGroup) {
        for (const asin of k.representativeAsins) {
          repAsinsSet.add(asin);
        }
      }
      const representativeAsins = Array.from(repAsinsSet).sort();

      // Collect evidence IDs
      const evidenceSet = new Set<string>();
      for (const k of sortedGroup) {
        for (const eviId of k.evidenceIds) {
          evidenceSet.add(eviId);
        }
      }
      for (const asin of representativeAsins) {
        const asinEvis = asinEvidenceMap.get(asin) || [];
        for (const eviId of asinEvis) {
          evidenceSet.add(eviId);
        }
      }
      const evidenceIds = Array.from(evidenceSet).sort();

      // Aggregate Metrics
      // Spec §20: Primary Demand Metric = Primary Keyword Search Volume
      const demand = primary.metrics.searchVolume;

      // Spec §21: Trend only if verified series exists
      let growth: ProvenanceValue<number> | undefined = primary.metrics.growth;
      if (!growth || growth.source === 'UNKNOWN') {
        const nodeWithGrowth = sortedGroup.find((k) => k.metrics.growth && k.metrics.growth.source !== 'UNKNOWN');
        growth = nodeWithGrowth ? nodeWithGrowth.metrics.growth : { value: null, source: 'UNKNOWN' };
      }

      // Competition
      let competition: ProvenanceValue<number> | undefined = primary.metrics.competition;
      if (!competition) {
        const nodeWithComp = sortedGroup.find((k) => k.metrics.competition != null);
        competition = nodeWithComp?.metrics.competition;
      }

      const missingFields: string[] = [];
      if (!growth || growth.source === 'UNKNOWN') {
        missingFields.push('trend');
      }
      if (!competition) {
        missingFields.push('competition');
      }
      if (!demand) {
        missingFields.push('demand');
      }

      // Human-readable Label (deterministic Title Case based on primary keyword)
      const label = this.generateDeterministicLabel(primary.rawKeyword, sortedGroup.map((k) => k.rawKeyword));

      const clusterId = `cluster-${marketplace.toLowerCase()}-${KeywordNormalizer.normalize(primary.rawKeyword).replace(/\s+/g, '-')}`;

      clusters.push({
        id: clusterId,
        marketplace,
        label,
        primaryKeywordId: primary.id,
        keywordIds,
        representativeAsins,
        metrics: {
          demand,
          growth,
          competition,
        },
        evidenceIds,
        clusteringReasons: clusterReasonsMap.get(rootId) || ['Direct seed / single keyword cluster'],
        missingFields,
      });
    }

    // Deterministic sorting of clusters
    return clusters.sort((a, b) => {
      const volA = a.metrics.demand?.value ?? -1;
      const volB = b.metrics.demand?.value ?? -1;
      if (volA !== volB) return volB - volA;
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Detects if two keywords contain mutually exclusive intent modifiers (e.g. fruit vs meal prep, baby vs pet)
   */
  private static hasConflictingIntentModifiers(norm1: string, norm2: string): boolean {
    const tokens1 = new Set(KeywordNormalizer.tokenize(norm1));
    const tokens2 = new Set(KeywordNormalizer.tokenize(norm2));

    const intentBuckets = [
      ['fruit', 'berry', 'produce', 'vegetable', 'salad'],
      ['meal', 'prep', 'lunch', 'bento', 'portion'],
      ['flour', 'sugar', 'pantry', 'cereal', 'dry', 'grain'],
      ['baking', 'casserole', 'roaster', 'bakeware', 'oven'],
      ['baby', 'infant', 'toddler', 'kid'],
      ['dog', 'cat', 'pet'],
    ];

    for (const bucket of intentBuckets) {
      const has1 = bucket.some((t) => tokens1.has(t));
      for (const otherBucket of intentBuckets) {
        if (bucket === otherBucket) continue;
        const has2 = otherBucket.some((t) => tokens2.has(t));
        if (has1 && has2) {
          // One belongs to bucket A, the other belongs to bucket B -> Conflicting intent!
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Deterministic title case cluster label
   */
  private static generateDeterministicLabel(primaryKeyword: string, allKeywords: string[]): string {
    const norm = KeywordNormalizer.normalize(primaryKeyword);
    const words = norm.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join(' ');
  }
}
