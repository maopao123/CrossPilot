const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/app/app/operations/automation/page.tsx');

function getHandler() {
  const page = fs.readFileSync(pagePath, 'utf8');
  const handler = page.slice(
    page.indexOf('  const handleApprove = async () => {'),
    page.indexOf('  const handleReject ='),
  );
  if (!handler.includes('const handleApprove')) {
    throw new Error('actual page handler not found');
  }
  return handler;
}

test('G1-R05: UI approval HTTP 404 does not set approvalStatus to APPROVED', async () => {
  const handler = getHandler();
  let approval = 'PENDING';
  let logs = [];

  const sandbox = {
    ApiClient: {
      isViewer: () => false,
      post: async () => {
        throw new Error('404 approval not found');
      },
    },
    activeWorkflow: { approvalId: 'test_appr_404' },
    skuCode: 'MTH-GREEN-001',
    setIsRunning: () => {},
    setApprovalStatus: (v) => { approval = v; },
    setActiveWorkflow: () => {},
    setRpaLogs: (fn) => { logs = fn(logs); },
  };

  const js = ts.transpileModule(handler + '\nthis.runHandler = handleApprove;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;

  vm.runInNewContext(js, sandbox);
  await sandbox.runHandler();

  assert.notEqual(approval, 'APPROVED');
  assert.equal(approval, 'PENDING');
  assert.ok(logs.some((l) => l.includes('Approval failed')));
});

test('G1-R05: UI approval receiving FAILED status does not claim Feed confirmation or upload', async () => {
  const handler = getHandler();
  let approval = 'PENDING';
  let logs = [];

  const sandbox = {
    ApiClient: {
      isViewer: () => false,
      post: async () => {
        return { status: 'FAILED', result: { error: 'RPA execution failed' } };
      },
    },
    activeWorkflow: { approvalId: 'test_appr_fail' },
    skuCode: 'MTH-GREEN-001',
    setIsRunning: () => {},
    setApprovalStatus: (v) => { approval = v; },
    setActiveWorkflow: () => {},
    setRpaLogs: (fn) => { logs = fn(logs); },
  };

  const js = ts.transpileModule(handler + '\nthis.runHandler = handleApprove;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;

  vm.runInNewContext(js, sandbox);
  await sandbox.runHandler();

  assert.notEqual(approval, 'APPROVED');
  assert.equal(approval, 'FAILED');
  assert.ok(!logs.some((s) => s.includes('Batch Feed confirmed') || s.includes('Completed Seller Central automated upload')));
  assert.ok(logs.some((s) => s.includes('RPA 执行失败')));
});

test('G1-R05: Fresh page initializes without fabricated approvalId and makes 0 approval posts', async () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  const states = [];
  const react = {
    useState: (v) => {
      const value = typeof v === 'function' ? v() : v;
      const i = states.push(value) - 1;
      return [value, (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
    },
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const pageSandbox = {
    exports: {},
    require: (id) => {
      if (id === 'react') return react;
      if (id === '@/lib/api-client') return { ApiClient: { isViewer: () => false } };
      if (id === '@/constants/ui-labels') return { getStatusLabel: (x) => x, RUNTIME_LABELS: {} };
      if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      throw new Error('unexpected page dependency: ' + id);
    },
  };
  const pageJs = ts.transpileModule(page, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(pageJs, pageSandbox);
  pageSandbox.exports.default();

  const initialRun = states.find((v) => v && typeof v === 'object' && 'approvalId' in v);
  assert.equal(initialRun, undefined);

  const handler = getHandler();
  let approvalPosts = 0;
  const approveSandbox = {
    ApiClient: { isViewer: () => false, post: async () => { approvalPosts++; throw new Error('404'); } },
    activeWorkflow: initialRun,
    skuCode: 'sku-1',
    setIsRunning: () => {},
    setApprovalStatus: () => {},
    setActiveWorkflow: () => {},
    setRpaLogs: () => {},
  };
  const js = ts.transpileModule(handler + '\nthis.invoke = handleApprove;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, approveSandbox);
  await approveSandbox.invoke();

  assert.equal(approvalPosts, 0);
});
