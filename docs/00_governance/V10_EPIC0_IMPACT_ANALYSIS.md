# V10 Epic 0 — Repository Impact Analysis + Migration Plan

**Status:** ANALYSIS ONLY — no schema, API, or adapter code in this phase  
**Date:** 2026-09-12  
**Upstream freeze:** `docs/00_governance/V10_COMMERCE_OS_ARCHITECTURE.md`  
**Code scanned:** current `master` (Action Layer `a39a803` lineage)

```text
What changes     Store + ChannelIdentity + Adapter ports + Registry binding
What stays frozen V9.1 tag, WF-05 formulas, Recommendation SM, PlannedAction SM,
                  action_type names, Simulator engine seed, STORE_SKU360_SOURCE default
How to migrate    Additive tables first → backfill → loosen unique → swap Mock tools last
```

---

## 0. Six answers (read this first)

| # | Question | Answer |
| :--- | :--- | :--- |
| 1 | V10 **最大改动点**在哪？ | **数据所有权模型**：没有 `Store`；`CommerceAccount @@unique(workspaceId, provider)` 每个 workspace 每种 provider 只能一条。这挡住 Amazon US+EU、Shopify A+B。第二大是 **WF-05 默认读 Scenario 内存世界，不读 Simulator/Prisma Canonical**。第三是 Canonical 上已经堆了平台列（`Sku.asin`、`Campaign.campaignIdAmazon`、`Competitor.asin`）。 |
| 2 | 哪些 **V9.3 必须冻结**？ | `PlannedAction` 生命周期 `CREATED→WAITING_APPROVAL→APPROVED→EXECUTING→SUCCESS\|FAILED`；`action_type` 六个名字；Planner 白名单+schema；Risk 高低中规则；Recommendation `GENERATED→…→VERIFIED` 与 `executionDispatched`；Mock 作为默认 Executor；`Approval ≠ Execute`。 |
| 3 | **CommerceAccount 如何支持多店**？ | 先加 `Store`，账户挂 `storeId`。旧行各生成 1 个 Store 后 **删除** `@@unique([workspaceId, provider])`，改为 `@@unique([storeId])` 或 `@@unique([workspaceId, provider, externalAccountKey])`。`externalAccountKey` = Amazon `sellingPartnerId` 或 Shopify shop domain。 |
| 4 | **Simulator 如何变 Adapter**？ | Domain tick（`simulateOneDay`）已经是纯引擎，可保留。把 `SimulatorStore.persistDay` / `ensureFixtures` 收成 `SimulatorAdapter` 实现 Catalog/Order/Inventory/Ads Port。不要再让 API/WF-05 import `simulator-store` 写 Prisma。`provider` 值 `simulator-amazon` / `simulator-shopify` 映射为 `platform=simulator` + channel。 |
| 5 | **Action 如何接真平台**？ | `execute()` 今天写死 `executeMockAction(this.registry, …)`。V10 只改这一处解析：`Registry.resolve(actionType, store.platform)` → Mock \| AmazonAdsTool \| ShopifyMarketingTool。**不改** Planner、不改 status。Write 默认 `WRITE_FORBIDDEN`。 |
| 6 | **绝不能为 V10 重构的** | `v9.1.0`；WF-05 11 项门禁/公式/DAG；Recommendation 引擎与状态；Action 状态枚举与 `DECREASE_BID` 等 type 字符串；Simulator **引擎**种子/起始日/初始库存；XYDC `5147` 夹具；默认 `STORE_SKU360_SOURCE≠prisma`。 |

---

## 1. Current Architecture

```text
UI  /app/operations/today
        │
        ├─ GET /operations/today     装配 profit/ads/inventory/orders + WF-05 + recs + actions
        ├─ GET /scenario/*           Overview 用的 90d 内存世界（与 Simulator 不是同一套）
        └─ GET /simulator/state      模拟时钟 / 事件

Intelligence
        ├─ WF-05  默认 ScenarioSku360DataSource（硬编码 ASIN）
        │         可选 STORE_SKU360_SOURCE=prisma → StoreSku360DataSource
        ├─ Playbook / VOC / Fact / Evidence / Recommendation
        └─ Action Planner → Risk → Approval → Mock Executor → action_executions

Data writers
        ├─ seed + ScenarioGenerator
        ├─ SimulatorStore.persistDay  → orders/inventory/ads/reviews (source_provider=simulator)
        └─ Epic 4 AmazonProvider GET  → CommerceAccount + SyncRun（LIVE_NOT_RUN）

Provider transport
        ProviderAdapter.execute(capabilityId)   XYDC / Firecrawl / Amazon read / Mock market
```

两条经营世界并存，这是当前最大的运行时事实：

| 世界 | 谁写 | 谁读 | 用途 |
| :--- | :--- | :--- | :--- |
| **Scenario** | `ScenarioGenerator` 内存 | Overview、**默认 WF-05** | V9.1 演示诊断 |
| **Simulator** | worker tick → Prisma | `/orders` `/inventory` ads、Today 指标 | V9.2 mock 店 |
| **Amazon live** | 显式 `POST /commerce/amazon/sync` | 几乎未被 WF-05 使用 | Epic 4 只读地基 |

---

## 2. V10 Target Architecture

见冻结文档。Epic 0 只强调实施相关的目标缝：

```text
Store ── PlatformAccount ── ChannelIdentity
                │
         Canonical Product/Offer/Order/Inventory/Campaign/Profit
                │
     WF-05 / Playbook / Action  (platform-blind)
                │
     Registry.resolve(actionType, platform)
                │
     SimulatorAdapter | AmazonAdapter | ShopifyAdapter
```

---

## 3. Gap Analysis

| 能力 | 现在 | V10 需要 | Gap |
| :--- | :--- | :--- | :--- |
| Store | 无。只有 Workspace + Marketplace | Tenant/Workspace/Store/Account | **P0 新表** |
| 多账户 | `unique(workspaceId, provider)` | 同 provider 多店 | **P0 改 unique** |
| Channel ID | 散落在 `Sku.asin`、`campaignIdAmazon`、`Competitor.asin` | `ChannelIdentity` | **P0 新表 + 停止加列** |
| Adapter Port | `ProviderAdapter` 是运输层，不是 Catalog/Order/Ads Port | 资源级 Port | **P1 接口** |
| Simulator | 直写 Prisma | SimulatorAdapter | **P1 包一层，不改引擎** |
| WF-05 数据 | 默认 Scenario ASIN 世界 | Canonical | **P2 开关，不改公式** |
| Action execute | 写死 Mock | 按 platform 绑 Tool | **P3 解析层，不改 SM** |
| Shopify | Simulator channel 字符串 only | 只读 Adapter | **P2 新代码，禁提前写** |
| UI Store 选择 | Workspace + SKU + Amazon 站点文案 | 多店/平台 | **P2 UI，本阶段不开发** |

---

## 4. Database Impact

本阶段 **不改 schema / 不写 migration**。下面是影响评估。

### 4.1 Entity → Relation → Problem → V10 Impact

| Entity | 关键关系 | Problem | V10 Impact |
| :--- | :--- | :--- | :--- |
| **Workspace** | 所有业务表的隔离根 | 没有 Tenant；没有 Store 子节点 | 保持隔离根。Store 挂在它下面。 |
| **Store** | **不存在** | 无法表达「一店一面」 | Phase 1 新表。`workspaceId` + `platform` + `region/country` + `accountId` |
| **CommerceAccount** | `@@unique([workspaceId, provider])` | 见 §4.2 | 挂 `storeId`；放宽 unique |
| **Product** | workspace + marketplace | 无 platform；SKU 才是卖单元 | 接近 CanonicalProduct；不要加 ASIN |
| **Sku** | `asin?`, `amazonSellerSku?` | **平台污染** | 冻结列，新 identity 走 ChannelIdentity |
| **Order** | `sourceProvider`, `sourceAccountId`, `externalOrderId` + 部分 unique | 已有渠道雏形，但无 `storeId` | 加 `storeId` 可空 → 回填 |
| **InventoryBalance** | unique(workspace, sku, warehouseType) 默认 FBA | FBA 是仓类型不是平台；无 store | 加 `storeId` 可空；Shopify location 不进这张表的新列 |
| **Campaign** | `campaignIdAmazon?` | **平台污染** | 冻结该列；新 ID 进 ChannelIdentity |
| **Competitor** | `@@unique([workspaceId, asin])` | ASIN 当主键语义 | 竞品 identity 同样映射；**不要**为 Shopify 再加 `shopifyProductId` 列 |
| **BusinessRecommendation** | workspace；无 store | 跨店洞察会混在一起 | 可选 `storeId`，不改状态机 |
| **PlannedAction** | rec FK；无 store/adapter/tool | execute 无法选平台 | **只加可选列** `storeId`/`adapterId`/`toolId`，不改 status/`actionType` |
| **ActionExecution** | action 历史 | 无 `externalRequestId` | 可选列，不改 status 语义 |
| **SimulationState** | `@@unique([workspaceId])` | 一 workspace 一个模拟世界 | 以后可挂 `storeId`；本阶段不动引擎 |
| **ChannelDailyMetric** | unique(workspace, **channel**, sku, date) channel=`amazon\|shopify` | 已是渠道切片，但是 simulator 私有 | 可当 Adapter 输出投影，不要当 Canonical 主键 |

### 4.2 CommerceAccount 多店

当前：

```text
@@unique([workspaceId, provider])
provider 例: "amazon" | "simulator-amazon" | "simulator-shopify"
```

**能否支持 Amazon US + Amazon EU + Shopify A + Shopify B？不能。**

| 组合 | 现在 | 原因 |
| :--- | :---: | :--- |
| amazon + shopify（不同 provider） | 能 | unique 按 provider |
| amazon + simulator-amazon | 能 | provider 字符串不同（`amazon` vs `simulator-amazon`） |
| Amazon US + Amazon EU（都是 `amazon`） | **不能** | 第二条 insert 撞 unique |
| Shopify A + Shopify B | **不能** | 同上 |
| 同一 SP 多 marketplace vs 两个 selling partner | 模型分不清 | 没有 Store，只有 `region` 字段 |

**需要改什么（Phase 1，不是现在）：**

1. 新增 `stores`（id, workspaceId, name, platform, country, status）。
2. `commerce_accounts.store_id` 可空 → 回填 → NOT NULL。
3. 删除 `@@unique([workspaceId, provider])`。
4. 新 unique：`(store_id)` 一对一账户，或 `(workspace_id, provider, external_account_key)`。
5. `SyncRun` 增加 `storeId`（可空回填）。

**Migration 风险：**

- Simulator 用 `simulator-amazon` / `simulator-shopify` 两条账户；回填必须生成 **两个 Store**，不能合成一个。
- 若已有 `provider=amazon` 的 LIVE 行（即使 `LIVE_NOT_RUN`），回填为 `Store Amazon {region}`。
- 应用层 `upsert({ workspaceId_provider })` 出现在 `simulator-store.ts` — unique 一改，这些 upsert **会编译失败**，必须同 PR 改成按 `storeId` upsert。这是 CommerceAccount 迁移的真正风险，不是 SQL 本身。

**旧数据兼容：**

```text
FOR EACH commerce_account:
  INSERT store (workspaceId, platform=map(provider), name=provider, country=defaultMarketplaceCode)
  UPDATE account.store_id
DROP unique (workspaceId, provider)
```

`map(provider)`：`amazon`→amazon，`simulator-amazon`/`simulator-shopify`→simulator（channel 另存）。

---

## 5. Code Impact

### 5.1 Simulator

数据流（事实，不是设计愿望）：

```text
Worker tick / POST /simulator/tick
        ↓
simulateOneDay()          纯 domain，seed 冻结
        ↓
SimulatorStore.persistDay 直接 prisma.order/inventory/adMetric/review
        ↓
Canonical 表（source_provider='simulator'）
        ↓
Today 指标 API 读这些表
        ↓
WF-05 默认仍走 Scenario（不读上面这些表）
        ↓
Recommendation / Action   与 Simulator 无自动接线（plan-acos 读 Campaign 表，可能含 SIM-）
```

| 问题 | 答案 |
| :--- | :--- |
| 是否已符合 Adapter 思想？ | **一半。** 引擎纯、落库集中在 `SimulatorStore`，这是 Adapter 雏形。但 Store **直接依赖 Prisma 模型形状**，API/worker 直接 import 它，没有 Port。 |
| 哪些代码耦合业务？ | `ensureFixtures` upsert `CommerceAccount` 用 `workspaceId_provider`；写 `orders.marketplaceId=AMAZON_US` 即使 channel=shopify；campaign 名 `SIM-`；`SIM_REVIEWER_PREFIX`；reset 按 `source_provider='simulator'` 删除。 |
| 如何迁成 SimulatorAdapter？ | 1) 抽出 `CatalogPort/OrderPort/…`。2) `SimulatorStore` 改名实现这些 Port。3) worker 只调 Port。4) **禁止改** `simulateOneDay` / seed / 起始日。 |

### 5.2 Action Layer

```text
planFromRecommendation()     冻结（白名单推断）
assessRisk()                 冻结
PlannedAction.status         冻结
execute() → executeMockAction(registry)   ← 唯一应打开的缝
```

未来抽象（**新增，不替换状态机**）：

```text
interface ToolResolver {
  resolve(actionType, store: { platform: string }): MockToolFn | ProviderTool
}
```

`ProviderTool` 内部调 Adapter write port。缺 binding → Mock 或 `PROVIDER_UNAVAILABLE`。  
V10 允许在 `planned_actions` **追加可空** `store_id` / `adapter_id` / `tool_id`。不允许改 `action_type` 字符串、不允许把 `SUCCESS` 改成 `SUCCEEDED` 去迁就旧 `ActionRouter`。

旧 `packages/actions/ActionRouter` 仍是 RPA 旁路，**不要**为 V10 合并进 PlannedAction。

### 5.3 WF-05 依赖

```text
                    DailyDiagnosisService
                            │
              STORE_SKU360_SOURCE === 'prisma' ?
                 /                    \
        StoreSku360DataSource     ScenarioSku360DataSource (默认)
        读 Prisma Sku/Order        内存 90d + 硬编码 ASIN
        Ads = UNAVAILABLE          含广告/竞品/VOC
                 \                    /
                  Sku360ContextLoader
                            │
              11 异常门禁 + 因果诊断 + 推荐打分
                            │  公式冻结
                      AgentTask checkpoint
```

| 依赖类型 | 具体 | V10 处理 |
| :--- | :--- | :--- |
| Amazon 字段 | `Sku360Identity.asin`；Scenario 硬编码 `B0BFGNSXYL` 等；Competitor.asin；诊断文案里的 competitor ASIN | **展示/identity 投影**，公式继续用 revenue/acos/daysCover 等 Canonical 度量 |
| Simulator 字段 | 默认 **不读** Simulator。Today 的 insight 卡把 `simulation_events` 与 WF-05 结果并排 | 不要把 sim event 塞进诊断公式 |
| Canonical | Store 源可读 Order/Inventory/Profit；**Ads 明确 UNAVAILABLE** | Phase 4 前用 Canonical ads 填 Port，不改门禁阈值 |

**依赖图（目标）：**

```text
[Amazon API] [Shopify API] [Simulator engine]
        \         |          /
         Adapter layer
                |
        Canonical + ChannelIdentity
                |
           ISku360DataSource          ← 唯一允许换的实现
                |
              WF-05 (frozen formulas)
```

默认开关保持 `STORE_SKU360_SOURCE≠prisma`，直到 Canonical ads 也齐。

---

## 6. API Impact

### 保持不变（V10 不得改契约）

| API | 原因 |
| :--- | :--- |
| `GET /operations/today` | 驾驶舱装配 |
| `GET /insights` | today 切片 |
| `GET/POST /recommendations*` | Recommendation SM |
| `POST /actions/plan` `plan-acos` `/:id/approve\|execute` `GET /actions/:id/history` | Action SM |
| `POST /operations/daily-diagnosis` | WF-05 |
| `POST /voc/analyze` `GET /voc` | VOC |
| `GET /products` `/orders` `/inventory` `/profit/*` `/advertising/*` | Canonical 读写外形 |

### 已有、V10 要 **扩展语义而不是改名**

| API | 现在 | 以后 |
| :--- | :--- | :--- |
| `GET /commerce/accounts` | 按 workspace 列账户 | 加 `storeId` 过滤；旧客户端不传则回 workspace 全部 |
| `POST /commerce/amazon/sync` | 单账户显式同步 | 加 `storeId`；无 store 时保持旧行为 |
| `GET /commerce/amazon/sync-runs` | Amazon 专用路径 | 逐步 `GET /sync/jobs?storeId=`，旧路径当 alias |

### 未来新增（不要现在实现）

```text
GET/POST  /stores
GET       /platforms
POST      /sync/jobs          { storeId, capability }
GET       /commerce/identities
```

禁止用新路径替换 `/actions` 或 `/operations/today`。

---

## 7. Frontend Impact（不开发）

| 现状 | V10 是否需要 | 说明 |
| :--- | :---: | :--- |
| TopBar Workspace 切换 | 保持 | 已有 |
| SKU 切换 | 保持 | 已有 |
| 「美国站」marketplace 文案 | 以后变成 Store 名 | 现在硬编码 Amazon 站点 |
| 多店选择器 | **需要**（Phase 2+） | 无 Store 就无法切 Amazon US vs Shopify |
| 平台切换 | 可选 | 用 Store 列表即可，不必单独 Platform toggle |
| Workspace Dashboard | 可选 | Today 已是工作区驾驶舱；多店后加 store filter 即可 |
| Recommendation 卡上的 Action | 保持 | V9.3 已有；V10 只多显示 store/platform |

本阶段不写 UI。

---

## 8. Migration Plan

### Phase 0 — Repository Analysis（本文件）

只读。产出：差距、冻结面、迁移顺序。

### Phase 1 — Foundation（Unified Model）

- 新表 `stores`、`channel_identities`
- `CommerceAccount.storeId` 回填 + **改 unique**
- Order/Inventory/Campaign/PlannedAction 增加 **可空** `storeId`
- 回填脚本：每个现有 account → 一个 store；`Sku.asin` → identity 行（**不删** `Sku.asin`）
- 同步修改 `SimulatorStore.ensureFixtures` 的 upsert key（否则必炸）
- **仍然** 不接真 API、不改 WF-05 公式

### Phase 2 — Adapter Layer

- 定义 Catalog/Order/Inventory/Ads/Profit Port（代码接口）
- `SimulatorAdapter` 包现有 `SimulatorStore`
- worker / `/simulator/tick` 改走 Port
- Mock 仍是写路径默认

### Phase 3 — Real Platform Read

- Amazon Adapter：Epic 4 GET allowlist 接到 Port（仍只读）
- Shopify Adapter：只读 + webhook（新代码，不改 Agent）
- `GET /stores`、`POST /sync/jobs`
- WF-05 仍默认 Scenario，直到 Canonical ads 齐

### Phase 4 — Action Integration

- `ToolResolver.resolve(actionType, platform)`
- PlannedAction 可空 `storeId/adapterId/toolId`
- Write permission：`WRITE_FORBIDDEN` 直到人工打开
- **禁止**改 action_type / lifecycle

Phase 4 之前，生产演示继续 V9.3 Mock。

---

## 9. Risks

| 风险 | 级别 | 缓解 |
| :--- | :---: | :--- |
| 改 `workspaceId_provider` unique 导致 Simulator upsert 运行时失败 | 高 | unique 与 `ensureFixtures` **同一 PR** |
| 两条数据世界（Scenario vs Simulator）让「OS」看起来像坏了的诊断 | 高 | 文档写清；Phase 3 前不默默切 `STORE_SKU360_SOURCE=prisma` |
| 有人给 Sku/Campaign 再加 `shopifyVariantId` | 高 | ADR 禁令；PR 拒收 |
| 把 ActionRouter 与 PlannedAction 合成一个状态机 | 中 | 明确禁止 |
| Amazon Write 随 Adapter 只读一起混进 Phase 3 | 高 | Write capability 单独 RFC |
| ChannelIdentity 回填漏掉 Competitor.asin | 中 | Phase 1 清单包含竞品 |
| 一 workspace 一个 `simulation_states` | 低 | 先接受；多 sim store 以后再拆 |

---

## 10. Recommended Epic Order

```text
Epic 0   本分析                          ← 完成，停
Epic 1   Store + ChannelIdentity + Account unique + 回填
Epic 2   Commerce Ports + SimulatorAdapter
Epic 3   Amazon read Adapter（复用 Epic 4）
Epic 4   Shopify read Adapter + webhooks
Epic 5   WF-05 读 Canonical（开关，公式不动）
Epic 6   ToolResolver + 可选 Write binding（默认关）
```

禁止跳到 Epic 6 或在 Epic 1 之前改 WF-05。

---

## 11. Frozen vs Changeable checklist

**冻结（V10 任何 Epic 都不得改语义）：**

- `v9.1.0` / WF-05 DAG 与公式 / Recommendation 状态 / PlannedAction 状态 / 六个 `action_type` 名
- Simulator 引擎 seed / start date / 初始库存
- `STORE_SKU360_SOURCE` 默认非 prisma
- `Approval ≠ Execute`、VIEWER 写禁、Amazon Write 默认无
- XYDC 5147 夹具

**允许改（且必须按 Epic 顺序）：**

- 新表 Store / ChannelIdentity
- CommerceAccount unique
- Simulator **持久化**包一层 Adapter（引擎不动）
- Registry 解析函数
- 可空 `storeId` 列
- 只读 Amazon/Shopify Adapter
- UI Store 选择器

---

**Epic 0 完成。** 第一行 V10 代码只能在人工确认 Epic 1 之后。
