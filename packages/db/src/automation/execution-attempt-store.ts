import { PrismaClient, Prisma, ExecutionAttempt } from '@prisma/client';
import {
  sanitizeString,
  sanitizeLogData,
  sanitizeExecutionEvidenceForPersistence,
  RuntimeEvents,
  runtimeLogger,
  StructuredLogger,
} from '@crosspilot/shared';
import {
  AutomationOperationNotFoundError,
  AutomationOperationConflictError,
} from './automation-operation-store.js';

export const VALID_EXECUTION_ATTEMPT_TYPES = [
  'EXECUTE',
  'RETRY',
  'QUERY',
  'VERIFY',
  'RECOVERY',
] as const;

export type ExecutionAttemptType = (typeof VALID_EXECUTION_ATTEMPT_TYPES)[number];

export const VALID_EXECUTION_ATTEMPT_TERMINAL_STATUSES = [
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
  'UNKNOWN',
] as const;

export type ExecutionAttemptTerminalStatus =
  (typeof VALID_EXECUTION_ATTEMPT_TERMINAL_STATUSES)[number];

export const VALID_EXECUTION_ATTEMPT_STATUSES = [
  'RUNNING',
  ...VALID_EXECUTION_ATTEMPT_TERMINAL_STATUSES,
] as const;

export type ExecutionAttemptStatus =
  (typeof VALID_EXECUTION_ATTEMPT_STATUSES)[number];

export interface StartAttemptParams {
  workspaceId: string;
  operationId: string;
  attemptNo: number;
  attemptType: ExecutionAttemptType;
  provider: string;
  workerId?: string | null;
  traceId?: string | null;
  startedAt?: Date;
}

export interface FinishAttemptParams {
  workspaceId: string;
  operationId: string;
  attemptNo: number;
  status: ExecutionAttemptTerminalStatus;
  finishedAt?: Date;
  durationMs?: number | null;
  errorClass?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  effect?: string | null;
  recovery?: string | null;
  evidence?: Record<string, any> | null;
}

export class ExecutionAttemptStore {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Idempotently starts an execution attempt.
   * Invariant:
   * 1 concrete external execution/query attempt = 1 ExecutionAttempt row.
   *
   * Validates:
   * 1. Parent AutomationOperation exists in the specified workspaceId (P0 workspace isolation).
   * 2. attemptType is within the strict controlled union.
   * 3. On duplicate P2002 conflict: verifies workspace match and attempt identity (attemptType, provider).
   */
  async startAttempt(params: StartAttemptParams): Promise<ExecutionAttempt> {
    if (!VALID_EXECUTION_ATTEMPT_TYPES.includes(params.attemptType)) {
      throw new Error(
        `Invalid execution attempt type: '${params.attemptType}'. Allowed types: ${VALID_EXECUTION_ATTEMPT_TYPES.join(', ')}`,
      );
    }

    // Step 1: Validate parent operation strictly exists in the requested workspace
    const parentOp = await this.prisma.automationOperation.findFirst({
      where: {
        id: params.operationId,
        workspaceId: params.workspaceId,
      },
    });

    if (!parentOp) {
      throw new AutomationOperationNotFoundError(
        `Automation operation '${params.operationId}' not found in workspace '${params.workspaceId}'`,
      );
    }

    const startedAt = params.startedAt ?? new Date();

    try {
      return await this.prisma.executionAttempt.create({
        data: {
          workspaceId: params.workspaceId,
          operationId: params.operationId,
          attemptNo: params.attemptNo,
          attemptType: params.attemptType,
          provider: params.provider,
          workerId: params.workerId || null,
          traceId: params.traceId || null,
          status: 'RUNNING',
          startedAt,
        },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Step 2: Query existing attempt strictly scoped to workspace
        const existing = await this.prisma.executionAttempt.findFirst({
          where: {
            workspaceId: params.workspaceId,
            operationId: params.operationId,
            attemptNo: params.attemptNo,
          },
        });

        if (!existing) {
          // P2002 hit on (operationId, attemptNo) but does not match this workspace
          throw new AutomationOperationConflictError(
            `Execution attempt ${params.attemptNo} conflict for operation '${params.operationId}' in workspace '${params.workspaceId}'`,
          );
        }

        // Step 3: Verify attempt identity (attemptType and provider must match)
        if (existing.attemptType !== params.attemptType || existing.provider !== params.provider) {
          throw new AutomationOperationConflictError(
            `Attempt identity mismatch for operation '${params.operationId}' attempt ${params.attemptNo}: ` +
              `existing (type=${existing.attemptType}, provider=${existing.provider}) vs ` +
              `incoming (type=${params.attemptType}, provider=${params.provider})`,
          );
        }

        return existing;
      }
      throw err;
    }
  }

  /**
   * Fail-safe wrapper around startAttempt.
   * Historical record failures MUST NEVER abort business execution or duplicate external writes.
   */
  async safeStartAttempt(
    params: StartAttemptParams,
    logger?: StructuredLogger,
  ): Promise<ExecutionAttempt | null> {
    try {
      const attempt = await this.startAttempt(params);
      (logger ?? runtimeLogger).info({
        event: RuntimeEvents.EXECUTION_ATTEMPT_STARTED,
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attempt: params.attemptNo,
        attemptType: params.attemptType,
        provider: params.provider,
        ...(params.traceId ? { traceId: params.traceId } : {}),
      });
      return attempt;
    } catch (err: any) {
      (logger ?? runtimeLogger).warn({
        event: RuntimeEvents.EXECUTION_ATTEMPT_RECORD_FAILED,
        action: 'startAttempt',
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attempt: params.attemptNo,
        error: err?.message || String(err),
      });
      return null;
    }
  }

  /**
   * Finalizes an execution attempt with sanitized error and evidence.
   * Enforces workspace scoping for all existing lookups and updates.
   * Rejects non-terminal statuses such as 'RUNNING'.
   */
  async finishAttempt(params: FinishAttemptParams): Promise<ExecutionAttempt | null> {
    if (!VALID_EXECUTION_ATTEMPT_TERMINAL_STATUSES.includes(params.status)) {
      throw new Error(
        `Invalid execution attempt terminal status: '${params.status}'. Allowed terminal statuses: ${VALID_EXECUTION_ATTEMPT_TERMINAL_STATUSES.join(', ')}`,
      );
    }

    const finishedAt = params.finishedAt ?? new Date();

    // Sanitize and truncate error message (max 1000 characters)
    let sanitizedErrorMsg: string | null = null;
    if (params.errorMessage) {
      const sanitized = sanitizeString(params.errorMessage);
      sanitizedErrorMsg = sanitized.length > 1000 ? sanitized.substring(0, 1000) : sanitized;
    }

    // Sanitize evidence payload using canonical persistence sanitizer
    let sanitizedEvidence: any = Prisma.DbNull;
    if (params.evidence) {
      sanitizedEvidence = sanitizeExecutionEvidenceForPersistence(params.evidence);
    }

    // Find existing attempt strictly scoped to workspace
    const existing = await this.prisma.executionAttempt.findFirst({
      where: {
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attemptNo: params.attemptNo,
      },
    });

    if (!existing) {
      return null;
    }

    let durationMs = params.durationMs ?? null;
    if (durationMs == null && existing.startedAt) {
      durationMs = Math.max(0, finishedAt.getTime() - existing.startedAt.getTime());
    }

    const updateData: any = {
      status: params.status,
      finishedAt,
      durationMs,
      errorClass: params.errorClass || null,
      errorCode: params.errorCode || null,
      errorMessage: sanitizedErrorMsg,
      effect: params.effect || null,
      recovery: params.recovery || null,
      evidence: sanitizedEvidence,
    };

    const updated = await this.prisma.executionAttempt.updateMany({
      where: {
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attemptNo: params.attemptNo,
      },
      data: updateData,
    });

    if (updated.count === 0) {
      return null;
    }

    return this.prisma.executionAttempt.findFirst({
      where: {
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attemptNo: params.attemptNo,
      },
    });
  }

  /**
   * Fail-safe wrapper around finishAttempt.
   * Historical record failures MUST NEVER abort business execution or duplicate external writes.
   *
   * Logging rule:
   * status === 'SUCCEEDED' -> EXECUTION_ATTEMPT_COMPLETED
   * other terminal statuses (FAILED, TIMEOUT, CANCELLED, UNKNOWN) -> EXECUTION_ATTEMPT_FAILED
   */
  async safeFinishAttempt(
    params: FinishAttemptParams,
    logger?: StructuredLogger,
  ): Promise<ExecutionAttempt | null> {
    try {
      const attempt = await this.finishAttempt(params);
      const isSucceeded = params.status === 'SUCCEEDED';
      (logger ?? runtimeLogger).info({
        event: isSucceeded
          ? RuntimeEvents.EXECUTION_ATTEMPT_COMPLETED
          : RuntimeEvents.EXECUTION_ATTEMPT_FAILED,
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attempt: params.attemptNo,
        status: params.status,
        durationMs: attempt?.durationMs ?? params.durationMs,
        ...(params.errorClass ? { errorClass: params.errorClass } : {}),
      });
      return attempt;
    } catch (err: any) {
      (logger ?? runtimeLogger).warn({
        event: RuntimeEvents.EXECUTION_ATTEMPT_RECORD_FAILED,
        action: 'finishAttempt',
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        attempt: params.attemptNo,
        error: err?.message || String(err),
      });
      return null;
    }
  }

  /**
   * Lists attempts for an operation strictly scoped to a workspaceId.
   * Ordered by attemptNo ASC.
   */
  async listAttempts(workspaceId: string, operationId: string): Promise<ExecutionAttempt[]> {
    return this.prisma.executionAttempt.findMany({
      where: {
        workspaceId,
        operationId,
      },
      orderBy: {
        attemptNo: 'asc',
      },
    });
  }

  /**
   * Alias for listAttempts.
   */
  async findAttempts(workspaceId: string, operationId: string): Promise<ExecutionAttempt[]> {
    return this.listAttempts(workspaceId, operationId);
  }

  /**
   * Retrieves a single attempt strictly scoped to workspace.
   */
  async getAttempt(
    workspaceId: string,
    operationId: string,
    attemptNo: number,
  ): Promise<ExecutionAttempt | null> {
    return this.prisma.executionAttempt.findFirst({
      where: {
        workspaceId,
        operationId,
        attemptNo,
      },
    });
  }
}
