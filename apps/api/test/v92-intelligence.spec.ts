import { ErrorCodes } from '@crosspilot/shared';
import { IntelligenceService } from '../src/modules/intelligence/intelligence.service.js';
import { PlaybookService } from '../src/modules/playbook/playbook.service.js';

const now = new Date('2026-09-12T00:00:00.000Z');

describe('V9.2 Intelligence API services', () => {
  it('VOC analyze persists a VOC fact', async () => {
    const prisma: any = {
      commerceFact: {
        create: jest.fn().mockResolvedValue({
          id: 'fact-voc',
          workspaceId: 'ws-1',
          factType: 'VOC',
          metric: 'voc_pain_count',
          valueJson: { value: 1 },
          sourceProvider: 'voc-intelligence',
          sourceReference: 'POST /voc/analyze',
          observedAt: now,
          playbookRunId: null,
          createdAt: now,
        }),
      },
    };
    const svc = new IntelligenceService(prisma);
    const result = await svc.analyzeVoc('ws-1', {
      reviews: ['The bottle is flimsy and started to leak overnight'],
    });
    expect(result.painPoints.length).toBeGreaterThan(0);
    expect(result.factId).toBe('fact-voc');
    expect(prisma.commerceFact.create).toHaveBeenCalled();
  });

  it('recommendation execute is ledger-only (executionDispatched stays false)', async () => {
    const rec = {
      id: 'rec-1',
      workspaceId: 'ws-1',
      decision: 'ENTER_MARKET',
      reason: 'ok',
      confidence: 0.8,
      evidenceIds: ['ev-1'],
      status: 'APPROVED',
      playbookRunId: null,
      executionDispatched: false,
      createdAt: now,
      updatedAt: now,
    };
    const prisma: any = {
      businessRecommendation: {
        findFirst: jest.fn().mockResolvedValue(rec),
        update: jest.fn().mockResolvedValue({ ...rec, status: 'EXECUTED', executionDispatched: false }),
      },
    };
    const svc = new IntelligenceService(prisma);
    const executed = await svc.transition('ws-1', 'rec-1', 'EXECUTED');
    expect(executed.status).toBe('EXECUTED');
    expect(executed.executionDispatched).toBe(false);
  });

  it('PlaybookService still starts runs as CREATED without executing', async () => {
    const created = {
      id: 'pb-1',
      workspaceId: 'ws-1',
      name: 'plain',
      version: '1.0.0',
      status: 'REGISTERED',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      definition: {},
      createdAt: now,
      updatedAt: now,
    };
    const run = {
      id: 'pk-1',
      workspaceId: 'ws-1',
      playbookId: 'pb-1',
      runId: 'run-1',
      status: 'CREATED',
      input: {},
      output: null,
      createdBy: 'u1',
      createdAt: now,
      updatedAt: now,
    };
    const prisma: any = {
      playbook: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created),
        create: jest.fn().mockResolvedValue(created),
      },
      playbookRun: {
        create: jest.fn().mockResolvedValue(run),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const svc = new PlaybookService(prisma);
    const pb = await svc.create('ws-1', {
      name: 'plain',
      version: '1.0.0',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    });
    const started = await svc.startRun('ws-1', pb.id, { input: {} }, 'u1');
    expect(started.status).toBe('CREATED');
    expect(prisma.playbookRun.update).not.toHaveBeenCalled();
    expect(ErrorCodes.RECOMMENDATION_EVIDENCE_REQUIRED).toBe('RECOMMENDATION_EVIDENCE_REQUIRED');
  });
});
