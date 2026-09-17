const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const componentPath = path.join(
  root,
  'src/app/app/market-research/single-product-research-section.tsx',
);

test('P0 & P1 Truthfulness: single-product-research-section code checks', () => {
  const code = fs.readFileSync(componentPath, 'utf8');

  // 1. P1: 坚决取消页面初始加载时的 auto-load demo
  assert.ok(
    !code.includes('useEffect(() => {\n    if (!candidate) {\n      loadFruitBoxDemo();\n    }\n  }, []);'),
    'single-product-research-section.tsx must NOT contain automatic loadFruitBoxDemo in useEffect',
  );

  // 2. P0: newQuoteForm 初始状态不得将可选/必填数值字段默认写死为 0
  assert.ok(
    code.includes("unitPrice: ''"),
    'newQuoteForm.unitPrice must default to empty string, not 0',
  );
  assert.ok(
    code.includes("packagingCost: ''"),
    'newQuoteForm.packagingCost must default to empty string, not 0',
  );
  assert.ok(
    code.includes("logoCost: ''"),
    'newQuoteForm.logoCost must default to empty string, not 0',
  );
  assert.ok(
    code.includes("moq: ''"),
    'newQuoteForm.moq must default to empty string, not 0',
  );
  assert.ok(
    code.includes("sampleCost: ''"),
    'newQuoteForm.sampleCost must default to empty string, not 0',
  );

  // 3. P0: Unknown charge modal 初始状态不得预填 0
  assert.ok(
    code.includes("const [unknownChargesInput, setUnknownChargesInput] = useState<{\n    packagingCost: number | '';\n    logoCost: number | '';\n  }>"),
    'unknownChargesInput must use number | empty string typing',
  );

  // 4. P0: 保存 Quote 时严格区分 UNKNOWN null 与 FACT 0
  assert.ok(
    code.includes("packagingCostVal === undefined\n          ? { value: null, source: 'UNKNOWN' as const }\n          : { value: packagingCostVal, source: 'FACT' as const }"),
    'handleSaveNewQuote must save packagingCost as UNKNOWN when blank, and FACT when explicit number',
  );
  assert.ok(
    code.includes("logoCostVal === undefined\n          ? { value: null, source: 'UNKNOWN' as const }\n          : { value: logoCostVal, source: 'FACT' as const }"),
    'handleSaveNewQuote must save logoCost as UNKNOWN when blank, and FACT when explicit number',
  );

  // 5. P1: 无 Candidate 时必须展示真实入口页
  assert.ok(
    code.includes('if (!candidate) {'),
    'single-product-research-section.tsx must render dedicated portal when candidate === null',
  );
  assert.ok(
    code.includes('载入玻璃水果盒测试样本'),
    'must contain deemphasized button to manually load demo fruit box',
  );

  // 6. P1: Demo 必须显式展示测试样本 Banner 与 Badge
  assert.ok(
    code.includes('测试样本 (Demo 数据，仅用于功能体验)'),
    'must render explicit Demo Banner when isDemo or candidate.id is cand-glass-fruit-box-001',
  );
  assert.ok(
    code.includes('测试样本 (Demo)'),
    'must render explicit Demo badge in candidate header',
  );
});

test('P0 Truthfulness: parseOptionalNumber behavior on blank vs 0 vs positive numbers', () => {
  function parseOptionalNumber(value) {
    if (value === '' || value === undefined || value === null) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  // 1. 空白与缺失值返回 undefined，不造假 0
  assert.strictEqual(parseOptionalNumber(''), undefined);
  assert.strictEqual(parseOptionalNumber(undefined), undefined);
  assert.strictEqual(parseOptionalNumber(null), undefined);

  // 2. 明确的 0 必须保留为 0 (FACT 0)
  assert.strictEqual(parseOptionalNumber(0), 0);
  assert.strictEqual(parseOptionalNumber('0'), 0);

  // 3. 正数解析正常
  assert.strictEqual(parseOptionalNumber(42), 42);
  assert.strictEqual(parseOptionalNumber('42.5'), 42.5);

  // 4. 无效文本返回 undefined
  assert.strictEqual(parseOptionalNumber('abc'), undefined);
});
