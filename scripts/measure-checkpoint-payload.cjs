/**
 * Preflight B: Checkpoint Payload Size Measurement (.cjs)
 */

const {
  DailyOperationWorkflowService,
  InMemoryWorkflowCheckpointStore,
} = require('../packages/domain/dist/index.js');

async function measure() {
  const store = new InMemoryWorkflowCheckpointStore();
  const service = new DailyOperationWorkflowService({ checkpointStore: store });

  const runs = [];

  // 1. White Scenario
  const whiteInput = {
    workspaceId: 'ws_demo',
    marketplaceId: 'AMAZON_US',
    mode: 'SKU',
    skuId: 'MTH-WHITE-001',
    dateRange: { from: '2026-03-08', to: '2026-03-14' },
    baselinePeriod: { from: '2026-03-01', to: '2026-03-07' },
  };
  const whiteRes = await service.execute(whiteInput);
  const whiteState = await store.get(whiteRes.taskId);
  const whiteStr = JSON.stringify(whiteState);
  runs.push({
    name: 'White Scenario (MTH-WHITE-001)',
    sizeBytes: Buffer.byteLength(whiteStr, 'utf8'),
    breakdown: {
      contexts: Buffer.byteLength(JSON.stringify(whiteState?.contexts ?? {}), 'utf8'),
      stepTraces: Buffer.byteLength(JSON.stringify(whiteState?.stepTraces ?? []), 'utf8'),
      signals: Buffer.byteLength(JSON.stringify(whiteState?.signals ?? []), 'utf8'),
      diagnoses: Buffer.byteLength(JSON.stringify(whiteState?.diagnoses ?? []), 'utf8'),
      actions: Buffer.byteLength(JSON.stringify(whiteState?.recommendedActions ?? []), 'utf8'),
      summary: Buffer.byteLength(JSON.stringify(whiteState?.summary ?? {}), 'utf8'),
    },
  });

  // 2. Green Scenario
  const greenInput = {
    workspaceId: 'ws_demo',
    marketplaceId: 'AMAZON_US',
    mode: 'SKU',
    skuId: 'MTH-GREEN-001',
    dateRange: { from: '2026-07-16', to: '2026-07-22' },
    baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
  };
  const greenRes = await service.execute(greenInput);
  const greenState = await store.get(greenRes.taskId);
  const greenStr = JSON.stringify(greenState);
  runs.push({
    name: 'Green Scenario (MTH-GREEN-001)',
    sizeBytes: Buffer.byteLength(greenStr, 'utf8'),
    breakdown: {
      contexts: Buffer.byteLength(JSON.stringify(greenState?.contexts ?? {}), 'utf8'),
      stepTraces: Buffer.byteLength(JSON.stringify(greenState?.stepTraces ?? []), 'utf8'),
      signals: Buffer.byteLength(JSON.stringify(greenState?.signals ?? []), 'utf8'),
      diagnoses: Buffer.byteLength(JSON.stringify(greenState?.diagnoses ?? []), 'utf8'),
      actions: Buffer.byteLength(JSON.stringify(greenState?.recommendedActions ?? []), 'utf8'),
      summary: Buffer.byteLength(JSON.stringify(greenState?.summary ?? {}), 'utf8'),
    },
  });

  // 3. Grey Scenario
  const greyInput = {
    workspaceId: 'ws_demo',
    marketplaceId: 'AMAZON_US',
    mode: 'SKU',
    skuId: 'MTH-GREY-001',
    dateRange: { from: '2026-07-16', to: '2026-07-22' },
    baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
  };
  const greyRes = await service.execute(greyInput);
  const greyState = await store.get(greyRes.taskId);
  const greyStr = JSON.stringify(greyState);
  runs.push({
    name: 'Grey Scenario (MTH-GREY-001)',
    sizeBytes: Buffer.byteLength(greyStr, 'utf8'),
    breakdown: {
      contexts: Buffer.byteLength(JSON.stringify(greyState?.contexts ?? {}), 'utf8'),
      stepTraces: Buffer.byteLength(JSON.stringify(greyState?.stepTraces ?? []), 'utf8'),
      signals: Buffer.byteLength(JSON.stringify(greyState?.signals ?? []), 'utf8'),
      diagnoses: Buffer.byteLength(JSON.stringify(greyState?.diagnoses ?? []), 'utf8'),
      actions: Buffer.byteLength(JSON.stringify(greyState?.recommendedActions ?? []), 'utf8'),
      summary: Buffer.byteLength(JSON.stringify(greyState?.summary ?? {}), 'utf8'),
    },
  });

  // 4. Workspace Mode (Multi-SKU batch)
  const wsInput = {
    workspaceId: 'ws_demo',
    marketplaceId: 'AMAZON_US',
    mode: 'WORKSPACE',
    skuIds: ['MTH-WHITE-001', 'MTH-GREEN-001', 'MTH-GREY-001'],
    dateRange: { from: '2026-07-16', to: '2026-07-22' },
    baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
  };
  const wsRes = await service.execute(wsInput);
  const wsState = await store.get(wsRes.taskId);
  const wsStr = JSON.stringify(wsState);
  runs.push({
    name: 'Workspace Mode (3 SKUs Batch)',
    sizeBytes: Buffer.byteLength(wsStr, 'utf8'),
    breakdown: {
      contexts: Buffer.byteLength(JSON.stringify(wsState?.contexts ?? {}), 'utf8'),
      stepTraces: Buffer.byteLength(JSON.stringify(wsState?.stepTraces ?? []), 'utf8'),
      signals: Buffer.byteLength(JSON.stringify(wsState?.signals ?? []), 'utf8'),
      diagnoses: Buffer.byteLength(JSON.stringify(wsState?.diagnoses ?? []), 'utf8'),
      actions: Buffer.byteLength(JSON.stringify(wsState?.recommendedActions ?? []), 'utf8'),
      summary: Buffer.byteLength(JSON.stringify(wsState?.summary ?? {}), 'utf8'),
    },
  });

  console.log('\n======================================================');
  console.log('   PREFLIGHT B: Checkpoint Payload Size Metrics');
  console.log('======================================================\n');

  const sizes = runs.map((r) => r.sizeBytes);
  sizes.sort((a, b) => a - b);
  const minSize = sizes[0];
  const maxSize = sizes[sizes.length - 1];
  const avgSize = Math.round(sizes.reduce((acc, s) => acc + s, 0) / sizes.length);
  const p95Idx = Math.min(Math.ceil(sizes.length * 0.95) - 1, sizes.length - 1);
  const p95Size = sizes[p95Idx];

  for (const r of runs) {
    console.log(`▶ ${r.name}`);
    console.log(`  Total Size: ${(r.sizeBytes / 1024).toFixed(2)} KB (${r.sizeBytes} bytes)`);
    console.log(`  Breakdown:`);
    console.log(`    - Sku360 Contexts:     ${(r.breakdown.contexts / 1024).toFixed(2)} KB (${Math.round((r.breakdown.contexts / r.sizeBytes) * 100)}%)`);
    console.log(`    - Recommended Actions: ${(r.breakdown.actions / 1024).toFixed(2)} KB (${Math.round((r.breakdown.actions / r.sizeBytes) * 100)}%)`);
    console.log(`    - Step Traces:         ${(r.breakdown.stepTraces / 1024).toFixed(2)} KB (${Math.round((r.breakdown.stepTraces / r.sizeBytes) * 100)}%)`);
    console.log(`    - Diagnoses:           ${(r.breakdown.diagnoses / 1024).toFixed(2)} KB (${Math.round((r.breakdown.diagnoses / r.sizeBytes) * 100)}%)`);
    console.log(`    - Signals:             ${(r.breakdown.signals / 1024).toFixed(2)} KB (${Math.round((r.breakdown.signals / r.sizeBytes) * 100)}%)`);
    console.log(`    - Summary:             ${(r.breakdown.summary / 1024).toFixed(2)} KB`);
    console.log('');
  }

  console.log('------------------------------------------------------');
  console.log(`Summary Statistics:`);
  console.log(`  Min Size:     ${(minSize / 1024).toFixed(2)} KB (${minSize} B)`);
  console.log(`  Average Size: ${(avgSize / 1024).toFixed(2)} KB (${avgSize} B)`);
  console.log(`  P95 Size:     ${(p95Size / 1024).toFixed(2)} KB (${p95Size} B)`);
  console.log(`  Max Size:     ${(maxSize / 1024).toFixed(2)} KB (${maxSize} B)`);
  console.log('======================================================\n');
}

measure().catch((err) => {
  console.error('Error measuring payload sizes:', err);
  process.exit(1);
});
