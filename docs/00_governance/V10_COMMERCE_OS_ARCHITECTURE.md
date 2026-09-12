# V10 Multi-platform Commerce OS Architecture

**Status:** ARCHITECTURE FROZEN — not an implementation epic  
**Date:** 2026-09-12  
**Document level:** V10 design source of truth. Does **not** override V9.1 Freeze or V9.3 Action Layer facts.  
**This phase writes no business code.** Confirm with a human before any V10 Epic.

```text
V9.3  AI Operations Automation Framework (Mock Executor)  READY
V10   Multi-platform Commerce OS                          DESIGN ONLY
```

---

## 0. Five answers (read this first)

| # | Question | Answer |
| :--- | :--- | :--- |
| 1 | V9.3 如何平滑升级？ | **不改** Planner 白名单、Risk 规则、Action 状态机、Recommendation 生命周期。只换 Registry 里的 tool 实现：`MockToolFn` → `ProviderTool` → Adapter。Mock 作为 `capabilityId=commerce.write.*` 的默认 binding 留下，直到 Amazon Write 被单独批准。 |
| 2 | Amazon 接入应该放在哪层？ | **Commerce Adapter Layer**。读路径复用已有 `AmazonProvider` + `CommerceAccount` + `SyncRun`。写路径必须再走 Action → Tool → Adapter，禁止 Agent / Playbook / WF-05 直连 SP-API。 |
| 3 | Shopify 接入是否需要改 Agent？ | **不需要改 Agent。** 新增 `ShopifyAdapter` + Store 映射。WF-05 / Playbook / Planner 继续吃 Unified Model。Agent 只认 `DECREASE_BID` 这类 action_type，不认 GraphQL Admin API。 |
| 4 | Action Framework 如何复用？ | 复用 `PlannedAction`、状态 `CREATED→…→SUCCESS`、`ActionToolRegistry`、审批与 history。V10 只增加：`toolId` / `storeId` / `adapterId` 三个可选字段，以及 Registry 按 `(actionType, platform)` 解析实现。 |
| 5 | Unified Model 如何避免平台字段污染？ | Canonical 表 **禁止** `asin` / `shopifyVariantId` / `campaignIdAmazon`。平台 ID 只进 `ChannelIdentity`（store + platform + externalType + externalId）。现有 `Sku.asin`、`Campaign.campaignIdAmazon` 视为 V9 债务，V10 Phase 1 用映射表旁路，不把新平台字段继续堆进核心表。 |

---

## 1. Overall Architecture

```text
                 UI Layer
                    |
             Intelligence Layer
                    |
          Recommendation / Action
                    |
             Tool Framework
                    |
        Commerce Adapter Layer
                    |
       Amazon / Shopify / Others
                    |
              External APIs
```

对照 **今天已经落地的代码**（不要假装这些层不存在）：

| Layer | V9.3 现状 | V10 职责 |
| :--- | :--- | :--- |
| **UI** | `/app/operations/today` 驾驶舱 | 继续只展示 Unified 指标 / Insight / Action。禁止页面拼 Amazon ASIN 或 Shopify GID。 |
| **Intelligence** | WF-05 DAG、Playbook、VOC、Fact/Evidence | 只读 Unified Model。不感知 SP-API / Shopify GraphQL。 |
| **Recommendation / Action** | `BusinessRecommendation` + `PlannedAction` | 继续「为什么 / 做什么」分离。不改状态机。 |
| **Tool Framework** | `ActionToolRegistry` + Mock Executor | Registry 解析到 Provider Tool。Mock 是一种 Provider，不是架构例外。 |
| **Commerce Adapter** | `ProviderAdapter`（capability 路由）；Epic 4 Amazon **只读**；Simulator 双渠道写 Canonical | 每平台一个 Adapter：auth、rate limit、map in/out、webhook。业务层不 import 平台 SDK。 |
| **External APIs** | LWA/SP-API GET allowlist；XYDC；Firecrawl | Amazon SP-API / Ads / Shopify Admin / Shopify Webhooks。本阶段仍不接线。 |

不变式（从 V9 带过来，V10 不得打破）：

```text
Approval ≠ Execute
UI ≠ business logic
Agent ≠ platform SDK
Canonical ≠ channel identity
WRITE_FORBIDDEN until a write-capable Adapter is explicitly enabled
STORE_SKU360_SOURCE 默认仍非 prisma（WF-05 公式冻结）
```

---

## 2. Unified Commerce Model

核心原则：**Canonical 描述商家经营对象；Channel 描述「这个对象在某平台的身份证」。**

用户示例 JSON 是 API 外形，不是表结构。落地时拆成 Canonical + ChannelIdentity，否则 ASIN / Variant ID 会再次污染核心表（`Sku.asin`、`Campaign.campaignIdAmazon` 已经是前车之鉴）。

### 2.1 Identity

```text
ChannelIdentity
  storeId
  platform            amazon | shopify | simulator
  externalType        product | variant | asin | order | campaign | listing
  externalId          平台原始 ID（字符串，原样保存）
  canonicalType       product | offer | order | inventory_node | campaign
  canonicalId
  rawPayloadRef       可选，指向原始包
```

同一 Canonical Offer 可以同时有 `asin=B0…` 和 `shopifyVariantId=gid://…` 两条 identity。分析层只 join Canonical。

### 2.2 Product / Offer

不要把 Amazon 的 ASIN 和 Shopify 的 Variant 塞进同一个 `id` 字段。

```text
CanonicalProduct
  id, workspaceId, title, category, brand, status

CanonicalOffer                // 可卖单元 = SKU
  id, productId, skuCode, price, cost, currency

ChannelIdentity               // ASIN / Amazon SKU / Shopify Product / Variant
```

API 外形（对 Agent / UI）：

```json
{
  "id": "offer_uuid",
  "platform": "amazon",
  "title": "Marble toothbrush holder",
  "sku": "MTH-WHITE-001",
  "category": "Bath",
  "price": 28.99,
  "cost": 7.40,
  "identities": [
    { "type": "asin", "id": "B0EXAMPLE" },
    { "type": "amazon_sku", "id": "MTH-WHITE-001" }
  ]
}
```

`platform` 出现在 **读模型的投影** 里，不出现在 CanonicalProduct 主键设计里。跨平台分析按 `offer.id`，不按 ASIN。

### 2.3 Order

已有 `orders.source_provider` / `source_account_id` / `external_order_id`（Epic 4 部分 unique）。V10 把它升成 Store 级：

```json
{
  "id": "order_uuid",
  "store_id": "store_uuid",
  "platform": "shopify",
  "external_order_id": "gid://shopify/Order/123",
  "customer_ref": "cust_hash",
  "items": [{ "offer_id": "…", "quantity": 1, "unit_price": 28.99 }],
  "amount": 28.99,
  "currency": "USD",
  "status": "SHIPPED",
  "created_at": "2026-09-10T00:00:00Z"
}
```

Canonical `status` 用内部枚举（`PENDING|UNSHIPPED|SHIPPED|CANCELLED|REFUNDED`）。Amazon `Shipped` / Shopify `fulfilled` 只在 Adapter 里翻译。

### 2.4 Inventory

```json
{
  "offer_id": "offer_uuid",
  "store_id": "store_uuid",
  "available": 234,
  "reserved": 12,
  "inbound": 40,
  "days_of_stock": 18
}
```

FBA vs 自有仓是 `warehouse_type`（已有 `inventory_balances.warehouseType`），不是平台字段。Shopify location ID 进 ChannelIdentity。

### 2.5 Campaign

```json
{
  "id": "campaign_uuid",
  "store_id": "store_uuid",
  "platform": "amazon",
  "name": "SP - Marble - Exact",
  "spend": 120.4,
  "impressions": 8800,
  "clicks": 310,
  "conversions": 14,
  "acos": 0.45,
  "roas": 2.2
}
```

Amazon `campaignId` / Shopify 广告账号 ID 只在 ChannelIdentity。`Campaign.campaignIdAmazon` 停止扩展。

### 2.6 Profit

利润 **永远是算出来的 Canonical 账**，不是平台报表原样入库。

```json
{
  "offer_id": "offer_uuid",
  "store_id": "store_uuid",
  "period": "2026-09-10",
  "revenue": 980.00,
  "cogs": 240.00,
  "advertising_cost": 160.00,
  "fees": 85.00,
  "profit": 495.00,
  "margin": 0.505
}
```

Amazon Fee / Shopify 手续费进 `fees` 分类，不把 `fbaFee` 做成 Canonical 必填列。已有 `ProfitDaily` + `ProfitCalculationService` 继续当公式源；V10 只要求按 `store_id` 切片。

### 2.7 污染禁令

| 允许在 Canonical | 只允许在 ChannelIdentity / raw payload |
| :--- | :--- |
| title, skuCode, price, cost, qty, spend | ASIN, seller SKU, parent ASIN |
| available / reserved / inbound | FBA fulfillment center ID, Shopify location GID |
| order status 内部枚举 | Amazon order status, Shopify financial/fulfillment status |
| campaign spend/clicks | Amazon campaignId, ACOS 平台原始字段名 |

---

## 3. Platform Adapter Design

业务层 **不** `import` SP-API 或 Shopify SDK。只依赖 Adapter 接口。

已有 `ProviderAdapter.execute(capabilityId, binding, input, context)` 继续做运输层。V10 在其上加 **Commerce Port**（按资源，而不是按平台）：

```typescript
interface CatalogPort {
  listProducts(ctx: CommerceContext): Promise<CanonicalProduct[]>;
  getProduct(ctx: CommerceContext, offerId: string): Promise<CanonicalProduct>;
  // write ports exist but default binding is WRITE_FORBIDDEN
  updateProduct?(ctx: CommerceContext, patch: CanonicalProductPatch): Promise<void>;
}

interface OrderPort {
  listOrders(ctx: CommerceContext, query: OrderQuery): Promise<CanonicalOrder[]>;
}

interface InventoryPort {
  getInventory(ctx: CommerceContext, offerId: string): Promise<CanonicalInventory>;
}

interface AdsPort {
  getCampaigns(ctx: CommerceContext): Promise<CanonicalCampaign[]>;
  decreaseBid?(ctx: CommerceContext, target: BidTarget, pct: number): Promise<AdapterWriteResult>;
}

interface ProfitPort {
  getDailyProfit(ctx: CommerceContext, query: ProfitQuery): Promise<CanonicalProfit[]>;
}
```

`CommerceContext` 必带：`workspaceId`, `storeId`, `traceId`。**不带** marketplace 字符串当平台开关。

### 3.1 Amazon Adapter

负责：

- LWA / refresh token（已有 AES-GCM `ProviderCredential`）
- SP-API GET allowlist（Epic 4 已有）与 **未来** Ads / 写接口的独立 capability
- 429 / quota → `PROVIDER_RATE_LIMIT`，retryable
- SP-API 字段 → Canonical + ChannelIdentity
- `WRITE_FORBIDDEN` 直到 V10 Phase 5 显式打开写 binding

不负责：诊断公式、Action 审批、UI。

### 3.2 Shopify Adapter

负责：

- Admin API token / app installation
- REST/GraphQL 映射到同一套 Port
- Webhook 验签、幂等（`X-Shopify-Webhook-Id` → SyncRun cursor）
- GID → ChannelIdentity

不负责：改 WF-05、改 Agent prompt、改 Planner 白名单。

### 3.3 Simulator Adapter

V9 Simulator 已经按 `source_provider=simulator` 写 Canonical。V10 把它登记为第三个 Adapter：`platform=simulator`。开发与演示默认走它，避免「没真店就不能跑 OS」。

---

## 4. Data Flow Design

```text
Platform API / Webhook / Simulator tick
        ↓
   Adapter (auth, rate limit, raw fetch)
        ↓
   Normalize (channel → Canonical + ChannelIdentity)
        ↓
   Unified Model (Postgres SoT)
        ↓
   Analytics (profit, ACOS, inventory days)
        ↓
   Intelligence (WF-05 / Playbook)     // 只读 Canonical
        ↓
   Recommendation → PlannedAction
        ↓
   Tool → Adapter write port           // 默认 Mock / WRITE_FORBIDDEN
```

### 同步方式

| Mode | 用途 | 现状 | V10 |
| :--- | :--- | :--- | :--- |
| **Batch** | 首次全量、对账 | `POST /commerce/amazon/sync` 显式触发 | 按 Store + capability 跑 SyncRun |
| **Incremental** | 日常订单/库存 | Epic 4 有 cursor 字段 | Adapter 维护 cursor；禁止无游标死循环 |
| **Webhook** | Shopify 订单/库存；Amazon 通知（若启用） | 无 | Shopify 优先 webhook；Amazon 仍以 pull 为主 |
| **Simulator tick** | 无真店时的数字孪生 | worker 60min / 1 sim day | 登记为 Simulator Adapter 的 incremental |

冲突：同一 `ChannelIdentity` 后写覆盖，SyncRun 记 `recordsFailed`。Canonical 更新必须带 `sourceUpdatedAt`。

---

## 5. Agent Boundary Design

Agent（WF-05、Playbook runner、未来其它 runner）**可以**：

- 读 Unified Model / Fact / Evidence
- 产出 Recommendation
- 调用 Planner 得到 `action_type` + `target` + `parameters`
- 读 Action 状态与 history

Agent **不可以**：

- `fetch` Amazon / Shopify
- 选择 HTTP 路径、签名、marketplaceId 作为「平台 if 分支」
- 跳过 Risk / Approval 直接 execute
- 把 ASIN 写进 Action.parameters 当唯一 target（必须是 Canonical offerId / campaignId，identity 由 Adapter 解析）

正确调用链：

```text
Agent → Action (PlannedAction) → Tool (Registry) → Adapter → Platform
```

---

## 6. Tool Framework Evolution

V9.3 今天：

```text
Action  →  ActionToolRegistry.get(DECREASE_BID)  →  MockToolFn
```

V10：

```text
DecreaseBidAction
        │  action_type = DECREASE_BID
        │  target.campaignId = canonical campaign uuid
        ▼
Tool Registry.resolve(actionType, store.platform)
        │
        ├─ simulator → MockAdsTool          (默认)
        ├─ amazon    → AmazonAdsTool        (Phase 5 才启用)
        └─ shopify   → ShopifyMarketingTool (Phase 5)
                │
                ▼
         AdsPort.decreaseBid()
                │
                ▼
         Amazon Ads Adapter / Shopify Adapter
```

复用规则：

- `action_type` 白名单 **不按平台分叉**（仍然是 `DECREASE_BID`，不是 `AMAZON_DECREASE_BID`）。
- Registry 用 `store.platform` 选实现。缺 binding → 保持 Mock 或 `PROVIDER_UNAVAILABLE`，而不是改 Planner。
- History 多记 `adapterId` + `externalRequestId`（可选），不改 status 枚举。

---

## 7. Permission Model

沿用现有 `WorkspaceRole`：`OWNER | ADMIN | OPERATOR | VIEWER`。V10 把「能点 UI」和「能碰到 Adapter 写」拆开。

| Role | View dashboard / insight | Create / plan Action | Approve | Execute (even Mock) |
| :--- | :---: | :---: | :---: | :---: |
| OWNER / ADMIN | yes | yes | yes | yes |
| OPERATOR | yes | yes | no | no |
| VIEWER | yes | no | no | no |

执行门闩（顺序固定，缺一不可）：

```text
Permission Check     ViewerWriteGuard + role
        ↓
Approval Check       PlannedAction.status === APPROVED
        ↓
Adapter binding      write capability enabled?
        ↓
Execution            Tool → Adapter
        ↓
History              action_executions
```

高风险（`DELETE_LISTING` / `STOP_CAMPAIGN` / `CHANGE_PRICE>20%`）V9.3 已 `needApproval=true`。V10 真写时再加：**即使 APPROVED，Adapter 也可 `WRITE_FORBIDDEN`。** 审批通过 ≠ 平台允许。

---

## 8. Multi-tenant Design

```text
Tenant (Company A)
  └── Workspace 1
        ├── Store US-Amazon
        │     └── PlatformAccount (amazon, sellingPartnerId, LWA)
        └── Store US-Shopify
              └── PlatformAccount (shopify, shop domain, token)
```

| 概念 | 含义 | 现状缺口 |
| :--- | :--- | :--- |
| Tenant | 账单 / 公司 | 无独立表；可用未来 `tenantId` 挂在 Workspace |
| Workspace | 权限与隔离边界 | 已有，且所有业务表已 `workspaceId` |
| Store | 一个可经营的店面（渠道+国家） | **缺失**。现在用 `marketplaceId` + 单个 `CommerceAccount` |
| Platform Account | 该店的平台凭据 | `CommerceAccount` 已有，但 `@@unique([workspaceId, provider])` **每个 workspace 只能一个 amazon、一个 shopify** — 不够 SaaS |

V10 Phase 1 必须把 unique 改成 `(workspaceId, provider, sellingPartnerId|shopDomain)` 或挂到 `storeId`。这是架构决策，不是本阶段迁移。

Simulator 占一个 Store：`platform=simulator`，与真店并存，禁止再造第二套 mock-data-service。

---

## 9. V10 Roadmap

确认本文件后再开 Epic。顺序不得跳。

| Phase | 做什么 | 明确不做 |
| :--- | :--- | :--- |
| **1 Unified Commerce Model** | ChannelIdentity；Store；放宽 CommerceAccount unique；读模型投影 | 不接真 API；不改 WF-05 公式 |
| **2 Amazon Adapter** | 把 Epic 4 只读 SP-API 收到 Catalog/Order/Inventory Port；Batch+Incremental | 不写 Amazon；不改 Action 状态机 |
| **3 Shopify Adapter** | 只读 Admin + Webhook → 同一 Port | 不改 Agent；不做 Shopify 写 |
| **4 Multi-platform Intelligence** | WF-05 / Playbook 默认读 Canonical（仍可 `STORE_SKU360_SOURCE` 开关） | 不改诊断公式系数 |
| **5 Cross-platform Action** | Registry 按 platform 绑 AmazonAdsTool / ShopifyMarketingTool；默认仍 Mock | 不自动打开 Write；每次写 capability 单独批准 |

Phase 5 之前，V9.3 Mock Executor 保持为生产演示路径。

---

## 10. Architecture Decision Records

### ADR-V10-01 Adapter Pattern

**决策：** 平台差异只存在于 Adapter。  
**原因：** Agent 一旦出现 `if (platform === 'amazon')`，Shopify 接入就要改诊断和 Planner。  
**后果：** 新平台 = 新 Adapter + ChannelIdentity，不改 WF-05。

### ADR-V10-02 Unified Model + ChannelIdentity

**决策：** Canonical 无平台字段；外部 ID 进映射表。  
**原因：** 跨店分析、同一 SKU 双渠道、避免 `asin`/`variantId` 列爆炸。  
**后果：** Phase 1 有一次映射工作；禁止继续在 `Sku` / `Campaign` 上加平台列。

### ADR-V10-03 Action 不直接调平台 API

**决策：** Execute 只通过 Registry → Tool → Adapter。  
**原因：** 权限、审批、审计、重试、Mock/Real 切换都在这一层完成。  
**后果：** Playbook / Agent 不得持有 SP-API client。

### ADR-V10-04 Mock 是一等 Provider

**决策：** Simulator Adapter + Mock Tool 留在 Registry 默认 binding。  
**原因：** 无真店时 OS 仍可演示；真写是开关不是重构。  
**后果：** 禁止再做第三套 mock-data-service。

### ADR-V10-05 写路径默认关闭

**决策：** Amazon/Shopify write ports 默认 `WRITE_FORBIDDEN`。  
**原因：** V9.3 验收建立在 Mock 上；真写是安全事件级变更。  
**后果：** 打开写必须单独 RFC + 人工下令，不随 Phase 2/3 只读接入附带上线。

---

## 11. 边界 / 非目标

本文件 **冻结架构，不授权开发。** 在人工确认 V10 Epic 之前：

- 不接真实 Amazon / Shopify API
- 不开发新 Agent、新 action_type
- 不修改 V9.3 Action Framework 代码
- 不重构 WF-05、不改 Recommendation 状态机
- 不把 `STORE_SKU360_SOURCE` 默认为 `prisma`
- 不进入「V10 写代码」除非用户明确下令

---

## 12. 升级缝（给实施时用，不是现在改）

| 现有资产 | V10 用法 |
| :--- | :--- |
| `ProviderAdapter` + capability binding | Adapter 运输层 |
| `AmazonProvider` GET allowlist | Amazon Adapter 只读内核 |
| `CommerceAccount` / `ProviderCredential` / `SyncRun` | Platform Account；unique 要放宽 |
| `orders.source_provider` 等 | Channel 字段雏形，升到 Store |
| Simulator `source_provider=simulator` | Simulator Adapter |
| `ActionToolRegistry` + Mock | 默认 Tool；Phase 5 换真 Tool |
| `PlannedAction` 状态机 | 原样复用 |
| WorkspaceRole VIEWER 写禁 | 继续作为 Permission Check 第一闸 |
