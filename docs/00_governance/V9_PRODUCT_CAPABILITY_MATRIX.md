# CrossPilot V9 全产品能力审计矩阵 (Product Capability Matrix)

> **Current Release:** CrossPilot V9.1  
> **Release Status:** RELEASE VERIFIED & FROZEN  
> **REAL / PARTIAL / MISSING 定义不因 Freeze 改写。** Known Gaps 不是 V9.1 Release Blocker。
>
> **审计基准**：
> - 代码库事实：`apps/api`, `apps/web`, `apps/worker`, `packages/*`
> - 测试基线（Phase 3 重计，Freeze 未重跑）：Typecheck 10/10；API 88 tests；Domain 228 tests；Web contracts 29；Evals 9/9；Web Build 23/23。Integrations LIVE review count 按 Phase 2.2 裁决，不刷 5151。
> - 远程验收：`7c81411` @ `http://116.198.230.217:2222`；API 26/26 PASS；Browser Acceptance PASSED。
> - 状态分级标准：
>   - **`REAL`**：已真实接通外部系统 / 数据库持久化 / 算法闭环，具备全链路自动化测试与生产路径。
>   - **`PARTIAL`**：核心骨架已通，部分底层链路真实，但依赖部分静态配置、降级假数据或缺少外部联调。
>   - **`MOCK`**：仅有结构定义或通过伪造数据/随机数返回，未接入真实外部数据或算法。
>   - **`DEMO_ONLY`**：纯前端演示界面，未与真实后端业务逻辑或领域模型产生实质绑定。
>   - **`MISSING`**：方案文档中有规划，但在代码库中完全未开发（无页面、无 API、无模型）。
> - **核心事实裁决**：`严禁因为存在前端页面就定义为“已完成”`。

---

## 1. 19 大产品模块全景能力矩阵

| 序号 | 模块能力 (Capability) | 前端界面 (UI) | 领域模型 (Domain Model) | 真实数据 (Real Data) | 确定性计算服务 (Deterministic Service) | AI / 算法能力 (AI Capability) | 工作流编排 (Workflow) | 后端 API (API) | 工具注册 (Tool) | 自动化评测 (Eval) | 生产就绪度 (Production Readiness) | 真实状态 (Current Status) | 核心差距 (Main Gap) |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **1** | **Market Research** (市场调研) | `/app/market-research`<br>四维看板+趋势图 | `MarketAnalysis`, `MarketplacePolicy` | **XYDC MCP 真实接通**<br>(ASIN, 关键词, 搜索量, 排名) | 关键词清洗、搜索量清洗、市场集中度归一化 | 事实解释防数值漂移校验器 (`NumericValidator`) | 请求级顺序流水线 | `/market/research`<br>`/market/keyword` | 5 个市场工具注册在 Tool Platform | 单元测试 + Live MCP 探针脚本 | **90%** | **REAL** | 缺少定时全市场周期性自动刷新机制，依赖单次手动触发 |
| **2** | **Product Research** (选品决策) | 选品总分卡片、六大信号矩阵、事实证据三栏 | `OpportunityScoreEngine`, `ProductOpportunity` | **XYDC + Firecrawl**<br>双真实外部源 | 六大信号确定性公式计算，`EvidenceGate` 强校验关键缺失 | 纯确定性计算<br>(有意排除 LLM 幻觉) | 选品打分确定性流水线 | `/market/opportunity` | `market.product.search` 等 4 工具 | 9/9 金标测试 + 边界单调性测试 | **95%** | **REAL** | 选品模型已正式冻结在 v1.0.0，暂不支持多站点权重自适应 |
| **3** | **VOC** (买家原声洞察) | 买家痛点赞誉卡片、频次分布、证据引言 | `ExternalVocSignal`, `VocCluster` | **Firecrawl 真实抓取**<br>(25条外部讨论与分母语义) | 痛点占比与样本量加权计算 | 语义标签归类与原声截取 | VOC 聚类流水线 | `/market/voc` | Firecrawl VOC Provider | 外部 VOC 覆盖与真实性审计 | **REAL** (外部)<br>**PARTIAL** (站内) | **PARTIAL** | 缺乏亚马逊官方买家评论的大批量脱敏拉取，仅支持公开聚合与外部原声 |
| **4** | **Product Center** (商品中心) | `/app/products`<br>`/app/skus`<br>TopBar SKU Selector | Prisma `Product`, `Sku`, `ProductFeature` | PostgreSQL 数据库持久化 | 尺寸单位换算 (`UnitConversionService`)、规格校验 | 视觉特征结构化定义 | 商品 CRUD 状态流 | `/products`, `/skus/:id/overview` | 无直接对外工具 | 单元测试覆盖 | **85%** | **REAL** | Catalog 真实；全局 SKU 选择使用 `sku.id`。未与 Amazon SP-API Catalog Items 双向同步 |
| **5** | **Competitor** (竞品监控) | `/app/competitors`<br>竞品价格/排名对比 | `CompetitorAsin`, `CompetitorPriceRecord` | XYDC MCP 支持单次查价；历史序列来自数据库 | 价格变动幅度与 Buy Box 监控 | 无 | Sku360 外部竞品上下文加载 | `/market/competitor` | `market.asin.info` | D5 / D6 金标用例 (时效性防御) | **60%** | **PARTIAL** | 缺少周期性爬虫/订阅监控，历史价格主要依赖 scenario 预置种子 |
| **6** | **Profit** (利润核算) | `/app/profit`<br>指标卡、Waterfall 瀑布图 | `ProfitDaily`, `AnalysisWaterfall` | PostgreSQL 数据库真实记录 | 佣金(15%)、FBA履约费、采购成本、PPC扣减、方差归因 | 纯确定性数学闭环<br>($\|residual\| \le 0.05$) | 财务周期归因流水线 | `/profit/daily`, `/analyst/waterfall` | `finance.profit.calculate`, `bi.variance.attribute` | 纯数学一致性证明单测 | **90%** | **REAL** | 瀑布 API 是 `/analyst/waterfall` 不是 `/profit/waterfall`。Overview 利润异动已接 waterfall 或标 Demo Scenario |
| **7** | **Supply / Purchase** (供应链与采购) | `/app/suppliers`<br>供应商档案、采购单管理 | Prisma `PurchaseOrder`, `Supplier`, `PoItem` | PostgreSQL 事务化落盘 | `PurchaseOrderStateMachine` 严禁超收，入库原子增加 FBA 可售库存 | 无 | 采购单状态机生命周期 | `/purchase`, `/supplier` | 无独立工具 | 采购状态机单测与并发防重单测 | **80%** | **REAL** | 缺少外部 1688 API 或真实工厂 ERP 对接，采购单只停留在内部状态流转 |
| **8** | **Listing Studio** (Listing 智能工作台) | `/app/listings`<br>6 大 Tab (正文/视觉/关键词/Rufus/指示卡/DAG) | `ListingDraftV2`, `MarketplacePolicyProfile` | Real LLM (DeepSeek/Claude/OpenAI) + Real Milvus RAG | 政策字符硬限制、禁止 FDA 词库、Claim 逐字 Grounding & Repair | 统一 LLM 运行时结构化生成 + 表面声明提取 | **14-Step DAG 编排引擎** | `/listings/generate`, `/listings/sku/:skuId` | `keyword.file.extract`, `product.visual.extract` | Listing RAG 10/10 PASS, Listing LLM 16/16 PASS | **85%** | **REAL** | SKU 切换器由 `GET /products` 驱动，主键是 `sku.id`。**发布环节为 Known Gap**，无 Amazon SP-API Listings Items 真实刊登 |
| **9** | **Launch** (新品发射中心) | 无前端路由 (PRD 规划 `/app/launch`) | Prisma Schema 仅有 `LaunchPlan` 占位 | 无 | 无 | 无 | 无 | 无 API 控制器 | 无 | 无 | **0%** | **MISSING** | 属于完全未实现模块，代码库中除 Schema 定义外无实质代码 |
| **10** | **Advertising** (广告智能) | `/app/advertising`<br>活动列表、ACOS/ROAS看板 | Prisma `Campaign`, `SearchTermMetricDaily` | PostgreSQL 数据库记录 (由 Scenario/种子灌装) | ACOS, ROAS, 搜索词浪费额计算 | 无 | WF-05 广告低效诊断子链路 | `/advertising/campaigns`, `/advertising/search-terms` | `REVIEW_NEGATIVE_KEYWORD`, `REVIEW_AD_SPEND` | D1, D7, D10 金标用例 | **50%** | **PARTIAL** | 无真实 Amazon Ads API (v3) 凭据打通，无法自动拉取实时报表或下发调价/否定词 |
| **11** | **Orders** (销售订单) | `/app/orders`<br>订单列表、明细弹窗 | Prisma `Order`, `OrderItem` | PostgreSQL 事务化落盘 | 订单创建原子扣减库存、订单号幂等防重 | 无 | 订单接收生命周期 | `/order/list`, `/order/create` | 无 | 事务性扣减单测 | **80%** | **REAL** | 仅支持内部 API 创建或 Scenario 灌装，无 Amazon SP-API Orders 实时定时同步 |
| **12** | **Inventory / FBA** (库存与周转) | `/app/inventory`<br>在仓/在途/预留/缺货看板 | Prisma `InventoryBalance`, `InventoryMovement` | PostgreSQL 实时平衡表 | `InventoryPlanningService` 计算日均销量(ADS)、安全库存、周转天数、补货量 | 无 | 补货计划生成链路 | `/inventory/balances`, `/inventory/planning` | `query_inventory_risk` | D2, D3 缺货与补货金标测试 | **85%** | **REAL** | 补货与库存计算严谨，但无 Amazon FBA Inventory Reports / Inbound API 实时对接 |
| **13** | **Reviews / Returns** (售后退货) | `/app/reviews`<br>退货明细列表、退款金额看板 | Prisma `ReturnRecord` | PostgreSQL 事务落盘；XYDC 抓取公开星级与评价数 | 退款金额幂等防重退、退货损失计入损益 | 无 | 退货记录流水 | `/profit/returns` | `query_return_summary` | D4 质量缺陷金标用例 | **55%** | **PARTIAL** | 退款流水真实，但页面 VOC 痛点卡片为静态硬编码，缺少站内买家真实差评语义分析流水线 |
| **14** | **Profit Center** (经营分析中心) | `/app/profit`<br>90 天经营看板、瀑布分解 | `ProfitCalculationService`, `VarianceAttributionService` | PostgreSQL 数据聚合 | 5 大经营杠杆（广告、退货、库存、价格、其他）全量闭环分解 | 纯确定性数学模型 | WF-04 账目核对与分解 | `/profit/daily`, `/profit/waterfall` | `query_profit_summary`, `calculate_variance` | 数学恒等式单测 (residual === 0) | **90%** | **REAL** | 报表与归因算法成熟完备，缺少多币种与复杂税费（VAT/Sales Tax）动态结算引擎 |
| **15** | **AI Business Analyst** (AI 经营分析师) | `/app/business-analyst`<br>对话问答、瀑布流展示 | 5 大核算工具上下文 | PostgreSQL 账目实时查询 | 确定性五大杠杆分解 | 模版字符串拼装应答<br>(未接入真实多轮 LLM Agent) | WF-04 工具对账流程 | `/analyst/ask`, `/analyst/waterfall` | 5 个核算内部工具 | 对账回归测试 | **45%** | **PARTIAL** | 底层数据查询与方差分解 100% 真实，但**问答层是固定文本插值**，无真实 LLM 自主工具调用推理 |
| **16** | **Operations Today** (每日运营工作台) | `/app/operations/today`<br>8 大组件 (Header/Health/DAG/Action/Drawer/OCC等) | WF-05 全套 contracts (`DailyOperationWorkflowState`) | Sku360 跨域全景数据 (DB + Scenario) | `OperationAnomalyDetector`, `CrossDomainDiagnosisService`, `ActionRecommendationService` | 决策由纯确定性代码主导；提供结构化 DTO 供 LLM 消费 | **WF-05 9-Step DAG + HITL 审批** | REST (6 个端点)<br>SSE (`/events` 实时流) | 5 个一等公民工具 (`operation.daily.*`) | D1~D10 端到端金标用例 (11/11 PASS) | **95%** | **REAL** | OCC 后端冻结；Phase 3 补 in-flight lock、冲突文案、INVALID_ACTION_STATE 自动刷新、Dialog a11y。Resume 不是关单条件。**Approval ≠ Execute** |
| **17** | **Knowledge Base** (知识库与 RAG) | 嵌入 Listing 工作台；**无独立 KB 页面** | Prisma `KnowledgeDocument`, `KnowledgeChunk` | **Milvus 2.4 真实向量数据库** + PostgreSQL | 三层分层过滤 (`AUTHORITY`, `ALGORITHM`, `INTENTION`) | OpenAI text-embedding-3 向量化 + 相似度搜索 | Listing DAG Step 8 知识召回 | 无独立 `/knowledge` 管理 API | 无独立对外工具 | 10/10 Listing RAG 金标测试 | **85%** | **REAL** | 向量检索真实。Sidebar「架构」不是 KB 管理台。独立 KB 控制台仍是 Known Gap |
| **18** | **Tool Platform** (统一工具平台) | `/app/tool-center`<br>工具目录与试运行看板 | `ToolRegistry`, `ToolExecutor` | 真实执行后端工具 | Zod 强类型参数校验、超时断路、输出字符限制 (<4096B) | 工具调用桥接 | 工具执行调度链路 | `/tools`, `/tools/:id/execute` | **28** 个默认工具（`ALL_DEFAULT_TOOLS`） | 单元测试覆盖 | **90%** | **REAL** | 不再写 22。缺少工具执行权限的细粒度 RBAC |
| **19** | **Agent Trace / Eval** (审计与评测体系) | 嵌入 Operations Today DAG 轨迹与端到端运行日志 | Prisma `AgentTask`, `AgentStep`, `Approval` | PostgreSQL 持久化全量审计轨迹 | 耗时监控、状态版本自增、敏感数据擦除 (`SensitiveDataGuard`) | Claim 事实对齐度量化打分 | DAG 步骤追踪拦截器 | `/operations/daily-diagnosis/:taskId` | 无 | 38 套测试套件 300 用例，9/9 脚本门禁 | **90%** | **REAL** | 具备完备审计轨迹与评测脚本，缺少面向生产运行的可视化 Token 成本与延时 APM 大屏 |

---

## 2. 真实能力分布统计 (Reality Distribution)

```text
┌─────────────────────────────────────────────────────────────┐
│ Total Modules Audited: 19                                    │
├──────────────────────┬───────┬────────────┬─────────────────┤
│ Status               │ Count │ Percentage │ Core Examples   │
├──────────────────────┼───────┼────────────┼─────────────────┤
│ REAL                 │ 12    │ 63.2%      │ Market, Listing,│
│                      │       │            │ Profit, PO, WF05│
├──────────────────────┼───────┼────────────┼─────────────────┤
│ PARTIAL              │ 6     │ 31.6%      │ Ads, Competitor,│
│                      │       │            │ Analyst, VOC    │
├──────────────────────┼───────┼────────────┼─────────────────┤
│ MOCK                 │ 0     │ 0.0%       │ (已在E1-E3消灭) │
├──────────────────────┼───────┼────────────┼─────────────────┤
│ DEMO_ONLY            │ 0     │ 0.0%       │ (无纯假皮模块)  │
├──────────────────────┼───────┼────────────┼─────────────────┤
│ MISSING              │ 1     │ 5.3%       │ Launch Center   │
└──────────────────────┴───────┴────────────┴─────────────────┘
```

> **客观审计结论**：
> CrossPilot 经过 Epic 1 (LLM 运行时与 Listing 生成)、Epic 2 (Milvus 真实 RAG) 和 Epic 3 (WF-05 每日运营智能全链路) 的高强度重构，已经消灭了所有纯 MOCK 模块，核心业务系统真实度达到 **63.2% (REAL) + 31.6% (PARTIAL)**。
> 目前最核心的结构性断裂在于：**核心业务计算与决策极其成熟真实，但“数据输入端”（缺少 Amazon SP-API / Ads 真实店铺数据同步）与“行动输出端”（缺少受控外部执行器）仍处于沙盒隔离状态。**

---

## 3. V9.1 Frozen Known Gaps（不是 Release Blocker）

Freeze **不改变**上表任何模块的 REAL / PARTIAL / MISSING。下列差距继续保留，进入 `post-V9.1 backlog`，禁止当作 V9.1 未完成项去改 tagged baseline：

| Known Gap | 矩阵状态 | Freeze 处置 |
| :--- | :--- | :--- |
| Epic 4 / Amazon SP-API | 多模块 Main Gap | SUSPENDED / NOT STARTED |
| Approval ≠ Execute | Operations Today 不变量 | 保持；批准 ≠ 采购/广告/发布/调价 |
| WF-03 PARTIAL | Supply / Purchase 无 ERP | 保持 PARTIAL |
| WF-04 PARTIAL | AI Business Analyst 模版问答 | 保持 PARTIAL |
| Launch Center MISSING | 模块 9 = **MISSING** | 保持 MISSING |
| Scheduler MISSING | 不在 19 模块内；无生产 Cron | 保持 MISSING |
| Creative Mock | `/app/creative` PARTIAL / Mock 图 | 保持 |
| Reviews / VOC Partial | 模块 3 PARTIAL；模块 13 PARTIAL | 保持 PARTIAL |
| 独立 Knowledge Base 管理台 MISSING | 模块 17 RAG REAL，无独立台 | 保持：有 RAG、无管理台 |
| Agent Trace / Eval 独立大屏 MISSING | 模块 19 轨迹 REAL，无独立大屏 | 保持：有落库、无 APM 大屏 |

XYDC：`5147` = fixture snapshot；`5151` = LIVE mutable。NOT PRODUCT BUG。禁止 `5147 → 5151`。
