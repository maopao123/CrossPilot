const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { XydcMapper } = require(path.join(root, 'packages/integrations/dist/provider-framework/providers/xydc/xydc.mapper.js'));
const results = [];
function record(id, actual, pass) { results.push({ id, actual, pass }); }
async function main() {
  const file = path.join(root, 'apps/api/src/modules/market/market.service.ts');
  const source = fs.readFileSync(file, 'utf8');
  const method = source.slice(source.indexOf('  async getMarketSnapshot('), source.indexOf('  async getCompetitors('))
    .replace('async getMarketSnapshot(', 'async function getMarketSnapshot(');
  const box = { IntegrationGateway: { getInstance: () => ({ executeCapability: async () => ({
    success: true, data: { products: [] }, providerId: 'xydc', transport: 'MCP', mode: 'LIVE',
    capturedAt: '2026-09-14T00:00:00Z',
  }) }) } };
  vm.runInNewContext(ts.transpileModule(method + '\nthis.invoke = getMarketSnapshot;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, box, { filename: file });
  const snapshot = await box.invoke.call({}, undefined, 'review probe', 'AMAZON_US');
  record('A-SERVICE-MISSING-LIVE', snapshot,
    snapshot.avgPrice === null && snapshot.searchVolumeMonthly === null && snapshot.opportunityScore === null);

  const mapped = XydcMapper.toMarketOverview({ keyword: 'review probe', trending_keywords: [{ keyword: 'term' }] });
  record('A-TREND-MISSING', mapped.trendingKeywords,
    mapped.trendingKeywords[0].volume == null && mapped.trendingKeywords[0].growth == null);

  for (const variant of ['missing', 'zero']) {
    const pagePath = path.join(root, 'apps/web/src/app/app/market-research/page.tsx');
    const page = fs.readFileSync(pagePath, 'utf8');
    let count = 0;
    const supplied = { ...mapped, searchVolumeMonthly: variant === 'zero' ? 0 : null,
      opportunityScore: variant === 'zero' ? 0 : null, competitionScore: variant === 'zero' ? 0 : null };
    const react = { useEffect: () => {}, useState: (initial) => {
      const i = count++; return [i === 0 ? supplied : i === 5 ? false : initial, () => {}];
    }, createElement: (type, props, ...children) => ({ type, props, children }) };
    const sandbox = { exports: {}, require: (id) => {
      if (id === 'react') return { ...react, default: react };
      if (id === 'next/link') return { default: 'Link' };
      if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (id.includes('api-client')) return { ApiClient: { isViewer: () => false } };
      throw new Error('Unexpected page import: ' + id);
    } };
    vm.runInNewContext(ts.transpileModule(page, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    } }).outputText, sandbox, { filename: pagePath });
    const tree = sandbox.exports.default();
    const text = [];
    const walk = (x) => {
      if (typeof x === 'string' || typeof x === 'number') text.push(String(x));
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && x.children) x.children.forEach(walk);
    };
    walk(tree);
    const visible = text.join(' ');
    const unsupported = ['+22.4%', '高潜力细分市场', '壁垒中等，易切入', '头部垄断度较低'].filter(x => visible.includes(x));
    record('A-UI-' + variant.toUpperCase(), { unsupportedClaims: unsupported }, unsupported.length === 0);
  }
  const report = { actualNetworkCalls: 0, actualDatabaseCalls: 0,
    pass: results.filter(x => x.pass).length, fail: results.filter(x => !x.pass).length, results };
  fs.writeFileSync(path.join(__dirname, 'batch-a-probe-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.fail ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 2; });
