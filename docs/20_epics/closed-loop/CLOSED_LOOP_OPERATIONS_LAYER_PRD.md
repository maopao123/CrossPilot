# CrossPilot Closed-loop Operations Layer 需求文档（PRD）

> **文档层级**：Level 2 需求与设计规范（20_epics）
> **日期**：2026-09-13
> **状态**：DRAFT — 等待人工确认后排期；本文件只定义需求，**不改代码、不改 schema、不启动实现**
> **上游依据**：`docs/HANDOFF.md`（V9.1 FROZEN / V9.3 Action Layer SHIPPED / V10 Epic 1-3 SHIPPED）、`V10_COMMERCE_OS_ARCHITECTURE.md`、用户经营闭环建议（2026-09-13）
> **语言口径**：遵循根 `AGENTS.md`——项目自有名称与平台实体词保留英文，解释性文字一律中文

---

## 0. 一句话定位

CrossPilot 现有链路停在「`Recommendation → PlannedAction → Execute` 结束」。本 Layer 把链路闭合成**经营闭环**：

```text
Amazon / Shopify / Simulator
        ↓
Unified Commerce Data（已有：Order / AdMetricDaily / InventoryBalance / ProfitDaily / ChannelDailyMetric）
        ↓
Daily Diagnosis（已有：WF-05 / daily-diagnosis）
        ↓
Fact / Evidence / Insight（已有：CommerceFact / EvidenceItem）
        ↓
Recommendation（已有：BusinessRecommendation）
        ↓
PlannedAction → Risk / Approval → Execute → Verify（已有：V9.3 Action Layer，Mock Executor）
        ↓
┌──────────────────────────────────────────┐
│ Epic A  Outcome Tracking      执行后到底赚没赚钱 │
│ Epic B  Incident & Alert      结果有没有异常     │
│ Epic C  Experiment Framework  变化是不是这个动作造成的 │
└──────────────────────────────────────────┘
        ↓
Learning（事实沉淀，反哺 Recommendation）
        ↓
Epic D  Operations Autopilot（L1→L4 分级自动化）
        ↺
```

**核心原则：4 个能力不是 4 个平级功能，而是一条有严格依赖的升级链。**

```text
① Outcome Tracking     “执行以后发生了什么？”        不依赖任何外部写入，Simulator 即可跑通
        ↓
② Incident / Alert     “结果有没有异常？”            直接吃现有 Order/Inventory/Ads/Profit/SyncRun 数据
        ↓
③ Experiment Framework “这次变化是不是这个动作造成的？”  需要 Outcome 的指标窗口能力作地基
        ↓
④ Operations Autopilot “既然知道什么有效，能不能自动决策执行？” 需要 ①② 的可信度积累作安全前提
```

---

## 1. 总约束（所有 Epic 共同遵守）

1. **Additive only**：新增表走新 migration；不改既有表结构语义；不回填历史表。
2. **冻结红线不动**（沿用 `docs/HANDOFF.md` §5）：
   - 不改 WF-05 9-step DAG / 诊断公式 / Recommendation 状态机 / OppScore v1.0.0；
   - 不改 Simulator 引擎确定性参数（seed / 起始日 2026-09-01 / 初始库存 500/400/300 / 事件模板文案）与数据隔离标记（`source_provider='simulator'` / `'sim-'` reviewer / `'SIM-'` campaign）；
   - 不引入 Amazon Write；不切换 `STORE_SKU360_SOURCE=prisma`；
   - **Approval ≠ Execute** 铁律在 Autopilot 下仍然成立，只是审批主体从人扩展为 Policy Engine（见 Epic D）。
3. **多租户隔离**：所有新表必须带 `workspaceId` + 索引；所有查询按 workspace 过滤；写路径受 `ViewerWriteGuard` 约束。
4. **Simulator-first**：每个 Epic 先在 Simulator 数据上跑通端到端，再接 Amazon/Shopify Adapter；Adapter 切换时上层（Outcome / Experiment / Autopilot）**零重设计**。
5. **真实度分级**：所有新 UI / API 产出物标注 REAL / PARTIAL / MOCK / DEMO_ONLY；Simulator 来源数据必须透出 `source_provider='simulator'`，不得冒充真实店铺数据。
6. **Windows 本机只做开发**；部署走 `_ops_deploy_*.sh` 既有流程（脚本不入库）。

---

## 2. Epic A — Outcome Tracking（最高优先级，立即启动）

### 2.1 问题

当前链路：

```text
发现 ACOS 高 → Recommendation → PlannedAction(DECREASE_BID 20%) → ActionExecution SUCCESS → 结束
```

「SUCCESS」只代表 Mock Executor 跑完了，**不代表经营结果变好**。Recommendation 不能停在「已执行」。

### 2.2 目标

执行 Action 后，自动在 7 / 14 / 30 天观察窗对比 Before / After 指标，产出结构化 `ActionOutcome`，并能向用户说出：

> 9 月 3 日执行关键词降价 20%，7 天后 ACOS 从 42% 降至 31%，广告销售额基本稳定，利润增加 18%。

### 2.3 数据模型（新增表 `action_outcomes`，additive）

```prisma
model ActionOutcome {
  id              String    @id @default(uuid())
  workspaceId     String    @map("workspace_id")
  actionId        String    @map("action_id")          // → planned_actions.id
  storeId         String?   @map("store_id")           // → stores.id，Simulator 场景可空
  targetType      String    @map("target_type")        // sku | campaign | ad_target | listing
  targetId        String    @map("target_id")

  baselineStart   DateTime  @map("baseline_start") @db.Date
  baselineEnd     DateTime  @map("baseline_end") @db.Date
  observeStart    DateTime  @map("observe_start") @db.Date
  observeEnd      DateTime  @map("observe_end") @db.Date   // 计划观察截止日

  windowDays      Int       @map("window_days")        // 7 | 14 | 30
  metricsBefore   Json      @map("metrics_before")     // { ctr, cvr, acos, roas, profit, orders, revenue }
  metricsAfter    Json?     @map("metrics_after")      // 观察窗未结束为 null
  delta           Json?                                   // 各指标绝对/相对变化

  status          String    @default("OBSERVING")
  // OBSERVING | POSITIVE | NEGATIVE | NEUTRAL | INCONCLUSIVE | EXPIRED
  evaluationReason String?  @map("evaluation_reason") @db.Text

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  evaluatedAt     DateTime? @map("evaluated_at")

  workspace       Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  action          PlannedAction  @relation(fields: [actionId], references: [id], onDelete: Cascade)

  @@unique([actionId, windowDays])     // 同一 Action 同一窗口只评一次
  @@index([workspaceId, status])
  @@index([observeEnd])                // worker 扫描到期观察窗
  @@map("action_outcomes")
}
```

设计要点：

- **T0 锚点**：`baselineEnd = ActionExecution.timestamp`（执行时刻所在 sim/自然日），`baselineStart = T0 - 7d`；`observeStart = T0 + 1d`，`observeEnd = T0 + windowDays`。
- **指标口径冻结**：ACOS = spend / 广告销售额；ROAS = 广告销售额 / spend；与 `operations-today.mapper.ts` 现有口径一致，禁止另起定义。
- **数据来源优先级**：Simulator（`channel_daily_metrics` + `ad_metric_daily` + `profit_daily` 注意 simulator 目前不写 profit_daily——Epic A 需要补一条 simulator → profit 的最小写入，或明确标记该指标 INCONCLUSIVE）→ 后续 Amazon/Shopify Adapter 同一套读取接口。
- **判定规则 v1（确定性，不用 LLM）**：
  - 主指标改善 ≥ 阈值（默认 5%）且护栏指标（profit、orders）未恶化 → `POSITIVE`；
  - 主指标恶化 ≥ 阈值 → `NEGATIVE`；
  - 变化在 ±阈值内 → `NEUTRAL`；
  - 观察窗内数据缺失（sync 断、simulator 未覆盖该 target）→ `INCONCLUSIVE` + `evaluationReason` 说明缺什么。
- **状态机**：`OBSERVING → POSITIVE/NEGATIVE/NEUTRAL/INCONCLUSIVE/EXPIRED`，终态不可逆；`EXPIRED` 用于 observeEnd 已过但数据永远补不齐的兜底。

### 2.4 链路串联要求

```text
BusinessRecommendation → PlannedAction → ActionExecution → ActionOutcome
```

必须可双向追溯：从 Outcome 能回到 Recommendation 的 evidenceIds；从 Recommendation 能列出其全部 Action 的 Outcome 汇总。

### 2.5 API 草案

| Method | Path | 说明 |
| :--- | :--- | :--- |
| GET | `/api/v1/actions/:id/outcomes` | 某 Action 的 7/14/30 天 Outcome 列表 |
| GET | `/api/v1/outcomes` | 按 workspace 分页，filter: status / targetType / windowDays |
| GET | `/api/v1/outcomes/summary` | 近 90 天 POSITIVE/NEGATIVE 占比、累计 profit delta（Learning 的对外面孔） |
| POST | `/api/v1/outcomes/:id/reevaluate` | OWNER/ADMIN 手动重评（数据补齐后） |

### 2.6 Worker

新增 BullMQ repeatable job `outcome-evaluator`：每 N 分钟扫描 `status='OBSERVING' AND observe_end <= today`，逐条聚合指标、判定、落终态。Simulator 场景下「今天」= `simulation_states.sim_date`，**禁止用宿主机时钟**（否则模拟世界永远等不到 7 天后）。

### 2.7 UI（V1 最小面）

- Operations Today 驾驶舱：Action 卡片增加「执行结果」徽标（POSITIVE 绿 / NEGATIVE 红 / OBSERVING 灰），点击展开 Before/After 指标对比表；
- 不新增独立页面。

### 2.8 验收标准

1. Simulator 中执行一个 `DECREASE_BID` Mock Action → advance 7 模拟日 → Outcome 自动落终态，指标数值可与 `channel_daily_metrics` 手算对账一致；
2. `@@unique([actionId, windowDays])` 并发重评不双写（P2002 映射 409）；
3. 数据缺失场景（如 simulator 无 profit）产出 `INCONCLUSIVE` 且 reason 明确，不是伪造 0；
4. VIEWER 对 `reevaluate` 403；跨 workspace 访问 404/403；
5. 全部文案走 `ui-labels.ts` 中文映射。

---

## 3. Epic B — Incident & Alert Center（第二优先级）

### 3.1 问题

系统已有 Order / Inventory / Advertising / Profit / Listing / SyncRun / Worker 数据，但**异常没有被统一建模**：销量骤降、ACOS 异常、库存不足、Listing 下架、Sync 连续失败、Token 过期，目前要么靠人看，要么散落在 diagnosis 文案里。

### 3.2 目标

```text
Signal（原始指标/事件）
   ↓
Rule / Detector（确定性规则，不用 LLM）
   ↓
Incident（统一异常对象）
   ↓
Diagnosis（复用 WF-05 Fact/Evidence 能力做归因）
   ↓
Recommendation → PlannedAction（接回现有 Action Layer）
```

Alert Center 不是普通监控系统，而是 **异常 → 诊断 → 决策 → Action** 的入口。

示例（销量骤降）：

```text
最近 3 天销量 120 → 118 → 61
   ↓ detector
SALES_DROP severity=HIGH
   ↓ 归因检查（库存 / Listing 状态 / 广告曝光 / 价格 / 评价）
Fact: 库存正常、Listing 正常、CTR -37%、广告曝光 -41%
   ↓
Insight: 主要原因可能来自广告流量下降
   ↓
Recommendation: 提高高转化关键词预算
```

### 3.3 第一批只做 6 类（Worker backlog 明确后置）

| Incident 类型 | 检测规则 v1（示意，阈值可 workspace 级 override） | 数据源 |
| :--- | :--- | :--- |
| `SALES_DROP` | 近 3 天订单均值为正且最近 1 天 < 均值的 50% | Order / channel_daily_metrics |
| `ACOS_SPIKE` | 近 3 天 ACOS > 目标 ACOS × 1.5 且 spend > 阈值 | ad_metric_daily |
| `LOW_INVENTORY` | daysCover < leadTimeDays + 安全天数 | InventoryBalance + 既有补货公式 |
| `LISTING_INACTIVE` | Listing 状态由 ACTIVE 变为非 ACTIVE | Listing / ChannelIdentity |
| `SYNC_FAILURE` | 同一 account 连续 3 次 SyncRun FAILED | sync_runs |
| `TOKEN_EXPIRED` | ProviderCredential 过期 / refresh 失败 | provider_credentials / SyncRun errorCode |

### 3.4 数据模型（新增表 `incidents`，additive）

```prisma
model Incident {
  id            String   @id @default(uuid())
  workspaceId   String   @map("workspace_id")
  type          String                                   // 上述 6 类
  severity      String                                   // INFO | WARNING | HIGH | CRITICAL
  status        String   @default("OPEN")
  // OPEN | ACKNOWLEDGED | DIAGNOSED | ACTIONED | RESOLVED | DISMISSED
  targetType    String?  @map("target_type")
  targetId      String?  @map("target_id")
  accountId     String?  @map("account_id")

  dedupKey      String   @map("dedup_key")               // type+target+日期桶，防重复开单
  title         String
  detail        Json                                     // 触发时的指标快照
  factIds       Json     @default("[]") @map("fact_ids") // 归因产生的 CommerceFact id 列表
  recommendationId String? @map("recommendation_id")     // → business_recommendations.id
  firstSeenAt   DateTime @default(now()) @map("first_seen_at")
  lastSeenAt    DateTime @default(now()) @map("last_seen_at")
  resolvedAt    DateTime? @map("resolved_at")

  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, dedupKey])
  @@index([workspaceId, status])
  @@index([workspaceId, severity])
  @@map("incidents")
}
```

设计要点：

- **去重**：`dedupKey` 唯一约束；同 Key 再触发只更新 `lastSeenAt` 与 `detail`，不重复开单；
- **与 SimulationEvent 的关系**：Simulator 的 RETURN_SPIKE 等事件是 Signal 的一种来源，Incident 是跨来源的统一抽象；SimulationEvent 表不动，detector 读它；
- **归因**：Incident 创建后异步触发一次轻量归因（复用 WF-05 的 detector/pattern，但**不改 WF-05 本体**），产出 `factIds`；归因失败不影响 Incident 本身存在；
- **自动 RESOLVED**：指标恢复正常（如下一个检测周期 SALES_DROP 条件不再成立）自动置 RESOLVED 并记录 `resolvedAt`，人工 ACK/DISMISS 走 API。

### 3.5 API 草案

| Method | Path | 说明 |
| :--- | :--- | :--- |
| GET | `/api/v1/incidents` | filter: status / severity / type |
| GET | `/api/v1/incidents/:id` | 含 detail、归因 facts、关联 recommendation |
| POST | `/api/v1/incidents/:id/ack` | 认领 |
| POST | `/api/v1/incidents/:id/dismiss` | 忽略（需填 reason） |
| POST | `/api/v1/incidents/:id/diagnose` | 手动触发/重触归因 |
| GET | `/api/v1/incidents/badge` | 驾驶舱角标：OPEN 且 severity≥HIGH 的计数 |

### 3.6 Worker

新增 BullMQ repeatable job `incident-detector`：每个检测周期对 6 类规则逐一求值。Simulator 场景时间基准同 Epic A（用 `sim_date`）。

### 3.7 UI

- 新增一个 Alert Center 页面（本 Layer 唯一允许的新页面）：Incident 列表 + 详情抽屉（异常 → 归因 Facts → Recommendation → 一键生成 PlannedAction）；
- Operations Today 顶栏加角标。

### 3.8 验收标准

1. Simulator 注入 RETURN_SPIKE / 销量腰斩场景 → 对应 Incident 自动开出，severity 正确；
2. 同一异常连续 5 个检测周期只存在 1 条 Incident（dedup 生效）；
3. 指标恢复后自动 RESOLVED；
4. SYNC_FAILURE / TOKEN_EXPIRED 可通过构造 SyncRun 行触发，不依赖真实 Amazon；
5. 归因产出至少 1 条 CommerceFact 并可从 Incident 详情跳转查看。

---

## 4. Epic C — Experiment Framework（第三阶段）

### 4.1 问题

Outcome Tracking 只能回答「调整以后指标变好了」，不能回答「**是不是因为你的调整才变好**」——竞品涨价、旺季、流量结构变化都是混杂因子。

### 4.2 目标

统一的实验对象，覆盖 4 类：

```text
type: LISTING | PRICING | BID | CREATIVE
control / treatment 分组
primaryMetric + guardrailMetrics（护栏：CVR / RefundRate / Profit）
startAt / endAt / result / confidence
```

示例：Listing 主图实验，Control=旧主图，Treatment=AI 新主图，Primary=CTR，Guardrail=CVR/退款率/利润 → 结果 CTR +12.4%、CVR +1.8%、Profit +7.2%，WINNER=Treatment。

### 4.3 数据模型（新增表 `experiments`，additive）

```prisma
model Experiment {
  id              String   @id @default(uuid())
  workspaceId     String   @map("workspace_id")
  type            String                                  // LISTING | PRICING | BID | CREATIVE
  status          String   @default("DRAFT")
  // DRAFT | RUNNING | CONCLUDED | ABORTED
  name            String
  hypothesis      String?  @db.Text
  targetType      String   @map("target_type")
  targetId        String   @map("target_id")

  controlConfig   Json     @map("control_config")
  treatmentConfig Json     @map("treatment_config")
  allocationPct   Int      @default(50) @map("allocation_pct")  // treatment 流量占比（真实环境）

  primaryMetric   String   @map("primary_metric")
  guardrailMetrics Json    @map("guardrail_metrics")

  startAt         DateTime? @map("start_at")
  endAt           DateTime? @map("end_at")
  minSampleSize   Int      @default(100) @map("min_sample_size")

  result          Json?                                   // { control: {...}, treatment: {...}, lift, confidence, winner }
  actionId        String?  @map("action_id")              // 溯源：由哪个 PlannedAction 发起
  createdBy       String?  @map("created_by")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, status])
  @@map("experiments")
}
```

设计要点：

- **V1 边界（诚实声明）**：真实平台上的流量切分（A/B routing）依赖 Amazon/Shopify 能力，V1 不支持真实分流。V1 提供两种可落地的实验形态：
  1. **Simulator 内实验**：Simulator 引擎增加「实验钩子」——treatment 组 SKU/campaign 在模拟日内应用 treatmentConfig（如 bid×1.1），control 组不变，天然分组天然对照。**这是 V1 主战场**；
  2. **真实环境序贯实验（switchback / 前后对照增强版）**：按时间片交替 control/treatment（如单双日交替），降低混杂因子；统计结论标注 `PARTIAL` 置信度。
- **统计判定 v1**：两样本比例/均值检验（CTR/CVR 用 z 检验，利润用 t 检验或 Mann-Whitney），`confidence` 达到 0.9 且样本量 ≥ minSampleSize 才允许 `WINNER`；护栏指标显著恶化 → 自动建议 `ABORTED`；
- **与 Learning 的关系**：`result` 沉淀为「哪些动作在什么情况下对什么 SKU 真正有效」的结构化记录，是 Epic D Policy 调参和未来 Learning Layer 的数据基础；
- 复用 Epic A 的指标窗口聚合代码（同一套 metricsBefore/After 计算，不复制实现）。

### 4.4 API 草案

| Method | Path | 说明 |
| :--- | :--- | :--- |
| POST | `/api/v1/experiments` | 创建（DRAFT） |
| POST | `/api/v1/experiments/:id/start` / `abort` | 状态流转 |
| GET | `/api/v1/experiments` / `:id` | 列表 / 详情（含实时 result 快照） |
| POST | `/api/v1/experiments/:id/conclude` | 手动结算（未到 endAt 时） |

### 4.5 验收标准

1. Simulator 中创建一个 BID 实验（treatment=bid+10%），advance 7 模拟日，`result` 中 control/treatment 指标与 `channel_daily_metrics`/`ad_metric_daily` 手算一致；
2. 样本量不足时 `conclude` 返回 `INCONCLUSIVE`，不允许出 WINNER；
3. 护栏恶化自动标记建议 ABORT；
4. 实验期间 Simulator 其余 SKU 数据不受污染（隔离标记延续）。

---

## 5. Epic D — Operations Autopilot（最后做，严格分级）

### 5.1 原则

> **Autopilot 不是让 LLM 随便操作店铺。**

```text
AI           负责发现问题 / 推理 / 推荐
Policy Engine 负责：能不能执行 / 执行多少 / 多久一次 / 什么情况下回滚
```

Policy Engine 是确定性规则代码，不是 prompt。这与现有 Risk / Approval / Action Framework 思想一致：**Approval ≠ Execute 仍然成立，只是 L3+ 的 Approval 由 Policy Engine 代替人给出，且全程留痕**。

### 5.2 分级定义

| Level | 行为 | 现状 |
| :--- | :--- | :--- |
| L1 | AI 诊断 + Recommendation | 已有（V9.2） |
| L2 | AI 生成 PlannedAction，人工审批后执行 | 已有（V9.3，Mock Executor） |
| L3 | 低风险 Action 自动执行（Policy 白名单内） | **本 Epic 新增** |
| L4 | 自动发现 → 自动执行 → 自动验证（Outcome）→ 必要时自动回滚 | **本 Epic 新增，依赖 Epic A/B** |

### 5.3 数据模型（新增表 `autopilot_policies`，additive）

```prisma
model AutopilotPolicy {
  id            String   @id @default(uuid())
  workspaceId   String   @map("workspace_id")
  name          String
  enabled       Boolean  @default(false)               // 默认关闭，显式开启
  level         Int                                    // 3 | 4（L1/L2 无需 Policy）
  actionType    String   @map("action_type")           // 如 DECREASE_BID

  condition     Json     // { acosGt: 0.45, spendGt: 100, conversionsGte: 5 }
  actionParams  Json     @map("action_params")         // { bidDeltaPct: -10 }
  limits        Json     // { maxAdjustPct: 10, cooldownHours: 24, dailyMaxExecutions: 1 }
  verify        Json?    // { checkAfterHours: 48, metric: "acos" }
  rollback      Json?    // { cvrDropPctGt: 20 }（L4 必填）

  createdBy     String?  @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, enabled])
  @@map("autopilot_policies")
}
```

所有 Autopilot 产生的 PlannedAction 必须：

1. `createdBy = 'autopilot:<policyId>'`，与人工作用区分；
2. 仍走 `planned_actions` / `action_executions` 同一套表与状态机（**不另起执行通道**）；
3. L4 回滚本身也是一个 PlannedAction（`actionType='ROLLBACK'`，关联原 actionId），走同一审批/执行/留痕链路；
4. cooldown / dailyMax 用 `action_executions` 历史计数强制，Policy 配置改不动已发生的事实。

### 5.4 进入 L3 的前置条件（硬性）

- Epic A 上线且该 workspace 已有 ≥ N 条（建议 10 条）POSITIVE/NEGATIVE 终态 Outcome，证明执行-结果链路可信；
- Epic B 上线，Autopilot 执行后由 Incident 体系兜底监控；
- 每个 actionType 的 L3 白名单单独评审（首批候选：`DECREASE_BID`、`ADD_NEGATIVE_KEYWORD`——可逆、低爆炸半径）。

### 5.5 验收标准

1. 配置示例 Policy（ACOS>45% 且 spend>$100 且 conversions≥5 → bid-10%）后，Simulator 中命中条件自动产生 PlannedAction 并执行（Mock Executor），全程留痕；
2. cooldown 内重复命中不重复执行；
3. L4：执行后 Outcome 判 NEGATIVE 且触发 rollback 条件 → 自动生成 ROLLBACK PlannedAction；
4. `enabled=false` 默认；VIEWER 不能改 Policy；
5. 任何 Policy 执行都能在 UI 上回答「谁授权的、依据哪条 Policy、当时指标是什么」。

---

## 6. 开发顺序与里程碑

```text
Epic A  Outcome Tracking        ← 现在就开始
Epic B  Incident & Alert Center ← A 的数据聚合代码稳定后启动（可部分并行）
Epic C  Experiment Framework    ← 需要 A 的窗口指标能力
Epic D  Operations Autopilot    ← 需要 A 的可信度 + B 的兜底监控
```

**Epic A 最值得马上开始的理由**：

- 不依赖 Shopify、不依赖真实 Amazon Write；
- Simulator 已能模拟「Action → 数据变化 → 7 天 → Outcome」全过程；
- 等 Amazon / Shopify Adapter 接上（V10 Epic 3 已有 Amazon read），上层零重设计；
- 它是 Epic B/C/D 共同的地基（窗口指标聚合、worker 定时评估、Outcome 可信度）。

每个 Epic 独立 Release Report（沿用 `V93_ACTION_LAYER_RELEASE_REPORT.md` 格式），独立 migration，独立 `_ops_deploy_*.sh`，互不阻塞回滚。

## 7. 明确不做（本 Layer 边界）

1. 不做 Amazon Write / 真实店铺写操作（仍是 Epic 6 的事）；
2. 不做真实平台流量切分 A/B（Experiment V1 只做 Simulator 实验 + 序贯实验）；
3. 不做 Worker backlog 告警（Epic B 第二批）；
4. 不做 LLM 自由执行任何店铺操作（Autopilot = Policy Engine，不是 prompt）；
5. 不改 WF-05 / Recommendation 状态机 / Simulator 种子参数；
6. 不为本 Layer 新增第二个 mock-data-service。
