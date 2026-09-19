import {
  normalizeExecutionError,
  ExecutionErrorClass,
  NormalizedExecutionError,
} from '@crosspilot/shared';
import { HttpERPAdapter, PlaywrightRpaAdapter } from '@crosspilot/integrations';
import { ActionRouter, ActionProposal } from '../src/index.js';

describe('Phase 1: Unified Execution Error Classification Tests', () => {
  describe('1. normalizeExecutionError Core Mapping Matrix', () => {
    it('1.1 maps HTTP 429 to RATE_LIMIT (retryable=true)', () => {
      const err = { status: 429, message: 'Too Many Requests' };
      const normalized = normalizeExecutionError(err, { provider: 'shopify' });
      expect(normalized.class).toBe('RATE_LIMIT');
      expect(normalized.retryable).toBe(true);
      expect(normalized.originalStatus).toBe(429);
      expect(normalized.provider).toBe('shopify');
    });

    it('1.2 maps HTTP 500, 502, 503 to TRANSIENT (retryable=true)', () => {
      for (const status of [500, 502, 503]) {
        const err = { statusCode: status, errorMessage: `Server Error ${status}` };
        const normalized = normalizeExecutionError(err, { provider: 'erp' });
        expect(normalized.class).toBe('TRANSIENT');
        expect(normalized.retryable).toBe(true);
        expect(normalized.originalStatus).toBe(status);
      }
    });

    it('1.3 maps network disconnects (ECONNRESET, fetch failed, socket hang up) to TRANSIENT (retryable=true)', () => {
      const econnresetErr = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
      const norm1 = normalizeExecutionError(econnresetErr, { provider: 'http' });
      expect(norm1.class).toBe('TRANSIENT');
      expect(norm1.retryable).toBe(true);
      expect(norm1.code).toBe('ECONNRESET');

      const fetchFailedErr = new Error('TypeError: fetch failed');
      const norm2 = normalizeExecutionError(fetchFailedErr);
      expect(norm2.class).toBe('TRANSIENT');
      expect(norm2.retryable).toBe(true);

      const socketHangUpErr = new Error('socket hang up');
      const norm3 = normalizeExecutionError(socketHangUpErr);
      expect(norm3.class).toBe('TRANSIENT');
      expect(norm3.retryable).toBe(true);
    });

    it('1.4 maps timeouts (AbortError, ETIMEDOUT, timeout message) to TIMEOUT (retryable=false)', () => {
      const abortErr = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
      const norm1 = normalizeExecutionError(abortErr);
      expect(norm1.class).toBe('TIMEOUT');
      expect(norm1.retryable).toBe(false); // Invariant: unknown side effect must not blindly retry

      const etimedoutErr = Object.assign(new Error('connect ETIMEDOUT 127.0.0.1:9099'), { code: 'ETIMEDOUT' });
      const norm2 = normalizeExecutionError(etimedoutErr);
      expect(norm2.class).toBe('TIMEOUT');
      expect(norm2.retryable).toBe(false);

      const pageTimeoutErr = new Error('page.waitForSelector: Timeout 30000ms exceeded');
      const norm3 = normalizeExecutionError(pageTimeoutErr);
      expect(norm3.class).toBe('TIMEOUT');
      expect(norm3.retryable).toBe(false);
    });

    it('1.5 maps HTTP 401 / AUTH_REQUIRED / Token expired to AUTH (retryable=false)', () => {
      const err401 = { status: 401, message: 'Invalid API key or token expired' };
      const norm1 = normalizeExecutionError(err401);
      expect(norm1.class).toBe('AUTH');
      expect(norm1.retryable).toBe(false);

      const errCode = new Error('AUTH_REQUIRED: session token revoked');
      const norm2 = normalizeExecutionError(errCode);
      expect(norm2.class).toBe('AUTH');
      expect(norm2.code).toBe('AUTH_REQUIRED');
      expect(norm2.retryable).toBe(false);
    });

    it('1.6 maps HTTP 403 / FORBIDDEN / WRITE_FORBIDDEN to PERMISSION (retryable=false)', () => {
      const err403 = { status: 403, message: 'Access denied: insufficient permissions' };
      const norm1 = normalizeExecutionError(err403);
      expect(norm1.class).toBe('PERMISSION');
      expect(norm1.retryable).toBe(false);

      const errForbidden = new Error('WRITE_FORBIDDEN: demo templates cannot be written');
      const norm2 = normalizeExecutionError(errForbidden, { code: 'WRITE_FORBIDDEN' });
      expect(norm2.class).toBe('PERMISSION');
      expect(norm2.code).toBe('WRITE_FORBIDDEN');
      expect(norm2.retryable).toBe(false);
    });

    it('1.7 maps HTTP 400 / VALIDATION_ERROR / CONFIG_ERROR to VALIDATION (retryable=false)', () => {
      const err400 = { status: 400, message: 'Invalid input parameters' };
      const norm1 = normalizeExecutionError(err400);
      expect(norm1.class).toBe('VALIDATION');
      expect(norm1.retryable).toBe(false);

      const configErr = new Error('CONFIG_ERROR: adapter requires baseUrl');
      const norm2 = normalizeExecutionError(configErr);
      expect(norm2.class).toBe('VALIDATION');
      expect(norm2.code).toBe('CONFIG_ERROR');
      expect(norm2.retryable).toBe(false);
    });

    it('1.8 maps HTTP 404 / NOT_FOUND to NOT_FOUND (retryable=false)', () => {
      const err404 = { status: 404, message: 'Order PO-999 not found' };
      const norm1 = normalizeExecutionError(err404);
      expect(norm1.class).toBe('NOT_FOUND');
      expect(norm1.retryable).toBe(false);

      const notFoundErr = { errorCode: 'NOT_FOUND', errorMessage: 'Purchase order does not exist' };
      const norm2 = normalizeExecutionError(notFoundErr);
      expect(norm2.class).toBe('NOT_FOUND');
      expect(norm2.retryable).toBe(false);
    });

    it('1.9 maps HTTP 409 / CONFLICT / IDEMPOTENCY_KEY_IN_PROGRESS to CONFLICT (retryable=false)', () => {
      const err409 = { status: 409, message: 'Conflict: idempotency key already claimed' };
      const norm1 = normalizeExecutionError(err409);
      expect(norm1.class).toBe('CONFLICT');
      expect(norm1.retryable).toBe(false);

      const conflictErr = { code: 'IDEMPOTENCY_CONFLICT', message: 'Concurrent request in flight' };
      const norm2 = normalizeExecutionError(conflictErr);
      expect(norm2.class).toBe('CONFLICT');
      expect(norm2.retryable).toBe(false);
    });

    it('1.10 maps RPA selector missing / waiting for locator to RPA_SELECTOR (retryable=false)', () => {
      const selectorErr = new Error('page.click: waiting for locator("#save-button") failed, element not found');
      const norm = normalizeExecutionError(selectorErr);
      expect(norm.class).toBe('RPA_SELECTOR');
      expect(norm.retryable).toBe(false);
    });

    it('1.11 maps RPA navigation failed / net::ERR_ to RPA_NAVIGATION (retryable=false)', () => {
      const navErr = new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://sellercentral.amazon.com');
      const norm = normalizeExecutionError(navErr);
      expect(norm.class).toBe('RPA_NAVIGATION');
      expect(norm.retryable).toBe(false);
    });

    it('1.12 maps remote payload / readback mismatch to VERIFY_MISMATCH (retryable=false)', () => {
      const mismatchErr = new Error('Remote payload mismatch: totalAmountMinor local=1000 vs remote=2000');
      const norm = normalizeExecutionError(mismatchErr, { code: 'REMOTE_PAYLOAD_MISMATCH' });
      expect(norm.class).toBe('VERIFY_MISMATCH');
      expect(norm.retryable).toBe(false);
    });

    it('1.13 maps unknown errors to UNKNOWN fallback', () => {
      const unknownErr = new Error('Something completely unexpected occurred');
      const norm = normalizeExecutionError(unknownErr);
      expect(norm.class).toBe('UNKNOWN');
      expect(norm.code).toBe('UNKNOWN_ERROR');
      expect(norm.retryable).toBe(false);
    });

    it('1.14 is idempotent when re-normalizing an already normalized error', () => {
      const original: NormalizedExecutionError = {
        class: 'RATE_LIMIT',
        code: 'RATE_LIMITED',
        message: 'Throttled by remote Shopify API',
        retryable: true,
        provider: 'shopify',
        originalStatus: 429,
      };
      const passThrough = normalizeExecutionError(original);
      expect(passThrough).toEqual(original);
    });
  });

  describe('2. HttpERPAdapter Integration with NormalizedExecutionError', () => {
    let fetchSpy: jest.SpyInstance;

    afterEach(() => {
      if (fetchSpy) {
        fetchSpy.mockRestore();
      }
    });

    it('attaches normalizedError on HTTP 404 response', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Order not found' }),
        text: async () => JSON.stringify({ error: 'Order not found' }),
      } as any);

      const adapter = new HttpERPAdapter({ baseUrl: 'http://127.0.0.1:9099' });
      const res = await adapter.getPurchaseOrder({
        scope: { workspaceId: 'ws_demo' },
        operationId: 'op_test_404',
      });

      expect(res.success).toBe(false);
      expect(res.normalizedError).toBeDefined();
      expect(res.normalizedError?.class).toBe('NOT_FOUND');
      expect(res.normalizedError?.retryable).toBe(false);
      expect(res.normalizedError?.originalStatus).toBe(404);
    });

    it('attaches normalizedError on HTTP 500 response', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Database Crash' }),
        text: async () => JSON.stringify({ error: 'Internal Database Crash' }),
      } as any);

      const adapter = new HttpERPAdapter({ baseUrl: 'http://127.0.0.1:9099' });
      const res = await adapter.createPurchaseOrder({
        scope: { workspaceId: 'ws_demo' },
        operationId: 'op_test_500',
        idempotencyKey: 'idem_500',
        supplierId: 'SUP-01',
        lines: [],
      });

      expect(res.success).toBe(false);
      expect(res.normalizedError).toBeDefined();
      expect(res.normalizedError?.class).toBe('TRANSIENT');
      expect(res.normalizedError?.retryable).toBe(true);
      expect(res.normalizedError?.originalStatus).toBe(500);
    });

    it('attaches normalizedError on network fetch exception', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('fetch failed: ECONNREFUSED 127.0.0.1:9099'),
      );

      const adapter = new HttpERPAdapter({ baseUrl: 'http://127.0.0.1:9099' });
      const res = await adapter.getPurchaseOrder({
        scope: { workspaceId: 'ws_demo' },
        operationId: 'op_test_network',
      });

      expect(res.success).toBe(false);
      expect(res.normalizedError).toBeDefined();
      expect(res.normalizedError?.class).toBe('TRANSIENT');
      expect(res.normalizedError?.retryable).toBe(true);
    });
  });

  describe('3. PlaywrightRpaAdapter Integration with NormalizedExecutionError', () => {
    it('attaches normalizedError on missing or invalid configuration', async () => {
      const adapter = new PlaywrightRpaAdapter({ baseUrl: '' });
      const res = await adapter.execute({
        workflow: 'UPDATE_LISTING',
        params: { skuCode: 'SKU-001', price: 10, baseUrl: 'http://untrusted-domain.com' },
      });

      expect(res.status).toBe('FAILED');
      expect(res.normalizedError).toBeDefined();
      expect(res.normalizedError?.class).toBe('VALIDATION');
      expect(res.normalizedError?.code).toBe('CONFIG_ERROR');
      expect(res.normalizedError?.retryable).toBe(false);
    });
  });

  describe('4. ActionRouter Integration with NormalizedExecutionError', () => {
    const baseProposal: ActionProposal = {
      id: 'act_norm_001',
      type: 'RPA',
      name: 'Amazon Listing Publish',
      description: 'Publish SKU',
      requiresHumanApproval: true,
      targetEntity: 'SKU',
      targetId: 'SKU-NORM-001',
      payload: { skuCode: 'SKU-NORM-001', price: 39.99 },
      riskLevel: 'HIGH',
      status: 'PENDING',
      createdAt: '2026-09-19T00:00:00.000Z',
    };

    it('populates normalizedError and errorClass on preflight target mismatch', async () => {
      const router = new ActionRouter();
      const mismatchedProposal: ActionProposal = {
        ...baseProposal,
        payload: { skuCode: 'DIFFERENT-SKU-999', price: 39.99 },
      };
      const result = await router.dispatch(mismatchedProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      expect(result.normalizedError).toBeDefined();
      expect(result.normalizedError?.class).toBe('VERIFY_MISMATCH');
      expect(result.executionEvidence?.errorClass).toBe('VERIFY_MISMATCH');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });

    it('populates normalizedError and errorClass on payload tampering check', async () => {
      const router = new ActionRouter();
      const tamperedProposal: ActionProposal = {
        ...baseProposal,
        approvedPayload: { skuCode: 'SKU-NORM-001', price: 10.0 },
        payload: { skuCode: 'SKU-NORM-001', price: 99.99 }, // tampered price!
      };
      const result = await router.dispatch(tamperedProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      expect(result.normalizedError).toBeDefined();
      expect(result.normalizedError?.class).toBe('VALIDATION');
      expect(result.executionEvidence?.errorClass).toBe('VALIDATION');
      expect(result.executionEvidence?.errorCode).toBe('PAYLOAD_TAMPERED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });

    it('populates normalizedError and errorClass on demo template live guard', async () => {
      const router = new ActionRouter();
      const demoProposal = {
        ...baseProposal,
        payload: { ...baseProposal.payload, isDemoTemplate: true },
      };
      const result = await router.dispatch(demoProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      expect(result.normalizedError).toBeDefined();
      expect(result.normalizedError?.class).toBe('PERMISSION');
      expect(result.executionEvidence?.errorClass).toBe('PERMISSION');
      expect(result.executionEvidence?.errorCode).toBe('WRITE_FORBIDDEN');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });

    it('populates normalizedError and errorClass on unsupported runtime', async () => {
      const router = new ActionRouter();
      const unsupportedProposal = {
        ...baseProposal,
        type: 'COMPUTER_USE' as any,
      };
      const result = await router.dispatch(unsupportedProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('FAILED');
      expect(result.normalizedError).toBeDefined();
      expect(result.normalizedError?.class).toBe('VALIDATION');
      expect(result.executionEvidence?.errorClass).toBe('VALIDATION');
      expect(result.executionEvidence?.errorCode).toBe('UNSUPPORTED_RUNTIME');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });
  });
});
