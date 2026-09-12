/**
 * Listing Claim Contract & Grounding Types (Epic 1.1 + Epic 1.2)
 * Formalizes Claim-Level Entailment Grounding, Risk Classification,
 * Deterministic Unit Derivations, and Final Surface Atomic Claim Extraction.
 */

export type ClaimType =
  | 'MATERIAL'
  | 'DIMENSION'
  | 'WEIGHT'
  | 'COMPATIBILITY'
  | 'PERFORMANCE'
  | 'DURABILITY'
  | 'AESTHETIC'
  | 'USAGE'
  | 'OTHER';

export type ClaimGroundingStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNSUPPORTED';

export type ClaimRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type ClaimVerificationType =
  | 'FACT_VERIFIABLE'
  | 'DERIVED_VERIFIABLE'
  | 'POLICY_SENSITIVE'
  | 'SUBJECTIVE_MARKETING';

export type ClaimSourceSection = 'TITLE' | 'BULLET' | 'DESCRIPTION';

export interface ListingClaimDerivation {
  type: 'DIRECT' | 'UNIT_CONVERSION' | 'DETERMINISTIC_CALCULATION';
  sourceFactIds: string[];
  formula?: string;
  originalValue?: string;
  derivedValue?: string;
}

export interface ListingClaim {
  claimId: string;
  claim: string; // Backwards-compatible alias for text
  text: string;
  claimType: ClaimType;
  verificationType?: ClaimVerificationType;
  riskLevel: ClaimRiskLevel;
  factIds: string[];
  groundingStatus: ClaimGroundingStatus;
  sourceSection?: ClaimSourceSection;
  sourceIndex?: number;
  textSpan?: string;
  unsupportedSpan?: string | null;
  reason?: string;
  derivation?: ListingClaimDerivation;
  repairedFrom?: string;
}

export interface ListingGroundingMetrics {
  totalClaims: number; // Total claims evaluated (surface atomic claims in Epic 1.2)
  groundedClaims: number;
  supportedClaimsCount: number;
  partiallySupportedClaimsCount: number;
  unsupportedClaimsCount: number;
  groundingRate: number; // Active grounding rate (finalSurfaceGroundingRate in Epic 1.2)
  unsupportedClaimCount: number;
  repairedCount: number;
  initialGroundingRate?: number;
  initialUnsupportedCount?: number;
  totalVerifiableClaims?: number;
  supportedVerifiableClaims?: number;
  declaredClaimGroundingRate?: number; // Rate of LLM-declared claims
  finalSurfaceGroundingRate?: number; // Strict surface verifiable grounding rate
  finalSurfaceClaimCount?: number;
  finalSupportedCount?: number;
  finalPartialCount?: number;
  finalUnsupportedCount?: number;
  claimExtractionVersion?: string;
  postRepairRescan?: boolean;
  groundingVersion: string;
}

export const GROUNDING_ENGINE_VERSION = 'v1.2.0-surface-coverage';
