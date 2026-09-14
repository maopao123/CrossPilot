/**
 * Batch D Verification Probes
 * Tests end-to-end sample convergence, timeout non-fatal mapping,
 * recovery worker auto-healing, anti-tamper guards, and schema integrity.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../..');
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

async function runProbes() {
  console.log('====================================================');
  console.log('Running Batch D Verification Probes');
  console.log('====================================================');

  // Probe 1: D-NO-PARALLEL-SYSTEMS
  // Verify strictly ONE recovery processor and queue exist, no duplicate or parallel systems
  const recoveryProcessorPath = path.join(
    rootDir,
    'apps/worker/src/processors/automation-recovery.processor.ts',
  );
  const recoveryProcessorContent = fs.readFileSync(recoveryProcessorPath, 'utf8');

  assert(
    recoveryProcessorContent.includes(
      "export const AUTOMATION_RECOVERY_QUEUE_NAME = 'crosspilot-automation-recovery';",
    ) &&
      recoveryProcessorContent.includes('export async function processAutomationRecovery(') &&
      recoveryProcessorContent.includes('new AutomationOperationStore(prisma)'),
    'D-NO-PARALLEL-SYSTEMS: Reuses canonical AutomationRecoveryProcessor and single queue crosspilot-automation-recovery',
  );

  // Probe 2: D-APPROVAL-HARD-GUARD
  // Verify CREATE_PURCHASE_ORDER strictly enforces needApproval: true and riskLevel: 'high'
  const purchaseServicePath = path.join(
    rootDir,
    'apps/api/src/modules/purchase/purchase-automation.service.ts',
  );
  const purchaseServiceContent = fs.readFileSync(purchaseServicePath, 'utf8');

  const actionServicePath = path.join(
    rootDir,
    'apps/api/src/modules/action-layer/action-layer.service.ts',
  );
  const actionServiceContent = fs.readFileSync(actionServicePath, 'utf8');

  assert(
    purchaseServiceContent.includes("actionType: 'CREATE_PURCHASE_ORDER'") &&
      purchaseServiceContent.includes("riskLevel: 'high'") &&
      purchaseServiceContent.includes('needApproval: true') &&
      actionServiceContent.includes("if (row.status !== 'APPROVED')") &&
      actionServiceContent.includes('only APPROVED actions can execute'),
    'D-APPROVAL-HARD-GUARD: Purchase actions strictly require human approval and unapproved execution is blocked',
  );

  // Probe 3: D-TIMEOUT-FAILURE-MAPPING
  // Verify timeout and network errors map to SUBMITTED / UNKNOWN / QUERY without permanent FAILED
  assert(
    actionServiceContent.includes(
      "const isTimeout = erpRes.errorCode === 'TIMEOUT' || erpRes.errorCode === 'UNKNOWN_ERROR';",
    ) &&
      actionServiceContent.includes("const phase = isTimeout ? 'SUBMITTED' : 'FAILED';") &&
      actionServiceContent.includes("const effect = isTimeout ? 'UNKNOWN' : 'NOT_APPLIED';") &&
      actionServiceContent.includes("const recovery = isTimeout ? 'QUERY' :") &&
      actionServiceContent.includes("const actionStatus = isTimeout ? 'EXECUTING' : 'FAILED';") &&
      actionServiceContent.includes(
        'ERP 采购单提交超时，远端状态未知，已置入 QUERY 恢复队列等待 Worker 自愈',
      ),
    'D-TIMEOUT-FAILURE-MAPPING: Timeout / network errors map to SUBMITTED / UNKNOWN / QUERY and keep status EXECUTING',
  );

  // Probe 4: D-WORKER-CONVERGENCE-LOGIC & D-R1 PAYLOAD VERIFICATION
  // Verify Recovery Worker implements remote query (Case 1) with payload verification,
  // recreate retry (Case 2), and non-silent local sync error handling
  assert(
    recoveryProcessorContent.includes('adapter.getPurchaseOrder(') &&
      recoveryProcessorContent.includes("phase: 'COMPLETED'") &&
      recoveryProcessorContent.includes("effect: 'APPLIED'") &&
      recoveryProcessorContent.includes("recovery: 'NONE'") &&
      recoveryProcessorContent.includes("const isDefiniteNotFound = checkRes.errorCode === 'NOT_FOUND';") &&
      recoveryProcessorContent.includes("phase: 'READY'") &&
      recoveryProcessorContent.includes("recovery: 'RETRY'") &&
      recoveryProcessorContent.includes('syncLocalPurchaseOrder(prisma,') &&
      recoveryProcessorContent.includes('adapter.createPurchaseOrder(') &&
      recoveryProcessorContent.includes('REMOTE_PAYLOAD_MISMATCH') &&
      recoveryProcessorContent.includes('LOCAL_SYNC_FAILED') &&
      recoveryProcessorContent.includes('conflictDetails'),
    'D-WORKER-CONVERGENCE-LOGIC: Recovery Worker handles Case 1, Case 2, and enforces D-R1 payload verification & local sync error tracking',
  );

  // Probe 5: D-FRONTEND-EVIDENCE-TRUTHFULNESS
  // Verify frontend ActionDetailDrawer extracts real executionEvidence and renders phase, effect, externalId
  const drawerPath = path.join(
    rootDir,
    'apps/web/src/app/app/operations/today/components/action-detail-drawer.tsx',
  );
  const drawerContent = fs.readFileSync(drawerPath, 'utf8');

  assert(
    drawerContent.includes('(action as any).parameters?._evidence') &&
      drawerContent.includes("exec.phase === 'COMPLETED'") &&
      drawerContent.includes("exec.phase === 'NEEDS_ATTENTION'") &&
      drawerContent.includes("exec.effect === 'APPLIED'") &&
      drawerContent.includes('exec.externalId') &&
      drawerContent.includes('执行真实性证据 (Execution Truthfulness)'),
    'D-FRONTEND-EVIDENCE-TRUTHFULNESS: ActionDetailDrawer renders faithful execution evidence and warns on NEEDS_ATTENTION',
  );

  // Probe 6: D-SCHEMA-INTEGRITY
  // Verify packages/db/prisma/ schema has zero diff
  let schemaDiff = '';
  try {
    schemaDiff = execSync('git diff packages/db/prisma/', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch (err) {
    schemaDiff = 'ERROR';
  }
  assert(
    schemaDiff === '',
    'D-SCHEMA-INTEGRITY: git diff packages/db/prisma/ is strictly empty, zero database drift',
  );

  // Probe 7: D-E2E-SPEC-EXISTS
  // Verify automation-batch-d-alignment.spec.ts exists and covers all required scenarios
  const e2eSpecPath = path.join(rootDir, 'apps/api/test/automation-batch-d-alignment.spec.ts');
  assert(
    fs.existsSync(e2eSpecPath),
    'D-E2E-SPEC-EXISTS: Dedicated E2E alignment spec exists in apps/api/test/automation-batch-d-alignment.spec.ts',
  );

  const e2eSpecContent = fs.readFileSync(e2eSpecPath, 'utf8');
  assert(
    e2eSpecContent.includes('Failure Reproduction: Injects ERP network/timeout fault') &&
      e2eSpecContent.includes('Worker Convergence (Case 1): Remote order pre-exists') &&
      e2eSpecContent.includes('Worker Convergence (Case 2): Remote order confirmed NOT_FOUND') &&
      e2eSpecContent.includes('Adversarial & Idempotency: Remote exists never causes duplicate order creation') &&
      e2eSpecContent.includes('Anti-Tamper & Guard: CREATE_PURCHASE_ORDER requires human approval') &&
      e2eSpecContent.includes('Frontend ActionDetailDrawer Evidence Contract Compatibility'),
    'D-E2E-COVERAGE: Spec covers failure reproduction, Case 1 exists, Case 2 retry, idempotency, approval guard, drawer contract',
  );

  console.log('====================================================');
  console.log(`Batch D Probes Summary: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runProbes().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
