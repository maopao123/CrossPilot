/**
 * Deterministic Unit Conversion Service (Epic 1.1)
 * Performs mathematical unit conversions (inch <-> mm/cm, lb <-> kg)
 * so that metric/imperial equivalents are grounded without LLM hallucination.
 */

import { ListingClaimDerivation } from './listing-claim.types.js';

export interface DerivedNumericFact {
  sourceFactId: string;
  originalText: string;
  originalValue: number;
  originalUnit: string;
  derivedValue: number;
  derivedUnit: string;
  derivedText: string;
  formula: string;
}

export class UnitConversionService {
  /**
   * Extract and derive deterministic unit conversions from a feature value string
   */
  static extractDerivedFacts(factId: string, text: string): DerivedNumericFact[] {
    const derived: DerivedNumericFact[] = [];
    if (!text) return derived;

    // 1. Inches -> mm / cm (e.g. "1.5 inches", "1.5\"", "1.5-inch", "1.5 in")
    const inchRegex = /(\b\d+(?:\.\d+)?)\s*(?:inches|inch|in|\")/gi;
    let match: RegExpExecArray | null;
    while ((match = inchRegex.exec(text)) !== null) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) {
        const mm = Math.round(val * 25.4 * 10) / 10; // 38.1 mm
        const mmInt = Math.round(val * 25.4); // 38 mm
        const cm = Math.round(val * 2.54 * 100) / 100; // 3.81 cm

        derived.push({
          sourceFactId: factId,
          originalText: match[0],
          originalValue: val,
          originalUnit: 'inch',
          derivedValue: mm,
          derivedUnit: 'mm',
          derivedText: `${mm}mm`,
          formula: `${val} inches * 25.4 = ${mm} mm`,
        });

        if (mmInt !== mm) {
          derived.push({
            sourceFactId: factId,
            originalText: match[0],
            originalValue: val,
            originalUnit: 'inch',
            derivedValue: mmInt,
            derivedUnit: 'mm',
            derivedText: `${mmInt}mm`,
            formula: `${val} inches * 25.4 ≈ ${mmInt} mm`,
          });
        }

        derived.push({
          sourceFactId: factId,
          originalText: match[0],
          originalValue: val,
          originalUnit: 'inch',
          derivedValue: cm,
          derivedUnit: 'cm',
          derivedText: `${cm}cm`,
          formula: `${val} inches * 2.54 = ${cm} cm`,
        });
      }
    }

    // 2. Lbs -> kg (e.g. "3.57 lbs", "3.57 lb", "3.57 pounds")
    const lbRegex = /(\b\d+(?:\.\d+)?)\s*(?:lbs|lb|pounds|pound)\b/gi;
    while ((match = lbRegex.exec(text)) !== null) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) {
        const kg = Math.round(val * 0.45359237 * 100) / 100; // 1.62 kg
        derived.push({
          sourceFactId: factId,
          originalText: match[0],
          originalValue: val,
          originalUnit: 'lbs',
          derivedValue: kg,
          derivedUnit: 'kg',
          derivedText: `${kg} kg`,
          formula: `${val} lbs * 0.45359237 = ${kg} kg`,
        });
      }
    }

    // 3. Kg -> lbs (e.g. "1.62 kg", "1.62 kilograms")
    const kgRegex = /(\b\d+(?:\.\d+)?)\s*(?:kg|kilograms|kilogram)\b/gi;
    while ((match = kgRegex.exec(text)) !== null) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) {
        const lbs = Math.round((val / 0.45359237) * 100) / 100;
        derived.push({
          sourceFactId: factId,
          originalText: match[0],
          originalValue: val,
          originalUnit: 'kg',
          derivedValue: lbs,
          derivedUnit: 'lbs',
          derivedText: `${lbs} lbs`,
          formula: `${val} kg / 0.45359237 = ${lbs} lbs`,
        });
      }
    }

    return derived;
  }

  /**
   * Check if a claim mentions a numeric value that matches an original fact or its deterministic conversion
   */
  static matchNumericOrDerived(
    claimText: string,
    factId: string,
    factValue: string,
  ): { matched: boolean; isDerived: boolean; derivation?: ListingClaimDerivation } {
    const claimLower = claimText.toLowerCase();
    const factLower = factValue.toLowerCase();

    // 1. Check direct substring match
    if (claimLower.includes(factLower)) {
      return {
        matched: true,
        isDerived: false,
        derivation: {
          type: 'DIRECT',
          sourceFactIds: [factId],
          originalValue: factValue,
        },
      };
    }

    // 1b. Check percentage or exact numerical tokens present in factValue
    const numTokens = claimLower.match(/\b\d+(?:\.\d+)?(?:\s*(?:inches?|in|mm|cm|lbs?|kg|slots?|degrees?)\b|\s*[%"])/gi) || [];
    for (const token of numTokens) {
      const normalizedToken = token.trim().toLowerCase();
      if (factLower.includes(normalizedToken)) {
        return {
          matched: true,
          isDerived: false,
          derivation: {
            type: 'DIRECT',
            sourceFactIds: [factId],
            originalValue: token,
          },
        };
      }
    }

    // 2. Extract derived facts from feature value
    const derivedList = this.extractDerivedFacts(factId, factValue);

    // 2a. Check if original numeric value and unit match directly (e.g. "1.5 inches" when fact is "1.5 inches (38mm)")
    for (const d of derivedList) {
      const origValStr = `${d.originalValue}`;
      const origTextLower = d.originalText.toLowerCase();
      if (
        claimLower.includes(origTextLower) ||
        (claimLower.includes(origValStr) &&
          (claimLower.includes(d.originalUnit) ||
            (d.originalUnit === 'inch' && (claimLower.includes('in') || claimLower.includes('"') || claimLower.includes('slot'))) ||
            (d.originalUnit === 'lbs' && (claimLower.includes('lb') || claimLower.includes('pound')))))
      ) {
        return {
          matched: true,
          isDerived: false,
          derivation: {
            type: 'DIRECT',
            sourceFactIds: [factId],
            originalValue: d.originalText,
          },
        };
      }
    }

    // 2b. Check derived unit matches
    for (const d of derivedList) {
      const dValStr = `${d.derivedValue}`;
      const dTextStr = d.derivedText.toLowerCase();

      if (claimLower.includes(dTextStr) || (claimLower.includes(dValStr) && claimLower.includes(d.derivedUnit))) {
        return {
          matched: true,
          isDerived: true,
          derivation: {
            type: 'UNIT_CONVERSION',
            sourceFactIds: [factId],
            formula: d.formula,
            originalValue: `${d.originalValue} ${d.originalUnit}`,
            derivedValue: d.derivedText,
          },
        };
      }
    }

    return { matched: false, isDerived: false };
  }
}
