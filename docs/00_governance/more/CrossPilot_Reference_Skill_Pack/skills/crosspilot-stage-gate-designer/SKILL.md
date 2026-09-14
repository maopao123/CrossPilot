---
name: crosspilot-stage-gate-designer
description: Design an additive business Stage Gate layer for CrossPilot only when a real multi-stage product lifecycle requires entry/exit evidence, HOLD states, and formal transitions. Do not use for ordinary single-workflow tasks and do not rewrite existing DAGs.
---
# Stage Gate Designer

## First gate: should Stage Gate exist now?
Only proceed when at least one is true:
- a product lifecycle spans several workflows;
- stages require different evidence/permissions;
- formal human sign-off is needed between stages;
- users need to resume/re-run one business stage independently.

Otherwise recommend using the existing Workflow + Evidence Gate.

## Additive design
StageInstance
StageGateEvaluator
StageTransitionService

A Stage references workflows; it does not replace them.

## Suggested states
PENDING / ACTIVE / HOLD / PASSED / FAILED / CANCELLED.

## Gate output
missingEvidence, blockingReasons, warnings, nextAllowedStages, evaluatedAt, policyVersion.
