---
name: crosspilot-workflow-recovery-auditor
description: Audit CrossPilot workflows for checkpoint correctness, mid-DAG resume, leases, retry semantics, idempotency, partial writes and single-step replay. Use after workflow changes or before long-running automation is enabled.
---
# Workflow Recovery Auditor

## Verify
- Each step has persisted status.
- SUCCEEDED steps are not repeated on resume.
- stale RUNNING steps can be reclaimed safely.
- read/compute steps are replayable.
- writes have idempotency keys or action-state dedupe.
- partial failure is explicit, not reported as clean failure.
- resume works after process kill at every step boundary.

## Recommended step record
runId, stepId, status, attempt, inputHash, idempotencyKey, startedAt, finishedAt, outputRef, errorCode.

## Test method
Inject a crash after each step and restart the worker. Compare final state with an uninterrupted gold run.
