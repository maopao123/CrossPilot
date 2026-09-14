// Round 2: remaining acceptance criteria from the original G1-R01..R05 review.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const { ActionRouter } = require(path.join(root, 'packages/actions/dist/action.router.js'));
const { RpaRegistry, YingdaoRpaAdapter } = require(path.join(root, 'packages/integrations/dist/rpa/index.js'));
const ts = require(path.join(root, 'node_modules/typescript'));
const savedFetch = global.fetch;
const savedKey = process.env.YINGDAO_API_KEY;
delete process.env.YINGDAO_API_KEY;
const results = [];
const proposal = { id: 'g1r2-action', type: 'RPA', name: 'g1r2-workflow', description: 'review',
  requiresHumanApproval: true, targetEntity: 'SKU', targetId: 'sku-1', payload: { quantity: 2 },
  riskLevel: 'HIGH', status: 'PENDING', createdAt: '2026-09-14T00:00:00Z' };
const ctx = { workspaceId: 'review-ws', isApproved: true, executionMode: 'LIVE' };
function registry(adapter) { const r = new RpaRegistry(); r.register(adapter); return r; }
function record(id, actual, good) { results.push({ id, actual, result: good ? 'PASS' : 'FAIL' }); }
async function main() {
  const yd = new YingdaoRpaAdapter({ apiKey: 'review-placeholder-not-a-secret', apiBaseUrl: 'https://review.invalid' });
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'SUCCESS' }) });
  const bareSuccess = await new ActionRouter(registry(yd)).dispatch(proposal, { ...ctx, providerId: yd.id });
  record('R01-bare-success-without-evidence', bareSuccess, bareSuccess.executionEvidence?.effect !== 'APPLIED');

  let simCalls = 0;
  const sim = { id: 'real-simulator', name: 'valid simulator provider', supportedModes: ['SIMULATOR'],
    execute: async () => { simCalls++; return { jobId: 'sim-job', status: 'SUCCESS', durationMs: 1 }; } };
  const simResult = await new ActionRouter(registry(sim)).dispatch(proposal, {
    ...ctx, executionMode: 'SIMULATOR', providerId: sim.id,
  });
  record('R02-supported-simulator-preserves-mode', { calls: simCalls, evidence: simResult.executionEvidence },
    simCalls === 1 && simResult.executionEvidence?.mode === 'SIMULATOR');

  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ jobId: 'remote-job', status: 'CANCELLED' }) });
  const unknownStatus = await new ActionRouter(registry(yd)).dispatch(proposal, { ...ctx, providerId: yd.id });
  record('R03-unknown-remote-status-is-not-preflight', unknownStatus, unknownStatus.executionEvidence?.effect === 'UNKNOWN');
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ jobId: 'remote-job', status: 'RUNNING' }) });
  const running = await new ActionRouter(registry(yd)).dispatch(proposal, { ...ctx, providerId: yd.id });
  let queryFailure;
  try { await yd.getStatus('remote-job'); } catch (error) { queryFailure = error.message; }
  record('R03-query-capability-is-real', { evidence: running.executionEvidence, queryFailure },
    running.executionEvidence?.recovery !== 'QUERY' || !queryFailure);

  const serviceFile = path.join(root, 'apps/api/src/modules/operation-automation/operation-automation.service.ts');
  const service = fs.readFileSync(serviceFile, 'utf8');
  const method = service.slice(service.indexOf('  private async executePublishRpa('), service.indexOf('  listWorkflows('))
    .replace('private async executePublishRpa(', 'async function executePublishRpa(');
  if (!method.includes('async function executePublishRpa')) throw new Error('service source method not found');
  const serviceSandbox = {};
  vm.runInNewContext(ts.transpileModule(method + '\nthis.invoke = executePublishRpa;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, serviceSandbox);
  const upstream = { status: 'RUNNING', actionId: 'service-action', data: { jobId: 'pending-job' },
    executionEvidence: { mode: 'MOCK', provider: 'mock-rpa', operationId: 'pending-operation',
      phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'MANUAL', externalId: 'pending-job' } };
  const serviceRun = await serviceSandbox.invoke.call({ actionRouter: { dispatch: async () => upstream } },
    { id: 'wf-review', skuCode: 'sku-1', status: 'RUNNING', steps: [] }, 29.99, 'review-ws');
  record('R03-service-preserves-running-and-evidence', serviceRun,
    serviceRun.status === 'RUNNING' && JSON.stringify(serviceRun).includes('UNKNOWN'));

  for (const change of ['provider', 'target', 'runtime']) {
    const router = new ActionRouter();
    const c = { ...ctx, executionMode: 'MOCK', providerId: 'mock-rpa', operationId: 'cache-' + change };
    await router.dispatch(proposal, c);
    const nextP = { ...proposal, ...(change === 'target' ? { targetId: 'different-sku' } : {}),
      ...(change === 'runtime' ? { type: 'API' } : {}) };
    const nextC = { ...c, ...(change === 'provider' ? { providerId: 'provider-does-not-exist' } : {}) };
    const result = await router.dispatch(nextP, nextC);
    record('R04-cache-' + change, result, result.status !== 'SUCCEEDED');
  }

  // Render the actual page with stubbed React hooks; inspect initial state and invoke its actual approval handler.
  const page = fs.readFileSync(path.join(root, 'apps/web/src/app/app/operations/automation/page.tsx'), 'utf8');
  const states = [];
  const react = { useState: (v) => { const value = typeof v === 'function' ? v() : v;
    const i = states.push(value) - 1; return [value, (next) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
  }, createElement: (type, props, ...children) => ({ type, props, children }) };
  const pageSandbox = { exports: {}, require: (id) => {
    if (id === 'react') return react;
    if (id === '@/lib/api-client') return { ApiClient: { isViewer: () => false } };
    if (id === '@/constants/ui-labels') return { getStatusLabel: (x) => x, RUNTIME_LABELS: {} };
    if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    throw new Error('unexpected page dependency: ' + id);
  }};
  const pageJs = ts.transpileModule(page, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(pageJs, pageSandbox);
  pageSandbox.exports.default();
  const initialRun = states.find((v) => v && typeof v === 'object' && 'approvalId' in v);
  const handler = page.slice(page.indexOf('  const handleApprove = async () => {'), page.indexOf('  const handleReject ='));
  let approvalPosts = 0;
  const approveSandbox = { ApiClient: { isViewer: () => false, post: async () => { approvalPosts++; throw new Error('404'); } },
    activeWorkflow: initialRun, skuCode: 'sku-1', setIsRunning: () => {}, setApprovalStatus: () => {},
    setActiveWorkflow: () => {}, setRpaLogs: () => {} };
  vm.runInNewContext(ts.transpileModule(handler + '\nthis.invoke = handleApprove;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, approveSandbox);
  await approveSandbox.invoke();
  record('R05-fresh-page-no-fabricated-approval', { initialApprovalId: initialRun?.approvalId, approvalPosts }, approvalPosts === 0);

  const report = { scope: 'remaining criteria of original G1-R01..R05', networkCalls: 0, databaseCalls: 0,
    pass: results.filter((r) => r.result === 'PASS').length,
    fail: results.filter((r) => r.result === 'FAIL').length, results };
  fs.writeFileSync(path.join(__dirname, 'remaining-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.fail ? 1 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 2; }).finally(() => {
  global.fetch = savedFetch;
  if (savedKey === undefined) delete process.env.YINGDAO_API_KEY; else process.env.YINGDAO_API_KEY = savedKey;
});
