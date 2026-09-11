import { MarketplacePolicyProfile } from './listing.types.js';

export const AMAZON_US_POLICY_PROFILE: MarketplacePolicyProfile = {
  marketplace: 'AMAZON_US',
  locale: 'en-US',
  title: {
    maxLength: 200,
    rules: [
      'Capitalize the first letter of each word (Title Case), except prepositions/conjunctions.',
      'Do not use promotional phrases (e.g. Free Shipping, 100% Quality Guaranteed, Best Seller).',
      'No symbols or emojis (&, !, *, $, etc. should not be used decoratively).',
      'Include Brand, Material, Key Spec/Size, Product Type, and Variant info.',
    ],
  },
  bullets: {
    maxCount: 5,
    totalMaxLength: 1000,
    rules: [
      'Start each bullet with a short capitalized benefit header in brackets or followed by colon.',
      'State verified physical and functional product features first.',
      'No company-specific, warranty, or return policy text in bullet points.',
      'Avoid ungrounded medical/FDA claims or unverified superlatives.',
    ],
  },
  searchTerms: {
    maxLength: 250, // 250 bytes limit on Amazon US
    rules: [
      'Do not include brand name or competitor brand names.',
      'Do not use punctuation (commas, hyphens, periods). Separate by single space.',
      'Do not repeat words already in title or bullet points unnecessarily.',
      'No subjective statements or temporary claims (new, on sale).',
    ],
  },
  forbiddenPatterns: [
    'fda approved',
    'medical grade',
    'cures',
    'best seller',
    '#1',
    'lowest price',
    'free gift',
    'cheapest',
    'resin stone',
    'faux marble',
    'plastic holder',
  ],
  updatedAt: '2026-09-01T00:00:00Z',
  evidenceIds: ['DOC-AMZ-POL-2026-01', 'DOC-AMZ-STYLE-2026-03'],
};

export const MARKETPLACE_POLICY_PROFILES: Record<string, MarketplacePolicyProfile> = {
  AMAZON_US: AMAZON_US_POLICY_PROFILE,
  AMAZON_UK: {
    ...AMAZON_US_POLICY_PROFILE,
    marketplace: 'AMAZON_UK',
    locale: 'en-GB',
    title: { ...AMAZON_US_POLICY_PROFILE.title, maxLength: 200 },
  },
  AMAZON_DE: {
    ...AMAZON_US_POLICY_PROFILE,
    marketplace: 'AMAZON_DE',
    locale: 'de-DE',
    title: { ...AMAZON_US_POLICY_PROFILE.title, maxLength: 200 },
  },
};

export function getMarketplacePolicyProfile(marketplace = 'AMAZON_US'): MarketplacePolicyProfile {
  const normalized = marketplace.toUpperCase().replace('-', '_');
  return MARKETPLACE_POLICY_PROFILES[normalized] || AMAZON_US_POLICY_PROFILE;
}
