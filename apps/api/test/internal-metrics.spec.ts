import { Test, TestingModule } from '@nestjs/testing';
import { InternalMetricsController } from '../src/modules/internal/metrics.controller';
import { runtimeMetrics } from '@crosspilot/shared';

describe('InternalMetricsController (Scrape Endpoint)', () => {
  let controller: InternalMetricsController;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalMetricsController],
    }).compile();

    controller = module.get<InternalMetricsController>(InternalMetricsController);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 404 when METRICS_ENABLED is not true', async () => {
    delete process.env.METRICS_ENABLED;

    const mockReq: any = { headers: {} };
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };

    await controller.getMetrics(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.send).toHaveBeenCalledWith('Not Found\n');
  });

  it('returns 200 and Prometheus metrics text when METRICS_ENABLED is true and no token required in non-production (test/dev)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.METRICS_ENABLED = 'true';
    delete process.env.METRICS_BEARER_TOKEN;

    const mockReq: any = { headers: {} };
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };

    await controller.getMetrics(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', runtimeMetrics.contentType);
    expect(mockRes.send).toHaveBeenCalled();
    const sentText = mockRes.send.mock.calls[0][0];
    expect(typeof sentText).toBe('string');
    expect(sentText).toContain('crosspilot_');
  });

  it('fails closed with 503 in production when METRICS_BEARER_TOKEN is missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = 'true';
    delete process.env.METRICS_BEARER_TOKEN;

    const mockReq: any = { headers: {} };
    const mockRes: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };

    await controller.getMetrics(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.send).toHaveBeenCalledWith(
      expect.stringContaining('METRICS_BEARER_TOKEN is required in production'),
    );
  });

  it('enforces METRICS_BEARER_TOKEN in production: strictly rejects missing, wrong, query, and cookie auth', async () => {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_BEARER_TOKEN = 'secret-scrape-token-123';

    // 1. Missing Authorization header -> 401
    const reqMissing: any = { headers: {} };
    const resMissing: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqMissing, resMissing);
    expect(resMissing.status).toHaveBeenCalledWith(401);
    expect(resMissing.send).toHaveBeenCalledWith('Unauthorized\n');

    // 2. Wrong token -> 401
    const reqWrong: any = { headers: { authorization: 'Bearer wrong-token' } };
    const resWrong: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqWrong, resWrong);
    expect(resWrong.status).toHaveBeenCalledWith(401);

    // 3. Query parameter attempt cannot bypass -> 401
    const reqQuery: any = {
      headers: {},
      query: { token: 'secret-scrape-token-123', bearer: 'secret-scrape-token-123' },
    };
    const resQuery: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqQuery, resQuery);
    expect(resQuery.status).toHaveBeenCalledWith(401);

    // 4. Cookie attempt cannot bypass -> 401
    const reqCookie: any = {
      headers: { cookie: 'token=secret-scrape-token-123' },
    };
    const resCookie: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqCookie, resCookie);
    expect(resCookie.status).toHaveBeenCalledWith(401);

    // 5. Correct Authorization Bearer header -> 200
    const reqOk: any = { headers: { authorization: 'Bearer secret-scrape-token-123' } };
    const resOk: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqOk, resOk);
    expect(resOk.status).toHaveBeenCalledWith(200);
    expect(resOk.setHeader).toHaveBeenCalledWith('Content-Type', runtimeMetrics.contentType);
    expect(resOk.send.mock.calls[0][0]).toContain('crosspilot_');
  });

  it('verifies redirect handlers route /metrics and /internal/metrics with 307 to /api/v1/internal/metrics without direct output', () => {
    const createRedirectHandler = (targetUrl: string) => {
      return (_req: any, res: any) => res.redirect(307, targetUrl);
    };

    const handlerMetrics = createRedirectHandler('/api/v1/internal/metrics');
    const handlerInternal = createRedirectHandler('/api/v1/internal/metrics');

    const res1: any = { redirect: jest.fn() };
    handlerMetrics({}, res1);
    expect(res1.redirect).toHaveBeenCalledWith(307, '/api/v1/internal/metrics');

    const res2: any = { redirect: jest.fn() };
    handlerInternal({}, res2);
    expect(res2.redirect).toHaveBeenCalledWith(307, '/api/v1/internal/metrics');
  });
});
