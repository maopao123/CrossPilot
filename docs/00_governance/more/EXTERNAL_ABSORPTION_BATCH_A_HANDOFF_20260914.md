# 外部设计吸收：Batch A 开工裁定与执行交接

日期：2026-09-14。统筹：Codex。

**裁定：Batch A 计划审核 PASS，允许开工。仅放行本文件限定的安全与数据真实性补丁；不代表实现已验收，不放行 Batch B～E，不改变 Automation v1 的 G1/G2/G3 历史门禁。**

## 1. 本次复验依据

- 已核对 Gemini 第二次局部修订后的主方案、参考包入口与相关规则，以及当前源码对应物。
- 审核基线 HEAD：`e474c20882094d2d34ed0da52591319a077319a8`。审核开始时 tracked 文件无差异；方案和参考包等位于未跟踪文档中。
- 本次审核的主方案为 R2 修订版，共 582 行；添加开工指针前 SHA256：`e763ac72c1673c28728cfe3e818de8df3bd4cc5e8199dda029c1177a9dfd206c`。
- 六个无效上游哈希已从活动主方案和 Reference Skill Pack 的 Markdown 中清除；包内方案已改为主文档入口。历史复审记录和未展开的 zip 不作为实施规范。
- 当前方案已明确关闭无法证明数据归属的 legacy reset，不再凭空依赖 workspace 标记或“无真实店铺”条件；保留 v2 新建 Run。
- 已保留采购人工审批和 high risk 约束；Evidence 时间允许未知，unsupported 与正常空列表分开；本参考包不覆盖既有项目规则。

本轮是开工条件复验，没有执行新的业务验收。后续批次的详细审批恢复设计、上游文件路径核验等留到相应批次评审，不阻塞两个已确认本地缺陷的修复；本批不复制或安装上游代码。

## 2. 本批范围与明确选择

### A-1：关闭不安全 legacy reset

采用主方案 §3.1 的选项 1，**本批不实施选项 2 的来源字段迁移与选择性清理**。

- 主要入口：`apps/api/src/modules/simulator/simulator.service.ts` 的 `reset(workspaceId)`。
- 在任何 fixture 创建、删除和重建写入之前拒绝不安全 legacy reset；使用可识别的 `LEGACY_RESET_DISABLED` 错误码，用户可见说明使用中文，指向新建 v2 Run。
- 原有 v2 workspace 的拒绝行为可保留，避免无关改变既有错误契约。v2 新建 Run 必须继续可用。
- 核实 `SimulatorPersistence.resetWorld` 的实际调用者；若只有已封闭的 Service 入口，不为本任务重构底层删除逻辑。若发现其他生产入口，同样封闭相同危险调用，并在报告中列明。
- 不以“没有 store”“名称以 SIM 开头”或客户端布尔标记判断可以删除。

已接受的产品代价：legacy reset 暂时不可用。不要在报告中称其已经实现混合数据安全清理。

### A-2：修复 XYDC 市场概览的数据真实性

- 起点：`packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts` 的 `toMarketOverview`。
- 清除该路径缺失数据被替换为固定搜索量、价格、评分、评论量、竞品数、分类及商机/竞争分等假值；同时修正摘要中的缺失转零。
- 合法零值保留；null/undefined 保持缺失；非有限值或格式非法时明确拒绝或标缺失，不能变为事实。
- 允许对 `packages/shared/src/contracts/research-contracts.ts` 中现有 MarketOverviewSnapshot 及必要直接消费者做最小兼容调整，使 null 能通过 Mapper → DTO → 派生评分/证据摘要 → 展示。不得只改类型、不修消费者。
- 缺少评分必需数据时不输出虚假高分；复用已有缺数状态/原因表达。保留合法非零数据正常计算和明确 MOCK fixture。
- 本批只补这一链路必要字段与映射，不提前建设 Batch C 的通用 EvidenceMeta/ToolErrorEnvelope 平台，不机械改名现有证据契约。

## 3. 验收与回交

先写断言正确行为的失败测试，修前失败、修后通过。不得修改断言来接受旧错误结果。

**reset 验收：**

1. 有真实店的 workspace 被拒绝，且没有任何数据库变更。
2. 没有真实店但含历史真实/无来源数据的 workspace 同样被拒绝。
3. 隔离测试库放入同 workspace、同日期的真实与模拟日指标、库存快照；请求后相关行内容与数量均保持不变。证明没有先创建 fixture 再报错。
4. v2 新建 Run 的正常路径回归通过，已有 v2 reset 保护保持有效。

**XYDC 验收：**

1. undefined/缺失、显式 null、合法零、正常非零四类输入。
2. 主字段为 0、别名字段为非零时，不能被逻辑或错误替换；字段优先级明确。
3. 证据摘要、派生评分和实际展示消费者不会把缺失转为零或固定分数；正常值仍可正常显示/计算。
4. 现有明确 MOCK 测试数据与模式标记不受破坏。

**回归与环境：**

- 执行受影响包的构建、类型检查与定向测试；若改前端，补对应消费/展示回归。
- 原 G1 两轮探针共 19 项、`scripts/run-automation-acceptance.cjs` 的 E01～E15 按现有隔离流程回归。保留探针与既有断言，记录当前源码对应的构建及命令，避免使用旧 dist。
- 数据库/HTTP/Redis 验证只使用专用隔离环境，明确记录目标；不得回退读取生产 .env 或对业务库运行清理。所需环境不可用时如实报告未验证项，不自报全过。
- 修复前记录当前差异，禁止覆盖他人修改、粗放恢复 packages 目录；如果修复未达标，保持危险入口关闭。

回交内容：文件清单、before/after 调用链、失败复现和修复后日志、测试命令/退出码/数量、Git HEAD 与变更指纹、未验证项和风险。证据存入 `artifacts/external-absorption/batch-a/`，不要覆盖前期统筹证据。最终状态为 `READY_FOR_REVIEW`，完成后停止，等待统筹复验。

## 4. 可直接复制给 Gemini 的提示词

```text
统筹已放行 CrossPilot 外部设计吸收 Batch A 的实施计划。请现在执行，不再进行整篇方案重写。

项目根目录：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot

先读项目 AGENTS.md、docs\HANDOFF.md，并核实当前 HEAD 和已有工作区改动。
本批权威开工范围与验收：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\EXTERNAL_ABSORPTION_BATCH_A_HANDOFF_20260914.md
背景方案：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\docs\00_governance\more\CrossPilot_External_Design_Absorption_Plan.md

本次只做两件事：
1. 在任何写入之前关闭无法证明数据归属的 legacy reset，保留 v2 新建 Run；采用交接文件选定的禁用方案，不做来源字段迁移或混合数据清理。
2. 修复 xydc.mapper.ts 的 toMarketOverview 假默认值及合法零值覆盖，连同必要 DTO、评分、摘要和展示消费链一起闭环。保持合法零、正常值及明确 MOCK fixture，缺数不得生成假事实或假评分。

先写失败测试，再做最小修复；具体测试、隔离环境和既有回归要求按上述交接文件第 3 节执行。测试实际调用当前代码，构建与日志可追溯；不能用旧 dist 或固定输出冒充通过。

允许本批必要的现有研究 DTO/消费方适配，不提前实施 Batch B 的审批重构或 Batch C 的通用契约平台，不改 SKU 唯一键，不装 Skill，不接真实平台写入，不提交、不推送、不部署。

将报告和测试证据写入：
E:\AiSecondBrain\vault\Work\Projects\CrossPilot\artifacts\external-absorption\batch-a\

完成后输出文件清单、复现及修复结果、所有测试命令与结果、未验证项和 Git 指纹；标 READY_FOR_REVIEW 并停止，不自行标验收通过、不推进 Batch B～E。
```
