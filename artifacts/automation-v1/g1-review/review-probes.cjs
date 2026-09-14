// Independent G1 review probes. Uses current built production modules, no network or database.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const { ActionRouter } = require(path.join(root, 'packages/actions/dist/action.router.js'));
const { RpaRegistry, YingdaoRpaAdapter } = require(path.join(root, 'packages/integrations/dist/rpa/index.js'));
const ts = require(path.join(root, 'node_modules/typescript'));
const originalFetch = global.fetch;
const originalKey = process.env.YINGDAO_API_KEY;
delete process.env.YINGDAO_API_KEY;
const rows = [];
const proposal = {
  id: 'review-action', type: 'RPA', name: 'review', description: 'review probe',
  requiresHumanApproval: true, targetEntity: 'SKU', targetId: 'review-sku',
  payload: { quantity: 1 }, riskLevel: 'HIGH', status: 'PENDING',
  createdAt: '2026-09-14T00:00:00Z',
};
const context = { workspaceId: 'review-workspace', isApproved: true, executionMode: 'LIVE' };
function note(id, actual, conforms) { rows.push({ id, actual, result: conforms ? 'PASS' : 'FAIL' }); }
function registryWith(adapter) { const r = new RpaRegistry(); r.register(adapter); return r; }
async function main() {
  for (const body of [{ jobId: 'accepted-job', status: 'RUNNING' }, {}]) {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => body });
    const registry = registryWith(new YingdaoRpaAdapter({ apiKey: 'review-placeholder-not-a-secret', apiBaseUrl: 'https://review.invalid' }));
    const result = await new ActionRouter(registry).dispatch(proposal, { ...context, providerId: 'yingdao-rpa' });
    note('R01-accepted-' + (body.jobId ? 'running' : 'empty'), {
      responseBody: body, status: result.status, evidence: result.executionEvidence,
    }, result.status !== 'SUCCEEDED' && result.executionEvidence?.effect !== 'APPLIED');
  }
  for (const mode of ['MOCK', 'SIMULATOR']) {
    let calls = 0;
    const adapter = { id: 'yingdao-rpa', name: 'instrumented live provider', execute: async () => {
      calls++; return { jobId: 'live-job', status: 'SUCCESS', durationMs: 1 };
    }};
    const result = await new ActionRouter(registryWith(adapter)).dispatch(proposal, {
      ...context, executionMode: mode, ...(mode === 'MOCK' ? { providerId: 'yingdao-rpa' } : {}),
    });
    note('R02-mode-' + mode, { liveAdapterCalls: calls, evidence: result.executionEvidence }, calls === 0);
  }
  let sideEffects = 0;
  const throwing = { id: 'throw-after-submit', name: 'submit then throw', execute: async () => {
    sideEffects++; throw new Error('response lost after remote commit');
  }};
  const thrown = await new ActionRouter(registryWith(throwing)).dispatch(proposal, { ...context, providerId: throwing.id });
  note('R03-throw-after-submit', { sideEffects, evidence: thrown.executionEvidence }, thrown.executionEvidence?.effect === 'UNKNOWN');
  global.fetch = async () => { throw new Error('socket closed after request was sent'); };
  const yingdao = new YingdaoRpaAdapter({ apiKey: 'review-placeholder-not-a-secret', apiBaseUrl: 'https://review.invalid' });
  const network = await new ActionRouter(registryWith(yingdao)).dispatch(proposal, { ...context, providerId: yingdao.id });
  note('R03-fetch-uncertainty', { status: network.status, evidence: network.executionEvidence }, network.executionEvidence?.effect === 'UNKNOWN');
  let changingCalls = 0;
  const changing = { id: 'changing-provider', name: 'auth required then authorized', execute: async () => {
    changingCalls++; return { jobId: 'job-progress', status: changingCalls === 1 ? 'FAILED' : 'SUCCESS',
      ...(changingCalls === 1 ? { error: 'AUTH_REQUIRED: credential missing before dispatch' } : {}), durationMs: 1 };
  }};
  const progressing = new ActionRouter(registryWith(changing));
  const progressingContext = { ...context, providerId: changing.id, operationId: 'progress-key' };
  await progressing.dispatch(proposal, progressingContext);
  const frozen = await progressing.dispatch(proposal, progressingContext);
  note('R04-auth-required-cache', { calls: changingCalls, status: frozen.status, evidence: frozen.executionEvidence }, changingCalls > 1);
  const replay = new ActionRouter();
  const replayContext = { ...context, executionMode: 'MOCK', providerId: 'mock-rpa', operationId: 'same-key' };
  await replay.dispatch(proposal, replayContext);
  const mismatched = await replay.dispatch({ ...proposal, id: 'different-action', payload: { quantity: 999 } }, {
    ...replayContext, executionMode: 'LIVE', providerId: 'yingdao-rpa', isApproved: false,
  });
  note('R04-mode-payload-approval-cache', { status: mismatched.status, actionId: mismatched.actionId, evidence: mismatched.executionEvidence }, mismatched.status !== 'SUCCEEDED');

  // Execute the actual page handler text in a controlled VM, without React/browser/network.
  const page = fs.readFileSync(path.join(root, 'apps/web/src/app/app/operations/automation/page.tsx'), 'utf8');
  const handler = page.slice(page.indexOf('  const handleApprove = async () => {'), page.indexOf('  const handleReject ='));
  if (!handler.includes('const handleApprove')) throw new Error('actual page handler not found');
  for (const scenario of ['http-404', 'body-failed']) {
    let approval = 'PENDING';
    let logs = [];
    const sandbox = {
      ApiClient: { isViewer: () => false, post: async () => {
        if (scenario === 'http-404') throw new Error('404 approval not found');
        return { status: 'FAILED', result: { error: 'adapter failed' } };
      } },
      activeWorkflow: { approvalId: 'nonexistent' }, skuCode: 'review-sku',
      setIsRunning: () => {}, setApprovalStatus: (v) => { approval = v; },
      setActiveWorkflow: () => {}, setRpaLogs: (fn) => { logs = fn(logs); },
    };
    const js = ts.transpileModule(handler + '\nthis.runHandler = handleApprove;', {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(js, sandbox);
    await sandbox.runHandler();
    note('R05-ui-' + scenario, { approval, logs }, scenario === 'http-404'
      ? approval !== 'APPROVED'
      : !logs.some((s) => s.includes('Batch Feed confirmed') || s.includes('Completed Seller Central')));
  }
  const output = { kind: 'independent-adversarial-review', networkCalls: 0, databaseCalls: 0,
    pass: rows.filter((r) => r.result === 'PASS').length,
    fail: rows.filter((r) => r.result === 'FAIL').length, rows };
  fs.writeFileSync(path.join(__dirname, 'probe-results.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.fail ? 1 : 0;
}
main().catch((err) => { console.error(err); process.exitCode = 2; }).finally(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.YINGDAO_API_KEY;
  else process.env.YINGDAO_API_KEY = originalKey;
});
