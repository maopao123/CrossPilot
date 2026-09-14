/**
 * xydc-market-overview-truthfulness.test.cjs
 * Batch A 验收测试：验证 XYDC 市场概览数据真实性
 * 1. undefined/缺失输入 -> 返回 null (绝不伪造 48500, 30.5, 4.42, 1120 等)
 * 2. 显式 null 输入 -> 返回 null
 * 3. 合法 0 输入 -> 严格保留 0 (不被 || 覆盖为假常数)
 * 4. 主字段为 0、别名字段为非零 -> 优先使用主字段 0 (不被别名非零覆盖)
 * 5. 证据摘要 -> 缺失显示未提供，不把缺失转为 0，真实 0 正常显示
 * 6. 正常非零输入 -> 正常映射
 */

const assert = require('assert');
const { XydcMapper } = require('../dist/provider-framework/providers/xydc/xydc.mapper.js');

console.log('[TEST] Running XYDC Market Overview Truthfulness Acceptance Tests...');

// 1. 测试用例 1：全缺失输入（仅有 keyword）
console.log('--- Case 1: All metrics missing (keyword only) ---');
const missingRaw = {
  keyword: 'ergonomic mouse',
};
const overviewMissing = XydcMapper.toMarketOverview(missingRaw, 'AMAZON_US', 'LIVE');

assert.strictEqual(overviewMissing.seedKeyword, 'ergonomic mouse');
assert.strictEqual(overviewMissing.searchVolumeMonthly, null, 'Missing search volume must be null, not 48500');
assert.strictEqual(overviewMissing.avgPrice, null, 'Missing avg price must be null, not 30.5');
assert.strictEqual(overviewMissing.avgRating, null, 'Missing avg rating must be null, not 4.42');
assert.strictEqual(overviewMissing.avgReviewCount, null, 'Missing review count must be null, not 1120');
assert.strictEqual(overviewMissing.competitorCount, null, 'Missing competitor count must be null, not 12');
assert.strictEqual(overviewMissing.opportunityScore, null, 'Missing opportunity score must be null, not 8.8');
assert.strictEqual(overviewMissing.competitionScore, null, 'Missing competition score must be null, not 6.5');
assert.strictEqual(overviewMissing.category, null, 'Missing category must be null, not Home & Kitchen > Bath');

// 证据摘要检查：缺失不得描述为 0
const evidenceContentMissing = overviewMissing.evidence[0].content;
assert.ok(!evidenceContentMissing.includes('月均搜索量 0'), 'Missing search volume in evidence must not be reported as 0');
assert.ok(!evidenceContentMissing.includes('平均售价 $0'), 'Missing avg price in evidence must not be reported as $0');
assert.ok(!evidenceContentMissing.includes('平均评分 0'), 'Missing avg rating in evidence must not be reported as 0');
assert.ok(evidenceContentMissing.includes('未提供') || evidenceContentMissing.includes('未知'), 'Missing metrics should state 未提供/未知');

// 2. 测试用例 2：显式 0 输入（合法零值）
console.log('--- Case 2: Explicit zero inputs (legal zeros) ---');
const zeroRaw = {
  keyword: 'zero metric item',
  monthly_search_volume: 0,
  average_price: 0,
  average_rating: 0,
  average_reviews: 0,
  active_competitors_count: 0,
  opportunity_index: 0,
  competition_intensity: 0,
  category: 'Electronics',
};
const overviewZero = XydcMapper.toMarketOverview(zeroRaw, 'AMAZON_US', 'LIVE');

assert.strictEqual(overviewZero.searchVolumeMonthly, 0, 'Legal zero search volume must be preserved as 0, not replaced by 48500');
assert.strictEqual(overviewZero.avgPrice, 0, 'Legal zero price must be preserved as 0, not replaced by 30.5');
assert.strictEqual(overviewZero.avgRating, 0, 'Legal zero rating must be preserved as 0, not replaced by 4.42');
assert.strictEqual(overviewZero.avgReviewCount, 0, 'Legal zero reviews must be preserved as 0, not replaced by 1120');
assert.strictEqual(overviewZero.competitorCount, 0, 'Legal zero competitor count must be preserved as 0, not replaced by 12');
assert.strictEqual(overviewZero.opportunityScore, 0, 'Legal zero opportunity score must be preserved as 0, not replaced by 8.8');
assert.strictEqual(overviewZero.competitionScore, 0, 'Legal zero competition score must be preserved as 0, not replaced by 6.5');
assert.strictEqual(overviewZero.category, 'Electronics');

// 证据摘要检查：真实 0 应如实显示 0
const evidenceContentZero = overviewZero.evidence[0].content;
assert.ok(evidenceContentZero.includes('月均搜索量 0'), 'Legal zero search volume must be reported as 0 in evidence');
assert.ok(evidenceContentZero.includes('平均售价 $0'), 'Legal zero price must be reported as $0 in evidence');
assert.ok(evidenceContentZero.includes('平均评分 0'), 'Legal zero rating must be reported as 0 in evidence');

// 3. 测试用例 3：主字段为 0，别名字段为非零（字段优先级与逻辑或陷阱防护）
console.log('--- Case 3: Primary field is 0, alias field is non-zero ---');
const aliasConflictRaw = {
  keyword: 'alias test item',
  monthly_search_volume: 0,
  search_volume: 50000, // 别名不应覆盖主字段 0
  average_price: 0,
  avg_price: 99.9,      // 别名不应覆盖主字段 0
  average_rating: 0,
  avg_rating: 4.8,      // 别名不应覆盖主字段 0
  average_reviews: 0,
  avg_reviews: 300,     // 别名不应覆盖主字段 0
  active_competitors_count: 0,
  competitors_count: 20, // 别名不应覆盖主字段 0
};
const overviewAlias = XydcMapper.toMarketOverview(aliasConflictRaw, 'AMAZON_US', 'LIVE');

assert.strictEqual(overviewAlias.searchVolumeMonthly, 0, 'Primary field 0 must take precedence over non-zero alias');
assert.strictEqual(overviewAlias.avgPrice, 0, 'Primary field 0 must take precedence over non-zero alias');
assert.strictEqual(overviewAlias.avgRating, 0, 'Primary field 0 must take precedence over non-zero alias');
assert.strictEqual(overviewAlias.avgReviewCount, 0, 'Primary field 0 must take precedence over non-zero alias');
assert.strictEqual(overviewAlias.competitorCount, 0, 'Primary field 0 must take precedence over non-zero alias');

// 4. 测试用例 4：主字段未提供，别名字段为合法值（包含别名为 0）
console.log('--- Case 4: Primary undefined, alias provided ---');
const aliasFallbackRaw = {
  keyword: 'fallback test',
  search_volume: 0,    // 别名为 0
  avg_price: 19.99,    // 别名为非零
  avg_rating: 0,       // 别名为 0
  avg_reviews: 150,    // 别名为非零
  competitors_count: 5,
};
const overviewFallback = XydcMapper.toMarketOverview(aliasFallbackRaw, 'AMAZON_US', 'LIVE');

assert.strictEqual(overviewFallback.searchVolumeMonthly, 0, 'Alias 0 must be used when primary is undefined');
assert.strictEqual(overviewFallback.avgPrice, 19.99, 'Alias value must be used when primary is undefined');
assert.strictEqual(overviewFallback.avgRating, 0, 'Alias 0 must be used when primary is undefined');
assert.strictEqual(overviewFallback.avgReviewCount, 150, 'Alias value must be used when primary is undefined');
assert.strictEqual(overviewFallback.competitorCount, 5, 'Alias value must be used when primary is undefined');

// 5. 测试用例 5：正常非零值完整映射
console.log('--- Case 5: Normal non-zero values ---');
const normalRaw = {
  keyword: 'ergonomic chair',
  category: 'Office Products',
  monthly_search_volume: 125000,
  average_price: 175.5,
  average_rating: 4.6,
  average_reviews: 3500,
  active_competitors_count: 25,
  opportunity_index: 7.9,
  competition_intensity: 5.8,
};
const overviewNormal = XydcMapper.toMarketOverview(normalRaw, 'AMAZON_US', 'LIVE');

assert.strictEqual(overviewNormal.seedKeyword, 'ergonomic chair');
assert.strictEqual(overviewNormal.category, 'Office Products');
assert.strictEqual(overviewNormal.searchVolumeMonthly, 125000);
assert.strictEqual(overviewNormal.avgPrice, 175.5);
assert.strictEqual(overviewNormal.avgRating, 4.6);
assert.strictEqual(overviewNormal.avgReviewCount, 3500);
assert.strictEqual(overviewNormal.competitorCount, 25);
assert.strictEqual(overviewNormal.opportunityScore, 7.9);
assert.strictEqual(overviewNormal.competitionScore, 5.8);

// 6. 测试用例 6 (BA-R2)：trending_keywords 缺失 volume/growth 时必须为 null，绝不伪造 0 或 '+0%'
console.log('--- Case 6 (BA-R2): Trending keyword volume/growth missing must be null ---');
const trendMissingRaw = {
  keyword: 'trend test',
  trending_keywords: [{ keyword: 'test kw' }],
};
const overviewTrendMissing = XydcMapper.toMarketOverview(trendMissingRaw, 'AMAZON_US', 'LIVE');
assert.strictEqual(overviewTrendMissing.trendingKeywords[0].volume, null, 'Missing trending volume must be null, not 0');
assert.strictEqual(overviewTrendMissing.trendingKeywords[0].growth, null, 'Missing trending growth must be null, not +0%');

console.log('[PASS] All XYDC Market Overview Truthfulness Acceptance Tests PASSED!');
