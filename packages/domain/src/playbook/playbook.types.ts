import { ErrorCodes } from '@crosspilot/shared';
import type { PlaybookRecord, PlaybookRunRecord } from '@crosspilot/shared';

export class PlaybookError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PlaybookError';
  }
}

export function playbookNotFound(id: string): PlaybookError {
  return new PlaybookError(ErrorCodes.PLAYBOOK_NOT_FOUND, `Playbook not found: ${id}`);
}

export function playbookRunNotFound(runId: string): PlaybookError {
  return new PlaybookError(ErrorCodes.PLAYBOOK_RUN_NOT_FOUND, `Playbook run not found: ${runId}`);
}

export interface IPlaybookStore {
  createPlaybook(record: PlaybookRecord): Promise<PlaybookRecord>;
  findPlaybookById(workspaceId: string, id: string): Promise<PlaybookRecord | null>;
  findPlaybookByNameVersion(
    workspaceId: string,
    name: string,
    version: string,
  ): Promise<PlaybookRecord | null>;
  listPlaybooks(workspaceId: string): Promise<PlaybookRecord[]>;
  createRun(record: PlaybookRunRecord): Promise<PlaybookRunRecord>;
  findRunByRunId(workspaceId: string, runId: string): Promise<PlaybookRunRecord | null>;
  updateRun(
    workspaceId: string,
    runId: string,
    patch: Partial<Pick<PlaybookRunRecord, 'status' | 'output' | 'updatedAt'>>,
  ): Promise<PlaybookRunRecord>;
}

export class InMemoryPlaybookStore implements IPlaybookStore {
  private playbooks: PlaybookRecord[] = [];
  private runs: PlaybookRunRecord[] = [];

  async createPlaybook(record: PlaybookRecord): Promise<PlaybookRecord> {
    this.playbooks.push(record);
    return record;
  }

  async findPlaybookById(workspaceId: string, id: string): Promise<PlaybookRecord | null> {
    return this.playbooks.find((p) => p.workspaceId === workspaceId && p.id === id) ?? null;
  }

  async findPlaybookByNameVersion(
    workspaceId: string,
    name: string,
    version: string,
  ): Promise<PlaybookRecord | null> {
    return (
      this.playbooks.find(
        (p) => p.workspaceId === workspaceId && p.name === name && p.version === version,
      ) ?? null
    );
  }

  async listPlaybooks(workspaceId: string): Promise<PlaybookRecord[]> {
    return this.playbooks.filter((p) => p.workspaceId === workspaceId);
  }

  async createRun(record: PlaybookRunRecord): Promise<PlaybookRunRecord> {
    this.runs.push(record);
    return record;
  }

  async findRunByRunId(workspaceId: string, runId: string): Promise<PlaybookRunRecord | null> {
    return this.runs.find((r) => r.workspaceId === workspaceId && r.runId === runId) ?? null;
  }

  async updateRun(
    workspaceId: string,
    runId: string,
    patch: Partial<Pick<PlaybookRunRecord, 'status' | 'output' | 'updatedAt'>>,
  ): Promise<PlaybookRunRecord> {
    const found = await this.findRunByRunId(workspaceId, runId);
    if (!found) throw playbookRunNotFound(runId);
    Object.assign(found, patch);
    return found;
  }

  listAllRuns(): PlaybookRunRecord[] {
    return [...this.runs];
  }
}
