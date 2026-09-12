const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface AuthenticatedSseError {
  status?: number;
  message: string;
}

export function connectAuthenticatedSse(
  path: string,
  handlers: {
    onEvent?: (eventName: string, data: any, raw: string) => void;
    onError?: (err: AuthenticatedSseError) => void;
  },
  options?: { terminalEvents?: string[] },
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const token = localStorage.getItem('crosspilot_token');
  const workspaceId = localStorage.getItem('crosspilot_workspace_id');
  const abort = new AbortController();
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const terminalEvents = new Set(options?.terminalEvents || []);

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }

  const dispatch = (rawEvent: string) => {
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
    handlers.onEvent?.(eventName, parsed, dataText);
    const type = parsed && typeof parsed === 'object' ? parsed.type : undefined;
    if (terminalEvents.has(eventName) || (type && terminalEvents.has(type))) {
      abort.abort();
    }
  };

  const readStream = async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        signal: abort.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      handlers.onError?.({ message: err?.message || 'SSE network error' });
      abort.abort();
      return;
    }

    if (!res.ok) {
      handlers.onError?.({
        status: res.status,
        message: `SSE HTTP ${res.status}`,
      });
      abort.abort();
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      handlers.onError?.({ message: 'SSE response has no body' });
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
          if (chunk.trim()) dispatch(chunk.replace(/\r/g, ''));
          sep = buffer.indexOf('\n\n');
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        handlers.onError?.({ message: err?.message || 'SSE read error' });
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
