const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const webSrc = path.resolve(__dirname, '..', 'src');

function read(rel) {
  return fs.readFileSync(path.join(webSrc, rel), 'utf8');
}

test('V921: Operations Today cockpit uses the facade and copilot sections', () => {
  const page = read('app/app/operations/today/page.tsx');
  assert.match(page, /\/api\/v1\/operations\/today/);
  assert.match(page, /HealthStrip/);
  assert.match(page, /InsightStack/);
  assert.match(page, /RecommendationCenter/);
  assert.match(page, /VocPanel/);
  assert.match(page, /RecentDecisions/);
  assert.match(page, /recommendations\/\$\{id\}\/approve/);
  assert.doesNotMatch(page, /SkuRiskRankingTable/);
});

test('V921: insight cards require problem evidence impact recommendation', () => {
  const stack = read('app/app/operations/today/cockpit/insight-stack.tsx');
  assert.match(stack, /Problem/);
  assert.match(stack, /Evidence/);
  assert.match(stack, /Impact/);
  assert.match(stack, /Recommendation/);
});

test('V921: VIEWER cannot approve recommendations', () => {
  const rec = read('app/app/operations/today/cockpit/recommendation-center.tsx');
  assert.match(rec, /isViewer/);
  assert.match(rec, /canApprove/);
  assert.match(rec, /VIEWER can read/);
  const page = read('app/app/operations/today/page.tsx');
  assert.match(page, /if \(isViewer\) return/);
});

test('V921: confirm path does not call Amazon write', () => {
  const page = read('app/app/operations/today/page.tsx');
  assert.match(page, /\/recommendations\/\$\{id\}\/approve/);
  assert.doesNotMatch(page, /amazon\/write|commerce\/amazon\/sync|listing-publish/);
});

test('V93: recommendation card exposes planned action and mock execute only', () => {
  const rec = read('app/app/operations/today/cockpit/recommendation-center.tsx');
  const page = read('app/app/operations/today/page.tsx');
  assert.match(rec, /Generated action/);
  assert.match(rec, /Run mock executor/);
  assert.match(page, /\/api\/v1\/actions\/plan-acos/);
  assert.match(page, /\/api\/v1\/actions\/\$\{actionId\}\/execute/);
  assert.doesNotMatch(page, /AmazonAdsTool|sp-api|amazon\/write/);
});
