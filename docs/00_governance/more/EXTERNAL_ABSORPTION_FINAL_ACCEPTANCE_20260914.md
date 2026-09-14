# 外部设计吸收：全批次最终验收

日期：2026-09-14。统筹：Kimi Code（接替额度耗尽的 Codex 统筹会话完成全程）。
验收规程：[EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md](./EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md) §7。

**结论：ACCEPTED。外部设计吸收 Batch A～D 全部验收通过，主方案实施线关闭。可以提交（commit/push 与否由用户决定，统筹不代执行）。**

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。基线 HEAD：`e474c20`。

## 1. 批次门禁终态

| 批次 | 内容 | 复审历程 | 终态 |
|---|---|---|---|
| Batch A | legacy reset 封闭 + XYDC 数据真实性 | R1 CHANGES_REQUESTED（BA-R1～R3）→ R2 PASS | **PASS** |
| Batch B | 审批加固（强校验/原子 CAS/崩溃追踪） | 一轮 PASS（真实库并发探针 9/9） | **PASS** |
| Batch C | 契约增量扩展（evidenceMeta/errorEnvelope） | 一轮 PASS（对抗探针 4/4） | **PASS** |
| Batch D | 端到端自愈闭环 + F-6 修复 | R1 CHANGES_REQUESTED（D-R1 假收敛）→ R2 PASS（对抗探针 6/6+3/3） | **PASS** |
| Batch E | 高阶架构演进 | 条件未触发，不实施 | **不适用** |

## 2. 最终验收清单（全部独立实测）

1. **全量回归**：G1 三轮探针 29/29；E01～E15 15/15（真实隔离 PG/Redis，29s）；`pnpm -r typecheck` 10/10 clean；`pnpm --filter @crosspilot/web build` 24/24 页面编译通过（本轮补独立复跑）。
2. **统筹全部独立探针复跑通过**：Batch A（codex 4/4 + R2 6/6）、Batch B（真实库对抗 9/9）、Batch C（R2 4/4）、Batch D（对抗 6/6 + R2 3/3）。共计 41 项统筹探针全绿。
3. **文档一致性**：主方案顶部裁定链（A→D 各轮结论）、docs/HANDOFF.md 状态、各批次复审报告相互一致，HEAD 引用统一为 e474c20；§13 六个无效上游哈希未复活，全部标注【未锁定固定版本】。
4. **纪律核查**：git log 确认全程无 commit/push/deploy；各批次改动范围与任务卡一致，无夹带（指纹逐批实测核对）。
5. **§11 禁止事项**：无自由 LLM Planner；无第二套恢复 Worker（单一 recovery 队列/processor）；skus 唯一键未破（prisma diff 全程为空）；采购 CREATE_PURCHASE_ORDER 保持 needApproval: true + high 风险 + 未审批强阻断。

## 3. 遗留事项移交（不阻塞验收，后续迭代处理）

- **F-1**：`getProductOpportunities` 预制机会卡（写死 8.6 分、编造评论统计）——真实性旧债，建议单独立项修复。
- **F-2**：trending 为空时「高增长买家搜索词」标题仍渲染——前端润色。
- **F-3**：审批状态机复用 Approval.comment 字段——建议迁独立字段/表。
- **F-4 / F-5**：controller `user?.sub` 静默降级；mock 发布流 `price || 29.99` 兜底。
- **F-7**：tool.executor catch 分支 errorEnvelope 与 error 可能冲突的路径无测试覆盖。
- **F-8**：shared 与 operation-automation 两份 ApprovalProof 契约字段松紧不一，需归一。
- **F-9**：evidenceMeta 顶层与 data 内双存，需统一读取口。
- **F-10 / F-11**：恢复收敛比对在 supplierId/金额字段缺失时静默退化；NEEDS_ATTENTION 缺人工处理后的恢复入口。

## 4. 并行线程待办（不属于本次验收范围）

- **Automation v1 G2/G3 复验**：执行方已自报修复完成，统筹复验尚未执行（见交接包 §8 与 `AUTOMATION_EXECUTION_EVIDENCE.md`）。注意 HEAD `c413076` 提交信息声称 "A0~A8 PASS" 不等于独立终验。
- 执行方两次写动仓库外 `E:\AiSecondBrain\HANDOFF.md`，请用户知悉。

## 5. 裁定

外部设计吸收方案实施线（Batch A～D）**ACCEPTED**。工作区改动已具备提交条件；commit/push 由用户决定并执行。Batch E 保持条件触发（第 3 个高重复 SOP 且跨 3+ Workflow 时另行评估）。
