---
name: crosspilot-code-audit
description: Audit the CrossPilot codebase against its frozen Workflow/Risk/Action/Adapter architecture. Use before architectural changes, after large AI-generated patches, or when reviewing ideas borrowed from external ecommerce-agent projects. Do not modify code unless explicitly asked after the audit.
---
# CrossPilot Code Audit

## Goal
Find real gaps without inventing a new architecture.

## Invariants
- Do not replace Workflow-first with a free LLM planner.
- Do not bypass Risk/Action/Approval/Adapter.
- Prefer additive contracts and small patches.
- Distinguish current bugs from future architecture ideas.

## Audit order
1. Data-loss/destructive-operation risks.
2. Write-path approval bypasses.
3. Missing values converted into fake facts.
4. tenant/channel/store/simulator scoping.
5. Tool evidence/provenance metadata.
6. Risk policy consistency.
7. Checkpoint/resume/idempotency.
8. Playbook registration and deterministic routing.
9. Mock/real adapter parity.
10. Only then consider Stage Gate / Workspace / Handoff / Memory.

## Output
For every finding give: severity, exact file/function, call path, proof, smallest fix, regression test, and whether it changes frozen architecture.
