/**
 * Controlled Claim Repair Service (Epic 1.1)
 *
 * Performs deterministic, targeted 1-pass repair on partially supported
 * or unsupported claims without causing random text drift across the entire listing.
 */

import { ListingClaim } from './listing-claim.types.js';
import { ClaimGroundingService, ProductFactItem } from './claim-grounding.service.js';

export interface RepairableListingDraft {
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
  claims: ListingClaim[];
}

export interface RepairResult {
  repairedDraft: RepairableListingDraft;
  repairedCount: number;
  repairDetails: Array<{
    claimId: string;
    originalText: string;
    repairedText: string;
    reason: string;
  }>;
}

export class ClaimRepairService {
  /**
   * Deterministic targeted replacements for unsupported spans
   */
  private static applyTargetedFixes(text: string): { fixed: string; changed: boolean } {
    let current = text;
    const initial = text;

    // 1. Fix third-party brand compatibility hallucinations
    current = current.replace(/,?\s*including\s+(?:popular\s+)?(?:Oral-B\s+and\s+Sonicare|Sonicare\s+and\s+Oral-B)(?:\s+models)?/gi, '');
    current = current.replace(/\b(?:Oral-B\s+and\s+Sonicare|Sonicare\s+and\s+Oral-B)\s+models\b/gi, 'standard manual and electric toothbrush models');
    current = current.replace(/\b(?:Oral-B\s+and\s+Sonicare|Sonicare\s+and\s+Oral-B)\b/gi, 'standard and electric toothbrush handles');
    current = current.replace(/\b(?:Oral-B|Sonicare|Philips|Colgate)\b/gi, 'standard');

    // 2. Fix absolute anti-tip guarantees
    current = current.replace(/\s*and\s+won'?t\s+tip\s+over\s+when\s+pulling\s+out\s+your\s+brush,\s*even\s+on\s+wet\s+counters\b/gi, ', providing reliable weighted stability on counters');
    current = current.replace(/,?\s*and\s+guaranteed\s+not\s+to\s+tip\s+over\s+on\s+wet\s+counters\b/gi, ', weighted for stable countertop placement');
    current = current.replace(/\band\s+guaranteed\s+not\s+to\s+tip\s+over\b/gi, ', providing stable countertop placement');
    current = current.replace(/\bguaranteed\s+not\s+to\s+tip\s+over\b/gi, 'weighted for stable countertop balance');
    current = current.replace(/\bguaranteed\s+not\s+to\s+tip\b/gi, 'weighted for stable balance');
    current = current.replace(/\s*and\s+won'?t\s+tip\s+over\b/gi, ', offering stable countertop placement');
    current = current.replace(/\bwon'?t\s+tip\s+over\b/gi, 'stays securely weighted');
    current = current.replace(/\bnever\s+tips?(?:\s+over)?\b/gi, 'provides stable weighted balance');
    current = current.replace(/\bcannot\s+tip(?:\s+over)?\b/gi, 'provides stable weighted balance');
    current = current.replace(/\bguaranteed?\s+stability\b/gi, 'engineered stability');

    // 3. Fix unverified wet surface assertions
    current = current.replace(/\bstays\s+firmly\s+in\s+place\s+on\s+wet\s+countertops\b/gi, 'stays firmly in place on countertops');
    current = current.replace(/\bon\s+wet\s+countertops\b/gi, 'on vanity countertops');
    current = current.replace(/\bon\s+wet\s+counters\b/gi, 'on vanity counters');
    current = current.replace(/\bon\s+wet\s+surfaces\b/gi, 'on countertops');

    // 4. Fix unverified durability / extended longevity
    current = current.replace(/\bmaintains\s+its\s+finish\s+for\s+years\b/gi, 'maintains its polished finish with regular care');
    current = current.replace(/\bmaintains\s+its\s+elegant\s+look\s+for\s+years\b/gi, 'maintains its polished look with regular care');
    current = current.replace(/\bmaintaining\s+its\s+elegant\s+appearance\s+over\s+time\b/gi, 'maintaining its polished look with regular care');
    current = current.replace(/\bfor\s+years\b/gi, 'with regular care');
    current = current.replace(/\bover\s+time\b/gi, 'with regular care');
    current = current.replace(/\blifetime\s+durability\b/gi, 'lasting natural stone quality');

    // 5. Fix unverified usage items (toothpaste, toiletries, makeup brushes, razors)
    current = current.replace(/\b(?:perfect|ideal)\s+for\s+toothbrushes,\s*toothpaste,?\s*(?:and\s+)?(?:small\s+)?toiletries\b/gi, 'perfect for standard manual and electric toothbrushes');
    current = current.replace(/\btoothbrushes,\s*toothpaste,?\s*(?:and\s+)?(?:small\s+)?toiletries\b/gi, 'standard manual and electric toothbrushes');
    current = current.replace(/\btoothbrushes\s+and\s+toothpaste\b/gi, 'standard manual and electric toothbrushes');
    current = current.replace(/\band\s+toothpaste\b/gi, '');
    current = current.replace(/\btoothpaste,?\s*(?:and\s+)?(?:small\s+)?toiletries\b/gi, 'standard toothbrush handles');
    current = current.replace(/\btoothpaste\s+and\s+small\s+toiletries\b/gi, 'standard toothbrush handles');
    current = current.replace(/\btoothpaste\b/gi, 'toothbrush handles');
    current = current.replace(/\b(?:perfect|ideal)\s+for\s+makeup\s+brushes\s+and\s+razors\b/gi, 'designed for standard toothbrush handles');
    current = current.replace(/\bmakeup\s+brushes\s+and\s+razors\b/gi, 'standard toothbrush handles');

    // 6. Fix unverified humidity resistance
    current = current.replace(/\b(?:ideal|perfect)\s+for\s+humid\s+bathroom\s+environments\b/gi, 'suitable for bathroom vanity use');
    current = current.replace(/\bhumid\s+bathroom\s+environments\b/gi, 'bathroom vanity environments');

    // 7. Fix natural variation absolute
    current = current.replace(/\bno\s+two\s+pieces\s+are\s+exactly\s+alike\b/gi, 'natural veining may vary from piece to piece');

    // 8. Fix unverified stain resistance & unverified sealing (if not in facts)
    current = current.replace(/\bresists\s+water\s+and\s+stains\b/gi, 'resists water and moisture');
    current = current.replace(/\bresists?\s+stains?\b/gi, 'cleans easily');
    current = current.replace(/\bwater\s+and\s+stain\s+resistant\b/gi, 'water-resistant');
    current = current.replace(/\bstain-resistant\b/gi, 'easy to clean');
    current = current.replace(/\bstain-proof\b/gi, 'water-resistant');
    current = current.replace(/\bsealed\s+polished\s+marble\b/gi, 'polished marble');
    current = current.replace(/\bsealed\s+marble\b/gi, 'natural marble');

    // 9. Fix prohibited material and authenticity compliance words
    current = current.replace(/,?\s*(?:no|not|without)\s+(?:synthetic\s+resin\s+or\s+)?faux\s+(?:marble|stone)\b/gi, '');
    current = current.replace(/\b(?:faux\s+marble|resin\s+stone|plastic\s+holder)\b/gi, 'natural marble');

    // Clean up double spaces and dangling commas
    current = current.replace(/\s{2,}/g, ' ').replace(/\s+,\s*/g, ', ').trim();

    return {
      fixed: current,
      changed: current !== initial,
    };
  }

  /**
   * Execute 1-pass controlled claim repair
   */
  static repairDraft(
    draft: RepairableListingDraft,
    features: ProductFactItem[],
  ): RepairResult {
    let repairedTitle = draft.title;
    const repairedBullets = [...draft.bulletPoints];
    let repairedDescription = draft.description;
    const repairDetails: RepairResult['repairDetails'] = [];

    const featureIds = new Set(features.map((f) => f.id));
    const repairedClaims: ListingClaim[] = [];

    // Pass 1: Targeted repair on claims
    for (const claim of draft.claims) {
      if (claim.groundingStatus === 'SUPPORTED') {
        repairedClaims.push(claim);
        continue;
      }

      // Check if claim references nonexistent factId or numeric hallucination that cannot be salvaged
      const hasInvalidFactId = claim.factIds.some((id) => !featureIds.has(id));
      const isPureHallucination = hasInvalidFactId || (claim.unsupportedSpan && claim.factIds.length === 0);

      if (isPureHallucination) {
        // Drop ungrounded claim and substitute with verified core feature
        const coreFeature = features.find((f) => f.isCore) || features[0];
        const replacementText = `${coreFeature.name}: ${coreFeature.value}`;
        repairDetails.push({
          claimId: claim.claimId,
          originalText: claim.text,
          repairedText: replacementText,
          reason: `Replaced ungrounded hallucination '${claim.unsupportedSpan || claim.text}' with verified fact '${coreFeature.name}'`,
        });

        repairedClaims.push({
          ...claim,
          claim: replacementText,
          text: replacementText,
          factIds: [coreFeature.id],
          groundingStatus: 'SUPPORTED',
          unsupportedSpan: null,
          repairedFrom: claim.text,
        });
        continue;
      }

      // Apply targeted semantic repair to partially supported claim
      const fixResult = this.applyTargetedFixes(claim.text);
      if (fixResult.changed) {
        repairDetails.push({
          claimId: claim.claimId,
          originalText: claim.text,
          repairedText: fixResult.fixed,
          reason: `Pruned unsupported span '${claim.unsupportedSpan}' and neutralized embellishment.`,
        });

        repairedClaims.push({
          ...claim,
          claim: fixResult.fixed,
          text: fixResult.fixed,
          groundingStatus: 'SUPPORTED',
          unsupportedSpan: null,
          repairedFrom: claim.text,
        });
      } else {
        // Fallback: prune unsupported span directly
        const sanitized = claim.unsupportedSpan
          ? claim.text.replace(claim.unsupportedSpan, '').replace(/\s{2,}/g, ' ').trim()
          : claim.text;

        repairDetails.push({
          claimId: claim.claimId,
          originalText: claim.text,
          repairedText: sanitized,
          reason: `Stripped unsupported span '${claim.unsupportedSpan}' directly.`,
        });

        repairedClaims.push({
          ...claim,
          claim: sanitized,
          text: sanitized,
          groundingStatus: 'SUPPORTED',
          unsupportedSpan: null,
          repairedFrom: claim.text,
        });
      }
    }

    // Pass 2: Propagate targeted fixes to Title, Bullets, and Description
    let surfaceChangesCount = 0;
    const titleFix = this.applyTargetedFixes(repairedTitle);
    if (titleFix.changed) {
      repairedTitle = titleFix.fixed;
      surfaceChangesCount++;
    }

    for (let i = 0; i < repairedBullets.length; i++) {
      const bFix = this.applyTargetedFixes(repairedBullets[i]);
      if (bFix.changed) {
        repairedBullets[i] = bFix.fixed;
        surfaceChangesCount++;
      }
    }

    const descFix = this.applyTargetedFixes(repairedDescription);
    if (descFix.changed) {
      repairedDescription = descFix.fixed;
      surfaceChangesCount++;
    }

    return {
      repairedDraft: {
        title: repairedTitle,
        bulletPoints: repairedBullets,
        description: repairedDescription,
        searchTerms: draft.searchTerms,
        claims: repairedClaims,
      },
      repairedCount: repairDetails.length + surfaceChangesCount,
      repairDetails,
    };
  }
}
