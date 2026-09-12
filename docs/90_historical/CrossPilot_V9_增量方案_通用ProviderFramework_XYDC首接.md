# CrossPilot V9 增量实施方案
## 通用 Integration Provider Framework + XYDC 首个真实 Provider

> **文档性质：短期实施文档**
>
> 本文档用于指导现有 CrossPilot 代码进行本轮增量改造。
> 改造完成并通过验收后，长期架构定义以更新后的《CrossPilot V9 FINAL》唯一总方案为准；本增量文档可归档。
>
> **本轮不是“接一个西柚 MCP”这么简单。**
>
> 正式目标是：
>
> **建立一个通用 Integration Provider Framework，使 CrossPilot 的稳定内部 Tool / Capability 可以由 MCP、HTTP API、Native Adapter、RPA 等不同 Provider 实现；XYDC（西柚洞察）只是第一个真实 Provider。**

---

# 1. 为什么这次要先改架构再接 Token

当前最容易出现的错误实现：

```text
Product Research
      ↓
XydcMcpService
      ↓
XYDC MCP
```

这种方式可以很快跑通，但会把业务和供应商绑定。

后面再接：

```text
SellerSprite MCP
Sif MCP
YouTube API
ERP MCP
Feishu MCP
Image Provider
...
```

就会不断出现新的：

```text
SellerSpriteService
SifService
YouTubeService
...
```

并且 Workflow / Agent 开始认识不同供应商字段。

这不是 CrossPilot V9 要的结构。

正确目标：

```text
Agent / Workflow / Tool Center
             ↓
        Tool Platform
             ↓
        Tool Executor
             ↓
    Integration Gateway
             ↓
       Provider Router
             ↓
 ┌───────────┼───────────┬───────────┐
 ↓           ↓           ↓           ↓
MCP        HTTP/API     Native       RPA
 ↓           ↓           ↓           ↓
XYDC     YouTube      Internal     Browser/RPA
Seller   Keepa        Services
Sprite
Sif
...
             ↓
      Provider Adapter
             ↓
     Normalized Result
             ↓
     Domain / Evidence
```

---

# 2. 核心原则

## 2.1 业务层永远不认识供应商

Product Research 只允许认识：

```text
market.product.search
market.product.detail
market.market.overview
market.keyword.search
market.keyword.trend
market.product.trend
external.voc.search
```

不允许认识：

```text
xydc.xxx
sellerSprite.xxx
sif.xxx
```

供应商名称只能存在于：

```text
Integration / Provider / Adapter / Trace / Admin Config
```

---

## 2.2 CrossPilot Tool ID 就是稳定 Capability ID

不要额外创造一套与 Tool Platform 平行的业务能力系统。

例如：

```text
CrossPilot Tool:
market.product.search
```

它就是稳定 Capability。

底层 Binding：

```text
market.product.search
        ↓
Provider = XYDC
Transport = MCP
Remote Tool = <XYDC MCP remote tool name>
```

以后可切换：

```text
market.product.search
        ↓
Provider = SELLER_SPRITE
Transport = MCP
```

上层 Tool、Workflow、Agent 不变。

---

## 2.3 MCP 是 Transport，不是 Business Module

错误：

```text
Product Research = XYDC MCP
```

正确：

```text
Product Research
→ CrossPilot Tool
→ Provider Router
→ MCP Executor
→ XYDC MCP
```

同一个 MCP Provider 可以服务多个业务模块。

同一个业务模块也可以组合多个 Provider。

---

## 2.4 Read Tool 与 Action Tool 继续分开

Provider Framework 既能承载 Read，也能承载 Action。

但：

```text
Read Tool
→ Permission
→ Provider

Action Tool
→ Permission
→ Risk Check
→ Idempotency
→ Human Approval（必要时）
→ Provider
→ Verify
```

MCP 不能绕过现有 Action Layer / Human Approval。

---

## 2.5 不删除 Mock

保留：

```text
MOCK
XYDC
FUTURE_PROVIDER
```

原因：

- 第三方服务不可用时 Demo 可运行；
- 本地测试不依赖外网；
- E2E 不消耗真实额度；
- 可验证 Provider 切换；
- 可实现 degraded mode。

---

# 3. 新增架构组件

建议增量增加：

```text
packages/
├── tool-platform/
│   └── existing...
│
├── integrations/
│   ├── provider-framework/
│   │   ├── core/
│   │   │   ├── integration-gateway.ts
│   │   │   ├── provider-router.ts
│   │   │   ├── provider-registry.ts
│   │   │   ├── capability-binding.registry.ts
│   │   │   └── provider.types.ts
│   │   │
│   │   ├── transports/
│   │   │   ├── mcp/
│   │   │   │   ├── mcp-client.ts
│   │   │   │   ├── mcp-connection-manager.ts
│   │   │   │   ├── mcp-executor.ts
│   │   │   │   ├── mcp-discovery.ts
│   │   │   │   └── mcp.types.ts
│   │   │   ├── http/
│   │   │   ├── native/
│   │   │   └── rpa/
│   │   │
│   │   ├── providers/
│   │   │   ├── xydc/
│   │   │   │   ├── xydc.provider.ts
│   │   │   │   ├── xydc.mapper.ts
│   │   │   │   ├── xydc.types.ts
│   │   │   │   └── xydc.config.ts
│   │   │   └── mock/
│   │   │
│   │   └── normalization/
│   │       ├── market-product.mapper.ts
│   │       ├── market-metric.mapper.ts
│   │       ├── keyword.mapper.ts
│   │       └── evidence.mapper.ts
│   │
│   └── existing...
│
└── shared/
    └── research-contracts/
```

> 如果现有项目目录已经存在类似抽象，优先复用，不为匹配本文强制移动代码。

---

# 4. Provider Contract

建议：

```ts
type ProviderTransport =
  | "MCP"
  | "HTTP"
  | "NATIVE"
  | "RPA"

type ProviderCategory =
  | "MARKET_DATA"
  | "EXTERNAL_VOC"
  | "CREATIVE"
  | "ERP"
  | "CUSTOMER_SERVICE"
  | "PRODUCTIVITY"
  | "OTHER"

type IntegrationProviderDefinition = {
  id: string
  name: string
  category: ProviderCategory
  transport: ProviderTransport

  enabled: boolean
  priority: number

  timeoutMs: number
  retryPolicy?: {
    maxAttempts: number
    backoffMs?: number
  }

  authRef?: string

  metadata?: Record<string, unknown>
}
```

Provider Definition 不保存明文 Token。

---

# 5. Capability Binding

稳定 Tool ID 与 Provider Remote Tool 的映射：

```ts
type CapabilityBinding = {
  capabilityId: string

  providerId: string
  transport: ProviderTransport

  remoteToolName?: string
  remoteOperation?: string

  enabled: boolean
  priority: number

  inputMapper?: string
  outputMapper?: string

  metadata?: Record<string, unknown>
}
```

例如：

```text
capabilityId:
market.product.search

providerId:
xydc

transport:
MCP

remoteToolName:
<通过 XYDC MCP tools/list 实际发现，不在方案里猜名字>

priority:
100
```

重要：

> Remote Tool Name 必须以 MCP Discovery 的真实结果为准，不在代码中凭文档猜测。

---

# 6. Provider Router

路由职责：

```text
Internal Capability
        ↓
Find enabled bindings
        ↓
Filter by workspace / permission / marketplace / health
        ↓
Sort by priority
        ↓
Select primary provider
        ↓
Execute
        ↓
Failure?
  ├── retryable → bounded retry
  └── provider unavailable → fallback provider / mock / degraded
```

第一版不需要复杂的 AI Router。

使用确定性配置即可：

```text
Primary: XYDC
Fallback: MOCK
```

未来：

```text
Primary: XYDC
Fallback: SellerSprite
```

---

# 7. MCP Runtime

MCP Runtime 只负责协议和执行治理。

职责：

```text
Connection
Authentication
tools/list Discovery
Tool Schema Capture
Tool Call
Timeout
Bounded Retry
Health Check
Error Normalize
Trace
Usage / Cost Metadata
```

不负责：

```text
市场机会判断
产品评分
VOC 总结
Listing 生成
业务规则
```

这些仍属于 Tool / Domain / Workflow / Agent。

---

# 8. MCP Connection Manager

建议统一管理连接：

```ts
interface McpConnectionManager {
  getConnection(providerId: string): Promise<McpConnection>
  refreshConnection(providerId: string): Promise<void>
  closeConnection(providerId: string): Promise<void>
  health(providerId: string): Promise<ProviderHealth>
}
```

避免每次 Tool Call 都重新创建 MCP Client。

同时要处理：

```text
Token invalid
Connection timeout
Remote schema changed
Provider unavailable
Rate limit
Remote tool missing
```

---

# 9. Secret 管理

第一版：

```text
XYDC_MCP_TOKEN=...
XYDC_MCP_ENDPOINT=...
```

但业务代码不能直接：

```ts
process.env.XYDC_MCP_TOKEN
```

建议统一：

```text
SecretProvider
      ↓
ProviderConfigService
      ↓
McpConnectionManager
```

未来可以无侵入替换：

```text
Environment
→ Vault
→ Cloud Secret Manager
```

前端永远拿不到 Token。

日志、Trace、Error 不允许打印完整 Secret。

---

# 10. 标准化数据模型

## 10.1 MarketProduct

```ts
type MarketProduct = {
  source: string
  marketplace: string

  externalId: string
  asin?: string

  title: string
  brand?: string
  category?: string

  price?: number
  monthlySales?: number
  monthlyRevenue?: number

  rating?: number
  reviewCount?: number
  bsr?: number

  sourceUrl?: string

  capturedAt: string
}
```

## 10.2 MarketMetric

```ts
type MarketMetric = {
  source: string
  marketplace: string

  metric:
    | "AVG_PRICE"
    | "COMPETITOR_COUNT"
    | "SEARCH_VOLUME"
    | "SALES"
    | "REVENUE"
    | "BSR"
    | "OTHER"

  value: number
  unit?: string
  capturedAt: string
}
```

## 10.3 KeywordMetric

```ts
type KeywordMetric = {
  source: string
  marketplace: string

  keyword: string

  searchVolume?: number
  competition?: number
  relevance?: number

  capturedAt: string
}
```

## 10.4 MarketTrend

```ts
type MarketTrend = {
  source: string
  marketplace: string

  subjectId?: string

  metric:
    | "PRICE"
    | "SALES"
    | "REVENUE"
    | "BSR"
    | "SEARCH_INTEREST"

  points: {
    date: string
    value: number
  }[]
}
```

---

# 11. Provider Mapper 边界

XYDC 原始字段只能存在于：

```text
xydc.types.ts
xydc.provider.ts
xydc.mapper.ts
Raw Snapshot / Debug Trace（脱敏）
```

禁止：

```text
XYDC-specific DTO
→ Domain Service
→ Workflow
→ Agent Prompt
```

必须：

```text
XYDC MCP Response
      ↓
XydcMapper
      ↓
CrossPilot Normalized Model
      ↓
Tool Result
      ↓
Workflow / Evidence / Agent
```

---

# 12. Evidence / Data Lineage

真实外部数据要能证明“来自哪里”。

统一 Evidence：

```ts
type ResearchEvidence = {
  evidenceId: string

  source: string
  providerId: string

  type:
    | "MARKET_PRODUCT"
    | "MARKET_METRIC"
    | "KEYWORD"
    | "TREND"
    | "VOC"
    | "OTHER"

  sourceId?: string
  title?: string
  content: string

  capturedAt: string

  metadata?: Record<string, unknown>
}
```

AI 输出的重要结论必须尽量：

```text
Insight
→ evidenceIds[]
```

例如：

```text
“该关键词下中高价位产品竞争集中”
→ evidenceIds: [...]
```

---

# 13. 数据落库与 Snapshot

不要求把 Provider 全量原始数据建成一套新业务数据库。

原则：

```text
业务长期事实 / Research Snapshot
→ PostgreSQL

短期缓存
→ Redis

调试 Raw Payload
→ JSONB / Object Storage（按需）
```

优先复用现有：

```text
market_research_projects
market_metrics_snapshot
competitors
competitor_snapshots
analysis_findings
tool_executions
```

如现有 Schema 无法记录 Provider 执行来源，最小增量增加：

```text
integration_provider
provider_id
source_run_id
captured_at
raw_source_ref
```

不要为 XYDC 重复建立：

```text
xydc_products
xydc_keywords
xydc_market_data
```

---

# 14. 执行记录

优先复用现有 `tool_executions`。

至少补齐 Metadata：

```text
providerId
transport
remoteToolName
capabilityId
providerTraceId
durationMs
retryCount
fallbackUsed
status
errorCode
cost / credits（如可获得）
```

只有现有 `tool_executions` 无法表达 Provider 配置时，才考虑增加：

```text
integration_providers
integration_capability_bindings
```

第一版不建议再造一张 `mcp_tool_runs` 与 `tool_executions` 重复。

---

# 15. Tool Platform 接入

对上层仍注册稳定 CrossPilot Tool：

```text
market.product.search
market.product.detail
market.market.overview
market.keyword.search
market.keyword.trend
market.product.trend
```

Tool Executor 内部：

```text
Tool Request
↓
Schema Validate
↓
Permission
↓
Integration Gateway
↓
Provider Router
↓
Transport Executor
↓
Provider Adapter
↓
Normalize
↓
Evidence / Trace
↓
Tool Result
```

Agent、Workflow、Tool Center 不直接使用 XYDC Remote Tool Name。

---

# 16. Product Research Workflow 改造

现有业务概念继续复用。

建议：

```text
START
 ↓
validate_input
 ↓
resolve_research_sources
 ↓
market.product.search
 ↓
market.market.overview
 ↓
market.keyword.search
 ↓
market.product.trend（如果 Provider 支持）
 ↓
normalize / persist snapshot
 ↓
build_research_evidence
 ↓
calculate_market_signals
 ↓
generate_product_opportunity
 ↓
persist_result
 ↓
END
```

不允许：

```text
Workflow
→ call_xydc_xxx
```

必须：

```text
Workflow
→ market.product.search
→ Provider Router
```

---

# 17. XYDC 第一阶段接入范围

本轮目标不是把西柚所有 MCP Tool 接完。

只选择 3～5 个能够证明真实 Product Research 的能力。

建议按实际 MCP Discovery 结果映射到：

```text
market.product.search
market.product.detail
market.market.overview
market.keyword.search
market.product.trend / market.keyword.trend
```

具体 Remote Tool Name：

> **必须通过 XYDC MCP 的 tools/list / discovery 结果确定。**

不要在架构层硬编码猜测。

---

# 18. XYDC Provider

结构：

```text
providers/xydc/
├── xydc.provider.ts
├── xydc.mapper.ts
├── xydc.types.ts
└── xydc.config.ts
```

职责：

### xydc.provider.ts

```text
选择 remote tool
构造 remote input
调用 MCP Runtime
返回 raw result
```

### xydc.mapper.ts

```text
raw result
→ CrossPilot MarketProduct / MarketMetric / KeywordMetric / Trend
```

### xydc.types.ts

只存第三方原始 DTO。

### xydc.config.ts

```text
providerId
endpoint ref
auth ref
timeout
capability bindings
```

---

# 19. Fallback / Degraded Mode

第一阶段：

```text
Primary = XYDC
Fallback = MOCK
```

如果：

```text
XYDC timeout
XYDC rate limit
XYDC MCP unavailable
token invalid
remote tool missing
```

行为：

```text
Retry（有界）
↓
Fallback / Last Successful Snapshot
↓
标记 DEGRADED
↓
前端显示真实来源状态
```

禁止静默把 Mock 当成真实 XYDC 数据。

前端必须能区分：

```text
LIVE
CACHED
MOCK
DEGRADED
```

---

# 20. Data Source UI

在 Product Research / System Data Source 页面显示：

```text
西柚洞察
状态：Connected
Transport：MCP
Capabilities：5
Last Health Check：...
Last Successful Run：...
```

Research Result 显示：

```text
Source: XYDC
Mode: LIVE
Captured At: ...
```

如果 fallback：

```text
Source: MOCK / LAST_SNAPSHOT
Mode: DEGRADED
```

这样 Demo 时可以直接证明不是 Seed Data。

---

# 21. Provider Admin 第一版不要做太重

第一版不需要完整“第三方集成市场”。

只需要：

```text
Config
Health
Enable / Disable
Capability Bindings
Trace
```

后续再考虑：

```text
Provider 管理 UI
OAuth
用户自助连接
动态优先级
成本路由
多 Workspace Provider Config
```

---

# 22. 未来接其他 MCP 的标准流程

以后新增一个 Provider：

```text
1. 注册 ProviderDefinition
2. 配置 Secret / Auth
3. MCP Discovery
4. 声明 Capability Binding
5. 编写 Input / Output Mapper
6. 加 Contract Test
7. 开启 Provider
```

不应该修改：

```text
Product Research Workflow
Agent Prompt
Tool Center 页面业务逻辑
Domain Model
```

除非新 Provider 带来真正的新业务 Capability。

---

# 23. 未来不同 Provider 的示例

```text
market.product.search
├── XYDC / MCP
├── SellerSprite / MCP
└── Keepa / HTTP

market.keyword.search
├── XYDC / MCP
├── SellerSprite / MCP
└── Sif / MCP

external.voc.search
├── YouTube / HTTP
└── Reddit / HTTP/MCP（未来）

creative.image.generate
├── ImageProviderA / HTTP
└── ImageProviderB / MCP（未来）

erp.inventory.query
├── ERP-A / MCP
└── ERP-B / HTTP
```

这说明：

> Provider Framework 是全平台能力，不属于 Product Research 私有。

---

# 24. 数据安全

必须：

```text
Token 不进入前端
Token 不写日志
Token 不写 Trace
Token 不提交 Git
Provider 调用带 workspace / user trace context
敏感 Provider Response 按需脱敏
```

MCP Remote Tool Schema 也必须视为外部输入：

```text
Validate
Normalize
Never Trust Blindly
```

---

# 25. Reliability

每次 Provider Call：

```text
Timeout
Bounded Retry
Circuit / Health（可轻量）
Error Normalize
Fallback
Trace
```

统一错误建议：

```text
PROVIDER_AUTH_ERROR
PROVIDER_TIMEOUT
PROVIDER_RATE_LIMIT
PROVIDER_UNAVAILABLE
PROVIDER_TOOL_NOT_FOUND
PROVIDER_SCHEMA_MISMATCH
PROVIDER_INVALID_RESPONSE
PROVIDER_MAPPING_ERROR
```

映射到现有 Tool Error Contract。

---

# 26. 测试

## Unit

```text
Provider Router
Capability Binding
Xydc Mapper
Error Mapping
Secret Redaction
```

## Contract

```text
MCP Discovery
Remote Tool Schema
Remote Result → Normalized DTO
```

## Integration

```text
CrossPilot Tool
→ Integration Gateway
→ XYDC MCP
→ Normalized Result
```

## E2E

```text
Product Research
→ real XYDC source
→ Evidence
→ Product Opportunity
```

## Regression

```text
Mock mode still works
Existing Tool Platform unchanged
Existing Workflow unaffected
```

---

# 27. 第一阶段 Definition of Done

必须满足：

```text
[ ] 存在通用 Provider Contract
[ ] MCP Runtime 不包含业务逻辑
[ ] XYDC 是 Provider，不是 Business Module
[ ] Agent / Workflow 不直接调用 XYDC remote tool
[ ] 稳定 Tool ID 与 Remote Tool 解耦
[ ] XYDC raw DTO 不泄漏到 Domain
[ ] 至少 3 个真实 XYDC Capability 跑通
[ ] Product Research 能使用真实 XYDC 数据
[ ] 结果能展示 source / capturedAt
[ ] Tool Trace 能看到 providerId / transport
[ ] Token 不进入前端 / Log / Trace
[ ] Mock 保留
[ ] XYDC 不可用时有明确 degraded mode
[ ] Unit / Integration / E2E / Regression 通过
```

---

# 28. 明确非目标

本轮不做：

```text
全量接入 XYDC 所有 MCP Tool
一次性接 SellerSprite / Sif / Keepa
复杂 Provider Marketplace
复杂成本最优路由
自动 AI 选择 Provider
全面多租户第三方 OAuth
重构现有 Tool Platform
重写 Product Research
```

先建立正确插槽并让一个真实 Provider 跑通。

---

# 29. 实施阶段

## Phase A：Mapping

先扫描：

```text
Tool Platform
Tool Registry
Tool Executor
packages/integrations
Product Research Workflow
MarketDataProvider / Mock
tool_executions
Trace
Secret Config
```

输出：

```text
MCP_PROVIDER_MAPPING.md
```

必须回答：

```text
哪些已有能力可以复用
哪些目录不需要动
当前 Tool ID
当前 Mock 数据入口
当前 Product Research 数据入口
当前 Trace
当前 Secret 读取方式
最小侵入式接入点
```

## Phase B：Provider Framework Skeleton

只建立：

```text
ProviderDefinition
CapabilityBinding
ProviderRegistry
ProviderRouter
IntegrationGateway
MCP Runtime Interface
```

先用 Mock Provider 验证。

## Phase C：XYDC Discovery

使用已经提供的：

```text
XYDC MCP Endpoint
XYDC MCP Token
```

执行：

```text
Connection
tools/list
Schema inspect
Health
```

形成：

```text
XYDC_CAPABILITY_MAPPING.md
```

## Phase D：3～5 个真实能力

映射到稳定 CrossPilot Tool。

## Phase E：Product Research

把当前数据入口切到：

```text
CrossPilot Tool
→ Provider Framework
```

不是切到：

```text
XYDC Service
```

## Phase F：Evidence / UI / Trace

证明：

```text
真实 Provider
→ Tool
→ Workflow
→ Evidence
→ Product Opportunity
```

## Phase G：Regression

Mock / Existing Workflow 全部回归。

---

# 30. 给本地 Coding Agent 的执行提示词

```text
你正在维护已经上线的 CrossPilot V9。

本次任务不是“直接把西柚 MCP 写进 Product Research”，而是进行一次最小侵入式的平台增量升级：

【目标】
建立通用 Integration Provider Framework，使现有 CrossPilot Tool 可以由 MCP、HTTP API、Native Adapter、RPA 等 Provider 实现；XYDC（西柚洞察）作为第一个真实 MCP Provider 接入。

【核心边界】
1. V8/V9 已经存在，禁止推倒重构。
2. 现有 Tool Platform / Tool Registry / Tool Executor 优先复用。
3. CrossPilot Tool ID 是稳定 Capability ID，例如 market.product.search。
4. Product Research / Workflow / Agent 不得直接认识 XYDC remote tool name。
5. XYDC 只是 Provider，不是新的 Business Module。
6. MCP 是 Transport，不是业务架构。
7. XYDC Raw DTO 只能存在于 integration/provider adapter 层。
8. 业务层只消费 CrossPilot normalized model。
9. Mock 必须保留。
10. Token 不进入前端、日志、Trace 或 Git。
11. 现有 tool_executions 优先复用，不新建重复的 mcp_tool_runs。
12. Read Tool 与 Action Tool 风险边界继续沿用现有 V9；MCP 不得绕过 Approval。

【Phase 0：只扫描，不改代码】
扫描：
- packages/tool-platform 或等价模块
- Tool Registry / Tool Executor
- packages/integrations
- Product Research Workflow
- MarketDataProvider / Mock 数据
- tool_executions / Trace
- Secret / Config
- Error Contract

输出 MCP_PROVIDER_MAPPING.md：
- 当前目录
- 可复用模块
- 需要新增模块
- 需要修改文件
- 当前 Tool IDs
- 当前 Mock 入口
- 当前 Research 数据入口
- 最小侵入式接入点
- 数据库是否需要 Migration
- 回归风险

完成 Mapping 后才允许修改代码。

【Phase 1：Provider Framework】
建立或复用：
- IntegrationProviderDefinition
- CapabilityBinding
- ProviderRegistry
- ProviderRouter
- IntegrationGateway

Transport 至少可表达：
MCP / HTTP / NATIVE / RPA

不要实现复杂动态路由。
第一版 priority + enabled 即可。

【Phase 2：MCP Runtime】
建立通用：
- McpClient
- McpConnectionManager
- McpExecutor
- McpDiscovery

负责：
connection / auth / tools/list / schema / call / timeout / bounded retry / health / error normalize / trace

禁止包含市场分析等业务逻辑。

【Phase 3：XYDC Provider】
使用现有 XYDC MCP Token / Endpoint。

先执行真实 Discovery：
- connect
- tools/list
- inspect input schema

不要猜 remote tool name。

输出 XYDC_CAPABILITY_MAPPING.md。

选择 3～5 个最能证明 Product Research 的 remote tools，
映射到现有或新增稳定 CrossPilot Tools，例如：
- market.product.search
- market.product.detail
- market.market.overview
- market.keyword.search
- market.product.trend / market.keyword.trend

如果现有 Tool ID 不同，以现有代码为准，不为匹配本文强制改名。

【Phase 4：Normalization】
建立 XYDC Mapper。

XYDC raw result
→ MarketProduct / MarketMetric / KeywordMetric / MarketTrend
→ Evidence

禁止把第三方字段直接传给 Domain / Workflow / Agent。

【Phase 5：Tool Platform】
CrossPilot Tool Executor 通过 IntegrationGateway 调 Provider。

Agent / Workflow / Tool Center 都继续调用相同 CrossPilot Tool。

禁止：
Agent → XYDC MCP
Workflow → XYDC MCP
Frontend → XYDC MCP

【Phase 6：Product Research】
在现有 Product Research 上增量替换数据入口：

validate
→ CrossPilot market tools
→ Provider Framework
→ XYDC
→ normalized result
→ snapshot / evidence
→ market signals
→ product opportunity

不要重写 Product Research。

【Phase 7：Reliability】
支持：
- timeout
- bounded retry
- provider error normalize
- health
- fallback
- degraded mode

第一版：
Primary = XYDC
Fallback = MOCK 或 last successful snapshot

前端必须明确显示 LIVE / CACHED / MOCK / DEGRADED。
禁止静默用 Mock 冒充真实数据。

【Phase 8：Trace】
在现有 Tool Trace 中补：
providerId
transport
remoteToolName
capabilityId
durationMs
retryCount
fallbackUsed
errorCode
cost/credits（如果 Provider 提供）

Token / Secret 必须脱敏。

【Phase 9：测试】
Unit:
Provider Router / Mapper / Error Mapping

Contract:
MCP Discovery / Remote Schema / Mapping

Integration:
CrossPilot Tool → XYDC MCP → Normalized Result

E2E:
Product Research → XYDC Live Data → Evidence → Product Opportunity

Regression:
Mock mode / Existing Tool / Existing Workflow

【验收】
1. 断开 XYDC 不会让整个 CrossPilot 崩溃。
2. 切换未来 Provider 不需要修改 Product Research。
3. 上层代码不存在 XYDC remote tool name。
4. 第三方 DTO 不泄漏到 Domain。
5. 至少 3 个真实 XYDC Tool Call 跑通。
6. 页面可以证明 source=XYDC、mode=LIVE、capturedAt。
7. Trace 可以看到 Provider 调用但看不到 Token。
8. Mock 仍然能跑。
9. 不进行任何无关重构。

最终输出：

# MCP Provider Framework Implementation Report

## 1. Existing Architecture Reused
## 2. Mapping
## 3. Files Added
## 4. Files Modified
## 5. Provider Framework
## 6. MCP Runtime
## 7. XYDC Capability Mapping
## 8. Normalized Contracts
## 9. Tool / Workflow Changes
## 10. Database Changes
## 11. Trace / Reliability
## 12. Tests
## 13. Regression
## 14. Remaining Risks
```

---

# 31. 本轮最终结论

本轮不是：

```text
CrossPilot + 一个 XYDC 插件
```

而是：

```text
CrossPilot
   ↓
Stable Tool Platform
   ↓
Generic Integration Provider Framework
   ↓
MCP / HTTP / Native / RPA
   ↓
XYDC / SellerSprite / Sif / YouTube / ERP / ...
```

XYDC 只承担：

> **第一个真实 Provider 和第一条真实外部数据链的验证。**

一旦本轮完成，未来新增 MCP Provider 应主要变成：

```text
注册 Provider
+
Discovery
+
Capability Binding
+
Mapper
+
Contract Test
```

而不是再次修改核心业务架构。
