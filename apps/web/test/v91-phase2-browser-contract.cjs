const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const webSrc = path.resolve(__dirname, '..', 'src');

function read(rel) {
  return fs.readFileSync(path.join(webSrc, rel), 'utf8');
}

test('V91-019: /app layout redirects unauthenticated users to /login', () => {
  const layout = read('app/app/layout.tsx');
  const gate = fs.existsSync(path.join(webSrc, 'components/auth-gate.tsx'))
    ? read('components/auth-gate.tsx')
    : layout;
  const combined = layout + '\n' + gate;
  assert.match(combined, /\/login/);
  assert.match(combined, /crosspilot_token/);
});

test('V91-019: API 401 clears session', () => {
  const src = read('lib/api-client.ts');
  assert.match(src, /status === 401/);
  assert.match(src, /clearSession\(/);
});

test('V91-019: TopBar does not fake OWNER or demo workspace on load failure', () => {
  const src = read('components/top-bar.tsx');
  assert.doesNotMatch(src, /workspace\?\.name \|\| 'CrossPilot 演示工作区'/);
  assert.doesNotMatch(src, /return role \|\| '所有者'/);
});

test('V91-010: Analyst SSE uses authenticated fetch, not EventSource or query token', () => {
  const page = read('app/app/business-analyst/page.tsx');
  const sseHelper = fs.existsSync(path.join(webSrc, 'lib/authenticated-sse.ts'))
    ? read('lib/authenticated-sse.ts')
    : '';
  const combined = page + '\n' + sseHelper;
  assert.doesNotMatch(page, /new EventSource\s*\(/);
  assert.doesNotMatch(combined, /urlParams\.set\(\s*['"]token['"]/);
  assert.doesNotMatch(combined, /[?&]token=/);
  assert.match(combined, /Authorization/);
  assert.match(combined, /x-workspace-id/);
  assert.match(combined, /AbortController/);
  assert.doesNotMatch(page, /演示流结束或连接已终止/);
});

test('V91-011: Tool Center catalog is driven by GET /tools and excludes deleted publish tool', () => {
  const src = read('app/app/tool-center/page.tsx');
  assert.match(src, /\/api\/v1\/tools/);
  assert.doesNotMatch(src, /operation\.listing\.publish/);
  assert.doesNotMatch(src, /const INITIAL_TOOLS/);
});

test('V91-012: Receive button only for SHIPPED or PARTIALLY_RECEIVED', () => {
  const src = read('app/app/suppliers/page.tsx');
  assert.match(src, /SHIPPED/);
  assert.match(src, /PARTIALLY_RECEIVED/);
  assert.doesNotMatch(
    src,
    /po\.status === 'RECEIVED' \?[\s\S]*: \(\s*<button[\s\S]*入库核收/,
  );
});

test('V91-018: Advertising apply-negative has an error state', () => {
  const src = read('app/app/advertising/page.tsx');
  assert.match(src, /applyError|setApplyError/);
  assert.match(src, /应用否定关键词失败|applyError/);
});

test('V91-024: Orders submit is disabled while in-flight', () => {
  const src = read('app/app/orders/page.tsx');
  assert.match(src, /submitting/);
  assert.match(src, /disabled=\{[^}]*submitting/);
});

test('V91-024: Listings surface generate/compliance/visual errors', () => {
  const src = read('app/app/listings/page.tsx');
  assert.match(src, /setActionError|actionError|generateError/);
  assert.doesNotMatch(
    src,
    /catch \(err\) \{\s*console\.error\('14 步 DAG/,
  );
});

test('V91-024: Products does not keep a dead 新建产品 CTA', () => {
  const src = read('app/app/products/page.tsx');
  const hasLiveHandler = /onClick=\{[^}]*createProduct|handleCreateProduct/.test(src);
  const deadEnabled =
    src.includes('新建产品') &&
    /<button className="flex items-center space-x-2 bg-blue-600/.test(src) &&
    !src.includes('disabled');
  assert.equal(deadEnabled && !hasLiveHandler, false, 'dead 新建产品 button must be removed or disabled');
});

test('V91-024: Automation reject does not pretend persist succeeded', () => {
  const src = read('app/app/operations/automation/page.tsx');
  assert.match(src, /setApprovalStatus\('REJECTED'\)|驳回/);
  assert.match(
    src,
    /不会落库|未持久化|no persist|没有驳回接口|Known Gap/i,
  );
});
