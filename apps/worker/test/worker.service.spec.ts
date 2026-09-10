jest.mock('@crosspilot/integrations', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockReturnValue({}),
    healthCheck: jest.fn().mockResolvedValue({ status: 'up' }),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { WorkerService } from '../src/worker.service';
import { processAgentTaskJob } from '../src/processors/agent-task.processor';

describe('WorkerService', () => {
  let service: WorkerService;

  beforeEach(() => {
    service = new WorkerService();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should instantiate and return status', () => {
    const status = service.getStatus();
    expect(status.queueName).toBe('crosspilot-tasks');
    expect(status.isRunning).toBe(false);
  });

  it('should process agent task job mock payload', async () => {
    const result = await processAgentTaskJob({
      taskId: 'task_test_001',
      workspaceId: 'ws_demo',
      taskType: 'SCENARIO_GENERATE',
      payload: {},
    });

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task_test_001');
    expect(result.result?.status).toBe('COMPLETED');
  });
});
