import type {
  AutomationEffect,
  AutomationMode,
  AutomationPhase,
  ExecutionArtifactKind,
  ExecutionArtifactSensitivity,
  ExecutionEvidence,
  ExecutionEvidenceArtifact,
  ExecutionSideEffectEvidence,
  ExecutionVerificationEvidence,
  PersistedExecutionError,
  RecoveryAction,
  RemoteSideEffectState,
  VerificationMethod,
  VerificationStatus,
} from './automation-contracts.js';
import { VALID_EXECUTION_ARTIFACT_KINDS } from './automation-contracts.js';
import { isSensitiveKey, sanitizeLogData, sanitizeString } from '../logging/log-redaction.js';

/**
 * Maximum serialized size in UTF-8 bytes allowed for persisted execution evidence (64KB).
 * Strictly guards against unbounded metadata bloat in JSON columns across ASCII and multibyte characters.
 */
const MAX_PERSISTED_EVIDENCE_BYTES = 65536;

/**
 * Maximum number of artifacts stored in a single execution evidence record.
 */
const MAX_PERSISTED_ARTIFACTS = 50;

/**
 * Determines default artifact sensitivity classification based on artifact kind.
 */
export function getDefaultArtifactSensitivity(kind: ExecutionArtifactKind): ExecutionArtifactSensitivity {
  switch (kind) {
    case 'SCREENSHOT_BEFORE':
    case 'SCREENSHOT_AFTER':
    case 'SCREENSHOT_FAILURE':
    case 'DOM_SNAPSHOT':
    case 'PAYLOAD_DUMP':
      return 'SENSITIVE';
    case 'NETWORK_HAR':
    case 'PLAYWRIGHT_TRACE':
    case 'LOG_CHUNK':
    case 'OTHER':
    default:
      return 'INTERNAL';
  }
}

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
 * 2. Strict Core Runtime Truth validation (throws INVALID_EVIDENCE if mode, phase, effect, recovery, provider, operationId are invalid).
 * 3. normalizedError strictly mapped to PersistedExecutionError with `cause`, `stack`, and raw objects stripped.
 * 4. Secret redaction (Bearer tokens, passwords, cookies, connection strings, Shopify tokens).
 * 5. Logical reference sanitization for all attached artifacts + artifact kind allowlist and sensitivity.
 * 6. Drops invalid/unsafe legacy evidenceRef without fail-open leaks.
 * 7. Hard UTF-8 byte size limit (<= 64KB) with progressive multi-stage pruning.
 */
export function sanitizeExecutionEvidenceForPersistence(evidence: unknown): ExecutionEvidence {
  if (!evidence || typeof evidence !== 'object') {
    throw new Error('INVALID_EVIDENCE: Execution evidence must be a non-null object');
  }

  const raw = evidence as Record<string, any>;

  // Strict validation of Core Runtime Truth fields
  if (raw.mode !== 'MOCK' && raw.mode !== 'SIMULATOR' && raw.mode !== 'LIVE') {
    throw new Error(`INVALID_EVIDENCE: Invalid or missing mode: "${raw.mode}"`);
  }
  const mode: AutomationMode = raw.mode;

  if (
    raw.phase !== 'READY' &&
    raw.phase !== 'SUBMITTED' &&
    raw.phase !== 'VERIFYING' &&
    raw.phase !== 'COMPLETED' &&
    raw.phase !== 'FAILED' &&
    raw.phase !== 'NEEDS_ATTENTION'
  ) {
    throw new Error(`INVALID_EVIDENCE: Invalid or missing phase: "${raw.phase}"`);
  }
  const phase: AutomationPhase = raw.phase;

  if (
    raw.effect !== 'APPLIED' &&
    raw.effect !== 'NOT_APPLIED' &&
    raw.effect !== 'PARTIALLY_APPLIED' &&
    raw.effect !== 'UNKNOWN'
  ) {
    throw new Error(`INVALID_EVIDENCE: Invalid or missing effect: "${raw.effect}"`);
  }
  const effect: AutomationEffect = raw.effect;

  if (
    raw.recovery !== 'NONE' &&
    raw.recovery !== 'RETRY' &&
    raw.recovery !== 'QUERY' &&
    raw.recovery !== 'REAUTHORIZE' &&
    raw.recovery !== 'MANUAL'
  ) {
    throw new Error(`INVALID_EVIDENCE: Invalid or missing recovery: "${raw.recovery}"`);
  }
  const recovery: RecoveryAction = raw.recovery;

  if (!raw.provider || typeof raw.provider !== 'string' || !raw.provider.trim()) {
    throw new Error(`INVALID_EVIDENCE: Invalid or missing provider: "${raw.provider}"`);
  }
  const provider = sanitizeString(raw.provider.trim()).substring(0, 200);

  if (!raw.operationId || typeof raw.operationId !== 'string' || !raw.operationId.trim()) {
    throw new Error(`INVALID_EVIDENCE: Invalid or missing operationId: "${raw.operationId}"`);
  }
  const operationId = sanitizeString(raw.operationId.trim()).substring(0, 256);

  // 1. Process and strip normalizedError
  let normalizedError: PersistedExecutionError | undefined = undefined;
  if (raw.normalizedError && typeof raw.normalizedError === 'object') {
    const rawErr = raw.normalizedError;
    const sanitizedMsg = sanitizeString(String(rawErr.message || ''));
    normalizedError = {
      class: String(rawErr.class || raw.errorClass || 'UNKNOWN'),
      code: String(rawErr.code || raw.errorCode || 'UNKNOWN'),
      message: sanitizedMsg.length > 500 ? sanitizedMsg.substring(0, 500) : sanitizedMsg,
      retryable: Boolean(rawErr.retryable),
      ...(rawErr.provider ? { provider: sanitizeString(String(rawErr.provider)).substring(0, 200) } : {}),
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

      const kindStr = String(item.kind || '');
      const kind: ExecutionArtifactKind = (VALID_EXECUTION_ARTIFACT_KINDS as readonly string[]).includes(kindStr)
        ? (kindStr as ExecutionArtifactKind)
        : 'OTHER';

      const mimeType = sanitizeString(String(item.mimeType || 'application/octet-stream')).substring(0, 100);
      const capturedAt = item.capturedAt ? String(item.capturedAt).substring(0, 50) : new Date().toISOString();
      const sizeBytes = typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0
        ? item.sizeBytes
        : undefined;
      const sha256 = typeof item.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(item.sha256)
        ? item.sha256
        : undefined;

      const sensitivity: ExecutionArtifactSensitivity =
        item.sensitivity === 'INTERNAL' || item.sensitivity === 'SENSITIVE'
          ? item.sensitivity
          : getDefaultArtifactSensitivity(kind);

      const metadata = item.metadata && typeof item.metadata === 'object'
        ? (sanitizeLogData(item.metadata) as Record<string, unknown>)
        : undefined;

      sanitizedList.push({
        ref: safeRef,
        kind,
        mimeType,
        capturedAt,
        sensitivity,
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
      ...(rawVer.targetId ? { targetId: sanitizeString(String(rawVer.targetId)).substring(0, 256) } : {}),
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
    const remoteState: RemoteSideEffectState | undefined =
      rawEffect.remoteState === 'CONFIRMED_APPLIED' ||
      rawEffect.remoteState === 'CONFIRMED_NOT_APPLIED' ||
      rawEffect.remoteState === 'UNKNOWN'
        ? rawEffect.remoteState
        : undefined;

    sideEffect = {
      confirmed: Boolean(rawEffect.confirmed),
      ...(typeof rawEffect.writeExecuted === 'boolean' ? { writeExecuted: rawEffect.writeExecuted } : {}),
      ...(remoteState ? { remoteState } : {}),
      ...(rawEffect.occurredAt ? { occurredAt: String(rawEffect.occurredAt).substring(0, 50) } : {}),
      ...(rawEffect.resourceType ? { resourceType: sanitizeString(String(rawEffect.resourceType)).substring(0, 100) } : {}),
      ...(rawEffect.resourceId ? { resourceId: sanitizeString(String(rawEffect.resourceId)).substring(0, 256) } : {}),
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

  // Safely sanitize evidenceRef: strictly drop if invalid/unsafe (never fallback to host paths)
  let safeEvidenceRef: string | undefined = undefined;
  if (raw.evidenceRef && typeof raw.evidenceRef === 'string') {
    try {
      const normalizedRef = toSafeEvidenceRef(raw.evidenceRef);
      if (isSafeEvidenceRef(normalizedRef)) {
        safeEvidenceRef = normalizedRef;
      }
    } catch {
      // Strictly drop unsafe, traversing, or escaping evidenceRef
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
    ...(raw.traceId ? { traceId: sanitizeString(String(raw.traceId)).substring(0, 256) } : {}),
    ...(raw.errorCode ? { errorCode: sanitizeString(String(raw.errorCode)).substring(0, 100) } : {}),
    ...(raw.errorClass ? { errorClass: raw.errorClass } : {}),
    ...(normalizedError ? { normalizedError } : {}),
    ...(raw.externalId ? { externalId: sanitizeString(String(raw.externalId)).substring(0, 512) } : {}),
    ...(raw.requestId ? { requestId: sanitizeString(String(raw.requestId)).substring(0, 256) } : {}),
    ...(raw.verifiedAt ? { verifiedAt: String(raw.verifiedAt).substring(0, 50) } : {}),
    ...(safeEvidenceRef ? { evidenceRef: safeEvidenceRef } : {}),
    ...(raw.conflictDetails && typeof raw.conflictDetails === 'object'
      ? { conflictDetails: sanitizeLogData(raw.conflictDetails) as Record<string, unknown> }
      : {}),
    ...(raw.syncError ? { syncError: sanitizeString(String(raw.syncError)).substring(0, 1000) } : {}),
    ...(raw.manualResolution && typeof raw.manualResolution === 'object'
      ? { manualResolution: sanitizeLogData(raw.manualResolution) as Record<string, unknown> }
      : {}),
    ...(verification ? { verification } : {}),
    ...(sideEffect ? { sideEffect } : {}),
    ...(artifacts ? { artifacts } : {}),
  };

  // 6. Strict UTF-8 Byte Size Guard (<= 64KB hard limit)
  let byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) {
    return result;
  }

  // Stage 1: Prune remoteState
  if (result.verification?.remoteState) {
    delete result.verification.remoteState;
    byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;
  }

  // Stage 2: Prune assertionResults & verification details
  if (result.verification?.assertionResults) {
    delete result.verification.assertionResults;
  }
  if (result.verification?.details) {
    delete result.verification.details;
  }
  byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;

  // Stage 3: Prune metadata from artifacts
  if (result.artifacts) {
    for (const art of result.artifacts) {
      delete art.metadata;
    }
    byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;
  }

  // Stage 4: Prune conflictDetails
  if (result.conflictDetails) {
    result.conflictDetails = { pruned: true, reason: 'PAYLOAD_TOO_LARGE' };
    byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;
  }

  // Stage 5: Prune extra properties
  for (const k of Object.keys(extraProps)) {
    delete (result as any)[k];
  }
  byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;

  // Stage 6: Prune manualResolution non-essential fields
  if (result.manualResolution) {
    result.manualResolution = { pruned: true, reason: 'PAYLOAD_TOO_LARGE' };
    byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;
  }

  // Stage 7: Shrink normalized error message and syncError
  if (result.normalizedError) {
    result.normalizedError.message = result.normalizedError.message.substring(0, 100);
  }
  if (result.syncError) {
    result.syncError = result.syncError.substring(0, 100);
  }
  byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;

  // Stage 8: Truncate artifacts array
  if (result.artifacts && result.artifacts.length > 0) {
    while (result.artifacts.length > 0 && byteLength > MAX_PERSISTED_EVIDENCE_BYTES) {
      result.artifacts.pop();
      byteLength = Buffer.byteLength(JSON.stringify(result), 'utf8');
    }
    if (result.artifacts.length === 0) {
      delete result.artifacts;
    }
    if (byteLength <= MAX_PERSISTED_EVIDENCE_BYTES) return result;
  }

  // Stage 9: Minimal fallback (Absolute Hard Guarantee)
  const minimal: ExecutionEvidence = {
    schemaVersion: 2,
    mode: result.mode,
    provider: result.provider.substring(0, 100),
    operationId: result.operationId.substring(0, 100),
    phase: result.phase,
    effect: result.effect,
    recovery: result.recovery,
    ...(result.traceId ? { traceId: result.traceId.substring(0, 100) } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode.substring(0, 100) } : {}),
    ...(result.errorClass ? { errorClass: result.errorClass } : {}),
    normalizedError: {
      class: result.normalizedError?.class || 'UNKNOWN',
      code: result.normalizedError?.code || 'UNKNOWN',
      message: 'Payload exceeded storage limit; truncated',
      retryable: Boolean(result.normalizedError?.retryable),
    },
  };
  return minimal;
}

/**
 * Normalizes any legacy V1 ExecutionEvidence into canonical V2 ExecutionEvidence.
 */
export function normalizeLegacyExecutionEvidence(evidence: unknown): ExecutionEvidence {
  return sanitizeExecutionEvidenceForPersistence(evidence);
}
