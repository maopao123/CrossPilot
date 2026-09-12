/**
 * Epic 3 Phase 9: Performance Smoke & Payload Measurement Script (.cjs)
 */

const {
  DailyOperationWorkflowService,
  InMemoryWorkflowCheckpointStore,
} = require('../packages/domain/dist/index.js');

async function runPerformanceSmoke() {
  console.log('===============================================================');
  console.log('  CrossPilot V9 Epic 3: Performance Smoke & Payload Audit');
  console.log('===============================================================\n');

  const store = new InMemoryWorkflowCheckpointStore();
  const service = new DailyOperationWorkflowService({ checkpointStore: store });

  const latencies = [];
  const payloads = [];

  // Helper for performance measurement
  async function timeIt(label, fn) {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    latencies.push({ label, ms: Math.round(ms * 100) / 100 });
    return result;
  }

  // 1. Single SKU Workflow Duration (White SKU)
  const whiteRes = await timeIt('Single SKU Workflow (MTH-WHITE-001)', async () => {
    return service.execute({
      workspaceId: 'ws_perf',
      marketplaceId: 'AMAZON_US',
      mode: 'SKU',
      skuId: 'MTH-WHITE-001',
      dateRange: { from: '2026-08-10', to: '2026-08-16' },
      baselinePeriod: { from: '2026-08-03', to: '2026-08-09' },
    });
  });

  // 2. Single SKU Workflow Duration (Green SKU)
  const greenRes = await timeIt('Single SKU Workflow (MTH-GREEN-001)', async () => {
    return service.execute({
      workspaceId: 'ws_perf',
      marketplaceId: 'AMAZON_US',
      mode: 'SKU',
      skuId: 'MTH-GREEN-001',
      dateRange: { from: '2026-07-16', to: '2026-07-22' },
      baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
    });
  });

  // 3. 3-SKU Workspace Workflow Duration
  const wsRes = await timeIt('3-SKU Workspace Workflow (Batch Aggregation)', async () => {
    return service.execute({
      workspaceId: 'ws_perf',
      marketplaceId: 'AMAZON_US',
      mode: 'WORKSPACE',
      dateRange: { from: '2026-07-16', to: '2026-07-22' },
      baselinePeriod: { from: '2026-07-09', to: '2026-07-15' },
    });
  });

  // 4. Checkpoint Read Latency
  await timeIt('Checkpoint State Read (taskId lookup)', async () => {
    return store.get(wsRes.taskId);
  });

  // 5. Approval Decision Latency
  const wsState = await store.get(wsRes.taskId);
  const targetAction = wsState.recommendedActions.find((a) => a.status === 'PROPOSED');
  if (targetAction) {
    await timeIt('Approval Decision (approveAction)', async () => {
      return service.approveAction(wsRes.taskId, targetAction.actionId, {
        operatorId: 'perf_user',
        expectedVersion: wsState.checkpointVersion,
        note: 'Performance smoke approve',
      });
    });
  }

  // 6. Resume Latency
  await timeIt('Resume Workflow Execution', async () => {
    return service.resume(wsRes.taskId);
  });

  // Measure Payload Sizes
  const whiteState = await store.get(whiteRes.taskId);
  const greenState = await store.get(greenRes.taskId);
  const finalWsState = await store.get(wsRes.taskId);

  payloads.push({
    name: 'White SKU Full State',
    sizeBytes: Buffer.byteLength(JSON.stringify(whiteState), 'utf8'),
  });
  payloads.push({
    name: 'Green SKU Full State',
    sizeBytes: Buffer.byteLength(JSON.stringify(greenState), 'utf8'),
  });
  payloads.push({
    name: '3-SKU Workspace Full State',
    sizeBytes: Buffer.byteLength(JSON.stringify(finalWsState), 'utf8'),
  });

  // Display Results
  console.log('---------------------------------------------------------------');
  console.log('  1. Latency Measurements:');
  console.log('---------------------------------------------------------------');
  latencies.forEach((l) => {
    console.log(`  - ${l.label.padEnd(45)}: ${l.ms} ms`);
  });

  console.log('\n---------------------------------------------------------------');
  console.log('  2. Checkpoint Serialization Sizes:');
  console.log('---------------------------------------------------------------');
  payloads.forEach((p) => {
    const kb = (p.sizeBytes / 1024).toFixed(2);
    console.log(`  - ${p.name.padEnd(35)}: ${p.sizeBytes} bytes (${kb} KB)`);
  });
  console.log('\n===============================================================\n');
}

runPerformanceSmoke().catch(console.error);
