export const RuntimeEvents = {
  // Action Router
  ACTION_DISPATCH_STARTED: 'action.dispatch.started',
  ACTION_DISPATCH_BLOCKED: 'action.dispatch.blocked',
  ACTION_DISPATCH_COMPLETED: 'action.dispatch.completed',
  ACTION_DISPATCH_FAILED: 'action.dispatch.failed',

  // Automation Operation Lifecycle
  AUTOMATION_OPERATION_CREATED: 'automation.operation.created',
  AUTOMATION_OPERATION_CLAIMED: 'automation.operation.claimed',
  AUTOMATION_OPERATION_COMPLETED: 'automation.operation.completed',
  AUTOMATION_OPERATION_FAILED: 'automation.operation.failed',
  AUTOMATION_OPERATION_NEEDS_ATTENTION: 'automation.operation.needs_attention',

  // Recovery Engine
  AUTOMATION_RECOVERY_SWEEP_STARTED: 'automation.recovery.sweep.started',
  AUTOMATION_RECOVERY_SWEEP_COMPLETED: 'automation.recovery.sweep.completed',
  AUTOMATION_RECOVERY_QUERY_STARTED: 'automation.recovery.query.started',
  AUTOMATION_RECOVERY_QUERY_COMPLETED: 'automation.recovery.query.completed',
  AUTOMATION_RECOVERY_QUERY_FAILED: 'automation.recovery.query.failed',
  AUTOMATION_RECOVERY_RETRY_SCHEDULED: 'automation.recovery.retry.scheduled',
  AUTOMATION_RECOVERY_RETRY_STARTED: 'automation.recovery.retry.started',
  AUTOMATION_RECOVERY_ESCALATED: 'automation.recovery.escalated',

  // External Adapter (Shopify / ERP / Playwright)
  ADAPTER_REQUEST_STARTED: 'adapter.request.started',
  ADAPTER_REQUEST_COMPLETED: 'adapter.request.completed',
  ADAPTER_REQUEST_FAILED: 'adapter.request.failed',
  ADAPTER_REQUEST_TIMEOUT: 'adapter.request.timeout',
  ADAPTER_REQUEST_CANCELLED: 'adapter.request.cancelled',

  // Remote Verification
  AUTOMATION_VERIFY_STARTED: 'automation.verify.started',
  AUTOMATION_VERIFY_COMPLETED: 'automation.verify.completed',
  AUTOMATION_VERIFY_MISMATCH: 'automation.verify.mismatch',
  AUTOMATION_VERIFY_TIMEOUT: 'automation.verify.timeout',

  // Background Worker
  WORKER_STARTED: 'worker.started',
  WORKER_STOPPING: 'worker.stopping',
  WORKER_STOPPED: 'worker.stopped',
  WORKER_JOB_STARTED: 'worker.job.started',
  WORKER_JOB_COMPLETED: 'worker.job.completed',
  WORKER_JOB_FAILED: 'worker.job.failed',
} as const;

export type RuntimeEventName = (typeof RuntimeEvents)[keyof typeof RuntimeEvents] | (string & {});
