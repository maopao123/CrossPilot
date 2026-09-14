# CrossPilot 外部设计吸收方案独立审核

日期：2026-09-14。审核角色：Codex 统筹。范围：方案、Reference Skill Pack、Kimi 意见、相关当前源码与上游公开资料。

**结论：设计方向认可；实施方案需要修订后再分批执行。不同意将问题全部视为“不影响实施的批注”。** 可以立即组织已证实缺陷的最小修复；不要直接使用原 §12.3 一次性实施全部 P1。

本次只新增审核文档，未修改业务代码、安装 Skill、运行外部写操作或改变 G1/G2/G3 门禁。

## 1. 审核基线与证据边界

- 项目：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
- 审核时 HEAD：`e474c20`；前一提交为 `c413076`（AI Automation v1），再前为 `be4b8f6`。当前已经不能沿用“全部修改尚未提交、基线 be4b8f6”的旧描述。
- 原方案：`docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md`，SHA256：`cb9516421ff11b038691522984353d065a1f7fd4657517034e76fcf7773603b2`。
- 通读方案、Skill Pack 的 8 个 SKILL.md 和 4 个辅助文件；包中另有一份与外部方案逐字节一致的副本，共 13 个文件。未展开 zip。
- 打开 SOURCES.md 所列 12 个仓库页面；重点核对 Anthropic safety、Shopify merchant、Zach Skill Creator、Nexscope dynamic pricing 等原文。核实公开描述不等于运行验证这些项目，更不等于证明 CrossPilot 已具备其能力。
- 阅读当前交接与 Kimi 终审记录：其中 G1 已被判 PASS，G2/G3 修复后自报 READY_FOR_REVIEW。本轮没有重跑该验收矩阵，不能用本次方案审核代替最终复验。
- 独立执行 XYDC Mapper 的两个内存探针：转译当前源码，分别传缺失指标和全零指标；不调用数据库或远端。两者都得到固定数值且 mode=LIVE，详见 §3。

## 2. 值得保留的设计，以及上游证据的边界

以下方向与项目吻合：确定性 Workflow；模型只提出候选；Host 审批；执行前再次检查；缺失值诚实传播；模拟与真实数据共用业务契约；先完善恢复，再考虑复杂 Stage/Memory。

| 来源 | 核实结果与吸收边界 |
|---|---|
| [Anthropic commerce-agents](https://github.com/anthropics/commerce-agents) / [safety](https://github.com/anthropics/commerce-agents/blob/main/docs/safety.md) | provenance、staging、apply 再检查、Host 审批属实。但 README 明确其为不维护的参考实现；认证、授权及业务规则由部署方补齐。不能把示例门禁当作完整生产授权系统。 |
| [Shopify merchant](https://github.com/Shopify/claude-for-commerce-examples/tree/main/merchant) | 本地替身共用 backend 和 stage/approve/apply 路径属实。它建立在 Anthropic 蓝图之上，应注明继承关系；两者不是两个独立实践的相互验证。本地通过也不能证明真实平台契约通过。 |
| [Kangise](https://github.com/kangise/ecommerce-ai-skills) | 知识/契约/技能/运行时、持久证据、审批和恢复等公开描述存在。适合借鉴约束与测试方法；本轮未运行其 CI。 |
| [Kuudo](https://github.com/KuudoAI/amazon_ads_mcp) | 用错误结果提供纠正信息的设计属实。须区分“改参数重新尝试”和“原写请求可以安全重发”。 |
| [Zach Skill Creator](https://github.com/zach22-1999/amazon-skills/tree/main/skills/zach-seller-skill-creator) | 业务流程、基线和评估方法值得参考。安装作者 Skill 不会自动完成 CrossPilot 的 Tool/Workflow 接线。 |
| [Nexscope dynamic pricing](https://github.com/nexscope-ai/eCommerce-Skills/tree/main/dynamic-pricing-ecommerce) | 护栏、模拟、人工审核与回滚设计可供参考；具体阈值和自动化权限必须由 CrossPilot 自己确定。 |
| [Sorftime](https://github.com/DannylydST/sorftime-seller-agent) / [跨境研究 Agent](https://github.com/real-world-agents/cross-border-e-commerce) | advisory 风险、独立复核、多源佐证和 Data Gaps 的描述可核实。研究警告的 advisory 不能迁移成权限与隔离边界的 advisory；多个转载来源也不构成独立证据。 |
| [Lingxing MCP](https://github.com/zach22-1999/lingxing-mcp) | 当前 README 标 MIT、只读 ERP 接入。可以补充原方案许可证待核实项；它不能提供采购写入能力的证明。 |
| [LaunchFit](https://github.com/JuneYaooo/launchfit-ai) / [Seller Second Brain](https://github.com/zach22-1999/seller-second-brain) / [Starsky 发布仓](https://github.com/wenjiany312-hub/starsky-amazon-codex-releases) | 前两者公开许可分别含 Noncommercial / NC；Starsky 是需授权的公开发布仓。不要将所有公开仓库统称为可直接商用复用的开源代码。保留方法参考定位，具体复制需核实具体文件许可。 |

## 3. 当前缺陷：两项证实，一项需要重新界定

### R1：模拟器隔离修复不能只看一条删除

`packages/db/src/simulator/simulator-store.ts:438`：

```ts
this.prisma.channelDailyMetric.deleteMany({ where: { workspaceId } })
```

可达链路：`simulator.controller.ts:146` 的 reset → `simulator.service.ts:87` → `resetWorld`。Service 拒绝 v2 run workspace，却未在这里证明普通 workspace 只含模拟数据。

**源码证实同 workspace 的日指标会进入删除范围；本轮未对真实数据库执行删除，也未断言当前库已有受影响数据。** 同一事务 `:441` 的 InventorySnapshot 只按 workspace 和日期删除，同样不能证明数据来自模拟器。Campaign 依赖名称前缀也应在此局部审查中检查。

最小修复可以是禁止对无法证明隔离的 workspace 执行 legacy reset；不必为了修此漏洞先迁移六张业务表。若保留混合 workspace，则必须拥有可验证的数据所有权标识，不能只加一个无人写入的 source 字段。

验收：隔离测试库放入同 workspace、同日期的真实和模拟日指标及库存快照，再 reset；真实行保持不变。无来源的历史数据不能凭日期或店名推定为模拟数据。

### R2：XYDC 不仅伪造缺失值，还覆盖真实零值

`packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts:148` 的 `toMarketOverview` 被 `xydc.provider.ts:185` 的 `market.market.overview` 分支以 LIVE 调用。

本轮执行当前源码的结果：

| 输入 | 月搜索量 | 平均价格 | 平均评分 | 平均评论量 | 标记 |
|---|---:|---:|---:|---:|---|
| 只有 keyword，其余缺失 | 48500 | 30.5 | 4.42 | 1120 | LIVE |
| 上述四项显式为 0 | 48500 | 30.5 | 4.42 | 1120 | LIVE |

同函数还默认 category、competitorCount、opportunityScore、competitionScore；证据摘要 `:166` 又把缺失描述成零。只替换方案点名的四个常数不能闭环。

最小修复覆盖这一数据路径的 Mapper → DTO → 派生计算/证据摘要 → 展示与门禁。合法 0 保留；非法值明确拒绝或标缺失；缺失不参与需要完整指标的评分。需要估计时，明确区分 ESTIMATED 和事实。显式 MOCK fixture 的合成数字不应被机械删除。

验收至少包括缺失、null、合法零、正常非零以及下游缺数行为，不能只证明 TypeScript 接受了 `null`。

### R3：审批薄弱点存在，但“裸布尔即真实写绕过”的论证不成立

`apps/api/src/modules/operation-automation/operation-automation.service.ts:155` 已按 approvalId + workspaceId 查库，并验证 PENDING；`:238` dispatch 固定 MOCK / mock-rpa。故不能从 `isApproved: true` 单独推出任意用户已经能绕过审批操作真实店。

实际可见缺口：该 Service 未校验审批 actionType/targetType 与发布用途一致；审批从 PENDING 到 APPROVED 是先查后更新；Router 只信调用方上下文。审批类型绑定、授权主体、原子消费、重试与执行分离需要沿完整入口验证。

建议先列入口矩阵：HTTP/Agent Tool/Workflow/Worker → 身份权限 → Approval/PlannedAction → Executor → Adapter，逐条标真实/模拟/不可达。审批证明须绑定 workspace/store、动作、payload、有效期和授权主体；消费与幂等执行不能设计成崩溃后永远无法恢复。

可在受信任的应用执行入口查库，或为 Router 注入 verifier；不要仅为消灭一个布尔参数让通用 actions 包直接依赖 Prisma。`ApprovalProof` 若仍由调用方任填字段，同样不能证明授权。

## 4. 执行前必须修订的契约与范围

### R4：对接当前 Automation v1，保留未知生效与恢复语义

现有 `packages/shared/src/contracts/automation-contracts.ts:24` 已定义 ExecutionEvidence，包含 mode、phase、effect、recovery；effect 明确区分 APPLIED / NOT_APPLIED / PARTIALLY_APPLIED / UNKNOWN。

数据库已有 AutomationOperation 与租约存储，Worker 已有恢复处理器。原方案完全未映射这些资产，§7 又引入 `ok`、`DONE/FAILED`、`retryable`，执行 AI 很容易新建平行类型或抹掉已经修过的语义。

**Tool 调用是否成功、业务操作是否生效、下一步能否重试是三个问题。** 查询失败不能自动重发写请求；修改参数后重试也可能使已审批 payload 失效。恢复每个写步骤前必须核对已有 operation/远端结果，不是“RUNNING 租约过期就再执行”。进程应在远端受理后、本地保存前被中断进行验证。

修订时至少补以下映射，明确新增字段、兼容读写方与验收：

| 方案目标 | 当前对应物 | 修订要求 |
|---|---|---|
| ToolExecutionResult | `packages/tool-platform/src/contracts/tool.types.ts:51`，已有 success/traceId/durationMs | 增量扩展；不直接改成 ok 并删除旧字段 |
| ActionCandidate | Prisma PlannedAction、shared action-layer-contracts、operations Recommendation | 作为现有候选的映射/投影；不新建平行动作状态机 |
| ApprovalProof | Approval、PlannedAction 及其应用服务 | 先清点各入口，建立可信验证边界；不全仓强行合并表 |
| EvidenceMeta | 研究证据、运营证据、Tool provenance、ExecutionEvidence | 可共享引用/来源基座，但分析证据与执行回执用途不同，不能合成一个含糊 success |
| StepExecution/Resume | Workflow checkpoint、currentStep、AutomationOperation、恢复 Worker | 步骤编排和外部操作分别负责什么必须写清；已有外部操作幂等机制必须复用 |

同时保留既有 G1 19 个探针和采购/恢复相关验收作为回归要求；新增方案不能宣布它们过时。

### R5：L0～L4 表达自动化权限，不是风险严重度

原 §4.3 中 L0 READ、L3 HUMAN-APPROVED WRITE、L4 BOUNDED AUTOMATION，却在 §7.3 填入 `riskLevel`。现有 `CommerceActionRiskLevel` 是 low/medium/high。这不是换几个名称：人工批准的大额采购可以高风险，小幅自动调价可以低风险。

保持两个独立维度：现有 riskLevel 表示业务风险；单独的执行权限/自动化等级表示是否建议、暂存、人工批准或受限自动执行。权限由服务端策略判断，不能让模型选择 L4 来获得授权。

原 Skill 的 `maxLevel: L2` 等示例也须同步修订。来源可信不等于执行权限足够；读过某个 ID 不等于有权改它。Anthropic 的 session provenance 若用于后台任务，应映射为持久 run/evidence 引用，并在恢复时重新验证 scope 与有效性。

### R6：先定义内部 SKU 与店铺标识关系，再决定唯一键迁移

`packages/db/prisma/schema.prisma:190` 中 Sku 属于 Product，且关联采购、报价、库存等；`:231` 是 `[workspaceId, skuCode]` 唯一。`:1339` 的 ChannelIdentity 已有 storeId/platform/entityType/externalId 复合唯一键。

因此不能预设内部 skuCode 就是每店 sellerSku。若内部 SKU 是跨店共享的实物主数据，直接给 Sku 加 storeId 并放宽唯一键，会影响采购、库存和原来的唯一查询。

先出三类数据与关系样例：同一内部 SKU 多店销售；不同店铺同 sellerSku 对应不同实物；历史记录缺 store 归因。检查已有 ChannelIdentity/Listing 能否承担映射，再决定是否改唯一键。

赞同 Kimi 要求单独迁移，但补充：现有唯一约束意味着库内不应已有重复的 workspace+skuCode；要查的还包括导入时覆盖/合并和来源不可恢复。不能只跑 GROUP BY 重复检查就认为迁移安全。

采用加可空列 → 可证明归因的回填 → 双读写或兼容读取 → 验证 → 收紧约束。未知归因不得随便分给默认店铺。店铺同时处于何种平台/marketplace，也应明确，不能仅靠一个含糊 channelId。

## 5. Skill Pack 的定位与修订

本地实际是 **8 个针对 CrossPilot 整理的审核/设计模板，加上来源链接**，不是已经下载并接入了多个上游运行时。SOURCES.md 自己也声明未逐字复制第三方 Skill。没有脚本、manifest 或 eval 产物。

这里对 Kimi 的判断作两点区分：

- 认同它们不能算 CrossPilot 的业务 Skill 平台已经建成。
- 但审核辅助 Skill 不必满足产品运行时 Skill 的全部发布标准。短 checklist 有用；不能仅因没有 manifest 就判其不合格，也不需要为八份清单都搭 eval 框架。需要证明的是它们能稳定发现已知缺陷、不会误报合法 MOCK/默认配置。

建议暂留 docs，按任务读取。修正下列问题后，再考虑按项目安装选中的审核模板：

1. `crosspilot-evidence-auditor` 仍把 STALE 放进取值 status；统一为独立 freshness。
2. `crosspilot-action-safety-auditor` 把 L0～L4 称为 Risk levels；按 §4/R5 修正。
3. `crosspilot-adapter-contract-auditor` 的“业务层不得按 isMock 分支”过于绝对。禁止伪造另一条成功链是对的，但 mode 隔离、真实度显示和能力拒绝必须保留；SIMULATOR 也不等同纯 Mock。
4. README/INSTALL 明确审核工具与产品运行时的区别。上游 Skill 可能依赖自身 MCP/脚本；不要把“可安装”写成“已能在 CrossPilot 执行”。
5. 包内有完整方案副本，目录外还有同名方案，另有 zip。指定外部方案为唯一规范；Skill 只引用条款，归档包应写明版本。无需在本次审核中删除用户文件。
6. 上游引用补 commit/tag、具体文件、读取日期、许可文件与复用方式。浮动 main 链接不能保证以后下载到本次审核的内容。

建议先用 code-audit、evidence-auditor、action-safety-auditor、store-scope-auditor；recovery/adapter 随对应任务使用；playbook-author 等真正出现新 SOP 时用；stage-gate-designer 维持条件触发。

## 6. 建议的推进顺序

1. **重定基线和修订方案。** 映射当前提交、Automation v1、尚待终审的状态；完成 R4～R6 契约修订与 Skill 词汇一致化。本轮产物是明确的任务卡，不是全仓重构。
2. **安全与事实最小补丁。** 优先处理 R1/R2；R3 先复现入口层面的越权/错用审批，再实施对应补丁。已证实危险路径可先封闭，不必等待统一 Contract 大工程。现有 Automation 最终复验仍需单独完成。
3. **完成一个有价值的端到端样本。** 选择现有日运营诊断/补货链路之一，做到数据归因 → 证据 → 建议 → 审批 → 执行证据 → 恢复/查询，全程复用现有模块。再据此决定需要推广哪些公共契约。
4. **按失败证据扩展恢复和多店支持。** 不把六张表迁移、四套审批重构、整个 DAG 内核改造捆成一批。每批一个负责人、明确文件范围、失败复现、验收和回交点。
5. **实际出现重复 SOP 后再做注册与 Skill 评估。** 从一个 SOP、少量正常/缺失/冲突/异常案例和基线比较开始。2～5 个案例是启动集，不足以证明可全面自动运营；观察正确率之外还要看人工修改量、漏报/误报和调用成本。

Stage、Workspace 生命周期、Decision Memory、广泛 L4 继续暂缓。外部项目数量不是下一阶段的验收指标；一个业务闭环是否更可信、可恢复、便于运营使用才是。

## 7. 给方案编写 AI 的修订提示词

```text
你负责修订 CrossPilot 的外部设计吸收方案，本轮只改文档，不修改业务代码、不安装 Skill、不迁移数据库、不提交推送部署。

项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot
先读取项目 AGENTS.md 与 docs\HANDOFF.md，重新核实当前 Git HEAD，不照搬交接中的历史状态。

待修订方案：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md
审核意见：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_External_Design_Absorption_Review_20260914.md
Skill Pack：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_Reference_Skill_Pack
已有执行方案和终审：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\AUTOMATION_EXECUTION_PLAN_V1.md
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\AUTOMATION_EXECUTION_EVIDENCE.md
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\AUTOMATION_FINAL_REVIEW_20260914.md

按审核 R1～R6 修订：
- 重新核验三项所谓 P0 的真实调用链、影响范围与现有保护，区分源码事实、实验事实、待复现推断。
- 每个目标 Contract 映射现有文件/类型/表，列增量变化和兼容方式。保留 success/traceId/durationMs 与既有执行证据语义；不得直接另建 ActionCandidate 状态机或恢复系统。
- 分离 riskLevel 与自动化权限；UNKNOWN/PARTIALLY_APPLIED/QUERY/MANUAL 不得被 ok/FAILED/retryable 抹掉。
- 先定义内部 SKU 与店铺 sellerSku/ChannelIdentity 关系，后决定是否迁移唯一键。拆开加列、回填、约束切换。
- Evidence 的 freshness 与取值状态正交；missing/zero/estimated 分开。Mapper 修复验收必须覆盖下游证据与评分。
- 明确 MOCK/SIMULATOR/LIVE 的必要隔离，不删除模式校验与真实度标记。
- 将“外部参考模式”与“上游可直接复用代码”分开，引用具体文件与版本，注明 Anthropic/Shopify 的继承关系及示例边界。
- 同步修正 8 个审核模板中的冲突词汇，指定唯一规范源；不得把清单包装成已完成的业务 Skill 平台。
- 改写 §12.3：逐批任务卡包含范围、非目标、依赖、现有对应物、失败复现、验收、回退和统筹复审点；不再授权一次做完全部 P1。

交付：修订方案、必要的 Skill 文档修订、逐条回应审核意见的对照表。
状态只能标 READY_FOR_REVIEW，不自行标通过，不开工业务实现。
```
