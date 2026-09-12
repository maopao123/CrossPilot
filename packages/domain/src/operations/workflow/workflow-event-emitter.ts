/**
 * Workflow Event Emitter & SSE Dispatcher (Epic 3 Phase 6)
 *
 * Emits structured lifecycle events for real-time Agent Trace & SSE streaming.
 * Strict rule: NEVER emit private LLM token reasoning or hidden chain-of-thought.
 */

import { DailyOperationWorkflowEvent, DailyOperationEventType } from '@crosspilot/shared';
import { WorkflowEventListener } from './workflow.types.js';

export class WorkflowEventEmitter {
  private readonly listeners: Set<WorkflowEventListener> = new Set();
  private readonly eventHistory: DailyOperationWorkflowEvent[] = [];

  public subscribe(listener: WorkflowEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: DailyOperationWorkflowEvent): void {
    this.eventHistory.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[WorkflowEventEmitter] Listener error:', err);
      }
    }
  }

  public emitEvent(
    type: DailyOperationEventType,
    taskId: string,
    workflowRunId: string,
    message: string,
    options?: {
      step?: DailyOperationWorkflowEvent['step'];
      skuId?: string;
      payload?: Record<string, unknown>;
    }
  ): void {
    const event: DailyOperationWorkflowEvent = {
      type,
      taskId,
      workflowRunId,
      timestamp: new Date().toISOString(),
      step: options?.step,
      skuId: options?.skuId,
      message,
      payload: options?.payload,
    };
    this.emit(event);
  }

  public getHistory(): DailyOperationWorkflowEvent[] {
    return [...this.eventHistory];
  }

  public clearHistory(): void {
    this.eventHistory.length = 0;
  }
}
