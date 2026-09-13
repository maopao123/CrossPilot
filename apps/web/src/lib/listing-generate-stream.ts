import { ApiClient } from './api-client';

export interface ListingGenerateStepEvent {
  stepNumber: number;
  stepName: string;
  status: string;
  latencyMs: number;
  summary: string;
}

export async function streamListingGenerate(
  payload: Record<string, unknown>,
  handlers: {
    onStep?: (step: ListingGenerateStepEvent) => void;
    onResult?: (result: any) => void;
    onError?: (err: { message: string; code?: string }) => void;
  },
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('crosspilot_token') : null;
  const workspaceId = ApiClient.getActiveWorkspaceId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;

  const response = await fetch('/api/v1/listings/generate/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      message = json?.error?.message || json?.message || message;
    } catch {
      // keep status text
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawResult = false;

  const dispatch = (rawEvent: string) => {
    const lines = rawEvent.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    const dataText = dataLines.join('\n');
    if (!dataText || eventName === 'ping') return;
    let parsed: any = dataText;
    try {
      parsed = JSON.parse(dataText);
    } catch {
      // keep raw
    }
    if (eventName === 'step') {
      handlers.onStep?.(parsed);
      return;
    }
    if (eventName === 'result') {
      sawResult = true;
      handlers.onResult?.(parsed);
      return;
    }
    if (eventName === 'error') {
      handlers.onError?.(parsed);
      throw new Error(parsed?.message || 'Listing generation failed');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      if (chunk.trim()) dispatch(chunk);
    }
  }
  if (buffer.trim()) dispatch(buffer);
  if (!sawResult) {
    throw new Error('生成中断：未收到完整结果');
  }
}
