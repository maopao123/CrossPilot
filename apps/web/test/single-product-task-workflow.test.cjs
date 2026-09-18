const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/app/app/market-research/page.tsx');
const sectionPath = path.join(root, 'src/app/app/market-research/single-product-research-section.tsx');
const workflowPath = path.join(root, 'src/app/app/market-research/research-task-workflow.tsx');

test('Workflow Orchestration: research-task-workflow.tsx component structure', () => {
  assert.ok(fs.existsSync(workflowPath), 'research-task-workflow.tsx must exist');
  const code = fs.readFileSync(workflowPath, 'utf8');

  // 验证 5 阶段完整覆盖
  assert.ok(code.includes('市场机会分析'), 'Must contain Stage 1 市场机会分析');
  assert.ok(code.includes('产品规格'), 'Must contain Stage 2 产品规格');
  assert.ok(code.includes('供应商报价'), 'Must contain Stage 3 供应商报价');
  assert.ok(code.includes('利润测算'), 'Must contain Stage 4 利润测算');
  assert.ok(code.includes('投资决策'), 'Must contain Stage 5 投资决策');

  // 验证任务切换器与历史下拉
  assert.ok(code.includes('handleSwitchTask'), 'Must support switching tasks from history');
  assert.ok(code.includes('/api/v1/market-research/tasks'), 'Must call task endpoints');
  assert.ok(code.includes('onNewTask'), 'Must support onNewTask callback');
});

test('Workflow Orchestration: single-product-research-section.tsx state synchronization', () => {
  assert.ok(fs.existsSync(sectionPath), 'single-product-research-section.tsx must exist');
  const code = fs.readFileSync(sectionPath, 'utf8');

  // 验证引入并渲染了 ResearchTaskWorkflow
  assert.ok(code.includes('<ResearchTaskWorkflow'), 'Must render ResearchTaskWorkflow component');

  // 验证 syncTaskProgress 在关键节点触发
  assert.ok(code.includes("syncTaskProgress(res, 'SPECIFICATION')"), 'Must sync SPECIFICATION stage on freeze spec');
  assert.ok(code.includes("syncTaskProgress(res, 'QUOTE')"), 'Must sync QUOTE stage on quote operations');
  assert.ok(code.includes("syncTaskProgress(res, 'ECONOMICS')"), 'Must sync ECONOMICS stage on economics update');
  assert.ok(code.includes("syncTaskProgress(candidate, 'DECISION')"), 'Must sync DECISION stage on decision packet');

  // 验证支持外部传入 initialTask / initialCandidate
  assert.ok(code.includes('initialTask'), 'Must support initialTask prop');
  assert.ok(code.includes('onTaskChange'), 'Must support onTaskChange prop');
});

test('Workflow Orchestration: page.tsx macro to single product research handoff', () => {
  assert.ok(fs.existsSync(pagePath), 'page.tsx must exist');
  const code = fs.readFileSync(pagePath, 'utf8');

  // 验证 Macro Research 选中候选产品触发深研流程并切入 singleProduct 模式
  assert.ok(
    code.includes('handleCandidateSelectForDeepResearch'),
    'page.tsx must define handleCandidateSelectForDeepResearch',
  );
  assert.ok(
    code.includes("onCandidateSelect={handleCandidateSelectForDeepResearch}"),
    'CandidateComparisonSection must receive onCandidateSelect',
  );
  assert.ok(
    code.includes("setActiveWorkspaceMode('singleProduct')"),
    'Selecting candidate must switch to singleProduct workspace mode',
  );
  assert.ok(
    code.includes('<SingleProductResearchSection'),
    'Must render SingleProductResearchSection',
  );
  assert.ok(
    code.includes('initialTask={activeResearchTask}'),
    'SingleProductResearchSection must receive initialTask',
  );
});
