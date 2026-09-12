export interface RequestLogContext {
  requestId: string;
  userId?: string;
  workspaceId?: string;
  taskId?: string;
  agentRunId?: string;
}

export type RequestLike = {
  headers?: Record<string, unknown>;
  requestId?: string;
  user?: { sub?: string };
  workspaceId?: string;
  params?: Record<string, string>;
  body?: unknown;
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
};

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function ensureRequestId(request: RequestLike): string {
  if (typeof request.requestId === 'string' && request.requestId) {
    return request.requestId;
  }
  const header = request.headers?.['x-request-id'];
  const fromHeader = typeof header === 'string' ? header.trim() : '';
  const id = fromHeader || generateRequestId();
  request.requestId = id;
  return id;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return undefined;
}

export function extractLogContext(request: RequestLike): RequestLogContext {
  const params = request.params || {};
  const body =
    request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};
  const path = String(request.originalUrl || request.url || request.path || '');
  const paramId = params.id;
  return {
    requestId: ensureRequestId(request),
    userId: request.user?.sub,
    workspaceId: request.workspaceId,
    taskId: firstString(params.taskId, body.taskId),
    agentRunId: path.includes('playbook-runs')
      ? firstString(paramId, body.runId)
      : firstString(body.runId, body.agentRunId),
  };
}
