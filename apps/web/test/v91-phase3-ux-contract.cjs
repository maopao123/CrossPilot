const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const webSrc = path.resolve(__dirname, '..', 'src');
const storePath = path.join(webSrc, 'lib', 'business-context-store.cjs');
const {
  applyWorkspaceSwitch,
  applySkuSwitch,
  applyMarketplaceSwitch,
  readBusinessContext,
  BUSINESS_CONTEXT_KEYS,
} = require(storePath);

function read(rel) {
  return fs.readFileSync(path.join(webSrc, rel), 'utf8');
}

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    snapshot: () => ({ ...data }),
  };
}

test('V91-022: switching workspace A → B updates workspaceId, clears SKU, and keeps ApiClient header key', () => {
  const local = memoryStore({
    [BUSINESS_CONTEXT_KEYS.workspaceId]: 'ws-a',
    [BUSINESS_CONTEXT_KEYS.role]: 'OWNER',
    [BUSINESS_CONTEXT_KEYS.skuId]: 'sku-a-1',
    [BUSINESS_CONTEXT_KEYS.marketplaceId]: 'AMAZON_US',
  });
  const session = memoryStore({
    crosspilot_active_op_task: 'task-from-a',
  });

  applyWorkspaceSwitch(local, session, {
    workspaceId: 'ws-b',
    role: 'OPERATOR',
    marketplaceId: 'AMAZON_UK',
  });

  const next = readBusinessContext(local);
  assert.equal(next.workspaceId, 'ws-b');
  assert.equal(next.role, 'OPERATOR');
  assert.equal(next.marketplaceId, 'AMAZON_UK');
  assert.equal(next.skuId, null);
  assert.equal(session.getItem('crosspilot_active_op_task'), null);

  const api = read('lib/api-client.ts');
  assert.match(api, /crosspilot_workspace_id/);
  assert.match(api, /x-workspace-id/);
  assert.equal(BUSINESS_CONTEXT_KEYS.workspaceId, 'crosspilot_workspace_id');
});

test('V91-022: same SKU code in another workspace cannot keep the previous skuId', () => {
  const local = memoryStore({
    [BUSINESS_CONTEXT_KEYS.workspaceId]: 'ws-a',
    [BUSINESS_CONTEXT_KEYS.skuId]: 'sku-white-in-a',
  });
  const session = memoryStore();
  applyWorkspaceSwitch(local, session, { workspaceId: 'ws-b', role: 'OWNER' });
  assert.equal(readBusinessContext(local).skuId, null);
  applySkuSwitch(local, 'sku-white-in-b');
  assert.equal(readBusinessContext(local).skuId, 'sku-white-in-b');
});

test('V91-022: marketplace switch clears SKU selection', () => {
  const local = memoryStore({
    [BUSINESS_CONTEXT_KEYS.skuId]: 'sku-1',
    [BUSINESS_CONTEXT_KEYS.marketplaceId]: 'AMAZON_US',
  });
  applyMarketplaceSwitch(local, 'AMAZON_UK');
  const next = readBusinessContext(local);
  assert.equal(next.marketplaceId, 'AMAZON_UK');
  assert.equal(next.skuId, null);
});

test('V91-022: TopBar Workspace/SKU selectors are API-driven and do not hardcode demo SKU ids', () => {
  const topBar = read('components/top-bar.tsx');
  const provider = read('components/business-context-provider.tsx');
  const combined = `${topBar}\n${provider}`;
  assert.match(combined, /\/api\/v1\/workspaces/);
  assert.match(combined, /loadCatalogSkus|\/api\/v1\/products/);
  assert.match(topBar, /switchWorkspace|onChange=\{[^}]*switchWorkspace/);
  assert.doesNotMatch(topBar, /MTH-WHITE-001/);
  assert.doesNotMatch(topBar, /sku_white_001/);
  assert.doesNotMatch(topBar, /天然大理石牙刷架/);
});

test('V91-022: SKU 360 index prefers context sku.id from GET /products', () => {
  const catalog = read('lib/catalog.ts');
  const skuIndex = read('app/app/skus/page.tsx');
  const skuDetail = read('app/app/skus/[skuId]/page.tsx');
  assert.match(catalog, /\/api\/v1\/products/);
  assert.match(catalog, /id: sku\.id/);
  assert.doesNotMatch(catalog, /sku_white_001/);
  assert.match(skuIndex, /skuId/);
  assert.match(skuDetail, /\/api\/v1\/skus\/\$\{skuId\}\/overview/);
});

test('V91-022: Listing SKU switcher is catalog-driven, not hardcoded demo codes', () => {
  const listings = read('app/app/listings/page.tsx');
  assert.doesNotMatch(
    listings,
    /\['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'\]/,
  );
  assert.match(listings, /useBusinessContext|skus\.map/);
});

test('V91-023: Approve/Reject/Dismiss disable while in-flight', () => {
  const page = read('app/app/operations/today/page.tsx');
  const list = read('app/app/operations/today/components/action-list.tsx');
  const drawer = read(
    'app/app/operations/today/components/action-detail-drawer.tsx',
  );
  const combined = `${page}\n${list}\n${drawer}`;
  assert.match(combined, /inFlight|inflightActionId|busyActionId/);
  assert.match(list, /disabled=\{[^}]*inFlight|disabled=\{[^}]*busy/);
  assert.match(drawer, /disabled=\{[^}]*inFlight|disabled=\{[^}]*busy/);
});

test('V91-023: OCC conflict copy tells the user to refresh latest state', () => {
  const modal = read(
    'app/app/operations/today/components/occ-conflict-modal.tsx',
  );
  const page = read('app/app/operations/today/page.tsx');
  assert.match(modal, /当前任务已被其他操作更新/);
  assert.match(modal, /请刷新最新状态后重新操作/);
  assert.match(modal, /Refresh Latest State|立即刷新最新状态/);
  assert.match(page, /INVALID_ACTION_STATE/);
  assert.match(page, /refreshTask/);
  assert.doesNotMatch(page, /必须手动 Resume 才结束/);
});

test('V91-023: Approval UI keeps Approval ≠ Execute semantics', () => {
  const modal = read(
    'app/app/operations/today/components/approval-confirmation-modal.tsx',
  );
  assert.match(modal, /Approval ≠ Execute|审批不等于真实执行/);
  assert.doesNotMatch(modal, /已下采购单|已修改广告|已发布 Listing|已调整价格/);
});

test('V91-025: primary dialogs expose role, aria-modal, Escape, and labelledby', () => {
  const dialog = read('components/accessible-dialog.tsx');
  const approval = read(
    'app/app/operations/today/components/approval-confirmation-modal.tsx',
  );
  const occ = read(
    'app/app/operations/today/components/occ-conflict-modal.tsx',
  );
  const drawer = read(
    'app/app/operations/today/components/action-detail-drawer.tsx',
  );
  const css = read('app/globals.css');
  const combined = `${dialog}\n${approval}\n${occ}\n${drawer}`;
  assert.match(combined, /role=["']dialog["']/);
  assert.match(combined, /aria-modal/);
  assert.match(combined, /aria-labelledby/);
  assert.match(dialog, /Escape/);
  assert.match(css, /:focus-visible/);
});

test('V91-026: Overview does not present hardcoded -$2,280 as live data', () => {
  const overview = read('app/app/overview/page.tsx');
  assert.doesNotMatch(overview, /-\$2,280\.00/);
  assert.doesNotMatch(overview, /-\$2,280/);
  assert.match(overview, /\/api\/v1\/analyst\/waterfall|Demo Scenario/);
});

test('V91-027: dead Copilot entry is disabled Coming Later; Architecture is not a KB console', () => {
  const sidebar = read('components/sidebar.tsx');
  const architecture = read('app/app/architecture/page.tsx');
  assert.match(sidebar, /Coming Later/);
  assert.doesNotMatch(sidebar, /Mastra Agent/);
  assert.doesNotMatch(sidebar, /Architecture & Defense/);
  assert.doesNotMatch(architecture, /14 大经营子页面/);
  assert.doesNotMatch(architecture, /Knowledge Base 管理台/);
});
