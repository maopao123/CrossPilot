import { ExecutionErrorClass, NormalizedExecutionError } from './execution-error.js';

export type AutomationMode = 'MOCK' | 'SIMULATOR' | 'LIVE';

export type AutomationPhase =
  | 'READY'
  | 'SUBMITTED'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_ATTENTION';

export type AutomationEffect =
  | 'APPLIED'
  | 'NOT_APPLIED'
  | 'PARTIALLY_APPLIED'
  | 'UNKNOWN';

export type RecoveryAction =
  | 'NONE'
  | 'RETRY'
  | 'QUERY'
  | 'REAUTHORIZE'
  | 'MANUAL';

export type VerificationStatus = 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE' | 'PENDING';

export type VerificationMethod =
  | 'REMOTE_QUERY'
  | 'DOM_ASSERTION'
  | 'WEBHOOK'
  | 'RECONCILIATION';

export interface ExecutionVerificationEvidence {
  status: VerificationStatus;
  method: VerificationMethod;
  targetId?: string;
  matched?: boolean;
  queryLatencyMs?: number;
  remoteState?: Record<string, unknown>;
  assertionResults?: Array<{ assertion: string; passed: boolean; message?: string }>;
  details?: Record<string, unknown>;
}

export interface ExecutionSideEffectEvidence {
  confirmed: boolean;
  occurredAt?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export type ExecutionArtifactKind =
  | 'SCREENSHOT_BEFORE'
  | 'SCREENSHOT_AFTER'
  | 'SCREENSHOT_FAILURE'
  | 'DOM_SNAPSHOT'
  | 'NETWORK_HAR'
  | 'PLAYWRIGHT_TRACE'
  | 'LOG_CHUNK'
  | 'PAYLOAD_DUMP'
  | 'OTHER';

export interface ExecutionEvidenceArtifact {
  ref: string;
  kind: ExecutionArtifactKind;
  mimeType: string;
  sizeBytes?: number;
  sha256?: string;
  capturedAt: string;
  metadata?: Record<string, unknown>;
}

export interface PersistedExecutionError {
  class: ExecutionErrorClass | string;
  code: string;
  message: string;
  retryable: boolean;
  provider?: string;
  originalStatus?: number;
}

export interface ExecutionEvidence {
  schemaVersion?: 2;
  mode: AutomationMode;
  provider: string;
  operationId: string;
  phase: AutomationPhase;
  effect: AutomationEffect;
  recovery: RecoveryAction;

  traceId?: string;
  errorCode?: string;
  errorClass?: ExecutionErrorClass;
  normalizedError?: PersistedExecutionError | NormalizedExecutionError;

  externalId?: string;
  requestId?: string;
  verifiedAt?: string;
  evidenceRef?: string;

  conflictDetails?: Record<string, unknown>;
  syncError?: string;
  manualResolution?: Record<string, unknown>;

  verification?: ExecutionVerificationEvidence;
  sideEffect?: ExecutionSideEffectEvidence;
  artifacts?: ExecutionEvidenceArtifact[];
}

export * from './execution-error.js';
export * from './evidence-sanitizer.js';
