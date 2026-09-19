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

export interface ExecutionEvidence {
  mode: AutomationMode;
  provider: string;
  operationId: string;
  phase: AutomationPhase;
  effect: AutomationEffect;
  recovery: RecoveryAction;
  errorCode?: string;
  errorClass?: ExecutionErrorClass;
  normalizedError?: NormalizedExecutionError;
  externalId?: string;
  requestId?: string;
  verifiedAt?: string;
  evidenceRef?: string;
  conflictDetails?: Record<string, unknown>;
  syncError?: string;
  manualResolution?: Record<string, unknown>;
}

export * from './execution-error.js';
