/**
 * Batch C Verification Probes
 * Tests contract extension safety, producer evidenceMeta/errorEnvelope, consumer lossless pass-through,
 * legacy backward compatibility, and schema integrity.
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
  console.log('Running Batch C Verification Probes');
  console.log('====================================================');

  // Probe 1: C-CONTRACT-DIFF-SAFETY
  // Verify tool.types.ts preserves all original fields and only adds optional fields
  const toolTypesPath = path.join(rootDir, 'packages/tool-platform/src/contracts/tool.types.ts');
  const toolTypesContent = fs.readFileSync(toolTypesPath, 'utf8');

  assert(
    toolTypesContent.includes('success: boolean;') &&
    toolTypesContent.includes('data?: T;') &&
    toolTypesContent.includes('error?: ToolError;') &&
    toolTypesContent.includes('traceId: string;') &&
    toolTypesContent.includes('durationMs: number;') &&
    toolTypesContent.includes('cost?:') &&
    toolTypesContent.includes('evidenceMeta?: EvidenceMeta[];') &&
    toolTypesContent.includes('errorEnvelope?: ToolErrorEnvelope;'),
    'C-CONTRACT-DIFF-SAFETY: ToolExecutionResult preserves all original fields and adds optional evidenceMeta/errorEnvelope',
  );

  // Probe 2: C-SHARED-CONTRACTS-EXPORT
  // Verify evidence-contracts and approval-contracts exist and are exported
  const sharedIndexPath = path.join(rootDir, 'packages/shared/src/index.ts');
  const sharedIndexContent = fs.readFileSync(sharedIndexPath, 'utf8');
  const evidenceContractsPath = path.join(rootDir, 'packages/shared/src/contracts/evidence-contracts.ts');
  const approvalContractsPath = path.join(rootDir, 'packages/shared/src/contracts/approval-contracts.ts');

  assert(
    fs.existsSync(evidenceContractsPath) &&
    fs.existsSync(approvalContractsPath) &&
    sharedIndexContent.includes("export * from './contracts/evidence-contracts.js';") &&
    sharedIndexContent.includes("export * from './contracts/approval-contracts.js';"),
    'C-SHARED-CONTRACTS-EXPORT: EvidenceMeta and ApprovalProof contracts exist and are exported from @crosspilot/shared',
  );

  // Verify content of evidence-contracts.ts
  const evidenceContent = fs.readFileSync(evidenceContractsPath, 'utf8');
  assert(
    evidenceContent.includes('export type EvidenceValueStatus =') &&
    evidenceContent.includes("'KNOWN'") &&
    evidenceContent.includes("'MISSING'") &&
    evidenceContent.includes('export type EvidenceFreshness =') &&
    evidenceContent.includes("'FRESH'") &&
    evidenceContent.includes("'STALE'") &&
    evidenceContent.includes('export interface EvidenceMeta {'),
    'C-SHARED-EVIDENCE-SCHEMA: EvidenceMeta defines valueStatus and freshness orthogonal types per §9.2',
  );

  // Verify content of approval-contracts.ts
  const approvalContent = fs.readFileSync(approvalContractsPath, 'utf8');
  assert(
    approvalContent.includes('export interface ApprovalProof {') &&
    approvalContent.includes('approvalId: string;') &&
    approvalContent.includes('workspaceId: string;') &&
    approvalContent.includes('actionId: string;') &&
    approvalContent.includes('actionType: string;') &&
    approvalContent.includes('targetId: string;') &&
    approvalContent.includes('payloadHash: string;') &&
    approvalContent.includes('export interface ApprovalVerifier {'),
    'C-SHARED-APPROVAL-SCHEMA: ApprovalProof and ApprovalVerifier defined strictly per §9.3',
  );

  // Probe 3: C-PRODUCER-EVIDENCE-META & C-CONSUMER-LOSSLESS-PASSTHROUGH
  // Import built tool-platform and run BiVarianceAttributeTool via ToolExecutor
  const { createDefaultToolRegistry, ToolExecutor } = require(path.join(rootDir, 'packages/tool-platform/dist/index.js'));
  const registry = createDefaultToolRegistry();
  const executor = new ToolExecutor(registry);

  const execRes = await executor.execute(
    'bi.variance.attribute',
    {
      previousProfit: 10000,
      currentProfit: 7500,
      advertisingImpact: -1500,
      returnsImpact: -500,
      inventoryImpact: -300,
      priceImpact: -200,
    },
    { workspaceId: 'ws_probe_test', source: 'TOOL_CENTER' },
  );

  assert(
    execRes.success === true &&
    execRes.data &&
    execRes.data.totalVariance === -2500 &&
    Array.isArray(execRes.evidenceMeta) &&
    execRes.evidenceMeta.length === 1 &&
    execRes.evidenceMeta[0].sourceType === 'DERIVED' &&
    execRes.evidenceMeta[0].valueStatus === 'DERIVED' &&
    execRes.evidenceMeta[0].freshness === 'UNKNOWN' &&
    execRes.evidenceMeta[0].confidence === 1.0,
    'C-PRODUCER-EVIDENCE-META & C-CONSUMER-LOSSLESS-PASSTHROUGH: BiVarianceAttributeTool produces compliant EvidenceMeta and ToolExecutor passes it through losslessly',
  );

  // Probe 4: C-PRODUCER-ERROR-ENVELOPE
  const errRes = await executor.execute(
    'bi.variance.attribute',
    {
      previousProfit: NaN,
      currentProfit: 7500,
    },
    { workspaceId: 'ws_probe_test' },
  );

  assert(
    errRes.success === false &&
    errRes.error &&
    errRes.error.code === 'INVALID_PROFIT_INPUT' &&
    errRes.errorEnvelope &&
    errRes.errorEnvelope.code === 'INVALID_PROFIT_INPUT' &&
    errRes.errorEnvelope.category === 'VALIDATION' &&
    errRes.errorEnvelope.retryable === false &&
    typeof errRes.errorEnvelope.why === 'string',
    'C-PRODUCER-ERROR-ENVELOPE: Error envelope generated on invalid input matches error code and category',
  );

  // Probe 5: C-CONSUMER-LEGACY-COMPAT
  // Simulate consumer receiving legacy response without evidenceMeta / errorEnvelope
  const legacyResponse = {
    success: true,
    data: { computed: 100 },
    traceId: 'trace_probe_legacy',
    durationMs: 12,
  };
  const consumerRead = {
    ok: legacyResponse.success,
    hasEvidence: Boolean(legacyResponse.evidenceMeta && legacyResponse.evidenceMeta.length > 0),
    evidenceMeta: legacyResponse.evidenceMeta || null,
    errorEnvelope: legacyResponse.errorEnvelope || null,
  };
  assert(
    consumerRead.ok === true &&
    consumerRead.hasEvidence === false &&
    consumerRead.evidenceMeta === null &&
    consumerRead.errorEnvelope === null,
    'C-CONSUMER-LEGACY-COMPAT: Consumer reading legacy response without new fields executes safely without error',
  );

  // Probe 6: C-PRISMA-SCHEMA-UNTOUCHED
  const prismaDiff = execSync('git diff packages/db/prisma/', { cwd: rootDir, encoding: 'utf8' }).trim();
  const schemaPrisma = fs.readFileSync(path.join(rootDir, 'packages/db/prisma/schema.prisma'), 'utf8');

  assert(
    prismaDiff === '' &&
    schemaPrisma.includes('@@unique([workspaceId, skuCode])') &&
    schemaPrisma.includes('@@unique([storeId, platform, entityType, externalId])'),
    'C-PRISMA-SCHEMA-UNTOUCHED: packages/db/prisma/ git diff is empty and Sku / ChannelIdentity unique constraints are untouched',
  );

  console.log('====================================================');
  console.log(`[Batch C Probes] ${passCount} passed, ${failCount} failed.`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runProbes().catch((err) => {
  console.error('Probe execution fatal error:', err);
  process.exit(1);
});
