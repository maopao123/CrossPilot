jest.mock('ioredis', () => {
  const Redis = jest.fn().mockImplementation((_url: string, opts: { maxRetriesPerRequest?: unknown }) => ({
    opts,
    quit: jest.fn().mockResolvedValue('OK'),
  }));
  return { __esModule: true, default: Redis };
});

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@crosspilot/integrations', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockReturnValue({}),
    healthCheck: jest.fn().mockResolvedValue({ status: 'up' }),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

import Redis from 'ioredis';
import { Worker } from 'bullmq';
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

  it('starts the agent-task worker with maxRetriesPerRequest null', async () => {
    const previous = process.env.SIMULATOR_ENABLED;
    delete process.env.SIMULATOR_ENABLED;
    try {
      await service.start();
      expect(Redis).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxRetriesPerRequest: null }),
      );
      expect(Worker).toHaveBeenCalled();
      expect(service.getStatus().isRunning).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.SIMULATOR_ENABLED;
      } else {
        process.env.SIMULATOR_ENABLED = previous;
      }
    }
  });

  it('starts and registers the automation-recovery worker and queue in production entrypoint', async () => {
    await service.start();
    const recoveryStatus = service.getRecoveryStatus();
    expect(recoveryStatus.isRegistered).toBe(true);
    expect(recoveryStatus.queueName).toBe('crosspilot-automation-recovery');
  });

  it('resets shutdownController on second start() invocation after stop()', async () => {
    await service.start();
    expect((service as any).shutdownController.signal.aborted).toBe(false);

    await service.stop();
    expect((service as any).shutdownController.signal.aborted).toBe(true);

    // Second start() must safely recreate shutdownController
    await service.start();
    expect((service as any).shutdownController.signal.aborted).toBe(false);
  });
});
