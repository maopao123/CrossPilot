import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  AutomationOperationStore,
  ExecutionAttemptStore,
} from '@crosspilot/db';
import {
  ExecutionEvidence,
  PersistedExecutionError,
  RuntimeEvents,
  runtimeLogger,
  toSafeEvidenceRef,
  isSafeEvidenceRef,
  sanitizeExecutionEvidenceForPersistence,
  normalizeLegacyExecutionEvidence,
} from '@crosspilot/shared';
import {
  buildEvidenceArtifact,
  resolveEvidenceArtifactPath,
  ensureSafeEvidenceDirectory,
  setSafeFilePermissions,
} from '@crosspilot/integrations';
import { ActionRouter } from '../src/action.router.js';
import { ActionProposal } from '../src/action.types.js';

/**
 * High-fidelity in-memory mock of PrismaClient for Phase 7 Evidence tests.
 */
function createMockPrismaClient() {
  const opStore: any[] = [];
  const attemptStore: any[] = [];

  const automationOperation = {
    create: jest.fn(async ({ data }: { data: any }) => {
      const copy = { ...data, id: data.id || `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      opStore.push(copy);
      return { ...copy };
    }),
    findFirst: jest.fn(async ({ where }: { where: any }) => {
      const found = opStore.find((op) => {
        if (where.id && op.id !== where.id) return false;
        if (where.workspaceId && op.workspaceId !== where.workspaceId) return false;
        if (where.idempotencyKey && op.idempotencyKey !== where.idempotencyKey) return false;
        return true;
      });
      return found ? { ...found } : null;
    }),
    findUnique: jest.fn(async ({ where }: { where: any }) => {
      const found = opStore.find((op) => op.id === where.id);
      return found ? { ...found } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
      const matches = opStore.filter((op) => {
        if (where.id && op.id !== where.id) return false;
        if (where.workspaceId && op.workspaceId !== where.workspaceId) return false;
        if (where.version !== undefined && op.version !== where.version) return false;
        return true;
      });
      for (const op of matches) {
        if (data.version?.increment) {
          op.version += data.version.increment;
        }
        Object.assign(op, data);
        if (data.version?.increment) {
          delete (op as any)['version'];
          op.version = (op.version || 0);
        }
      }
      return { count: matches.length };
    }),
  };

  const executionAttempt = {
    create: jest.fn(async ({ data }: { data: any }) => {
      const copy = { ...data, id: `att_${Date.now()}` };
      attemptStore.push(copy);
      return { ...copy };
    }),
    findFirst: jest.fn(async ({ where }: { where: any }) => {
      const found = attemptStore.find((a) => {
        if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
        if (where.operationId && a.operationId !== where.operationId) return false;
        if (where.attemptNo !== undefined && a.attemptNo !== where.attemptNo) return false;
        return true;
      });
      return found ? { ...found } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
      const matches = attemptStore.filter((a) => {
        if (where.workspaceId && a.workspaceId !== where.workspaceId) return false;
        if (where.operationId && a.operationId !== where.operationId) return false;
        if (where.attemptNo !== undefined && a.attemptNo !== where.attemptNo) return false;
        return true;
      });
      for (const a of matches) {
        Object.assign(a, data);
      }
      return { count: matches.length };
    }),
  };

  return {
    automationOperation,
    executionAttempt,
    _opStore: opStore,
    _attemptStore: attemptStore,
  } as unknown as PrismaClient & { _opStore: any[]; _attemptStore: any[] };
}

describe('Phase 7 — Execution Evidence Schema, Artifact Integrity & Redaction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-spec-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Part 1: PersistedExecutionError Stripping & Secret Redaction', () => {
    it('strictly strips cause, stack, and raw error objects from normalizedError', () => {
      const rawEvidence = {
        mode: 'LIVE',
        provider: 'amazon-seller',
        operationId: 'op_100',
        phase: 'FAILED',
        effect: 'UNKNOWN',
        recovery: 'MANUAL',
        normalizedError: {
          class: 'TIMEOUT',
          code: 'ADAPTER_TIMEOUT',
          message: 'Request timed out waiting for response',
          retryable: true,
          provider: 'amazon-seller',
          originalStatus: 504,
          cause: new Error('Sensitive socket failure: secret_token_abc'),
          stack: 'Error: Request timed out\n    at /Users/zls/CrossPilot/internal.ts:42:1',
          rawRequest: { headers: { authorization: 'Bearer secret_xyz' } },
        },
      };

      const sanitized = sanitizeExecutionEvidenceForPersistence(rawEvidence);

      expect(sanitized.schemaVersion).toBe(2);
      expect(sanitized.normalizedError).toBeDefined();
      expect(sanitized.normalizedError?.class).toBe('TIMEOUT');
      expect(sanitized.normalizedError?.code).toBe('ADAPTER_TIMEOUT');
      expect(sanitized.normalizedError?.message).toBe('Request timed out waiting for response');
      expect(sanitized.normalizedError?.retryable).toBe(true);
      expect(sanitized.normalizedError?.originalStatus).toBe(504);

      // P0 INVARIANT: cause, stack, rawRequest MUST NOT exist on the persisted object
      expect('cause' in (sanitized.normalizedError as any)).toBe(false);
      expect('stack' in (sanitized.normalizedError as any)).toBe(false);
      expect('rawRequest' in (sanitized.normalizedError as any)).toBe(false);
    });

    it('redacts all embedded secrets across string fields and nested evidence sections', () => {
      const rawEvidence = {
        mode: 'LIVE',
        provider: 'shopify-connector',
        operationId: 'op_200',
        phase: 'FAILED',
        effect: 'NOT_APPLIED',
        recovery: 'REAUTHORIZE',
        syncError: 'Failed connecting to postgres://admin:superSecret123@db.prod.internal:5432/crosspilot',
        conflictDetails: {
          token: 'shpat_a1b2c3d4e5f6g7h8i9j0',
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.topsecret',
          authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.topsecret',
          password: 'plainPasswordValue',
          safeField: 'harmless_metric_123',
        },
        normalizedError: {
          class: 'AUTH',
          code: 'INVALID_TOKEN',
          message: 'Failed to authenticate with Bearer eyJhbGciOiJIUzI1NiIs. Invalid Shopify token shpat_secret99',
          retryable: false,
        },
      };

      const sanitized = sanitizeExecutionEvidenceForPersistence(rawEvidence);

      // Verify connection string password was redacted
      expect(sanitized.syncError).toContain('postgres://admin:[REDACTED]@db.prod.internal:5432/crosspilot');
      expect(sanitized.syncError).not.toContain('superSecret123');

      // Verify conflictDetails redactions
      const details = sanitized.conflictDetails as Record<string, unknown>;
      expect(details.token).toBe('[REDACTED]');
      expect(details.authorization).toBe('[REDACTED]');
      expect(details.authHeader).toBe('Bearer [REDACTED]');
      expect(details.password).toBe('[REDACTED]');
      expect(details.safeField).toBe('harmless_metric_123');

      // Verify normalizedError message redactions
      expect(sanitized.normalizedError?.message).toContain('Bearer [REDACTED]');
      expect(sanitized.normalizedError?.message).toContain('[REDACTED]');
      expect(sanitized.normalizedError?.message).not.toContain('shpat_secret99');
    });
  });

  describe('Part 2: Logical Ref Architecture & Path Traversal Defense', () => {
    it('normalizes host paths and URLs to relative safe logical evidence references', () => {
      // 1. Path relative to base evidence directory
      const baseDir = '/Users/zls/CrossPilot/.runtime-evidence';
      const fullPath = '/Users/zls/CrossPilot/.runtime-evidence/rpa/job_42/screenshot-after.png';
      expect(toSafeEvidenceRef(fullPath, baseDir)).toBe('rpa/job_42/screenshot-after.png');

      // 2. Path containing .runtime-evidence/ without baseDir passed
      expect(toSafeEvidenceRef(fullPath)).toBe('rpa/job_42/screenshot-after.png');

      // 3. evidence:// URI scheme
      expect(toSafeEvidenceRef('evidence://rpa/job_99/trace.zip')).toBe('rpa/job_99/trace.zip');

      // 4. Windows backslashes
      expect(toSafeEvidenceRef('rpa\\job_101\\screenshot-before.png')).toBe('rpa/job_101/screenshot-before.png');

      // 5. Normal clean relative path
      expect(toSafeEvidenceRef('rpa/job_1/trace.zip')).toBe('rpa/job_1/trace.zip');
    });

    it('rejects path traversal attempts with fail-closed errors', () => {
      expect(() => toSafeEvidenceRef('../../etc/passwd')).toThrow(/PATH_TRAVERSAL/);
      expect(() => toSafeEvidenceRef('rpa/job_1/../../secret.env')).toThrow(/PATH_TRAVERSAL/);
      expect(() => toSafeEvidenceRef('evidence://../etc/shadow')).toThrow(/PATH_TRAVERSAL/);
    });

    it('rejects host absolute path escapes and Windows drive letter escapes', () => {
      expect(() => toSafeEvidenceRef('/etc/passwd')).toThrow(/HOST_PATH_ESCAPE/);
      expect(() => toSafeEvidenceRef('/var/log/syslog')).toThrow(/HOST_PATH_ESCAPE/);
      expect(() => toSafeEvidenceRef('C:\\Windows\\System32\\cmd.exe')).toThrow(/HOST_PATH_ESCAPE/);
      expect(() => toSafeEvidenceRef('')).toThrow(/INVALID_EVIDENCE_REF/);
      expect(() => toSafeEvidenceRef('   ')).toThrow(/INVALID_EVIDENCE_REF/);
    });

    it('isSafeEvidenceRef validates logical paths accurately', () => {
      expect(isSafeEvidenceRef('rpa/job_123/screenshot.png')).toBe(true);
      expect(isSafeEvidenceRef('playwright/trace.zip')).toBe(true);
      expect(isSafeEvidenceRef('logs/step1.log')).toBe(true);

      // Traversal or absolute
      expect(isSafeEvidenceRef('../secret.txt')).toBe(false);
      expect(isSafeEvidenceRef('foo/../bar')).toBe(false);
      expect(isSafeEvidenceRef('/etc/passwd')).toBe(false);
      expect(isSafeEvidenceRef('C:/windows')).toBe(false);
      expect(isSafeEvidenceRef('')).toBe(false);
      expect(isSafeEvidenceRef(null)).toBe(false);
      expect(isSafeEvidenceRef(undefined)).toBe(false);
      expect(isSafeEvidenceRef(12345)).toBe(false);
    });

    it('resolveEvidenceArtifactPath securely resolves paths and prevents escaping baseDir', () => {
      const baseDir = path.join(tempDir, 'evidence-root');
      fs.mkdirSync(baseDir, { recursive: true });

      const resolved = resolveEvidenceArtifactPath('rpa/job_1/trace.zip', baseDir);
      expect(resolved).toBe(path.join(baseDir, 'rpa', 'job_1', 'trace.zip'));

      // Rejects unsafe refs
      expect(() => resolveEvidenceArtifactPath('../../etc/passwd', baseDir)).toThrow(/PATH_TRAVERSAL/);
      expect(() => resolveEvidenceArtifactPath('/etc/passwd', baseDir)).toThrow(/PATH_TRAVERSAL/);
    });
  });

  describe('Part 3: Artifact Integrity Hashing & Fail-Safe Degradation', () => {
    it('computes sha256 and sizeBytes accurately for local artifact files', () => {
      const testFile = path.join(tempDir, 'screenshot.png');
      const testContent = Buffer.from('fake-png-binary-stream-1234567890');
      fs.writeFileSync(testFile, testContent);

      const expectedSha256 = crypto.createHash('sha256').update(testContent).digest('hex');

      const artifact = buildEvidenceArtifact({
        filePath: testFile,
        kind: 'SCREENSHOT_AFTER',
        baseEvidenceDir: tempDir,
      });

      expect(artifact.kind).toBe('SCREENSHOT_AFTER');
      expect(artifact.mimeType).toBe('image/png');
      expect(artifact.sizeBytes).toBe(testContent.length);
      expect(artifact.sha256).toBe(expectedSha256);
      expect(artifact.ref).toBe('screenshot.png');
      expect(artifact.capturedAt).toBeDefined();
    });

    it('degrades gracefully without throwing when file does not exist (Fail-Safe Invariant)', () => {
      const nonExistentPath = path.join(tempDir, 'missing-file.zip');

      const warnSpy = jest.spyOn(runtimeLogger, 'warn');

      // Must NOT throw
      const artifact = buildEvidenceArtifact({
        filePath: nonExistentPath,
        kind: 'PLAYWRIGHT_TRACE',
        baseEvidenceDir: tempDir,
      });

      expect(artifact.kind).toBe('PLAYWRIGHT_TRACE');
      expect(artifact.mimeType).toBe('application/zip');
      expect(artifact.ref).toBe('missing-file.zip');
      expect(artifact.sizeBytes).toBeUndefined();
      expect(artifact.sha256).toBeUndefined();

      // Logged structured warning event
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED,
        }),
      );

      warnSpy.mockRestore();
    });

    it('ensureSafeEvidenceDirectory and setSafeFilePermissions execute safely', () => {
      const subDir = path.join(tempDir, 'safe-dir');
      ensureSafeEvidenceDirectory(subDir);
      expect(fs.existsSync(subDir)).toBe(true);

      const file = path.join(subDir, 'test.txt');
      fs.writeFileSync(file, 'hello');
      expect(() => setSafeFilePermissions(file)).not.toThrow();
    });
  });

  describe('Part 4: Legacy Normalization & Size Guard', () => {
    it('normalizes legacy V1 ExecutionEvidence to canonical V2 schema', () => {
      const legacy = {
        mode: 'MOCK',
        provider: 'erp-po',
        operationId: 'op_old_1',
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        evidenceRef: 'evidence://erp/po_123',
        externalId: 'PO-999',
      };

      const v2 = normalizeLegacyExecutionEvidence(legacy);
      expect(v2.schemaVersion).toBe(2);
      expect(v2.mode).toBe('MOCK');
      expect(v2.provider).toBe('erp-po');
      expect(v2.externalId).toBe('PO-999');
      expect(v2.evidenceRef).toBe('erp/po_123');
    });

    it('guards against excessive JSON payload bloat (> 64KB)', () => {
      const hugeData = 'x'.repeat(70000);
      const bloatedEvidence = {
        mode: 'LIVE',
        provider: 'rpa',
        operationId: 'op_huge',
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        conflictDetails: { payload: hugeData },
        verification: {
          status: 'VERIFIED',
          method: 'REMOTE_QUERY',
          remoteState: { dump: hugeData },
        },
      };

      const sanitized = sanitizeExecutionEvidenceForPersistence(bloatedEvidence);
      const jsonLen = JSON.stringify(sanitized).length;
      expect(jsonLen).toBeLessThan(65536);
    });
  });

  describe('Part 5: DB Store Persistence Integration', () => {
    it('AutomationOperationStore.createOrReplay sanitizes initial evidence', async () => {
      const mockPrisma = createMockPrismaClient();
      const store = new AutomationOperationStore(mockPrisma);

      const result = await store.createOrReplay(
        { workspaceId: 'ws_1', connectionId: 'conn_1' },
        {
          operationKind: 'ERP_CREATE_PO',
          idempotencyKey: 'idem_key_1',
          payloadHash: 'hash_123',
          mode: 'LIVE',
          provider: 'erp-provider',
          initialEvidence: {
            mode: 'LIVE',
            provider: 'erp-provider',
            operationId: 'op_initial',
            phase: 'READY',
            effect: 'NOT_APPLIED',
            recovery: 'MANUAL',
            normalizedError: {
              class: 'TRANSIENT',
              code: 'TEMP_ERR',
              message: 'Connecting to postgres://admin:pw123@db:5432',
              retryable: true,
              cause: new Error('Secret inner cause'),
            } as any,
          },
        },
      );

      expect(result.kind).toBe('CREATED');
      const savedOp = mockPrisma._opStore[0];
      expect(savedOp).toBeDefined();
      expect(savedOp.evidence.schemaVersion).toBe(2);
      expect(savedOp.evidence.normalizedError.message).toContain('postgres://admin:[REDACTED]@db:5432');
      expect('cause' in savedOp.evidence.normalizedError).toBe(false);
    });

    it('AutomationOperationStore.recordEvidence sanitizes evidence before persisting to DB', async () => {
      const mockPrisma = createMockPrismaClient();
      const store = new AutomationOperationStore(mockPrisma);

      mockPrisma._opStore.push({
        id: 'op_rec_1',
        workspaceId: 'ws_rec',
        version: 1,
        phase: 'READY',
        effect: 'NOT_APPLIED',
        recovery: 'MANUAL',
      });

      const incomingEvidence: ExecutionEvidence = {
        mode: 'LIVE',
        provider: 'erp-po',
        operationId: 'op_rec_1',
        phase: 'COMPLETED',
        effect: 'APPLIED',
        recovery: 'NONE',
        externalId: 'PO-777',
        conflictDetails: {
          bearerToken: 'Bearer secret_token_xyz',
        },
        normalizedError: {
          class: 'NONE',
          code: 'OK',
          message: 'Success',
          retryable: false,
          cause: new Error('Internal leak'),
        } as any,
      };

      await store.recordEvidence('ws_rec', 'op_rec_1', 1, incomingEvidence);

      const updated = mockPrisma._opStore[0];
      expect(updated.phase).toBe('COMPLETED');
      expect(updated.evidence.schemaVersion).toBe(2);
      expect(updated.evidence.conflictDetails.bearerToken).toBe('[REDACTED]');
      expect('cause' in updated.evidence.normalizedError).toBe(false);
    });

    it('ExecutionAttemptStore.finishAttempt sanitizes attempt evidence before persisting to DB', async () => {
      const mockPrisma = createMockPrismaClient();
      const attemptStore = new ExecutionAttemptStore(mockPrisma);

      mockPrisma._attemptStore.push({
        id: 'att_1',
        workspaceId: 'ws_att',
        operationId: 'op_att_1',
        attemptNo: 1,
        attemptType: 'EXECUTE',
        provider: 'playwright-rpa',
        status: 'RUNNING',
        startedAt: new Date(Date.now() - 5000),
      });

      await attemptStore.finishAttempt({
        workspaceId: 'ws_att',
        operationId: 'op_att_1',
        attemptNo: 1,
        status: 'SUCCEEDED',
        effect: 'APPLIED',
        recovery: 'NONE',
        evidence: {
          mode: 'LIVE',
          provider: 'playwright-rpa',
          operationId: 'op_att_1',
          phase: 'COMPLETED',
          effect: 'APPLIED',
          recovery: 'NONE',
          normalizedError: {
            class: 'NONE',
            code: 'OK',
            message: 'All good',
            retryable: false,
            cause: new Error('Sensitive cause'),
          },
          artifacts: [
            {
              ref: '/Users/zls/.runtime-evidence/rpa/job_1/shot.png',
              kind: 'SCREENSHOT_AFTER',
              mimeType: 'image/png',
              capturedAt: new Date().toISOString(),
            },
          ],
        },
      });

      const updatedAttempt = mockPrisma._attemptStore[0];
      expect(updatedAttempt.status).toBe('SUCCEEDED');
      expect(updatedAttempt.evidence.schemaVersion).toBe(2);
      expect('cause' in updatedAttempt.evidence.normalizedError).toBe(false);
      // Host path was normalized to logical ref
      expect(updatedAttempt.evidence.artifacts[0].ref).toBe('rpa/job_1/shot.png');
    });
  });

  describe('Part 6: ActionRouter RPA Result Verification & Side Effect Wiring', () => {
    it('ActionRouter attaches verification, sideEffect, and artifacts to RPA result', async () => {
      const mockRpaAdapter = {
        id: 'playwright-rpa',
        name: 'Mock Playwright RPA',
        supportedModes: ['LIVE'],
        execute: jest.fn(async () => ({
          jobId: 'rpa_job_999',
          status: 'SUCCESS' as const,
          output: {
            skuCode: 'SKU-AMZ-001',
            verified: true,
            changedFields: ['price', 'title'],
          },
          evidenceArtifacts: [
            {
              ref: 'rpa/rpa_job_999/screenshot-after.png',
              kind: 'SCREENSHOT_AFTER' as const,
              mimeType: 'image/png',
              capturedAt: new Date().toISOString(),
              sizeBytes: 1024,
              sha256: 'a'.repeat(64),
            },
          ],
          durationMs: 120,
        })),
      };

      const mockRegistry = {
        get: () => mockRpaAdapter,
        getDefault: () => mockRpaAdapter,
      };

      const router = new ActionRouter(mockRegistry as any);

      const proposal: ActionProposal = {
        id: 'prop_rpa_1',
        workspaceId: 'ws_rpa',
        type: 'RPA',
        name: 'Update Listing',
        payload: {
          workflow: 'UPDATE_LISTING',
          skuCode: 'SKU-AMZ-001',
          price: 29.99,
        },
      };

      const result = await router.dispatch(proposal, {
        workspaceId: 'ws_rpa',
        executionMode: 'LIVE',
      });

      expect(result.status).toBe('SUCCEEDED');
      const evidence = result.executionEvidence;
      expect(evidence).toBeDefined();
      expect(evidence?.schemaVersion).toBe(2);
      expect(evidence?.phase).toBe('COMPLETED');
      expect(evidence?.effect).toBe('APPLIED');
      expect(evidence?.verification?.status).toBe('VERIFIED');
      expect(evidence?.verification?.method).toBe('DOM_ASSERTION');
      expect(evidence?.verification?.targetId).toBe('SKU-AMZ-001');
      expect(evidence?.verification?.matched).toBe(true);

      expect(evidence?.sideEffect?.confirmed).toBe(true);
      expect(evidence?.sideEffect?.resourceType).toBe('LISTING');
      expect(evidence?.sideEffect?.resourceId).toBe('SKU-AMZ-001');

      expect(evidence?.artifacts).toHaveLength(1);
      expect(evidence?.artifacts?.[0].ref).toBe('rpa/rpa_job_999/screenshot-after.png');
      expect(evidence?.artifacts?.[0].kind).toBe('SCREENSHOT_AFTER');
    });
  });
});
