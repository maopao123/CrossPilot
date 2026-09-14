# CrossPilot Commerce Simulator — 闭环模拟与验收规格

> 版本：V1.1 · 2026-09-13  
> 状态：目标规格，尚未实施；示例参数均为合成设计假设，不是平台实测结论。  
> 上游：[整体规格](./CrossPilot_AI_Commerce_OS_Overall_Plan.md)；任务入口：[执行交接](./IMPLEMENTATION_HANDOFF.md)。  
> 定位：可控制、可复现、可做干预实验的经营模拟器。无真实店铺校准时，不称为已验证的真实店铺 Digital Twin。

## 1. 模拟范围与成功标准

首版模拟一个 Amazon 风格店铺、三个 SKU、每 SKU 一个 Campaign、每 Campaign 一个出价目标。经营链为：外部需求 → 自然/广告流量 → 转化 → 订单 → 库存 → 简化履约/退款 → 费用明细 → 贡献利润。

必须同时验证：

1. 状态跨日连续，Action 持久改变后续状态。
2. 经营明细可对账，缺货约束、预算约束、退款延迟真实进入模型计算。
3. 相同模型、配置、初始状态、Seed、外部事件及已记录动作可重放。
4. 诊断只看可观察数据，不读取隐藏的事件原因和未来结果。
5. 对照实验可报告有效、无效、负效应和证据不足，不强制 CrossPilot 获胜。
6. 存储、调度、审批与执行故障可恢复，错误不能变成“收益提升”。

首版不实现真实广告竞价市场、真实自然排名算法、真实税务计算、客服发送、供应商联网采购。模型需要标注这些边界；后续逐项增加业务能力，不靠更复杂的公式宣称更真实。

## 2. 复用、版本与隔离

### 2.1 保留 V1

已有入口：`packages/domain/src/simulator/daily-tick.ts`、`types.ts`、`rng.ts`、`sales-engine.ts`、`ads-engine.ts`、`inventory-engine.ts`、`event-engine.ts`；持久化在 `packages/db/src/simulator/simulator-store.ts`。

保留 legacy-v1 默认 Seed、起始日、库存、事件文案、旧 API 和 Golden 测试。新增 `closed-loop-v2` 引擎入口，通过 Run.modelVersion 显式选择。新代码不得改变旧世界下一次 Tick 的结果。

### 2.2 首版隔离决策

现有 SimulationState 以 workspaceId 唯一，多张日指标表也未支持同工作区多 Run。因此首版采用：**一个 v2 Run 一个专用工作区、一个 Simulator Store**。复制商品、SKU、Campaign 等必要 fixture，分配新主键，禁止引用共享 demo 的业务主键。

- SimulationRun 关联 owner/controlWorkspaceId、runWorkspaceId、storeId；控制工作区用于查看自己创建的 Run 清单，经营数据只存在 runWorkspaceId。
- 创建 Run 时检查控制工作区权限，并给创建者建立专用工作区权限；后续访问同时验证控制关系和运行工作区成员关系，不接受任意 workspaceId 覆盖。
- 实验三组各一个专用工作区，统一事件文件和配置 hash；不把三组明细落入同一份 ProfitDaily。
- 所有业务记录保留 `source_provider='simulator'`；展示层另外标记 modelVersion/runId。不能仅靠 Campaign 名称前缀承担租户隔离。
- 既有 `/simulator/reset` 对 v2 Run 返回 409 `RESET_REQUIRES_NEW_RUN`；“重新运行”创建新 Run，保留原回执与实验结果。
- 旧 V1 reset 行为保持；不得借初始化/实验清理去 reset 现网已有世界。

这是利用现有约束减少迁移范围的首版方案。未来需要同 workspace 多并行世界时，再整体迁移复合唯一键与读路径，本轮不预先实现。

## 3. 状态、命令与 Tick 语义

### 3.1 最小契约

以下为待新增的 v2 契约，不是已经存在的函数。内部命名按执行入口落盘；类型不与旧 SimWorldState 原地互换。

```ts
export type V2ActionType = 'DECREASE_BID' | 'STOP_CAMPAIGN';
export interface V2CampaignState {
  id: string;
  skuId: string;
  status: 'ACTIVE' | 'PAUSED';
  bidCents: number;
  dailyBudgetCents: number;
  targetVersion: number;
}
export interface V2SkuState {
  id: string;
  priceCents: number;
  unitCostCents: number;
  available: number;
  reserved: number;
  unsellable: number;
}
export interface V2WorldState {
  modelVersion: 'closed-loop-v2';
  runId: string;
  workspaceId: string;
  storeId: string;
  nextDate: string;          // 下一个尚未运行的模拟日，UTC YYYY-MM-DD
  completedThrough: string | null;
  stateVersion: number;
  seed: number;
  skus: V2SkuState[];
  campaigns: V2CampaignState[];
}
export interface V2ActionCommand {
  actionId: string;
  runId: string;
  storeId: string;
  actionType: V2ActionType;
  campaignId: string;
  expectedTargetVersion: number;
  percentage?: number;
  payloadHash: string;
}
```

订单/待履约/退货/在途引用必须持久化；可作为有版本的快照字段或独立交易表。上述最小类型只展示跨层必要字段，完整 schema 必须在 CL-1 一并定义并参与 hash。

### 3.2 统一日边界

定义 `completedThrough=D` 表示 D 日经营数据已提交，`nextDate=D+1` 尚未生成。UI 显示两个日期，不能把 nextDate 当成已有完整数据的“今天”。

每天按唯一顺序运行：

1. 锁定 Run，检查状态、版本、该日幂等键和并发任务。
2. 读取截至 D 的观测，完成诊断/策略决策；人工未批准的动作不会自动执行。
3. 按已审批命令顺序执行下一日生效的状态修改，保存回执；校验目标版本。
4. 载入 D+1 外部事件、计划到货、历史订单的履约/退款到期事件。
5. 用生效后的价格、bid、状态、预算计算 D+1 流量和转化，再按库存上限分配订单。
6. 落订单、库存、广告、费用、观测与完整性记录；提交 D+1 Tick，推进 completedThrough/nextDate。
7. 评估成熟 Outcome，执行护栏检查，再允许推进下一日。

Action 与 Tick 共用 Run 状态锁和版本校验。若人工请求在 Tick 运行中到达，返回 409 `RUN_BUSY`，不得悄悄把它算入已经开始的那一天。暂停只阻止下一 Tick，进行中事务按完成/回滚结果处理。

不在数据库长事务中等待 LLM：读取决策快照 → 事务外推理 → 事务内校验 snapshot/stateVersion → 执行。版本变化时丢弃过期建议并重新诊断，不能使用陈旧批准。

人工模式允许继续 Tick，但未执行的建议按有效期过期，不能到第 20 天执行第 3 天审批的价格。自动模式每 Tick 必须等决策、执行、落账、Outcome 完成；禁止只推进 30 日后一次性回填决策。

## 4. 首版经营模型

### 4.1 参数与真实度

SKU 初始价格、库存可复用现有三件商品的配置；所有市场/竞价/转化参数保存为版本化配置。首版 USD 单币种、整数美分、UTC 日粒度、每订单一件商品；多件订单模型是后续扩展，不混淆订单数和销量。

每个参数记录 name/value/unit/source/uncertainty；来源仅可标 synthetic、official_contract 或 calibrated_dataset。首版经营弹性均为 synthetic。报价、平台费用比例只是测试配置，不声称当前真实费率。

### 4.2 流量与广告

推荐首版确定性形状如下，使用固定配置和有键随机抽样；参数默认值由 fixture 文件固定并进入 configHash：

```text
naturalSessions = round(baseNaturalSessions × demandFactor × seasonality × naturalNoise)

r = bid / referenceBid
reachFactor = min(2, max(0, r))
cpc = min(bid, referenceCpc × sqrt(max(0, r)) × competitionFactor)
potentialAdClicks = round(baseAdClicks × demandFactor × reachFactor × adNoise)
adClicks = min(potentialAdClicks, floor(dailyBudget / cpc))
```

PAUSED 时 adClicks、adImpressions、spend 都为 0；bid/cpc 必须为正数，否则配置校验失败。活动暂停不修改 naturalSessions。不能继续使用 `总销量 × 广告流量` 的乘法定义。

广告曝光由 adClicks 和受限 CTR 推导，确保 clicks ≤ impressions；首版明确这是聚合广告响应模型，不模拟真实竞拍。`spend=adClicks×cpc`，按整数美分计算且不超预算。外部竞争事件可以提高 CPC，但不能直接改最终 ACOS。

### 4.3 转化、订单与库存

```text
priceFactor = (price / referencePrice) ^ priceElasticity
CVR = clamp(baseCVR × priceFactor × listingFactor × reviewFactor × conversionNoise, 0, 1)
naturalDemand = Binomial(naturalSessions, naturalCVR)
adDemand = Binomial(adClicks, adCVR)
fulfilledDemand = min(availableAfterArrivals, naturalDemand + adDemand)
lostSales = naturalDemand + adDemand - fulfilledDemand
```

按稳定、与来源无关的潜在订单顺序分配库存，不能总让自然订单或广告订单优先以偏袒某策略。一个订单只计入一个来源；广告订单和自然订单合计等于总订单，禁止重复计收入。

自然/广告 CVR 可不同，但生成参数必须由同一配置控制。缺货不会自动抹掉此前已发生的点击费用；是否暂停缺货广告由明示策略决定。

库存状态转换：下单 available→reserved；发货 reserved→售出；发货前取消 reserved→available；可再次销售的退货验收入库 available 增加，破损退货进入 unsellable。不得在下单和发货各扣一次库存。

核心库存不变量：期初实物 + 累计到货 + 累计退回实物 − 累计发出 − 累计销毁 = available + reserved + unsellable。任何数量不得为负，退货量不超过原订单已发货且未退数量。

### 4.4 履约、退款与延迟

首版默认订单次日发货、发货后 2 日送达；在送达后第 3 日按已锁定参数确定退货，再过 2 日完成退款/质检。以原订单为依据，不能按当天销售额随机扣退款。随机决定在订单产生时锁定，重试不重抽。

事件可以改变延迟、退货倾向和可售恢复比例。首版支持简单物流异常，不要求自建物流网络。首版评论可用模板，来自已送达订单，不能在下单当天生成“使用后评价”。诊断可见评论文本，不能看到隐藏的质量事件类型。

### 4.5 财务

财务明细必须可追溯到订单、广告日、退款或费用事件，禁止随机生成 Profit。每项金额都是整数美分；展示才转币种金额。

首版明确采用简化口径：发货确认销售收入与 COGS，点击发生日确认广告费，退款实际发生日确认退款与退货成本；可售退货恢复存货时冲回相应 COGS。平台费、履约费、仓储费和退货费按版本化合成配置计算。

```text
模拟贡献利润
 = 已确认销售收入 − 已退款金额
 − 已确认 COGS + 可售退货对应 COGS 冲回
 − 广告花费 − 渠道/履约/仓储/退货等已建模费用
 − AI 与执行成本
```

日指标由明细聚合并写入该 Run 的 ProfitDaily，复用已有金额计算逻辑；新增的字段/费用分类不能改变旧世界的利润定义。账本、ProfitDaily、Outcome 必须可按 Run/日期逐分对账。

采购付款属于现金变动，不能再作为当日 COGS 扣一遍。首版不做自由采购决策；场景可预设到货，三组使用同一计划，禁用 V1 内置自动补货来污染“不干预”对照。

界面写“模拟贡献利润（已建模费用）”；未建模的人工、税费、真实汇率风险列入模型说明，不使用“净利润已验证”。指标区分下单金额与已确认收入。ACOS 分母使用广告归因销售额，不用全店收入。

### 4.6 Listing 扩展约束

首版不执行 UPDATE_LISTING。后续实现时，修改文本先改变可观察属性及独立质量评估，再由模型计算可能的转化变化；不能每次修改都提升 listingQualityScore。

保留“CTR +8%、CVR +12%”仅作为名为 `positive_listing_fixture` 的程序回归样例，同时准备零变化、负变化、延迟变化样例。它们不能进入“证明 AI 文案有效”的业务结论。

## 5. 持久化与恢复

### 5.1 最小数据增量

复用 SimulationState、SimulationEvent、Order/OrderItem、InventoryBalance/Snapshot、AdMetricDaily、ChannelDailyMetric、ProfitDaily、PlannedAction、ActionExecution、ActionOutcome。新增实体只承接现有表缺失的职责：

| 拟新增实体 | 字段与约束 |
|---|---|
| SimulationRun | id、controlWorkspaceId、runWorkspaceId UNIQUE、storeId、modelVersion、configHash、seed、status、completedThrough、parentExperimentId；保存完整 config/snapshot 或引用 |
| SimulationTick | runId/date UNIQUE、inputHash、outputHash、stateVersion、status、completedAt；只有 COMMITTED 可被读取 |
| SimulationExecutionReceipt | runId/actionId/operationKind UNIQUE、payloadHash、appliedDate、before/after、状态、targetVersion；外键关联既有 Action |
| SimulationLedgerEntry | runId/sourceType/sourceId/entryType/sequence UNIQUE、storeId、date、signedAmountCents、currency；保留明细来源 |
| SimulationExperiment | controlWorkspaceId、三组 runId、scenario/seedManifest、policy/model/promptVersion、评价规则版本、结果与工件引用 |

这些是拟新增名称，CL-0 若发现同职责实现已存在，应复用并在证据中映射，不能再建重复表。所有实体带明确租户关系及索引。

World 快照存有版本 JSON 是允许的；交易明细、执行回执和实验结果不能只埋在不可查询的大 JSON 里。不另建 SimulationAction 与 PlannedAction 双重审批生命周期。

### 5.2 事务规则

一个 Tick 的订单/库存/广告/账本/状态/提交水位在同一事务提交；失败则整日回滚。幂等请求携带明确目标日期，重试旧日期只回放，不推进下一日。首 Tick 的创建竞争也必须归一为回放或 409，不能暴露裸唯一键异常。

Action 事务与 Tick 锁同一 Run。两个并发动作针对同一版本只有一个可成功，另一个 VERSION_CONFLICT；同一 Action 的重试优先查回执，不能因目标版本已增长而误判失败。

Experiment/Run 的推进任务按数据库状态恢复，BullMQ 只触发；重启不依赖进程内数组。API 和 worker 不能各有一份独立 World。恢复时检查已提交 Tick 和回执，不重新抽随机数。

## 6. 随机、事件、信息隔离

相同 Seed 还不够：版本、配置、初始快照、事件顺序、动作顺序、随机源必须一致。

- 外部随机流按 seed/date/SKU/事件类型键控；不能因某组多下了一单导致后续市场事件错位。
- 潜在转化、履约随机量按 date/SKU/source/potentialOrderIndex 键控；禁止仅靠一个会随控制流消耗的全局 RNG。
- 外部事件列表在实验开始前固化，保存 hash；Run 内生的缺货/预算耗尽可因策略不同而不同。
- LLM 输出即使 temperature=0 也不保证重放一致。重放使用归档决策/响应；重新调用模型属于新实验，不标成逐位重放。
- 日志里的世界真值与运营证据分开存取。Agent/检索上下文不得包含 event.code 的真实原因、未来事件、潜在销量或模型响应参数。

支持需求变化、竞争 CPC 上涨、供应到货延迟、质量异常等外生事件。`ACOS_HIGH`、`STOCKOUT` 是可观察结果；不能直接注入“ACOS 50%”跳过订单和费用计算。

## 7. Outcome 与实验判定

### 7.1 三层结果

| 层级 | 意义 | 判定 |
|---|---|---|
| 执行回执 | 参数是否已经改变 | APPLIED/NOT_APPLIED/UNKNOWN |
| ActionOutcome | 执行后观察到了什么 | 沿用 OBSERVING/POSITIVE/NEGATIVE/NEUTRAL/INCONCLUSIVE/EXPIRED，明确只是前后观察 |
| Experiment | 模拟模型内是否有增量效果 | 配对对照差异、区间、失败比例、尾部表现 |

SUCCESS 不自动推出 POSITIVE；POSITIVE 不自动推出因果成立。一个窗口内多次干预标 MULTIPLE_INTERVENTIONS，不能将全店利润增量分别完整计给每个 Action。

### 7.2 窗口

v2 在 D 日结束后批准并执行，作用于 D+1：

- 基线为 D-6 至 D，共 7 个完整日。
- 7 日观察窗为 D+1 至 D+7；14/30 日分别到 D+14/D+30。
- 只在 completedThrough 达到窗口结束日且对应 Tick 完整时评估。
- 与 7 日基线比较 14/30 日经营量时，比较日均；比率按整窗分子和分母求值，禁止平均每日 ACOS。

现有 computeOutcomeWindows 的测试将基线起点设为 D-7。若首尾包含会出现 8 天；v2 新增 evaluationVersion 保持旧结果可读，不悄悄重写历史窗口。建立“恒定每天利润 10，7/14/30 日均均为 10”的验收。

零分母：销售额 0 时 ACOS=null；花费>0 而广告销售=0 时另标 ZERO_CONVERSION_SPEND；不伪造 ACOS=0。基线利润<=0 时不使用百分比改善，报告绝对差和 INCONCLUSIVE（阈值型判断），实验仍可比较绝对利润差。

基线不足 7 日、目标不存在、必要费用缺失、观察日未完成均不判成功。退款延迟写入 maturity 标记；30 日结束时未成熟的订单负债单列，可加 7 日无新订单/无新决策的结算尾窗，三组相同，分别展示 30 日经营值与含尾窗结算值。

重评保留 evaluationVersion、前后结果和重评原因，不覆盖既有审计证据。

### 7.3 三组策略

| 组别 | 定义 |
|---|---|
| Control | 无诊断干预、无自动补货；同样执行环境预设的到货/退款等事件 |
| Rule | 每日检查过去 7 日；数据完整、点击>=100、广告销售>0 且 ACOS>0.5 时提议降 bid 10%，其他情况不动作；走同一 Policy 护栏 |
| CrossPilot | 现有 WF-05 及明确接入的 AI 策略；记录调用模型/提示词；输出动作仍走同一护栏 |

Rule 的 0.5 是合成基准参数，不是通用盈利阈值。若 CrossPilot 在该场景实际只走确定性规则，报告“CrossPilot 规则链路”，不能称为 LLM 策略增益。

### 7.4 样本与可复现工件

首批 10 个场景，每场景 10 个固定 Seed，三组配对，共 300 个 Run。Seed 列表固定为 1001～1010，调参使用 S01～S06；S07～S10 作为运行前锁定的留出集，不按结果修改模型或门槛。正式评测前所有 manifest 与评价规则保存 hash。

多 Seed 不构成真实市场代表性。每场景及合计报告：贡献利润绝对差/相对差、订单、缺货日、广告浪费、动作次数、违规数、人工介入率、LLM/执行成本、失败率；对 Seed 配对利润差输出均值、中位数、最差值及按 Seed 重采样的 95% bootstrap 区间。样本少要明示，不宣称统计充分。

跨场景聚合先按预先固定的等权权重计算每个 Seed 的配对差，再重采样，不能把所有天当独立样本。基线<=0 的百分比提升为 null。未完成 Run 保留失败原因和完成天数，不能只统计获利成功的运行；区分“已完成样本效果”和总体完成率。

重放工件至少含：commit、modelVersion、configHash、初始快照、场景/Seed、外部事件文件、命令/回执序列、模型响应记录、日期水位、各日 hash、经营明细摘要、评价规则版本。

## 8. 最小场景与验收矩阵

| ID | 注入/条件 | 必须验证，不要求必然获利 |
|---|---|---|
| S01 | 稳定需求、正常竞价 | 无必要时不动作；无干预组经营不凭空变化 |
| S02 | 竞争 CPC 上涨 | 费用从点击明细推导；降价可能降流量也可能改善利润 |
| S03 | 人工暂停广告 | 广告花费/流量为 0，自然流量保持；回读和补偿可追溯 |
| S04 | 需求上涨、计划到货延迟 | 库存不为负，lostSales/缺货日正确；不能自动生出采购到货 |
| S05 | 质量异常、延迟退货 | 售后来自原订单；诊断不能读取隐藏质量事件 |
| S06 | 执行超时、并发重复、重启 | 状态只生效一次，回执可恢复，不重复扣量/落账 |
| S07 | 高转化且降 bid 会损失更多贡献利润 | 能如实报告 NEGATIVE，并触发预定义护栏 |
| S08 | 自然需求回落与 CPC 上涨叠加 | 不把所有变化归因于单动作；前后观察与实验结论分开 |
| S09 | 无动作效果/目标被修改/审批过期 | 无效不算收益；版本冲突、过期审批不执行 |
| S10 | 广告零销售、利润缺失、观测延迟、两店相同 SKU | 零分母/缺失不伪装成功；不可读取其他工作区；未成熟窗口不判定 |

S06 的故障时间表固定，在三组中仅对实际执行的操作生效，报告暴露的故障机会数。S09 的“无效果”使用动作已改状态但流量处于饱和/不敏感区间的参数，不伪造写入成功。全部场景需规则断言，不能以 LLM 自评代替。

## 9. API 与 UI 契约

新增 API 均为拟实现，前缀 `/api/v1`；旧路由保持。

| 方法/路径 | 契约 |
|---|---|
| POST /simulator/runs | 输入 modelVersion/seed/scenarioId；创建专用工作区及 Run；201 返回 runId/runWorkspaceId/storeId |
| GET /simulator/runs/:id | 返回状态、日期、水位、版本、完整性；不得返回隐藏真值 |
| POST /simulator/runs/:id/advance | days 为整数 1～90，mode=manual/policy；202 返回持久化 jobId；每日日边界可暂停 |
| POST /simulator/runs/:id/pause | 停止下一个 Tick，200 返回当前 job/commit 水位 |
| POST /simulator/runs/:id/events | 仅实验控制权限，接受已定义事件类型、未来日期和范围；禁止修改已提交过去 |
| POST /simulator/experiments | scenarioIds/seedManifest/version；202 返回 experimentId 和三组任务；预算超额暂停而非静默省略 |
| GET /simulator/experiments/:id | 返回分组结果、完成率、失败与工件引用 |

Action 仍使用现有 action-layer 计划/审批/执行 API，扩展 target 绑定 Run。不得新增一个绕过审批的 `/world/actions` 直写入口。能力查询并入 Run/Store DTO，避免为两个动作建设通用控制平台。

事件接口为测试控制面，普通 Agent 工具清单不注册。GET state 中不暴露可泄题的 activeEvents 原因列表；开发者真值查看需要单独权限且有“评测真值”标记。

UI：复用中文状态映射，显示“模拟店铺 / 模拟日期 / 数据截至日期”；Operations Today 的重新诊断使用该 Run 最近完整窗口，不使用固定历史日期。执行结果与经营效果用两个字段展示，数据不全明确写“证据不足”。控制页只做运行、暂停、新建重复实验、事件注入、结果对照，不重复建设订单/利润后台。

## 10. 首版验收门槛

- 所有库存/预算/财务不变量以及隔离/幂等/审批测试 100% 通过。
- 相同记录动作重放的日输出 hash 一致；宿主机时间变化不改变模拟经营结果。
- 至少一次真实 Postgres 的 Action → Tick → WF-05 → Outcome 集成验收；仅 mock Prisma 不算落库闭环。
- Control/Rule/CrossPilot 三组工件齐全，10 场景×10 Seed 的完成与失败均记账；不以利润提升为必过条件。
- 7 日预热 + 30 日连续运行完成；出现 UNKNOWN 或不变量失败按设计停止，可恢复，不伪造完成。
- 旧 Simulator V1、旧 Mock Action、现有只读 Adapter 契约回归通过。
- 无真实店铺时，结论限定为“模拟模型下已验证”；官方沙箱/开发店铺的检查另列，不混入经营收益。
