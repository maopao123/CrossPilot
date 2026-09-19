export class AutomationOperationConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'AutomationOperationConflictError';
  }
}

export class AutomationOperationNotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'AutomationOperationNotFoundError';
  }
}

import { PrismaClient, Prisma, AutomationOperation } from '@prisma/client';
import { type ExecutionEvidence, sanitizeExecutionEvidenceForPersistence } from '@crosspilot/shared';

export interface AutomationScope {
  workspaceId: string;
  connectionId: string;
}

export interface CreateOperationCommand {
  actionId?: string;
  operationKind: string;
  idempotencyKey: string;
  payloadHash: string;
  approvedPayloadHash?: string;
  mode: string;
  provider: string;
  initialEvidence?: ExecutionEvidence;
}

export type CreateOrReplayResult =
  | { kind: 'CREATED'; operation: AutomationOperation }
  | { kind: 'REPLAYED'; operation: AutomationOperation };

import { ExecutionAttemptStore } from './execution-attempt-store.js';
import { ExecutionAuditStore } from './execution-audit-store.js';

export class AutomationOperationStore {
  readonly attempts: ExecutionAttemptStore;
  readonly audits: ExecutionAuditStore;

  constructor(private readonly prisma: PrismaClient) {
    this.attempts = new ExecutionAttemptStore(this.prisma);
    this.audits = new ExecutionAuditStore(this.prisma);
  }

  /**
   * Idempotently creates an automation operation or replays an existing one.
   * Enforces DB-level unique constraint (P2002):
   * - Same idempotencyKey + same payloadHash => REPLAYED
   * - Same idempotencyKey + different payloadHash => IDEMPOTENCY_CONFLICT (409)
   */
  async createOrReplay(
    scope: AutomationScope,
    command: CreateOperationCommand,
  ): Promise<CreateOrReplayResult> {
    const { workspaceId, connectionId } = scope;
    const { actionId, operationKind, idempotencyKey, payloadHash, approvedPayloadHash, mode, provider } = command;

    const sanitizedInitialEvidence = command.initialEvidence
      ? sanitizeExecutionEvidenceForPersistence(command.initialEvidence)
      : undefined;

    try {
      const created = await this.prisma.automationOperation.create({
        data: {
          workspaceId,
          actionId,
          connectionId,
          operationKind,
          idempotencyKey,
          payloadHash,
          approvedPayloadHash,
          mode,
          provider,
          phase: sanitizedInitialEvidence?.phase || 'READY',
          effect: sanitizedInitialEvidence?.effect || 'NOT_APPLIED',
          recovery: sanitizedInitialEvidence?.recovery || 'MANUAL',
          externalId: sanitizedInitialEvidence?.externalId,
          evidence: (sanitizedInitialEvidence as any) || Prisma.DbNull,
          version: 1,
          attemptCount: 0,
        },
      });
      return { kind: 'CREATED', operation: created };
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint violation: find existing record
        const existing = await this.prisma.automationOperation.findFirst({
          where: {
            workspaceId,
            connectionId,
            operationKind,
            idempotencyKey,
          },
        });

        if (!existing) {
          // Action-level conflict:同一 action 同 operationKind 已存在其他操作
          const actionExisting = await this.prisma.automationOperation.findFirst({
            where: {
              workspaceId,
              actionId,
              operationKind,
            },
          });
          if (actionExisting) {
            if (actionExisting.payloadHash === payloadHash) {
              return { kind: 'REPLAYED', operation: actionExisting };
            }
            throw new AutomationOperationConflictError(
              `IDEMPOTENCY_CONFLICT: action '${actionId}' already has an operation '${operationKind}' with a different payload`,
            );
          }
          throw err;
        }

        if (existing.payloadHash === payloadHash) {
          return { kind: 'REPLAYED', operation: existing };
        }

        throw new AutomationOperationConflictError(
          `IDEMPOTENCY_CONFLICT: idempotencyKey '${idempotencyKey}' already executed with different payloadHash (existing: ${existing.payloadHash}, incoming: ${payloadHash})`,
        );
      }
      throw err;
    }
  }

  /**
   * Atomically claims an operation with an optimistic concurrency control (OCC) lease.
   * If version != expectedVersion, or record does not exist, throws ConflictException.
   */
  async claim(
    workspaceId: string,
    operationId: string,
    expectedVersion: number,
    leaseOwner: string,
    leaseDurationMs: number = 30000,
    targetPhase?: string,
  ): Promise<AutomationOperation> {
    const leaseUntil = new Date(Date.now() + leaseDurationMs);

    const updateData: any = {
      version: { increment: 1 },
      leaseOwner,
      leaseUntil,
      attemptCount: { increment: 1 },
    };
    if (targetPhase) {
      updateData.phase = targetPhase;
    }

    const result = await this.prisma.automationOperation.updateMany({
      where: {
        id: operationId,
        workspaceId,
        version: expectedVersion,
      },
      data: updateData,
    });

    if (result.count === 0) {
      const current = await this.prisma.automationOperation.findFirst({
        where: { id: operationId, workspaceId },
      });
      if (!current) {
        throw new AutomationOperationNotFoundError(`Automation operation '${operationId}' not found in workspace '${workspaceId}'`);
      }
      throw new AutomationOperationConflictError(
        `OCC_VERSION_CONFLICT: operation '${operationId}' expected version ${expectedVersion} but current version is ${current.version}`,
      );
    }

    const updated = await this.prisma.automationOperation.findUnique({
      where: { id: operationId },
    });
    return updated!;
  }

  /**
   * Records execution evidence and transitions operation phase/effect/recovery.
   */
  async recordEvidence(
    workspaceId: string,
    operationId: string,
    expectedVersion: number,
    evidence: ExecutionEvidence,
  ): Promise<AutomationOperation> {
    const sanitizedEvidence = sanitizeExecutionEvidenceForPersistence(evidence);

    const result = await this.prisma.automationOperation.updateMany({
      where: {
        id: operationId,
        workspaceId,
        version: expectedVersion,
      },
      data: {
        version: { increment: 1 },
        phase: sanitizedEvidence.phase,
        effect: sanitizedEvidence.effect,
        recovery: sanitizedEvidence.recovery,
        externalId: sanitizedEvidence.externalId || null,
        lastErrorCode: sanitizedEvidence.errorCode || null,
        evidence: (sanitizedEvidence as any) || Prisma.DbNull,
        leaseOwner: null,
        leaseUntil: null,
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.automationOperation.findFirst({
        where: { id: operationId, workspaceId },
      });
      if (!current) {
        throw new AutomationOperationNotFoundError(`Automation operation '${operationId}' not found in workspace '${workspaceId}'`);
      }
      throw new AutomationOperationConflictError(
        `OCC_VERSION_CONFLICT: cannot record evidence, operation '${operationId}' version changed from ${expectedVersion} to ${current.version}`,
      );
    }

    const updated = await this.prisma.automationOperation.findUnique({
      where: { id: operationId },
    });
    return updated!;
  }

  /**
   * Finds an operation strictly scoped to workspace.
   */
  async findById(workspaceId: string, operationId: string): Promise<AutomationOperation | null> {
    return this.prisma.automationOperation.findFirst({
      where: {
        id: operationId,
        workspaceId,
      },
    });
  }

  /**
   * Lists due operations for background worker recovery scan:
   * - Operations in READY state
   * - Operations whose lease has expired while in SUBMITTED / VERIFYING phase
   */
  async listDue(now: Date = new Date(), limit: number = 20): Promise<AutomationOperation[]> {
    return this.prisma.automationOperation.findMany({
      where: {
        OR: [
          {
            phase: 'READY',
            AND: [
              {
                OR: [
                  { nextAttemptAt: null },
                  { nextAttemptAt: { lte: now } },
                ],
              },
              {
                OR: [
                  { leaseUntil: null },
                  { leaseUntil: { lt: now } },
                ],
              },
            ],
          },
          {
            phase: { in: ['SUBMITTED', 'VERIFYING'] },
            OR: [
              { leaseUntil: null },
              { leaseUntil: { lt: now } },
            ],
          },
          {
            phase: 'FAILED',
            recovery: { in: ['RETRY', 'QUERY'] },
            AND: [
              {
                OR: [
                  { nextAttemptAt: null },
                  { nextAttemptAt: { lte: now } },
                ],
              },
              {
                OR: [
                  { leaseUntil: null },
                  { leaseUntil: { lt: now } },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Lists operations in NEEDS_ATTENTION phase requiring human review/intervention.
   */
  async listNeedsAttention(workspaceId: string, limit: number = 50): Promise<AutomationOperation[]> {
    return this.prisma.automationOperation.findMany({
      where: {
        workspaceId,
        phase: 'NEEDS_ATTENTION',
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }
}

