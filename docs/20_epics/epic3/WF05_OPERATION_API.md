# WF-05 Operation API, Tool Platform & SSE Endpoints

> **Epic 3 Phase 7 Technical Architecture & Delivery Report**  
> *CrossPilot V9 Enterprise Operations Intelligence System*

---

## 1. 架构总览 (Architecture Overview)

Phase 7 将已经完成的 WF-05 Daily Operation Workflow 编排引擎、Durable Checkpoint 与 PostgreSQL 持久化层，通过企业级 REST API、实时 SSE 观察流、以及 Tool Platform 工具暴露给前端与 AI Copilot。

```text
┌────────────────────────────────────────────────────────────────────────┐
│               Frontend / AI Copilot / External Tool Caller             │
└───────────────┬────────────────────────┬───────────────────────┬───────┘
                │                        │                       │
      REST HTTP API (NestJS)      SSE Stream Endpoint      Tool Platform
    POST /operations/daily-diagnosis  GET .../events   operation.daily.diagnosis.*
                │                        │                       │
                ▼                        ▼                       ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │     DailyDiagnosisController & DailyDiagnosisService (apps/api)     │
    │     - WorkspaceGuard & JwtAuthGuard Isolation                      │
    │     - RBAC (VIEWER forbidden on all mutations)                     │
    │     - Compact DTO (<4KB default) & Selective Expansion (?include)   │
    │     - Outbound SensitiveDataGuard ([REDACTED] scrubbing)           │
    │     - Client Idempotency Key Handling                              │
    └─────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │          DailyOperationWorkflowService (packages/domain)           │
    │          - WF-05 6-Step DAG & HITL Approval Gate                   │
    │          - Zero External Execution (Approval ≠ Execute)            │
    │          - Optimistic Concurrency Control (OCC expectedVersion)    │
    │          - WorkflowEventEmitter & Event History                    │
    └─────────────────────────────────┬──────────────────────────────────┘
                                      │
                                      ▼
    ┌────────────────────────────────────────────────────────────────────┐
    │        PostgresWorkflowCheckpointStore & PrismaDatabaseAdapter     │
    │     - Single Source of Truth: PostgreSQL / Prisma                  │
    │     - Atomic Version Check: WHERE id = ? AND checkpoint_version = ?│
    │     - Transactional AgentTask, AgentStep, and Approval sync        │
    └────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心架构设计原则与边界

1. **API ≠ Business Logic**：Controller 与 Service 仅做入参校验、身份与工作区鉴权、DTO 紧凑转换与脱敏，完全委托 `DailyOperationWorkflowService` 进行工作流调度与持久化。
2. **Tool ≠ Business Logic**：Tool Platform 工具包装高层工作流执行与状态检查，具有 <4096 字符的输出大小保护与脱敏，防止 LLM Context 爆仓。
3. **SSE ≠ Source of Truth**：PostgreSQL 永远是唯一真实数据源。SSE 仅为单向观察通道；连接断开从不影响工作流状态，客户端重连自动拉取最新 `snapshot`。
4. **Approval ≠ Execute**：人工决策（APPROVE / REJECT / DISMISS）仅在工作流状态中更新 Decision 与 Action 状态，**严禁**触发任何针对 Amazon SP-API、广告、价格、Listing 或采购单的真实外部调用。
5. **Strict Multi-Tenant Workspace Isolation**：所有端点强制校验当前工作区权限，跨工作区访问直接阻断并返回 `403 WORKSPACE_ACCESS_DENIED`。
6. **Strict RBAC**：`VIEWER` 只读用户允许调用状态与 SSE 查询，严禁启动工作流、决策动作或恢复流程（返回 `403 AUTH_FORBIDDEN`）。

---

## 3. Preflight 调研与结论

### Preflight A: Approval.status 的 DISMISSED 持久化对齐
- **数据库现状**：`packages/db/prisma/schema.prisma` 中的 `Approval.status` 字段定义为 `String @default("PENDING")`，为非枚举字符串。
- **对齐结论**：无需执行危险的数据库 Schema 破坏性迁移。
- **实现契约**：在 `PrismaWorkflowDatabaseAdapter` 中，`DISMISSED` 直接映射为 `'DISMISSED'` 存入 `Approval.status`。既不降级为 `REJECTED` 造成语义扭曲，也不保留为 `PENDING` 造成分裂脑。

### Preflight B: Checkpoint Payload 大小实测
使用 `scripts/measure-checkpoint-payload.cjs` 对三种基准场景与工作区批量场景进行了序列化大小测量：

| 场景 | 状态大小 (KB) | 字节数 (Bytes) | 评估结论 |
| :--- | :--- | :--- | :--- |
| **White 场景 (健康基准)** | 14.02 KB | 14,355 bytes | 小型单 SKU 场景 |
| **Green 场景 (高风险/缺货)** | 22.29 KB | 22,829 bytes | 包含多种信号与动作 |
| **Grey 场景 (数据不充分/复杂归因)** | 41.25 KB | 42,236 bytes | 包含多维度上下文与归因链条 |
| **Workspace 模式 (多 SKU 批量)** | 83.38 KB | 85,386 bytes | 3 SKU 批量 DAG 运行 |

- **API 紧凑响应设计要求**：
  默认 `GET /operations/daily-diagnosis/:taskId` 严格返回 `<4KB` 的 `DailyOperationTaskSummaryDto`（仅包含摘要统计指标、Top Risks 与 Top 5 建议）。全量 `actions`、`signals`、`diagnoses`、`stepTraces`、`contexts` 仅在客户端显式传递 `?include=actions,signals,...` 时有选择地加载。

---

## 4. REST API 规范 (REST Endpoints)

### 4.1 启动日常诊断工作流
- **URL**: `POST /operations/daily-diagnosis`
- **Status**: `202 Accepted`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `X-Workspace-Id: <workspaceId>` (或通过 JWT 解析)
- **Request Body** (`DailyOperationStartRequestDto`):
  ```json
  {
    "marketplaceId": "AMAZON_US",
    "mode": "WORKSPACE",
    "skuIds": ["MTH-WHITE-001", "MTH-GREEN-001"],
    "dateRange": {
      "from": "2026-03-01T00:00:00Z",
      "to": "2026-03-14T00:00:00Z"
    },
    "idempotencyKey": "client-gen-uuid-12345",
    "options": {
      "workflowVersion": "WF05_V1",
      "waitForCompletion": false
    }
  }
  ```
- **Response Body** (`DailyOperationStartResponseDto`):
  ```json
  {
    "taskId": "task-diag-1789142655528-2lqa3",
    "workflowRunId": "run-1789142655528",
    "status": "RUNNING",
    "streamUrl": "/operations/daily-diagnosis/task-diag-1789142655528-2lqa3/events",
    "statusUrl": "/operations/daily-diagnosis/task-diag-1789142655528-2lqa3"
  }
  ```

### 4.2 查询任务状态与紧凑摘要
- **URL**: `GET /operations/daily-diagnosis/:taskId?include=actions,signals`
- **Status**: `200 OK`
- **Response Body** (`DailyOperationTaskSummaryDto`):
  ```json
  {
    "taskId": "task-diag-1789142655528-2lqa3",
    "workflowVersion": "WF05_V1",
    "status": "WAITING_APPROVAL",
    "currentStep": "APPROVAL_GATE",
    "healthStatus": "NEEDS_ATTENTION",
    "skuSummary": {
      "total": 1,
      "evaluated": 1,
      "failed": 0,
      "affected": 1
    },
    "signalSummary": {
      "criticalCount": 1,
      "warningCount": 2,
      "totalCount": 3
    },
    "diagnosisSummary": {
      "totalCount": 2
    },
    "actionSummary": {
      "p1Count": 1,
      "p2Count": 1,
      "p3Count": 0,
      "totalCount": 2,
      "advisoryCount": 0,
      "approvalRequiredCount": 2
    },
    "approvalSummary": {
      "pendingCount": 2,
      "approvedCount": 0,
      "rejectedCount": 0,
      "dismissedCount": 0
    },
    "topRisks": [
      {
        "riskId": "risk-stockout",
        "domain": "INVENTORY",
        "severity": "CRITICAL",
        "title": "Severe Stockout Risk",
        "skuId": "MTH-GREEN-001"
      }
    ],
    "topActions": [...],
    "actions": [...],
    "checkpointVersion": 5,
    "startedAt": "2026-03-14T10:00:00.000Z",
    "updatedAt": "2026-03-14T10:00:02.150Z"
  }
  ```

### 4.3 实时 Server-Sent Events (SSE) 事件流
- **URL**: `GET /operations/daily-diagnosis/:taskId/events`
- **Headers**:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- **事件流交互逻辑**:
  1. 鉴权与工作区隔离校验。
  2. 建立连接立即推送 `event: snapshot` 携带最新紧凑状态。
  3. 监听 `DailyOperationWorkflowService` 内部 `WorkflowEventEmitter` 事件推送（`step.started`, `signal.detected`, `recommendation.created`, `workflow.checkpoint` 等）。
  4. 每 15 秒发送心跳帧 `event: ping\ndata: {"timestamp":"..."}\n\n` 防止云端反向代理与网关超时断开。
  5. 客户端断开连接时触发 `req.on('close')`，清理心跳定时器并注销事件监听器，杜绝内存泄漏。

### 4.4 HITL 动作决策 (Approve / Reject / Dismiss)
- **URLs**:
  - `POST /operations/daily-diagnosis/:taskId/actions/:actionId/approve`
  - `POST /operations/daily-diagnosis/:taskId/actions/:actionId/reject`
  - `POST /operations/daily-diagnosis/:taskId/actions/:actionId/dismiss`
- **Status**: `200 OK`
- **Request Body** (`DailyOperationActionDecisionDto`):
  ```json
  {
    "expectedVersion": 5,
    "note": "Approved by senior operation manager",
    "decidedBy": "user_operator_01"
  }
  ```
- **Response Body** (`DailyOperationActionDecisionResponseDto`):
  ```json
  {
    "taskId": "task-diag-...",
    "actionId": "act-replenish-001",
    "decision": "APPROVED",
    "status": "WAITING_APPROVAL",
    "checkpointVersion": 6,
    "approvalSummary": {
      "pendingCount": 1,
      "approvedCount": 1,
      "rejectedCount": 0,
      "dismissedCount": 0
    }
  }
  ```
- **OCC 冲突保证**:
  若客户端提供的 `expectedVersion` 与服务端底层存储的 `checkpointVersion` 不一致，系统抛出 `CheckpointVersionConflictError`，API 统一转换为 `409 Conflict`，避免多操作员并发审批覆盖。

### 4.5 恢复工作流 (Resume)
- **URL**: `POST /operations/daily-diagnosis/:taskId/resume`
- **Status**: `200 OK`
- **Request Body**: `{"expectedVersion": 6}`
- **Response Body** (`DailyOperationResumeResponseDto`):
  ```json
  {
    "taskId": "task-diag-...",
    "status": "COMPLETED",
    "healthStatus": "NEEDS_ATTENTION",
    "checkpointVersion": 7,
    "completedAt": "2026-03-14T10:05:00.000Z"
  }
  ```

---

## 5. Tool Platform 工具体系 (AI Copilot Tools)

在 `packages/tool-platform` 中注册了 5 个一等公民工具：

| 工具名称 (Tool ID) | 分类 | 功能描述 | 输出保护 |
| :--- | :--- | :--- | :--- |
| `operation.daily.diagnosis.run` | `OPERATION` | 触发每日诊断工作流运行，返回精简摘要与 Top 5 动作 | `<4096` 字符截断与脱敏保护 |
| `operation.daily.diagnosis.status` | `OPERATION` | 检查工作流状态与审计步骤 | 工作区隔离检查，脱敏输出 |
| `operation.daily.action.approve` | `OPERATION` | 审批指定动作建议 (HITL) | OCC 版本控制，零外部执行 |
| `operation.daily.action.reject` | `OPERATION` | 驳回指定动作建议 | OCC 版本控制，记录操作原因 |
| `operation.daily.action.dismiss` | `OPERATION` | 忽略指定动作建议（标记误报） | OCC 版本控制，记录操作原因 |

---

## 6. HTTP 错误码映射对照表

在 `HttpExceptionFilter` 中完成端到端统一映射：

| 异常类型 | HTTP 状态码 | 业务错误代码 | 触发场景 |
| :--- | :--- | :--- | :--- |
| `WorkflowNotFoundError` | `404 Not Found` | `WORKFLOW_NOT_FOUND` | `taskId` 在持久化存储中不存在 |
| `CheckpointVersionConflictError` | `409 Conflict` | `CHECKPOINT_VERSION_CONFLICT` | 客户端传的 `expectedVersion` 与当前版本不匹配 |
| `InvalidActionStateError` | `409 Conflict` | `INVALID_ACTION_STATE` | 动作不是 `PROPOSED` 状态却尝试决策 |
| `PersistenceUnavailableError` | `503 Service Unavailable` | `PERSISTENCE_UNAVAILABLE` | 数据库不可用或事务异常 |
| `ForbiddenException` (Workspace) | `403 Forbidden` | `WORKSPACE_ACCESS_DENIED` | 用户尝试访问其他租户工作区的任务 |
| `ForbiddenException` (RBAC) | `403 Forbidden` | `AUTH_FORBIDDEN` | `VIEWER` 角色尝试执行写操作（启动、决策、恢复） |
| `ZodError` / Bad Request | `400 Bad Request` | `VALIDATION_ERROR` | 请求入参结构或格式校验失败 |

---

## 7. 质量门禁与测试验证基线

Phase 7 完成后全面执行质量验证：

```text
===========================================================================
  CrossPilot V9 Monorepo Verification Matrix (Epic 3 Phase 7 Final Baseline)
===========================================================================
[API Unit & Integration Tests] : 7/7 Test Suites PASS, 40/40 Tests PASS
[Tool Platform Tests]          : 3/3 Test Suites PASS, 16/16 Tests PASS
[Domain Engine Tests]          : 23/23 Test Suites PASS, 217/217 Tests PASS
[Actions Layer Tests]          : 1/1 Test Suites PASS, 2/2 Tests PASS
[AI LLM Runtime Tests]         : 1/1 Test Suites PASS, 6/6 Tests PASS
[Worker Processor Tests]       : 1/1 Test Suites PASS, 2/2 Tests PASS
[Integration Framework Tests]  : 8/8 Test Suites PASS
---------------------------------------------------------------------------
[Monorepo Total Tests]         : 36/36 Test Suites PASS, 283/283 Tests PASS
[TypeScript Typecheck]         : 10/10 Workspace Packages PASS (Zero Error)
[Golden Benchmark Regression]  : 9/9 PASS (100.0%)
[Listing RAG Golden Cases]     : 10/10 PASS
[Listing LLM Golden Cases]     : 16/16 PASS
[Next.js Web Production Build] : 22/22 Static Pages Generated (Exit 0)
[Epic 1 / Epic 2 / Epic 3 Reg.]: 0 Regressions
===========================================================================
```
