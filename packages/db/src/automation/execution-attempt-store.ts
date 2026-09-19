import { PrismaClient, Prisma, ExecutionAttempt } from '@prisma/client';
import {
  sanitizeString,
  sanitizeLogData,
  RuntimeEvents,
  runtimeLogger,
  StructuredLogger,
} from '@crosspilot/shared';

export type ExecutionAttemptType =
  | 'EXECUTE'
  | 'RETRY'
  | 'QUERY'
  | 'VERIFY'
  | 'RECOVERY'
  | (string & {});

export type ExecutionAttemptStatus =
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNKNOWN'
  | (string & {});

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
  status: ExecutionAttemptStatus;
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
   * If an attempt for (operationId, attemptNo) already exists, returns the existing record.
   * Invariant: 1 successful claim = 1 ExecutionAttempt row.
   */
  async startAttempt(params: StartAttemptParams): Promise<ExecutionAttempt> {
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
        const existing = await this.prisma.executionAttempt.findUnique({
          where: {
            operationId_attemptNo: {
              operationId: params.operationId,
              attemptNo: params.attemptNo,
            },
          },
        });
        if (existing) {
          return existing;
        }
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
   */
  async finishAttempt(params: FinishAttemptParams): Promise<ExecutionAttempt | null> {
    const finishedAt = params.finishedAt ?? new Date();

    // Sanitize and truncate error message (max 1000 characters)
    let sanitizedErrorMsg: string | null = null;
    if (params.errorMessage) {
      const sanitized = sanitizeString(params.errorMessage);
      sanitizedErrorMsg = sanitized.length > 1000 ? sanitized.substring(0, 1000) : sanitized;
    }

    // Sanitize evidence payload
    let sanitizedEvidence: any = Prisma.DbNull;
    if (params.evidence) {
      sanitizedEvidence = sanitizeLogData(params.evidence);
    }

    // Find existing attempt to calculate durationMs if not provided
    const existing = await this.prisma.executionAttempt.findUnique({
      where: {
        operationId_attemptNo: {
          operationId: params.operationId,
          attemptNo: params.attemptNo,
        },
      },
    });

    let durationMs = params.durationMs ?? null;
    if (durationMs == null && existing?.startedAt) {
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

    return this.prisma.executionAttempt.findUnique({
      where: {
        operationId_attemptNo: {
          operationId: params.operationId,
          attemptNo: params.attemptNo,
        },
      },
    });
  }

  /**
   * Fail-safe wrapper around finishAttempt.
   * Historical record failures MUST NEVER abort business execution or duplicate external writes.
   */
  async safeFinishAttempt(
    params: FinishAttemptParams,
    logger?: StructuredLogger,
  ): Promise<ExecutionAttempt | null> {
    try {
      const attempt = await this.finishAttempt(params);
      const isFailed = params.status === 'FAILED' || params.status === 'TIMEOUT';
      (logger ?? runtimeLogger).info({
        event: isFailed
          ? RuntimeEvents.EXECUTION_ATTEMPT_FAILED
          : RuntimeEvents.EXECUTION_ATTEMPT_COMPLETED,
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
