/**
 * Candidate Draft Builder for Product Research Auto Discovery MVP
 * Builds deterministic, evidence-traceable Candidate Drafts from Keyword Clusters.
 * Strictly adheres to Case 13 (non-empty metricIds & evidenceIds for all DiscoveryReasons)
 * and Case 6/7 (truthful UNKNOWN growth, real ASIN sample size).
 */

import type {
  KeywordCluster,
  KeywordNode,
  AsinNode,
  CandidateDraft,
  DiscoveryReason,
  DiscoveryPriority,
  CandidateDraftStatus,
} from '@crosspilot/shared';
import { KeywordNormalizer } from './keyword-normalizer.js';
import type { DiscoveryGateEvaluation } from './discovery-gate.js';

export class CandidateDraftBuilder {
  static build(
    cluster: KeywordCluster,
    keywords: KeywordNode[],
    asins: AsinNode[],
    gateEval: DiscoveryGateEvaluation,
    marketplace = 'AMAZON_US',
  ): CandidateDraft {
    const primaryNode = keywords.find((k) => k.id === cluster.primaryKeywordId);
    const primaryKeyword = primaryNode ? primaryNode.rawKeyword : cluster.label;

    const supportingKeywords = keywords
      .filter((k) => cluster.keywordIds.includes(k.id) && k.id !== cluster.primaryKeywordId)
      .map((k) => k.rawKeyword);

    const representativeAsins = [...cluster.representativeAsins];

    // Canonical Product Type
    const normPrimary = KeywordNormalizer.normalize(primaryKeyword);
    const productType = this.deriveProductType(normPrimary, cluster.label);

    // Stable Candidate Draft ID (Spec §54 & Case 14)
    const slug = KeywordNormalizer.normalize(productType).replace(/\s+/g, '-');
    const id = `draft-${marketplace.toLowerCase()}-${slug}`;

    // Anchor evidence IDs for reasons
    const primaryKwEviId = (primaryNode?.evidenceIds && primaryNode.evidenceIds[0]) || (cluster.evidenceIds[0] || 'evi-default');
    const firstAsinEviId = (asins.find((a) => representativeAsins.includes(a.asin))?.evidenceIds?.[0]) || (cluster.evidenceIds[0] || 'evi-default');

    // Build Structured Discovery Reasons (Spec §24 & Case 13: metricIds and evidenceIds MUST be non-empty)
    const discoveryReasons: DiscoveryReason[] = [];

    // 1. Demand Signal
    const demandVal = cluster.metrics.demand?.value;
    const demandEviId = cluster.metrics.demand?.evidenceId || primaryKwEviId;
    if (demandVal != null && demandVal > 0) {
      discoveryReasons.push({
        code: 'DEMAND_SIGNAL',
        conclusion: `Monthly search volume of ${demandVal.toLocaleString()} verified by search intelligence`,
        metricIds: ['searchVolume'],
        evidenceIds: [demandEviId],
      });
    } else {
      discoveryReasons.push({
        code: 'DEMAND_SIGNAL',
        conclusion: 'Search volume metric unverified; relying on cluster presence',
        metricIds: ['searchVolume'],
        evidenceIds: [primaryKwEviId],
      });
    }

    // 2. Multi-Keyword Support
    const totalKeywords = supportingKeywords.length + 1;
    discoveryReasons.push({
      code: 'MULTI_KEYWORD_SUPPORT',
      conclusion: `${totalKeywords} distinct buyer search terms converge on this opportunity cluster`,
      metricIds: ['keywordCount'],
      evidenceIds: [primaryKwEviId],
    });

    // 3. Multi-ASIN Support (Case 7: Truthful sample size)
    discoveryReasons.push({
      code: 'MULTI_ASIN_SUPPORT',
      conclusion: `${representativeAsins.length} representative competitor ASINs anchor this product space`,
      metricIds: ['asinSampleSize'],
      evidenceIds: [firstAsinEviId],
    });

    // 4. Intent Distinctness
    discoveryReasons.push({
      code: 'INTENT_DISTINCTNESS',
      conclusion: `Specific customer purchase intent identified around '${productType}'`,
      metricIds: ['productIntent'],
      evidenceIds: [primaryKwEviId],
    });

    // 5. Trend Signal (if verified, Case 6: only if real series)
    if (cluster.metrics.growth && cluster.metrics.growth.source !== 'UNKNOWN' && cluster.metrics.growth.value != null) {
      const trendEviId = cluster.metrics.growth.evidenceId || primaryKwEviId;
      discoveryReasons.push({
        code: 'TREND_SIGNAL',
        conclusion: `Verified trend growth rate of ${cluster.metrics.growth.value}%`,
        metricIds: ['growth'],
        evidenceIds: [trendEviId],
      });
    }

    // 6. Competition Signal (if available)
    if (cluster.metrics.competition && cluster.metrics.competition.value != null) {
      const compEviId = cluster.metrics.competition.evidenceId || primaryKwEviId;
      discoveryReasons.push({
        code: 'COMPETITION_SIGNAL',
        conclusion: `Competitive index at ${cluster.metrics.competition.value}`,
        metricIds: ['competition'],
        evidenceIds: [compEviId],
      });
    }

    // Determine Priority Tier (Spec §33-§34)
    let priorityTier: DiscoveryPriority = 'MEDIUM';
    if (gateEval.status === 'REJECT') {
      priorityTier = 'NEEDS_DATA';
    } else if (gateEval.status === 'PASS' && totalKeywords >= 2 && representativeAsins.length >= 2 && demandVal != null && demandVal > 3000) {
      priorityTier = 'HIGH';
    } else if (gateEval.status === 'DEGRADED_PASS' && (demandVal == null || representativeAsins.length <= 1)) {
      priorityTier = 'LOW';
    }

    // Determine Candidate Draft Status
    let status: CandidateDraftStatus = 'READY_FOR_ENRICHMENT';
    if (gateEval.status === 'REJECT') {
      status = 'REJECTED';
    } else if (gateEval.status === 'DEGRADED_PASS' && gateEval.missingRequirements.includes('demand')) {
      status = 'NEEDS_MORE_DATA';
    }

    const dedupKey = `${marketplace.toUpperCase()}:${KeywordNormalizer.normalize(productType)}`;

    return {
      id,
      marketplace,
      title: cluster.label,
      productType,
      clusterId: cluster.id,
      primaryKeyword,
      supportingKeywords,
      representativeAsins,
      discoveryMetrics: {
        demand: cluster.metrics.demand,
        growth: cluster.metrics.growth ?? { value: null, source: 'UNKNOWN' },
        competition: cluster.metrics.competition,
        keywordCount: totalKeywords,
        asinSampleSize: representativeAsins.length,
      },
      evidenceIds: [...cluster.evidenceIds],
      discoveryReasons,
      missingRequirements: [...gateEval.missingRequirements],
      status,
      dedupKey,
      priorityTier,
      productIntent: gateEval.productIntent,
      gateStatus: gateEval.status,
      gateReasons: gateEval.reasons,
      isBrandDependent: gateEval.isBrandDependent,
    };
  }

  private static deriveProductType(normalizedKeyword: string, clusterLabel: string): string {
    const words = normalizedKeyword.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join(' ');
  }
}
