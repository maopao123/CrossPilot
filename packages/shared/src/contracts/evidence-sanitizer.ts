import type {
  AutomationEffect,
  AutomationMode,
  AutomationPhase,
  ExecutionArtifactKind,
  ExecutionEvidence,
  ExecutionEvidenceArtifact,
  ExecutionSideEffectEvidence,
  ExecutionVerificationEvidence,
  PersistedExecutionError,
  RecoveryAction,
  VerificationMethod,
  VerificationStatus,
} from './automation-contracts.js';
import { isSensitiveKey, sanitizeLogData, sanitizeString } from '../logging/log-redaction.js';

/**
 * Maximum serialized size in bytes allowed for persisted execution evidence (64KB).
 * Guards against unbounded metadata bloat in JSON columns.
 */
const MAX_PERSISTED_EVIDENCE_BYTES = 65536;

/**
 * Maximum number of artifacts stored in a single execution evidence record.
 */
const MAX_PERSISTED_ARTIFACTS = 50;

/**
 * Converts an arbitrary host file path or URI into a safe, normalized logical evidence reference.
 * Strictly defends against path traversal and host filesystem escapes.
 *
 * @param inputPath - File path (absolute or relative) or "evidence://..." URI
 * @param baseEvidenceDir - Optional host directory to strip (e.g. "/var/evidence" or project evidence root)
 * @returns Logical reference string e.g. "rpa/job_123/screenshot.png"
 * @throws Error on path traversal or host root escape
 */
export function toSafeEvidenceRef(inputPath: string, baseEvidenceDir?: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('INVALID_EVIDENCE_REF: Evidence path must be a non-empty string');
  }

  let cleaned = inputPath.trim();
  if (!cleaned) {
    throw new Error('INVALID_EVIDENCE_REF: Evidence path cannot be blank');
  }

  // Strip evidence:// scheme prefix
  if (cleaned.startsWith('evidence://')) {
    cleaned = cleaned.slice('evidence://'.length);
  }

  // Normalize Windows backslashes to forward slashes
  cleaned = cleaned.replace(/\\/g, '/');

  // Check for path traversal early
  const rawSegments = cleaned.split('/');
  if (rawSegments.includes('..')) {
    throw new Error('PATH_TRAVERSAL: Path segment ".." is forbidden in evidence ref');
  }

  // Check for Windows drive letter escape
  if (/^[a-zA-Z]:/.test(cleaned)) {
    throw new Error(`HOST_PATH_ESCAPE: Windows drive path not allowed: ${inputPath}`);
  }

  // Strip baseEvidenceDir if provided
  if (baseEvidenceDir) {
    const normalizedBase = baseEvidenceDir.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (cleaned.startsWith(normalizedBase + '/')) {
      cleaned = cleaned.slice(normalizedBase.length + 1);
    } else if (cleaned === normalizedBase) {
      throw new Error('INVALID_EVIDENCE_REF: Path points directly to base directory');
    }
  }

  // Strip common runtime evidence folder prefixes if path is still absolute
  if (cleaned.startsWith('/')) {
    const dotRuntimeIdx = cleaned.indexOf('.runtime-evidence/');
    if (dotRuntimeIdx !== -1) {
      cleaned = cleaned.slice(dotRuntimeIdx + '.runtime-evidence/'.length);
    } else {
      const runtimeIdx = cleaned.indexOf('runtime-evidence/');
      if (runtimeIdx !== -1) {
        cleaned = cleaned.slice(runtimeIdx + 'runtime-evidence/'.length);
      }
    }
  }

  // If path is still absolute, it's a host root escape!
  if (cleaned.startsWith('/')) {
    throw new Error(`HOST_PATH_ESCAPE: Absolute host path escapes evidence root: ${inputPath}`);
  }

  // Remove empty and single-dot segments
  const segments = cleaned.split('/').filter((s) => s && s !== '.');
  if (segments.length === 0) {
    throw new Error('INVALID_EVIDENCE_REF: Evidence ref resulted in empty path');
  }

  if (segments.includes('..')) {
    throw new Error('PATH_TRAVERSAL: Path segment ".." is forbidden in evidence ref');
  }

  return segments.join('/');
}

/**
 * Checks whether a given value is a safe, valid logical evidence reference.
 * Returns true only if the string is non-empty, relative, and contains no path traversal or host prefixes.
 */
export function isSafeEvidenceRef(ref: unknown): boolean {
  if (typeof ref !== 'string') return false;
  const trimmed = ref.trim();
  if (!trimmed || trimmed.length > 1024) return false;
  if (trimmed.includes('\0')) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(trimmed)) return false;

  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some((s) => !s || s === '.' || s === '..')) {
    return false;
  }
  return true;
}

/**
 * Sanitizes and canonicalizes an ExecutionEvidence object prior to database persistence.
 *
 * Enforces:
 * 1. Schema version 2.
 * 2. normalizedError strictly mapped to PersistedExecutionError with `cause`, `stack`, and raw objects stripped.
 * 3. Secret redaction (Bearer tokens, passwords, cookies, connection strings, Shopify tokens).
 * 4. Logical reference sanitization for all attached artifacts.
 * 5. Size guards against unbounded JSON column growth.
 */
export function sanitizeExecutionEvidenceForPersistence(evidence: unknown): ExecutionEvidence {
  if (!evidence || typeof evidence !== 'object') {
    throw new Error('INVALID_EVIDENCE: Execution evidence must be a non-null object');
  }

  const raw = evidence as Record<string, any>;

  const mode: AutomationMode = (raw.mode === 'MOCK' || raw.mode === 'SIMULATOR' || raw.mode === 'LIVE')
    ? raw.mode
    : 'LIVE';

  const phase: AutomationPhase = (
    raw.phase === 'READY' ||
    raw.phase === 'SUBMITTED' ||
    raw.phase === 'VERIFYING' ||
    raw.phase === 'COMPLETED' ||
    raw.phase === 'FAILED' ||
    raw.phase === 'NEEDS_ATTENTION'
  )
    ? raw.phase
    : 'FAILED';

  const effect: AutomationEffect = (
    raw.effect === 'APPLIED' ||
    raw.effect === 'NOT_APPLIED' ||
    raw.effect === 'PARTIALLY_APPLIED' ||
    raw.effect === 'UNKNOWN'
  )
    ? raw.effect
    : 'UNKNOWN';

  const recovery: RecoveryAction = (
    raw.recovery === 'NONE' ||
    raw.recovery === 'RETRY' ||
    raw.recovery === 'QUERY' ||
    raw.recovery === 'REAUTHORIZE' ||
    raw.recovery === 'MANUAL'
  )
    ? raw.recovery
    : 'MANUAL';

  const provider = raw.provider ? sanitizeString(String(raw.provider)) : 'unknown';
  const operationId = raw.operationId ? sanitizeString(String(raw.operationId)) : '';

  // 1. Process and strip normalizedError
  let normalizedError: PersistedExecutionError | undefined = undefined;
  if (raw.normalizedError && typeof raw.normalizedError === 'object') {
    const rawErr = raw.normalizedError;
    const sanitizedMsg = sanitizeString(String(rawErr.message || ''));
    normalizedError = {
      class: String(rawErr.class || raw.errorClass || 'UNKNOWN'),
      code: String(rawErr.code || raw.errorCode || 'UNKNOWN'),
      message: sanitizedMsg.length > 1000 ? sanitizedMsg.substring(0, 1000) : sanitizedMsg,
      retryable: Boolean(rawErr.retryable),
      ...(rawErr.provider ? { provider: sanitizeString(String(rawErr.provider)) } : {}),
      ...(typeof rawErr.originalStatus === 'number' ? { originalStatus: rawErr.originalStatus } : {}),
    };
    // Explicitly verify `cause` is not attached
  }

  // 2. Process artifacts
  let artifacts: ExecutionEvidenceArtifact[] | undefined = undefined;
  if (Array.isArray(raw.artifacts) && raw.artifacts.length > 0) {
    const sanitizedList: ExecutionEvidenceArtifact[] = [];
    const capped = raw.artifacts.slice(0, MAX_PERSISTED_ARTIFACTS);

    for (const item of capped) {
      if (!item || typeof item !== 'object') continue;
      let safeRef = '';
      try {
        if (isSafeEvidenceRef(item.ref)) {
          safeRef = item.ref.trim();
        } else if (typeof item.ref === 'string') {
          safeRef = toSafeEvidenceRef(item.ref);
        }
      } catch {
        // Skip invalid or escaping artifact refs
        continue;
      }

      if (!safeRef) continue;

      const kind = (item.kind && typeof item.kind === 'string' ? item.kind : 'OTHER') as ExecutionArtifactKind;
      const mimeType = sanitizeString(String(item.mimeType || 'application/octet-stream'));
      const capturedAt = item.capturedAt ? String(item.capturedAt) : new Date().toISOString();
      const sizeBytes = typeof item.sizeBytes === 'number' && item.sizeBytes >= 0 ? item.sizeBytes : undefined;
      const sha256 = typeof item.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(item.sha256)
        ? item.sha256
        : undefined;

      const metadata = item.metadata && typeof item.metadata === 'object'
        ? (sanitizeLogData(item.metadata) as Record<string, unknown>)
        : undefined;

      sanitizedList.push({
        ref: safeRef,
        kind,
        mimeType,
        capturedAt,
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(metadata ? { metadata } : {}),
      });
    }

    if (sanitizedList.length > 0) {
      artifacts = sanitizedList;
    }
  }

  // 3. Process verification evidence
  let verification: ExecutionVerificationEvidence | undefined = undefined;
  if (raw.verification && typeof raw.verification === 'object') {
    const rawVer = raw.verification;
    const vStatus: VerificationStatus = (
      rawVer.status === 'VERIFIED' ||
      rawVer.status === 'FAILED' ||
      rawVer.status === 'INCONCLUSIVE' ||
      rawVer.status === 'PENDING'
    )
      ? rawVer.status
      : 'INCONCLUSIVE';

    const vMethod: VerificationMethod = (
      rawVer.method === 'REMOTE_QUERY' ||
      rawVer.method === 'DOM_ASSERTION' ||
      rawVer.method === 'WEBHOOK' ||
      rawVer.method === 'RECONCILIATION'
    )
      ? rawVer.method
      : 'REMOTE_QUERY';

    verification = {
      status: vStatus,
      method: vMethod,
      ...(rawVer.targetId ? { targetId: sanitizeString(String(rawVer.targetId)) } : {}),
      ...(typeof rawVer.matched === 'boolean' ? { matched: rawVer.matched } : {}),
      ...(typeof rawVer.queryLatencyMs === 'number' ? { queryLatencyMs: rawVer.queryLatencyMs } : {}),
      ...(rawVer.remoteState && typeof rawVer.remoteState === 'object'
        ? { remoteState: sanitizeLogData(rawVer.remoteState) as Record<string, unknown> }
        : {}),
      ...(Array.isArray(rawVer.assertionResults)
        ? { assertionResults: sanitizeLogData(rawVer.assertionResults) as any[] }
        : {}),
      ...(rawVer.details && typeof rawVer.details === 'object'
        ? { details: sanitizeLogData(rawVer.details) as Record<string, unknown> }
        : {}),
    };
  }

  // 4. Process side effect evidence
  let sideEffect: ExecutionSideEffectEvidence | undefined = undefined;
  if (raw.sideEffect && typeof raw.sideEffect === 'object') {
    const rawEffect = raw.sideEffect;
    sideEffect = {
      confirmed: Boolean(rawEffect.confirmed),
      ...(rawEffect.occurredAt ? { occurredAt: String(rawEffect.occurredAt) } : {}),
      ...(rawEffect.resourceType ? { resourceType: sanitizeString(String(rawEffect.resourceType)) } : {}),
      ...(rawEffect.resourceId ? { resourceId: sanitizeString(String(rawEffect.resourceId)) } : {}),
      ...(rawEffect.details && typeof rawEffect.details === 'object'
        ? { details: sanitizeLogData(rawEffect.details) as Record<string, unknown> }
        : {}),
    };
  }

  // Sanitize any custom additional properties so arbitrary caller metadata is preserved safely
  const reservedKeys = new Set([
    'schemaVersion',
    'mode',
    'provider',
    'operationId',
    'phase',
    'effect',
    'recovery',
    'traceId',
    'errorCode',
    'errorClass',
    'normalizedError',
    'externalId',
    'requestId',
    'verifiedAt',
    'evidenceRef',
    'conflictDetails',
    'syncError',
    'manualResolution',
    'verification',
    'sideEffect',
    'artifacts',
  ]);

  const extraProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!reservedKeys.has(k)) {
      if (isSensitiveKey(k)) {
        if (
          k.toLowerCase() === 'credentials' &&
          typeof v === 'object' &&
          v !== null &&
          !Array.isArray(v)
        ) {
          extraProps[k] = sanitizeLogData(v);
        } else {
          extraProps[k] = '[REDACTED]';
        }
      } else {
        extraProps[k] = sanitizeLogData(v);
      }
    }
  }

  // 5. Build clean evidence record
  const result: ExecutionEvidence & Record<string, unknown> = {
    ...extraProps,
    schemaVersion: 2,
    mode,
    provider,
    operationId,
    phase,
    effect,
    recovery,
    ...(raw.traceId ? { traceId: sanitizeString(String(raw.traceId)) } : {}),
    ...(raw.errorCode ? { errorCode: sanitizeString(String(raw.errorCode)) } : {}),
    ...(raw.errorClass ? { errorClass: raw.errorClass } : {}),
    ...(normalizedError ? { normalizedError } : {}),
    ...(raw.externalId ? { externalId: sanitizeString(String(raw.externalId)) } : {}),
    ...(raw.requestId ? { requestId: sanitizeString(String(raw.requestId)) } : {}),
    ...(raw.evidenceRef
      ? {
          evidenceRef: (() => {
            try {
              return toSafeEvidenceRef(String(raw.evidenceRef));
            } catch {
              return sanitizeString(String(raw.evidenceRef));
            }
          })(),
        }
      : {}),
    ...(raw.conflictDetails && typeof raw.conflictDetails === 'object'
      ? { conflictDetails: sanitizeLogData(raw.conflictDetails) as Record<string, unknown> }
      : {}),
    ...(raw.syncError ? { syncError: sanitizeString(String(raw.syncError)) } : {}),
    ...(raw.manualResolution && typeof raw.manualResolution === 'object'
      ? { manualResolution: sanitizeLogData(raw.manualResolution) as Record<string, unknown> }
      : {}),
    ...(verification ? { verification } : {}),
    ...(sideEffect ? { sideEffect } : {}),
    ...(artifacts ? { artifacts } : {}),
  };

  // 6. Size guard: clamp serialized payload size
  let serialized = JSON.stringify(result);
  if (serialized.length > MAX_PERSISTED_EVIDENCE_BYTES) {
    // Progressively prune non-essential verbose data
    if (result.verification?.remoteState) {
      delete result.verification.remoteState;
    }
    if (result.verification?.assertionResults) {
      delete result.verification.assertionResults;
    }
    if (result.artifacts) {
      for (const art of result.artifacts) {
        delete art.metadata;
      }
    }
    if (result.conflictDetails) {
      result.conflictDetails = { pruned: true, reason: 'PAYLOAD_TOO_LARGE' };
    }
  }

  return result;
}

/**
 * Normalizes any legacy V1 ExecutionEvidence into canonical V2 ExecutionEvidence.
 */
export function normalizeLegacyExecutionEvidence(evidence: unknown): ExecutionEvidence {
  return sanitizeExecutionEvidenceForPersistence(evidence);
}
