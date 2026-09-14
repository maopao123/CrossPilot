import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface AnalystTraceEvent {
  executionId: string;
  workspaceId: string;
  type: 'TASK_START' | 'STEP_START' | 'TOOL_CALL' | 'TOOL_RESULT' | 'EVIDENCE' | 'TASK_COMPLETE';
  timestamp: string;
  stepNumber?: number;
  toolName?: string;
  payload: any;
}

@Injectable()
export class AnalystTraceEmitter {
  private readonly eventSubject = new Subject<AnalystTraceEvent>();
  private readonly executionHistory = new Map<string, AnalystTraceEvent[]>();
  private readonly latestExecutionByWorkspace = new Map<string, string>();

  emit(event: AnalystTraceEvent): void {
    if (!this.executionHistory.has(event.executionId)) {
      this.executionHistory.set(event.executionId, []);
    }
    this.executionHistory.get(event.executionId)!.push(event);
    this.latestExecutionByWorkspace.set(event.workspaceId, event.executionId);
    this.eventSubject.next(event);
  }

  getEvents(executionId: string): AnalystTraceEvent[] {
    return this.executionHistory.get(executionId) || [];
  }

  getLatestExecutionId(workspaceId: string): string | undefined {
    return this.latestExecutionByWorkspace.get(workspaceId);
  }

  subscribeExecution(executionId: string): Observable<AnalystTraceEvent> {
    return this.eventSubject.pipe(
      filter((e) => e.executionId === executionId)
    );
  }

  subscribeWorkspace(workspaceId: string): Observable<AnalystTraceEvent> {
    return this.eventSubject.pipe(
      filter((e) => e.workspaceId === workspaceId)
    );
  }
}
