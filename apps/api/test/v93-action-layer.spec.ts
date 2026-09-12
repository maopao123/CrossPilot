import { ActionLayerService } from '../src/modules/action-layer/action-layer.service.js';
import { ErrorCodes } from '@crosspilot/shared';

describe('V9.3 ActionLayerService', () => {
  const now = new Date('2026-09-12T00:00:00.000Z');

  function recRow() {
    return {
      id: 'rec-1',
      workspaceId: 'ws-1',
      decision: 'DECREASE_KEYWORD_BID',
      reason: 'ACOS increased; decrease keyword bid 20%',
      confidence: 0.8,
      evidenceIds: ['ev-1'],
      status: 'WAITING_APPROVAL',
      playbookRunId: null,
      executionDispatched: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  it('plans DECREASE_BID from an ACOS recommendation and does not mutate the rec row', async () => {
    const rec = recRow();
    const created = {
      id: 'act-1',
      workspaceId: 'ws-1',
      recommendationId: 'rec-1',
      actionType: 'DECREASE_BID',
      target: { campaignId: 'camp-1', keyword: 'broad' },
      parameters: { percentage: 20 },
      riskLevel: 'medium',
      needApproval: true,
      status: 'WAITING_APPROVAL',
      lastMessage: 'Decrease keyword bid 20%',
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
    };
    const prisma: any = {
      businessRecommendation: { findFirst: jest.fn().mockResolvedValue(rec) },
      plannedAction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      actionExecution: { create: jest.fn().mockResolvedValue({}) },
    };
    const intel = {};
    const ads = {
      getCampaigns: jest.fn().mockResolvedValue([{ id: 'camp-1', name: 'SP' }]),
    };
    const svc = new ActionLayerService(prisma, intel as any, ads as any);
    const planned = await svc.plan('ws-1', 'rec-1', 'user-1');
    expect(planned.actionType).toBe('DECREASE_BID');
    expect(planned.status).toBe('WAITING_APPROVAL');
    expect(planned.needApproval).toBe(true);
    expect(prisma.businessRecommendation.update).toBeUndefined();
    expect(prisma.plannedAction.create).toHaveBeenCalled();
  });

  it('executes only after approval and records history attempts', async () => {
    const approved = {
      id: 'act-1',
      workspaceId: 'ws-1',
      recommendationId: 'rec-1',
      actionType: 'DECREASE_BID',
      target: { campaignId: 'camp-1' },
      parameters: { percentage: 20 },
      riskLevel: 'medium',
      needApproval: true,
      status: 'APPROVED',
      lastMessage: 'ok',
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
    };
    const prisma: any = {
      plannedAction: {
        findFirst: jest.fn().mockResolvedValue(approved),
        update: jest
          .fn()
          .mockResolvedValueOnce({ ...approved, status: 'EXECUTING' })
          .mockResolvedValueOnce({ ...approved, status: 'SUCCESS', lastMessage: 'Mock bid decreased 20%' }),
      },
      actionExecution: { create: jest.fn().mockResolvedValue({}) },
    };
    const svc = new ActionLayerService(prisma, {} as any, { getCampaigns: jest.fn() } as any);
    const result = await svc.execute('ws-1', 'act-1', 'user-1');
    expect(result.status).toBe('SUCCESS');
    expect(prisma.actionExecution.create).toHaveBeenCalled();
  });

  it('refuses execute while still WAITING_APPROVAL', async () => {
    const prisma: any = {
      plannedAction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'act-1',
          workspaceId: 'ws-1',
          actionType: 'DECREASE_BID',
          target: { campaignId: 'c' },
          parameters: { percentage: 20 },
          riskLevel: 'medium',
          needApproval: true,
          status: 'WAITING_APPROVAL',
          recommendationId: 'rec-1',
          lastMessage: null,
          createdBy: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
    };
    const svc = new ActionLayerService(prisma, {} as any, { getCampaigns: jest.fn() } as any);
    await expect(svc.execute('ws-1', 'act-1', 'u1')).rejects.toMatchObject({
      response: { code: ErrorCodes.ACTION_INVALID_STATE },
    });
  });
});
