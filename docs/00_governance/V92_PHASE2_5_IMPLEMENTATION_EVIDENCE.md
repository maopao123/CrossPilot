# V9.2 Phases 2–5 Implementation Evidence

**Date:** 2026-09-12  
**Status:** CODE COMPLETE — not pushed, not deployed  

```text
Phase 2 Fact/Evidence     PASS
Phase 3 Amazon Research   PASS
Phase 4 VOC Intelligence  PASS
Phase 5 Recommendation    PASS
WF-05 regression          PASS
Amazon Write API          NOT IMPLEMENTED (forbidden)
Auto provider dispatch    false
```

---

## What shipped

Playbook `startRun` still only creates `CREATED` runs (Phase 1 AC-06).  
Intelligence runs via `POST /playbook-runs/:id/execute`.

| Phase | Behavior |
| :--- | :--- |
| 2 | `FactEngine` / `EvidenceEngine`; tables `commerce_facts`, `evidence_items` |
| 3 | `AmazonProductResearchRunner` reuses frozen `OpportunityScoreEngine` v1.0.0; emits facts + evidence + listing brief + decision |
| 4 | Deterministic `VocIntelligenceEngine` (clean → classify → pain → artifacts); `POST /voc/analyze` |
| 5 | `RecommendationEngine` lifecycle GENERATED → WAITING_APPROVAL → APPROVED → EXECUTED → VERIFIED. `EXECUTED.executionDispatched = false` (ledger only, no SP-API write) |

---

## APIs (all `/api/v1`, JWT + workspace)

```text
POST /playbook-runs/:id/execute

POST/GET /facts
GET  /facts/:id
POST/GET /evidence
POST/GET /recommendations
GET  /recommendations/:id
POST /recommendations/:id/approve|reject|execute|verify
POST /voc/analyze
```

---

## Tests

| Suite | Result |
| :--- | :--- |
| `playbook-framework.spec.ts` | 17 passed |
| `v92-intelligence.spec.ts` (domain) | 7 passed |
| `v92-phase1-playbook.spec.ts` | 5 passed |
| `v92-intelligence.spec.ts` (api) | 3 passed |
| `daily-operation-workflow.spec.ts` | 22 passed |
| `v91-phase1.regression.spec.ts` | 15 passed |
| `prisma validate` | valid |

---

## Frozen paths not modified

WF-05, diagnosis, Sku360, OppScore engine source, Tool Center, Provider, Epic 4 commerce-store, listing DAG.
