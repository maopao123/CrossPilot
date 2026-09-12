/**
 * Workflow Checkpoint Stores (Epic 3 Phase 6.1)
 *
 * Implements durable workflow state persistence, optimistic concurrency control (OCC),
 * crash recovery, and state isolation across service instances and process restarts.
 *
 * Provides:
 * 1. InMemoryWorkflowCheckpointStore: Local/test in-memory store with OCC.
 * 2. PersistentWorkflowCheckpointStore: Production durable store supporting disk/file persistence
 *    and database adapter integration (AgentTask / AgentStep / Approval).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DailyOperationWorkflowState } from '@crosspilot/shared';
import {
  IWorkflowCheckpointStore,
  IWorkflowDatabaseAdapter,
  CheckpointVersionConflictError,
  WorkflowNotFoundError,
  PersistenceUnavailableError,
} from './workflow.types.js';
import { SensitiveDataGuard } from './sensitive-data.guard.js';

function isPersistedSkuUuid(value?: string | null): value is string {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

// ============================================================================
// 1. In-Memory Checkpoint Store (Testing & Ephemeral Execution)
// ============================================================================

export class InMemoryWorkflowCheckpointStore implements IWorkflowCheckpointStore {
  private readonly store = new Map<string, string>();

  public async save(
    state: DailyOperationWorkflowState,
    options?: { expectedVersion?: number }
  ): Promise<void> {
    const existingRaw = this.store.get(state.taskId);
    let nextVersion = 1;

    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as DailyOperationWorkflowState;
      const currentVersion = existing.checkpointVersion ?? 1;

      if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
        throw new CheckpointVersionConflictError(state.taskId, options.expectedVersion, currentVersion);
      }

      nextVersion = currentVersion + 1;
    } else {
      if (
        options?.expectedVersion !== undefined &&
        options.expectedVersion !== 0 &&
        options.expectedVersion !== 1
      ) {
        throw new CheckpointVersionConflictError(state.taskId, options.expectedVersion, 0);
      }
      nextVersion = state.checkpointVersion ?? 1;
    }

    state.checkpointVersion = nextVersion;
    state.checkpointedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    // Deep clone state via JSON serialization to prevent in-memory mutability leak
    const serialized = JSON.stringify(state);
    this.store.set(state.taskId, serialized);
  }

  public async get(taskId: string): Promise<DailyOperationWorkflowState | null> {
    const serialized = this.store.get(taskId);
    if (!serialized) {
      return null;
    }
    return JSON.parse(serialized) as DailyOperationWorkflowState;
  }

  public async delete(taskId: string): Promise<void> {
    this.store.delete(taskId);
  }

  public async has(taskId: string): Promise<boolean> {
    return this.store.has(taskId);
  }

  public clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// 2. Persistent Workflow Checkpoint Store (Production Durable Persistence)
// ============================================================================

export interface PersistentStoreOptions {
  storageDir?: string;
  databaseAdapter?: IWorkflowDatabaseAdapter;
  backend?: 'memory' | 'file' | 'postgres';
}

export class PersistentWorkflowCheckpointStore implements IWorkflowCheckpointStore {
  private readonly storageDir: string;
  private readonly databaseAdapter?: IWorkflowDatabaseAdapter;
  private readonly backend: 'memory' | 'file' | 'postgres';

  constructor(options?: PersistentStoreOptions) {
    const resolvedBackend =
      options?.backend ??
      (process.env.WORKFLOW_CHECKPOINT_BACKEND as 'memory' | 'file' | 'postgres' | undefined) ??
      (options?.databaseAdapter ? 'postgres' : process.env.NODE_ENV === 'production' ? 'postgres' : 'file');

    this.backend = resolvedBackend;
    this.databaseAdapter = options?.databaseAdapter;
    this.storageDir =
      options?.storageDir ??
      process.env.WORKFLOW_CHECKPOINT_DIR ??
      path.join(process.cwd(), '.checkpoints', 'wf05');

    // Fail-safe: In production or when backend is explicitly postgres, databaseAdapter MUST be present
    if (this.backend === 'postgres' && !this.databaseAdapter) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_UNAVAILABLE: Production requires PostgreSQL database adapter for workflow persistence. File fallback is disabled.'
      );
    }

    if (this.backend === 'file') {
      this.ensureDirectory(this.storageDir);
    }
  }

  public getStorageDir(): string {
    return this.storageDir;
  }

  public getDatabaseAdapter(): IWorkflowDatabaseAdapter | undefined {
    return this.databaseAdapter;
  }

  public getBackend(): 'memory' | 'file' | 'postgres' {
    return this.backend;
  }

  public async save(
    state: DailyOperationWorkflowState,
    options?: { expectedVersion?: number }
  ): Promise<void> {
    const taskId = state.taskId;

    // Check existing state to enforce Optimistic Concurrency Control (OCC)
    const existing = await this.get(taskId);
    let nextVersion = 1;

    if (existing) {
      const currentVersion = existing.checkpointVersion ?? 1;
      if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
        throw new CheckpointVersionConflictError(taskId, options.expectedVersion, currentVersion);
      }
      nextVersion = currentVersion + 1;
    } else {
      if (
        options?.expectedVersion !== undefined &&
        options.expectedVersion !== 0 &&
        options.expectedVersion !== 1
      ) {
        throw new CheckpointVersionConflictError(taskId, options.expectedVersion, 0);
      }
      nextVersion = state.checkpointVersion ?? 1;
    }

    state.checkpointVersion = nextVersion;
    state.checkpointedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    // Redact credentials, secrets, tokens before durable persistence
    const scrubbedState = SensitiveDataGuard.scrub(state);
    if (!scrubbedState.workflowVersion) {
      scrubbedState.workflowVersion = state.workflowVersion ?? 'WF05_V1';
    }

    // 1. Database Adapter Persistence (Postgres Source of Truth)
    if (this.backend === 'postgres' || this.databaseAdapter) {
      if (!this.databaseAdapter) {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_UNAVAILABLE: Database adapter is required for postgres workflow persistence.'
        );
      }

      const approvals = scrubbedState.recommendedActions
        .filter((a) => a.executionMode === 'APPROVAL_REQUIRED')
        .map((a) => {
          const decision = scrubbedState.approvalState.decisions.find((d) => d.actionId === a.actionId);
          return {
            actionId: a.actionId,
            actionType: a.actionType,
            status: a.status,
            requestedPayload: JSON.stringify(a.payload ?? a),
            decidedBy: decision?.decidedBy,
            note: decision?.note,
          };
        });

      await this.databaseAdapter.saveTask(
        {
          taskId: scrubbedState.taskId,
          workspaceId: scrubbedState.workspaceId,
          taskType: 'DAILY_OPERATION_WF05',
          status: scrubbedState.status,
          activeSkuId: isPersistedSkuUuid(scrubbedState.skuIds?.[0])
            ? scrubbedState.skuIds[0]
            : null,
          inputJson: JSON.stringify(
            SensitiveDataGuard.scrub({
              workspaceId: scrubbedState.workspaceId,
              marketplaceId: scrubbedState.marketplaceId,
              mode: scrubbedState.mode,
              skuIds: scrubbedState.skuIds,
              dateRange: scrubbedState.dateRange,
              baselinePeriod: scrubbedState.baselinePeriod,
            })
          ),
          resultJson: JSON.stringify(scrubbedState),
          stepTraces: scrubbedState.stepTraces,
          approvals,
          checkpointVersion: scrubbedState.checkpointVersion ?? nextVersion,
          workflowVersion: scrubbedState.workflowVersion,
          currentStep: scrubbedState.currentStep,
          checkpointedAt: scrubbedState.checkpointedAt,
        },
        options
      );
      return;
    }

    // 2. File / Disk Persistence (Default Durable Storage for Dev/Test)
    this.ensureDirectory(this.storageDir);
    const targetFile = this.getFilePath(taskId);
    const serialized = JSON.stringify(scrubbedState, null, 2);

    // Atomic write pattern: write to unique tmp file, then atomic rename
    const tmpFile = `${targetFile}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await fs.promises.writeFile(tmpFile, serialized, 'utf-8');

    try {
      await fs.promises.rename(tmpFile, targetFile);
    } catch {
      // Windows defensive fallback for EPERM / locks
      await fs.promises.copyFile(tmpFile, targetFile);
      await fs.promises.unlink(tmpFile).catch(() => {});
    }
  }

  public async get(taskId: string): Promise<DailyOperationWorkflowState | null> {
    // 1. Database Adapter Lookup
    if (this.backend === 'postgres' || this.databaseAdapter) {
      if (!this.databaseAdapter) {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_UNAVAILABLE: Database adapter is required for postgres workflow persistence.'
        );
      }
      const task = await this.databaseAdapter.getTask(taskId);
      if (!task || !task.resultJson) {
        return null;
      }
      const parsed = JSON.parse(task.resultJson) as DailyOperationWorkflowState;
      if (task.checkpointVersion && !parsed.checkpointVersion) {
        parsed.checkpointVersion = task.checkpointVersion;
      }
      if (task.workflowVersion && !parsed.workflowVersion) {
        parsed.workflowVersion = task.workflowVersion;
      }
      if (task.currentStep && !parsed.currentStep) {
        parsed.currentStep = task.currentStep as any;
      }
      return parsed;
    }

    // 2. File / Disk Lookup
    const filePath = this.getFilePath(taskId);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as DailyOperationWorkflowState;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  public async delete(taskId: string): Promise<void> {
    if (this.backend === 'postgres' || this.databaseAdapter) {
      if (!this.databaseAdapter) {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_UNAVAILABLE: Database adapter is required for postgres workflow persistence.'
        );
      }
      await this.databaseAdapter.deleteTask(taskId);
      return;
    }

    const filePath = this.getFilePath(taskId);
    try {
      await fs.promises.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  public async has(taskId: string): Promise<boolean> {
    if (this.backend === 'postgres' || this.databaseAdapter) {
      if (!this.databaseAdapter) {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_UNAVAILABLE: Database adapter is required for postgres workflow persistence.'
        );
      }
      return await this.databaseAdapter.hasTask(taskId);
    }

    const filePath = this.getFilePath(taskId);
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private getFilePath(taskId: string): string {
    // Sanitize taskId for safe filename
    const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageDir, `${safeId}.checkpoint.json`);
  }

  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================================================
// 3. Postgres Workflow Checkpoint Store (Convenience Dedicated Class)
// ============================================================================

export class PostgresWorkflowCheckpointStore implements IWorkflowCheckpointStore {
  private readonly underlying: PersistentWorkflowCheckpointStore;

  constructor(databaseAdapter: IWorkflowDatabaseAdapter) {
    if (!databaseAdapter) {
      throw new PersistenceUnavailableError(
        'PERSISTENCE_UNAVAILABLE: PostgresWorkflowCheckpointStore requires a valid IWorkflowDatabaseAdapter.'
      );
    }
    this.underlying = new PersistentWorkflowCheckpointStore({
      backend: 'postgres',
      databaseAdapter,
    });
  }

  public async save(
    state: DailyOperationWorkflowState,
    options?: { expectedVersion?: number }
  ): Promise<void> {
    return this.underlying.save(state, options);
  }

  public async get(taskId: string): Promise<DailyOperationWorkflowState | null> {
    return this.underlying.get(taskId);
  }

  public async delete(taskId: string): Promise<void> {
    return this.underlying.delete(taskId);
  }

  public async has(taskId: string): Promise<boolean> {
    return this.underlying.has(taskId);
  }

  public getDatabaseAdapter(): IWorkflowDatabaseAdapter {
    return this.underlying.getDatabaseAdapter()!;
  }
}
