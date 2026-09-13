import { MarketplacePolicyProfile } from './listing.types.js';

export function clampToCharLimit(text: string, maxChars: number): string {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  if (!value || maxChars <= 0 || value.length <= maxChars) {
    return value;
  }

  const sliced = value.slice(0, maxChars);
  const breakAt = Math.max(
    sliced.lastIndexOf(' '),
    sliced.lastIndexOf(','),
    sliced.lastIndexOf('-'),
    sliced.lastIndexOf('/'),
    sliced.lastIndexOf('|'),
  );
  const cut = breakAt >= Math.floor(maxChars * 0.6) ? sliced.slice(0, breakAt) : sliced;
  return cut.replace(/[\s,;:/\-|]+$/g, '').trim();
}

export function clampToByteLimit(text: string, maxBytes: number): string {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  if (!value || maxBytes <= 0) {
    return value;
  }

  let next = value;
  while (Buffer.byteLength(next, 'utf8') > maxBytes) {
    const truncated = clampToCharLimit(next, Math.max(1, next.length - 1));
    if (truncated === next) {
      return next.slice(0, Math.max(1, next.length - 1));
    }
    next = truncated;
  }
  return next;
}

export function enforceMarketplaceListingLimits(
  draft: {
    title: string;
    bulletPoints: string[];
    description: string;
    searchTerms: string;
  },
  profile: MarketplacePolicyProfile,
): {
  title: string;
  bulletPoints: string[];
  description: string;
  searchTerms: string;
} {
  const bullets = (draft.bulletPoints || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, profile.bullets.maxCount);

  while (bullets.length < profile.bullets.maxCount && draft.description) {
    bullets.push(draft.description.slice(0, 180).trim());
  }

  return {
    title: clampToCharLimit(draft.title, profile.title.maxLength),
    bulletPoints: bullets,
    description: (draft.description || '').trim(),
    searchTerms: clampToByteLimit(draft.searchTerms, profile.searchTerms.maxLength),
  };
}
