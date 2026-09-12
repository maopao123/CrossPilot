const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const webSrc = path.resolve(__dirname, '..', 'src');

function read(rel) {
  return fs.readFileSync(path.join(webSrc, rel), 'utf8');
}

function walkPages(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, acc);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

test('V91-002: Daily Diagnosis REST/SSE paths use /api/v1/operations/daily-diagnosis', () => {
  const src = read('lib/daily-diagnosis.api.ts');
  assert.match(
    src,
    /\/api\/v1\/operations\/daily-diagnosis/,
    'browser client must call the Nest global prefix path',
  );
  assert.doesNotMatch(
    src,
    /request<[^>]*>\(\s*'\/operations\/daily-diagnosis/,
    'must not call /operations/daily-diagnosis without /api/v1',
  );
});

test('V91-003: SSE uses Authorization header fetch, not query-token EventSource', () => {
  const src = read('lib/daily-diagnosis.api.ts');
  assert.match(src, /headers\['Authorization'\]/);
  assert.match(src, /Bearer \$\{token\}/);
  assert.match(src, /\bfetch\s*\(/);
  assert.doesNotMatch(src, /new EventSource\s*\(/);
  assert.doesNotMatch(src, /urlParams\.set\(\s*['"]token['"]/);
  assert.doesNotMatch(src, /[?&]token=/);
});

test('V91-021: SSE client aborts on error and terminal workflow events', () => {
  const src = read('lib/daily-diagnosis.api.ts');
  assert.match(src, /AbortController/);
  assert.match(src, /abort\(\)/);
  assert.match(src, /workflow\.completed/);
  assert.match(src, /workflow\.failed/);
});

test('V91-007: Reviews returns use /skus/:skuId/returns, not /profit/returns/:sku', () => {
  const src = read('app/app/reviews/page.tsx');
  assert.match(src, /\/api\/v1\/skus\/\$\{/);
  assert.match(src, /\/returns/);
  assert.doesNotMatch(src, /\/api\/v1\/profit\/returns\//);
});

test('V91-005: production pages do not hardcode seed fixture IDs', () => {
  const pagesDir = path.join(webSrc, 'app');
  const files = walkPages(pagesDir);
  const forbidden = [
    'sku_white_001',
    'sku_green_002',
    'sku_black_002',
    'sku_green_003',
    'mkt_us_001',
    'ord_item_demo_01',
  ];
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) {
        hits.push(`${path.relative(webSrc, file)} contains ${token}`);
      }
    }
  }
  assert.equal(hits.join('\n'), '', hits.join('\n'));
});

test('V91-006: production pages do not ship fake financial fallbacks', () => {
  const files = walkPages(path.join(webSrc, 'app'));
  const forbidden = ['28,490.50', '28490.50', '|| 450', '|| 0.032', '|| \'89.97\'', 'advertising: -980'];
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) {
        hits.push(`${path.relative(webSrc, file)} contains ${token}`);
      }
    }
  }
  assert.equal(hits.join('\n'), '', hits.join('\n'));
});
