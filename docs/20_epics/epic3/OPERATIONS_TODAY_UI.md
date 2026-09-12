# Operations Today UI / Human-in-the-Loop Workbench

> **Epic 3 Phase 8 Technical Architecture & Delivery Report**  
> *CrossPilot V9 Enterprise Operations Intelligence System*

---

## 1. 架构总览 (Architecture Overview)

Phase 8 将 WF-05 Daily Operation Workflow 正式交付为面向亚马逊跨境电商运营人员的“每日运营驾驶舱”（Operations Today，路由 `/app/operations/today`）。它解决运营人员每天早晨的核心问题：

> **“今天发生了什么？哪些 SKU 最危险？为什么？我应该先处理什么？哪些动作需要我审批？”**

```text
┌────────────────────────────────────────────────────────────────────────┐
│             Web Browser / E-Commerce Operations Workspace              │
│                     (/app/operations/today)                            │
├────────────────────────────────────────────────────────────────────────┤
│  Operations Header (Marketplace / Range / Mode Switcher / Run Trigger) │
├────────────────────────────────────────────────────────────────────────┤
│  Business Health Summary (CRITICAL / NEEDS_ATTENTION / HEALTHY)        │
├────────────────────────────────────────────────────────────────────────┤
│  Workflow Progress Banner (Live 9-Step DAG Traces via SSE)             │
├────────────────────────────────────────────────────────────────────────┤
│  Action Recommendation List (P1/P2/P3 Cards, Impact, Risk, Status)     │
│  ├─ Action Detail Drawer (Causal Chain: Action -> Diagnosis -> Evi)    │
│  ├─ Approval Confirmation Modal (High Risk Warning & Legal Disclaimer) │
│  └─ OCC Conflict Modal (409 Version Conflict & Stale State Alert)     │
├────────────────────────────────────────────────────────────────────────┤
│  SKU Risk Ranking Matrix (Evaluated SKU Matrix & Filter)               │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │ REST API                      │ SSE Observation
                   │ (GET, POST)                   │ (EventSource)
                   ▼                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│           DailyDiagnosisApiClient (apps/web/src/lib/...)               │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
                   ▼                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│           DailyDiagnosisController & Service (apps/api)                │
│           - Compact DTO (<4KB default) & Selective Expansion           │
│           - Outbound SensitiveDataGuard ([REDACTED])                   │
│           - Optimistic Concurrency Control (expectedVersion)           │
│           - RBAC (VIEWER Read-Only Enforced)                           │
└──────────────────┬─────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│           DailyOperationWorkflowService & Postgres Checkpoint          │
│           - Source of Truth: PostgreSQL / Prisma Database              │
│           - Strict Zero External Execution (Approval ≠ Execute)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心架构设计原则与边界 (Strict Boundaries)

1. **UI ≠ 业务逻辑 (UI ≠ Business Logic)**：
   - 前端工作台纯粹呈现数据与交互状态。
   - 所有风险等级计算、动作优先级（P1/P2/P3）、期望财务影响金额与类型（`MEASURED` / `ESTIMATED` / `QUALITATIVE`）、补货建议数量、因果诊断推理完全由 Phase 2 ~ Phase 7 后端确定，前端严禁硬编码或重新计算。
2. **审批 ≠ 执行 (Approval ≠ Execute)**：
   - 运营人员在界面点击“批准（Approve）”后，系统将 Action 状态推进至 `APPROVED` 并记录审批快照。
   - **绝对不产生针对外部亚马逊系统、SP-API、广告竞价、产品价格、Listing 或采购单的真实变更调用**。
   - 针对高风险（`HIGH`）动作，审批确认弹窗必须醒目展示强制性免责声明：“此审批不会执行采购。审批不等于执行动作。”
3. **SSE ≠ 真实数据源 (SSE ≠ Source of Truth)**：
   - PostgreSQL 数据库与持久化 Checkpoint 永远是唯一真实数据源。
   - SSE 作为单向实时观察通道，断线不阻断业务；重连后首先拉取初始快照（Snapshot）进行全量水合（Hydration）。
4. **并发控制与 OCC UX (Optimistic Concurrency Control)**：
   - 前端提交批准、驳回或忽略操作时，强制带上 `expectedVersion`。
   - 当检测到 HTTP 409 `CHECKPOINT_VERSION_CONFLICT` 或 `INVALID_ACTION_STATE` 时，触发专用 OCC 冲突弹窗，提示运营人员当前任务已被其他协作人员处理，并提供一键刷新同步。
5. **角色鉴权与只读保障 (Role-Based Permissions)**：
   - 系统支持 `ADMIN`、`OPERATOR`、`VIEWER` 等角色。
   - `VIEWER` 拥有只读查看权限；工作台界面自动隐藏或禁用“运行诊断”、“批准”、“驳回”、“忽略”等操作按钮，并在后端返回 `403 AUTH_FORBIDDEN` 时安全处理。

---

## 3. 前端组件层次结构 (Component Hierarchy)

所有 Phase 8 组件位于 `apps/web/src/app/app/operations/today/components/`：

| 组件名称 | 核心职能 |
| :--- | :--- |
| **`OperationsHeader`** | 站点选择（US / UK / DE 等）、模式切换（WORKSPACE 概览 vs SKU 聚焦）、时间周期配置、状态徽章、运行诊断触发按钮。 |
| **`BusinessHealthSummary`** | 全局经营健康度大卡片（CRITICAL 红色、NEEDS_ATTENTION 琥珀色、HEALTHY 绿色）、已评估 SKU 数、P1/P2 动作计数、待审批任务计数、关键风险披露。 |
| **`WorkflowProgressBanner`** | DAG 9 步进度看板（VALIDATE_INPUT ~ FINALIZE），支持实时百分比、展开/折叠步骤耗时与输出日志摘要（严格屏蔽私有思维链）。 |
| **`ActionList`** | 核心动作流展示；按 P1 -> P2 -> P3 与影响金额排列；展示 SKU、动作类型、原因、期望影响标签、风险等级、执行模式（`APPROVAL_REQUIRED` / `ADVISORY`）、状态。 |
| **`ActionDetailDrawer`** | 侧滑完整因果链抽屉：Action -> 诊断根因 -> 支撑指标 -> 证据项（包含因果可信度标签：Confirmed / Strong Evidence / Possible Driver / Not Confirmed）及数据新鲜度。支持直接录入审批备注并提交决策。 |
| **`ApprovalConfirmationModal`**| 高风险动作二次确认弹窗，显示风险警告、动作详情，并呈现不可忽略的“审批不等于执行”免责声明。 |
| **`OccConflictModal`** | 多人协同版本冲突提示弹窗；当捕获 409 错误时弹出，指导运营人员立即刷新以加载最新已决策状态。 |
| **`SkuRiskRankingTable`** | 多 SKU 风险矩阵表；列出 SKU 编码、健康状态、P1/P2 计数、首要问题、预估财务敞口与待办审批，支持一键筛选。 |
| **`EmptyAndHealthyState`** | 健康状态卡片（无告警）、部分完成状态卡片与网络/工作流异常卡片。 |

---

## 4. API 客户端与 SSE 集成 (`daily-diagnosis.api.ts`)

```typescript
export class DailyDiagnosisApiClient {
  // 1. 启动工作流诊断 (POST /operations/daily-diagnosis)
  async startDiagnosis(workspaceId: string, req: DailyOperationStartRequestDto);

  // 2. 获取任务紧凑摘要 / 选择性展开 (GET /operations/daily-diagnosis/:taskId?include=...)
  async getTaskSummary(taskId: string, workspaceId: string, include?: string);

  // 3. 审批动作 (POST /operations/daily-diagnosis/:taskId/actions/:actionId/approve)
  async approveAction(taskId: string, actionId: string, workspaceId: string, dto: DailyOperationActionDecisionDto);

  // 4. 驳回动作 (POST /operations/daily-diagnosis/:taskId/actions/:actionId/reject)
  async rejectAction(taskId: string, actionId: string, workspaceId: string, dto: DailyOperationActionDecisionDto);

  // 5. 忽略动作 (POST /operations/daily-diagnosis/:taskId/actions/:actionId/dismiss)
  async dismissAction(taskId: string, actionId: string, workspaceId: string, dto: DailyOperationActionDecisionDto);

  // 6. 恢复工作流 (POST /operations/daily-diagnosis/:taskId/resume)
  async resumeWorkflow(taskId: string, workspaceId: string, dto: { expectedVersion: number });

  // 7. 实时 SSE 事件流连接 (GET /operations/daily-diagnosis/:taskId/events)
  connectEvents(taskId: string, callbacks: { onSnapshot, onEvent, onError });
}
```

---

## 5. 三大基准场景与工作区端到端验证

端到端集成测试套件 `apps/api/test/operations-today-workbench.integration.spec.ts` 覆盖全部场景：

| 场景 | 核心事实与因果链 | 生成动作 | 优先级与风险 | 审批与状态 |
| :--- | :--- | :--- | :--- | :--- |
| **White SKU** (`MTH-WHITE-001`) | 第 11 周广告花费激增，利润下降 -$980 | `REVIEW_AD_SPEND` | **P1**, LOW 风险 | `APPROVAL_REQUIRED` -> `WAITING_APPROVAL` |
| **Green SKU** (`MTH-GREEN-001`) | 销量爆发，FBA 库存在途不足，库存储备降至 11.8 天（低于 15 天交期） | `PREPARE_REPLENISHMENT` | **P1**, **HIGH** 风险 | `APPROVAL_REQUIRED` -> 触发高风险免责弹窗 |
| **Grey SKU** (`MTH-GREY-001`) | 退货率异常飙升至 6.7%，VOC 提取 31.1% 投诉“孔径过小无法插入电动牙刷” | `INVESTIGATE_PRODUCT_FIT` / `REVIEW_RETURN_REASON` | **P2**, LOW 风险 | `ADVISORY` 建议性动作 |
| **Workspace 模式** (多 SKU 批量) | 评估 3 款 SKU，聚合全局健康度为 `CRITICAL` | 跨 SKU 优先级排序矩阵 | 包含多个 P1/P2 动作 | 紧凑摘要严格保持在 `<10KB` 内 |

### 多人协同 OCC 冲突验证流程
1. 操作员 A 与操作员 B 同时打开工作台，处于 Checkpoint Version $V$。
2. 操作员 A 批准某动作，版本推进至 $V+1$。
3. 操作员 B 在未刷新状态下尝试驳回该动作（传入旧版本 $V$），后端返回 `409 CHECKPOINT_VERSION_CONFLICT`。
4. 前端展示 `OccConflictModal`，操作员 B 点击“立即刷新”。
5. 页面重新获取数据，展示该动作已被标记为 `APPROVED`。若此时操作员 B 强行再次驳回，返回 `409 INVALID_ACTION_STATE`，杜绝重复决策。

---

## 6. 正式交付质量基线

```text
37/37 Test Suites PASS
289/289 Tests PASS
Typecheck 10/10 PASS
Golden Benchmark 9/9 PASS
Listing RAG 10/10 PASS
Listing LLM 16/16 PASS
Next.js Web Build 23/23 Routes PASS (/app/operations/today: 17.2 kB)
Epic 1 / Epic 2 / Epic 3 Regression = 0
```

---

## 7. 停机准则 (Halt Boundary)

Phase 8 已全量实现并完成自动化与端到端集成验证。严格执行停机准则：**停止在 Phase 8 边界，禁止在未经用户明确批准前进入 Phase 9（Release Verification & Documentation Freeze）。**
