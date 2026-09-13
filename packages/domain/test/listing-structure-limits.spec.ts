import { clampToCharLimit, enforceMarketplaceListingLimits } from '../src/listing/listing-structure-limits';
import { getMarketplacePolicyProfile } from '../src/listing/marketplace-policy.profile';

describe('listing structure limits', () => {
  it('does not change a title already within the limit', () => {
    expect(clampToCharLimit('HOMEFORTE Shoe Organizer', 200)).toBe('HOMEFORTE Shoe Organizer');
  });

  it('cuts an oversized title on a word boundary and strips trailing punctuation', () => {
    const title =
      'HOMEFORTE 2 Pack Shoe Organizer for Closet, Clear Foldable Shoe Storage Containers Adjustable Dividers Fits 16 Pairs, Shoe Storage Bins Baskets Boxes with Reinforced Handles Beige';
    const clamped = clampToCharLimit(title, 80);
    expect(clamped.length).toBeLessThanOrEqual(80);
    expect(clamped).not.toMatch(/[,\-\/\s]$/);
    expect(clamped).toMatch(/HOMEFORTE/);
  });

  it('enforces Amazon US title and search-term limits on a concatenated draft', () => {
    const profile = getMarketplacePolicyProfile('AMAZON_US');
    const limited = enforceMarketplaceListingLimits(
      {
        title: 'HOMEFORTE '.repeat(40) + 'Shoe Organizer',
        bulletPoints: ['A'.repeat(20), 'B'.repeat(20), 'C'.repeat(20), 'D'.repeat(20), 'E'.repeat(20)],
        description: 'Foldable two-pack shoe organizer with clear lid.',
        searchTerms: 'shoe organizer '.repeat(40),
      },
      profile,
    );

    expect(limited.title.length).toBeLessThanOrEqual(profile.title.maxLength);
    expect(limited.bulletPoints).toHaveLength(5);
    expect(Buffer.byteLength(limited.searchTerms, 'utf8')).toBeLessThanOrEqual(profile.searchTerms.maxLength);
  });
});
