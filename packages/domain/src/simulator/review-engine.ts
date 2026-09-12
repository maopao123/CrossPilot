import type { Rng } from './rng.js';
import { pickOne } from './rng.js';
import { aggregateEventMultipliers } from './event-engine.js';
import type {
  ActiveSimEvent,
  SimConfig,
  SimReviewRow,
  SkuChannelSales,
} from './types.js';
import { simDateToUtcDate } from './types.js';

const POSITIVE_REVIEWS: { rating: number; title: string; content: string }[] = [
  {
    rating: 5,
    title: 'Beautiful and heavy — never tips over',
    content:
      'The real marble base is gorgeous and heavy enough that it never moves. Fits my Oral-B handle perfectly in the 1.5 inch slots.',
  },
  {
    rating: 5,
    title: 'Worth every penny',
    content:
      'Upgraded my whole bathroom counter. The polished stone looks premium and the anti-slip pads keep it in place.',
  },
  {
    rating: 4,
    title: 'Great quality, slightly smaller than expected',
    content:
      'Solid natural marble and good drainage slope. Wish it were a touch larger, but it holds all our toothbrushes and toothpaste.',
  },
  {
    rating: 4,
    title: 'Looks expensive',
    content:
      'Elegant piece, easy to clean. One slot edge was a little rough but nothing noticeable on the counter.',
  },
  {
    rating: 3,
    title: 'Decent but color varies',
    content:
      'Natural stone so the veining differs from the photos. Quality is fine, just set expectations on the exact pattern.',
  },
];

const NEGATIVE_REVIEWS: { rating: number; title: string; content: string }[] = [
  {
    rating: 1,
    title: 'Hole too small for electric toothbrush',
    content:
      'The hole too small problem is real — my Oral-B iO handle does not fit. Advertised as compatible but the diameter is too narrow.',
  },
  {
    rating: 1,
    title: 'Fake marble, chipped on arrival',
    content:
      'This looks like fake marble resin, not natural stone. Mine arrived with chipping on the base edge. Returning it.',
  },
  {
    rating: 2,
    title: 'Hole too small for Sonicare handle',
    content:
      'My Philips Sonicare handle barely fits and the hole too small issue makes it wobble. Expected better at this price.',
  },
  {
    rating: 2,
    title: 'Chipping after two weeks',
    content:
      'Started chipping around the slot rim after two weeks of normal use. Also skeptical this is real marble — feels like fake marble coating.',
  },
];

const REVIEWER_NAMES = [
  'Emma R.',
  'Liam K.',
  'Sophia M.',
  'Noah T.',
  'Ava P.',
  'Mason W.',
  'Isabella H.',
  'Ethan C.',
  'Mia S.',
  'Lucas B.',
];

export interface ReviewEngineInput {
  config: SimConfig;
  salesSummary: SkuChannelSales[];
  activeEvents: ActiveSimEvent[];
  simDate: string;
  dayIndex: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Probabilistically converts the day's orders into reviews. The rating
 * distribution is driven by qualityScore / rating and pushed negative while
 * a review-wave or return event is active; negative reviews carry the VOC
 * keywords ("hole too small", "fake marble", "chipping").
 */
export function runReviewEngine(input: ReviewEngineInput, rng: Rng): SimReviewRow[] {
  const { config, salesSummary, activeEvents, simDate, dayIndex } = input;
  const reviews: SimReviewRow[] = [];
  const reviewDate = simDateToUtcDate(simDate);

  for (const sku of config.skus) {
    const summary = salesSummary.find((item) => item.skuCode === sku.skuCode);
    if (!summary) continue;
    const multipliers = aggregateEventMultipliers(activeEvents, sku.skuCode, dayIndex);
    const baseNegativeProb = clamp(
      (1 - sku.qualityScore) * 0.55 + Math.max(0, 4.6 - sku.rating) * 0.05,
      0.02,
      0.6,
    );
    const negativeProb = clamp(baseNegativeProb * multipliers.negativeReview, 0.02, 0.9);

    for (const [channel, count] of [
      ['amazon', summary.amazonOrders],
      ['shopify', summary.shopifyOrders],
    ] as const) {
      for (let i = 0; i < count; i++) {
        if (rng() >= config.reviewProbability) continue;
        const negative = rng() < negativeProb;
        const template = negative ? pickOne(rng, NEGATIVE_REVIEWS) : pickOne(rng, POSITIVE_REVIEWS);
        const verifiedProb = channel === 'amazon' ? 0.9 : 0.7;
        reviews.push({
          skuCode: sku.skuCode,
          asin: sku.asin,
          rating: template.rating,
          title: template.title,
          content: template.content,
          reviewerName: pickOne(rng, REVIEWER_NAMES),
          reviewDate,
          isVerified: rng() < verifiedProb,
          sourceType: channel === 'amazon' ? 'AMAZON' : 'SHOPIFY',
        });
      }
    }
  }

  return reviews;
}
