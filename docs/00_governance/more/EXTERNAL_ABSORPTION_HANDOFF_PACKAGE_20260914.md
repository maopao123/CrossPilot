# 外部设计吸收：后续全部执行提示词交接包

日期：2026-09-14。整理：Kimi Code（接替额度耗尽的 Codex 统筹会话）。
用途：Codex 统筹额度耗尽，后续审核与执行由其他 AI 工具分担。本包汇集从当前断点到最终验收所需的全部提示词，按顺序使用。

项目根目录：`E:\AiSecondBrain\vault\Work\Projects\CrossPilot`。
权威任务卡：主方案 [CrossPilot_External_Design_Absorption_Plan.md](./CrossPilot_External_Design_Absorption_Plan.md) §12（Batch A～E）。
当前批次状态：**Batch A 实施回交已被统筹判 CHANGES_REQUESTED**（[EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md](./EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md)）；**Batch B～E 未放行**。

## 0. 全局规则（每个提示词都隐含，不再重复书写）

- **放行链**：Batch A 复审 PASS → 放行 B；B 复审 PASS → 放行 C；C 复审 PASS → 放行 D；D 复审 PASS → 最终验收。E 为条件触发，见 §6。任何一批未 PASS，后续批次的执行提示词不得发出。
- **门禁纪律**：批次结论（PASS / CHANGES_REQUESTED）只能由统筹方填写；执行方只能自报 `READY_FOR_REVIEW`，完成后停止，不自行推进下一批。
- **执行纪律**：先写失败复现测试再修；不提交、不推送、不部署；不改动 Automation v1 已通过 G1 的代码行为；证据写入 `artifacts/external-absorption/batch-<字母小写>/`，不覆盖统筹证据目录。
- **回交内容**：文件清单、before/after 调用链、测试命令与退出码、Git HEAD 与变更指纹、未验证项与风险。

## 1. 当前断点状态速览

| 线程 | 状态 | 下一步 |
|---|---|---|
| 外部设计吸收 Batch A | CHANGES_REQUESTED（BA-R1～R3） | 执行方按复审报告 §4 修复 → §2 复审提示词 |
| 外部设计吸收 Batch B～D | 未放行 | 前置批次 PASS 后依次使用 §3～§5 |
| 外部设计吸收 Batch E | 条件未触发 | §6 仅做触发评估 |
| Automation v1 G2/G3 | 执行方自报修复完成、READY_FOR_REVIEW（G1 已 PASS） | 统筹另行安排 G2/G3 复验，见 `AUTOMATION_EXECUTION_EVIDENCE.md` 门禁矩阵；与外部吸收线相互独立 |

## 2. 提示词：Batch A 修复后复审（给接任统筹 AI）

> 前置：执行方已按 `EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md` §4 完成修复并自报 READY_FOR_REVIEW。Batch A 修复执行提示词即为该报告 §4，直接复制给执行 AI 即可。

```text
你是 CrossPilot 项目的统筹审核 AI。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。
先读项目 AGENTS.md、docs\HANDOFF.md。

任务：对 Batch A 修复后的回交做独立复审。缺陷与修复要求见：
docs\00_governance\more\EXTERNAL_ABSORPTION_BATCH_A_REVIEW_20260914.md
执行方新证据应在 artifacts\external-absorption\batch-a\（统筹证据在 review-codex 子目录，不得被覆盖）。

复审步骤（全部独立执行，不采信执行方自报数字）：
1. 核实 Git HEAD 与工作区 diff；A-1 相关文件（simulator.service.ts、simulator-adapter.ts 等）指纹不得变化，可对照 artifacts\external-absorption\batch-a\review-codex\fingerprints.json。
2. 独立复跑执行方全部定向测试（api 3 套件、mapper 验收、web 2 个测试文件）与其新增的失败复现测试，记录命令与退出码。
3. 先构建 pnpm --filter @crosspilot/integrations build，再重跑统筹独立探针：
   node artifacts\external-absorption\batch-a\review-codex\batch-a-probes.cjs
   必须 4/4 PASS（A-SERVICE-MISSING-LIVE / A-TREND-MISSING / A-UI-MISSING / A-UI-ZERO）。如探针因合理重构失效，修正探针的加载方式但不得放松断言标准，并在报告中说明。
4. 复跑 G1 两轮 19 项探针（artifacts\automation-v1\g1-review\、g1-review-round2\）与 node scripts\run-automation-acceptance.cjs（E01～E15），必须全过。
5. 人工抽查三处源码：market.service.ts 不得再有 LIVE 分支常数回退与模板编造 trending；xydc.mapper.ts trending 子字段缺失为 null；page.tsx 无数据时不渲染结论性文案。
6. 自写至少 1 个执行方未覆盖的对抗探针（例如：products 非空但部分字段缺失的混合输入），防止"只修探针断言点"。

结论只能是 PASS 或 CHANGES_REQUESTED。PASS 则更新主方案文档顶部裁定、docs\HANDOFF.md 状态，并按交接包 §3 放行 Batch B；CHANGES_REQUESTED 则给出逐条修复要求与新提示词。只新增审核文档，不改业务代码，不提交不推送。
```

## 3. 提示词：Batch B 执行（给执行 AI）

> 前置：Batch A 复审 PASS。此前不得发出本提示词。

```text
你是 CrossPilot 项目的执行工程师。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。
先读项目 AGENTS.md、docs\HANDOFF.md。

统筹已放行外部设计吸收 Batch B（入口矩阵与可信审批加固）。权威任务卡：
docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md §12.2
背景同方案 §3.3（审批链路真实薄弱点分析）。

本次只做以下三件事：
1. 在 apps\api\src\modules\operation-automation\ 模块内部定义局部 ApprovalProof 类型（不反向依赖未导出的包）。
2. 改写 operation-automation.service.ts 的 approveAndExecute（约 :155 起）：审批状态更新改为原子 CAS（updateMany 带 status: 'PENDING' 条件，按影响行数判成败）；强校验审批记录声明的 actionType、targetId 与待执行任务完全一致，不匹配抛 400；重复/并发请求抛 409。
3. 建立批准后派发前崩溃的恢复追踪：审批单置 APPROVED 后、dispatch 完成前崩溃时，该审批单具备可查的待执行状态，不得丢单。

失败复现（先写后修）：
- 调用 POST /api/v1/operations/approve/:approvalId，传入 actionType 或 targetId 不匹配的已有审批单，断言被 400 拦截；
- 并发请求同一审批单，断言仅 1 次成功，其余 409。

明确不做：不让 @crosspilot/actions 反向依赖 Prisma；不修改已冻结的 Amazon Write 接口；该链路保持 MOCK/mock-rpa 演示模式隔离不变。

回归要求：G1 两轮 19 探针、E01～E15、受影响包 typecheck 保持全过。
纪律：不提交、不推送、不部署。证据写入 artifacts\external-absorption\batch-b\，完成后输出文件清单、测试命令与退出码、Git 指纹、未验证项，标 READY_FOR_REVIEW 并停止。
```

### 3.1 提示词：Batch B 复审（给接任统筹 AI）

```text
你是 CrossPilot 项目的统筹审核 AI。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。

任务：对 Batch B（审批加固）回交做独立复审。任务卡：docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md §12.2；执行方证据在 artifacts\external-absorption\batch-b\。

复审要点：
1. 独立复跑执行方测试（400 拦截、并发 409、崩溃恢复追踪）与 G1 19 探针、E01～E15 回归。
2. 人工核对源码：CAS 更新必须是单条原子语句（updateMany 条件更新），不接受"先查后改"；actionType/targetId 校验发生在状态变更之前；APPROVED 未派发状态有真实持久化记录可查。
3. 自写对抗探针：构造审批单 payload 与执行参数仅一处字段不同的用例，断言被拒；验证 CAS 在真实数据库并发下只有一次生效（用隔离测试库实测，不看 mock）。
4. 确认 MOCK/mock-rpa 隔离未被破坏，Amazon Write 冻结接口未被触碰。

结论 PASS / CHANGES_REQUESTED 由你填写；PASS 后放行 Batch C（交接包 §4）。只新增审核文档，不改业务代码。
```

## 4. 提示词：Batch C 执行（给执行 AI）

> 前置：Batch B 复审 PASS。

```text
你是 CrossPilot 项目的执行工程师。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。
先读项目 AGENTS.md、docs\HANDOFF.md。

统筹已放行外部设计吸收 Batch C（契约增量扩展与多店归因分析）。权威任务卡：
docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md §12.3；契约定义见 §9。

本次只做以下三件事：
1. packages\tool-platform\src\contracts\tool.types.ts：ToolExecutionResult 以可选字段增量添加 evidenceMeta?: EvidenceMeta[] 与 errorEnvelope?: ToolErrorEnvelope；原有 success、traceId、durationMs、error、cost 字段一律不动。
2. packages\shared\src\contracts\：增量导出 EvidenceMeta、EvidenceValueStatus、EvidenceFreshness、ApprovalProof（定义以主方案 §9.2、§9.3 为准）。
3. 选取至少一个真实 Tool 生产者与一个消费方完成运行时字段透传验证：生产者填入 evidenceMeta/errorEnvelope，消费方无损读取，单测实证。

明确不做：不删除或改名任何现有字段；不对 skus 表执行破键迁移；多店归因只做文档建模（主方案 §6 三个场景），不改 schema。

验收：pnpm -r typecheck 全部 workspace 0 errors；透传单测通过；G1 19 探针与 E01～E15 回归全过。
纪律：不提交、不推送、不部署。证据写入 artifacts\external-absorption\batch-c\，标 READY_FOR_REVIEW 并停止。
```

### 4.1 提示词：Batch C 复审（给接任统筹 AI）

```text
你是 CrossPilot 项目的统筹审核 AI。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。

任务：对 Batch C（契约增量扩展）回交做独立复审。任务卡：主方案 §12.3；执行方证据在 artifacts\external-absorption\batch-c\。

复审要点：
1. 独立运行 pnpm -r typecheck，确认全部 workspace 0 errors。
2. 核对 tool.types.ts diff：只新增可选字段，原字段逐字保留（success/traceId/durationMs 不得有任何改动）。
3. 独立复跑透传单测；自写 1 个消费方读取旧格式（无新字段）响应的兼容性测试，确认向下兼容。
4. 确认 skus 唯一键、schema.prisma 未被改动（git diff packages/db/prisma/ 应为空）。
5. G1 19 探针与 E01～E15 回归全过。

结论 PASS / CHANGES_REQUESTED 由你填写；PASS 后放行 Batch D（交接包 §5）。只新增审核文档，不改业务代码。
```

## 5. 提示词：Batch D 执行（给执行 AI）

> 前置：Batch A、B、C 全部复审 PASS。

```text
你是 CrossPilot 项目的执行工程师。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。
先读项目 AGENTS.md、docs\HANDOFF.md。

统筹已放行外部设计吸收 Batch D（端到端样本收敛与既有自动化对接）。权威任务卡：
docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md §12.4。

本次只做以下两件事，全部复用既有 AutomationOperation 与 AutomationRecoveryProcessor：
1. 在日运营诊断补货链路上验证：ERP 建单超时/网络错误时正确记录 effect: UNKNOWN、recovery: QUERY；Recovery Worker 定时扫描后经远端反查收敛（存在→APPLIED，确认不存在→按 Case 2 重建），前端 action-detail-drawer 如实渲染证据。
2. 失败复现先行：在隔离测试环境注入 ERP 超时，断言系统不标永久 FAILED、进入恢复队列；再断言 worker 收敛路径真实执行（真实 PG + 隔离 Redis + Loopback HTTP fixture）。

明确不做：严禁新建平行执行系统或第二套恢复 Worker；严禁放宽采购全人工审批约束（CREATE_PURCHASE_ORDER 始终 needApproval: true、high 风险、L3 或人工）；不接真实平台写入。

验收：端到端测试通过；G1 19 探针与 E01～E15 回归全过；typecheck clean。
纪律：不提交、不推送、不部署。证据写入 artifacts\external-absorption\batch-d\，标 READY_FOR_REVIEW 并停止。
```

### 5.1 提示词：Batch D 复审（给接任统筹 AI）

```text
你是 CrossPilot 项目的统筹审核 AI。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。

任务：对 Batch D（端到端对齐）回交做独立复审。任务卡：主方案 §12.4；执行方证据在 artifacts\external-absorption\batch-d\。

复审要点：
1. 独立重跑端到端闭环测试（注入 ERP 超时 → UNKNOWN/QUERY → worker 自愈收敛），在真实隔离 PG/Redis 上执行，不看 mock 结果。
2. 自写对抗探针：构造"超时但远端实际已建单"的场景，验证 QUERY 反查后不会产生重复建单（幂等键防重）。
3. 确认没有引入任何平行执行/恢复系统；采购审批约束未被触碰（grep CREATE_PURCHASE_ORDER 相关 needApproval 与 riskLevel）。
4. G1 19 探针与 E01～E15 回归全过。

结论 PASS / CHANGES_REQUESTED 由你填写；PASS 后进入最终验收（交接包 §7）。只新增审核文档，不改业务代码。
```

## 6. Batch E：仅触发评估，不实施

Batch E（Playbook 注册器与确定性 UseCaseRouter 演进）为**条件触发**：仅当业务出现第 3 个重复度高的 SOP 且流程跨越 3 个以上 Workflow 时才启动。当前条件未满足，本轮不实施、不放行。

触发评估提示词（需要时再用）：

```text
你是 CrossPilot 项目的统筹审核 AI。请评估 Batch E 触发条件是否满足：
统计当前代码库中重复度高（结构相似度可机械判定）的业务 SOP 数量，以及每个 SOP 跨越的 Workflow 数。
仅当存在第 3 个高重复 SOP 且其流程跨越 3 个以上 Workflow 时，结论为"条件满足"，并按主方案 §12.5 起草实施任务卡（仍需独立评审后放行）；否则结论为"条件未满足"，不做任何实施。
```

## 7. 提示词：最终验收（给接任统筹 AI）

> 前置：Batch A～D 全部复审 PASS。

```text
你是 CrossPilot 项目的统筹审核 AI。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。

任务：对外部设计吸收全部批次做最终验收，并裁定是否允许提交。

验收清单：
1. 全量回归独立复跑：G1 两轮 19 探针、scripts\run-automation-acceptance.cjs（E01～E15）、pnpm -r typecheck、pnpm --filter @crosspilot/web build，全部通过。
2. 重跑统筹全部独立探针（含 batch-a 的 4 项与你在 B/C/D 复审中自写的对抗探针），全部 PASS。
3. 文档一致性：主方案、HANDOFF.md、各批次证据报告中的状态、HEAD、指纹相互一致；六个无效上游哈希未复活；无"已核验"无依据断言。
4. 纪律核查：git log 确认全程无未授权 commit/push；改动范围与各批次任务卡一致，无夹带。
5. 确认主方案 §11 禁止事项全部未被触碰（无自由 LLM Planner、无平行执行系统、skus 未破键、采购全人工审批未放宽）。

全部通过后：更新主方案文档状态为 ACCEPTED、更新 docs\HANDOFF.md，并明确告知用户"可以提交"。是否执行 commit/push 由用户决定，你不主动执行。任何一项不过，判 CHANGES_REQUESTED 并给出修复提示词。
```

## 8. 附：Automation v1 线程待办（与外部吸收线并行）

- G1 已 PASS（统筹两轮 19 探针独立复跑确认）。
- G2/G3 执行方已按终审（`AUTOMATION_FINAL_REVIEW_20260914.md`）自报修复完成，门禁矩阵仍为"待统筹复审"——**G2/G3 复验尚未执行**，是独立于本交接包的待办；复验时应独立重跑 E07～E15 真实 PG 场景、核对 F-P0-1～F-P0-4 修复源码、并确认 `AUTOMATION_EXECUTION_EVIDENCE.md` 门禁栏由统筹填写。
- 注意：HEAD `c413076` 的提交信息声称 "A0~A8, E01~E15 PASS"，但提交信息不等于独立终验；且该提交发生在终审 CHANGES_REQUESTED 之后，复验时需确认终审判定与提交内容的对应关系。
