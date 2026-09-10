import { ApiSuccessResponse, ApiErrorResponse } from '@crosspilot/shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiClient {
  private static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crosspilot_token');
  }

  public static setSession(token: string, workspaceId?: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('crosspilot_token', token);
    if (workspaceId) {
      localStorage.setItem('crosspilot_workspace_id', workspaceId);
    }
  }

  public static clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('crosspilot_token');
    localStorage.removeItem('crosspilot_workspace_id');
  }

  public static getActiveWorkspaceId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crosspilot_workspace_id');
  }

  public static async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken();
    const workspaceId = this.getActiveWorkspaceId();

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

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const json = await res.json();

    if (!res.ok) {
      const err = json as ApiErrorResponse;
      throw new Error(
        err?.error?.message || `HTTP Error ${res.status}: ${res.statusText}`,
      );
    }

    // Unpack standard ApiSuccessResponse
    if (json && typeof json === 'object' && 'data' in json) {
      return (json as ApiSuccessResponse<T>).data;
    }

    return json as T;
  }

  public static get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  public static post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}
