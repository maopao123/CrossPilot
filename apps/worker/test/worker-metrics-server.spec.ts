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

import { WorkerService } from '../src/worker.service';

describe('Worker Prometheus Metrics Server', () => {
  const TEST_PORT = 9245;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('does not start metrics server when WORKER_METRICS_ENABLED is not true', async () => {
    delete process.env.WORKER_METRICS_ENABLED;
    const service = new WorkerService();
    try {
      await service.start();
      expect(service.getMetricsServer()).toBeNull();
    } finally {
      await service.stop();
    }
  });

  it('starts metrics server, exposes /metrics and /internal/metrics, handles auth, and stops cleanly', async () => {
    process.env.WORKER_METRICS_ENABLED = 'true';
    process.env.WORKER_METRICS_PORT = String(TEST_PORT);
    process.env.WORKER_METRICS_HOST = '127.0.0.1';
    process.env.WORKER_METRICS_TOKEN = 'worker-test-token-789';

    const service = new WorkerService();
    try {
      await service.start();
      expect(service.getMetricsServer()).not.toBeNull();

      // 1. Without auth header -> 401
      const resNoAuth = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`);
      expect(resNoAuth.status).toBe(401);

      // 2. With wrong auth header -> 401
      const resBadAuth = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`, {
        headers: { Authorization: 'Bearer bad-token' },
      });
      expect(resBadAuth.status).toBe(401);

      // 3. With correct auth header -> 200
      const resOk = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`, {
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(resOk.status).toBe(200);
      expect(resOk.headers.get('content-type')).toContain('text/plain');
      const body = await resOk.text();
      expect(body).toContain('crosspilot_');

      // 4. GET /internal/metrics also works
      const resInternal = await fetch(`http://127.0.0.1:${TEST_PORT}/internal/metrics`, {
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(resInternal.status).toBe(200);

      // 5. Invalid path -> 404
      const res404 = await fetch(`http://127.0.0.1:${TEST_PORT}/unknown-path`, {
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(res404.status).toBe(404);

      // 6. Non-GET -> 405
      const res405 = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`, {
        method: 'POST',
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(res405.status).toBe(405);
    } finally {
      await service.stop();
      expect(service.getMetricsServer()).toBeNull();
    }

    // 7. Verify port is freed after stop
    await expect(fetch(`http://127.0.0.1:${TEST_PORT}/metrics`)).rejects.toThrow();
  });

  it('can start, stop, and restart without port collisions', async () => {
    process.env.WORKER_METRICS_ENABLED = 'true';
    process.env.WORKER_METRICS_PORT = String(TEST_PORT);
    process.env.WORKER_METRICS_HOST = '127.0.0.1';
    delete process.env.WORKER_METRICS_TOKEN;

    const service = new WorkerService();
    try {
      // First cycle
      await service.start();
      const res1 = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`);
      expect(res1.status).toBe(200);
      await service.stop();

      // Second cycle on same port
      await service.start();
      const res2 = await fetch(`http://127.0.0.1:${TEST_PORT}/metrics`);
      expect(res2.status).toBe(200);
      await service.stop();
    } finally {
      await service.stop();
    }
  });
});
