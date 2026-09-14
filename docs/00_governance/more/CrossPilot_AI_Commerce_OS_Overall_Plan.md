# CrossPilot AI Commerce OS — 整体功能演进与实施规格

> 版本：V1.1 · 2026-09-13  
> 状态：文档已修订；本轮仅交付文档，代码、数据库、运行时未变更。  
> 目标：没有正式店铺时，先用可持续经营的模拟店铺验证 AI 自动化，再逐步接入真实平台。  
> 执行入口：[IMPLEMENTATION_HANDOFF.md](./IMPLEMENTATION_HANDOFF.md)；模拟细则：[Simulator 规格](./CrossPilot_Commerce_Simulator_Closed_Loop_Plan.md)。

## 1. 目标与首版范围

长期闭环：店铺数据 → 感知 → 诊断 → 决策 → 风险检查 → 审批 → 执行 → 回读 → 经营效果观察 → 策略评测。

当前重点是让已有分析、Action 和 Simulator 消费同一个店铺状态，形成能处理失败的经营闭环。首版不要求把全部业务域同时做完。

| 范围 | 首版决策 |
|---|---|
| 店铺 | 一个 Amazon 风格模拟店铺；复用现有三个 SKU 商品配置，复制为隔离运行的记录 |
| 动作 | DECREASE_BID、STOP_CAMPAIGN；后者界面文案为“暂停广告活动” |
| 自动化 | 先人工审批验证，再开放 Simulator 内受限 Policy 审批与自动执行 |
| 时长 | 7 日预热，再连续 30 个模拟经营日；扩展评测再做 90/180 日 |
| 平台 | Simulator 为主线；真实 Amazon/Shopify 写入不属于本次实施范围 |
| 界面 | Operations Today 看数据、动作与结果；Simulator 控制页管理时间、事件、运行、实验 |
| 收益 | 明确列出已建模费用的模拟贡献利润，不包装成真实店铺净利润 |

完成标准：正常、无效、亏损、执行故障场景都能得到有证据的结果；停广告仍有自然流量；重复执行不重复生效；重启可恢复；无法安全判断时转人工或停止。

## 2. 已核实基线与增量边界

文档检查时本地 HEAD 为 `dd69e637b0880ed50e8ed9743dcff3e3f8517ed1`。下表来自源码与交接的只读检查，本轮未重跑测试、未核验云端版本。执行 AI 先记录自己的 HEAD 与工作区差异，再确认入口是否适用。

| 资产 | 现状与证据路径（仓库相对路径） | 本次处理 |
|---|---|---|
| Store / ChannelIdentity | `packages/db/prisma/schema.prisma`，V10 Epic 1 已有 | 复用；为隔离 Run 创建记录，不再造身份体系 |
| Commerce Ports | `packages/domain/src/commerce-ports/commerce.ports.ts`，已有五类端口 | 扩展现有接口，不新建包揽一切的 CommerceStorePort |
| Simulator V1 | `packages/domain/src/simulator/`、`packages/db/src/simulator/simulator-store.ts`；已有 Seed、Clock、事件、订单、库存与落库 | 保留 legacy-v1，增加 closed-loop-v2，不重做脚手架 |
| SimulatorAdapter | `packages/db/src/commerce/simulator-adapter.ts`；decreaseBid/updateProduct 禁止写入 | 仅对明确绑定 v2 Run 的 Simulator 开放首批写能力 |
| Action Layer | `apps/api/src/modules/action-layer/action-layer.service.ts` 调用 executeMockAction | 复用 PlannedAction/ActionExecution、审批、Registry、历史；增加 Simulator binding 和回执 |
| Action 契约 | `packages/shared/src/contracts/action-layer-contracts.ts` | 保留现有动作名与主状态，见 §5 |
| WF-05 | `apps/api/src/modules/daily-diagnosis/daily-diagnosis.service.ts`；STORE_SKU360_SOURCE 控制数据源 | v2 显式注入范围受限的数据源，不全局切换所有工作区 |
| Outcome Tracking | `packages/domain/src/outcome/`、API outcome-tracking、DB outcome-*.ts、worker processor；已有表和测试 | 补来源、模拟时钟、窗口、利润与可信度，不重建 Epic A |
| Outcome 部署 | docs/HANDOFF.md 记载本机已实现、migration 待云库 apply | 只是交接记载，不推断已上线 |

主要断点：V1 在生成销售之后推导广告指标，未读取可执行的 bid 状态；Mock Action 不改世界；已有 Outcome 观察前后变化，但不能据此认定动作造成了变化。

## 3. 文档关系与兼容规则

本包取代 more/ 中原 V1.0 的实施建议；长期愿景保留，近期按 CL-0～CL-6 排序，不复用已有 V10 Epic 编号。

| 既有文档 | 保留 | 本次实施的调整 |
|---|---|---|
| V10_COMMERCE_OS_ARCHITECTURE.md | Adapter 分层、身份映射、复用 Action | 增加 v2 Simulator 写 binding、能力清单和回执 |
| V10_NEXT_AGENT_HANDOFF.md | 历史实现与运行时证据 | 执行本包时，“先做 Shopify 只读”不是模拟闭环的前置依赖 |
| CLOSED_LOOP_OPERATIONS_LAYER_PRD.md | Outcome/Incident/Experiment/Autopilot 分工 | Epic A 已有代码；先保证动作生效和数据同源；Mock SUCCESS 不算有效干预证据 |
| V9_1_RELEASE_FREEZE.md、旧 Simulator 测试 | 历史发布事实、旧路由和默认行为 | 新模型版本化旁路；不覆盖旧世界、不改旧 Seed/起始日/初始库存，不为新结果重录旧 Golden |

用户让其他 AI 实施本包时，新增 v2 模型、限定到 v2 Run 的数据源和 Simulator 写入，是该任务的必要范围，无需对常规文件变更逐项询问。当前“写好文档”的指令不表示已实施，也不授予部署、推送或真实店铺操作权限。

保留原则：Approval ≠ Execute；UI 不计算业务规则；平台 SDK 只在 Adapter；工作流只编排；Postgres 保存任务事实；未知值不伪造 0；跨工作区和店铺隔离。Policy 可以成为审批主体，但批准与执行仍为两个有记录的步骤。

## 4. 架构与数据流

```text
Simulator closed-loop-v2 / 后续真实渠道
 → 已提交的 Canonical 数据 + 来源/完整性/时间标记
 → 限定 workspace/store/run 的 Sku360 数据源
 → 现有 WF-05 → Recommendation → PlannedAction
 → 风险与能力检查 → 人工或 Policy 审批
 → ActionToolRegistry → SimulatorAdapter
 → 原子修改 World State + 执行回执
 → 下一 Tick 生成订单/库存/广告/财务
 → 回读配置确认生效 → Outcome → Experiment / Incident
```

沿用 TypeScript、NestJS、Next.js、Prisma/PostgreSQL、BullMQ、Jest 及现有服务部署单元，不新增微服务、通用 Agent 框架或第二套动作系统。

### 4.1 三种状态分开

- Simulator 真值：潜在需求、质量问题真实原因、未来外部事件，仅引擎与评测器可读。
- 经营观测：截至已提交日期可获取的订单、广告、库存、财务、评论；诊断只读这一层。
- AI 决策：解释、推荐、动作、审批；关联所用证据，不把真值当检索上下文。

v2 结果携带 workspaceId/storeId/runId/modelVersion/dataSource/asOfDate。workspace 从登录上下文获取，不能信任请求体指定的任意租户 ID。legacy 数据保持旧契约，v2 写路径必须完整绑定。

### 4.2 能力清单

Adapter 暴露 supportedActions、executionMode（mock/simulator/live）、constraints、dataFreshness。上层不感知 HTTP/SDK，但必须知道哪些动作可用、当前是否模拟执行。

不支持的广告域返回 UNSUPPORTED_CAPABILITY，缺凭证返回 AUTH_REQUIRED，同步失败明确失败。不能把不支持解释成“没有广告”，不能静默回退模拟结果冒充真实数据。

## 5. Action 契约与执行

### 5.1 名称与兼容

现有 CommerceActionType 为 DECREASE_BID、UPDATE_INVENTORY、GENERATE_REPORT、STOP_CAMPAIGN、CHANGE_PRICE、DELETE_LISTING。首批只绑定前述两个广告动作，不顺手启用删除、改价、改库存。

| 原方案表达 | 实施使用 |
|---|---|
| PAUSE_CAMPAIGN | STOP_CAMPAIGN，语义为暂停，人工补偿可恢复 |
| ADJUST_PRICE | 后续复用 CHANGE_PRICE |
| UPDATE_LISTING / INCREASE_BID / ADD_NEGATIVE_KEYWORD | 后续显式扩展 shared、validator、planner、risk、registry、UI、测试；首批拒绝 |

保留主状态 `CREATED → WAITING_APPROVAL → APPROVED → EXECUTING → SUCCESS/FAILED`；不得整体改名为 PROPOSED/SUCCEEDED。执行回执单独保存 PENDING/APPLIED/NOT_APPLIED/UNKNOWN，与经营 Outcome 分离。

### 5.2 首批命令

```json
{
  "actionType": "DECREASE_BID",
  "target": {"storeId": "store-id", "runId": "run-id", "campaignId": "campaign-id"},
  "parameters": {"percentage": 20, "expectedTargetVersion": 3}
}
```

percentage=20 表示降低 20%，新 bid 为旧值的 0.8。首版一个 Campaign 一个出价目标、一个 SKU；keyword 非空则拒绝，不能悄悄修改整 Campaign。STOP_CAMPAIGN 将状态置为 PAUSED，不删除记录，后续广告流量/花费为 0，自然流量保留。

审批绑定 payload 摘要、目标版本和模拟有效期；参数变化、目标版本变化或审批过期均拒绝执行，并产生新的提案/审批，不能修改已审批记录的含义。

### 5.3 幂等、回执与补偿

业务幂等键由 workspaceId + runId + actionId + operationKind 组成，重试不换键。同键不同 payload 返回 409；同键同 payload 回放已有结果。

Simulator 同一事务中锁定运行状态、验证审批/目标、修改状态、写唯一回执、更新 ActionExecution/主状态。回执保存 before/after、payloadHash、版本、模拟执行日、宿主机记录时间、attempt。

请求超时先查回执：APPLIED 只回放；明确 NOT_APPLIED 才重试；UNKNOWN 禁止再次副作用。恢复任务必须消解崩溃遗留的 EXECUTING，不能永久挂起。Outcome 创建失败进入可重试修复记录，不因回调失败再次执行动作。

补偿是新的审计操作，恢复出价或 ACTIVE 状态前校验目标未被后续动作更改。它只改变未来，不撤销已花掉的广告费或已发生的订单。

## 6. Outcome、实验与自动化

### 6.1 复用 Outcome

已有 ActionOutcome 负责前后观察，不能代替受控实验。新结果增加 interventionVerified、evaluationVersion、dataCoverage、evaluationScope 和缺失原因；未证实世界变化的 Mock 执行不得显示“动作带来收益”。

v2 使用模拟执行日和已完成 Tick 水位。不能因为 workspace 有 SimulationState 就把真实店铺套用模拟时钟。窗口、费用、零分母及多动作归因规则统一在 Simulator 规格 §7。

### 6.2 三组对照

比较不干预、固定简单规则、CrossPilot。共享初始状态、外部扰动和经营规则，区别仅在决策。规则基线同样受动作幅度和频率约束。分别报告工程正确性、模拟模型内效果、平台适配、真实经营结果；没有正式店铺时最后一项未验证。

### 6.3 受限 Autopilot

以下为模拟实验默认值，是设计参数，非真实店铺经营建议：

| 约束 | 默认规则 |
|---|---|
| 开关 | 默认关闭，OWNER/ADMIN 按 Run 开启 |
| 自动动作 | 仅 DECREASE_BID；STOP_CAMPAIGN 首版保留人工审批 |
| 幅度 | 单次降低 1%～20%；相对当日初始 bid，累计降低不超过 30%；不得低于模型最小值 |
| 频率 | 同 Campaign 两次自动动作间隔至少 3 个已完成模拟日；每 Run 每日最多 3 次 |
| 数据 | 最近 7 日完整，累计广告点击至少 100；审批仅在生成后的下一个日边界内有效 |
| 停止 | 经营不变量失败、隔离失败、连续 3 次执行异常、结果 UNKNOWN、必要数据缺失 |
| 护栏 | 成熟观察窗日均贡献利润较批准时的 7 日基线下降超过 10%，暂停该目标；不将此相关性当归因结论 |
| 接管 | 人工可随时关闭；未执行 Policy 审批失效，进行中的动作先确认回执 |

LLM 负责证据解释和 schema 约束的建议；计算、权限、准入由确定性代码负责。LLM 失败记录原因并转人工；模板回退不能伪装成模型成功。实验锁定模型、提示词、策略版本并记录费用。

## 7. 分阶段交付

具体任务、路径与命令见执行入口。阶段通过后可以继续，不要求常规步骤逐项审批。

| 阶段 | 交付 | 验收结果 |
|---|---|---|
| CL-0 | 基线复核与版本路由 | 旧 V1 默认行为不变，新 Run 可选 v2，不把源码存在写成线上已验证 |
| CL-1 | v2 世界、持久化、因果与明细 | 订单/库存/广告/财务对账，停广告保留自然订单，重放一致 |
| CL-2 | 首批 Action 执行 | 审批、修改、回执、重启/并发/超时恢复通过 |
| CL-3 | WF-05 同源数据与 Outcome | 无固定日期、无跨店混数，动作与后续结果可追溯 |
| CL-4 | 三组实验与故障场景 | 留出集、多 Seed、负收益和不确定结果正常呈现 |
| CL-5 | Autopilot 与最小 UI | 连续 30 日，频率/金额边界、停机、接管通过 |
| CL-6 | 平台契约验证准备 | 同一业务验收套件可验证对应平台能力；无凭据明确 NOT_RUN |

上线另形成迁移/发布清单；不把本包当现网授权，也不因云端未部署就拒绝交付本地实现与测试证据。

## 8. 长期业务域路线

| 业务域 | 保留能力 | 下一闭环及前提 |
|---|---|---|
| Research Intelligence | 市场、选品、竞品、差异化、成本、风险 | 复用 WF-01，机会转 SKU/Listing 并记录后续表现；本轮不重写评分模型 |
| Listing & Creative | Listing、合规、图片、视频、素材 QA | 广告闭环稳定后扩展；文本不直接映射固定收益，效果独立评估 |
| Growth / Ads | 关键词、否定词、预算、Placement、价格、促销 | Campaign 单目标扩展为 ad target/search term；每个动作同步补效果与安全测试 |
| Operations / VOC | 监控、异常、退货、评论、客服 | 延迟退货 → VOC → 产品改进；先做回复建议，自动发送另立权限与验收 |
| Supply Chain | 预测、补货、报价、采购、物流 | 采购单 → 付款/在途 → 延迟到货 → 入库 → 缺货/现金影响；采购付款与 COGS 分开 |
| Finance & Automation | 对账、日报、复盘、现金、策略学习 | 逐步加入汇率时点、仓储、物流、关税税费配置，明确国家和履约模式 |

供应商先从人工报价开始，再接 ERP/1688/Alibaba。Creative 保留 ImageProvider Adapter，不同时建设多个供应商。自动学习先产出可审查的策略变更建议，禁止在线改写真值或风险门槛。

## 9. 官方测试环境

Simulator 验证经营反馈，官方测试环境验证认证、字段、请求、回读和能力差异。两者都不能证明真实商家收益。

- Shopify Dev Store 支持开发测试和测试订单，不能处理真实交易，需要对应开发账号与权限。[官方说明](https://shopify.dev/docs/apps/build/stores/development-stores)
- Amazon SP-API 提供静态/动态沙箱，覆盖范围按 API 不同；不能代替 Amazon Ads 全部测试。[官方说明](https://developer-docs.amazon/sp-api/docs/sp-api-sandbox)

来源为 2026-09-13 查阅的官方文档。执行时核对版本和端点，分别记录 SUPPORTED/UNSUPPORTED/NOT_RUN；不能因某能力无沙箱便宣称真实接入已完成。
