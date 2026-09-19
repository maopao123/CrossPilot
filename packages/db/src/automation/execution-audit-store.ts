import { PrismaClient, Prisma, ExecutionAudit } from '@prisma/client';
import {
  sanitizeString,
  sanitizeLogData,
  RuntimeEvents,
  runtimeLogger,
  StructuredLogger,
} from '@crosspilot/shared';
import { AutomationOperationNotFoundError } from './automation-operation-store.js';

export const VALID_EXECUTION_AUDIT_ACTIONS = [
  'FORCE_ADOPT',
  'DISMISS',
  'RETRY_SYNC',
] as const;

export type ExecutionAuditAction = (typeof VALID_EXECUTION_AUDIT_ACTIONS)[number];

export const VALID_EXECUTION_AUDIT_ACTOR_TYPES = [
  'USER',
  'SYSTEM',
] as const;

export type ExecutionAuditActorType = (typeof VALID_EXECUTION_AUDIT_ACTOR_TYPES)[number];

export interface ExecutionAuditState {
  phase: string;
  effect: string;
  recovery: string;
  lastErrorCode?: string | null;
  externalId?: string | null;
  operationVersion: number;
  actionStatus?: string | null;
}

export interface AppendAuditParams {
  workspaceId: string;
  operationId: string;
  actionId?: string | null;
  actorId: string;
  actorType?: ExecutionAuditActorType;
  auditAction: ExecutionAuditAction;
  reason?: string | null;
  beforeState: ExecutionAuditState;
  afterState: ExecutionAuditState;
  metadata?: Record<string, any> | null;
  traceId?: string | null;
}

export class ExecutionAuditStore {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(
    tx?: PrismaClient | Prisma.TransactionClient,
  ): PrismaClient | Prisma.TransactionClient {
    return tx ?? this.prisma;
  }

  /**
   * Appends an immutable audit event for human/administrative mutations.
   *
   * Invariants:
   * 1. Append-only: No updates, deletes, or overwrites permitted.
   * 2. Workspace isolation: Parent AutomationOperation must exist in target workspaceId.
   * 3. Actor authenticity: actorId must be a valid, authenticated non-empty string.
   * 4. Secret redaction: reason and metadata are sanitized before writing to DB.
   * 5. Fail-closed: DB write errors are logged and rethrown so wrapping transactions abort.
   */
  async appendAudit(
    params: AppendAuditParams,
    tx?: PrismaClient | Prisma.TransactionClient,
    logger?: StructuredLogger,
  ): Promise<ExecutionAudit> {
    if (!VALID_EXECUTION_AUDIT_ACTIONS.includes(params.auditAction)) {
      throw new Error(
        `Invalid execution audit action: '${params.auditAction}'. Allowed actions: ${VALID_EXECUTION_AUDIT_ACTIONS.join(', ')}`,
      );
    }

    const actorType: ExecutionAuditActorType = params.actorType ?? 'USER';
    if (!VALID_EXECUTION_AUDIT_ACTOR_TYPES.includes(actorType)) {
      throw new Error(
        `Invalid execution audit actor type: '${actorType}'. Allowed types: ${VALID_EXECUTION_AUDIT_ACTOR_TYPES.join(', ')}`,
      );
    }

    if (!params.actorId || typeof params.actorId !== 'string' || !params.actorId.trim()) {
      throw new Error('Authenticated actorId is required to record an execution audit');
    }

    const client = this.getClient(tx);

    // Workspace isolation check: verify parent operation exists in requested workspace
    const parentOp = await client.automationOperation.findFirst({
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

    // Sanitize and truncate reason (max 2000 characters)
    let sanitizedReason: string | null = null;
    if (params.reason) {
      const sanitized = sanitizeString(params.reason);
      sanitizedReason = sanitized.length > 2000 ? sanitized.substring(0, 2000) : sanitized;
    }

    // Sanitize metadata payload
    let sanitizedMetadata: any = Prisma.DbNull;
    if (params.metadata) {
      sanitizedMetadata = sanitizeLogData(params.metadata);
    }

    try {
      const record = await client.executionAudit.create({
        data: {
          workspaceId: params.workspaceId,
          operationId: params.operationId,
          actionId: params.actionId || null,
          actorId: params.actorId.trim(),
          actorType,
          auditAction: params.auditAction,
          reason: sanitizedReason,
          beforeState: params.beforeState as any,
          afterState: params.afterState as any,
          metadata: sanitizedMetadata,
          traceId: params.traceId || null,
        },
      });

      (logger ?? runtimeLogger).info({
        event: RuntimeEvents.EXECUTION_AUDIT_RECORDED,
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        auditId: record.id,
        auditAction: params.auditAction,
        actorId: params.actorId.trim(),
        actorType,
        ...(params.traceId ? { traceId: params.traceId } : {}),
      });

      return record;
    } catch (err: any) {
      (logger ?? runtimeLogger).error({
        event: RuntimeEvents.EXECUTION_AUDIT_RECORD_FAILED,
        action: 'appendAudit',
        workspaceId: params.workspaceId,
        operationId: params.operationId,
        auditAction: params.auditAction,
        actorId: params.actorId,
        error: err?.message || String(err),
      });
      // Fail closed: human mutation MUST rollback if audit fails to persist
      throw err;
    }
  }

  /**
   * Lists audits for an operation strictly scoped to a workspaceId.
   * Ordered by createdAt ASC, id ASC.
   */
  async listAudits(
    workspaceId: string,
    operationId: string,
    tx?: PrismaClient | Prisma.TransactionClient,
  ): Promise<ExecutionAudit[]> {
    const client = this.getClient(tx);
    return client.executionAudit.findMany({
      where: {
        workspaceId,
        operationId,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  /**
   * Retrieves a single audit strictly scoped to workspace.
   */
  async getAudit(
    workspaceId: string,
    auditId: string,
    tx?: PrismaClient | Prisma.TransactionClient,
  ): Promise<ExecutionAudit | null> {
    const client = this.getClient(tx);
    return client.executionAudit.findFirst({
      where: {
        workspaceId,
        id: auditId,
      },
    });
  }
}
