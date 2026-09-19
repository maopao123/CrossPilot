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

  it('returns 200 and Prometheus metrics text when METRICS_ENABLED is true and no token required', async () => {
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

  it('enforces METRICS_BEARER_TOKEN when configured', async () => {
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_BEARER_TOKEN = 'secret-scrape-token-123';

    // 1. Missing Authorization header
    const reqMissing: any = { headers: {} };
    const resMissing: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqMissing, resMissing);
    expect(resMissing.status).toHaveBeenCalledWith(401);
    expect(resMissing.send).toHaveBeenCalledWith('Unauthorized\n');

    // 2. Wrong token
    const reqWrong: any = { headers: { authorization: 'Bearer wrong-token' } };
    const resWrong: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn().mockReturnThis(),
    };
    await controller.getMetrics(reqWrong, resWrong);
    expect(resWrong.status).toHaveBeenCalledWith(401);

    // 3. Correct token
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
});
