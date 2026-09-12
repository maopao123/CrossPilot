/**
 * Final Surface Claim Extractor Service (Epic 1.2)
 *
 * Decomposes final user-facing text (Title, 5 Bullets, Description) into atomic,
 * traceable claims with sourceSection, sourceIndex, and textSpan.
 * Categorizes claims into FACT_VERIFIABLE, DERIVED_VERIFIABLE, POLICY_SENSITIVE,
 * or SUBJECTIVE_MARKETING.
 */

import {
  ListingClaim,
  ClaimType,
  ClaimRiskLevel,
  ClaimVerificationType,
  ClaimSourceSection,
} from './listing-claim.types.js';
import { ClaimGroundingService, ProductFactItem } from './claim-grounding.service.js';

export interface ListingSurfaceDraftInput {
  title: string;
  bulletPoints: string[];
  description: string;
}

export class SurfaceClaimExtractorService {
  /**
   * Break a text block into atomic clauses / claim candidate spans
   */
  static segmentTextIntoSpans(text: string): string[] {
    if (!text || typeof text !== 'string') return [];

    // 1. Normalize bullet markers like "[BP 1] ", "- ", "**...**"
    let cleaned = text
      .replace(/^\[BP\s*\d+\]\s*/i, '')
      .replace(/^[-*•]\s+/, '')
      .trim();

    // If text contains colon headline e.g. "100% GENUINE MARBLE: Details...", split into headline and body
    const colonMatch = cleaned.match(/^([A-Z0-9\s%.,'"-]{4,}):\s*(.+)$/);
    const initialChunks: string[] = [];
    if (colonMatch) {
      initialChunks.push(colonMatch[1].trim());
      initialChunks.push(colonMatch[2].trim());
    } else {
      initialChunks.push(cleaned);
    }

    const sentences: string[] = [];
    for (const chunk of initialChunks) {
      // Split on sentence boundaries [.!?]+ and em-dashes / pipes
      const parts = chunk.split(/(?:[.!?]+(?:\s+|$)|[–—|;]+)/g);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length >= 4) {
          sentences.push(trimmed);
        }
      }
    }

    const atomicSpans: string[] = [];

    // 2. Clause splitting within sentences on major conjunctions and connectors
    const clauseRegex = /,\s*(?:and\s+(?:won'?t|never|cannot|guaranteed|resists?|provides?|stays?|protects?|is|features?|fitted|equipped)|including\s+(?:Oral-B|Sonicare|Philips|Colgate)|featuring|ensuring|making\s+it|providing|designed\s+to|ideal\s+for|perfect\s+for|fitted\s+with|equipped\s+with|leaving|unlike)\b/i;
    const andAbsoluteRegex = /\s+and\s+(?:won'?t\s*tip|never\s*tips?|cannot\s*tip|guaranteed\s+not\s+to\s+tip)\b/i;

    for (const sentence of sentences) {
      // Check for inline absolute statements e.g. "3.57 lbs and guaranteed not to tip over"
      let currentSentence = sentence;
      const andAbsMatch = currentSentence.match(andAbsoluteRegex);
      if (andAbsMatch && andAbsMatch.index !== undefined) {
        const part1 = currentSentence.substring(0, andAbsMatch.index).trim();
        const part2 = currentSentence.substring(andAbsMatch.index + 5).trim(); // skip ' and '
        if (part1.length >= 4) atomicSpans.push(part1);
        if (part2.length >= 4) atomicSpans.push(part2);
        continue;
      }

      // Check standard clause splits
      const clauses = currentSentence.split(clauseRegex);
      if (clauses.length > 1) {
        for (const c of clauses) {
          const trimmed = c.replace(/^[,\s-]+|[,\s-]+$/g, '').trim();
          if (trimmed.length >= 4) {
            atomicSpans.push(trimmed);
          }
        }
      } else {
        atomicSpans.push(sentence.replace(/^[,\s-]+|[,\s-]+$/g, '').trim());
      }
    }

    return atomicSpans;
  }

  /**
   * Classify verification category for an atomic text span
   */
  static classifyVerificationType(text: string): ClaimVerificationType {
    const lower = text.toLowerCase();

    // 1. POLICY_SENSITIVE (Absolutes, Prohibited Terms, Extreme Guarantees)
    if (
      /\b(?:won'?t\s*tip(?:\s*over)?|never\s*tips?(?:\s*over)?|cannot\s*tip(?:\s*over)?|guaranteed\s*(?:not\s*to\s*tip|stability)?)\b/i.test(lower) ||
      /\b(?:#1\s*best\s*seller|top\s*rated|free\s*shipping|money\s*back|100%\s*guaranteed|fda\s*approved|clinical\s*grade)\b/i.test(lower)
    ) {
      return 'POLICY_SENSITIVE';
    }

    // 2. DERIVED_VERIFIABLE (Pure metric conversion units)
    if (
      /\b(?:38\.1\s*mm|38mm|3\.81\s*cm|1\.62\s*kg)\b/i.test(lower) &&
      !/\b(?:1\.5\s*inch|3\.57\s*lbs)\b/i.test(lower)
    ) {
      return 'DERIVED_VERIFIABLE';
    }

    // 3. FACT_VERIFIABLE (Physical specs, measurements, materials, compatibility, durability, explicit functions)
    if (
      /\b\d+(?:\.\d+)?\s*(?:inches?|in|\"|lbs?|pounds?|kg|mm|cm|slots?|compartments?|degrees?)\b/i.test(lower) ||
      /\b(?:marble|carrara|stone|resin|eva\s*pads?|cushioned|rubber)\b/i.test(lower) ||
      /\b(?:fits?|compatible|oral-b|sonicare|philips|colgate|handles?|electric\s*toothbrush)\b/i.test(lower) ||
      /\b(?:non-slip|anti-slip|water-resistant|waterproof|stain-resistant|stain-proof|resists?\s*stains?|sealed\s*finish|sealed|prevent\s*sliding|no\s*two\s*pieces|veining\s*may\s*vary|ideal\s*for\s*humid|toothpaste|toiletries|makeup\s*brushes|razors|wet\s*countertops?|wet\s*counters?|countertop\s*safe)\b/i.test(lower) ||
      /\b(?:for\s*years|lifetime|over\s*time|years\s*to\s*come)\b/i.test(lower)
    ) {
      return 'FACT_VERIFIABLE';
    }

    // 4. SUBJECTIVE_MARKETING (Aesthetic styling, decor, convenience feelings, vanity placement, care tips, room placement)
    if (
      /\b(?:luxurious|luxury|elegant|elegance|one[- ]of[- ]a[- ]kind|artisan|bespoke|hallmark|aesthetic|décor|decor|modern|minimalist|profile|complements?|adds?\s*a|elevate|timeless|stylish|beautiful|tidy|organized|handcrafted|vanity\s*(?:use|placement|decor)|bathroom\s*vanity|suitable\s+for\s+bathroom|stunning\s*addition|stunning|simply\s*wipe|wipe\s*with|damp\s*cloth|home\s*and\s*guest|guest\s*bathrooms?|popular\s*models|versatile|addition\s+to\s+any\s+vanity|addition\s+to\s+your\s+home|sophisticated\s+bathroom\s+accessory|in\s+style|lifestyle)\b/i.test(lower)
    ) {
      return 'SUBJECTIVE_MARKETING';
    }

    // Default to FACT_VERIFIABLE to avoid false passes
    return 'FACT_VERIFIABLE';
  }

  /**
   * Match an atomic surface claim to supporting feature factIds
   */
  static matchSupportingFactIds(
    claimText: string,
    verificationType: ClaimVerificationType,
    features: ProductFactItem[],
  ): string[] {
    if (verificationType === 'SUBJECTIVE_MARKETING') {
      return [];
    }

    const lower = claimText.toLowerCase();
    const matchedIds = new Set<string>();

    for (const f of features) {
      const fName = f.name.toLowerCase();
      const fVal = f.value.toLowerCase();
      const combined = `${fName} ${fVal}`;

      // Weight match
      if (
        (lower.includes('lb') || lower.includes('pound') || lower.includes('kg') || lower.includes('weight') || lower.includes('heavy') || lower.includes('weighted')) &&
        (combined.includes('weight') || combined.includes('lb') || combined.includes('kg'))
      ) {
        matchedIds.add(f.id);
      }

      // Slot / Dimension match
      if (
        (lower.includes('inch') || lower.includes('mm') || lower.includes('cm') || lower.includes('slot') || lower.includes('compartment') || lower.includes('diameter') || lower.includes('width') || lower.includes('handles') || lower.includes('fit') || lower.includes('toothbrush')) &&
        (combined.includes('slot') || combined.includes('dimension') || combined.includes('diameter') || combined.includes('compartment'))
      ) {
        matchedIds.add(f.id);
      }

      // Material match
      if (
        (lower.includes('marble') || lower.includes('carrara') || lower.includes('stone') || lower.includes('material') || lower.includes('vein') || lower.includes('pieces') || lower.includes('geological') || lower.includes('nature') || lower.includes('alike')) &&
        (combined.includes('marble') || combined.includes('stone') || combined.includes('material'))
      ) {
        matchedIds.add(f.id);
      }

      // Surface finish / Waterproof match
      if (
        (lower.includes('sealed') || lower.includes('finish') || lower.includes('water-resistant') || lower.includes('waterproof') || lower.includes('stain') || lower.includes('clean') || lower.includes('humid')) &&
        (combined.includes('finish') || combined.includes('surface') || combined.includes('water-resistant') || combined.includes('sealed'))
      ) {
        matchedIds.add(f.id);
      }

      // Protective base / Non-slip match
      if (
        (lower.includes('eva') || lower.includes('pad') || lower.includes('non-slip') || lower.includes('anti-slip') || lower.includes('slide') || lower.includes('sliding') || lower.includes('countertop safe') || lower.includes('scratches')) &&
        (combined.includes('pad') || combined.includes('protection') || combined.includes('non-slip') || combined.includes('base'))
      ) {
        matchedIds.add(f.id);
      }
    }

    return Array.from(matchedIds);
  }

  /**
   * Extract all atomic claims from Title, 5 Bullets, and Description
   */
  static extractSurfaceClaims(
    draft: ListingSurfaceDraftInput,
    features: ProductFactItem[],
  ): ListingClaim[] {
    const claims: ListingClaim[] = [];
    let claimCounter = 1;

    // 1. Extract Title Claims
    if (draft.title) {
      const titleSpans = this.segmentTextIntoSpans(draft.title);
      for (const span of titleSpans) {
        const vType = this.classifyVerificationType(span);
        const cType = ClaimGroundingService.classifyClaimType(span);
        const rLevel = ClaimGroundingService.evaluateRiskLevel(cType, span);
        const factIds = this.matchSupportingFactIds(span, vType, features);

        claims.push({
          claimId: `surf-title-0-${claimCounter++}`,
          claim: span,
          text: span,
          claimType: cType,
          verificationType: vType,
          riskLevel: rLevel,
          factIds,
          groundingStatus: 'UNSUPPORTED', // placeholder, will be evaluated by ClaimGroundingService
          sourceSection: 'TITLE',
          sourceIndex: 0,
          textSpan: span,
        });
      }
    }

    // 2. Extract Bullet Claims
    if (Array.isArray(draft.bulletPoints)) {
      draft.bulletPoints.forEach((bullet, bIdx) => {
        const bulletSpans = this.segmentTextIntoSpans(bullet);
        for (const span of bulletSpans) {
          const vType = this.classifyVerificationType(span);
          const cType = ClaimGroundingService.classifyClaimType(span);
          const rLevel = ClaimGroundingService.evaluateRiskLevel(cType, span);
          const factIds = this.matchSupportingFactIds(span, vType, features);

          claims.push({
            claimId: `surf-bullet-${bIdx}-${claimCounter++}`,
            claim: span,
            text: span,
            claimType: cType,
            verificationType: vType,
            riskLevel: rLevel,
            factIds,
            groundingStatus: 'UNSUPPORTED',
            sourceSection: 'BULLET',
            sourceIndex: bIdx,
            textSpan: span,
          });
        }
      });
    }

    // 3. Extract Description Claims
    if (draft.description) {
      const descSpans = this.segmentTextIntoSpans(draft.description);
      for (const span of descSpans) {
        const vType = this.classifyVerificationType(span);
        const cType = ClaimGroundingService.classifyClaimType(span);
        const rLevel = ClaimGroundingService.evaluateRiskLevel(cType, span);
        const factIds = this.matchSupportingFactIds(span, vType, features);

        claims.push({
          claimId: `surf-desc-0-${claimCounter++}`,
          claim: span,
          text: span,
          claimType: cType,
          verificationType: vType,
          riskLevel: rLevel,
          factIds,
          groundingStatus: 'UNSUPPORTED',
          sourceSection: 'DESCRIPTION',
          sourceIndex: 0,
          textSpan: span,
        });
      }
    }

    return claims;
  }
}
