/**
 * 统筹对抗探针 Batch C R2（review-kimi）
 * 覆盖执行方未覆盖场景：旧格式兼容、error/errorEnvelope 一致性、字段语义（observedAt 不得填 now()）、
 * 特殊字符/嵌套结构全链路深相等透传。
 * 运行前提：packages/tool-platform 与 packages/shared 已构建 dist。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const toolPlatform = require(path.join(root, 'packages/tool-platform/dist/index.js'));

const results = [];
function record(id, actual, pass, note) { results.push({ id, actual, pass, ...(note ? { note } : {}) }); }

// 以 vm+transpile 加载真实 tool-center.service.ts（与 batch-a 统筹探针同款手法）
function loadToolCenterService() {
  const file = path.join(root, 'apps/api/src/modules/tool-center/tool-center.service.ts');
  const source = fs.readFileSync(file, 'utf8');
  const sandbox = {
    exports: {},
    require: (id) => {
      if (id === '@nestjs/common') return {
        Injectable: () => (t) => t,
        NotFoundException: class NotFoundException extends Error {},
      };
      if (id === '@crosspilot/tool-platform') return toolPlatform;
      if (id === '@crosspilot/shared') return require(path.join(root, 'packages/shared/dist/index.js'));
      if (id.includes('prisma.service')) return { PrismaService: class {} };
      throw new Error('Unexpected import: ' + id);
    },
    module: { exports: {} },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true, emitDecoratorMetadata: true },
  }).outputText, sandbox, { filename: file });
  return sandbox.module.exports.ToolCenterService;
}

async function main() {
  const ToolCenterService = loadToolCenterService();
  const service = new ToolCenterService({});

  // ---- P-1 旧格式兼容：注册一个完全不产出 evidenceMeta/errorEnvelope 的旧式工具 ----
  service.getRegistry().register({
    id: 'review.legacy.tool',
    name: 'Review Legacy Tool',
    description: 'legacy-format tool for probe',
    category: 'PRODUCT_RESEARCH',
    permissions: [],
    execute: (input) => ({ echoed: input, note: 'old format, no new fields' }),
  });
  let p1 = { threw: null, recordFields: null };
  try {
    const res = await service.executeTool('review.legacy.tool', { a: 1 }, 'ws-review-c', 'u1');
    const runs = service.recentExecutions || [];
    const rec = runs[0] || {};
    p1 = {
      success: res.success,
      evidenceMeta: res.evidenceMeta,
      errorEnvelope: res.errorEnvelope,
      recordEvidenceMeta: rec.evidenceMeta,
      recordErrorEnvelope: rec.errorEnvelope,
    };
    record('P-1-LEGACY-COMPAT', p1,
      res.success === true && res.evidenceMeta === undefined && res.errorEnvelope === undefined &&
      rec.evidenceMeta === undefined && rec.errorEnvelope === undefined,
      'old-format result must flow without exception; new fields undefined everywhere');
  } catch (e) {
    record('P-1-LEGACY-COMPAT', { threw: String(e) }, false);
  }

  // ---- P-2 errorEnvelope 与 error 同源一致 ----
  const errRes = await service.executeTool('bi.variance.attribute',
    { previousProfit: 'not-a-number', currentProfit: 100 }, 'ws-review-c', 'u1');
  const CATEGORIES = ['VALIDATION', 'AUTH', 'RATE_LIMIT', 'UPSTREAM', 'CONFLICT', 'UNSUPPORTED'];
  const env = errRes.errorEnvelope || {};
  record('P-2-ENVELOPE-CONSISTENCY', {
    success: errRes.success,
    errorCode: errRes.error && errRes.error.code,
    envelopeCode: env.code,
    category: env.category,
    retryable: env.retryable,
    retryableType: typeof env.retryable,
  },
    errRes.success === false &&
    !!errRes.error && env.code === errRes.error.code &&
    CATEGORIES.includes(env.category) && typeof env.retryable === 'boolean',
    'errorEnvelope.code must equal error.code; category in enum; retryable boolean');

  // ---- P-3 字段语义：observedAt 不得被填 now()；记录 valueStatus/freshness 标注供裁决 ----
  const okRes = await service.executeTool('bi.variance.attribute',
    { previousProfit: 1000, currentProfit: 1150, advertisingImpact: 50 }, 'ws-review-c', 'u1');
  const meta = (okRes.evidenceMeta || [])[0] || {};
  const observedAtLooksLikeNow = typeof meta.observedAt === 'string' &&
    Math.abs(Date.parse(meta.observedAt) - Date.now()) < 60_000;
  record('P-3-FIELD-SEMANTICS', {
    observedAt: meta.observedAt,
    observedAtFilledWithNow: observedAtLooksLikeNow,
    valueStatus: meta.valueStatus,
    freshness: meta.freshness,
    confidence: meta.confidence,
    sourceType: meta.sourceType,
  },
    okRes.success === true && (meta.observedAt === null || meta.observedAt === undefined) &&
    !observedAtLooksLikeNow,
    "§9.2: 上游无时间戳严禁填 now()。valueStatus/freshness 标注是否恰当（KNOWN vs DERIVED）由统筹裁决——此处如实记录");

  // ---- P-4 透传无损耗：特殊字符/嵌套结构全链路深相等 ----
  const weirdMeta = [{
    evidenceId: 'evi_特殊_①',
    sourceType: 'API',
    sourceRef: 'https://api.example.com/q?a=1&b="双引号"&c=\'单引号\'\n换行\t制表&emoji=🚀',
    observedAt: null,
    capturedAt: '2026-09-14T00:00:00.000Z',
    valueStatus: 'CONFLICTING',
    freshness: 'UNKNOWN',
    proxyUsed: false,
    missingReason: 'null\u0000bytes 与 <script> 注入字符 & 中文说明',
    confidence: 0.5,
  }];
  service.getRegistry().register({
    id: 'review.weird.tool',
    name: 'Review Weird Tool',
    description: 'special-char evidenceMeta producer',
    category: 'PRODUCT_RESEARCH',
    permissions: [],
    execute: () => ({ payload: { nested: { arr: [1, '二', null, { deep: true }] } }, evidenceMeta: weirdMeta }),
  });
  const weirdRes = await service.executeTool('review.weird.tool', {}, 'ws-review-c', 'u1');
  const weirdRuns = service.recentExecutions || [];
  const weirdRec = weirdRuns[0] || {};
  let deepEqualResult = true; let deepEqualRecord = true; let err1 = null; let err2 = null;
  try { assert.deepStrictEqual(weirdRes.evidenceMeta, weirdMeta); } catch (e) { deepEqualResult = false; err1 = String(e); }
  try { assert.deepStrictEqual(weirdRec.evidenceMeta, weirdMeta); } catch (e) { deepEqualRecord = false; err2 = String(e); }
  record('P-4-LOSSLESS-PASSTHROUGH', {
    executorLevelDeepEqual: deepEqualResult,
    toolCenterRecordDeepEqual: deepEqualRecord,
    err1, err2,
  }, deepEqualResult && deepEqualRecord,
    'producer evidenceMeta must be deep-equal after executor -> tool-center record chain');

  const report = { pass: results.filter((x) => x.pass).length, fail: results.filter((x) => !x.pass).length, results };
  fs.writeFileSync(path.join(__dirname, 'batch-c-probes-r2-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.fail ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 2; });
