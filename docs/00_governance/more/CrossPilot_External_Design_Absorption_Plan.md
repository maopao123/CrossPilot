# CrossPilot 外部设计吸收与实施方案（R2 修订版）

> **2026-09-14 统筹最新裁定：Batch A 计划审核 PASS，允许按[开工交接](./EXTERNAL_ABSORPTION_BATCH_A_HANDOFF_20260914.md)实施。仅放行 legacy reset 禁用与 XYDC 数据真实性修复；Batch B～E 尚未放行，代码实现仍待完成后独立验收。下方 READY_FOR_REVIEW 为本次提交时的历史状态。**
>
> **2026-09-14 统筹更新（Kimi Code 接替 Codex）：Batch A 实施回交独立复审结论 CHANGES_REQUESTED**——A-1 通过；A-2 存在 BA-R1～R3 三项阻断缺陷（MarketService 实际数据链未走修好的 Mapper、Mapper trending 子字段缺失转零、前端结论性文案无条件硬编码）。修复提示词见 [Batch A 复审报告](./EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md) §4；Batch A 复审、B～E 执行与各批复审、最终验收的全部后续提示词见 [交接包](./EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md)。
>
> **2026-09-14 统筹更新（Kimi Code）：Batch A 修复回交二次复审 PASS**（[复审 R2 报告](./EXTERNAL_ABSORPTION_BATCH_A_REVIEW_R2_20260914.md)）——BA-R1～R3 全部关闭，统筹探针 4/4、新增 R2 对抗探针 6/6、全量回归全过。
>
> **2026-09-14 统筹更新（Kimi Code）：Batch B 回交独立复审 PASS**（[Batch B 复审报告](./EXTERNAL_ABSORPTION_BATCH_B_REVIEW_20260914.md)）——原子 CAS 经真实库并发对抗探针实证（9/9），无循环校验，Batch A 零回退。
>
> **2026-09-14 统筹更新（Kimi Code）：Batch C 回交独立复审 PASS**（[Batch C 复审报告](./EXTERNAL_ABSORPTION_BATCH_C_REVIEW_20260914.md)）——契约纯增量、透传经对抗探针实证（4/4）、零破键、typecheck 10/10。
>
> **2026-09-14 统筹更新（Kimi Code）：Batch D 回交独立复审 CHANGES_REQUESTED**（[Batch D 复审报告](./EXTERNAL_ABSORPTION_BATCH_D_REVIEW_20260914.md)）——超时→UNKNOWN/QUERY→自愈闭环、404/超时区分、幂等重建、审批约束、F-6 修复全部独立验证通过；但统筹对抗探针实证 D-R1：恢复收敛只按 operationId 命中即采纳远端单据、零内容校验，错误单据可被标 APPLIED 绕过人工。修复要求见复审报告 §2（失败复现探针 `apps/api/test/review-batch-d-adversarial.spec.ts` 第 3 用例当前为红，修后应转绿）。修复复审通过前不进入最终验收；Batch E 继续条件触发不放行。改动保持未提交工作区，commit/push 待最终验收后由用户决定。
>
> **2026-09-14 统筹更新（Kimi Code）：Batch D 修复回交二次复审 PASS**（[Batch D 复审 R2 报告](./EXTERNAL_ABSORPTION_BATCH_D_REVIEW_R2_20260914.md)）——D-R1 实证关闭（对抗探针 6/6 + 统筹新变体 3/3：NEEDS_ATTENTION 稳定不回弹、金额差 1 分拦截、内容一致正常收敛）。
>
> **2026-09-14 统筹最终验收：ACCEPTED**（[最终验收报告](./EXTERNAL_ABSORPTION_FINAL_ACCEPTANCE_20260914.md)）——Batch A～D 全部通过；41 项统筹独立探针全绿；G1 29/29、E01～E15 15/15、typecheck 10/10、web build 24/24 独立复跑通过；§11 禁止事项与纪律核查通过。**本方案实施线关闭，工作区改动具备提交条件，commit/push 由用户决定。** Batch E 保持条件触发。遗留 F-1～F-11 非阻断项见最终验收报告 §3。

> **文档状态：** `ACCEPTED`（2026-09-14 统筹最终验收通过，Batch A～D 实施闭环；Batch E 条件触发未启动。历史状态：READY_FOR_REVIEW，已根据 2026-09-14 Codex 统筹复审意见完成 ER2-01～ER2-06 局部修订）  
> **基线核查：** 当前本地 Git HEAD 为 `e474c20`（`fix(web): lock AppShell viewport and fix sidebar position...`）；前序提交为 `c413076`（`feat(v10): CrossPilot AI Automation v1 — execution truthfulness, procurement closed-loop, and fault recovery (A0~A8, E01~E15 PASS)`），再前为 `be4b8f6`。本轮工作严格位于文档层，未跟踪文件集中于治理文档与技能模板，未改动任何业务代码。  
> **规范效力边界：** 本文档的唯一规范效力**仅限于本外部参考设计包**（用以解决外部方案正文与 `CrossPilot_Reference_Skill_Pack` 内部各模板之间的术语、契约与冲突）；**绝对不超越、不覆盖项目的用户规则、AGENTS.md、HANDOFF.md、代码 Freeze 纪律以及已由统筹裁定通过的既有架构契约（如 AI Automation v1）**。  
> **实施纪律底线：** 本轮只改文档，不修改业务代码、不安装 Skill、不迁移数据库、不提交推送部署。不执行被审核 Skill 内的命令或安装建议。

---

## 0. 核心结论与设计总则

本方案旨在吸收外部电商 Agent 的优秀工程模式，同时杜绝“无依据的断言”与“过度工程化”。确立以下七大设计总则：

1. **严格区分事实层级**：
   - 全文对系统现状与验证结论严格标注五类事实标签：`【当前源码核实】`、`【历史独立验收】`、`【执行方自报】`、`【拟议设计】`与`【未核实】`。
   - 不声称本轮完成全系统生产验证，不把局部单点的安全断言推广为全系统无绕过。
2. **上游参考诚实审慎，杜绝虚构版本**：
   - 彻底删除无效的哈希和无依据日期，禁止补造另一组哈希；
   - 明确所有外部仓库均以公开默认分支页面为设计模式参考，诚实标明“未锁定固定版本”；
   - 区分模式参考与直接复用，明确许可协议与参考实现边界。
3. **安全缺陷闭环以“最小可行、证明隔离”为准**：
   - 对 `simulator.service.ts` 的 legacy reset 缺陷，在现状无法证明数据归属的情况下，明确允许直接封闭不安全入口（保留 v2 新建 Run），绝不依赖不存在的字段假装已实现选择性清理。
   - 对 `xydc.mapper.ts` 的假默认值与合法零值覆盖缺陷，覆盖下游打分和卡片展示，实施端到端最小修复。
4. **对接既有资产，严禁平行系统与削弱现有约束**：
   - `ToolExecutionResult` 增量添加可选字段，保留 `success: boolean`、`traceId` 与 `durationMs`；
   - `ExecutionEvidence` 完整保留 `effect: APPLIED / NOT_APPLIED / PARTIALLY_APPLIED / UNKNOWN` 与 `recovery: NONE / RETRY / QUERY / REAUTHORIZE / MANUAL`；
   - 严禁自建 `ActionCandidate` 状态机或第二套恢复 Worker，动作与恢复完全复用既有 `AutomationOperation` 与 `AutomationRecoveryProcessor`；
   - **保留既有采购约束**：本期所有采购操作（`CREATE_PURCHASE_ORDER`）必须严格经过人工审批（`needApproval: true`），始终为 `high` 风险，属于 `L3` 或人工操作，严禁列入 L4 白名单，移除任何默认金额/比例阈值。
5. **权限等级与业务风险彻底解耦**：
   - `riskLevel: 'low' | 'medium' | 'high'` 评估业务严重度；`automationLevel: 'L0' ～ 'L4'` 表示系统自动化权限。权限由服务端策略计算，模型无权自选 L4。
6. **先定实体映射，审慎推进多店归因**：
   - 内部 `skus`（`[workspaceId, skuCode]`）为租户实物主数据，店铺端为 `channel_identities` 渠道身份，严禁粗暴破键。
7. **可执行实施批次任务卡**：
   - 修正类型依赖反向问题，纠正端点与用例，测试改写为实际可运行命令，回退方案精准撤回本批改动并不重新开放危险入口。

---

## 1. CrossPilot 当前代码与架构事实基线

### 1.1 事实基线分级表

| 核心领域 | 当前源码事实（含文件/行号） | 既有保护与资产 | 状态分类与演进边界 |
|---|---|---|---|
| **执行真实性与模式隔离** | `packages/shared/src/contracts/automation-contracts.ts:24` 定义了 `ExecutionEvidence`（mode, phase, effect, recovery）；`effect` 明确区分 APPLIED / NOT_APPLIED / PARTIALLY_APPLIED / UNKNOWN；`recovery` 包含 RETRY / QUERY / REAUTHORIZE / MANUAL / NONE。 | Router/RPA 严禁假成功，无凭据抛出 UNSUPPORTED。统筹终审前两轮 19 项探针全过。 | **【当前源码核实】+【历史独立验收】**。<br>方案增量扩展必须完整保留上述语义，严禁用粗粒度状态抹杀。 |
| **采购闭环与外部操作** | `AUTOMATION_EXECUTION_PLAN_V1`（A0～A8）已实施入库（提交 `c413076`）。包含 `AutomationOperation` 租约存储（`packages/db/prisma/schema.prisma:1823`）、`HttpERPAdapter`、采购审批到 PO 落地、幂等收货。 | 收货并发使用原子递增与 OCC 锁；异参幂等抛 409；测试库全量脚本 15/15 PASS（28s）。 | **【当前源码核实】+【执行方自报】**。<br>既有资产直接复用，严禁新建平行动作执行层。 |
| **恢复机制与自愈 Worker** | `apps/worker/src/processors/automation-recovery.processor.ts` 已实现；`worker.service.ts` 注册了 Recovery 队列与定时调度器；`claim()` 保持业务 phase 并实现 Case 2 重试建单。 | 具租约防重、SUBMITTED 远端 QUERY 查询、READY 重新发单端到端测试。 | **【当前源码核实】**。<br>所有重试与恢复必须对接既有 Recovery Worker，不得在 DAG 层无租约重跑。 |
| **审批与动作模型** | Prisma `PlannedAction`、`approvals` 表存在；`packages/shared/src/contracts/action-layer-contracts.ts:22` 规范了 `PlannedActionRecord`、`ActionExecutionRecord`；`action-layer.service.ts:376, 382` 使用 `parameters._approval` 校验哈希。 | HITL 强制，UI 二次确认，`needApproval` 守卫存在。 | **【当前源码核实】**。<br>审批薄弱点在于应用层缺乏 payload 与 action 强绑定，需增量补齐验证，严禁自建动作表。 |
| **工具平台与契约** | `packages/tool-platform/src/contracts/tool.types.ts:51` 定义了 `ToolExecutionResult`（`success`, `traceId`, `durationMs`, `data`, `error`, `cost?`）。 | 工具平台统一输入输出封装与类型检查。 | **【当前源码核实】**。<br>增量扩展，严禁将 `success` 改为 `ok`，严禁移除 `traceId` 与 `durationMs`。 |
| **店铺与商品主数据** | Prisma `skus` 约束为 `@@unique([workspaceId, skuCode])`（`:231`）；`channel_identities` 约束为 `@@unique([storeId, platform, entityType, externalId])`（`:1350`）。 | 内部 SKU 承担 10+ 张下游核心业务表的外键关联（采购、报价、库存、订单等）。 | **【当前源码核实】**。<br>严禁粗暴破坏 Sku 唯一键；内部 Sku 是实物主数据，店铺端是渠道身份。 |
| **工作流与编排** | Workflow-first 架构，WF-02/WF-05 确定性 DAG 运行，无自由 LLM 规划器。 | OCC Checkpoint、脱敏、原子写。 | **【当前源码核实】**。<br>继续维持 Workflow-first，不引入 LLM 自由 Planner。 |

---

## 2. 外部开源参考深度剖析与继承关系

本方案对调研的外部项目建立明确的模式借鉴与隔离边界。各参考项目均基于公开默认分支文档与代码进行设计思想比对，**未做离线版本锁定（未固定特定 Commit 快照）**：

```
[Anthropic] commerce-agents (默认分支公开代码, Apache-2.0)
   │  └─ 模式：provenance gates, staged write, host approval (官方声明为 unmaintained 参考实现，无生产鉴权)
   ▼ (继承构建)
[Shopify] claude-for-commerce-examples/merchant (默认分支公开代码, Apache-2.0)
      └─ 继承关系：基于 Anthropic 蓝图构建，Local Store 替身与真实客户端共用审批管道
      └─ 边界：两者系衍生继承关系，非独立交叉验证；Shopify 自身未发声明，不自动套用 unmaintained 标签
```

### 2.1 外部来源审计与复用边界表

| 外部项目与定位 | 来源与许可说明 | 核心设计吸收点（模式借鉴） | 明确隔离边界（严禁直接复制代码或误用） |
|---|---|---|---|
| **[Anthropic] commerce-agents**<br>`anthropics/commerce-agents` | [GitHub 默认分支](https://github.com/anthropics/commerce-agents)<br>License: `Apache-2.0`<br>状态：**【未锁定固定版本】** | 1. Provenance Gate：写操作只能引用上下文已验证的事实 ID。<br>2. Staged Write：Agent 仅生成暂存变更，Apply 走独立路径。<br>3. Apply 前二次校验 Guardrails。<br>4. Missing 值坚决返回 null/None 而非 0。 | **官方 README 明确声明为“不维护的参考实现”（unmaintained reference implementation）**。其认证、鉴权、多租户隔离与生产规则均缺失，**绝对不能直接复制其示例 Gate 作为生产安全防线**。 |
| **[Shopify] merchant example**<br>`Shopify/claude-for-commerce-examples` | [GitHub 默认分支](https://github.com/Shopify/claude-for-commerce-examples)<br>License: `Apache-2.0`<br>状态：**【未锁定固定版本】** | 1. Local Store 替身与 Real Store 共用完全相同的 Backend / Ledger / Gate / Router 管道。<br>2. 模拟器作为 Adapter 末端的桩替身。 | **直接构建于 Anthropic 蓝图之上，系继承关系而非独立验证**。本地替身通过完全无法证明真实 SP-API / Shopify 生产契约的正确性。不把 Anthropic 的 unmaintained 声明自动套用给它，但同样不直接复制代码。 |
| **[Kangise] ecommerce-ai-skills**<br>`kangise/ecommerce-ai-skills` | [GitHub 默认分支](https://github.com/kangise/ecommerce-ai-skills)<br>License: `CC0-1.0`<br>状态：**【未锁定固定版本】** | 1. 实体与硬约束收敛为共享契约。<br>2. 业务 Skill 必须具备输入/输出/边界 CI 静态门禁。<br>3. 外部写操作必须具备可恢复 Worker。 | 本轮未运行其 CI；其 Skill 均为高阶规范，缺乏对 CrossPilot 现有 Tool 的接线适配，不得作为现成业务包直接部署。 |
| **[Kuudo] Amazon Ads MCP**<br>`KuudoAI/amazon_ads_mcp` | [GitHub 默认分支](https://github.com/KuudoAI/amazon_ads_mcp)<br>License: `MIT`<br>状态：**【未锁定固定版本】** | 1. Error Envelope：失败回执携带为什么错（why）与如何修正（suggested_fix）。<br>2. Tool、Skill、Knowledge、Data 明确分层。 | **必须严格区分“改参数重新尝试”与“写请求可安全重发”**。不能因回执友好就将非幂等写操作直接放行重试。 |
| **[Zach] Skill Creator**<br>`zach22-1999/amazon-skills` | [GitHub 默认分支](https://github.com/zach22-1999/amazon-skills)<br>Root: `MIT`, Sub: `Apache-2.0`<br>状态：**【未锁定固定版本】** | 1. 业务 SOP 必须经过 6 问门禁。<br>2. Skill 必须有 Baseline 对比、Eval Case 和断言评测。 | 安装该仓作者的 Skill 绝不会自动完成 CrossPilot 内部 Tool/Workflow 的接线，不可作为现成运行时引入。 |
| **[Nexscope] dynamic pricing**<br>`nexscope-ai/eCommerce-Skills` | [GitHub 默认分支](https://github.com/nexscope-ai/eCommerce-Skills)<br>License: `MIT`<br>状态：**【未锁定固定版本】** | 1. 调价策略采用 Shadow → Pilot → Automation 渐进式发布。<br>2. 自动化执行必须具备硬限额与熔断。 | 外部业务阈值不可直接搬用，必须由 CrossPilot 租户策略配置决定。 |
| **[Sorftime] Seller Agent**<br>`DannylydST/sorftime-seller-agent` | [GitHub 默认分支](https://github.com/DannylydST/sorftime-seller-agent)<br>License: `MIT`<br>状态：**【未锁定固定版本】** | 1. 业务风险提示（Advisory）与系统阻断分离。<br>2. 关键选品决策引入独立复核机制。 | 业务层面的 advisory 警示绝对不能迁移为系统权限与数据隔离边界的放行借口；权限必须硬阻断。 |
| **[Lingxing] ERP MCP**<br>`zach22-1999/lingxing-mcp` | [GitHub 默认分支](https://github.com/zach22-1999/lingxing-mcp)<br>License: `MIT`<br>状态：**【未锁定固定版本】** | 1. 多店铺 ERP 只读凭证隔离与固定出口映射。 | **当前该仓库为只读接口（Read-only ERP）**，绝对不能提供采购写入或库存扣减的现成实现证明。 |
| **[LaunchFit] AI**<br>`JuneYaooo/launchfit-ai` | [GitHub 默认分支](https://github.com/JuneYaooo/launchfit-ai)<br>License: **`PolyForm Noncommercial 1.0.0`**<br>状态：**【未锁定固定版本】** | 1. 合规材料缺失、过期、冲突时显式阻断（HOLD）。 | **明确包含非商业（NC）限制**。CrossPilot 具有商业化属性，**严禁复制其任何代码、模板或 Skill 文本**，仅借鉴合规逻辑。 |
| **[Seller Second Brain]**<br>`zach22-1999/seller-second-brain` | [GitHub 默认分支](https://github.com/zach22-1999/seller-second-brain)<br>License: **`CC BY-NC-SA 4.0`**<br>状态：**【未锁定固定版本】** | 1. Decision Memory 记录决策当时的原因、替代方案与事后复盘。 | **明确包含非商业（NC）限制**。仅做设计理念探讨，当前 P2 阶段不引入实现。 |
| **[Starsky] Amazon Codex**<br>`wenjiany312-hub/starsky-amazon-codex-releases` | [GitHub 默认分支](https://github.com/wenjiany312-hub/starsky-amazon-codex-releases)<br>License: **专有授权发布仓**<br>状态：**【未锁定固定版本】** | 1. Evidence First、缺失不补数、高风险动作停在人工审核。 | 属于需授权的公开发布仓，不可作为可商用开源代码直接复用；仅吸收 Evidence First 理念。 |

---

## 3. 三项所谓 P0 真实性核验与重新界定

统筹独立审核明确指出：原方案将三项问题均定为“严重 P0”，其中两项存在真实缺陷但范围需重新界定，一项“审批绕过”定性不成立。本节严格区分事实层级，确立最小修复边界。

### 3.1 R1 缺陷：模拟器重置（`resetWorld`）删除范围与数据隔离

#### A. 真实调用链与可达性 `【当前源码核实】`
```text
HTTP POST /api/v1/simulator/reset
  │
  ▼ (apps/api/src/modules/simulator/simulator.controller.ts:146)
simulatorController.reset(workspaceId)
  │
  ▼ (apps/api/src/modules/simulator/simulator.service.ts:87)
simulatorService.reset(workspaceId)
  │
  ├─ [源码已有判定]: if (await v2Store.isRunWorkspace(workspaceId)) throw ConflictException(...)
  │
  ▼ (apps/api/src/modules/simulator/simulator.service.ts:96)
this.persistence.resetWorld(workspaceId)
  │
  ▼ (packages/db/src/simulator/simulator-store.ts:438, 441)
prisma.$transaction([
  ...,
  this.prisma.channelDailyMetric.deleteMany({ where: { workspaceId } }), // 漏洞点 1
  this.prisma.inventorySnapshot.deleteMany({ where: { workspaceId, snapshotDate: { gte: DEFAULT_SIM_START_DATE } } }), // 漏洞点 2
])
```

#### B. 事实分级剖析
- **源码事实 `【当前源码核实】`**：
  1. `simulator.service.ts:87` 方法名为 `reset(workspaceId)`，`:89` 仅通过 `await v2Store.isRunWorkspace(workspaceId)` 拦截并抛出 `ConflictException`；
  2. `simulator-store.ts:438` 的 `channelDailyMetric.deleteMany` 确实仅以 `{ workspaceId }` 为过滤条件，未校验数据来源；
  3. `:441` 的 `inventorySnapshot.deleteMany` 仅按 `workspaceId` 和日期过滤，同样未校验来源；
  4. 当前 `Workspace` schema 中**不存在 `environmentMode` 字段**，源码也**不存在 `workspace.isV2Simulation` 属性**；目前仅有针对 V2 运行沙箱的判定，普通 workspace 内缺乏任何可信的数据所有权标识。
- **实验事实 `【未核实】`**：
  终审与本次核验未在物理生产数据库执行删除操作；当前测试库中尚未断言存在因该调用导致真实业务数据丢失的实际受害者记录。
- **待复现推断 `【待复现推断】`**：
  如果用户在同一 workspace 内混合导入了真实日指标或快照数据，调用 `reset` 会将该 workspace 下的所有日指标连带删除。

#### C. 可执行修复选择（不依赖不存在字段）
由于当前数据库缺少可证明的逐行归属标记，方案明确以下两个可执行路径之一，**首选且代价最小的方案为选项 1**：
- **选项 1（明确代价的最小安全策略，推荐）**：
  **直接封闭 legacy reset 的不安全入口**。在 `simulator.service.ts:87` 中，在调用任何 `ensureFixtures`、删除或重建写入前直接拦截并抛出：
  `throw new BadRequestException('LEGACY_RESET_DISABLED: Legacy reset is disabled to protect unverified workspace data. Create a new v2 Run instead.');`
  保留已有的 `v2 Run` 新建路径（`closed-loop-v2`）。**代价说明**：这是暂时关闭不安全 legacy 重置功能的明确代价，绝不临时编造无来源证明的布尔开关，也不冒充已实现选择性清理。
- **选项 2（若确需保留 legacy reset 的条件）**：
  必须先在数据写入端确立确定性的所有权证明（例如要求所有模拟日指标和快照在写入时必须携带明确的 `source_provider === 'simulator'`，并在 schema 中声明支持），删除操作严格限定在 `where: { workspaceId, source_provider: 'simulator' }`；对于历史无来源或真实数据坚决保留。若无法证明，必须拒绝执行。

---

### 3.2 R2 缺陷：XYDC Mapper 伪造缺失值与覆盖真实零值

#### A. 真实调用链与可达性 `【当前源码核实】`
```text
xydc.provider.ts:185 ('market.market.overview')
  │ (以 mode = 'LIVE' 显式调用)
  ▼
xydc.mapper.ts:148 (toMarketOverview)
  │
  ├─ searchVolumeMonthly = raw.monthly_search_volume || raw.search_volume || 48500  <-- 假值且覆盖 0
  ├─ avgPrice = raw.average_price || raw.avg_price || 30.5                          <-- 假值且覆盖 0
  ├─ avgRating = raw.average_rating || raw.avg_rating || 4.42                       <-- 假值且覆盖 0
  ├─ avgReviewCount = raw.average_reviews || raw.avg_reviews || 1120                <-- 假值且覆盖 0
  ├─ category = raw.category || 'Home & Kitchen > Bath'                             <-- 假分类
  ├─ opportunityScore = raw.opportunity_index || 8.8                                <-- 虚假商机分
  ├─ competitionScore = raw.competition_intensity || 6.5                           <-- 虚假竞争分
  └─ evidenceList: 摘要写成 raw.monthly_search_volume || ... || 0                  <-- 证据与实体矛盾
```

#### B. 事实分级剖析
- **源码事实 `【当前源码核实】`**：
  1. `xydc.mapper.ts:176～182` 使用逻辑或 `||` 绑定了硬编码常数；
  2. 函数声明的默认 `mode` 即为 `LIVE`；
  3. 证据摘要代码 `:166` 处又将缺失值回退写成 `0`，自相矛盾。
- **实验事实 `【历史独立验收】`**：
  统筹独立内存探针证实：
  - 输入仅有 `keyword` 时：输出月搜索量 48500、售价 $30.5、评分 4.42、评论量 1120，标记 `mode: LIVE`；
  - 显式传入 `monthly_search_volume: 0` 时：由于 `0 || 48500 === 48500`，**真实零值被强制抹杀篡改为 48500**。
- **待复现推断 `【待复现推断】`**：
  下游的 OpportunityScore 打分和展示卡片是否已在生产上产生误导，需要通过覆盖下游链路的回归测试来闭环。

#### C. 修复要求与验收标准
1. **区分缺失与真实零**：使用显式判空（`value !== undefined && value !== null ? value : null`），真实 0 诚实保留；
2. **缺失值显式返回 `null`**：DTO 类型中将上述指标声明为 `number | null`；
3. **证据状态解耦**：证据列表携带 `valueStatus: 'MISSING'` 及 `missingReason`，严禁在 `mode: 'LIVE'` 下虚构完整数据；
4. **下游打分降级**：OpportunityScore 算法在核心指标为 `null` 时，必须降级输出 `status: 'INSUFFICIENT_DATA'`，严禁输出虚假的高商机分；
5. **保留合法测试 Fixture**：单测或专用 Mock Provider 中的确定性合成数据属于合法桩数据，锁定其 mode 为 `MOCK`，不机械删除。

---

### 3.3 R3 缺陷：“审批绕过”的定性修正与真实薄弱点

#### A. 真实调用链与可达性 `【当前源码核实】`
```text
HTTP POST /api/v1/operations/approve/:approvalId
  │
  ▼ (apps/api/src/modules/operation-automation/operation-automation.controller.ts:29)
operationAutomationController.approveAndExecute(approvalId, workspaceId, user)
  │
  ▼ (apps/api/src/modules/operation-automation/operation-automation.service.ts:155)
operationAutomationService.approveAndExecute(approvalId, workspaceId, userId)
  │
  ├─ 1. 查询数据库：prisma.approval.findFirst({ where: { id: approvalId, workspaceId } })
  ├─ 2. 状态校验：if (approval.status !== 'PENDING') throw BadRequestException
  ├─ 3. 更新状态：prisma.approval.update({ where: { id }, data: { status: 'APPROVED' } })
  │
  ▼ (:238)
this.actionRouter.dispatch(proposal, {
  workspaceId,
  isApproved: true,      // 上下文传递
  executionMode: 'MOCK', // 固定为 MOCK 模式
  providerId: 'mock-rpa' // 提供者为 mock-rpa
})
```

#### B. 事实分级剖析
- **源码事实 `【当前源码核实】`**：
  1. 控制器路由实际为 `@Controller('operations')` + `@Post('approve/:approvalId')`，即 `/api/v1/operations/approve/:approvalId`；
  2. `approveAndExecute` 确实执行了 Prisma 数据库查询，校验了 `PENDING` 与 `workspaceId`，并更新为 `APPROVED`；
  3. `:238` 处的 `dispatch` 调用，显式写死了 `executionMode: 'MOCK'` 与 `providerId: 'mock-rpa'`。
- **实验事实 `【历史独立验收】`**：
  在该 Service 的真实调用中，没有发现能够使用裸布尔去操作真实 Amazon 或真实 ERP 的情况。但**该观察仅限于该特定 Service，不能推广为全系统绝对无其他绕过可能**。
- **待复现推断 `【待复现推断】`**：
  原方案“任意用户只需传 `isApproved: true` 就能绕过审批操作真实店铺”在当前源码事实下不成立。

#### C. 真正存在的安全薄弱点与防御设计
1. **审批内容与动作未强绑定**：Service 解析 price，但未校验审批记录声明的 `actionType`、`targetType` 是否与当前发布的 RPA 任务完全一致；
2. **缺乏并发 CAS 保护**：审批状态先查询后更新，高并发下存在 TOCTOU 双重消费隐患；
3. **批准后派发前崩溃的恢复缺失**：若在更新为 APPROVED 后、dispatch 完成前服务崩溃，该审批单停留在 APPROVED 但实际未完成发布，缺乏自愈追踪。

#### D. 系统入口矩阵与加固策略

| 触发入口 | 身份与鉴权边界 | 审批/动作实体 | 目标执行器与提供者 | 真实度属性 | 现状事实与加固要求 |
|---|---|---|---|---|---|
| **Web 运营发布** (`POST /api/v1/operations/approve/:approvalId`) | JWT / Session + Workspace 守卫 | `Approval` 表记录 | `ActionRouter` → `mock-rpa` | `MOCK` `【当前源码核实】` | **加固**：比对 actionType 与 targetId；引入原子 CAS 更新防并发；记录操作日志。 |
| **采购执行** (`POST /api/v1/actions/:id/execute`) | JWT / Session + Workspace 守卫 | `PlannedAction` (需 APPROVED) | `ActionLayerService` → `HttpERPAdapter` | 默认 `SIMULATOR` / `simulator-erp` `【当前源码核实】` | **保持强守卫**：未审批抛 400；`HttpERPAdapter` 接收 baseUrl（不臆测为受管内网 LIVE）。 |
| **Agent Tool 自动提议** (WF-05 / ToolCenter) | 内部服务上下文 (API Key / System) | 仅生成 `PROPOSAL` | 仅输出到推荐列表，禁止直通 Executor | `NONE` (无写权限) `【当前源码核实】` | **保持隔离**：严禁向 Agent Tool 暴露具有执行权限的 Dispatch 接口。 |
| **Worker 自愈重试** (`AutomationRecoveryProcessor`) | Redis BullMQ 任务上下文 | `AutomationOperation` 租约记录 | 恢复执行器 (Case 1 查询 / Case 2 建单) | 保持原 mode `【当前源码核实】` | **保持租约守卫**：`leaseUntil` 过期检查与 `attemptCount` 约束生效中。 |

---

## 4. 关键契约增量映射与既有资产对接

本方案严格采用增量扩展与投影映射，绝不推翻既有资产。

### 4.1 目标契约与现有代码精准映射表

| 方案目标契约 | 当前源码对应物（文件与行号） | 现有真实字段与语义 `【当前源码核实】` | 拟议设计（增量兼容方式） `【拟议设计】` | 严禁行为 |
|---|---|---|---|---|
| **ToolExecutionResult** | `packages/tool-platform/src/contracts/tool.types.ts:51` | `success: boolean`<br>`data?: T`<br>`error?: ToolError`<br>`traceId: string`<br>`durationMs: number`<br>`cost?: { amount, unit }` | **保持所有现有字段完全不变**。以可选字段增量添加：<br>`evidenceMeta?: EvidenceMeta[]`<br>`errorEnvelope?: ToolErrorEnvelope`。 | 严禁将 `success` 改为 `ok`；严禁移除 `traceId` 与 `durationMs`。 |
| **ActionCandidate** | Prisma `PlannedAction`<br>`packages/shared/src/contracts/action-layer-contracts.ts:22`<br>Operations `Recommendation` | `PlannedActionStatus` (CREATED, WAITING_APPROVAL, APPROVED, EXECUTING, SUCCESS, FAILED)<br>`riskLevel: CommerceActionRiskLevel` ('low'\|'medium'\|'high')<br>`needApproval: boolean` | **作为既有实体的跨端投影视图（View DTO）**，底层不建平行表。增量关联 `automationLevel` 与 `evidenceIds`。 | 严禁自建平行动作状态机；严禁引入 PROPOSED/DONE 等平行状态。 |
| **ExecutionEvidence** | `packages/shared/src/contracts/automation-contracts.ts:24` | `mode: AutomationMode`<br>`phase: AutomationPhase`<br>`effect: AutomationEffect` (APPLIED, NOT_APPLIED, PARTIALLY_APPLIED, UNKNOWN)<br>`recovery: RecoveryAction` (NONE, RETRY, QUERY, REAUTHORIZE, MANUAL) | **完整保留全部语义，作为执行证据权威标准**。Tool 产出的分析证据与此执行回执通过 `operationId` 关联。 | 严禁被 `ok/FAILED/retryable` 覆盖；严禁丢弃 UNKNOWN 和 QUERY 自愈链。 |
| **ApprovalProof** | Prisma `Approval` 表模型<br>`PlannedAction.parameters._approval` (`action-layer.service.ts:376`) | `id`, `workspaceId`, `status`, `requestedPayload`, `approvedBy`, `resolvedAt`<br>参数中使用 `_approval.payloadHash` | 在应用服务层定义强类型校验 DTO：<br>校验 `actionId`, `payloadHash`, `expiresAt`；通过 CAS 消费。 | 严禁由客户端直接填报并信任；严禁全仓合并审批表。 |
| **StepExecution & Resume** | Workflow Checkpoint 表<br>`AutomationOperation` 表 (`schema.prisma:1823`)<br>`AutomationRecoveryProcessor` | OCC 租约锁定、`leaseUntil`、`attemptCount`、`idempotencyKey` | 步骤编排复用现有 Checkpoint；外部操作自愈完全复用既有 `AutomationOperation` 与 Recovery Worker。 | 严禁另起炉灶编写第二套恢复 Worker；严禁无租约重试。 |

---

### 4.2 三层语义明确解耦

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Tool / 步骤调用是否成功？ (Invocation Success)           │
│    -> ToolExecutionResult.success: true | false             │
│    -> HTTP 200 仅代表网络请求调用成功，不代表业务已生效     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. 外部业务操作是否生效？ (Business Effect)                 │
│    -> ExecutionEvidence.effect:                             │
│       - APPLIED          (已确认生效)                       │
│       - NOT_APPLIED      (已确认未生效)                     │
│       - PARTIALLY_APPLIED(部分生效，需对账)                 │
│       - UNKNOWN          (超时/网络断连，生效状态未知)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. 下一步能否重试与恢复策略？ (Recovery Strategy)           │
│    -> ExecutionEvidence.recovery:                           │
│       - NONE        (终态，无需动作)                        │
│       - QUERY       (状态未知，禁止盲目重发，只能反查确认)   │
│       - RETRY       (确认未生效且具备幂等键，可安全重发)     │
│       - REAUTHORIZE (凭据过期，需刷新授权)                   │
│       - MANUAL      (出现冲突/部分生效，必须人工介入对账)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 权限分级与风险解耦规范（保留既有采购约束）

### 5.1 两个正交维度的严格定义

1. **业务风险严重度（`riskLevel: CommerceActionRiskLevel`）**：
   - 维持既有枚举：`'low' | 'medium' | 'high'`。
   - 评估动作所涉及的资金规模、合规影响与不可逆程度。
2. **系统自动化权限（`automationLevel: AutomationPermissionLevel`）**：
   - `L0 READ`：只读操作，无副作用。
   - `L1 RECOMMEND`：仅生成诊断与分析建议，不产出待执行 Action。
   - `L2 DRAFT / STAGE`：可生成待确认的 Action 草稿，但停留在 Staging 状态。
   - `L3 HUMAN-APPROVED WRITE`：必须经过人工审批凭据后方可执行。
   - `L4 BOUNDED AUTOMATION`：系统允许在受限边界内由定时器/策略引擎自动闭环执行。

### 5.2 核心安全铁律与保留既有采购约束
- **既有采购约束绝对保留**：既有 `AUTOMATION_EXECUTION_PLAN_V1.md` 明确规定**本期所有采购操作（`CREATE_PURCHASE_ORDER`）必须经过人工审批（`needApproval: true`），始终为 `high` 风险，属于 `L3` 或人工操作**。**严禁将采购列入 L4 白名单，移除任何默认金额和比例数字，不作为默认系统政策**。
- **模型绝不可自提权限**：LLM 仅能提出 Candidate；其 `automationLevel` 由后端 Policy 根据租户配置、证据状态计算，模型无权自选 L4。
- **高风险禁止 L4 自动化**：凡是 `riskLevel === 'high'` 的动作，策略强行锁定为 `L3` 或更低。

---

## 6. 内部 SKU 与店铺标识关系及数据迁移策略

### 6.1 实体关系模型事实 `【当前源码核实】`
- **`Sku` 表（`skus`）**：代表租户下的实物主数据，约束为 `@@unique([workspaceId, skuCode])`，关联采购单、供应商报价、库存余额、日利润等 10+ 张核心表；
- **`ChannelIdentity` 表（`channel_identities`）**：代表外部渠道映射，约束为 `@@unique([storeId, platform, entityType, externalId])`，专门用于建立内部实物 SKU（`entityType: 'SKU', entityId: sku.id`）与外部店铺实体（`storeId`, `externalId: sellerSku / ASIN`）的绑定关系。

### 6.2 三大典型数据场景样例定义

| 场景编号 | 场景描述 | 业务数据特征与关系表达 | 系统处理规则 |
|---|---|---|---|
| **场景 1** | **同一内部 SKU 在多店铺销售** | 内部实物 `SKU-A` 同时在 Store 1 和 Store 2 销售，sellerSku 分别为 `US-A-01` 与 `US-A-02`。 | `skus` 表存一条实物记录；`channel_identities` 存两条记录，分别以不同 `storeId` 映射到同一个 `entityId: sku.id`。 |
| **场景 2** | **不同店铺相同 sellerSku 对应不同实物** | Store 1 的 `T-SHIRT-BLK` 对应纯棉款 `sku_1`；Store 2 的 `T-SHIRT-BLK` 对应速干款 `sku_2`。 | `skus` 表必须存在两条独立的实物记录；由两条独立的 `channel_identities` 分别映射。若粗暴放宽 Sku 唯一键会导致采购与库存对账混乱。 |
| **场景 3** | **历史记录缺失店铺归因** | 历史数据仅记录了 `workspaceId` 与 `skuCode`，无 `storeId`。 | **严禁随意分给默认店铺**。必须保持 `storeId: null`，标明 `UNATTRIBUTED`，等待确凿证据回填。 |

---

## 7. 证据契约解耦与数据真实性规范

### 7.1 取值状态与时效状态正交规范

```ts
/**
 * 证据取值真实状态（Value Status）：客观描述数值本身的获取形态
 * 映射说明：仅在新增的 EvidenceMeta 中采用 valueStatus，不与既有 ResearchEvidence.status 产生破坏性冲突
 */
export type EvidenceValueStatus =
  | 'KNOWN'       // 真实存在且直接从可信源获取的客观事实（含合法零值）
  | 'DERIVED'     // 基于已知客观事实经过确定性公式推导得出的数值
  | 'ESTIMATED'   // 缺乏直接事实、基于经验给出的估算值（需明确标明）
  | 'MISSING'     // 上游缺失、无法采集或数据源未提供（值为 null）
  | 'CONFLICTING';// 多个独立数据源提供的数值存在冲突

/**
 * 证据时效状态（Freshness）：客观描述数据的时间衰减状态
 */
export type EvidenceFreshness =
  | 'FRESH'       // 处于业务允许的时效窗口内
  | 'AGING'       // 接近时效阈值边界，准确度正在衰减
  | 'STALE'       // 已超出有效时间窗口（陈旧数据）
  | 'UNKNOWN';    // 缺乏时间戳，时效状态未知
```

> **重要澄清**：“归因窗口未成熟”新鲜报表属于业务分析门禁指标（Analysis Gating），不归入 STALE，不与数据新鲜度混淆。

### 7.2 核心数据三态区分原则
1. **真实零值（Zero）**：如退货量为 0，必须输出 `value: 0, valueStatus: 'KNOWN'`，严禁使用 `||` 篡改；
2. **数据缺失（Missing）**：如未授权获取数据，必须输出 `value: null, valueStatus: 'MISSING', missingReason: 'API_UNAUTHORIZED'`，绝不允许用 0 或常数冒充；
3. **经验估算（Estimated）**：必须输出 `valueStatus: 'ESTIMATED'`，且绝不得计入高置信度决策证据集。

---

## 8. 模式隔离与适配器契约规范

### 8.1 运行模式的三重定义（覆盖现有体系）
- **`MOCK`（虚拟测试桩）**：完全虚拟、无外部真实平台通信，包含本地静态 JSON fixture 及内存中的 `mock-rpa` 服务；
- **`SIMULATOR`（仿真运行模式）**：由受控仿真系统提供，具有确定的仿真推进状态或接口逻辑，包含 Commerce Simulator 日度推进世界引擎及本地 Loopback HTTP ERP 仿真服务器（`action-layer.service.ts:392` 默认模式）；
- **`LIVE`（真实生产模式）**：与外部真实多租户平台进行通信。

### 8.2 契约行为准则
- 业务层严禁为 Mock/Simulator 伪造专用成功链；
- 真实度透明透传（`ExecutionEvidence.mode`），前端抽屉如实渲染；
- **能力缺失与空结果严格区分**：未支持的能力必须明确抛出异常或返回 `{ status: 'UNSUPPORTED' }`，严禁用静默空列表 `[]` 冒充“确实无数据”。

---

## 9. 核心 Contract 增量扩展与接口定义

### 9.1 ToolExecutionResult 增量扩展规范 `【拟议设计】`

```ts
// 路径：packages/tool-platform/src/contracts/tool.types.ts
// 保持原有结构完全不变，以可选字段形式增量扩展

export interface ToolErrorEnvelope {
  code: string;
  category: 'VALIDATION' | 'AUTH' | 'RATE_LIMIT' | 'UPSTREAM' | 'CONFLICT' | 'UNSUPPORTED';
  message: string;
  why?: string;
  retryable: boolean;
  retryAfterMs?: number;
  suggestedFix?: Record<string, unknown>;
  docsRef?: string;
}

export interface ToolExecutionResult<T = any> {
  // === 原有核心字段：必须严格保留 ===
  success: boolean;               // 严禁改成 ok
  data?: T;
  error?: ToolError;
  traceId: string;                // 必须保留
  durationMs: number;             // 必须保留
  cost?: {
    amount: number;
    unit: string;
  };

  // === 增量扩展字段：完全可选，向下兼容 ===
  evidenceMeta?: EvidenceMeta[];   // 统一使用 evidenceMeta
  errorEnvelope?: ToolErrorEnvelope; // 与 error 来自同一错误映射，不得冲突
}
```

### 9.2 EvidenceMeta 规范定义 `【拟议设计】`

```ts
// 路径：packages/shared/src/contracts/evidence-contracts.ts

export interface EvidenceMeta {
  evidenceId: string;
  sourceType: 'API' | 'FILE' | 'WEB' | 'USER' | 'SIMULATOR' | 'DERIVED';
  sourceRef?: string;
  observedAt?: string | null;     // 允许为 null，上游无时间戳时严禁填 now()
  capturedAt?: string;            // 本系统采集时间戳 (可选)
  valueStatus: EvidenceValueStatus;// 统一使用 valueStatus
  freshness: EvidenceFreshness;   // FRESH | AGING | STALE | UNKNOWN
  proxyUsed?: boolean;
  missingReason?: string;
  confidence?: number;
}
```

### 9.3 ApprovalProof 验证契约 `【拟议设计】`

```ts
// 路径：packages/shared/src/contracts/approval-contracts.ts

export interface ApprovalProof {
  approvalId: string;
  workspaceId: string;
  actionId: string;
  actionType: string;
  targetId: string;
  payloadHash: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt?: string | null;
}

export interface ApprovalVerifier {
  verify(proof: ApprovalProof): Promise<{ valid: boolean; reason?: string }>;
}
```

---

## 10. Reference Skill Pack 定位与规范修正

### 10.1 定位厘清
- **明确为规范审核模板（Review Checklists）**：包内 8 个目录仅为提供给 Codex、Claude Code 或人工统筹在审查代码时使用的提示词清单，**绝非已建成的业务运行时平台**；
- **唯一权威范围**：仅在外部方案与 Skill Pack 之间作为词汇与检查标准参考，不超越项目已建立的正式契约。

### 10.2 模板冲突词汇同步修正
1. `crosspilot-evidence-auditor`：剥离 `STALE`，拆解为 `Value Status` 与 `Freshness` 正交维度；
2. `crosspilot-action-safety-auditor`：更正为 `Automation Permission Levels`，解耦业务风险与权限；
3. `crosspilot-adapter-contract-auditor`：纠正绝对化描述，明确禁止伪造成功链但保留模式强隔离与能力拒绝；
4. `crosspilot-playbook-author`：同步细化风险边界与自动化权限要求。

---

## 11. 明确禁止与暂缓事项

1. **严禁引入自由 LLM Planner**；
2. **严禁另起炉灶建立第二套动作/恢复系统**；
3. **严禁对 `skus` 主表粗暴破键**；
4. **严禁放宽本期采购全人工审批约束**；
5. **暂缓实现**：全套 StageInstance、Workspace 彻底拆分、Decision Memory、全系统 L4。

---

## 12. 细化实施批次任务卡（改写原 §12.3）

**废除“一次性实施全部 P1”的粗放授权**。严格划分为聚焦特定边界的实施批次（Batch A ～ Batch E）：

---

### 12.1 Batch A 任务卡：安全与事实最小补丁（Safety & Truthfulness Patch）

- **【任务目标】**：封闭 `reset` 的不安全删除入口；闭环修复 `xydc.mapper` 假默认值与真实零值覆盖缺陷。
- **【包含范围】**：
  1. `apps/api/src/modules/simulator/simulator.service.ts:87`：封闭 legacy reset 入口，在调用删除前直接拦截并抛出 `BadRequestException('LEGACY_RESET_DISABLED: Legacy reset is disabled to protect unverified workspace data. Create a new v2 Run instead.')`，保留已有的 v2 Run 路径；
  2. `packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts:148`：彻底移除 48500、30.5、4.42、1120 等硬编码常数及假分类，真实 0 诚实输出，缺失值返回 `null` 并打标 `valueStatus: 'MISSING'`；
  3. 修复下游打分算法在指标为 `null` 时的降级处理（输出 `INSUFFICIENT_DATA`）。
- **【非目标】**：不迁移六张表，不实现复杂的混合数据选择性清理，不修改外部 HTTP 客户端。
- **【依赖前置】**：当前 Git HEAD `e474c20`，现有测试库。
- **【现有对应物】**：`simulator.service.ts:87`、`xydc.mapper.ts:148`。
- **【失败复现策略】**：
  - 编写并运行最小单测用例：
    1. 传入缺失指标的原始对象，断言修前输出了 48500，修后期望输出 `null` 与 `MISSING`；
    2. 显式传入 `monthly_search_volume: 0`，断言修前被覆盖为 48500，修后期望如实保留 `0`。
- **【验收标准】**：
  1. 调用 legacy reset 被明确拒绝，数据库无任何删除；v2 Run 新建路径正常可用；
  2. 单测验证：缺失字段返回 `null`，合法 0 保持为 0，下游打分降级为 `INSUFFICIENT_DATA`；
  3. 既有 19 项探针与 E01～E15 矩阵保持全过。
- **【精确回退方案】**：
  记录实施前 Git diff，仅撤回本批对 Service 与 Mapper 的修改；若安全修复未达标，**坚决保持 legacy reset 处于禁用状态，绝不重新开放不安全删除**。
- **【统筹复审点】**：核查单测运行日志与拒绝删除的实际执行结果。

---

### 12.2 Batch B 任务卡：入口矩阵与可信审批加固（Approval Proof Hardening）

- **【任务目标】**：消除 `operation-automation.service.ts` 中的弱绑定与 CAS 漏洞，建立应用层审批校验机制。
- **【包含范围】**：
  1. 在 `apps/api/src/modules/operation-automation/` 内部定义局部 `ApprovalProof` 类型（不反向依赖未导出的包）；
  2. 改写 `approveAndExecute`：引入原子 CAS 校验，比对 `approvalId` 的同时强校验 `actionType` 与 `targetId` 是否与发布任务匹配，更新状态同时校验版本；
  3. 建立批准后派发前崩溃的恢复追踪逻辑（若状态已为 APPROVED，记录待执行状态，避免丢单）。
- **【非目标】**：严禁让通用包 `@crosspilot/actions` 反向依赖 Prisma；不修改已冻结的 Amazon Write 接口。
- **【依赖前置】**：Batch A 验收通过。
- **【现有对应物】**：`operation-automation.controller.ts:29`、`operation-automation.service.ts:155`。
- **【失败复现策略】**：
  - 构造真实端点测试：调用 `POST /api/v1/operations/approve/:approvalId`，传入一个目标类型不匹配或 actionType 错误的已有审批单，断言被拦截抛出 400；
  - 构造并发请求测试：断言仅有 1 次成功，重复请求抛出 409 Conflict。
- **【验收标准】**：
  - 错误动作类型的审批记录被直接阻断；并发审批仅 1 次生效；崩溃后审批单具备可查状态；维持 Mock 演示模式隔离。
- **【精确回退方案】**：根据记录的 diff 仅撤回该 Service 的改动。
- **【统筹复审点】**：复查审批流原子性与拦截单测。

---

### 12.3 Batch C 任务卡：契约增量扩展与多店归因分析（Contract & Scope Foundation）

- **【任务目标】**：在 `@crosspilot/tool-platform` 与 `@crosspilot/shared` 增量导出 `evidenceMeta` 与 `errorEnvelope`；完成多店归因关系样例的文档建模。
- **【包含范围】**：
  1. `packages/tool-platform/src/contracts/tool.types.ts`：以可选字段增量添加 `evidenceMeta` 与 `errorEnvelope`（注明二者与 `error` 映射一致，不得冲突）；
  2. `packages/shared/src/contracts/`：增量导出 `EvidenceMeta`、`EvidenceValueStatus`、`EvidenceFreshness` 与 `ApprovalProof`；
  3. 选取至少一个真实 Tool 生产者与一个消费方完成运行时字段透传验证。
- **【非目标】**：严禁删除已有 `success`、`traceId`、`durationMs`；严禁对 `skus` 表执行破键迁移。
- **【依赖前置】**：Batch B 验收通过。
- **【现有对应物】**：`tool.types.ts:51`、`schema.prisma:190, 1350`。
- **【失败复现策略】**：运行全仓类型检查 `pnpm -r typecheck`，断言已有 28 个工具无任何编译报错。
- **【验收标准】**：
  - Typecheck 10/10 workspaces CLEAN；
  - 单测证实生产者填入 `evidenceMeta` 与 `errorEnvelope` 后消费方能无损读取。
- **【精确回退方案】**：仅反向撤回新增接口文件与扩展字段声明。
- **【统筹复审点】**：核查类型向下兼容性与运行时透传测试。

---

### 12.4 Batch D 任务卡：端到端样本收敛与既有自动化对接（End-to-End Alignment）

- **【任务目标】**：在日运营诊断补货链路上验证全链路闭环，完全复用既有 `AutomationOperation` 与 Recovery Worker。
- **【包含范围】**：
  1. 验证补货建单出现超时时正确记录 `effect: UNKNOWN, recovery: QUERY`；
  2. 验证 Recovery Worker 能够定时扫描并自愈，前端抽屉如实渲染凭据。
- **【非目标】**：严禁新建平行执行系统；严禁放宽本期采购全人工审批约束。
- **【依赖前置】**：Batch A、B、C 全部通过。
- **【现有对应物】**：`PurchaseAutomationService`、`AutomationRecoveryProcessor`、`action-detail-drawer.tsx`。
- **【失败复现策略】**：在测试环境中注入 ERP 超时，断言系统未标永久 FAILED，成功进入恢复队列。
- **【验收标准】**：端到端测试 100% 通过；抽屉展示真实执行证据。
- **【精确回退方案】**：仅撤回对应测试用例与端到端配置。
- **【统筹复审点】**：统筹独立重跑端到端闭环测试。

---

### 12.5 Batch E 任务卡：条件触发的高阶架构演进（Conditional Evolution）

- **【任务目标】**：当业务出现第 3 个重复度高的 SOP 且流程跨越 3 个以上 Workflow 时，演进 Playbook 注册器与确定性 UseCaseRouter。
- **【非目标】**：本轮不作实施。

---

## 13. 推荐参考仓库与规范清单

| 仓库名称与组织 | 引用文件 / 核心机制 | 权威链接与版本状态 | 许可证条款与商用边界 | 本项目复用方式 |
|---|---|---|---|---|
| `anthropics/commerce-agents` | `docs/safety.md`<br>`merchant-agent/` | [GitHub 默认分支](https://github.com/anthropics/commerce-agents)<br>**【未锁定固定版本】** | `Apache-2.0`。<br>官方声明为 unmaintained reference，无生产鉴权。 | 仅吸收 Provenance Gate、Staged Write 与 Apply 前二次检查思想；自研生产级安全体系。 |
| `Shopify/claude-for-commerce-examples` | `merchant/backend/`<br>`local_store.py` | [GitHub 默认分支](https://github.com/Shopify/claude-for-commerce-examples)<br>**【未锁定固定版本】** | `Apache-2.0`。<br>基于 Anthropic 蓝图构建，系继承关系。 | 吸收 Mock/Simulator 替身共用审批管道的同构设计，不复制代码。 |
| `KuudoAI/amazon_ads_mcp` | `src/errors.ts`<br>MCP schema | [GitHub 默认分支](https://github.com/KuudoAI/amazon_ads_mcp)<br>**【未锁定固定版本】** | `MIT`。<br>商用友好。 | 借鉴 `ToolErrorEnvelope` 字段设计，严格区分参数修正与重发重试。 |
| `zach22-1999/amazon-skills` | `zach-seller-skill-creator/` | [GitHub 默认分支](https://github.com/zach22-1999/amazon-skills)<br>**【未锁定固定版本】** | 根目录 `MIT`，子模块 `Apache-2.0`。 | 吸收业务 6 问门禁与 Baseline 对比评测方法论。 |
| `JuneYaooo/launchfit-ai` | `skills/compliance-gate/` | [GitHub 默认分支](https://github.com/JuneYaooo/launchfit-ai)<br>**【未锁定固定版本】** | **`PolyForm Noncommercial 1.0.0`**。<br>包含明确非商业限制。 | **严格隔离代码**；仅借鉴其合规缺失阻断（HOLD）的业务流程设计。 |
| `zach22-1999/seller-second-brain` | `docs/decision-memory.md` | [GitHub 默认分支](https://github.com/zach22-1999/seller-second-brain)<br>**【未锁定固定版本】** | **`CC BY-NC-SA 4.0`**。<br>包含非商业与相同方式共享限制。 | **严格隔离代码**；仅借鉴 Decision Record 的元数据模型设计，暂缓实施。 |

---

## 14. 交付总结与统筹审核对接

本修订版严格闭环了统筹复审（R2）提出的全部阻断与修订项：
1. **彻底消除无效哈希**（ER2-01）：全部删除 404 哈希与未经证实的日期，诚实标注未锁定固定版本，澄清继承关系；
2. **校正源码真实细节**（ER2-02）：按实际源码修正调用链、方法名、路由、字段名与默认模式，明确事实分级标注；
3. **落实 Batch A 可执行隔离规则**（ER2-03）：不依赖不存在的字段，首选直接封闭 legacy reset 不安全入口（保留 v2 Run），给出真实测试覆盖；
4. **统一契约与模式定义**（ER2-04）：统一 `evidenceMeta` 与 `valueStatus`，允许 `observedAt` 为空，明确归因未成熟不归入 STALE，unsupported 显式拦截，模式覆盖 HTTP ERP simulator；
5. **规范效力归位并保留采购约束**（ER2-05）：规范效力严格限定在本参考包内部，严格保留本期采购全人工审批与 high risk 约束，移除任何默认金额/比例数字；
6. **修复任务卡完整性**（ER2-06）：纠正依赖反向，规范实际用例与单测命令，确立精确撤回改动的回退方案。

**当前状态：** `READY_FOR_REVIEW`。  
**纪律承诺：** 本轮只改文档，未修改业务代码、未安装 Skill、未迁移数据库、未提交推送部署；不自行判 PASS，不实施 Batch A，等待统筹最终裁定。
