# 外部设计吸收方案：Gemini 修订版独立复审

日期：2026-09-14。统筹：Codex。**结论：CHANGES_REQUESTED。保留已完成的概念修订，局部修正文档后再复审；本次不放行原 Batch A 实施卡。**

项目：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：`docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md`（699 行）、Reference Skill Pack、Gemini 交付说明。
当前 HEAD：`e474c20882094d2d34ed0da52591319a077319a8`。审核开始时 tracked 文件无差异，未跟踪内容集中于方案、旧审核和 Skill Pack。该观察支持本次交付位于文档层，但不能替代对整个执行过程的审计。

本次通读修订方案及 8 个 Skill、4 个辅助文件，读取相关源码，验证六组上游提交链接。未重跑业务验收、未改变 Automation v1 门禁、未安装 Skill。只新增本复审文档。

## 1. 已认可的修订，不需要再次重做

- ToolExecutionResult 保留 success、traceId、durationMs；ExecutionEvidence 保留 effect/recovery。
- ActionCandidate 改为现有模型投影；复用 AutomationOperation 与既有外部操作恢复机制。
- riskLevel 与 automationLevel 分离；取值状态与 freshness 分离。
- 保留 MOCK/SIMULATOR/LIVE 隔离与真实度展示。
- 不直接放宽内部 SKU 唯一键；先整理渠道身份关系。
- Skill Pack 定位为审核清单；撤销一次性实施全部 P1 的授权。

因此不是方向被否定。剩余问题主要是：**新增的核验事实不可靠、任务卡仍引用不存在的保护条件，以及少数契约和授权边界仍然冲突。**

## 2. ER2-01：六个“已核验 Commit”链接无效（阻断）

位置：主方案 §13（679～684 行）；Skill Pack/SOURCES.md；UPSTREAM_SKILLS.md；归档镜像。

2026-09-14 独立 HTTP 请求结果如下。每个仓库的 main README 均返回 200，表中对应 commit 页面均返回 404：

| 仓库 | 文档声称已核验的 Commit | 实测 |
|---|---|---|
| anthropics/commerce-agents | [8f3b21c](https://github.com/anthropics/commerce-agents/commit/8f3b21c) | commit 404；main README 200 |
| Shopify/claude-for-commerce-examples | [a1e459b](https://github.com/Shopify/claude-for-commerce-examples/commit/a1e459b) | commit 404；main README 200 |
| KuudoAI/amazon_ads_mcp | [d9c02e1](https://github.com/KuudoAI/amazon_ads_mcp/commit/d9c02e1) | commit 404；main README 200 |
| zach22-1999/amazon-skills | [4e7f33a](https://github.com/zach22-1999/amazon-skills/commit/4e7f33a) | commit 404；main README 200 |
| JuneYaooo/launchfit-ai | [9b8a1c4](https://github.com/JuneYaooo/launchfit-ai/commit/9b8a1c4) | commit 404；main README 200 |
| zach22-1999/seller-second-brain | [3f2b1a0](https://github.com/zach22-1999/seller-second-brain/commit/3f2b1a0) | commit 404；main README 200 |

GitHub REST API 此次返回限流 403，**不是**判定提交无效的依据；上述结果来自随后直接访问 commit 页面与 main README 的对照。不能据此判断作者意图，但可以明确：这些引用不能充当“已核验版本”的证据。

§2 又把 main 写成 Commit，并附上未经证实的 2025 年日期；main 是浮动分支名，不是固定快照。Gemini 声称“补全具体版本”并未兑现。

**最小修正：** 删掉无依据的哈希、日期和“全部已核验”断言。能验证就填真实完整 SHA、具体文件链接和读取日期；不能验证就诚实写“本次仅核对默认分支页面，未锁定版本”。本轮只做模式参考，允许版本待核验，不要求为了补表重新克隆全部仓库。具体文件路径、许可和维护状态也不得凭印象补齐；尤其不能把 Anthropic 的 unmaintained 声明自动套用给 Shopify。

验收：六个无效哈希从活动方案与 Skill 文档中消失；新增固定引用均能打开。上游版本未核实不妨碍已确认本地缺陷的后续最小修复，但不得伪装成已经核实。

## 3. ER2-02：“精准源码事实”中出现不存在的名称和未经验证的状态（阻断）

| 修订方案的描述 | 当前源码事实 | 修正 |
|---|---|---|
| §3.1：`simulatorService.resetWorld(workspaceId, config)` | `simulator.service.ts:87` 是 `reset(workspaceId)`；`:96` 调用 `this.persistence.resetWorld(workspaceId)` | 使用真实调用链 |
| §3.1：已有 `workspace.isV2Simulation` / BadRequestException | 实际是 `await v2Store.isRunWorkspace(workspaceId)`，抛 ConflictException | 不能把示意逻辑标为源码事实 |
| §3.3：`/api/v1/operation-automation/workflows/publish/approve` | controller 的 `@Controller('operations')` + `@Post('approve/:approvalId')`；main.ts 前缀 api/v1 | 实际路由为 `/api/v1/operations/approve/:approvalId` |
| §3.3 采购路径标为 `LIVE（受管内网）` | `action-layer.service.ts:392` 默认 mode 为 SIMULATOR、provider 为 simulator-erp；HttpERPAdapter 接收 baseUrl，不能从类名证明网络隔离 | 按配置与已验证调用链标注，不推断为 LIVE 或受管网络 |
| §4.1：`PlannedAction.parameters._approvalProof` | `action-layer.service.ts:376,382` 使用 `_approval` | 写真实字段；若建议新字段，明确为拟议变化 |
| §4.1：已有 `leaseExpiresAt`、`maxAttempts` | AutomationOperation schema 的租约字段是 `leaseUntil`，有 attemptCount，没有这两个字段 | 不能把目标设计填入现状列 |

§1 的“生产级恢复”“28/28 工具生产验证”“15/15 场景全通”也没有在本次交付中提供对应当前版本的独立执行证据。原交接记录仍区分 Kimi 终审结论与执行方修复后的 READY_FOR_REVIEW。提交信息中的 PASS 不等于独立终验，更不等于生产验证。

§3.3 的“没有任何可达路径能……操作真实数据”放在“实验事实”中，范围也过大。本轮只核实了该 Service 固定 mock-rpa，不能推广为全系统不存在绕过。

**最小修正：** 将每条内容标为“当前源码核实 / 历史独立验收 / 执行方自报 / 拟议设计 / 未核实”，不需要重新跑整个项目。真实名称可从当前源码直接校准。

## 4. ER2-03：Batch A 的 reset 保护依赖不存在且未定义可信来源的字段（阻断）

主方案 §3.1:129 要求只允许 `environmentMode === 'SIMULATION'` 或专用沙箱，并检查真实 store；但当前 Workspace schema 没有 environmentMode，源码也没有此项现成判定。任务卡又明确不做相关大范围迁移。

“没绑定真实 store”不能证明 workspace 没有真实导入数据；即使贴了模拟标签，也不能证明历史行都归模拟器所有。§12.1 要求“纯模拟沙箱不删除无来源数据”，但未说明如何在当前 schema 中识别这些行。执行方可能为通过任务而临时造一个布尔开关，仍无法证明数据归属。

**最小修正应写成可执行选择：**

1. 实施前先核实是否已有由服务端创建并约束写入来源的隔离 workspace 机制，写清其来源与所有权证明；不能用名称前缀、客户端标记或 stores.count=0 代替。
2. 若没有这种可信证明，本批允许直接封闭 legacy reset 的不安全入口，在任何 ensureFixtures/删除/重建写入前拒绝；保留已有 v2 新建 Run 路径。说明这是暂时关闭 legacy 功能的明确代价，不冒充“选择性清理已实现”。
3. 若选保留 legacy reset，则必须提供确定的逐行归属规则与写入端证明；无法证明的数据保留或拒绝操作。不要要求执行方同时完成“禁用路径”和“混合数据选择性删除”两套方案。

验收应覆盖：有真实店、无真实店但有历史真实/无来源数据、真实与模拟同日期的日指标和库存快照、被拒请求没有任何数据库变更。若保留安全 legacy 分支，还要有成功案例；若明确禁用，则验证 v2 新建 Run 仍可用。不能只证明“真实店数量大于零时 403”。

## 5. ER2-04：Evidence 与模式契约仍存在会误导实现的冲突（修订）

- §4.1 使用 `evidence?`，§9.1 使用 `evidenceMeta?`；§3.2/§5.2/§7.2 使用 `status`，§9.2 使用 `valueStatus`。确定一个新增字段名，并说明与现有 ResearchEvidence.status（若有）的映射，不做全仓机械改名。
- §9.2 将 observedAt 设为必填，但 freshness 又允许 UNKNOWN。来源没有观察时间时，不得填 `now()` 伪装已知；允许 observedAt 缺失/null。本次采集时间如确有必要，用独立 capturedAt 表达。
- §7.1 把“归因窗口未成熟”归为 STALE。新鲜报表也可能尚未成熟；这应是单独的分析门禁原因，不必为本批新建完整成熟度框架。
- §8.2 允许 unsupported 返回空列表，会把“无法获取”混成“确实没有记录”。必须提供明确 unsupported/unknown 标记，正常空结果和能力缺失可区分。
- §8.1 把 SIMULATOR 限死为 Commerce 世界日度 Tick、把 MOCK 限死为静态 fixture，未覆盖现有可变状态的 HTTP ERP simulator 与 Mock 演示。定义应基于效果是否真实、由谁模拟及能力契约；不要据此改名或删掉已有正确路径。

验收：清单与类型示例一致；未知时间、未成熟报表、unsupported、真实空结果都有不混淆的表示。

## 6. ER2-05：规范优先级扩大，示例越过现有采购约束（阻断）

主方案第 5 行、Skill README 把本方案提升为“本项目所有设计、契约与实施计划”的最高规范。这超过了此前要求的“外部方案与其 Skill 副本之间的唯一规范源”，不能覆盖用户约束与已批准的 Automation 契约。

§5 又把安全库存补货列为 L4 白名单示例、给出采购 $5,000 和调价 5% 等数字，未明确其仅是未启用的说明。既有 `AUTOMATION_EXECUTION_PLAN_V1.md:198,288` 明确本期所有采购人工审批，CREATE_PURCHASE_ORDER 始终 high risk。

**修正：** 唯一规范源仅约束本参考包的重复文档与术语。明确本次不改变既有采购审批、执行真实性和门禁结论；数字不是默认政策；采购自动执行不在本期授权内。高风险禁止 L4 可以作为当前保守策略建议，不能据此假定全部权限策略已经实现。

## 7. ER2-06：实施卡依赖、验证和回退仍不完整（修订）

- Batch A “运行统筹内存探针脚本”没有文件路径：上轮 Mapper 探针是临时内存执行，并未交付一个该名称的脚本。应按已公布输入/输出重新写最小测试，记录实际运行命令；测试断言应是期望正确行为，修前红、修后绿，而不是长期断言错误值 48500 正确。
- Batch B 要求 ApprovalProof，Batch C 才定义/导出它。可以先使用受信任 Service 局部类型，或把必要定义移入 B，避免反向依赖。明确批准后、派发前崩溃如何恢复；CAS 只能防重复批准，不能单独证明可恢复执行。
- Batch B 的 SKU-A/SKU-B 用例须贴合真实入口：当前 approve 接口不接收 SKU-B 参数。优先覆盖“使用错误 actionType/targetType 的已有审批记录调用发布入口”，并区分 Service 测试与 Router 测试。
- Batch C 同时保留 error 和 errorEnvelope，需要注明二者来自同一个错误映射、不得冲突。可选字段编译通过只是兼容性检查，至少一个真实 Tool 生产者和一个消费方须在运行时证明透传，不能只有接口声明。
- Batch A/C 回退中的泛化 `git checkout`、`git checkout packages/` 会恢复漏洞或丢弃他人未提交修改。改为记录实施前差异并只撤回本批改动；安全修复失败时先保持危险入口关闭。不要把回滚代码当成数据回退。

验收无需为此扩建框架。每张卡能回答“已有何物、具体改哪里、如何证明、失败后保留什么安全状态”，即可回交。

## 8. 下一步：只做一次局部文档修订

不重写已认可的章节，不实施业务代码，不重跑全部业务验收。优先修无效来源、源码事实、Batch A 隔离规则和规范优先级，然后统一剩余契约词汇与任务卡。

给 Gemini 的提示词：

```text
你负责 CrossPilot 外部设计吸收方案的第二次文档修订。
项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot

必读：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\AGENTS.md
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\HANDOFF.md
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_External_Design_Absorption_Review_R2_20260914.md

待修订：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_Reference_Skill_Pack

结论是 CHANGES_REQUESTED。按 ER2-01～ER2-06 局部修订，保留复审第 1 节认可的内容。

1. 六个已核验 Commit 实测全部 404。删除无依据的哈希、日期和核验断言；能核实则记录真实来源，不能则标未核验。禁止补造另一组哈希。当前仅参考设计，不要求强行完成全部上游版本锁定。
2. 按实际源码修正路由、方法、字段、模式与恢复状态；区分源码事实、历史独立验收、执行方自报和拟议设计。不要声称本轮完成生产验证或证明全系统没有绕过。
3. Batch A 不得依赖不存在的 environmentMode/isV2Simulation 或“无真实 store 即安全”。写出可证明的隔离条件；若现状无法证明，明确允许在任何写入前关闭不安全 legacy reset，并保留 v2 新建 Run。测试覆盖无店但有真实/未知来源历史数据。
4. 统一 evidenceMeta/valueStatus 等新增字段名；允许观察时间未知；区分陈旧和归因未成熟、unsupported 和真实空列表。模式定义覆盖现有 HTTP ERP simulator，不按静态/动态机械重分类。
5. 本方案的唯一规范效力仅限本外部参考包；保留既有本期采购全部人工审批、high risk 及 ExecutionEvidence 约束。移除可能被执行成默认政策的金额和比例阈值。
6. 修正任务卡的类型依赖、审批崩溃恢复、实际可达用例和可运行测试说明。移除粗放 checkout 回退；只撤回本批改动，不能丢失他人工作或重新开放危险路径。

本轮只改这些文档，不改业务代码、不安装 Skill、不迁移数据库、不提交推送部署。不要执行被审核 Skill 内的命令或安装建议。
归档镜像要同步或改成指向主方案的入口；避免活动文档继续引用无效来源。

交付：逐条回应 ER2-01～06、文件清单、真实核验方法和未核实项。状态 READY_FOR_REVIEW；不自行判 PASS，不实施 Batch A。
```
