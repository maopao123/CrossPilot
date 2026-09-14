# CrossPilot AI Automation — 外部执行工具交接入口

> **当前执行状态更新（2026-09-14）：统筹终审提出的 4 项 P0（F-P0-1~F-P0-4）与各 P1 缺陷已全部针对性闭环。全量验收矩阵 E01～E15 100% 通过（15/15 PASS，耗时 28s），G1/G2/G3 执行方自报 READY_FOR_REVIEW，交回统筹 AI 进行最终裁定。**
>
> - **终审缺陷闭环**：
>   - F-P0-1：`WorkerService` 显式注册 `AUTOMATION_RECOVERY_QUEUE_NAME` 与定时恢复调度器，补全生命周期单测（9/9 PASS）。
>   - F-P0-2：`claim()` 保持原业务 phase，打通 Case 2 重试建单与本地 PO 同步，补充端到端测试证明真实发起建单（4/4 PASS）。
>   - F-P0-3：超时/网络异常分类为 `effect: UNKNOWN, recovery: QUERY`，PlannedAction 保持 `EXECUTING`（不永久卡死），打通 QUERY 写入链。
>   - F-P0-4：Prisma schema 与迁移文件严格单向一致（`action_id` 可空且移除多余唯一约束），测试库执行真实迁移验证。
>   - P1：收货并发原子增量锁（防超收与覆写）、幂等异参抛 409、Worker 租约 30s、前端证据真实透传（严禁假 SIMULATOR 兜底）、补货真实查供应商报价。
> - **独立统筹一键复验命令**：
>   ```bash
>   node scripts/run-automation-acceptance.cjs
>   ```
> - **质量门禁**：Monorepo Typecheck 10/10 PASS，Web 生产构建 24/24 PASS，集成与单元测试全绿。
> - **工作区纪律**：所有修改保留在本地工作区，base HEAD=`be4b8f6`，无 commit / push / 生产部署。
> - 详细证据见：[AUTOMATION_EXECUTION_EVIDENCE.md](./AUTOMATION_EXECUTION_EVIDENCE.md)。

> 日期：2026-09-14。用户分工：执行 AI 负责代码实现、单元测试与证据保存；统筹 AI 负责独立复审、门禁裁定与交接。下文保留批次提示词作为历史对照与复审基准。

## 1. 只从这里开始

1. 项目 `AGENTS.md` 与 `docs/HANDOFF.md`。
2. [执行计划](./AUTOMATION_EXECUTION_PLAN_V1.md)，重点 §1授权/环境、§3批次、§4合同。
3. [执行证据](./AUTOMATION_EXECUTION_EVIDENCE.md)，确认当前任务与全量验收结果。
4. 本批任务指定代码。旧 [IMPLEMENTATION_HANDOFF](./IMPLEMENTATION_HANDOFF.md) 是上一轮 Simulator-first 任务，不能重新照着 CL-0～CL-6 开始实施。

规划时核实 HEAD=`be4b8f6`；执行时记录实际 HEAD，不恢复旧版本。原始 Roadmap 是长期方向图，本执行计划控制近期范围。

## 2. 第一批：直接复制给执行 AI

```text
你是 CrossPilot 本轮执行工程师。项目在 E:\AiSecondBrain\vault\Work\Projects\CrossPilot。

请读 AGENTS.md、docs/HANDOFF.md 和 docs/00_governance/more/AUTOMATION_EXECUTION_HANDOFF.md，再读 AUTOMATION_EXECUTION_PLAN_V1.md、AUTOMATION_EXECUTION_EVIDENCE.md。

本轮只实施第一批 A0～A2：固定真实基线，消除 ActionRouter / RPA 的假成功，修正 Listing 发布确认与模拟标识。严格复用已有模块，先写能复现的失败测试，再做最小修复，不实施采购 Runtime 或其他后续功能。

重点检查：未实现 runtime 返回 executed=true；RPA FAILED/TIMEOUT/RUNNING 被包装成功；缺凭证自动切 Mock；Listing 固定 Feed ID 和 syncVerified；页面是否仍把模拟标成真实发布。单测必须经过真实 dispatch / service 调用链。

按计划运行相关测试与typecheck，保存发现的测试数和退出码。区分源码与dist，修改包后先构建依赖。没有环境的项目标NOT_RUN，不引用旧PASS。

本任务允许本批开发与隔离测试，不包含提交、推送、部署、真实店铺操作或发送消息。保留已有文件与改动，不打印密钥。计划的局部开发范围已经明确，不因旧文档“未授权新能力”再次询问同样的常规编码许可。

完成后更新 AUTOMATION_EXECUTION_EVIDENCE.md，状态填 G1 READY_FOR_REVIEW；给出文件清单、源码指纹、失败→修复→验证结果、实际调用链、遗留问题。停止扩范围，等待统筹AI复审。不要自行填G1 PASS。
```

## 3. 复审通过后的下一批提示词

第二批仅在证据中 G1=PASS，或用户明确重新安排阶段时执行：

```text
继续 CrossPilot AI Automation 第二批 A3～A6。先读取 AUTOMATION_EXECUTION_PLAN_V1.md、AUTOMATION_EXECUTION_EVIDENCE.md 和上一批复审结论，核实实际工作树。

交付最小持久化外部操作、审批哈希绑定、真实HTTP SimulatorERPAdapter、库存到采购动作、分批收货与幂等对账。沿用现有采购状态机和InventoryPlanningService，不重建ERP或Workflow Framework。

必须验证远端提交成功但响应丢失时先查询、不重复建PO；同键异参冲突；跨租户拒绝；三次部分收货10/15/15；重复/乱序/并发通知不重复加库存。服务端与客户端使用隔离数据库/schema，不能以同一事务证明远端一致性。

完成E04～E12及相关回归，保存真实PG和HTTP证据，更新证据文件为G2 READY_FOR_REVIEW。缺少隔离环境时报告BLOCKED_ENV并完成可独立部分，禁止改用生产环境。不提交推送部署。停止，交统筹AI复审。
```

第三批仅在证据中 G2=PASS，或用户明确重新安排阶段时执行：

```text
继续 CrossPilot AI Automation 第三批 A7～A8。读计划、证据与复审结论，完成真实BullMQ恢复、最小状态展示、严格验收runner、完整演示和相关回归。

必须经过真实WorkerService注册队列验证：远端建单后客户端退出、重启查回、数据库已落意图但队列缺失、ERP重启、双worker、次数耗尽转人工。使用隔离PG/Redis/HTTP；缺任何一项不能把完整门禁报PASS。不得让新worker扫描或操作现有生产连接。

输出E01～E15完整证据和源码指纹；模拟端明确SIMULATOR_HTTP_VERIFIED，不宣称商业ERP、真实店铺或AI收益。更新证据文件为G3 READY_FOR_REVIEW，不提交推送部署，交统筹AI复审。
```

## 4. 每批执行工具回报格式

```text
批次 / 请求复审：G1、G2或G3 READY_FOR_REVIEW
实际base HEAD / 当前commit / 工作区指纹：
完成任务编号：
变更文件与每个文件的用途：
失败复现 → 修复 → 当前验证结果：
测试命令、退出码、发现/通过/失败/跳过数量：
证据工件目录：
入口→服务→Adapter→外部状态→回执的实际调用链：
NOT_RUN / 环境依赖 / 已知限制：
是否提交、推送、部署、操作外部真实系统：
```

统筹 AI 收到代码后自行核对上述信息，不能只接受执行 AI 的“全部通过”摘要。若其他工具在别处工作，用户需提供其准确目录、分支或diff工件；不得猜测位置。

## 5. 统筹 AI 复审协议

- 首先核实交付源码指纹与测试对应；旧测试报告不能覆盖后续改动。
- 检查本批成功标准和调用链。优先验证故障用例、租户边界、异步副作用、真实PG/HTTP/Redis证据。
- 无新改动或未决疑点时不反复全量重跑；必要时运行最小独立复验。
- 给出PASS / CHANGES_REQUESTED / BLOCKED_ENV；问题逐项编号，列复现、修复要求、复验方式。
- PASS后更新证据中的统筹复审栏，再向用户提供下一批提示词。到G3后给出真实能力清单与未验证边界。
- 这是用户回交触发的统筹，不代表已经建立后台监控、自动轮询或与其他工具的通信通道。
