import { ActionRouter, ActionProposal } from '../src/index.js';

describe('ActionLayer Unit Tests', () => {
  let router: ActionRouter;

  beforeEach(() => {
    router = new ActionRouter();
  });

  it('should intercept high-risk action requiring approval with WAITING_APPROVAL', async () => {
    const proposal: ActionProposal = {
      id: 'act_publish_001',
      type: 'RPA',
      name: 'Amazon Listing Publish',
      description: 'Publish SKU MTH-GREEN-001 to Amazon Seller Central',
      requiresHumanApproval: true,
      targetEntity: 'SKU',
      targetId: 'MTH-GREEN-001',
      payload: { price: 29.99 },
      riskLevel: 'HIGH',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    const result = await router.dispatch(proposal, {
      workspaceId: 'ws_demo',
      isApproved: false,
    });

    expect(result.status).toBe('WAITING_APPROVAL');
    expect(result.approvalId).toBe('appr_act_publish_001');
  });

  it('should execute approved RPA action through adapter', async () => {
    const proposal: ActionProposal = {
      id: 'act_publish_002',
      type: 'RPA',
      name: 'Amazon Listing Publish',
      description: 'Publish SKU MTH-GREEN-001',
      requiresHumanApproval: true,
      targetEntity: 'SKU',
      targetId: 'MTH-GREEN-001',
      payload: { skuCode: 'MTH-GREEN-001', price: 29.99 },
      riskLevel: 'HIGH',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    const result = await router.dispatch(proposal, {
      workspaceId: 'ws_demo',
      isApproved: true,
      executionMode: 'MOCK',
      providerId: 'mock-rpa',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.isMock).toBe(true);
    expect(result.data.jobId).toBeDefined();
    expect(result.data.status).toBe('SUCCESS');
    expect(result.data.output.skuCode).toBe('MTH-GREEN-001');
  });
});
