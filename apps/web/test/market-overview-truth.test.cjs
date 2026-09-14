const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/app/app/market-research/page.tsx');

test('Batch A: Market Research page does not contain fake default fallback constants for snapshot metrics', () => {
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  // Verify that fake fallbacks are eliminated from market overview metric cards
  assert.ok(
    !pageContent.includes('snapshot?.searchVolumeMonthly || 48500'),
    'page.tsx must not contain fallback || 48500',
  );
  assert.ok(
    !pageContent.includes('snapshot?.opportunityScore || 8.8'),
    'page.tsx must not contain fallback || 8.8',
  );
  assert.ok(
    !pageContent.includes('snapshot?.competitionScore || 6.5'),
    'page.tsx must not contain fallback || 6.5',
  );

  // Verify that null-safe checks are used
  assert.ok(
    pageContent.includes('snapshot?.searchVolumeMonthly != null ? snapshot.searchVolumeMonthly.toLocaleString() : \'—\''),
    'page.tsx must format searchVolumeMonthly with null-safe check and dash placeholder',
  );
  assert.ok(
    pageContent.includes('snapshot?.opportunityScore != null ? `${snapshot.opportunityScore} / 10` : \'—\''),
    'page.tsx must format opportunityScore with null-safe check and dash placeholder',
  );
  assert.ok(
    pageContent.includes('snapshot?.competitionScore != null ? `${snapshot.competitionScore} / 10` : \'—\''),
    'page.tsx must format competitionScore with null-safe check and dash placeholder',
  );
});

test('Batch A: Formatter behavior on legal zero vs null vs normal values', () => {
  function formatSearchVolume(snapshot) {
    return snapshot?.searchVolumeMonthly != null ? snapshot.searchVolumeMonthly.toLocaleString() : '—';
  }
  function formatOpportunityScore(snapshot) {
    return snapshot?.opportunityScore != null ? `${snapshot.opportunityScore} / 10` : '—';
  }
  function formatCompetitionScore(snapshot) {
    return snapshot?.competitionScore != null ? `${snapshot.competitionScore} / 10` : '—';
  }

  // 1. Legal zero
  const zeroSnapshot = {
    searchVolumeMonthly: 0,
    opportunityScore: 0,
    competitionScore: 0,
  };
  assert.strictEqual(formatSearchVolume(zeroSnapshot), '0', 'Legal zero search volume must format as 0, not 48,500');
  assert.strictEqual(formatOpportunityScore(zeroSnapshot), '0 / 10', 'Legal zero opportunity score must format as 0 / 10, not 8.8 / 10');
  assert.strictEqual(formatCompetitionScore(zeroSnapshot), '0 / 10', 'Legal zero competition score must format as 0 / 10, not 6.5 / 10');

  // 2. Missing / Null
  const nullSnapshot = {
    searchVolumeMonthly: null,
    opportunityScore: null,
    competitionScore: null,
  };
  assert.strictEqual(formatSearchVolume(nullSnapshot), '—', 'Null search volume must format as —');
  assert.strictEqual(formatOpportunityScore(nullSnapshot), '—', 'Null opportunity score must format as —');
  assert.strictEqual(formatCompetitionScore(nullSnapshot), '—', 'Null competition score must format as —');

  // 3. Normal values
  const normalSnapshot = {
    searchVolumeMonthly: 125000,
    opportunityScore: 7.9,
    competitionScore: 5.8,
  };
  assert.strictEqual(formatSearchVolume(normalSnapshot), '125,000', 'Normal search volume formatted properly');
  assert.strictEqual(formatOpportunityScore(normalSnapshot), '7.9 / 10', 'Normal opportunity score formatted properly');
  assert.strictEqual(formatCompetitionScore(normalSnapshot), '5.8 / 10', 'Normal competition score formatted properly');
});

test('BA-R3: Market Research page does not unconditionally render unsubstantiated conclusion claims', () => {
  const pageContent = fs.readFileSync(pagePath, 'utf8');

  // Verify that the 4 fabricated conclusion claims are not hardcoded
  assert.ok(
    !pageContent.includes('+22.4% 同比增长'),
    'page.tsx must not contain hardcoded +22.4% 同比增长',
  );
  assert.ok(
    !pageContent.includes('壁垒中等，易切入'),
    'page.tsx must not contain hardcoded 壁垒中等，易切入',
  );
  assert.ok(
    !pageContent.includes('>高潜力细分市场<'),
    'page.tsx must not contain unconditional 高潜力细分市场',
  );
  assert.ok(
    !pageContent.includes('>头部垄断度较低<'),
    'page.tsx must not contain unconditional 头部垄断度较低',
  );
});
