import { of, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ensureRequestId, extractLogContext } from '../src/common/request-context.js';
import { RequestLoggingInterceptor } from '../src/common/interceptors/request-logging.interceptor.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('V9.2 request context', () => {
  it('reuses an existing requestId', () => {
    const request = { requestId: 'req_fixed', headers: {} };
    expect(ensureRequestId(request)).toBe('req_fixed');
  });

  it('prefers x-request-id header then stamps it on the request', () => {
    const request: { headers: Record<string, string>; requestId?: string } = {
      headers: { 'x-request-id': 'req_from_header' },
    };
    expect(ensureRequestId(request)).toBe('req_from_header');
    expect(request.requestId).toBe('req_from_header');
  });

  it('extracts user, workspace, task and playbook run ids', () => {
    const ctx = extractLogContext({
      headers: { 'x-request-id': 'req_1' },
      user: { sub: 'user-1' },
      workspaceId: 'ws-1',
      params: { taskId: 'task-diag-1', id: 'run-abc' },
      url: '/api/v1/playbook-runs/run-abc/execute',
      path: '/api/v1/playbook-runs/run-abc/execute',
    });
    expect(ctx).toMatchObject({
      requestId: 'req_1',
      userId: 'user-1',
      workspaceId: 'ws-1',
      taskId: 'task-diag-1',
      agentRunId: 'run-abc',
    });
  });
});

describe('V9.2 RequestLoggingInterceptor', () => {
  it('logs requestId userId workspaceId and status without changing the body', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const lines: string[] = [];
    (interceptor as any).logger = { log: (msg: string) => lines.push(msg) };
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/products',
      url: '/api/v1/products',
      headers: { 'x-request-id': 'req_log_1' },
      user: { sub: 'user-9' },
      workspaceId: 'ws-9',
      params: {},
    };
    const response = { statusCode: 200 };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };
    const body = await firstValueFrom(
      interceptor.intercept(ctx as any, { handle: () => of({ ok: true }) } as any),
    );
    expect(body).toEqual({ ok: true });
    expect(lines.length).toBe(1);
    const payload = JSON.parse(lines[0]);
    expect(payload).toMatchObject({
      requestId: 'req_log_1',
      userId: 'user-9',
      workspaceId: 'ws-9',
      method: 'GET',
      path: '/api/v1/products',
      statusCode: 200,
    });
    expect(typeof payload.durationMs).toBe('number');
  });

  it('still logs when the handler throws', async () => {
    const interceptor = new RequestLoggingInterceptor();
    const lines: string[] = [];
    (interceptor as any).logger = { log: (msg: string) => lines.push(msg) };
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/playbooks',
      url: '/api/v1/playbooks',
      headers: {},
      params: {},
    };
    const response = { statusCode: 500 };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };
    await expect(
      firstValueFrom(
        interceptor.intercept(ctx as any, {
          handle: () => throwError(() => new Error('boom')),
        } as any),
      ),
    ).rejects.toThrow('boom');
    expect(lines.length).toBe(1);
    const payload = JSON.parse(lines[0]);
    expect(payload.requestId).toMatch(/^req_/);
    expect(payload.method).toBe('POST');
  });
});

describe('V9.2 envelope reuses requestId', () => {
  it('TransformInterceptor keeps a pre-stamped requestId', async () => {
    const interceptor = new TransformInterceptor();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
          path: '/api/v1/products',
          url: '/api/v1/products',
          requestId: 'req_shared',
        }),
      }),
    };
    const result = await firstValueFrom(
      interceptor.intercept(ctx as any, { handle: () => of({ id: 1 }) } as any),
    );
    expect(result).toMatchObject({ data: { id: 1 }, requestId: 'req_shared' });
  });

  it('HttpExceptionFilter reuses request.requestId', () => {
    const filter = new HttpExceptionFilter();
    let payload: any;
    const response = {
      status: (code: number) => ({
        json: (body: unknown) => {
          payload = { code, body };
        },
      }),
    };
    const request = {
      headers: {},
      requestId: 'req_err_shared',
    };
    filter.catch(new HttpException({ code: 'VALIDATION_ERROR', message: 'bad' }, HttpStatus.BAD_REQUEST), {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any);
    expect(payload.code).toBe(400);
    expect(payload.body.requestId).toBe('req_err_shared');
  });
});
