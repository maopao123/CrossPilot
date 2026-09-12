/**
 * Claim-Level Entailment Grounding Service (Epic 1.1 + Epic 1.2)
 *
 * Implements 3-Layer Fact Grounding:
 * Layer 1: Fact ID Existence & Validity
 * Layer 2: Claim Value & Entailment Matching (with Deterministic Unit Conversion)
 * Layer 3: Embellishment & Semantic Expansion Audit (Absolutes, Brands, Durability,
 *          Wet Surface, Unverified Usages, Humidity, Uniqueness Guarantees)
 */

import {
  ListingClaim,
  ClaimType,
  ClaimRiskLevel,
  ClaimGroundingStatus,
  ClaimVerificationType,
  ListingGroundingMetrics,
  GROUNDING_ENGINE_VERSION,
} from './listing-claim.types.js';
import { UnitConversionService } from './unit-conversion.service.js';

export interface ProductFactItem {
  id: string;
  name: string;
  value: string;
  isCore?: boolean;
}

export class ClaimGroundingService {
  /**
   * Classify Claim Type based on keywords and intent
   */
  static classifyClaimType(claimText: string): ClaimType {
    const lower = claimText.toLowerCase();
    if (/\b(?:lbs?|pounds?|kg|kilograms?|heavy|weight)\b/i.test(lower)) return 'WEIGHT';
    if (/\b(?:inch(?:es)?|mm|cm|dimensions?|diameter|width|slot\s*width|deep)\b/i.test(lower)) return 'DIMENSION';
    if (/\b(?:marble|stone|resin|carrara|material|ceramic|wood)\b/i.test(lower)) return 'MATERIAL';
    if (/\b(?:fits?|compatible|oral-b|sonicare|handles?|toothbrush)\b/i.test(lower)) return 'COMPATIBILITY';
    if (/\b(?:water-resistant|waterproof|stain|sealed|for\s*years|durable|longevity|over\s*time)\b/i.test(lower)) return 'DURABILITY';
    if (/\b(?:stable|stability|anti-slip|non-slip|tip|slide|sliding|eva\s*pads|firmly\s*in\s*place)\b/i.test(lower)) return 'PERFORMANCE';
    if (/\b(?:luxury|luxurious|aesthetic|decor|décor|elegant|veining|polished|modern|one-of-a-kind)\b/i.test(lower)) return 'AESTHETIC';
    if (/\b(?:bathroom|countertop|vanity|organizer|clean|wipe|toiletries|toothpaste|brushes|razors)\b/i.test(lower)) return 'USAGE';
    return 'OTHER';
  }

  /**
   * Determine Claim Risk Level
   */
  static evaluateRiskLevel(claimType: ClaimType, claimText: string): ClaimRiskLevel {
    const lower = claimText.toLowerCase();
    // High-Risk markers: Medical, certified durability, stain/waterproof absolutes, anti-tip guarantee
    if (
      claimType === 'DURABILITY' ||
      /\b(?:won'?t\s*tip|never\s*tips?|cannot\s*tip|guaranteed?\s*not\s*to\s*tip|guaranteed?|waterproof|stain-proof|for\s*years|lifetime|oral-b|sonicare|fda)\b/i.test(lower)
    ) {
      return 'HIGH';
    }
    if (
      claimType === 'COMPATIBILITY' ||
      claimType === 'PERFORMANCE' ||
      claimType === 'WEIGHT' ||
      claimType === 'DIMENSION' ||
      /\b(?:wet\s*counter|toothpaste|toiletries|makeup|razor|humid)\b/i.test(lower)
    ) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Evaluate a single raw or surface claim against confirmed product facts
   */
  static evaluateSingleClaim(
    rawClaim: Partial<ListingClaim> & { claim?: string; text?: string; factIds?: string[] },
    features: ProductFactItem[],
    index: number = 0,
  ): ListingClaim {
    const text = (rawClaim.text || rawClaim.claim || '').trim();
    const factIds = rawClaim.factIds || [];
    const claimId = String(rawClaim.claimId || `claim-${index + 1}`);
    const claimType = rawClaim.claimType || this.classifyClaimType(text);
    let riskLevel = rawClaim.riskLevel || this.evaluateRiskLevel(claimType, text);
    const sourceSection = rawClaim.sourceSection;
    const sourceIndex = rawClaim.sourceIndex;
    const textSpan = rawClaim.textSpan || text;
    const repairedFrom = rawClaim.repairedFrom;
    let verificationType = rawClaim.verificationType;

    const lowerText = text.toLowerCase();

    // Check for POLICY_SENSITIVE absolutes / violations
    const hasAbsoluteTip = /\b(?:won'?t\s*tip(?:\s*over)?|never\s*tips?(?:\s*over)?|cannot\s*tip(?:\s*over)?|guaranteed\s*(?:not\s*to\s*tip|stability)?)\b/i.test(lowerText);
    const hasProhibitedTerm = /\b(?:#1\s*best\s*seller|top\s*rated|free\s*shipping|money\s*back|100%\s*guaranteed|fda\s*approved|clinical\s*grade)\b/i.test(lowerText);

    if (hasAbsoluteTip || hasProhibitedTerm) {
      verificationType = 'POLICY_SENSITIVE';
      riskLevel = 'HIGH';
    }

    // 1. SUBJECTIVE_MARKETING Pass: non-verifiable styling / aesthetic copy
    if (verificationType === 'SUBJECTIVE_MARKETING' && !hasAbsoluteTip && !hasProhibitedTerm) {
      return {
        claimId,
        claim: text,
        text,
        claimType,
        verificationType: 'SUBJECTIVE_MARKETING',
        riskLevel: 'LOW',
        factIds: [],
        groundingStatus: 'SUPPORTED',
        sourceSection,
        sourceIndex,
        textSpan,
        unsupportedSpan: null,
        reason: 'Non-verifiable subjective marketing copy (no engineering fact required).',
        repairedFrom,
      };
    }

    const featureMap = new Map<string, ProductFactItem>(features.map((f) => [f.id, f]));

    // Layer 1: Fact ID Existence Gate
    if (factIds.length === 0) {
      return {
        claimId,
        claim: text,
        text,
        claimType,
        verificationType: verificationType || 'FACT_VERIFIABLE',
        riskLevel,
        factIds: [],
        groundingStatus: 'UNSUPPORTED',
        sourceSection,
        sourceIndex,
        textSpan,
        unsupportedSpan: text,
        reason: 'Layer 1: No supporting factIds provided.',
        repairedFrom,
      };
    }

    const invalidFactIds = factIds.filter((id) => !featureMap.has(id));
    if (invalidFactIds.length > 0) {
      return {
        claimId,
        claim: text,
        text,
        claimType,
        verificationType: verificationType || 'FACT_VERIFIABLE',
        riskLevel,
        factIds,
        groundingStatus: 'UNSUPPORTED',
        sourceSection,
        sourceIndex,
        textSpan,
        unsupportedSpan: text,
        reason: `Layer 1: Referenced nonexistent factIds [${invalidFactIds.join(', ')}]`,
        repairedFrom,
      };
    }

    // Load supporting feature values
    const supportingFeatures = factIds.map((id) => featureMap.get(id)!);
    const combinedFactText = supportingFeatures.map((f) => `${f.name}: ${f.value}`).join(' | ').toLowerCase();

    // Layer 2: Value & Entailment Matching (with Unit Conversion)
    let derivation: ListingClaim['derivation'] = undefined;
    let numericFoundInFact = false;

    for (const feat of supportingFeatures) {
      const matchRes = UnitConversionService.matchNumericOrDerived(text, feat.id, feat.value);
      if (matchRes.matched) {
        numericFoundInFact = true;
        if (matchRes.isDerived && matchRes.derivation) {
          derivation = matchRes.derivation;
          verificationType = 'DERIVED_VERIFIABLE';
        }
      }
    }

    // Direct check: if number token is directly present in supporting facts
    if (!numericFoundInFact) {
      const numMatches = text.match(/\b\d+(?:\.\d+)?(?:\s*(?:inches?|in|mm|cm|lbs?|kg|degrees?|slots?)\b|\s*[%"])/gi) || [];
      for (const nm of numMatches) {
        if (combinedFactText.includes(nm.trim().toLowerCase())) {
          numericFoundInFact = true;
          break;
        }
      }
    }

    const hasNumbersInClaim = /\b\d+(?:\.\d+)?\b/.test(text);
    if (hasNumbersInClaim && !numericFoundInFact) {
      const numericMismatchSpan = (text.match(/\b\d+(?:\.\d+)?(?:\s*(?:inches?|in|mm|cm|lbs?|kg|degrees?|slots?)\b|\s*[%"])/i) || [text])[0];
      return {
        claimId,
        claim: text,
        text,
        claimType,
        verificationType: verificationType || 'FACT_VERIFIABLE',
        riskLevel,
        factIds,
        groundingStatus: 'UNSUPPORTED',
        sourceSection,
        sourceIndex,
        textSpan,
        unsupportedSpan: numericMismatchSpan,
        reason: `Layer 2: Numerical spec '${numericMismatchSpan}' has no direct or derived match in supporting facts.`,
        repairedFrom,
      };
    }

    // Layer 3: Embellishment & Semantic Expansion Audit
    const unsupportedSpans: string[] = [];

    // 3.1 Absolute Guarantees (won't tip over / never tips / cannot tip / guaranteed not to tip)
    const tipAbsoluteMatch = text.match(/\b(?:won'?t\s*tip(?:\s*over)?|never\s*tips?(?:\s*over)?|cannot\s*tip(?:\s*over)?|guaranteed\s*(?:not\s*to\s*tip|stability)?)\b/i);
    if (tipAbsoluteMatch) {
      const factHasTipGuarantee = combinedFactText.includes('won\'t tip') || combinedFactText.includes('anti-tip certified');
      if (!factHasTipGuarantee) {
        unsupportedSpans.push(tipAbsoluteMatch[0]);
      }
    }

    // 3.2 Brand Compatibility Hallucination (Oral-B, Sonicare, Philips, Colgate)
    const brandMatch = text.match(/\b(?:Oral-B|Sonicare|Philips|Colgate)\b/i);
    if (brandMatch) {
      const brandInFact = combinedFactText.includes(brandMatch[0].toLowerCase());
      if (!brandInFact) {
        unsupportedSpans.push(brandMatch[0]);
      }
    }

    // 3.3 Durability / Extended Longevity Claims (for years, lifetime, over time)
    const durabilityMatch = text.match(/\b(?:for\s*years|lifetime|years\s*to\s*come|over\s*time)\b/i);
    if (durabilityMatch) {
      const durInFact = combinedFactText.includes('for years') || combinedFactText.includes('lifetime') || combinedFactText.includes('longevity tested');
      if (!durInFact) {
        unsupportedSpans.push(durabilityMatch[0]);
      }
    }

    // 3.4 Unverified Surface Treatments (sealed, stain-resistant, waterproof)
    if (/\b(?:stains?|stain-resistant|resists?\s*stains?)\b/i.test(lowerText)) {
      const stainInFact = combinedFactText.includes('stain');
      if (!stainInFact) {
        unsupportedSpans.push('resists stains');
      }
    }

    if (/\b(?:sealed)\b/i.test(lowerText)) {
      const sealedInFact = combinedFactText.includes('sealed') || combinedFactText.includes('sealer');
      if (!sealedInFact) {
        unsupportedSpans.push('sealed');
      }
    }

    if (/\b(?:waterproof)\b/i.test(lowerText)) {
      const waterproofInFact = combinedFactText.includes('waterproof');
      if (!waterproofInFact) {
        unsupportedSpans.push('waterproof');
      }
    }

    // 3.5 Wet Surface Claims (wet countertops / wet counters)
    const wetMatch = text.match(/\b(?:wet\s*countertops?|wet\s*counters?|on\s*wet\s*surfaces?)\b/i);
    if (wetMatch) {
      const wetInFact = combinedFactText.includes('wet surface tested') || combinedFactText.includes('wet counter');
      if (!wetInFact) {
        unsupportedSpans.push(wetMatch[0]);
      }
    }

    // 3.6 Unverified Usage Objects (toothpaste, toiletries, makeup brushes, razors)
    const usageMatch = text.match(/\b(?:toothpaste|toiletries|small\s*toiletries|makeup\s*brushes|razors)\b/i);
    if (usageMatch) {
      const usageInFact = combinedFactText.includes(usageMatch[0].toLowerCase());
      if (!usageInFact) {
        unsupportedSpans.push(usageMatch[0]);
      }
    }

    // 3.7 Natural Variation Absolute ("no two pieces are exactly alike")
    const variationMatch = text.match(/\b(?:no\s*two\s*pieces\s*are\s*exactly\s*alike)\b/i);
    if (variationMatch) {
      const varInFact = combinedFactText.includes('no two pieces') || combinedFactText.includes('unique natural veining');
      if (!varInFact) {
        unsupportedSpans.push(variationMatch[0]);
      }
    }

    // 3.8 Humidity Resistance ("ideal for humid bathroom environments")
    const humidMatch = text.match(/\b(?:ideal\s+for\s+humid|humid\s+bathroom\s+environments?|humid\s+environments?)\b/i);
    if (humidMatch) {
      const humidInFact = combinedFactText.includes('humid') || combinedFactText.includes('humidity tested');
      if (!humidInFact) {
        unsupportedSpans.push(humidMatch[0]);
      }
    }

    // Status resolution
    if (unsupportedSpans.length > 0) {
      const primarySpan = unsupportedSpans[0];
      return {
        claimId,
        claim: text,
        text,
        claimType,
        verificationType: verificationType || 'FACT_VERIFIABLE',
        riskLevel,
        factIds,
        groundingStatus: 'PARTIALLY_SUPPORTED',
        sourceSection,
        sourceIndex,
        textSpan,
        unsupportedSpan: primarySpan,
        reason: `Layer 3: Unsupported embellishment span '${primarySpan}' detected without direct fact support.`,
        derivation,
        repairedFrom,
      };
    }

    return {
      claimId,
      claim: text,
      text,
      claimType,
      verificationType: verificationType || 'FACT_VERIFIABLE',
      riskLevel,
      factIds,
      groundingStatus: 'SUPPORTED',
      sourceSection,
      sourceIndex,
      textSpan,
      unsupportedSpan: null,
      derivation,
      repairedFrom,
    };
  }

  /**
   * Evaluate entire list of claims and calculate detailed grounding metrics
   */
  static evaluateClaims(
    rawClaims: Array<Partial<ListingClaim> & { claim?: string; text?: string; factIds?: string[] }>,
    features: ProductFactItem[],
  ): {
    claims: ListingClaim[];
    metrics: ListingGroundingMetrics;
  } {
    const claims: ListingClaim[] = rawClaims.map((rc, idx) =>
      this.evaluateSingleClaim(rc, features, idx),
    );

    const totalClaims = claims.length;
    const supportedClaimsCount = claims.filter((c) => c.groundingStatus === 'SUPPORTED').length;
    const partiallySupportedClaimsCount = claims.filter((c) => c.groundingStatus === 'PARTIALLY_SUPPORTED').length;
    const unsupportedClaimsCount = claims.filter((c) => c.groundingStatus === 'UNSUPPORTED').length;

    // Distinguish verifiable claims from subjective marketing copy
    const verifiableClaims = claims.filter((c) => c.verificationType !== 'SUBJECTIVE_MARKETING');
    const totalVerifiableClaims = verifiableClaims.length;
    const supportedVerifiableClaims = verifiableClaims.filter((c) => c.groundingStatus === 'SUPPORTED').length;

    // Strict Grounding Rate: only 100% SUPPORTED verifiable claims count toward numerator
    const finalSurfaceGroundingRate = totalVerifiableClaims > 0
      ? Math.round((supportedVerifiableClaims / totalVerifiableClaims) * 100) / 100
      : (totalClaims > 0 ? Math.round((supportedClaimsCount / totalClaims) * 100) / 100 : 1.0);

    const metrics: ListingGroundingMetrics = {
      totalClaims,
      groundedClaims: supportedClaimsCount,
      supportedClaimsCount,
      partiallySupportedClaimsCount,
      unsupportedClaimsCount,
      groundingRate: finalSurfaceGroundingRate,
      unsupportedClaimCount: partiallySupportedClaimsCount + unsupportedClaimsCount,
      repairedCount: 0,
      totalVerifiableClaims,
      supportedVerifiableClaims,
      finalSurfaceGroundingRate,
      finalSurfaceClaimCount: totalClaims,
      finalSupportedCount: supportedClaimsCount,
      finalPartialCount: partiallySupportedClaimsCount,
      finalUnsupportedCount: unsupportedClaimsCount,
      claimExtractionVersion: 'v1.2.0-atomic-surface',
      groundingVersion: GROUNDING_ENGINE_VERSION,
    };

    return { claims, metrics };
  }
}
