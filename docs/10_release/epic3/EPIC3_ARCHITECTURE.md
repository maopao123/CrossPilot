# CrossPilot V9 Epic 3: Daily Operations Intelligence Architecture

> **System Architecture & Deterministic vs LLM Boundary Specification**  
> *CrossPilot V9 Enterprise Operations Intelligence System*

---

## 1. 架构总览 (System Architecture Overview)

Epic 3 实现了跨境电商领域首个“端到端全链路可解释、具备人机协同（HITL）审批门禁与单调持久化检查点”的日常运营智能诊断系统。

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        E-Commerce Business Data                        │
│          Sales / Advertising / Inventory / Reviews / Returns           │
│                       Competitors / Profit                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Sku360LoadParams (Date, Scope)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Phase 3: Sku360ContextLoader (Fact Layer)                │
│     - Normalized Sku360BusinessContext                                 │
│     - Evidence Ledger with Causal Confidence & Data Freshness          │
│     - Data Availability Status: AVAILABLE / PARTIAL / UNAVAILABLE      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Sku360BusinessContext
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          Phase 2: OperationAnomalyDetector (Detection Layer)           │
│     - 20+ Deterministic Domain Threshold Rules                         │
│     - Output: BusinessSignal[] (Domain, Severity, Delta, Threshold)    │
│     - Rule Audit: TRIGGERED / NO_ANOMALY / NOT_EVALUATED / SKIPPED     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ BusinessSignal[] + Sku360Context
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          Phase 4: CrossDomainDiagnosisService (Causal Layer)           │
│     - 15+ Cross-Domain Causal Patterns (Multi-lever Root Cause)        │
│     - Output: DiagnosisResult[] (Primary Driver, Contributing Factors) │
│     - Causal Strength: PROVEN / STRONG / INDICATIVE / UNKNOWN          │
│     - Zero Residual Variance Decomposition (Residual === 0)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ DiagnosisResult[] + Signals + Context
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│        Phase 5: ActionRecommendationService (Recommendation Layer)     │
│     - Deterministic Policy Engines (Ads, Inv, Listing, Pricing, VOC)   │
│     - Priority Scorer: P1 (Critical) / P2 (Warning) / P3 (Advisory)    │
│     - Risk Classifier: HIGH / MEDIUM / LOW                             │
│     - Execution Mode: APPROVAL_REQUIRED vs ADVISORY                    │
│     - Deduplication & Conflict Detection Engine                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ RecommendedAction[]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│      Phase 6: DailyOperationWorkflowService (WF-05 DAG & HITL)         │
│     - Fixed 9-Step DAG: Validate -> Resolve -> Load -> Detect ->       │
│       Diagnose -> Recommend -> Aggregate -> Approval Gate -> Finalize  │
│     - WorkflowAggregator: Cross-SKU Priority Ranking & Health Status   │
│     - Action-Level State Machine: PROPOSED -> APPROVED/REJECTED/DISMISS│
│     - Strict Guarantee: Approval ≠ Execute (Zero External Writes)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│    Phase 6.1 & 6.2: Postgres Checkpoint & Atomic Concurrency (OCC)     │
│     - Single Source of Truth: PostgreSQL / Prisma Database             │
│     - Atomic OCC: UPDATE ... WHERE id = ? AND checkpoint_version = ?   │
│     - Transactional Sync across AgentTask, AgentStep, and Approval     │
│     - Outbound Sensitive Data Redaction ([REDACTED] scrubbing)         │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼ REST API                        ▼ SSE Events
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│ Phase 7: REST API & Tool Platform    │ │ Phase 7: SSE Event Stream     │
│ - Compact Summary (<4KB default)     │ │ - Real-Time Snapshot Hydrate  │
│ - Selective Include (?include=...)   │ │ - DAG Step Progress Stream    │
│ - Role Guard (VIEWER Read-Only)      │ │ - Heartbeat Ping (15s)        │
│ - 5 First-Class AI Tools             │ │ - Safe Cleanup on Disconnect  │
└──────────────────┬───────────────────┘ └───────────────┬───────────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│        Phase 8: Operations Today UI / HITL Workbench (Frontend)        │
│     - `/app/operations/today` Daily Morning Operations Cockpit         │
│     - Business Health Overview & SKU Risk Matrix Ranking               │
│     - Action Priority Feed & Causal Chain Detail Drawer                │
│     - High-Risk Approval Modal with Legal Disclaimer                   │
│     - 409 OCC Conflict UX for Multi-Operator Protection                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心架构设计公理 (Architectural Axioms)

CrossPilot V9 严格执行五大架构隔离公理，任何代码变更均不得逾越：

```text
Load ≠ Detect ≠ Diagnose ≠ Recommend ≠ Execute
UI ≠ Business Logic
Approval ≠ Execute
SSE ≠ Source of Truth
Durable Persistence ≠ In-Memory Resume
```

1. **`Load ≠ Detect ≠ Diagnose ≠ Recommend ≠ Execute`**：
   - 数据加载器（Phase 3）只负责按统一契约组装事实与证据，不判断是否有问题。
   - 异常检测器（Phase 2）只负责规则触发，回答“发生了什么”，不推断为什么。
   - 根因诊断引擎（Phase 4）只负责跨域关联，回答“为什么发生”，不决定该怎么办。
   - 建议推荐服务（Phase 5）只负责生成动作候选，回答“应该怎么办”，不执行动作。
   - 执行层绝不侵入分析层。
2. **`UI ≠ Business Logic`**：
   - 前端工作台只负责展现、输入采集与状态交互。
   - 严禁在前端编写计算公式、重新分配优先级、预估补货量或假想影响。
3. **`Approval ≠ Execute`**：
   - 运营人员审批仅在工作流状态机内将动作置为 `APPROVED`。
   - **绝不自动触发外部系统写入**（无 Amazon SP-API 写调用、无 Ads 改价、无 ERP 采购单生成）。
4. **`SSE ≠ Source of Truth`**：
   - SSE 纯粹作为瞬态观察通道，PostgreSQL / Prisma 数据库是唯一真实源。
   - 客户端断开连接不影响工作流，重新连接先拉取全量 Snapshot 进行水合。
5. **`Durable Persistence ≠ In-Memory Resume`**：
   - 生产环境的工作流恢复严禁依赖 Node.js 进程内存或单例。
   - 任何实例崩溃后，其他容器实例凭借持久化数据库状态能精准无损恢复。

---

## 3. 确定性计算 vs 大语言模型边界 (Deterministic vs LLM Boundary)

CrossPilot V9 绝不盲目使用大模型解决确定性数学问题。我们划分了清晰的职责边界：

| 业务领域 | 负责模块 | 执行模式 | 为什么不用 LLM？ / 为什么使用 LLM？ |
| :--- | :--- | :--- | :--- |
| **经营指标与库存储备计算** | `InventoryPlanningService`, `ProfitCalculationService` | **100% 确定性纯代码** | 数学公式具有确定解，LLM 存在算术幻觉与漂移。 |
| **异常检测与阈值触发** | `OperationAnomalyDetector` | **100% 确定性纯代码** | 规则触发需严格可追溯，明确判定触发或跳过。 |
| **利润方差分解 (Waterfall)** | `VarianceAttributionService` | **100% 确定性纯代码** | 方差残差必须严格等于 0 ($\text{Residual} = 0$)，数学自洽。 |
| **跨域因果推理与置信度打分** | `CrossDomainDiagnosisService` | **100% 确定性纯代码** | 因果链条必须依据客观指标证据打分，不可泛泛猜测。 |
| **动作生成、风险评级与优先级** | `ActionRecommendationService` | **100% 确定性纯代码** | 风险级别（HIGH/MED/LOW）关乎企业资产安全，严禁模型随机波动。 |
| **动作排重、冲突检测与排序** | `ActionDeduplicator`, `WorkflowAggregator` | **100% 确定性纯代码** | 必须具有唯一稳定 Tie-breaker，保证多端输出完全一致。 |
| **工作流调度、OCC 版本控制** | `DailyOperationWorkflowService`, `PostgresStore` | **100% 确定性纯代码** | 事务隔离与并发互斥必须由数据库原子能力保障。 |
| **自然语言诊断解释润色** | `AiPlatform` / `PlatformLlmRuntime` | **LLM 增强 (可选)** | 仅用于将确定性诊断结论转换为易读的运营白话摘要。 |
| **Listing 营销文案生成** | `ListingWorkflowDagService` | **LLM 核心** | 依赖语言模型的创意与语感，受确定性 Grounding 引擎强约束。 |
| **VOC 买家评论语义提炼** | `VocService` / `ProviderRouter` | **LLM 核心** | 自然语言文本的主题抽取与情感分析是大模型专长。 |

---

## 4. 数据新鲜度与因果置信度契约 (Freshness & Confidence Contracts)

系统在 Phase 3~5 贯穿并向前端透传了标准化的事实置信度：

### 事实与预估边界 (Fact vs Estimate)
- `MEASURED`: 已实际发生的历史确定性指标（如历史广告浪费金额、已发生退货损失）。
- `ESTIMATED`: 基于日销速度与断货周期的理论预估敞口（如预估断货可能带来的潜在损失，严禁表述为已实际损失）。
- `QUALITATIVE`: 定性描述（如 Listing 规范未注明孔径带来的用户认知偏差）。

### 因果关联强度 (Causal Confidence)
- `PROVEN`: 具备双向数学强支撑（如零转化词花费直接构成净利润直接损失）。
- `STRONG`: 具备高度统计相关与时间前置因果（如销量激增直接导致 11.8 天库存储备不足）。
- `INDICATIVE`: 存在潜在关联但缺乏完整数据闭环（如竞品调价可能对转化率造成轻微承压）。
- `UNKNOWN`: 缺少竞品或第三方事实支撑，系统明确标为未知，严禁虚假断言。

---

## 5. 多租户隔离与安全防护体系 (Multi-Tenant & Security)

1. **Strict Multi-Tenant Isolation**：
   - 所有的 Task 查询、状态恢复、动作决策接口均受到 `WorkspaceGuard` 保护。
   - 跨工作区操作直接抛出 `403 WORKSPACE_ACCESS_DENIED`。
2. **Role-Based Access Control (RBAC)**：
   - `VIEWER` 角色只具备只读查看权限，任何写端点（启动、批准、驳回、忽略、恢复）被拦截并返回 `403 AUTH_FORBIDDEN`。
3. **Sensitive Data Guard**：
   - 出站 API 响应、检查点持久化 JSON、SSE 事件载荷及工具输出均由 `SensitiveDataGuard.scrub()` 进行深层递归扫描。
   - 自动将所有符合敏感模式的 Key/Token/Secret/Password 擦除为 `[REDACTED]`。
