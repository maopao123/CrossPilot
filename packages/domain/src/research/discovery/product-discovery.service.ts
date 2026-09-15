/**
 * Product Discovery Service for Product Research Auto Discovery MVP
 * Orchestrates Seed -> Expansion -> Clustering -> Gate -> Draft Building -> Dedup -> Ordering.
 * Conforms to PRODUCT_RESEARCH_AUTO_DISCOVERY_MVP_SPEC.md §6, §8, §40, §43, §52, §53.
 */

import type {
  ProductDiscoveryRequest,
  ProductDiscoveryRun,
  DiscoveryRunStatus,
  CandidateDraft,
  KeywordCluster,
  DiscoveryDryRunPreview,
  KeywordNode,
  AsinNode,
  EvidenceItem,
} from '@crosspilot/shared';
import {
  DEFAULT_DISCOVERY_LIMITS,
} from '@crosspilot/shared';
import { KeywordExpansionService, CapabilityExecutor } from './keyword-expansion.service.js';
import { KeywordClusterer } from './keyword-clusterer.js';
import { DiscoveryGate } from './discovery-gate.js';
import { CandidateDraftBuilder } from './candidate-draft.builder.js';
import { CandidateDeduplicator } from './candidate-deduplicator.js';

export class ProductDiscoveryService {
  private readonly expansionService: KeywordExpansionService;

  constructor(executor?: CapabilityExecutor) {
    this.expansionService = new KeywordExpansionService(executor);
  }

  async runDiscovery(
    request: ProductDiscoveryRequest,
    preloadedData?: {
      keywords?: Partial<KeywordNode>[];
      asins?: Partial<AsinNode>[];
      evidence?: EvidenceItem[];
    },
  ): Promise<ProductDiscoveryRun> {
    const marketplace = request.marketplace || 'AMAZON_US';
    const seedKeyword = request.seed?.keyword?.trim() || '';

    if (!seedKeyword) {
      throw new Error('Seed keyword is required for Auto Discovery');
    }

    const runId = `run-${marketplace.toLowerCase()}-${Date.now()}`;

    // 1. Keyword & ASIN Expansion (Graph generation with budget enforcement)
    const expansion = await this.expansionService.expand(request, preloadedData);

    // 2. Keyword Clustering
    const clusters = KeywordClusterer.cluster(
      expansion.keywordNodes,
      expansion.asinNodes,
      expansion.edges,
      undefined,
      marketplace,
    );

    // 3. Discovery Gate & Candidate Draft Building
    const rawDrafts: CandidateDraft[] = [];
    let candidateDraftsRejected = 0;

    for (const cluster of clusters) {
      const gateEval = DiscoveryGate.evaluate(
        cluster,
        expansion.keywordNodes,
        expansion.asinNodes,
        expansion.evidence,
        request.constraints,
      );

      const draft = CandidateDraftBuilder.build(
        cluster,
        expansion.keywordNodes,
        expansion.asinNodes,
        gateEval,
        marketplace,
      );

      if (gateEval.status === 'REJECT') {
        candidateDraftsRejected++;
      }
      rawDrafts.push(draft);
    }

    // 4. Candidate Deduplication
    const { drafts: dedupedDrafts } = CandidateDeduplicator.deduplicate(rawDrafts);

    // 5. Deterministic Ordering (Spec §53 & Case 14)
    // Order: Gate (PASS > DEGRADED_PASS > REJECT)
    // -> Priority (HIGH > MEDIUM > LOW > NEEDS_DATA)
    // -> Evidence Coverage (count)
    // -> Primary Demand (descending, UNKNOWN last)
    // -> Stable ID (localeCompare)
    const gateRank: Record<string, number> = { PASS: 3, DEGRADED_PASS: 2, REJECT: 1 };
    const priorityRank: Record<string, number> = { HIGH: 4, MEDIUM: 3, LOW: 2, NEEDS_DATA: 1 };

    const sortedDrafts = [...dedupedDrafts].sort((a, b) => {
      const gateA = gateRank[a.gateStatus || 'REJECT'] || 0;
      const gateB = gateRank[b.gateStatus || 'REJECT'] || 0;
      if (gateA !== gateB) return gateB - gateA;

      const prioA = priorityRank[a.priorityTier || 'NEEDS_DATA'] || 0;
      const prioB = priorityRank[b.priorityTier || 'NEEDS_DATA'] || 0;
      if (prioA !== prioB) return prioB - prioA;

      const eviCountA = a.evidenceIds.length;
      const eviCountB = b.evidenceIds.length;
      if (eviCountA !== eviCountB) return eviCountB - eviCountA;

      const demandA = a.discoveryMetrics.demand?.value;
      const demandB = b.discoveryMetrics.demand?.value;
      if (demandA != null && demandB != null && demandA !== demandB) {
        return demandB - demandA;
      }
      if (demandA != null && demandB == null) return -1;
      if (demandA == null && demandB != null) return 1;

      return a.id.localeCompare(b.id);
    });

    const maxDrafts = request.limits?.maxCandidateDrafts ?? DEFAULT_DISCOVERY_LIMITS.maxCandidateDrafts;
    const finalDrafts = sortedDrafts.slice(0, maxDrafts);

    // 6. Determine Final Run Status (Spec §8)
    let status: DiscoveryRunStatus = 'COMPLETED';
    if (expansion.keywordNodes.length === 0 && expansion.asinNodes.length === 0) {
      status = 'INSUFFICIENT_DATA';
    } else if (
      expansion.budgetState.stoppedByBudget ||
      expansion.missingCapabilities.length > 0 ||
      finalDrafts.some((d) => d.gateStatus === 'DEGRADED_PASS')
    ) {
      status = 'DEGRADED';
    }

    return {
      id: runId,
      request,
      status,
      seedKeyword,
      keywordNodes: expansion.keywordNodes,
      asinNodes: expansion.asinNodes,
      edges: expansion.edges,
      clusters,
      candidateDrafts: finalDrafts,
      evidence: expansion.evidence,
      missingCapabilities: expansion.missingCapabilities,
      budgetUsage: {
        providerCalls: expansion.budgetState.usedProviderCalls,
        credits: expansion.budgetState.usedCredits,
        expensiveCalls: expansion.budgetState.usedExpensiveCalls,
        stoppedByBudget: expansion.budgetState.stoppedByBudget,
      },
      stats: {
        keywordsReceived: expansion.stats.keywordsReceived,
        keywordsAccepted: expansion.stats.keywordsAccepted,
        keywordsDeduplicated: expansion.stats.keywordsDeduplicated,
        asinsReceived: expansion.stats.asinsReceived,
        asinsAccepted: expansion.stats.asinsAccepted,
        clustersCreated: clusters.length,
        candidateDraftsCreated: finalDrafts.length,
        candidateDraftsRejected,
      },
    };
  }

  previewDiscovery(request: ProductDiscoveryRequest): DiscoveryDryRunPreview {
    return {
      plannedCapabilities: ['market.keyword.search', 'market.product.search'],
      estimatedCallCount: 2,
      knownCreditCost: 2,
      unknownCostFields: [],
    };
  }
}
