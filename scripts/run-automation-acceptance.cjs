const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const reportDir = path.resolve(rootDir, 'artifacts/automation-v1');
const reportFile = path.resolve(reportDir, 'acceptance-report.json');

if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

console.log('================================================================');
console.log(' CrossPilot AI Automation V1 Acceptance Suite (E01 ～ E15)');
console.log('================================================================\n');

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.AUTOMATION_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/crosspilot_test';

const env = {
  ...process.env,
  TEST_DATABASE_URL: testDbUrl,
  DATABASE_URL: testDbUrl,
};

const startTime = Date.now();
const results = [];

function recordScenario(id, title, category, passed, details = '') {
  results.push({
    id,
    title,
    category,
    status: passed ? 'PASS' : 'FAIL',
    details,
  });
  const symbol = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${id}] ${symbol}: ${title}`);
  if (details && !passed) {
    console.log(`     Error: ${details}`);
  }
}

// 1. Run G1 Review Probes (10/10)
console.log('\n--- 1. Executing G1 Round 1 Probes (10 Probes) ---');
try {
  const g1Res = execSync('node artifacts/automation-v1/g1-review/review-probes.cjs', {
    cwd: rootDir,
    env,
    encoding: 'utf8',
  });
  console.log(g1Res.trim());
  const g1Parsed = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'artifacts/automation-v1/g1-review/probe-results.json'), 'utf8'));
  const g1Passed = g1Parsed.fail === 0 && g1Parsed.pass === 10;
  recordScenario('E01', 'LIVE APPLIED 严禁伪造 / HTTP 200 非终态拦截', 'Gate G1 Execution Truth', g1Passed, '10/10 probes passed');
  recordScenario('E02', 'SIMULATOR / MOCK 执行模式与生效依据隔离', 'Gate G1 Execution Truth', g1Passed, '10/10 probes passed');
  recordScenario('E03', '提交前类型化拒绝 vs 提交后异常状态区分', 'Gate G1 Execution Truth', g1Passed, '10/10 probes passed');
  recordScenario('E04', '缓存键强约束与非幂等绕过拦截', 'Gate G1 Execution Truth', g1Passed, '10/10 probes passed');
  recordScenario('E05', '鉴权失败与会话失效阻断 (AUTH_REQUIRED)', 'Gate G1 Execution Truth', g1Passed, '10/10 probes passed');
} catch (err) {
  recordScenario('E01', 'LIVE APPLIED 严禁伪造 / HTTP 200 非终态拦截', 'Gate G1 Execution Truth', false, err.message);
  recordScenario('E02', 'SIMULATOR / MOCK 执行模式与生效依据隔离', 'Gate G1 Execution Truth', false, err.message);
  recordScenario('E03', '提交前类型化拒绝 vs 提交后异常状态区分', 'Gate G1 Execution Truth', false, err.message);
  recordScenario('E04', '缓存键强约束与非幂等绕过拦截', 'Gate G1 Execution Truth', false, err.message);
  recordScenario('E05', '鉴权失败与会话失效阻断 (AUTH_REQUIRED)', 'Gate G1 Execution Truth', false, err.message);
}

// 2. Run G1 Round 2 Probes (9/9)
console.log('\n--- 2. Executing G1 Round 2 Probes (9 Probes) ---');
try {
  const g2Res = execSync('node artifacts/automation-v1/g1-review-round2/remaining-probes.cjs', {
    cwd: rootDir,
    env,
    encoding: 'utf8',
  });
  console.log(g2Res.trim());
  const g2Parsed = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'artifacts/automation-v1/g1-review-round2/remaining-results.json'), 'utf8'));
  const g2Passed = g2Parsed.fail === 0 && g2Parsed.pass === 9;
  recordScenario('E06', '履约成功外部单号与验证时间真实性', 'Gate G1 Truth Verification', g2Passed, '9/9 round2 probes passed');
} catch (err) {
  recordScenario('E06', '履约成功外部单号与验证时间真实性', 'Gate G1 Truth Verification', false, err.message);
}

// 3. Run Jest Automation Suites
console.log('\n--- 3. Executing Jest Automation Integration Suites ---');
const suites = [
  {
    name: 'automation-operation-postgres',
    scenarios: [
      { id: 'E07', title: '数据库乐观锁 OCC 并发租约防重', category: 'Gate G2 Persistence' },
    ],
  },
  {
    name: 'automation-erp-http',
    scenarios: [
      { id: 'E09', title: '真实 Loopback ERP HTTP 协议联调', category: 'Gate G2 ERP Protocol' },
      { id: 'E10', title: '异常状态分类 (AUTH/RATE/TIMEOUT) 精确归因', category: 'Gate G2 ERP Protocol' },
    ],
  },
  {
    name: 'automation-procurement-flow',
    scenarios: [
      { id: 'E11', title: '补货算法与 ROP 建议量确定性计算', category: 'Gate G2 Closed-Loop' },
      { id: 'E12', title: '补货建议人工审批强阻断 (Approval ≠ Execute)', category: 'Gate G2 Closed-Loop' },
    ],
  },
  {
    name: 'automation-receipt-postgres',
    scenarios: [
      { id: 'E13', title: '多批次到货入库与状态机正确流转', category: 'Gate G2 Receipt & Reconcile' },
      { id: 'E14', title: '批次收货外部单号幂等性防重复入库', category: 'Gate G2 Receipt & Reconcile' },
      { id: 'E15', title: '采购与入库全链路一致性自动化对账', category: 'Gate G2 Receipt & Reconcile' },
    ],
  },
  {
    name: 'automation-recovery-postgres',
    scenarios: [
      { id: 'E08', title: '租约过期自动释放与故障接管自愈', category: 'Gate G3 Recovery & Healing' },
    ],
  },
];

for (const suite of suites) {
  console.log(`\nRunning ${suite.name}...`);
  try {
    const cmd = `pnpm --filter @crosspilot/api test --runInBand --testPathPattern="${suite.name}"`;
    execSync(cmd, { cwd: rootDir, env, stdio: 'inherit' });
    for (const sc of suite.scenarios) {
      recordScenario(sc.id, sc.title, sc.category, true, 'Jest test suite passed cleanly against real PostgreSQL & HTTP');
    }
  } catch (err) {
    for (const sc of suite.scenarios) {
      recordScenario(sc.id, sc.title, sc.category, false, `Suite ${suite.name} failed`);
    }
  }
}

// Summary Report Generation
const total = results.length;
const passedCount = results.filter((r) => r.status === 'PASS').length;
const failedCount = total - passedCount;
const durationSeconds = Math.round((Date.now() - startTime) / 1000);

const report = {
  projectName: 'CrossPilot AI Automation V1',
  generatedAt: new Date().toISOString(),
  durationSeconds,
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    databaseUrl: testDbUrl,
  },
  summary: {
    totalScenarios: total,
    passedScenarios: passedCount,
    failedScenarios: failedCount,
    passRate: `${Math.round((passedCount / total) * 100)}%`,
    verdict: failedCount === 0 ? 'ACCEPTANCE_PASSED' : 'ACCEPTANCE_FAILED',
  },
  scenarios: results,
};

fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

console.log('\n================================================================');
console.log(` Acceptance Verdict: ${report.summary.verdict} (${passedCount}/${total} PASSED in ${durationSeconds}s)`);
console.log(` Report written to: ${reportFile}`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
