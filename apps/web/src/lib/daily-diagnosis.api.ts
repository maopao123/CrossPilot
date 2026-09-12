/**
 * Daily Diagnosis API Client (Epic 3 Phase 8)
 *
 * Encapsulates REST and SSE interactions for WF-05 Daily Operation Workflow.
 * Enforces:
 * - Structured error handling with HTTP status and domain error codes (409 Conflict, 403 Forbidden, etc.)
 * - Authenticated fetch SSE (Bearer header, no query token)
 * - Zero business logic re-computation on client
 */

import {
  DailyOperationStartRequestDto,
  DailyOperationStartResponseDto,
  DailyOperationTaskSummaryDto,
  DailyOperationActionDecisionDto,
  DailyOperationActionDecisionResponseDto,
  DailyOperationResumeResponseDto,
  DailyOperationWorkflowEvent,
  ApiSuccessResponse,
  ApiErrorResponse,
} from '@crosspilot/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const DAILY_DIAGNOSIS_API_BASE = '/api/v1/operations/daily-diagnosis';

export class DailyDiagnosisApiError extends Error {
  public status: number;
  public code?: string;
  public details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'DailyDiagnosisApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class DailyDiagnosisApiClient {
  private static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crosspilot_token');
  }

  private static getWorkspaceId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crosspilot_workspace_id');
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const workspaceId = this.getWorkspaceId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (workspaceId) {
      headers['x-workspace-id'] = workspaceId;
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers,
      });
    } catch (err: any) {
      throw new DailyDiagnosisApiError(
        err?.message || 'Network request failed',
        0,
        'NETWORK_ERROR'
      );
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // Empty or non-JSON response
    }

    if (!res.ok) {
      const err = json as ApiErrorResponse | undefined;
      const message =
        err?.error?.message || `HTTP Error ${res.status}: ${res.statusText}`;
      const code = err?.error?.code;
      const details = err?.error?.details;
      throw new DailyDiagnosisApiError(message, res.status, code, details);
    }

    // Unpack standard ApiSuccessResponse wrapper if present
    if (json && typeof json === 'object' && 'data' in json) {
      return (json as ApiSuccessResponse<T>).data;
    }

    return json as T;
  }

  /**
   * Start a daily diagnosis workflow execution (POST /operations/daily-diagnosis)
   */
  public static async startDiagnosis(
    dto: DailyOperationStartRequestDto
  ): Promise<DailyOperationStartResponseDto> {
    return this.request<DailyOperationStartResponseDto>(DAILY_DIAGNOSIS_API_BASE, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * Get task summary & state (GET /operations/daily-diagnosis/:taskId)
   */
  public static async getTaskSummary(
    taskId: string,
    include?: string
  ): Promise<DailyOperationTaskSummaryDto> {
    const query = include ? `?include=${encodeURIComponent(include)}` : '';
    return this.request<DailyOperationTaskSummaryDto>(
      `${DAILY_DIAGNOSIS_API_BASE}/${taskId}${query}`,
      { method: 'GET' }
    );
  }

  /**
   * Approve an action (POST /operations/daily-diagnosis/:taskId/actions/:actionId/approve)
   */
  public static async approveAction(
    taskId: string,
    actionId: string,
    dto?: DailyOperationActionDecisionDto
  ): Promise<DailyOperationActionDecisionResponseDto> {
    return this.request<DailyOperationActionDecisionResponseDto>(
      `${DAILY_DIAGNOSIS_API_BASE}/${taskId}/actions/${actionId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify(dto || {}),
      }
    );
  }

  /**
   * Reject an action (POST /operations/daily-diagnosis/:taskId/actions/:actionId/reject)
   */
  public static async rejectAction(
    taskId: string,
    actionId: string,
    dto?: DailyOperationActionDecisionDto
  ): Promise<DailyOperationActionDecisionResponseDto> {
    return this.request<DailyOperationActionDecisionResponseDto>(
      `${DAILY_DIAGNOSIS_API_BASE}/${taskId}/actions/${actionId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify(dto || {}),
      }
    );
  }

  /**
   * Dismiss an action (POST /operations/daily-diagnosis/:taskId/actions/:actionId/dismiss)
   */
  public static async dismissAction(
    taskId: string,
    actionId: string,
    dto?: DailyOperationActionDecisionDto
  ): Promise<DailyOperationActionDecisionResponseDto> {
    return this.request<DailyOperationActionDecisionResponseDto>(
      `${DAILY_DIAGNOSIS_API_BASE}/${taskId}/actions/${actionId}/dismiss`,
      {
        method: 'POST',
        body: JSON.stringify(dto || {}),
      }
    );
  }

  /**
   * Resume paused workflow (POST /operations/daily-diagnosis/:taskId/resume)
   */
  public static async resumeWorkflow(
    taskId: string,
    body?: { expectedVersion?: number }
  ): Promise<DailyOperationResumeResponseDto> {
    return this.request<DailyOperationResumeResponseDto>(
      `${DAILY_DIAGNOSIS_API_BASE}/${taskId}/resume`,
      {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }
    );
  }

  /**
   * Connect to real-time SSE via fetch + Bearer header.
   * Query-string JWT is intentionally not used.
   */
  public static connectEvents(
    taskId: string,
    handlers: {
      onSnapshot?: (snapshot: DailyOperationTaskSummaryDto) => void;
      onEvent?: (event: DailyOperationWorkflowEvent) => void;
      onError?: (err: any) => void;
    }
  ): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const token = this.getToken();
    const workspaceId = this.getWorkspaceId();
    const abort = new AbortController();
    const fullUrl = `${API_BASE_URL}${DAILY_DIAGNOSIS_API_BASE}/${taskId}/events`;

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (workspaceId) {
      headers['x-workspace-id'] = workspaceId;
    }

    const dispatchSseMessage = (rawEvent: string) => {
      const lines = rawEvent.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      const dataText = dataLines.join('\n');
      if (eventName === 'ping' || !dataText) {
        return;
      }
      let parsed: any = dataText;
      try {
        parsed = JSON.parse(dataText);
      } catch {
        // keep raw
      }
      if (eventName === 'snapshot') {
        handlers.onSnapshot?.(parsed);
        return;
      }
      handlers.onEvent?.(
        parsed && typeof parsed === 'object'
          ? { ...parsed, type: parsed.type || eventName }
          : ({ type: eventName, message: dataText } as DailyOperationWorkflowEvent),
      );
      if (eventName === 'workflow.completed' || eventName === 'workflow.failed') {
        abort.abort();
      }
    };

    const readStream = async () => {
      let res: Response;
      try {
        res = await fetch(fullUrl, {
          method: 'GET',
          headers,
          signal: abort.signal,
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        handlers.onError?.(err);
        abort.abort();
        return;
      }

      if (!res.ok) {
        handlers.onError?.(
          new DailyDiagnosisApiError(
            `SSE HTTP ${res.status}`,
            res.status,
            res.status === 401 ? 'AUTH_UNAUTHORIZED' : undefined,
          ),
        );
        abort.abort();
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        handlers.onError?.(new Error('SSE response has no body'));
        abort.abort();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep = buffer.indexOf('\n\n');
          while (sep !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            if (chunk.trim()) dispatchSseMessage(chunk.replace(/\r/g, ''));
            sep = buffer.indexOf('\n\n');
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          handlers.onError?.(err);
        }
      } finally {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      }
    };

    void readStream();

    return () => {
      abort.abort();
    };
  }
}
