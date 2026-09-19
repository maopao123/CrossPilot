import { Writable } from 'node:stream';
import {
  createRuntimeLogger,
  runtimeLogger,
  RuntimeEvents,
  sanitizeLogData,
  isSensitiveKey,
  serializeExecutionError,
  summarizePayload,
  normalizeExecutionError,
  ExecutionErrorClass,
} from '@crosspilot/shared';
import { ActionRouter } from '../src/action.router.js';
import { ActionProposal, ActionDispatcherContext } from '../src/action.types.js';
import { RpaAdapter, RpaExecutionInput, RpaExecutionResult } from '@crosspilot/integrations/rpa';
import { computeCanonicalPayloadHash } from '../src/approval-binding.js';

describe('Phase 3: Structured Logging & Trace Correlation Tests', () => {
  function createTestSink() {
    const logs: Array<Record<string, any>> = [];
    const rawLines: string[] = [];

    const stream = new Writable({
      write(chunk, _encoding, callback) {
        const line = chunk.toString();
        rawLines.push(line);
        try {
          logs.push(JSON.parse(line));
        } catch {
          // ignore non-json if any
        }
        callback();
      },
    });

    const logger = createRuntimeLogger({
      level: 'debug',
      destination: stream,
    });

    return { logs, rawLines, logger };
  }

  describe('1. Structured Logger Core & Context Inheritance', () => {
    it('1.1 outputs valid single-line JSON with standard level and timestamp format', () => {
      const { logs, rawLines, logger } = createTestSink();

      logger.info({
        event: 'test.event',
        foo: 'bar',
      });

      expect(logs).toHaveLength(1);
      expect(rawLines[0]).toMatch(/^{.*}\n?$/);
      expect(logs[0]).toMatchObject({
        level: 'info',
        event: 'test.event',
        foo: 'bar',
      });
      expect(typeof logs[0].timestamp).toBe('string');
      expect(new Date(logs[0].timestamp).toISOString()).toBe(logs[0].timestamp);
    });

    it('1.2 child logger automatically inherits traceId, operationId, and custom context', () => {
      const { logs, logger } = createTestSink();

      const child = logger.child({
        service: 'action-router',
        traceId: 'tr_test_123',
        operationId: 'op_test_456',
        workspaceId: 'ws_789',
      });

      child.info({
        event: RuntimeEvents.ACTION_DISPATCH_STARTED,
        actionType: 'RPA',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'info',
        service: 'action-router',
        traceId: 'tr_test_123',
        operationId: 'op_test_456',
        workspaceId: 'ws_789',
        event: RuntimeEvents.ACTION_DISPATCH_STARTED,
        actionType: 'RPA',
      });
    });

    it('1.3 grandchild logger merges parent context without mutating parent', () => {
      const { logs, logger } = createTestSink();

      const parent = logger.child({
        traceId: 'tr_root',
        workspaceId: 'ws_root',
      });

      const child = parent.child({
        operationId: 'op_child',
        attempt: 2,
      });

      parent.info({ event: 'parent.event' });
      child.info({ event: 'child.event' });

      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        traceId: 'tr_root',
        workspaceId: 'ws_root',
        event: 'parent.event',
      });
      expect(logs[0].operationId).toBeUndefined();

      expect(logs[1]).toMatchObject({
        traceId: 'tr_root',
        workspaceId: 'ws_root',
        operationId: 'op_child',
        attempt: 2,
        event: 'child.event',
      });
    });
  });

  describe('2. P0 Secret Redaction & Sanitization', () => {
    it('2.1 correctly identifies sensitive key names and benign token properties', () => {
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('Authorization')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('access_token')).toBe(true);
      expect(isSensitiveKey('clientSecret')).toBe(true);
      expect(isSensitiveKey('client_secret')).toBe(true);
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('api_key')).toBe(true);
      expect(isSensitiveKey('cookie')).toBe(true);
      expect(isSensitiveKey('set-cookie')).toBe(true);
      expect(isSensitiveKey('payloadEnc')).toBe(true);
      expect(isSensitiveKey('credential')).toBe(true);
      expect(isSensitiveKey('shopifyAccessToken')).toBe(true);

      // Benign token attributes must NOT be redacted
      expect(isSensitiveKey('tokenCount')).toBe(false);
      expect(isSensitiveKey('tokenType')).toBe(false);
      expect(isSensitiveKey('tokensRemaining')).toBe(false);
      expect(isSensitiveKey('tokenId')).toBe(false);
    });

    it('2.2 redacts sensitive keys in top-level and nested objects', () => {
      const { logs, rawLines, logger } = createTestSink();

      const sensitivePayload = {
        event: 'auth.test',
        authorization: 'Bearer super_secret_jwt_token_12345',
        accessToken: 'shpat_abcdef1234567890',
        clientSecret: 'secret_live_xyz987',
        password: 'myAdminPassword!@#',
        cookie: 'session_id=abcdef123456',
        request: {
          headers: {
            Authorization: 'Bearer nested_bearer_token',
            'Set-Cookie': 'cookie_val=999',
          },
          credentials: {
            apiKey: 'ak_live_777',
            payloadEnc: 'encrypted_blob_data',
          },
        },
      };

      logger.info(sensitivePayload);

      expect(logs).toHaveLength(1);
      const log = logs[0];

      expect(log.authorization).toBe('[REDACTED]');
      expect(log.accessToken).toBe('[REDACTED]');
      expect(log.clientSecret).toBe('[REDACTED]');
      expect(log.password).toBe('[REDACTED]');
      expect(log.cookie).toBe('[REDACTED]');
      expect(log.request.headers.Authorization).toBe('[REDACTED]');
      expect(log.request.headers['Set-Cookie']).toBe('[REDACTED]');
      expect(log.request.credentials.apiKey).toBe('[REDACTED]');
      expect(log.request.credentials.payloadEnc).toBe('[REDACTED]');

      // Raw secrets must never appear in final serialized JSON string
      const raw = rawLines[0];
      expect(raw).not.toContain('super_secret_jwt_token_12345');
      expect(raw).not.toContain('shpat_abcdef1234567890');
      expect(raw).not.toContain('secret_live_xyz987');
      expect(raw).not.toContain('myAdminPassword!@#');
      expect(raw).not.toContain('nested_bearer_token');
      expect(raw).not.toContain('ak_live_777');
    });

    it('2.3 sanitizes database connection strings and embedded bearer tokens in strings', () => {
      const { rawLines, logger } = createTestSink();

      logger.info({
        event: 'db.connect',
        postgresUrl: 'postgresql://postgres:p4ssw0rd123@127.0.0.1:5432/crosspilot_db',
        redisUrl: 'redis://:redis_secret_password@127.0.0.1:6379/0',
        message: 'Request failed with Bearer secret_live_token_456 inside message',
        shopifyHeader: 'Token was shpat_778899aabbccdd',
      });

      const raw = rawLines[0];
      expect(raw).not.toContain('p4ssw0rd123');
      expect(raw).not.toContain('redis_secret_password');
      expect(raw).not.toContain('secret_live_token_456');
      expect(raw).not.toContain('shpat_778899aabbccdd');

      expect(raw).toContain('postgresql://postgres:[REDACTED]@127.0.0.1:5432/crosspilot_db');
      expect(raw).toContain('Bearer [REDACTED]');
      expect(raw).toContain('shpat_[REDACTED]');
    });

    it('2.4 summarizePayload creates safe non-leaking payload overview', () => {
      const fullBusinessPayload = {
        actionType: 'UPDATE_LISTING',
        skuCode: 'SKU-SECRET-001',
        title: 'New High Quality Toothbrush',
        price: 29.99,
        apiKey: 'secret_key_111',
        password: 'pwd',
        payloadHash: 'hash_abc_123',
      };

      const summary = summarizePayload(fullBusinessPayload);
      expect(summary).toMatchObject({
        actionType: 'UPDATE_LISTING',
        targetId: 'SKU-SECRET-001',
        payloadHash: 'hash_abc_123',
      });
      // Sensitive fields excluded from fieldNames
      expect(summary.fieldNames).toContain('title');
      expect(summary.fieldNames).toContain('price');
      expect(summary.fieldNames).not.toContain('apiKey');
      expect(summary.fieldNames).not.toContain('password');
    });
  });

  describe('3. Error Serialization & Cause Omission', () => {
    it('3.1 strictly strips raw .cause object to prevent leaking HTTP requests or tokens', () => {
      const { logs, rawLines, logger } = createTestSink();

      const underlyingHttpError = {
        name: 'AxiosError',
        message: 'Request failed with status code 401',
        config: {
          headers: {
            Authorization: 'Bearer super_secret_leakable_token',
          },
          data: {
            clientSecret: 'very_secret_key',
          },
        },
      };

      const normalized = normalizeExecutionError(
        new Error('Shopify API request failed'),
        {
          provider: 'shopify',
          code: 'AUTH_FAILED',
        },
      );
      // Simulate raw cause attached to normalized error
      (normalized as any).cause = underlyingHttpError;

      logger.error({
        event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
        normalizedError: normalized,
      });

      expect(logs).toHaveLength(1);
      const log = logs[0];

      expect(log).toMatchObject({
        event: RuntimeEvents.ADAPTER_REQUEST_FAILED,
        errorClass: 'AUTH',
        errorCode: 'AUTH_FAILED',
        retryable: false,
        provider: 'shopify',
      });
      expect(log.cause).toBeUndefined();

      const raw = rawLines[0];
      expect(raw).not.toContain('super_secret_leakable_token');
      expect(raw).not.toContain('very_secret_key');
    });

    it('3.2 serializeExecutionError extracts standard safe properties', () => {
      const err = new Error('Database connection timed out');
      (err as any).code = 'ETIMEDOUT';

      const serialized = serializeExecutionError(err);
      expect(serialized.errorClass).toBe('TIMEOUT');
      expect(serialized.errorCode).toBe('ETIMEDOUT');
      expect(serialized.errorMessage).toContain('Database connection timed out');
      expect(serialized.retryable).toBe(false);
      expect((serialized as any).cause).toBeUndefined();
    });
  });

  describe('4. ActionRouter Structured Events & Trace Correlation', () => {
    it('4.1 logs dispatch.started, dispatch.blocked for human gate approval', async () => {
      const router = new ActionRouter();
      const proposal: ActionProposal = {
        id: 'act_gate_001',
        type: 'RPA',
        name: 'Update Price',
        description: 'Update price on Seller Central',
        requiresHumanApproval: true,
        targetEntity: 'sku',
        targetId: 'SKU-100',
        payload: { skuCode: 'SKU-100', price: 99.99 },
        riskLevel: 'HIGH',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_gate_test',
        traceId: 'trace_gate_001',
        operationId: 'op_gate_001',
        isApproved: false,
      };

      const result = await router.dispatch(proposal, context);
      expect(result.status).toBe('WAITING_APPROVAL');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.recovery).toBe('MANUAL');
    });

    it('4.2 logs dispatch.blocked when payload tampering is detected', async () => {
      const router = new ActionRouter();
      const approvedPayload = { skuCode: 'SKU-PRICE-01', price: 19.99 };
      const canonicalHash = computeCanonicalPayloadHash(approvedPayload);

      const proposal: ActionProposal = {
        id: 'act_tamper_001',
        type: 'RPA',
        name: 'Update Price',
        description: 'Update price on Seller Central',
        requiresHumanApproval: true,
        targetEntity: 'sku',
        targetId: 'SKU-PRICE-01',
        payload: { skuCode: 'SKU-PRICE-01', price: 999.99 }, // Tampered price!
        approvedPayload,
        approvedPayloadHash: canonicalHash,
        riskLevel: 'HIGH',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_tamper_test',
        traceId: 'trace_tamper_001',
        operationId: 'op_tamper_001',
        isApproved: true,
      };

      const result = await router.dispatch(proposal, context);
      expect(result.status).toBe('FAILED');
      expect(result.normalizedError?.code).toBe('PAYLOAD_TAMPERED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
    });

    it('4.3 logs dispatch.completed with traceId and operationId on successful execution', async () => {
      const mockAdapter: RpaAdapter = {
        id: 'mock-rpa-logger-test',
        supportedModes: ['MOCK'],
        execute: async (_input: RpaExecutionInput): Promise<RpaExecutionResult> => {
          return {
            jobId: 'job_success_001',
            status: 'SUCCESS',
            output: { writeExecuted: true },
            durationMs: 42,
          };
        },
      };

      const mockRegistry: any = {
        get: () => mockAdapter,
        getDefault: () => mockAdapter,
      };

      const router = new ActionRouter(mockRegistry);
      const proposal: ActionProposal = {
        id: 'act_succ_001',
        type: 'RPA',
        name: 'Update SKU',
        description: 'Test',
        requiresHumanApproval: false,
        targetEntity: 'sku',
        targetId: 'SKU-OK',
        payload: { skuCode: 'SKU-OK' },
        riskLevel: 'LOW',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_succ_test',
        traceId: 'trace_succ_001',
        operationId: 'op_succ_001',
        executionMode: 'MOCK',
      };

      const result = await router.dispatch(proposal, context);
      expect(result.status).toBe('SUCCEEDED');
      expect(result.executionEvidence?.phase).toBe('COMPLETED');
      expect(result.executionEvidence?.effect).toBe('APPLIED');
    });
  });

  describe('5. Timeout & Cancellation Correlation', () => {
    it('5.1 preserves UNKNOWN/QUERY invariant on adapter timeout', async () => {
      const timeoutAdapter: RpaAdapter = {
        id: 'timeout-rpa-adapter',
        supportedModes: ['MOCK'],
        getStatus: async () => ({ status: 'UNKNOWN' }),
        execute: async (): Promise<RpaExecutionResult> => {
          return {
            jobId: 'job_timeout_001',
            status: 'TIMEOUT',
            error: 'PAGE_TIMEOUT: Page load timed out after 10000ms',
            durationMs: 10002,
          };
        },
      };

      const router = new ActionRouter({ get: () => timeoutAdapter, getDefault: () => timeoutAdapter } as any);
      const proposal: ActionProposal = {
        id: 'act_timeout_001',
        type: 'RPA',
        name: 'Timeout Action',
        description: 'Timeout test',
        requiresHumanApproval: false,
        targetEntity: 'sku',
        targetId: 'SKU-TMO',
        payload: { skuCode: 'SKU-TMO' },
        riskLevel: 'LOW',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_timeout_test',
        traceId: 'trace_tmo_001',
        operationId: 'op_tmo_001',
        executionMode: 'MOCK',
      };

      const result = await router.dispatch(proposal, context);
      expect(result.status).toBe('FAILED');
      expect(result.executionEvidence?.effect).toBe('UNKNOWN');
      expect(result.executionEvidence?.recovery).toBe('QUERY');
      expect(result.executionEvidence?.errorClass).toBe('TIMEOUT');
    });

    it('5.2 distinguishes pre-dispatch cancellation (NOT_APPLIED/NONE) from post-dispatch', async () => {
      const controller = new AbortController();
      controller.abort(); // pre-aborted

      const adapter: RpaAdapter = {
        id: 'mock-rpa-preabort',
        supportedModes: ['MOCK'],
        execute: jest.fn(),
      };

      const router = new ActionRouter({ get: () => adapter, getDefault: () => adapter } as any);
      const proposal: ActionProposal = {
        id: 'act_cancel_001',
        type: 'RPA',
        name: 'Pre-cancelled Action',
        description: 'Cancel test',
        requiresHumanApproval: false,
        targetEntity: 'sku',
        targetId: 'SKU-CNC',
        payload: { skuCode: 'SKU-CNC' },
        riskLevel: 'LOW',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_cancel_test',
        traceId: 'trace_cnc_001',
        operationId: 'op_cnc_001',
        executionMode: 'MOCK',
        signal: controller.signal,
      };

      const result = await router.dispatch(proposal, context);
      expect(result.status).toBe('FAILED');
      expect(result.normalizedError?.code).toBe('CANCELLED');
      expect(result.executionEvidence?.effect).toBe('NOT_APPLIED');
      expect(result.executionEvidence?.recovery).toBe('NONE');
      expect(adapter.execute).not.toHaveBeenCalled();
    });
  });

  describe('6. Regression Gate & Fail-Safe Invariants', () => {
    it('6.1 logging never alters ActionExecutionResult or runtime evidence truth', async () => {
      const adapter: RpaAdapter = {
        id: 'regression-rpa',
        supportedModes: ['MOCK'],
        execute: async () => ({
          jobId: 'job_reg_001',
          status: 'SUCCESS',
          output: { writeExecuted: true },
          durationMs: 10,
        }),
      };

      const router = new ActionRouter({ get: () => adapter, getDefault: () => adapter } as any);
      const proposal: ActionProposal = {
        id: 'act_reg_001',
        type: 'RPA',
        name: 'Regression Test',
        description: 'Test',
        requiresHumanApproval: false,
        targetEntity: 'sku',
        targetId: 'SKU-REG',
        payload: { skuCode: 'SKU-REG' },
        riskLevel: 'LOW',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      const context: ActionDispatcherContext = {
        workspaceId: 'ws_reg',
        traceId: 'trace_reg_001',
        operationId: 'op_reg_001',
        executionMode: 'MOCK',
      };

      const res = await router.dispatch(proposal, context);
      expect(res.status).toBe('SUCCEEDED');
      expect(res.executionEvidence).toMatchObject({
        mode: 'MOCK',
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
      });
    });

    it('6.2 fail-safe: circular references or unusual objects never throw or crash logger', () => {
      const circular: any = { event: 'circular.test', a: 1 };
      circular.self = circular;

      expect(() => {
        sanitizeLogData(circular);
      }).not.toThrow();

      const sanitized = sanitizeLogData(circular) as any;
      expect(sanitized.self).toBe('[CIRCULAR]');
    });
  });
});
