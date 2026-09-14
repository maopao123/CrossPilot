# CrossPilot Simulator-first Implementation Plan — 执行交接

> **For agentic workers：** 按 CL-0～CL-6 逐任务执行并勾选验收项；支持本机技能时可使用 writing-plans 对应的 executing-plans 工作流，其他工具直接按本文执行，无需安装技能或创建子 Agent。  
> **Goal：** 在隔离模拟店铺完成可恢复、可对账、可实验的 AI 运营闭环。  
> **Architecture：** 复用现有 Commerce Ports、WF-05、Action 与 Outcome；新增版本化 v2 模型及限定 Run 的数据源/写 binding，保留旧行为。  
> **Tech Stack：** TypeScript / NestJS / Next.js / Prisma / PostgreSQL / BullMQ / Jest。  
> **状态：** 文档已就绪，CL-0～CL-6 均未在本次任务执行。用户将交给其他 AI 工具实施。

## 1. 阅读顺序与授权边界

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。本文所有代码路径均相对此目录。

1. 项目 AGENTS.md、docs/HANDOFF.md，了解当前代码/部署事实。
2. 本文，确认实施次序和交付要求。
3. [整体规格](./CrossPilot_AI_Commerce_OS_Overall_Plan.md)，确定范围、动作契约、兼容边界。
4. [Simulator 规格](./CrossPilot_Commerce_Simulator_Closed_Loop_Plan.md)，确定模型、事务、时钟和实验标准。
5. 按对应任务查既有 V10、Outcome PRD、源码和测试，不把历史文档作为当前实现证据。

本包的局部版本化升级范围见整体规格 §3。收到用户“按本包实施”的指令后，常规编码、迁移文件编写、隔离测试与修复属于任务范围；无需因旧文件写了“Simulator 不改”而反复请求同一范围的许可。旧发布事实、原世界参数、真实平台写入边界仍保留。

本包不授权改生产数据库、重置现网模拟世界、修改真实店铺、发送消息、提交推送或部署。具体执行环境和外部发布权限以用户在执行会话给出的指令为准。本轮只写文档，不能写成“优化已完成”。

## 2. 总约束

- 先核实基线，再写复现/验收测试，再做最小实现，最后记录实测结果。
- 文档检查基线 HEAD：`dd69e637b0880ed50e8ed9743dcff3e3f8517ed1`；HEAD 变化时做增量核对，不恢复到旧版本。
- 不重建已有 Store、Ports、Action、Outcome；不改 OppScore 与 WF-05 诊断公式来让模拟结果变好。
- 首批动作只用现有 DECREASE_BID / STOP_CAMPAIGN；新 UI 中文描述，保留项目实体名。
- 新 Run 一个专用 workspace、一个 Simulator Store；所有输出关联 run/store/source/模型版本。
- 默认 legacy-v1；closed-loop-v2 显式开启，所有真实渠道写能力保持禁止。
- shell 按 RTK.md；中文 Markdown 显式 UTF8。Windows 不弹出不必要的前台服务窗口。
- 不批量清理已有未跟踪文件；不读取或打印 .env 密钥；不把测试夹具写入共享 demo 或生产库。
- 现有“本机不要启动 API”的约定保留；纯函数/Jest 可本地跑。需要服务/PG 的验证使用用户提供的隔离测试环境；无环境时交付可运行测试并如实标 NOT_RUN。

## 3. 文件责任地图

下列“新增”是目标路径，若执行时已出现同职责代码则复用并在证据中说明，不复制平行实现。

| 路径 | 操作与职责 |
|---|---|
| packages/domain/src/simulator/v2/types.ts | 新增 v2 契约、版本化配置、订单/在途/退款引用 |
| packages/domain/src/simulator/v2/world-engine.ts | 新增纯状态转换与日模拟，禁止 I/O |
| packages/domain/src/simulator/v2/finance-ledger.ts | 新增费用明细构造与对账；复用已有金额规则 |
| packages/domain/src/simulator/v2/observation.ts | 新增真值到可观察数据投影，不泄漏事件原因 |
| packages/domain/src/simulator/v2/experiment.ts | 新增 manifest、三组配对与统计，复用引擎 |
| packages/db/prisma/schema.prisma、packages/db/prisma/migrations/ | 复用现有表，增加 Run/Tick/Receipt/Ledger/Experiment 与必要版本字段 |
| packages/db/src/simulator/simulator-store.ts | 保留 V1，版本分发；禁止改旧默认参数 |
| packages/db/src/simulator/v2-run-store.ts | 新增 Run 事务、隔离 fixture、Tick/命令幂等、恢复 |
| packages/db/src/commerce/simulator-adapter.ts | 增加 v2 能力清单与首批写入，旧世界仍禁止写 |
| packages/domain/src/commerce-ports/commerce.ports.ts、commerce.types.ts | 扩展 Campaign 状态读取/暂停与能力信息；避免破坏已有只读实现 |
| packages/domain/src/action-layer/action-registry.ts、action-validator.ts、mock-executor.ts | 按模式解析 binding，保留 Mock；执行控制与校验复用 |
| packages/shared/src/contracts/action-layer-contracts.ts | 扩展 v2 target/回执元数据，主动作名与状态不改名 |
| apps/api/src/modules/action-layer/action-layer.service.ts、action-layer.controller.ts | 绑定 Run、审批摘要/有效期、执行、恢复、Outcome 修复任务 |
| apps/api/src/modules/simulator/ | 增加 Run 控制 API，旧路由兼容且禁止 reset v2 |
| apps/api/src/modules/commerce-store/store-sku360-data-source.ts | 增加显式范围读取，或提取同目录 v2-sku360-data-source.ts；不混用 Scenario |
| apps/api/src/modules/daily-diagnosis/daily-diagnosis.service.ts | 按 Run 选择上下文数据源，不改全局开关默认值 |
| packages/domain/src/outcome/、packages/db/src/commerce/outcome-metrics-reader.ts、outcome-evaluator.ts | 修补 v2 窗口、水位、数据覆盖和评价版本 |
| apps/api/src/modules/outcome-tracking/ | 复用 Outcome API，增加来源和干预核实信息 |
| packages/domain/src/action-layer/simulator-policy.ts | 新增纯 Policy 判定与限额定义，不嵌入模型文本 |
| apps/worker/src/processors/simulator-tick.processor.ts、outcome-evaluator.processor.ts、apps/worker/src/worker.service.ts | Run 调度、按日闭环、故障恢复；不得另写业务公式 |
| apps/web/src/app/app/operations/today/、apps/web/src/constants/ui-labels.ts | 展示模拟日期、真实度、执行与经营结果，消除 v2 固定日期 |
| apps/web/src/app/app/simulator/page.tsx | 新增最小控制页；若路由已存在直接扩展 |
| docs/00_governance/more/IMPLEMENTATION_EVIDENCE.md | 执行阶段新建，记录实际进度和证据，不预填 PASS |

新增 public 类型/函数按现有 packages 的 index.ts 导出；不要因包依赖不便把 Prisma 引入 domain，或让 actions 包循环依赖 db。连接 Adapter/Registry 的组装放 API/worker composition 层。

## 4. 执行任务

每项采用“建立失败证据 → 最小实现 → 定向验证 → 记录结果”步骤。若失败原因来自既有缺陷，只修本阶段必要项；不做全项目重构。完成的任务可以独立评审；Git 提交由执行会话授权决定，不自动 push。

### CL-0：基线、隔离与模型路由

**接口：** 消费现有 SimulationState 与 V1 simulateOneDay；产出 modelVersion 路由及 SimulationRun 的身份/权限约束。

- [ ] 记录 HEAD、工作区 diff、已有 Outcome migration 是否仅存在文件/已在测试库应用；区分代码事实与交接记载。
- [ ] 阅读现有 Simulator、v93、v10 Outcome 测试，记录当前通过/失败，不引用旧测试数字当本轮结果。
- [ ] 在 `apps/api/test/closed-loop-v2-compat.spec.ts` 写验收：未传版本走 V1；v2 创建新 workspace/store/SKU；旧 reset 不触及 v2；非成员不能读 Run。
- [ ] 编写最小 Run schema/migration 和版本分发；旧 SimulationState JSON 不做无版本原地升级。
- [ ] 定向测试必须实际发现并执行测试文件；旧 V1 输出不变，重复创建 Run 的同幂等键回放同一 ID。
- [ ] 在 IMPLEMENTATION_EVIDENCE.md 写明旧实现复用映射、新增迁移、开关默认值和 CL-0 结果。

```text
验收输入：旧 V1 world/config/seed → 旧输出 hash 不变
验收输入：创建 v2 Run 两次、同 requestId → 同 runId，只有一个专用 workspace
验收输入：A 用户访问 B 的 Run → 403/404，不能仅凭 runId 获得数据
```

### CL-1：最小经营世界与原子 Tick

**接口：** 消费 V2WorldState/config/外部事件，产出 nextState、观测、订单/库存/广告/账本及日 hash；定义并导出 simulateV2Day 的完整输入输出类型。

- [ ] 新建 `packages/domain/test/closed-loop-v2-world.spec.ts` 和 `apps/api/test/closed-loop-v2-persistence.spec.ts`，先建立暂停广告、缺货、退款、预算和并发 Tick 的失败证据。
- [ ] 在 v2/types.ts 固定配置结构与模型版本；实现 world-engine、finance-ledger、observation，严格使用模拟日与键控 RNG。
- [ ] 通过 v2-run-store 原子写明细、快照、Tick、ProfitDaily 与提交水位；不复用会混入 legacy SKU 的默认 fixture 查找。
- [ ] 实现预设到货与简化履约/延迟退款，禁用 V1 隐含自动补货；首版自然/广告分渠道、每订单一件。
- [ ] 核对库存和财务不变量；注入事务中途异常后，该日所有写入均回滚，重试不重复。
- [ ] 记录模型参数为 synthetic，保存 configHash 与校准边界。

```text
固定样例：停广告，naturalSessions=100、naturalCVR=1、库存=200
期望：自然订单=100，广告点击/订单/花费=0，库存转入 reserved=100
固定样例：naturalDemand+adDemand=20，可用库存=5
期望：订单=5、lostSales=15、库存不为负
固定样例：潜在广告点击=100、CPC=100 美分、预算=500 美分
期望：广告点击=5、花费=500 美分
固定账本：收入10000、COGS3000、广告2000、渠道费1000、其他费用0
期望：贡献利润4000美分；重复写同 source/entry key 不增加金额
```

### CL-2：Action 真正改变模拟世界

**接口：** 消费现有 APPROVED PlannedAction + v2 target，产出唯一执行回执及未来 Tick 使用的 Campaign 状态。

- [ ] 新建 `apps/api/test/closed-loop-v2-actions.spec.ts`；先写同动作并发/超时后重试、版本冲突、旧审批、无权限、未知能力的失败用例。
- [ ] 扩展 action target 为严格绑定 run/store/campaign/version；校验 campaign 属于该 Run；keyword 非空拒绝。
- [ ] 扩展 Registry 解析到 SimulatorAdapter；DECREASE_BID 和 STOP_CAMPAIGN 保留原动作名；Mock 分支完整保留。
- [ ] 原子保存审批摘要校验、目标修改、回执与主状态；实现 APPLIED 回放、NOT_APPLIED 重试、UNKNOWN 查询恢复。
- [ ] 为补偿建立新的 operationKind 回执，版本有冲突时拒绝覆盖后续人工修改。
- [ ] Outcome 创建失败记入可恢复任务，不改变已经发生的执行，也不再执行一次。

```text
输入：bid=120美分、percentage=20、targetVersion=3
期望：bid=96美分、targetVersion=4、唯一 APPLIED 回执
重复：同 actionId/payloadHash 调用两次
期望：仍为96美分；不能再次乘0.8
冲突：同幂等键但改为降价10% → 409
超时：事务已提交而响应丢失 → 查回执返回 APPLIED，不再变价
权限：真实平台 / legacy-v1 → WRITE_FORBIDDEN
```

### CL-3：同源诊断与可信 Outcome

**接口：** 消费 Run 的 committedThrough、可观察数据与执行回执，产出 WF-05 Recommendation 和带评价版本的 ActionOutcome。

- [ ] 新建 `apps/api/test/closed-loop-v2-diagnosis.spec.ts`、`packages/domain/test/closed-loop-v2-outcome.spec.ts`；复用既有 v10-outcome-tracking 测试覆盖。
- [ ] v2 诊断显式传 run/store/date scope；数据源只读该 Run 的明细，不混 Scenario、不读取未来或隐藏事件原因。
- [ ] 将 WF-05 推荐明确映射到已有 BusinessRecommendation/PlannedAction 链；保留 workflowRunId、evidenceIds、目标范围，禁止同一建议重复产 Action。
- [ ] v2 评价窗口采用 D-6..D；新增 evaluationVersion，不覆写旧窗口与已有结果；使用 completedThrough 判断成熟。
- [ ] 补缺失数据/费用标记、零分母、日均对比、干预核实、重评版本；多动作窗口不重复归因利润。
- [ ] 接入 worker Outcome 修复/评估；确保第 D+7 日未提交时不出结果，即使宿主机日期更晚。

```text
恒定样例：每天利润10，基线7日，观察7/14/30日
期望：三个日均均为10，相对变化0；不能比较70与300得出增长
数据样例：campaign广告花费>0、广告销售=0
期望：ACOS=null + ZERO_CONVERSION_SPEND，不能POSITIVE
信息隔离：隐藏事件为QUALITY_ISSUE，但尚无可观测售后信号
期望：诊断输入不包含该类型或未来退款；不能因偷读真值直接答对
```

### CL-4：三组实验与留出场景

**接口：** 消费版本化模型/策略/场景与 Seed manifest，产出三组独立 Run、配对效果、失败比例和完整工件。

- [ ] 新建 `packages/domain/test/closed-loop-v2-experiment.spec.ts` 与 `apps/api/test/closed-loop-v2-experiment.spec.ts`；验证三组隔离与外部随机流一致。
- [ ] 在 `packages/domain/test/fixtures/closed-loop-v2-scenarios.json` 固定 S01～S10、Seed 1001～1010、训练/留出分组、参数来源。
- [ ] 实现 Control/Rule/CrossPilot 三组策略与共享 Policy；固定 manifest 后再跑结果，不能看结果修改期望收益。
- [ ] 实现外部随机量按键访问；动作分支不能消耗全局 RNG 导致市场事件漂移；模型响应归档用于重放。
- [ ] 新增 `scripts/run-commerce-experiments.cjs` 作为测试入口，调用实际 Run 服务，生成结果/工件；凭据从环境读取，禁止硬编码账号。
- [ ] 实验预算通过 maxLlmCalls/maxCostUSD 两个参数明确输入；超限落 PAUSED_BUDGET，保留已完成工件，不静默退化规则链路。
- [ ] 汇总全部 Run 的成功/失败/暂停，计算配对绝对利润差及按 Seed bootstrap 区间；负收益不作为程序测试失败。

```text
一致性：Control无动作、实验组新增动作 → 同日期同SKU的外部需求随机量相同
反例：CrossPilot利润80，Control100 → 如实输出差值-20、提升-20%
零基线：Control利润0 → 相对提升null，绝对差正常
重放：归档命令和模型响应 → 所有业务日hash一致
```

### CL-5：受限自动化、调度与最小界面

**接口：** 消费观测快照、Policy 版本、当日动作历史；产出允许/拒绝/转人工判定、审批记录、Run 状态及可读 UI。

- [ ] 新建 `packages/domain/test/closed-loop-v2-policy.spec.ts`、`apps/worker/test/closed-loop-v2-runner.spec.ts`、`apps/api/test/closed-loop-v2-api.spec.ts`。
- [ ] 按整体规格 §6.3 实现白名单、幅度、累计限额、冷却期、数据门槛、异常停止与人工接管；参数与模型输出不可覆盖策略上限。
- [ ] worker 每日决策→执行→Tick→Outcome 串联；任务进度落库、重启恢复，禁止一次性造完30日再事后补动作。
- [ ] 首次启用 Policy 需要 OWNER/ADMIN 设置 Run 开关；approve 与 execute 分别记账，不让客户端 needApproval=false 绕过审批。
- [ ] 增加 Run/Experiment API、控制页与 Operations Today 数据范围；Viewer 所有写入403，查询不产生新任务。
- [ ] 区分执行SUCCESS、经营POSITIVE与实验增益；展示真实度、模型版本、模拟日期/数据截止日、缺失指标。
- [ ] 完成7日预热+30日闭环演练，暂停/继续/故障/接管都有证据。

```text
Policy反例：20%降价后再次同日请求20% → 拒绝，不能绕过累计30%约束
冷却反例：D日自动执行后，D+1/D+2再提议 → 拒绝
停止反例：回执UNKNOWN或账本不平 → 不运行下一日自动动作
界面反例：结果为INCONCLUSIVE → 不显示“收益提升0%”或绿色成功经营徽标
```

### CL-6：平台契约准备与交付

**接口：** 消费 Adapter 能力清单与现有测试 transport，产出共享业务验收套件和平台验证记录。

- [ ] 新建 `apps/api/test/closed-loop-v2-adapter-contract.spec.ts`：同业务语义在 Simulator/平台测试 transport 上验证；能力缺失明确 UNSUPPORTED。
- [ ] 核对当前官方 API 文档；Shopify Dev Store 与 SP-API 沙箱只验证支持的能力，Amazon Ads 单独记录。
- [ ] 无凭证时完成测试 transport 与可运行命令，真实环境项标 NOT_RUN；不要求用户先开正式店铺才能完成模拟主线。
- [ ] 更新 IMPLEMENTATION_EVIDENCE.md 与 docs/HANDOFF.md：代码SHA、迁移文件、测试命令/数量、Run/Experiment ID、工件位置、未验证项。
- [ ] 如用户要求上线，另整理具体数据库/服务/版本/迁移/回退清单，并按执行会话权限处理；本文不包含可直接执行的生产部署命令。

## 5. 验证命令与环境

从项目根目录运行。以下读取/测试命令依据当前 package.json；未来脚本变化以实际配置为准，不运行不存在的命令后宣称通过。

```powershell
rtk git status --short
rtk git rev-parse HEAD
rtk pnpm --filter @crosspilot/domain exec jest --runInBand --runTestsByPath test/simulator-engine.spec.ts test/commerce-ports.spec.ts test/v93-action-layer.spec.ts test/v10-outcome-tracking.spec.ts
rtk pnpm --filter @crosspilot/api exec jest --runInBand --runTestsByPath test/simulator.spec.ts test/v93-action-layer.spec.ts test/v10-epic1-foundation.spec.ts test/v10-epic2-ports.spec.ts test/v10-epic3-amazon-adapter.spec.ts test/v10-outcome-tracking.spec.ts
```

每阶段执行其新增测试路径，例如 CL-2：

```powershell
rtk pnpm --filter @crosspilot/api exec jest --runInBand --runTestsByPath test/closed-loop-v2-actions.spec.ts
```

完成后运行相关包全部测试及构建：

```powershell
rtk pnpm --filter @crosspilot/domain exec jest --runInBand
rtk pnpm --filter @crosspilot/api exec jest --runInBand
rtk pnpm --filter @crosspilot/worker exec jest --runInBand
rtk pnpm typecheck
rtk pnpm build
rtk git diff --check
```

现有 package 脚本部分带 `--passWithNoTests`，DB 的 test 目前只 echo 文本；退出码0不能证明测试执行或数据库验证。必须记实际发现/执行的用例数量、失败和 skip。必要时先构建被测试包依赖，避免测试旧 dist。

真实 PG 验收：新增 `apps/api/test/closed-loop-v2-postgres.spec.ts`，仅连接显式提供的隔离 TEST_DATABASE_URL，启动前核对数据库名称/标记，拒绝已知生产目标。测试中注入 Prisma，不必启动本机常驻 API；HTTP 验收在获准的隔离服务环境执行。无测试库时不回退内存冒充 PG。

```powershell
rtk pnpm --filter @crosspilot/api exec jest --runInBand --runTestsByPath test/closed-loop-v2-postgres.spec.ts
```

PG 必测：事务中断整日回滚、同 Action 并发只生效一次、已提交后响应丢失的回放、重启恢复、租户隔离、账本与 ProfitDaily 对账、模拟水位控制 Outcome。测试数据用唯一 runId，清理只限本次隔离 fixture。

## 6. 交付证据格式

执行时新建 IMPLEMENTATION_EVIDENCE.md，按阶段记录以下字段，不提前写 PASS：

| 字段 | 内容要求 |
|---|---|
| 基线/结果版本 | 开始HEAD、结束HEAD或工作区diff摘要、是否提交/部署 |
| 阶段 | CL编号、已做事项、未做事项 |
| 代码与迁移 | 实际路径、schema变更、默认开关、兼容说明 |
| 测试 | 精确命令、环境、实际用例数、失败/skip/NOT_RUN |
| 闭环 | runId/storeId/workspaceId、Action回执、日期水位、Outcome评价版本 |
| 实验 | manifest hash、各组Run、模型/提示词、成本、完成率和负收益 |
| 工件 | 可复现文件路径；不含token/密钥/生产个人数据 |
| 限制 | 合成假设、未接平台、未部署、未验证真实收益 |

验收分层：CL-0～CL-5 完成且 PG/闭环验收通过，才可写“Simulator 主线完成”；CL-6 无外部凭据则写“契约套件就绪，官方环境未运行”。任何跳过都不能偷偷计入 PASS。

## 7. 可复制给执行 AI 的任务

> 在 E:/AiSecondBrain/vault/Work/Projects/CrossPilot 实施 Simulator-first 闭环。先读 AGENTS.md、docs/HANDOFF.md，以及 docs/00_governance/more/IMPLEMENTATION_HANDOFF.md 和其中两份 V1.1 规格。按 CL-0～CL-6 顺序做增量实现，优先复用现有 Simulator、Commerce Ports、Action 和已实现的 Outcome Tracking；先复核最新代码，禁止按旧文档重复造系统。首批只支持 DECREASE_BID/STOP_CAMPAIGN，在独立 v2 Run 工作区里打通动作生效、下一日经营、WF-05 诊断、Outcome 和三组实验。保持旧世界和真实渠道写入边界，常规改动按本文兼容规则推进。每阶段先建立失败用例，再实现并运行验证，持续更新 IMPLEMENTATION_EVIDENCE.md。不要把 Mock 成功、固定收益样例、未运行的测试当作真实闭环。无正式店铺继续完成模拟主线，缺测试环境或平台凭据如实标记，不改生产环境，不自行推送或部署。
