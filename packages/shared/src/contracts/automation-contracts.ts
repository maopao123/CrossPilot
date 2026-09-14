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
  externalId?: string;
  requestId?: string;
  verifiedAt?: string;
  evidenceRef?: string;
}
