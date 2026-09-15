/**
 * Keyword Normalizer for Product Research Auto Discovery MVP
 * Deterministic tokenization, punctuation cleanup, safe singularization, and similarity scoring.
 */

import type { ProductIntent } from '@crosspilot/shared';

const KNOWN_ACCESSORY_TOKENS = new Set([
  'lid',
  'lids',
  'cover',
  'covers',
  'cap',
  'caps',
  'strap',
  'straps',
  'handle',
  'handles',
  'sleeve',
  'sleeves',
  'replacement',
  'refill',
  'gasket',
  'seal',
  'seals',
  'straw',
  'straws',
  'valve',
  'valves',
  'attachment',
  'attachments',
  'accessories',
  'accessory',
]);

const KNOWN_BRAND_TOKENS = new Set([
  'pyrex',
  'rubbermaid',
  'oxo',
  'stanley',
  'yeti',
  'ikea',
  'lock&lock',
  'locknlock',
  'snapware',
  'anchor hocking',
  'tupperware',
  'hydro flask',
]);

export class KeywordNormalizer {
  /**
   * Deterministic normalization:
   * - Lowercase
   * - Unicode NFKC normalization
   * - Punctuation to space
   * - Whitespace collapse & trim
   * - Safe singular / plural normalization
   */
  static normalize(raw: string): string {
    if (!raw) return '';
    let text = raw.normalize('NFKC').toLowerCase().trim();
    // Replace punctuation (except alphanumeric) with spaces
    text = text.replace(/[^a-z0-9\s]/g, ' ');
    // Collapse multi-spaces
    const tokens = text.split(/\s+/).filter(Boolean);
    const singularized = tokens.map((token) => this.singularize(token));
    return singularized.join(' ');
  }

  /**
   * Safe singularization for common product keywords
   */
  static singularize(word: string): string {
    if (word.length <= 3) return word;

    // Specific irregulars or known suffixes
    if (word.endsWith('ies') && word.length > 4) {
      return word.slice(0, -3) + 'y'; // berries -> berry
    }
    if (word.endsWith('boxes')) {
      return word.slice(0, -2); // boxes -> box
    }
    if (word.endsWith('dishes')) {
      return word.slice(0, -2); // dishes -> dish
    }
    if (word.endsWith('glasses')) {
      return word.slice(0, -2); // glasses -> glass
    }
    if (word.endsWith('ves') && (word.endsWith('shelves') || word.endsWith('calves'))) {
      return word.slice(0, -3) + 'f'; // shelves -> shelf
    }
    if (word.endsWith('ses') && !word.endsWith('sses')) {
      return word.slice(0, -1);
    }
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
      return word.slice(0, -1); // containers -> container, savers -> saver
    }
    return word;
  }

  /**
   * Tokenize normalized text into unique or ordered tokens
   */
  static tokenize(text: string): string[] {
    const norm = this.normalize(text);
    return norm.split(/\s+/).filter(Boolean);
  }

  /**
   * Calculate Token Jaccard Similarity between two keywords: |A ∩ B| / |A ∪ B|
   */
  static calculateTokenSimilarity(kw1: string, kw2: string): number {
    const tokens1 = new Set(this.tokenize(kw1));
    const tokens2 = new Set(this.tokenize(kw2));

    if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...tokens1, ...tokens2]).size;
    return unionCount === 0 ? 0 : intersectionCount / unionCount;
  }

  /**
   * Check if keyword is primarily a brand term or contains a brand term
   */
  static analyzeBrandTerms(keyword: string, customBrandList?: string[]): {
    isBrandDependent: boolean;
    isPureBrandNavigation: boolean;
    detectedBrands: string[];
  } {
    const norm = this.normalize(keyword);
    const tokens = norm.split(' ');
    const brandSet = new Set([...KNOWN_BRAND_TOKENS, ...(customBrandList || []).map((b) => this.normalize(b))]);

    const detectedBrands: string[] = [];
    for (const brand of brandSet) {
      if (norm.includes(brand)) {
        detectedBrands.push(brand);
      }
    }

    const isBrandDependent = detectedBrands.length > 0;
    // If all or almost all tokens are brand tokens, it's pure brand navigation
    const nonBrandTokens = tokens.filter((t) => !detectedBrands.some((b) => b.split(' ').includes(t)));
    const isPureBrandNavigation = isBrandDependent && nonBrandTokens.length === 0;

    return {
      isBrandDependent,
      isPureBrandNavigation,
      detectedBrands,
    };
  }

  /**
   * Detect Product Intent (MAIN_PRODUCT, ACCESSORY, REPLACEMENT, CONSUMABLE, UNKNOWN)
   */
  static detectIntent(keyword: string): ProductIntent {
    const norm = this.normalize(keyword);
    const tokens = norm.split(' ');

    if (tokens.some((t) => t === 'replacement' || t === 'refill' || t === 'part')) {
      return 'REPLACEMENT';
    }

    if (tokens.some((t) => KNOWN_ACCESSORY_TOKENS.has(t))) {
      return 'ACCESSORY';
    }

    return 'MAIN_PRODUCT';
  }
}
