# WF-05 Daily Operation Workflow Architecture & HITL Specification

> **Epic**: CrossPilot V9 Epic 3 — Daily Operations Intelligence  
> **Phase**: Phase 6 — DailyOperationWorkflowService (WF-05 DAG & HITL)  
> **Status**: VERIFIED & FROZEN  
> **Date**: 2026-09-11  

---

## 1. Executive Summary & Core Axioms

The **WF-05 Daily Operation Workflow** is the deterministic orchestrator for CrossPilot V9 daily store operations. It choreographs the specialized engines established in Phases 1 through 5 into an observable, resumable, multi-SKU DAG with human-in-the-loop (HITL) approval gates.

### Core Axioms & Invariants

1. **Workflow $\ne$ Business Logic**:  
   The workflow engine coordinates steps, manages concurrency, handles partial failures, tracks traces, and controls approval states. It **never** re-computes profit waterfalls, anomaly thresholds, diagnosis confidence, or recommendation priority math.
2. **Approval $\ne$ Execute**:  
   The approval gate transitions recommended actions from `PROPOSED` to `APPROVED`, `REJECTED`, or `DISMISSED`. It **strictly does not mutate** external systems (Amazon SP-API, Amazon Ads, ERP, or PO tables). Execution belongs strictly to Phase 9.
3. **No CoT Leakage**:  
   Agent Traces and SSE event streams emit structured operational metadata only. Private LLM tokens and internal reasoning are strictly isolated.
4. **Idempotent Checkpointing**:  
   Workflows paused at approval gates can be resumed without re-running upstream analysis steps.

```
       [ Trigger: Daily Schedule / Manual / On-Demand ]
                             │
                             ▼
                 Step 1: VALIDATE_INPUT
                             │
                             ▼
                  Step 2: RESOLVE_SKUS
                             │
                             ▼
                   Step 3: LOAD_CONTEXT
                (Sku360ContextLoader)
                             │
                             ▼
                  Step 4: DETECT_SIGNALS
               (OperationAnomalyDetector)
                             │
                             ▼
                    Step 5: DIAGNOSE
             (CrossDomainDiagnosisService)
                             │
                             ▼
                    Step 6: RECOMMEND
             (ActionRecommendationService)
                             │
                             ▼
                   Step 7: AGGREGATE
                 (WorkflowAggregator)
                             │
                             ▼
                 Step 8: APPROVAL_GATE  ◄─── Checkpoint State
               (HITL: ADVISORY vs APPROVAL_REQUIRED)
                 │                       │
                 │ [Approved/Auto]       │ [Requires Approval]
                 ▼                       ▼
                 Step 9: FINALIZE        PAUSED: WAITING_APPROVAL
                 (Assemble Result)       (Human Approval Loop)
```

---

## 2. 9-Step DAG Specification

| Step | Step Name | Primary Responsibility | Input Artifact | Output Artifact | Failure Policy |
|---|---|---|---|---|---|
| **1** | `VALIDATE_INPUT` | Validate tenant context, marketplace, date ranges, and mode requirements. | `DailyOperationWorkflowInput` | Validated parameters | Fail Fast (`FAILED`) |
| **2** | `RESOLVE_SKUS` | Resolve target SKU list via `ISkuResolver` or explicit input array. | Mode, SKU params | `string[]` (active SKUs) | Fail Fast (`FAILED`) |
| **3** | `LOAD_CONTEXT` | Batch load 7-domain facts via `Sku360ContextLoader` with concurrency limit. | SKU IDs, date ranges | `Record<string, Sku360BusinessContext>` | Fault-Tolerant (`PARTIAL_SUCCESS`) |
| **4** | `DETECT_SIGNALS` | Run deterministic 12-rule anomaly detector across loaded contexts. | Contexts | `BusinessSignal[]` | Fail Fast (`FAILED`) |
| **5** | `DIAGNOSE` | Attribute root causes across 7 operational patterns (skips if 0 signals). | Contexts + Signals | `DiagnosisResult[]` | Fail Fast (`FAILED`) |
| **6** | `RECOMMEND` | Generate policy-bounded, deduplicated, and conflict-checked actions. | Contexts + Signals + Diagnoses | `RecommendedAction[]` | Fail Fast (`FAILED`) |
| **7** | `AGGREGATE` | Rank actions cross-SKU by P1 $\rightarrow$ P2 $\rightarrow$ P3 and financial exposure. | All Actions + Signals | Ranked actions + `DailyOperationSummary` | Fail Fast (`FAILED`) |
| **8** | `APPROVAL_GATE` | Partition actions by execution mode; checkpoint state if approval required. | Aggregated Actions | `WorkflowApprovalState` | Pauses at gate (`WAITING_APPROVAL`) |
| **9** | `FINALIZE` | Assemble final workflow result, summary metrics, and audit traces. | Complete State | `DailyOperationWorkflowResult` | Returns final result |

---

## 3. Dual Execution Modes

### 3.1 SKU Mode
- **Target**: Single SKU (e.g. `MTH-WHITE-001`).
- **Use Case**: Operator deep-dive, ad-hoc investigation, incident drill-down.
- **Behavior**: Fast single-item path, direct context load, single-SKU recommendation list.

### 3.2 WORKSPACE Mode
- **Target**: Workspace portfolio (multi-SKU batch).
- **Use Case**: Daily morning store briefing, executive risk summary.
- **Behavior**:
  - Resolves active SKUs dynamically (or via canonical scenario registry).
  - Controlled concurrency batching (default concurrency: 3) to prevent resource exhaustion.
  - Partial failure tolerance: if 1 SKU fails to load, remaining SKUs proceed.
  - Cross-SKU aggregation: merges all actions into a single **Today's Action List**.

---

## 4. Cross-SKU Priority Ranking & Aggregator

The `WorkflowAggregator` applies strict, deterministic cross-SKU sorting rules:

$$\text{Sort Order} = \text{Priority Weight} (\text{P1} < \text{P2} < \text{P3}) \longrightarrow |\text{Financial Impact}| (\text{Descending}) \longrightarrow \text{SKU ID} \longrightarrow \text{Action ID}$$

### Health Status State Machine
- **`CRITICAL`**: Any `P1` action exists OR any `CRITICAL` signal detected.
- **`NEEDS_ATTENTION`**: Any `P2`/`P3` action exists OR any `WARNING` signal detected.
- **`HEALTHY`**: Zero anomaly signals and zero recommended actions required.

---

## 5. Human-In-The-Loop (HITL) & Checkpoint Engine

### 5.1 Action Execution Modes
- **`ADVISORY`**: Pure diagnostic insight or low-risk advice (e.g., pricing monitoring, keyword observation). Can be auto-approved when `autoApproveAdvisory: true`.
- **`APPROVAL_REQUIRED`**: High-impact actions that change financial commitment or inventory risk (e.g., PO replenishment, budget cuts, listing edits).

### 5.2 Checkpoint & Resume Protocol
1. When Step 8 encounters pending `APPROVAL_REQUIRED` actions:
   - State status transitions to `WAITING_APPROVAL`.
   - Complete execution state is deep-cloned and persisted in `IWorkflowCheckpointStore`.
   - DAG halts safely and returns current result to the operator.
2. The operator submits action-level decisions:
   - `approveAction(taskId, actionId, operator, note)` $\rightarrow$ Action status becomes `APPROVED`.
   - `rejectAction(taskId, actionId, operator, note)` $\rightarrow$ Action status becomes `REJECTED`.
   - `dismissAction(taskId, actionId, operator, note)` $\rightarrow$ Action status becomes `DISMISSED`.
3. When all pending actions are resolved:
   - State status automatically transitions to `COMPLETED`.
   - `resume(taskId)` returns the finalized result without repeating upstream calculation.

### 5.3 Checkpoint Store Architecture (Phase 6.1)

| Store Implementation | Environment | Durability | Concurrency Control | Restart Survivability |
|---|---|---|---|---|
| **`InMemoryWorkflowCheckpointStore`** | Development / Unit Tests | In-memory Map with deep clone | Monotonic `checkpointVersion` OCC | No (lost on process exit) |
| **`PersistentWorkflowCheckpointStore`** | Production / CLI / Services | Durable atomic disk files (`.checkpoint.json`) or `IWorkflowDatabaseAdapter` | Monotonic `checkpointVersion` OCC | Yes (recovers across restarts/deployments) |

### 5.4 Optimistic Concurrency Control (OCC) & Crash Consistency
- **Monotonic Versioning**: Every checkpoint save operation validates `expectedVersion` and increments `checkpointVersion` monotonically ($1 \rightarrow 2 \rightarrow 3 \dots$).
- **Race Protection**: Stale updates from concurrent operators trigger `CheckpointVersionConflictError` (`code: CHECKPOINT_VERSION_CONFLICT`), preventing silent overwrites.
- **Crash Consistency Axiom**:
  $$\text{Persistent Store (Source of Truth)} \prec \text{SSE Event Stream (Observation Channel)}$$
  State is committed to durable storage *prior* to emitting step/approval lifecycle events. An SSE listener disconnect or crash cannot corrupt or roll back committed state.

### 5.5 Strict Action State Machine Preconditions
- Actions transition strictly along deterministic lifecycle paths:
  $$\text{PROPOSED} \longrightarrow \text{APPROVED} \mid \text{REJECTED} \mid \text{DISMISSED}$$
- Modifying an already decided action throws `InvalidActionStateError` (`code: INVALID_ACTION_STATE`).
- Resuming non-existent tasks throws `WorkflowNotFoundError` (`code: WORKFLOW_NOT_FOUND`).
- Repeated calls to `resume(taskId)` on `COMPLETED` or `FAILED` workflows are strictly idempotent.

### 5.6 Postgres Database Adapter Integration (`PrismaWorkflowDatabaseAdapter`)
In production, `PostgresWorkflowCheckpointStore` (and `PersistentWorkflowCheckpointStore` with `backend: 'postgres'`) delegates to `IWorkflowDatabaseAdapter` backed by `PrismaWorkflowDatabaseAdapter`:
- **Single Source of Truth**: Production mandates PostgreSQL; local disk file fallback is strictly disabled to prevent split-brain state across worker/API containers. If database persistence is unavailable, the system fails closed with `PERSISTENCE_UNAVAILABLE` (`PersistenceUnavailableError`).
- **Database-Level Atomic OCC**: State updates execute `WHERE id = :taskId AND checkpoint_version = :expectedVersion`. Any concurrent conflict throws `CheckpointVersionConflictError` (`CHECKPOINT_VERSION_CONFLICT`).
- **Single Transaction Consistency**: `prisma.$transaction` atomically updates `AgentTask` state, increments `checkpointVersion`, synchronizes `Approval` records (from `PROPOSED` to `PENDING`, `APPROVED`, or `REJECTED`), and records execution step traces in `AgentStep`.
- **Sensitive Data Redaction**: `SensitiveDataGuard` scrubs credentials, bearer tokens, API keys, and passwords (`[REDACTED]`) before serializing state into `AgentTask.inputJson`, `AgentTask.resultJson`, or `Approval.requestedPayload`.
- **Version Tracking**: Tracks `workflowVersion` (default `WF05_V1`), `currentStep`, `userId`, and `checkpointedAt` in `AgentTask`.

---

## 6. D1–D10 Workflow Integration Verification

All 10 canonical golden scenarios have been verified end-to-end through the WF-05 DAG:

| Scenario | Scenario Code | Primary Signal | Primary Diagnosis Driver | Key Recommended Action | Urgency / Priority |
|---|---|---|---|---|---|
| **D1** | Profit Drop | `PROFIT_DROP` | Ads Cost Expansion ($980) | `REVIEW_AD_SPEND` | P1 (Urgent) |
| **D2** | Stockout Imminent | `STOCKOUT_IMMINENT` | Days Cover $< 15$ days | `PREPARE_REPLENISHMENT` | P1 (Urgent) |
| **D3** | Approaching Stockout | `DAYS_COVER_WARNING` | Lead Time Velocity Gap | `REVIEW_REORDER_PLAN` | P2 (High) |
| **D4** | Quality Defect | `RETURN_RATE_SPIKE` | VOC Defect Themes (Hole Size) | `REVIEW_RETURN_REASON` | P2 (High) |
| **D5** | Competitor Price Drop | `COMPETITOR_PRICE_UNDERCUT` | Competitor -13.8% Undercut | `REVIEW_PRICE_COMPETITIVENESS` | P2 (High) |
| **D6** | Stale Telemetry | `DATA_STALE` | Ingest Latency Warning | `REFRESH_COMPETITOR_DATA` | P3 (Medium) |
| **D7** | Search Term Waste | `SEARCH_TERM_WASTE` | $420 Spend on Non-Converting Term | `REVIEW_NEGATIVE_KEYWORD` | P2 (High) |
| **D8** | Healthy / Zero Anomaly | *None* | *Bypassed* | *None* (`HEALTHY`) | N/A |
| **D9** | Partial Degradation | `DOMAIN_UNAVAILABLE` | Partial Domain Failure | Graceful partial output | P3 (Degraded) |
| **D10** | Margin Dilution | `HIGH_ACOS` | ACOS Spike / ROAS Erosion | `REVIEW_AD_SPEND` | P1 (Urgent) |

---

## 7. Verification Baseline & Quality Metrics

```text
Monorepo Typecheck:    10/10 PASS (tsc --noEmit)
Test Suites:           34/34 PASS (100%)
Total Tests:           264/264 PASS (100%)
Golden Benchmark:      9/9 PASS (100.0%)
Web Production Build:  22/22 Static Pages PASS
Listing RAG Tests:     10/10 PASS
Listing LLM Tests:     16/16 PASS
Epic 1/2 Regressions:  0 Detected (Low Risk + Mandatory Regression Gate PASS)
```
