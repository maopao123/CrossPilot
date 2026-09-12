import { Prisma } from '@prisma/client';
import { ErrorCodes } from '@crosspilot/shared';
import type {
  BusinessRecommendationRecord,
  CommerceFactRecord,
  EvidenceItemRecord,
} from '@crosspilot/shared';
import { IIntelligenceStore, IntelligenceError } from '@crosspilot/domain';
import { PrismaService } from '../prisma/prisma.service.js';

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toNum(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function toFact(row: {
  id: string;
  workspaceId: string;
  factType: string;
  metric: string;
  valueJson: Prisma.JsonValue;
  sourceProvider: string;
  sourceReference: string;
  observedAt: Date;
  playbookRunId: string | null;
  createdAt: Date;
}): CommerceFactRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    factType: row.factType,
    metric: row.metric,
    valueJson: asObject(row.valueJson),
    sourceProvider: row.sourceProvider,
    sourceReference: row.sourceReference,
    observedAt: row.observedAt.toISOString(),
    playbookRunId: row.playbookRunId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function toEvidence(row: {
  id: string;
  workspaceId: string;
  factId: string;
  sourceType: string;
  sourceId: string;
  quote: string;
  confidence: Prisma.Decimal;
  playbookRunId: string | null;
  createdAt: Date;
}): EvidenceItemRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    factId: row.factId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    quote: row.quote,
    confidence: toNum(row.confidence),
    playbookRunId: row.playbookRunId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRec(row: {
  id: string;
  workspaceId: string;
  decision: string;
  reason: string;
  confidence: Prisma.Decimal;
  evidenceIds: Prisma.JsonValue;
  status: string;
  playbookRunId: string | null;
  executionDispatched: boolean;
  createdAt: Date;
  updatedAt: Date;
}): BusinessRecommendationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    decision: row.decision,
    reason: row.reason,
    confidence: toNum(row.confidence),
    evidenceIds: asStringArray(row.evidenceIds),
    status: row.status as BusinessRecommendationRecord['status'],
    playbookRunId: row.playbookRunId ?? undefined,
    executionDispatched: row.executionDispatched,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaIntelligenceStore implements IIntelligenceStore {
  constructor(private readonly prisma: PrismaService) {}

  async createFact(record: CommerceFactRecord): Promise<CommerceFactRecord> {
    const row = await this.prisma.commerceFact.create({
      data: {
        id: record.id,
        workspaceId: record.workspaceId,
        factType: record.factType,
        metric: record.metric,
        valueJson: record.valueJson as unknown as Prisma.InputJsonValue,
        sourceProvider: record.sourceProvider,
        sourceReference: record.sourceReference,
        observedAt: new Date(record.observedAt),
        playbookRunId: record.playbookRunId,
      },
    });
    return toFact(row);
  }

  async getFact(workspaceId: string, id: string): Promise<CommerceFactRecord | null> {
    const row = await this.prisma.commerceFact.findFirst({ where: { id, workspaceId } });
    return row ? toFact(row) : null;
  }

  async listFacts(workspaceId: string, filter?: { playbookRunId?: string }): Promise<CommerceFactRecord[]> {
    const rows = await this.prisma.commerceFact.findMany({
      where: { workspaceId, ...(filter?.playbookRunId ? { playbookRunId: filter.playbookRunId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toFact);
  }

  async createEvidence(record: EvidenceItemRecord): Promise<EvidenceItemRecord> {
    const row = await this.prisma.evidenceItem.create({
      data: {
        id: record.id,
        workspaceId: record.workspaceId,
        factId: record.factId,
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        quote: record.quote,
        confidence: record.confidence,
        playbookRunId: record.playbookRunId,
      },
    });
    return toEvidence(row);
  }

  async getEvidence(workspaceId: string, id: string): Promise<EvidenceItemRecord | null> {
    const row = await this.prisma.evidenceItem.findFirst({ where: { id, workspaceId } });
    return row ? toEvidence(row) : null;
  }

  async listEvidence(
    workspaceId: string,
    filter?: { factId?: string; playbookRunId?: string },
  ): Promise<EvidenceItemRecord[]> {
    const rows = await this.prisma.evidenceItem.findMany({
      where: {
        workspaceId,
        ...(filter?.factId ? { factId: filter.factId } : {}),
        ...(filter?.playbookRunId ? { playbookRunId: filter.playbookRunId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toEvidence);
  }

  async createRecommendation(record: BusinessRecommendationRecord): Promise<BusinessRecommendationRecord> {
    const row = await this.prisma.businessRecommendation.create({
      data: {
        id: record.id,
        workspaceId: record.workspaceId,
        decision: record.decision,
        reason: record.reason,
        confidence: record.confidence,
        evidenceIds: record.evidenceIds as unknown as Prisma.InputJsonValue,
        status: record.status,
        playbookRunId: record.playbookRunId,
        executionDispatched: record.executionDispatched,
      },
    });
    return toRec(row);
  }

  async getRecommendation(workspaceId: string, id: string): Promise<BusinessRecommendationRecord | null> {
    const row = await this.prisma.businessRecommendation.findFirst({ where: { id, workspaceId } });
    return row ? toRec(row) : null;
  }

  async listRecommendations(workspaceId: string): Promise<BusinessRecommendationRecord[]> {
    const rows = await this.prisma.businessRecommendation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRec);
  }

  async updateRecommendation(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<BusinessRecommendationRecord, 'status' | 'executionDispatched' | 'updatedAt'>>,
  ): Promise<BusinessRecommendationRecord> {
    const existing = await this.getRecommendation(workspaceId, id);
    if (!existing) throw new IntelligenceError(ErrorCodes.RECOMMENDATION_NOT_FOUND, id);
    const row = await this.prisma.businessRecommendation.update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.executionDispatched !== undefined
          ? { executionDispatched: patch.executionDispatched }
          : {}),
      },
    });
    return toRec(row);
  }
}
