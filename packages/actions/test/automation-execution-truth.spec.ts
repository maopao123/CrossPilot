import { ActionRouter, ActionProposal } from '../src/index.js';
import { RpaRegistry, RpaAdapter, YingdaoRpaAdapter, MockRpaAdapter } from '@crosspilot/integrations/rpa';

describe('A1: Automation Execution Truth Tests', () => {
  const baseProposal: ActionProposal = {
    id: 'act_test_001',
    type: 'RPA',
    name: 'Amazon Listing Publish',
    description: 'Publish SKU MTH-GREEN-001',
    requiresHumanApproval: true,
    targetEntity: 'SKU',
    targetId: 'MTH-GREEN-001',
    payload: { skuCode: 'MTH-GREEN-001', price: 29.99 },
    riskLevel: 'HIGH',
    status: 'PENDING',
    createdAt: '2026-09-14T00:00:00.000Z',
  };

  describe('E01: Unregistered runtimes (API / PYTHON / BROWSER / AI)', () => {
    it.each(['API', 'PYTHON', 'BROWSER', 'AI', 'COMPUTER_USE'] as const)(
      'runtime %s returns FAILED and UNSUPPORTED, never executed=true',
      async (runtimeType) => {
        const router = new ActionRouter();
        const proposal: ActionProposal = {
          ...baseProposal,
          type: runtimeType,
        };

        const result = await router.dispatch(proposal, {
          workspaceId: 'ws_demo',
          isApproved: true,
          executionMode: 'LIVE',
        });

        expect(result.status).toBe('FAILED');
        expect(result.status).not.toBe('SUCCEEDED');
        expect(result.data?.executed).toBeUndefined();
        expect(result.error).toMatch(/UNSUPPORTED/);
        expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
        expect(result.executionEvidence?.phase).toBe('FAILED');
      },
    );
  });

  describe('E02: RPA returns FAILED / TIMEOUT / RUNNING cannot become SUCCEEDED', () => {
    it('RPA FAILED returns status FAILED, effect UNKNOWN (when after dispatch)', async () => {
      const registry = new RpaRegistry();
      const mockAdapter: RpaAdapter = {
        id: 'truth-test-failed',
        name: 'Failed RPA',
        execute: async () => ({
          jobId: 'job_fail_01',
          status: 'FAILED',
          error: 'Element not found on Seller Central page',
          durationMs: 50,
        }),
      };
      registry.register(mockAdapter);

      const router = new ActionRouter(registry);
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'truth-test-failed',
      });

      expect(result.status).toBe('FAILED');
      expect(result.status).not.toBe('SUCCEEDED');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.phase).toBe('FAILED');
    });

    it('RPA TIMEOUT returns status FAILED, effect UNKNOWN, recovery QUERY when getStatus available', async () => {
      const registry = new RpaRegistry();
      const mockAdapter: RpaAdapter = {
        id: 'truth-test-timeout',
        name: 'Timeout RPA',
        getStatus: async (id) => ({ jobId: id, status: 'RUNNING', durationMs: 1 }),
        execute: async () => ({
          jobId: 'job_timeout_01',
          status: 'TIMEOUT',
          error: 'RPA worker execution timed out',
          durationMs: 30000,
        }),
      };
      registry.register(mockAdapter);

      const router = new ActionRouter(registry);
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'truth-test-timeout',
      });

      expect(result.status).toBe('FAILED');
      expect(result.status).not.toBe('SUCCEEDED');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.recovery).toBe('QUERY');
      expect(result.executionEvidence?.externalId).toBe('job_timeout_01');
    });

    it('RPA RUNNING returns status RUNNING, effect UNKNOWN, recovery QUERY when getStatus available', async () => {
      const registry = new RpaRegistry();
      const mockAdapter: RpaAdapter = {
        id: 'truth-test-running',
        name: 'Running RPA',
        getStatus: async (id) => ({ jobId: id, status: 'RUNNING', durationMs: 1 }),
        execute: async () => ({
          jobId: 'job_running_01',
          status: 'RUNNING',
          durationMs: 100,
        }),
      };
      registry.register(mockAdapter);

      const router = new ActionRouter(registry);
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'truth-test-running',
      });

      expect(result.status).toBe('RUNNING');
      expect(result.status).not.toBe('SUCCEEDED');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.phase).toBe('SUBMITTED');
      expect(result.executionEvidence?.recovery).toBe('QUERY');
      expect(result.executionEvidence?.externalId).toBe('job_running_01');
    });

    it('RPA adapter throwing an exception during execution returns FAILED with effect UNKNOWN (not NOT_APPLIED)', async () => {
      const registry = new RpaRegistry();
      const throwingAdapter: RpaAdapter = {
        id: 'truth-test-throw',
        name: 'Throwing RPA',
        execute: async () => {
          throw new Error('Process crashed unexpectedly');
        },
      };
      registry.register(throwingAdapter);

      const router = new ActionRouter(registry);
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'truth-test-throw',
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Process crashed unexpectedly');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.phase).toBe('FAILED');
    });
  });

  describe('G1-R01 & G1-R02: Adapter Credentials, Mode Isolation, and Remote Verification', () => {
    it('Yingdao adapter without API key in LIVE mode returns AUTH_REQUIRED and does not fallback to Mock', async () => {
      const originalKey = process.env.YINGDAO_API_KEY;
      delete process.env.YINGDAO_API_KEY;
      try {
        const yingdao = new YingdaoRpaAdapter({ apiKey: '' });
        const res = await yingdao.execute({
          workflow: 'test',
          params: {},
        });

        expect(res.status).toBe('FAILED');
        expect(res.error).toMatch(/AUTH_REQUIRED/);
      } finally {
        if (originalKey !== undefined) process.env.YINGDAO_API_KEY = originalKey;
      }
    });

    it('Yingdao has no fake getStatus/cancel stubs so recovery truthfully maps to MANUAL', () => {
      const yingdao = new YingdaoRpaAdapter();
      expect((yingdao as any).getStatus).toBeUndefined();
      expect((yingdao as any).cancel).toBeUndefined();
    });

    it('ActionRouter in LIVE mode refuses to silently run mock-rpa', async () => {
      const router = new ActionRouter(); // default registry
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
      });

      // In LIVE mode without live credentials, it must fail, not return mock success
      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.mode).toBe('LIVE');
    });

    it('ActionRouter in MOCK mode rejects live adapter before execution (calls=0)', async () => {
      let liveCalls = 0;
      const liveAdapter: RpaAdapter = {
        id: 'yingdao-rpa',
        name: 'Live Adapter',
        supportedModes: ['LIVE'],
        execute: async () => {
          liveCalls++;
          return { jobId: 'live_1', status: 'SUCCESS', durationMs: 1 };
        },
      };
      const registry = new RpaRegistry();
      registry.register(liveAdapter);

      const router = new ActionRouter(registry);
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'MOCK',
        providerId: 'yingdao-rpa',
      });

      expect(liveCalls).toBe(0);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('INVALID_MODE');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });

    it('ActionRouter in SIMULATOR mode rejects when no simulator adapter is available (calls=0)', async () => {
      const router = new ActionRouter();
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'SIMULATOR',
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('UNSUPPORTED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });

    it('ActionRouter in SIMULATOR mode preserves mode=SIMULATOR on success', async () => {
      let simCalls = 0;
      const simAdapter: RpaAdapter = {
        id: 'truth-sim',
        name: 'Truth Simulator',
        supportedModes: ['SIMULATOR'],
        execute: async () => {
          simCalls++;
          return { jobId: 'sim_1', status: 'SUCCESS', durationMs: 1 };
        },
      };
      const registry = new RpaRegistry();
      registry.register(simAdapter);
      const router = new ActionRouter(registry);

      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'SIMULATOR',
        providerId: 'truth-sim',
      });

      expect(simCalls).toBe(1);
      expect(result.status).toBe('SUCCEEDED');
      expect(result.executionEvidence?.mode).toBe('SIMULATOR');
      expect(result.executionEvidence?.effect).toBe('APPLIED');
    });

    it('ActionRouter in explicit MOCK mode runs Mock adapter and marks isMock=true', async () => {
      const router = new ActionRouter();
      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'MOCK',
        providerId: 'mock-rpa',
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.isMock).toBe(true);
      expect(result.executionEvidence?.mode).toBe('MOCK');
    });

    it('Remote HTTP 200 with RUNNING or empty body does NOT become SUCCEEDED / APPLIED', async () => {
      const originalFetch = global.fetch;
      try {
        // Test 1: remote returned 200 with RUNNING
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ jobId: 'accepted-job', status: 'RUNNING' }),
        } as any);

        const registry = new RpaRegistry();
        registry.register(new YingdaoRpaAdapter({ apiKey: 'test-key', apiBaseUrl: 'https://test.invalid' }));
        const router = new ActionRouter(registry);

        const resultRunning = await router.dispatch(baseProposal, {
          workspaceId: 'ws_demo',
          isApproved: true,
          executionMode: 'LIVE',
          providerId: 'yingdao-rpa',
        });

        expect(resultRunning.status).toBe('RUNNING');
        expect(resultRunning.executionEvidence?.effect).toBe('UNKNOWN');
        expect(resultRunning.executionEvidence?.effect).not.toBe('APPLIED');

        // Test 2: remote returned 200 with empty body {}
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as any);

        const resultEmpty = await router.dispatch(baseProposal, {
          workspaceId: 'ws_demo',
          isApproved: true,
          executionMode: 'LIVE',
          providerId: 'yingdao-rpa',
        });

        expect(resultEmpty.status).toBe('FAILED');
        expect(resultEmpty.executionEvidence?.effect).not.toBe('APPLIED');
        expect(resultEmpty.executionEvidence?.externalId).toBeUndefined();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('G1-R03 & G1-R04: Uncertainty Handling and Idempotency Cache Boundaries', () => {
    it('Network failure / socket closed after request sent produces effect UNKNOWN', async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = jest.fn().mockRejectedValue(new Error('socket closed after request was sent'));

        const registry = new RpaRegistry();
        registry.register(new YingdaoRpaAdapter({ apiKey: 'test-key', apiBaseUrl: 'https://test.invalid' }));
        const router = new ActionRouter(registry);

        const result = await router.dispatch(baseProposal, {
          workspaceId: 'ws_demo',
          isApproved: true,
          executionMode: 'LIVE',
          providerId: 'yingdao-rpa',
        });

        expect(result.status).toBe('FAILED');
        expect(result.executionEvidence?.effect).toBe('UNKNOWN');
        expect(result.executionEvidence?.recovery).toBe('MANUAL');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('Bare SUCCESS in LIVE mode without verification evidence does not claim effect APPLIED', async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ status: 'SUCCESS' }),
        } as any);

        const registry = new RpaRegistry();
        registry.register(new YingdaoRpaAdapter({ apiKey: 'test-key', apiBaseUrl: 'https://test.invalid' }));
        const router = new ActionRouter(registry);

        const result = await router.dispatch(baseProposal, {
          workspaceId: 'ws_demo',
          isApproved: true,
          executionMode: 'LIVE',
          providerId: 'yingdao-rpa',
        });

        expect(result.executionEvidence?.effect).not.toBe('APPLIED');
        expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('Remote CANCELLED / post-dispatch failure with externalId produces effect UNKNOWN (not NOT_APPLIED)', async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ jobId: 'remote-job', status: 'CANCELLED' }),
        } as any);

        const registry = new RpaRegistry();
        registry.register(new YingdaoRpaAdapter({ apiKey: 'test-key', apiBaseUrl: 'https://test.invalid' }));
        const router = new ActionRouter(registry);

        const result = await router.dispatch(baseProposal, {
          workspaceId: 'ws_demo',
          isApproved: true,
          executionMode: 'LIVE',
          providerId: 'yingdao-rpa',
        });

        expect(result.status).toBe('FAILED');
        expect(result.executionEvidence?.effect).toBe('UNKNOWN');
        expect(result.executionEvidence?.effect).not.toBe('NOT_APPLIED');
        expect(result.executionEvidence?.externalId).toBe('remote-job');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('AUTH_REQUIRED failure is NOT permanently cached and allows recovery retry', async () => {
      let callCount = 0;
      const changingAdapter: RpaAdapter = {
        id: 'recovering-provider',
        name: 'Recovering Provider',
        supportedModes: ['LIVE'],
        execute: async () => {
          callCount++;
          if (callCount === 1) {
            return { jobId: '', status: 'FAILED', error: 'AUTH_REQUIRED: token expired', durationMs: 1 };
          }
          return { jobId: 'job-recovered', status: 'SUCCESS', output: { verified: true }, durationMs: 1 };
        },
      };

      const registry = new RpaRegistry();
      registry.register(changingAdapter);
      const router = new ActionRouter(registry);
      const opCtx = {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE' as const,
        providerId: 'recovering-provider',
        operationId: 'retryable-op-001',
      };

      const res1 = await router.dispatch(baseProposal, opCtx);
      expect(res1.status).toBe('FAILED');
      expect(callCount).toBe(1);

      // Second attempt with same operationId after credentials recovered
      const res2 = await router.dispatch(baseProposal, opCtx);
      expect(callCount).toBe(2);
      expect(res2.status).toBe('SUCCEEDED');
      expect(res2.executionEvidence?.externalId).toBe('job-recovered');
    });

    it('Cache cannot replay when parameters, mode, actionId, or approval differ', async () => {
      const router = new ActionRouter();
      const opId = 'param-sensitive-op';

      // 1. Initial success in MOCK mode
      const res1 = await router.dispatch(baseProposal, {
        workspaceId: 'ws_1',
        isApproved: true,
        executionMode: 'MOCK',
        providerId: 'mock-rpa',
        operationId: opId,
      });
      expect(res1.status).toBe('SUCCEEDED');

      // 2. Same operationId, but isApproved=false -> Human gate MUST intercept
      const resUnapproved = await router.dispatch(baseProposal, {
        workspaceId: 'ws_1',
        isApproved: false,
        executionMode: 'MOCK',
        providerId: 'mock-rpa',
        operationId: opId,
      });
      expect(resUnapproved.status).toBe('WAITING_APPROVAL');

      // 3. Same operationId, but different payload -> Idempotency conflict
      const resDiffPayload = await router.dispatch(
        { ...baseProposal, payload: { price: 999.99 } },
        {
          workspaceId: 'ws_1',
          isApproved: true,
          executionMode: 'MOCK',
          providerId: 'mock-rpa',
          operationId: opId,
        },
      );
      expect(resDiffPayload.status).toBe('FAILED');
      expect(resDiffPayload.error).toMatch(/IDEMPOTENCY_CONFLICT/);

      // 4. Same operationId, but different workspace -> Tenant isolation
      const resOtherWs = await router.dispatch(baseProposal, {
        workspaceId: 'ws_2',
        isApproved: false,
        executionMode: 'MOCK',
        providerId: 'mock-rpa',
        operationId: opId,
      });
      expect(resOtherWs.status).toBe('WAITING_APPROVAL');

      // 5. Same operationId, but different targetId -> Idempotency conflict
      const resDiffTarget = await router.dispatch(
        { ...baseProposal, targetId: 'different-sku-id' },
        {
          workspaceId: 'ws_1',
          isApproved: true,
          executionMode: 'MOCK',
          providerId: 'mock-rpa',
          operationId: opId,
        },
      );
      expect(resDiffTarget.status).toBe('FAILED');
      expect(resDiffTarget.error).toMatch(/IDEMPOTENCY_CONFLICT/);

      // 6. Same operationId, but different providerId -> Idempotency conflict
      const resDiffProvider = await router.dispatch(baseProposal, {
        workspaceId: 'ws_1',
        isApproved: true,
        executionMode: 'MOCK',
        providerId: 'another-provider',
        operationId: opId,
      });
      expect(resDiffProvider.status).toBe('FAILED');
      expect(resDiffProvider.error).toMatch(/IDEMPOTENCY_CONFLICT/);

      // 7. Same operationId, but different runtime type -> Idempotency conflict
      const resDiffRuntime = await router.dispatch(
        { ...baseProposal, type: 'API' },
        {
          workspaceId: 'ws_1',
          isApproved: true,
          executionMode: 'MOCK',
          providerId: 'mock-rpa',
          operationId: opId,
        },
      );
      expect(resDiffRuntime.status).toBe('FAILED');
      expect(resDiffRuntime.error).toMatch(/IDEMPOTENCY_CONFLICT/);
    });
  });
});
