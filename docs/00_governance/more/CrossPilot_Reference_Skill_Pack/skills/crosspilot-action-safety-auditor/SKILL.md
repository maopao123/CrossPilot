---
name: crosspilot-action-safety-auditor
description: Audit all CrossPilot write paths and action execution for approval proof, payload integrity, risk policy, idempotency, re-check-at-apply, rollback, and direct-adapter bypasses. Use before enabling any write action or bounded automation.
---
# Action Safety Auditor

## Non-negotiable checks
- No caller-provided `isApproved=true` is trusted.
- Approval is a persisted proof tied to actionId + payloadHash + expiry.
- Apply re-checks current risk/guardrails.
- Agent cannot approve its own proposal through a normal tool.
- All writes pass through Action Framework.
- Adapter write methods are unreachable from Agent/Workflow except Executor.
- Retries are idempotent.

## Decoupled Dimensions
- **Business Risk Level (`riskLevel`)**: `low` | `medium` | `high` (inherent business severity; high risk strictly requires human approval).
- **Automation Permission Level (`automationLevel`)**:
  - `L0 READ`: Read-only, no side effects.
  - `L1 RECOMMEND`: Advisory diagnostic/recommendation only.
  - `L2 DRAFT/STAGE`: Staged changes/candidates, cannot directly dispatch.
  - `L3 HUMAN-APPROVED WRITE`: Requires verified `ApprovalProof` before execution.
  - `L4 BOUNDED AUTOMATION`: Bounded autonomous execution strictly guarded by server-side policy.

*Note*: Permission levels are evaluated by server-side policy, not requested by LLM. L4 additionally requires hard bounds, circuit breaker, fresh evidence, rollback and audit.
