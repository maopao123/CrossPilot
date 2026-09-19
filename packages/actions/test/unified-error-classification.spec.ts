import {
  normalizeExecutionError,
  ExecutionErrorClass,
  NormalizedExecutionError,
} from '@crosspilot/shared';
import { HttpERPAdapter, PlaywrightRpaAdapter, RpaRegistry } from '@crosspilot/integrations';
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

  describe('5. Shopify and Commerce Error Classification Closure', () => {
    it('5.1 maps Shopify HTTP 429 and PROVIDER_RATE_LIMIT to RATE_LIMIT (retryable=true)', () => {
      const err1 = { code: 'PROVIDER_RATE_LIMIT', message: 'Shopify rate limit exceeded' };
      const norm1 = normalizeExecutionError(err1, { retryable: true, provider: 'shopify' });
      expect(norm1.class).toBe('RATE_LIMIT');
      expect(norm1.retryable).toBe(true);

      const err2 = { originalStatus: 429, message: 'Too Many Requests' };
      const norm2 = normalizeExecutionError(err2, { originalStatus: 429, provider: 'shopify' });
      expect(norm2.class).toBe('RATE_LIMIT');
      expect(norm2.retryable).toBe(true);
    });

    it('5.2 maps Shopify 5xx and PROVIDER_UNAVAILABLE with retryable=true to TRANSIENT (retryable=true)', () => {
      const err500 = { originalStatus: 500, message: 'Shopify internal server error' };
      const norm500 = normalizeExecutionError(err500, { originalStatus: 500, provider: 'shopify' });
      expect(norm500.class).toBe('TRANSIENT');
      expect(norm500.retryable).toBe(true);

      const errNet = { code: 'PROVIDER_UNAVAILABLE', message: 'Failed to reach Shopify GraphQL API: fetch failed' };
      const normNet = normalizeExecutionError(errNet, { retryable: true, provider: 'shopify' });
      expect(normNet.class).toBe('TRANSIENT');
      expect(normNet.retryable).toBe(true);
      expect(normNet.class).not.toBe('UNKNOWN');
    });

    it('5.3 maps PROVIDER_UNAVAILABLE with retryable=false to PROVIDER_ERROR (retryable=false)', () => {
      const errPlatform = { code: 'PROVIDER_UNAVAILABLE', message: 'No Commerce Adapter registered for platform=unsupported' };
      const normPlatform = normalizeExecutionError(errPlatform, { retryable: false, provider: 'shopify' });
      expect(normPlatform.class).toBe('PROVIDER_ERROR');
      expect(normPlatform.retryable).toBe(false);
      expect(normPlatform.class).not.toBe('UNKNOWN');
    });

    it('5.4 maps Shopify AUTH_REQUIRED and HTTP 401/403 to AUTH (retryable=false)', () => {
      const errAuth = { code: 'AUTH_REQUIRED', message: 'Shopify store is not connected (no client credentials found)' };
      const normAuth = normalizeExecutionError(errAuth, { provider: 'shopify' });
      expect(normAuth.class).toBe('AUTH');
      expect(normAuth.retryable).toBe(false);

      const err401 = { originalStatus: 401, message: 'Unauthorized access token' };
      const norm401 = normalizeExecutionError(err401, { originalStatus: 401, provider: 'shopify' });
      expect(norm401.class).toBe('AUTH');
      expect(norm401.retryable).toBe(false);

      // Shopify token expiration on HTTP 403 with auth code
      const err403Auth = { originalStatus: 403, code: 'AUTH_REQUIRED', message: 'Shopify authentication failed / access token invalid or expired' };
      const norm403Auth = normalizeExecutionError(err403Auth, { originalStatus: 403, code: 'AUTH_REQUIRED', provider: 'shopify' });
      expect(norm403Auth.class).toBe('AUTH');
      expect(norm403Auth.retryable).toBe(false);
    });

    it('5.5 maps Shopify COMMERCE_PORT_ERROR to PROVIDER_ERROR (retryable=false)', () => {
      const errCommerce = { code: 'COMMERCE_PORT_ERROR', message: 'Product variant GID does not exist' };
      const normCommerce = normalizeExecutionError(errCommerce, { provider: 'shopify', retryable: false });
      expect(normCommerce.class).toBe('PROVIDER_ERROR');
      expect(normCommerce.retryable).toBe(false);
      expect(normCommerce.class).not.toBe('UNKNOWN');
    });

    it('5.6 maps Shopify GraphQL THROTTLED to RATE_LIMIT (retryable=true)', () => {
      const gqlThrottled = { code: 'THROTTLED', message: 'Throttled by Shopify GraphQL endpoint' };
      const normThrottled = normalizeExecutionError(gqlThrottled, { provider: 'shopify' });
      expect(normThrottled.class).toBe('RATE_LIMIT');
      expect(normThrottled.retryable).toBe(true);

      const gqlThrottledMsg = new Error('Shopify query error: Throttled');
      const normMsg = normalizeExecutionError(gqlThrottledMsg, { provider: 'shopify' });
      expect(normMsg.class).toBe('RATE_LIMIT');
      expect(normMsg.retryable).toBe(true);
    });

    it('5.7 maps GraphQL validation and user errors to VALIDATION (retryable=false)', () => {
      const gqlValidation = { code: 'GRAPHQL_VALIDATION_FAILED', message: 'Variable $id of type ID! was provided invalid value' };
      const normValidation = normalizeExecutionError(gqlValidation, { provider: 'shopify' });
      expect(normValidation.class).toBe('VALIDATION');
      expect(normValidation.retryable).toBe(false);

      const userInputErr = { code: 'BAD_USER_INPUT', message: 'Field "price" must be positive' };
      const normUserInput = normalizeExecutionError(userInputErr, { provider: 'shopify' });
      expect(normUserInput.class).toBe('VALIDATION');
      expect(normUserInput.retryable).toBe(false);
    });

    it('5.8 guarantees that retryable=true error NEVER falls into UNKNOWN class', () => {
      const obscureRetryable = { code: 'OBSCURE_UPSTREAM_ERROR', message: 'Something temporary happened upstream' };
      const norm = normalizeExecutionError(obscureRetryable, { retryable: true, provider: 'shopify' });
      expect(norm.class).toBe('TRANSIENT');
      expect(norm.retryable).toBe(true);
      expect(norm.class).not.toBe('UNKNOWN');
    });
  });

  describe('6. Action Layer Synchronous ERP State Machine Decision Driven by normalizedError.class', () => {
    // Simulates the decision logic in apps/api/src/modules/action-layer/action-layer.service.ts:
    function evaluateActionLayerErpRecovery(erpRes: {
      success: boolean;
      errorCode?: string;
      errorMessage?: string;
      statusCode?: number;
      normalizedError?: NormalizedExecutionError;
    }) {
      const normalized =
        erpRes.normalizedError ??
        normalizeExecutionError(erpRes.errorMessage || erpRes, {
          provider: 'simulator-erp',
          code: erpRes.errorCode,
          originalStatus: erpRes.statusCode,
        });

      const isTimeout = normalized.class === 'TIMEOUT';
      const isRateLimited = normalized.class === 'RATE_LIMIT';
      const isTransient = normalized.class === 'TRANSIENT';
      const isAuthFailed = normalized.class === 'AUTH';

      const phase = isTimeout ? 'SUBMITTED' : 'FAILED';
      const effect = isTimeout ? 'UNKNOWN' : 'NOT_APPLIED';
      const recovery = isTimeout
        ? 'QUERY'
        : isRateLimited || isTransient
          ? 'RETRY'
          : isAuthFailed
            ? 'REAUTHORIZE'
            : 'MANUAL';

      const actionStatus = isTimeout ? 'EXECUTING' : 'FAILED';

      return { phase, effect, recovery, actionStatus, errorClass: normalized.class };
    }

    it('routes TIMEOUT to SUBMITTED / UNKNOWN / QUERY / EXECUTING regardless of custom errorCode string', () => {
      const decision = evaluateActionLayerErpRecovery({
        success: false,
        errorCode: 'CUSTOM_TIMEOUT_OCCURRED',
        normalizedError: {
          class: 'TIMEOUT',
          code: 'TIMEOUT',
          message: 'Operation timed out',
          retryable: false,
        },
      });

      expect(decision.phase).toBe('SUBMITTED');
      expect(decision.effect).toBe('UNKNOWN');
      expect(decision.recovery).toBe('QUERY');
      expect(decision.actionStatus).toBe('EXECUTING');
      expect(decision.errorClass).toBe('TIMEOUT');
    });

    it('routes RATE_LIMIT to FAILED / NOT_APPLIED / RETRY / FAILED', () => {
      const decision = evaluateActionLayerErpRecovery({
        success: false,
        errorCode: '429_TOO_MANY_REQUESTS',
        normalizedError: {
          class: 'RATE_LIMIT',
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded',
          retryable: true,
        },
      });

      expect(decision.phase).toBe('FAILED');
      expect(decision.effect).toBe('NOT_APPLIED');
      expect(decision.recovery).toBe('RETRY');
      expect(decision.actionStatus).toBe('FAILED');
      expect(decision.errorClass).toBe('RATE_LIMIT');
    });

    it('routes TRANSIENT to FAILED / NOT_APPLIED / RETRY / FAILED', () => {
      const decision = evaluateActionLayerErpRecovery({
        success: false,
        errorCode: 'HTTP_503',
        normalizedError: {
          class: 'TRANSIENT',
          code: 'HTTP_503',
          message: 'Service Unavailable',
          retryable: true,
        },
      });

      expect(decision.phase).toBe('FAILED');
      expect(decision.effect).toBe('NOT_APPLIED');
      expect(decision.recovery).toBe('RETRY');
      expect(decision.actionStatus).toBe('FAILED');
      expect(decision.errorClass).toBe('TRANSIENT');
    });

    it('routes AUTH to FAILED / NOT_APPLIED / REAUTHORIZE / FAILED', () => {
      const decision = evaluateActionLayerErpRecovery({
        success: false,
        errorCode: 'TOKEN_INVALID',
        normalizedError: {
          class: 'AUTH',
          code: 'AUTH_REQUIRED',
          message: 'Session token invalid',
          retryable: false,
        },
      });

      expect(decision.phase).toBe('FAILED');
      expect(decision.effect).toBe('NOT_APPLIED');
      expect(decision.recovery).toBe('REAUTHORIZE');
      expect(decision.actionStatus).toBe('FAILED');
      expect(decision.errorClass).toBe('AUTH');
    });

    it('routes VALIDATION to FAILED / NOT_APPLIED / MANUAL / FAILED', () => {
      const decision = evaluateActionLayerErpRecovery({
        success: false,
        errorCode: 'INVALID_PO_FORMAT',
        normalizedError: {
          class: 'VALIDATION',
          code: 'VALIDATION_ERROR',
          message: 'Invalid purchase order schema',
          retryable: false,
        },
      });

      expect(decision.phase).toBe('FAILED');
      expect(decision.effect).toBe('NOT_APPLIED');
      expect(decision.recovery).toBe('MANUAL');
      expect(decision.actionStatus).toBe('FAILED');
      expect(decision.errorClass).toBe('VALIDATION');
    });
  });

  describe('7. ActionRouter Primary vs Legacy Compatibility Fallback', () => {
    const baseProposal: ActionProposal = {
      id: 'act_rpa_test_001',
      type: 'RPA',
      name: 'Amazon Listing Publish',
      description: 'Publish SKU',
      requiresHumanApproval: true,
      targetEntity: 'SKU',
      targetId: 'SKU-RPA-001',
      payload: { skuCode: 'SKU-RPA-001', price: 29.99 },
      riskLevel: 'HIGH',
      status: 'PENDING',
      createdAt: '2026-09-19T00:00:00.000Z',
    };

    it('uses typed normalizedError.class directly without depending on string message prefix', async () => {
      const customAdapter = {
        id: 'custom-rpa-adapter',
        name: 'Custom RPA',
        supportedModes: ['LIVE' as const],
        execute: async () => ({
          jobId: '',
          status: 'FAILED' as const,
          // Notice: error message does NOT start with CONFIG_ERROR or AUTH_REQUIRED
          error: 'Remote credentials verification failed during initial handshake',
          normalizedError: {
            class: 'AUTH' as ExecutionErrorClass,
            code: 'CREDENTIAL_HANDSHAKE_FAILED',
            message: 'Remote credentials verification failed during initial handshake',
            retryable: false,
          },
          durationMs: 40,
        }),
      };

      const registry = new RpaRegistry();
      registry.register(customAdapter as any);
      const router = new ActionRouter(registry);

      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'custom-rpa-adapter',
      });

      expect(result.status).toBe('FAILED');
      // Proves: isExplicitPreflight recognized via normalizedError.class === 'AUTH'
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.recovery).toBe('REAUTHORIZE');
      expect(result.executionEvidence?.errorClass).toBe('AUTH');
    });

    it('falls back to legacy string prefix only when adapter does not provide normalizedError', async () => {
      const legacyAdapter = {
        id: 'legacy-rpa-adapter',
        name: 'Legacy RPA Adapter',
        supportedModes: ['LIVE' as const],
        execute: async () => ({
          jobId: '',
          status: 'FAILED' as const,
          error: 'CONFIG_ERROR: legacy adapter missing target profile',
          // NO normalizedError provided!
          durationMs: 30,
        }),
      };

      const registry = new RpaRegistry();
      registry.register(legacyAdapter as any);
      const router = new ActionRouter(registry);

      const result = await router.dispatch(baseProposal, {
        workspaceId: 'ws_demo',
        isApproved: true,
        executionMode: 'LIVE',
        providerId: 'legacy-rpa-adapter',
      });

      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.errorCode).toBe('CONFIG_ERROR');
    });
  });
});
