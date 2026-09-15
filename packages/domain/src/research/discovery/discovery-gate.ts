/**
 * Discovery Gate for Product Research Auto Discovery MVP
 * Evaluates candidate clusters for evidence validity, cross-contamination, brand constraints, and accessory intent.
 * Conforms to PRODUCT_RESEARCH_AUTO_DISCOVERY_MVP_SPEC.md §26-§31 & §55 (Cases 8, 11, 12).
 */

import type {
  KeywordCluster,
  KeywordNode,
  AsinNode,
  EvidenceItem,
  DiscoveryGateStatus,
  ProductDiscoveryRequest,
  ProductIntent,
} from '@crosspilot/shared';
import { KeywordNormalizer } from './keyword-normalizer.js';

export interface DiscoveryGateEvaluation {
  status: DiscoveryGateStatus;
  reasons: string[];
  missingRequirements: string[];
  isBrandDependent: boolean;
  productIntent: ProductIntent;
}

export class DiscoveryGate {
  static evaluate(
    cluster: KeywordCluster,
    keywords: KeywordNode[],
    asins: AsinNode[],
    evidenceList: EvidenceItem[],
    constraints?: ProductDiscoveryRequest['constraints'],
  ): DiscoveryGateEvaluation {
    const reasons: string[] = [];
    const missingRequirements: string[] = [];
    let isBrandDependent = false;

    // 1. Evidence Completeness Check (Spec §27)
    if (!cluster.evidenceIds || cluster.evidenceIds.length === 0) {
      return {
        status: 'REJECT',
        reasons: ['REJECT: No evidence IDs attached to cluster'],
        missingRequirements: ['evidence'],
        isBrandDependent: false,
        productIntent: 'UNKNOWN',
      };
    }

    // 2. Cross-Evidence Contamination Check (Spec §55 Case 8)
    // Every evidence attached to the cluster must map to either a keyword or an ASIN that belongs to this cluster
    const clusterKeywordIds = new Set(cluster.keywordIds);
    const clusterAsins = new Set(cluster.representativeAsins);
    const evidenceMap = new Map<string, EvidenceItem>();
    for (const e of evidenceList) {
      evidenceMap.set(e.id, e);
    }

    let validKeywordEvidenceCount = 0;
    let validAsinEvidenceCount = 0;

    for (const eviId of cluster.evidenceIds) {
      const evi = evidenceMap.get(eviId);
      if (!evi) continue;

      const isKeywordEvidence = evi.scope === 'KEYWORD' || evi.id.includes('kw-') || clusterKeywordIds.has(evi.subjectId);
      const isProductEvidence = evi.scope === 'PRODUCT' || evi.id.includes('asin-') || clusterAsins.has(evi.subjectId);

      // Check if the evidence subject belongs to this cluster
      const subjectBelongs =
        clusterKeywordIds.has(evi.subjectId) ||
        clusterAsins.has(evi.subjectId) ||
        evi.subjectId === cluster.id;

      if (!subjectBelongs && evi.subjectId) {
        // Cross-contamination detected! Evidence from an alien subject was injected.
        return {
          status: 'REJECT',
          reasons: [`REJECT: Cross-evidence contamination detected for subjectId '${evi.subjectId}'`],
          missingRequirements: ['evidence_integrity'],
          isBrandDependent: false,
          productIntent: 'UNKNOWN',
        };
      }

      if (isKeywordEvidence) validKeywordEvidenceCount++;
      if (isProductEvidence) validAsinEvidenceCount++;
    }

    // 3. Representative ASIN Check
    if (cluster.representativeAsins.length === 0) {
      return {
        status: 'REJECT',
        reasons: ['REJECT: Cluster lacks representative ASINs'],
        missingRequirements: ['representative_asins'],
        isBrandDependent: false,
        productIntent: 'UNKNOWN',
      };
    }

    // 4. Intent & Accessory Detection (Spec §31 & §55 Case 12)
    const primaryKwNode = keywords.find((k) => k.id === cluster.primaryKeywordId);
    const primaryText = primaryKwNode ? primaryKwNode.rawKeyword : cluster.label;
    const productIntent = KeywordNormalizer.detectIntent(primaryText);

    if (constraints?.excludeAccessoryIntent && (productIntent === 'ACCESSORY' || productIntent === 'REPLACEMENT')) {
      return {
        status: 'REJECT',
        reasons: [`REJECT: Accessory or replacement intent (${productIntent}) excluded by user constraint`],
        missingRequirements: [],
        isBrandDependent: false,
        productIntent,
      };
    }

    // 5. Brand Terms Check (Spec §30 & §55 Case 11)
    if (constraints?.excludeBrandTerms) {
      const brandAnalysis = KeywordNormalizer.analyzeBrandTerms(primaryText);
      if (brandAnalysis.isPureBrandNavigation) {
        return {
          status: 'REJECT',
          reasons: [`REJECT: Pure brand navigation search (${brandAnalysis.detectedBrands.join(', ')}) excluded`],
          missingRequirements: [],
          isBrandDependent: true,
          productIntent,
        };
      }
      if (brandAnalysis.isBrandDependent) {
        isBrandDependent = true;
        reasons.push(`Brand-dependent candidate: contains brand term '${brandAnalysis.detectedBrands.join(', ')}'`);
      }
    }

    // 6. Market Signal & Demand Check
    const demandValue = cluster.metrics.demand?.value;
    if (demandValue == null || demandValue <= 0) {
      missingRequirements.push('demand');
    }

    // 7. Trend Series Check (Spec §28 & §55 Case 6)
    // If trend is missing, it is a DEGRADED_PASS, not a REJECT
    const growthSource = cluster.metrics.growth?.source;
    if (!growthSource || growthSource === 'UNKNOWN') {
      missingRequirements.push('trend');
      reasons.push('Historical trend series unavailable; growth set to UNKNOWN');
    }

    if (missingRequirements.includes('demand')) {
      return {
        status: 'DEGRADED_PASS',
        reasons: [...reasons, 'DEGRADED_PASS: Demand signal is missing or unverified'],
        missingRequirements,
        isBrandDependent,
        productIntent,
      };
    }

    if (missingRequirements.length > 0 || isBrandDependent) {
      return {
        status: 'DEGRADED_PASS',
        reasons: [...reasons, 'DEGRADED_PASS: Candidate has valid core signals but secondary signals are missing or brand-dependent'],
        missingRequirements,
        isBrandDependent,
        productIntent,
      };
    }

    reasons.push('PASS: Verified demand, representative ASINs, and untainted evidence trace');
    return {
      status: 'PASS',
      reasons,
      missingRequirements: [],
      isBrandDependent: false,
      productIntent,
    };
  }
}
