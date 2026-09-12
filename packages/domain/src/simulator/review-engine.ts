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
    title: '美观厚重，从来不会倒',
    content:
      '天然大理石底座质感很好，分量足，放上去从来不会移动。1.5 英寸孔位刚好放下我的 Oral-B 手柄。',
  },
  {
    rating: 5,
    title: '物有所值',
    content:
      '整个洗手台档次都提升了。抛光石材看起来很高级，防滑垫让它稳稳固定。',
  },
  {
    rating: 4,
    title: '质量不错，比预期略小',
    content:
      '天然大理石很扎实，排水坡度设计合理。希望再大一点点，不过放得下我们所有的牙刷和牙膏。',
  },
  {
    rating: 4,
    title: '看起来很贵',
    content:
      '很优雅，容易清洁。有一个孔的边缘稍微有点粗糙，但摆在台面上看不出来。',
  },
  {
    rating: 3,
    title: '还可以，但颜色有差异',
    content:
      '天然石材，纹路和照片有差异。质量没问题，只是对实际花纹要有心理预期。',
  },
];

const NEGATIVE_REVIEWS: { rating: number; title: string; content: string }[] = [
  {
    rating: 1,
    title: '孔太小，放不下电动牙刷',
    content:
      '孔太小的问题是真实的——我的 Oral-B iO 手柄放不进去。宣传说兼容，但直径太窄。',
  },
  {
    rating: 1,
    title: '假大理石，到货就有崩边',
    content:
      '看起来像假大理石树脂，不是天然石材。我的到货时底座边缘就有崩边。退货了。',
  },
  {
    rating: 2,
    title: '孔太小，Sonicare 手柄放不稳',
    content:
      '我的 Philips Sonicare 手柄勉强塞得下，孔太小导致放不稳。这个价位不该如此。',
  },
  {
    rating: 2,
    title: '两周后开始崩边',
    content:
      '正常使用两周后孔沿开始崩边。也怀疑这不是真大理石——摸起来像假大理石涂层。',
  },
];

const REVIEWER_NAMES = [
  '艾玛',
  '利亚姆',
  '索菲亚',
  '诺亚',
  '艾娃',
  '梅森',
  '伊莎贝拉',
  '伊森',
  '米娅',
  '卢卡斯',
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
