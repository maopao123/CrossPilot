// Independent Batch B review probes for approval hardening, CAS concurrency, and crash recovery.
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

const rows = [];
function record(id, actual, pass) {
  rows.push({ id, actual, pass });
}

async function main() {
  const { OperationAutomationService } = require(path.join(root, 'apps/api/dist/modules/operation-automation/operation-automation.service.js'));
  const { BadRequestException, ConflictException } = require(path.join(root, 'apps/api/node_modules/@nestjs/common'));

  // 1. Probe B-ACTION-TYPE-MISMATCH
  {
    const approvalStore = new Map();
    const fakeApproval = {
      id: 'appr-mismatch-1',
      workspaceId: 'ws-b',
      actionType: 'PO_SUBMIT', // Mismatch!
      targetType: 'SKU',
      targetId: 'SKU-001',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-001', price: 29.99 }),
      status: 'PENDING',
    };
    approvalStore.set(fakeApproval.id, fakeApproval);

    const mockPrisma = {
      approval: {
        findFirst: async () => ({ ...fakeApproval }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ...fakeApproval }),
      },
    };

    const service = new OperationAutomationService(mockPrisma, { executeTool: async () => ({ success: true }) });
    let errorThrown = null;
    try {
      await service.approveAndExecute('appr-mismatch-1', 'ws-b', 'user-1');
    } catch (e) {
      errorThrown = e;
    }

    const isBadRequest = errorThrown instanceof BadRequestException && errorThrown.message.includes('APPROVAL_ACTION_TYPE_MISMATCH');
    record('B-ACTION-TYPE-MISMATCH', { error: errorThrown?.message, status: errorThrown?.getStatus?.() }, isBadRequest);
  }

  // 2. Probe B-TARGET-ID-MISMATCH
  {
    const fakeApproval = {
      id: 'appr-target-mismatch',
      workspaceId: 'ws-b',
      actionType: 'LISTING_PUBLISH',
      targetType: 'SKU',
      targetId: 'SKU-INCORRECT',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-ACTUAL', price: 29.99 }),
      status: 'PENDING',
    };

    const mockPrisma = {
      approval: {
        findFirst: async () => ({ ...fakeApproval }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ...fakeApproval }),
      },
    };

    const service = new OperationAutomationService(mockPrisma, { executeTool: async () => ({ success: true }) });
    let errorThrown = null;
    try {
      await service.approveAndExecute('appr-target-mismatch', 'ws-b', 'user-1');
    } catch (e) {
      errorThrown = e;
    }

    const isBadRequest = errorThrown instanceof BadRequestException && errorThrown.message.includes('APPROVAL_TARGET_MISMATCH');
    record('B-TARGET-ID-MISMATCH', { error: errorThrown?.message, status: errorThrown?.getStatus?.() }, isBadRequest);
  }

  // 3. Probe B-CONCURRENT-CAS-409
  {
    let currentStatus = 'PENDING';
    let updateManyCalls = 0;

    const fakeApproval = {
      id: 'appr-cas-1',
      workspaceId: 'ws-b',
      actionType: 'LISTING_PUBLISH',
      targetType: 'SKU',
      targetId: 'SKU-001',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-001', price: 29.99 }),
      status: 'PENDING',
    };

    const mockPrisma = {
      approval: {
        findFirst: async () => ({ ...fakeApproval, status: currentStatus }),
        updateMany: async ({ where, data }) => {
          updateManyCalls++;
          if (where.status === 'PENDING' && currentStatus === 'PENDING') {
            currentStatus = 'APPROVED';
            return { count: 1 };
          }
          return { count: 0 };
        },
        update: async () => ({ ...fakeApproval }),
      },
    };

    const service = new OperationAutomationService(mockPrisma, { executeTool: async () => ({ success: true }) });
    service.actionRouter = { dispatch: async () => ({ status: 'SUCCEEDED' }) };

    // Fire 10 parallel calls
    const calls = Array.from({ length: 10 }, () =>
      service.approveAndExecute('appr-cas-1', 'ws-b', 'user-1')
    );

    const results = await Promise.allSettled(calls);
    const passed = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    const all409 = rejected.every((r) => r.reason instanceof ConflictException && r.reason.getStatus() === 409);

    record('B-CONCURRENT-CAS-409', {
      total: results.length,
      passed: passed.length,
      rejected: rejected.length,
      all409,
    }, passed.length === 1 && rejected.length === 9 && all409);
  }

  // 4. Probe B-CRASH-RECOVERY-TRACKING
  {
    let commentSaved = null;
    const fakeApproval = {
      id: 'appr-crash-1',
      workspaceId: 'ws-b',
      actionType: 'LISTING_PUBLISH',
      targetType: 'SKU',
      targetId: 'SKU-001',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-001', price: 29.99 }),
      status: 'PENDING',
    };

    const mockPrisma = {
      approval: {
        findFirst: async () => ({ ...fakeApproval }),
        updateMany: async ({ data }) => {
          commentSaved = data.comment;
          return { count: 1 };
        },
        findMany: async () => [{ ...fakeApproval, status: 'APPROVED', comment: commentSaved }],
      },
    };

    const service = new OperationAutomationService(mockPrisma, { executeTool: async () => ({ success: true }) });
    service.actionRouter = {
      dispatch: async () => {
        // Crash before dispatch completes
        throw new Error('SERVER_CRASH_SIMULATION');
      },
    };

    let dispatchCrashed = false;
    let caughtError = null;
    try {
      await service.approveAndExecute('appr-crash-1', 'ws-b', 'user-1');
    } catch (e) {
      caughtError = e?.message || String(e);
      dispatchCrashed = e?.message === 'SERVER_CRASH_SIMULATION';
    }

    const pendingDispatches = await service.listPendingDispatches('ws-b');
    record('B-CRASH-RECOVERY-TRACKING', {
      dispatchCrashed,
      caughtError,
      commentSaved,
      pendingDispatchesCount: pendingDispatches.length,
    }, dispatchCrashed && commentSaved?.includes('PENDING_DISPATCH'));
  }

  // 5. Probe B-MOCK-RPA-ISOLATION
  {
    let dispatchedContext = null;
    const fakeApproval = {
      id: 'appr-mock-iso',
      workspaceId: 'ws-b',
      actionType: 'LISTING_PUBLISH',
      targetType: 'SKU',
      targetId: 'SKU-001',
      requestedPayload: JSON.stringify({ skuCode: 'SKU-001', price: 29.99 }),
      status: 'PENDING',
    };

    const mockPrisma = {
      approval: {
        findFirst: async () => ({ ...fakeApproval }),
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ ...fakeApproval }),
      },
    };

    const service = new OperationAutomationService(mockPrisma, { executeTool: async () => ({ success: true }) });
    service.actionRouter = {
      dispatch: async (proposal, ctx) => {
        dispatchedContext = ctx;
        return { status: 'SUCCEEDED' };
      },
    };

    await service.approveAndExecute('appr-mock-iso', 'ws-b', 'user-1');
    record('B-MOCK-RPA-ISOLATION', {
      executionMode: dispatchedContext?.executionMode,
      providerId: dispatchedContext?.providerId,
      isApproved: dispatchedContext?.isApproved,
    }, dispatchedContext?.executionMode === 'MOCK' && dispatchedContext?.providerId === 'mock-rpa');
  }

  const passCount = rows.filter((r) => r.pass).length;
  const failCount = rows.filter((r) => !r.pass).length;
  const summary = {
    total: rows.length,
    pass: passCount,
    fail: failCount,
    probes: rows,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = failCount > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
