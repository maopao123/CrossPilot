---
name: crosspilot-evidence-auditor
description: Audit CrossPilot data and tool paths for evidence quality, provenance, freshness, missing-value handling, fake defaults, proxies, and unsupported conclusions. Use when adding adapters, metrics, recommendations, market research, or AI-generated actions.
---
# Evidence Auditor

## Rules
- Missing is not zero.
- Missing is not a plausible default.
- Estimate is not fact.
- Proxy must be labelled.
- Derived values must retain source references.
- A recommendation must be traceable to evidence.

## Check
1. Search mapper/adapter code for `|| number`, `?? number`, fallback constants and synthetic defaults.
2. Trace ToolExecutionResult → Evidence → Recommendation → Action.
3. Verify timestamp/freshness where time-sensitive.
4. Verify store/channel scope on evidence.
5. Verify low-sample signals cannot become strong actions.
6. Verify external-verification-required data cannot silently PASS.

## Preferred vocabulary (Orthogonal Dimensions)
- **Value Status**: KNOWN / DERIVED / ESTIMATED / MISSING / CONFLICTING.
- **Freshness**: FRESH / AGING / STALE / UNKNOWN.
(Note: Missing is not zero; estimate is not fact; stale is orthogonal to missing.)

## Output
List each evidence hole and a regression test that fails before the fix.
