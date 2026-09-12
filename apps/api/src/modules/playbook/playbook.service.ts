import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreatePlaybookInput,
  ErrorCodes,
  PlaybookRecord,
  PlaybookRunRecord,
  StartPlaybookRunInput,
} from '@crosspilot/shared';
import {
  IPlaybookStore,
  IntelligenceError,
  PlaybookEngine,
  PlaybookError,
} from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaIntelligenceStore } from '../intelligence/prisma-intelligence.store.js';

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPlaybookRecord(row: {
  id: string;
  workspaceId: string;
  name: string;
  version: string;
  status: string;
  inputSchema: Prisma.JsonValue;
  outputSchema: Prisma.JsonValue;
  definition: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): PlaybookRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    version: row.version,
    status: row.status as PlaybookRecord['status'],
    inputSchema: row.inputSchema as unknown as PlaybookRecord['inputSchema'],
    outputSchema: row.outputSchema as unknown as PlaybookRecord['outputSchema'],
    definition: asObject(row.definition),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRunRecord(row: {
  id: string;
  workspaceId: string;
  playbookId: string;
  runId: string;
  status: string;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PlaybookRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    playbookId: row.playbookId,
    runId: row.runId,
    status: row.status as PlaybookRunRecord['status'],
    input: asObject(row.input),
    output: row.output === null ? null : asObject(row.output),
    createdBy: row.createdBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class PrismaPlaybookStore implements IPlaybookStore {
  constructor(private readonly prisma: PrismaService) {}

  async createPlaybook(record: PlaybookRecord): Promise<PlaybookRecord> {
    try {
      const row = await this.prisma.playbook.create({
        data: {
          id: record.id,
          workspaceId: record.workspaceId,
          name: record.name,
          version: record.version,
          status: record.status,
          inputSchema: record.inputSchema as unknown as Prisma.InputJsonValue,
          outputSchema: record.outputSchema as unknown as Prisma.InputJsonValue,
          definition: record.definition as unknown as Prisma.InputJsonValue,
        },
      });
      return toPlaybookRecord(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new PlaybookError(
          ErrorCodes.PLAYBOOK_VERSION_CONFLICT,
          `Playbook ${record.name}@${record.version} already exists in workspace`,
        );
      }
      throw err;
    }
  }

  async findPlaybookById(workspaceId: string, id: string): Promise<PlaybookRecord | null> {
    const row = await this.prisma.playbook.findFirst({ where: { id, workspaceId } });
    return row ? toPlaybookRecord(row) : null;
  }

  async findPlaybookByNameVersion(
    workspaceId: string,
    name: string,
    version: string,
  ): Promise<PlaybookRecord | null> {
    const row = await this.prisma.playbook.findFirst({
      where: { workspaceId, name, version },
    });
    return row ? toPlaybookRecord(row) : null;
  }

  async listPlaybooks(workspaceId: string): Promise<PlaybookRecord[]> {
    const rows = await this.prisma.playbook.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPlaybookRecord);
  }

  async createRun(record: PlaybookRunRecord): Promise<PlaybookRunRecord> {
    const row = await this.prisma.playbookRun.create({
      data: {
        id: record.id,
        workspaceId: record.workspaceId,
        playbookId: record.playbookId,
        runId: record.runId,
        status: record.status,
        input: record.input as unknown as Prisma.InputJsonValue,
        output:
          record.output === null
            ? Prisma.DbNull
            : (record.output as unknown as Prisma.InputJsonValue),
        createdBy: record.createdBy,
      },
    });
    return toRunRecord(row);
  }

  async findRunByRunId(workspaceId: string, runId: string): Promise<PlaybookRunRecord | null> {
    const row = await this.prisma.playbookRun.findFirst({ where: { workspaceId, runId } });
    return row ? toRunRecord(row) : null;
  }

  async updateRun(
    workspaceId: string,
    runId: string,
    patch: Partial<Pick<PlaybookRunRecord, 'status' | 'output' | 'updatedAt'>>,
  ): Promise<PlaybookRunRecord> {
    const existing = await this.findRunByRunId(workspaceId, runId);
    if (!existing) {
      throw new PlaybookError(ErrorCodes.PLAYBOOK_RUN_NOT_FOUND, runId);
    }
    const row = await this.prisma.playbookRun.update({
      where: { id: existing.id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.output !== undefined
          ? {
              output:
                patch.output === null
                  ? Prisma.DbNull
                  : (patch.output as unknown as Prisma.InputJsonValue),
            }
          : {}),
      },
    });
    return toRunRecord(row);
  }
}

@Injectable()
export class PlaybookService {
  private readonly engine: PlaybookEngine;

  constructor(private readonly prisma: PrismaService) {
    this.engine = new PlaybookEngine(
      new PrismaPlaybookStore(prisma),
      new PrismaIntelligenceStore(prisma),
    );
  }

  create(workspaceId: string, input: CreatePlaybookInput) {
    return this.wrap(() => this.engine.createPlaybook(workspaceId, input));
  }

  list(workspaceId: string) {
    return this.wrap(() => this.engine.listPlaybooks(workspaceId));
  }

  get(workspaceId: string, id: string) {
    return this.wrap(() => this.engine.getPlaybook(workspaceId, id));
  }

  async startRun(
    workspaceId: string,
    playbookId: string,
    body: StartPlaybookRunInput,
    createdBy?: string,
  ) {
    const result = await this.wrap(() =>
      this.engine.startRun(workspaceId, playbookId, body?.input ?? {}, createdBy),
    );
    return {
      runId: result.runId,
      playbookId: result.playbookId,
      status: result.status,
    };
  }

  getRun(workspaceId: string, runId: string) {
    return this.wrap(() => this.engine.getRun(workspaceId, runId));
  }

  executeRun(workspaceId: string, runId: string) {
    return this.wrap(() => this.engine.executeRun(workspaceId, runId));
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.toHttp(err);
    }
  }

  private toHttp(err: unknown): never {
    if (err instanceof PlaybookError || err instanceof IntelligenceError) {
      const payload = { code: err.code, message: err.message };
      if (
        err.code === ErrorCodes.PLAYBOOK_NOT_FOUND ||
        err.code === ErrorCodes.PLAYBOOK_RUN_NOT_FOUND ||
        err.code === ErrorCodes.FACT_NOT_FOUND ||
        err.code === ErrorCodes.EVIDENCE_NOT_FOUND ||
        err.code === ErrorCodes.RECOMMENDATION_NOT_FOUND
      ) {
        throw new NotFoundException(payload);
      }
      if (
        err.code === ErrorCodes.PLAYBOOK_VERSION_CONFLICT ||
        err.code === ErrorCodes.PLAYBOOK_RUN_INVALID_STATE ||
        err.code === ErrorCodes.RECOMMENDATION_INVALID_STATE
      ) {
        throw new ConflictException(payload);
      }
      throw new BadRequestException(payload);
    }
    throw err;
  }
}
