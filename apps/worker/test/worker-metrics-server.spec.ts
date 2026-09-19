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

  const fetchMetrics = (path: string, init?: RequestInit) => {
    return fetch(`http://127.0.0.1:${TEST_PORT}${path}`, {
      ...init,
      headers: {
        Connection: 'close',
        ...init?.headers,
      },
    });
  };

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
      const resNoAuth = await fetchMetrics('/metrics');
      expect(resNoAuth.status).toBe(401);

      // 2. With wrong auth header -> 401
      const resBadAuth = await fetchMetrics('/metrics', {
        headers: { Authorization: 'Bearer bad-token' },
      });
      expect(resBadAuth.status).toBe(401);

      // 3. With correct auth header -> 200
      const resOk = await fetchMetrics('/metrics', {
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(resOk.status).toBe(200);
      expect(resOk.headers.get('content-type')).toContain('text/plain');
      const body = await resOk.text();
      expect(body).toContain('crosspilot_');

      // 4. GET /internal/metrics also works
      const resInternal = await fetchMetrics('/internal/metrics', {
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(resInternal.status).toBe(200);

      // 5. Invalid path -> 404
      const res404 = await fetchMetrics('/unknown-path', {
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(res404.status).toBe(404);

      // 6. Non-GET -> 405
      const res405 = await fetchMetrics('/metrics', {
        method: 'POST',
        headers: { Authorization: 'Bearer worker-test-token-789' },
      });
      expect(res405.status).toBe(405);
    } finally {
      await service.stop();
      expect(service.getMetricsServer()).toBeNull();
    }

    // 7. Verify port is freed after stop
    await expect(fetchMetrics('/metrics')).rejects.toThrow();
  });

  it('defaults to 127.0.0.1 when WORKER_METRICS_HOST is unset', async () => {
    process.env.WORKER_METRICS_ENABLED = 'true';
    process.env.WORKER_METRICS_PORT = String(TEST_PORT);
    delete process.env.WORKER_METRICS_HOST;
    delete process.env.WORKER_METRICS_TOKEN;
    delete process.env.METRICS_BEARER_TOKEN;

    const service = new WorkerService();
    try {
      await service.start();
      const server = service.getMetricsServer();
      expect(server).not.toBeNull();
      const addr: any = server?.address();
      expect(addr.address).toBe('127.0.0.1');

      const res = await fetchMetrics('/metrics');
      expect(res.status).toBe(200);
    } finally {
      await service.stop();
    }
  });

  it('fails closed in production when non-loopback host is used without token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WORKER_METRICS_ENABLED = 'true';
    process.env.WORKER_METRICS_PORT = String(TEST_PORT);
    process.env.WORKER_METRICS_HOST = '0.0.0.0';
    delete process.env.WORKER_METRICS_TOKEN;
    delete process.env.METRICS_BEARER_TOKEN;

    const service = new WorkerService();
    try {
      // Worker starts, does NOT crash, but metrics server is rejected
      await service.start();
      expect(service.getMetricsServer()).toBeNull();

      // Verify no server listening
      await expect(fetchMetrics('/metrics')).rejects.toThrow();
    } finally {
      await service.stop();
    }

    // Now configure WORKER_METRICS_TOKEN
    process.env.WORKER_METRICS_TOKEN = 'prod-worker-secret-456';
    const serviceWithToken = new WorkerService();
    try {
      await serviceWithToken.start();
      expect(serviceWithToken.getMetricsServer()).not.toBeNull();

      // Missing auth -> 401 on both /metrics and /internal/metrics
      const resUnauth = await fetchMetrics('/metrics');
      expect(resUnauth.status).toBe(401);
      const resUnauthInternal = await fetchMetrics('/internal/metrics');
      expect(resUnauthInternal.status).toBe(401);

      // Correct auth -> 200 on both /metrics and /internal/metrics
      const resAuth = await fetchMetrics('/metrics', {
        headers: { Authorization: 'Bearer prod-worker-secret-456' },
      });
      expect(resAuth.status).toBe(200);
      const resAuthInternal = await fetchMetrics('/internal/metrics', {
        headers: { Authorization: 'Bearer prod-worker-secret-456' },
      });
      expect(resAuthInternal.status).toBe(200);
    } finally {
      await serviceWithToken.stop();
    }
  });

  it('supports fallback to METRICS_BEARER_TOKEN and gives priority to WORKER_METRICS_TOKEN', async () => {
    process.env.WORKER_METRICS_ENABLED = 'true';
    process.env.WORKER_METRICS_PORT = String(TEST_PORT);
    process.env.WORKER_METRICS_HOST = '127.0.0.1';
    delete process.env.WORKER_METRICS_TOKEN;
    process.env.METRICS_BEARER_TOKEN = 'fallback-token-abc';

    const service = new WorkerService();
    try {
      await service.start();
      // Fallback token works
      const resFallback = await fetchMetrics('/metrics', {
        headers: { Authorization: 'Bearer fallback-token-abc' },
      });
      expect(resFallback.status).toBe(200);
    } finally {
      await service.stop();
    }

    // When WORKER_METRICS_TOKEN is also provided, it takes priority
    process.env.WORKER_METRICS_TOKEN = 'primary-token-xyz';
    process.env.METRICS_BEARER_TOKEN = 'fallback-token-abc';

    const service2 = new WorkerService();
    try {
      await service2.start();
      const resPrimary = await fetchMetrics('/metrics', {
        headers: { Authorization: 'Bearer primary-token-xyz' },
      });
      expect(resPrimary.status).toBe(200);

      // Old fallback token should now be 401
      const resOld = await fetchMetrics('/metrics', {
        headers: { Authorization: 'Bearer fallback-token-abc' },
      });
      expect(resOld.status).toBe(401);
    } finally {
      await service2.stop();
    }
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
      const res1 = await fetchMetrics('/metrics');
      expect(res1.status).toBe(200);
      await service.stop();

      // Second cycle on same port
      await service.start();
      const res2 = await fetchMetrics('/metrics');
      expect(res2.status).toBe(200);
      await service.stop();
    } finally {
      await service.stop();
    }
  });
});
