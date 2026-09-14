const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const results = [];
function record(id, actual, pass, extra) { results.push({ id, actual, pass, ...(extra || {}) }); }
async function main() {
  const file = path.join(root, 'apps/api/src/modules/market/market.service.ts');
  const source = fs.readFileSync(file, 'utf8');
  const method = source.slice(source.indexOf('  async getMarketSnapshot('), source.indexOf('  async getCompetitors('))
    .replace('async getMarketSnapshot(', 'async function getMarketSnapshot(');

  // R2 scenario: products non-empty but partially missing fields, NO keywordMetric, NO overview, NO trendingKeywords
  const gatewayResult = {
    success: true,
    data: { products: [{ title: 'A', price: 25 }, { title: 'B' }] },
    providerId: 'xydc', transport: 'MCP', mode: 'LIVE',
    capturedAt: '2026-09-14T00:00:00Z',
  };
  const box = { IntegrationGateway: { getInstance: () => ({ executeCapability: async () => gatewayResult }) } };
  vm.runInNewContext(ts.transpileModule(method + '\nthis.invoke = getMarketSnapshot;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, box, { filename: file });
  const snapshot = await box.invoke.call({}, undefined, 'r2 partial fields probe', 'AMAZON_US');

  const FALLBACKS = [30.5, 16.99, 48500, 65500, 4.42, 4.4, 1120, 4001, 6.5, 7.4, 8.8, 8.5];
  record('R2-SERVICE-AVGPRICE',
    { avgPrice: snapshot.avgPrice },
    snapshot.avgPrice === 25 && !FALLBACKS.includes(snapshot.avgPrice),
    { expect: '25 (only real price, B has none) or honest 0-inclusive result; never 30.5/16.99' });
  record('R2-SERVICE-NULL-METRICS',
    {
      avgRating: snapshot.avgRating,
      avgReviewCount: snapshot.avgReviewCount,
      searchVolumeMonthly: snapshot.searchVolumeMonthly,
      opportunityScore: snapshot.opportunityScore,
      competitionScore: snapshot.competitionScore,
    },
    snapshot.avgRating === null && snapshot.avgReviewCount === null &&
      snapshot.searchVolumeMonthly === null && snapshot.opportunityScore === null &&
      snapshot.competitionScore === null,
    { expect: 'all null (no real source)' });
  const trendOk = !Array.isArray(snapshot.trendingKeywords) || snapshot.trendingKeywords.length === 0 ||
    snapshot.trendingKeywords.every((k) => k.volume == null && k.growth == null);
  const trendFabricated = (snapshot.trendingKeywords || []).filter(
    (k) => (typeof k.growth === 'string' && /\+\d+(\.\d+)?%/.test(k.growth)) ||
      (typeof k.volume === 'number' && k.volume > 0));
  record('R2-SERVICE-TRENDING',
    { trendingKeywords: snapshot.trendingKeywords, fabricated: trendFabricated },
    trendOk && trendFabricated.length === 0,
    { expect: 'empty array, or entries with volume/growth null; no proportional derivation or hardcoded +xx%' });
  record('R2-SERVICE-COMPETITOR-COUNT',
    { competitorCount: snapshot.competitorCount },
    snapshot.competitorCount === 2,
    { expect: '2 (real products.length); never 10/12' });
  record('R2-SERVICE-MODE',
    { mode: snapshot.mode, provider: snapshot.provider },
    snapshot.mode === 'LIVE',
    { expect: "mode 'LIVE'" });

  // UI variant: snapshot with partial fields (some values, some null) rendered by page.tsx
  const supplied = {
    seedKeyword: 'r2 partial fields probe',
    category: null,
    searchVolumeMonthly: null,
    avgPrice: 25,
    avgRating: null,
    avgReviewCount: null,
    competitorCount: 2,
    opportunityScore: null,
    competitionScore: null,
    trendingKeywords: [],
    provider: 'xydc',
    transport: 'MCP',
    mode: 'LIVE',
    capturedAt: '2026-09-14T00:00:00Z',
    evidence: [],
  };
  const pagePath = path.join(root, 'apps/web/src/app/app/market-research/page.tsx');
  const page = fs.readFileSync(pagePath, 'utf8');
  let count = 0;
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
  const CLAIMS = ['+22.4%', '高潜力细分市场', '壁垒中等', '头部垄断度', '48,500', '65,500',
    '30.5', '16.99', '4.42', '1,120', '4,001', '+28%', '+20%', '+42%', '+18%', '+25%', '+35%'];
  const unsupported = CLAIMS.filter((x) => visible.includes(x));
  // informational: static section headers making claims regardless of data
  const staticClaims = ['高增长买家搜索词'].filter((x) => visible.includes(x));
  record('R2-UI-PARTIAL-SNAPSHOT',
    { unsupportedClaims: unsupported, staticHeaderClaims: staticClaims },
    unsupported.length === 0,
    { note: 'staticHeaderClaims is informational (section header claims regardless of data), not counted in pass/fail' });

  const report = { actualNetworkCalls: 0, actualDatabaseCalls: 0,
    pass: results.filter((x) => x.pass).length, fail: results.filter((x) => !x.pass).length, results };
  fs.writeFileSync(path.join(__dirname, 'batch-a-probes-r2-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.fail ? 1 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 2; });
