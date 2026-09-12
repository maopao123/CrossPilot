import { OpportunityScoreConfig } from '@crosspilot/shared';

export const DEFAULT_OPPORTUNITY_SCORE_CONFIG: OpportunityScoreConfig = {
  scoreConfigVersion: 'v1.0.0',
  weights: {
    demand: 0.25,
    competition: 0.20,
    commercial: 0.15,
    trend: 0.15,
    reviewHealth: 0.10,
    voc: 0.15,
  },
  gate: {
    sufficientMinSignals: 4,
    degradedMinSignals: 3,
    criticalSignals: ['demand', 'competition'],
  },
  demand: {
    volumeBrackets: [
      { min: 50000, max: null, baseScore: 90, maxScore: 100 },
      { min: 20000, max: 50000, baseScore: 80, maxScore: 90 },
      { min: 5000, max: 20000, baseScore: 65, maxScore: 80 },
      { min: 1000, max: 5000, baseScore: 45, maxScore: 65 },
      { min: 0, max: 1000, baseScore: 10, maxScore: 45 },
    ],
    abaRankTiers: [
      { maxRank: 5000, bonus: 8, description: 'ABA 头部高频词流' },
      { maxRank: 25000, bonus: 4, description: 'ABA 稳定曝光词流' },
    ],
    abaRankPenalty: {
      minRank: 100000,
      penalty: 8,
      description: 'ABA 排名偏后曝光不足',
    },
  },
  competition: {
    reviewBrackets: [
      { min: 0, max: 150, difficulty: 20, description: '评价壁垒低，推新友好' },
      { min: 150, max: 500, difficulty: 35, description: '壁垒适中，新品具备突破空间' },
      { min: 500, max: 1500, difficulty: 55, description: '需一定评价积累' },
      { min: 1500, max: 4000, difficulty: 75, description: '头部护城河较深' },
      { min: 4000, max: Number.MAX_SAFE_INTEGER, difficulty: 90, description: '成熟高壁垒红海' },
    ],
    cpcTiers: {
      highThreshold: 2.5,
      highPenalty: 10,
      lowThreshold: 1.0,
      lowBonus: 10,
    },
  },
  commercial: {
    priceBands: [
      { min: 0, max: 15, baseScore: 45, description: '低客单价区间，毛利与运费挤压' },
      { min: 15, max: 20, baseScore: 65, description: '大众入门区间，竞争相对激烈' },
      { min: 20, max: 25, baseScore: 80, description: '价格带良好，具一定运营空间' },
      { min: 25, max: 45, baseScore: 90, description: '跨境黄金客单价区间，留足毛利与预算' },
      { min: 45, max: 80, baseScore: 80, description: '偏中高客单价，转化周期较长' },
      { min: 80, max: Number.MAX_SAFE_INTEGER, baseScore: 65, description: '高客单价细分，需审视售后与退货成本' },
    ],
    stablePriceSpreadRatio: 0.6,
    stablePriceBonus: 5,
  },
  trend: {
    bsrImprovedBonus: 25,
    bsrDeclinedPenalty: 20,
    bsrStableBonus: 5,
  },
  reviewHealth: {
    ratingBands: [
      { min: 0, max: 3.8, baseScore: 50, status: 'WEAK', description: '主流星级偏低，存在设计短板或材质易损' },
      { min: 3.8, max: 4.3, baseScore: 88, status: 'MODERATE', description: '有需求有痛点，新品改良空间大' },
      { min: 4.3, max: 4.6, baseScore: 75, status: 'STRONG', description: '整体口碑良好，需在特定功能点突破' },
      { min: 4.6, max: 5.0, baseScore: 60, status: 'STRONG', description: '竞品成熟度极高，颠覆阻力较大' },
    ],
  },
  voc: {
    topPainPointHighThreshold: 25.0,
    topPainPointHighBonus: 25,
    topPainPointMediumThreshold: 15.0,
    topPainPointMediumBonus: 15,
    desiredFeatureMultiplier: 6,
    maxDesiredFeatureBonus: 15,
    searchSnippetConfidenceCap: 0.70,
    smallSampleThreshold: 15,
    smallSampleConfidencePenalty: 0.15,
  },
};
