import fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  ExecutionArtifactKind,
  ExecutionArtifactSensitivity,
  ExecutionEvidenceArtifact,
  getDefaultArtifactSensitivity,
  RuntimeEvents,
  runtimeLogger,
  sanitizeString,
  StructuredLogger,
  toSafeEvidenceRef,
  isSafeEvidenceRef,
} from '@crosspilot/shared';

export interface BuildEvidenceArtifactParams {
  filePath: string;
  kind: ExecutionArtifactKind;
  mimeType?: string;
  capturedAt?: string;
  sensitivity?: ExecutionArtifactSensitivity;
  metadata?: Record<string, unknown>;
  baseEvidenceDir?: string;
}

/**
 * Infers an appropriate MIME type from the file extension.
 */
export function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.zip':
      return 'application/zip';
    case '.json':
      return 'application/json';
    case '.html':
    case '.htm':
      return 'text/html';
    case '.har':
      return 'application/json';
    case '.log':
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Builds a validated, fail-safe ExecutionEvidenceArtifact from a local file.
 *
 * Enforces:
 * - Strictly fails closed (returns null, NEVER reads/stats file) if filePath escapes baseEvidenceDir or contains traversal.
 * - Strictly redacts host absolute file paths from failure logs (only logs safe ref, kind, and reason).
 * - Computes sizeBytes and SHA-256 hash. If reading or statting a valid safe file fails (e.g. missing),
 *   logs a structured warning and returns a degraded artifact record without throwing.
 */
export function buildEvidenceArtifact(
  params: BuildEvidenceArtifactParams,
  logger?: StructuredLogger,
): ExecutionEvidenceArtifact | null {
  const { filePath, kind, baseEvidenceDir } = params;

  if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
    return null;
  }

  // 1. Enforce base evidence directory containment (Strict Fail-Closed)
  if (baseEvidenceDir) {
    const resolvedBase = path.resolve(baseEvidenceDir);
    const resolvedFile = path.resolve(filePath);

    if (resolvedFile === resolvedBase) {
      (logger ?? runtimeLogger).warn({
        event: RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED,
        kind,
        reason: 'ROOT_ESCAPE',
        error: 'Path points directly to base evidence directory',
      });
      return null;
    }

    if (!resolvedFile.startsWith(resolvedBase + path.sep)) {
      (logger ?? runtimeLogger).warn({
        event: RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED,
        kind,
        reason: 'ROOT_ESCAPE',
        error: 'File path escapes base evidence directory',
      });
      return null;
    }
  }

  // 2. Enforce safe logical reference extraction without path traversal
  let ref: string;
  try {
    ref = toSafeEvidenceRef(filePath, baseEvidenceDir);
  } catch (err: any) {
    const isTraversal = err?.message?.includes('TRAVERSAL') || err?.message?.includes('..');
    (logger ?? runtimeLogger).warn({
      event: RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED,
      kind,
      reason: isTraversal ? 'PATH_TRAVERSAL' : 'ROOT_ESCAPE',
      error: 'Unsafe artifact path rejected',
    });
    return null;
  }

  const mimeType = params.mimeType || inferMimeType(filePath);
  const capturedAt = params.capturedAt || new Date().toISOString();
  const sensitivity: ExecutionArtifactSensitivity =
    params.sensitivity || getDefaultArtifactSensitivity(kind);

  let sizeBytes: number | undefined = undefined;
  let sha256: string | undefined = undefined;

  try {
    const stats = fs.statSync(filePath);
    sizeBytes = stats.size;
    const fileBuffer = fs.readFileSync(filePath);
    sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    (logger ?? runtimeLogger).info({
      event: RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_CAPTURED,
      ref,
      kind,
      sizeBytes,
      sha256,
    });
  } catch (err: any) {
    const isNotFound = err?.code === 'ENOENT';
    (logger ?? runtimeLogger).warn({
      event: RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED,
      ref,
      kind,
      reason: isNotFound ? 'FILE_NOT_FOUND' : 'STAT_FAILED',
      error: err?.message ? sanitizeString(err.message) : 'File read failure',
    });
  }

  return {
    ref,
    kind,
    mimeType,
    sensitivity,
    capturedAt,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(sha256 ? { sha256 } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };
}

/**
 * Resolves a safe logical evidence reference to an absolute filesystem path.
 * Strictly verifies that the resolved path does not escape the provided base evidence directory.
 */
export function resolveEvidenceArtifactPath(ref: string, baseEvidenceDir: string): string {
  if (!isSafeEvidenceRef(ref)) {
    throw new Error(`PATH_TRAVERSAL: Invalid or unsafe evidence ref: "${ref}"`);
  }

  const resolvedBase = path.resolve(baseEvidenceDir);
  const resolvedPath = path.resolve(resolvedBase, ref);

  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new Error(`HOST_PATH_ESCAPE: Evidence ref "${ref}" escapes base directory "${baseEvidenceDir}"`);
  }

  return resolvedPath;
}

/**
 * Ensures an evidence directory exists with user-only permissions (0700) where supported.
 */
export function ensureSafeEvidenceDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  } else {
    try {
      fs.chmodSync(dirPath, 0o700);
    } catch {
      // Ignore on filesystems without POSIX permissions support
    }
  }
}

/**
 * Sets safe user-only read/write permissions (0600) on an artifact file where supported.
 */
export function setSafeFilePermissions(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {
    // Ignore on filesystems without POSIX permissions support
  }
}
