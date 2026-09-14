# 外部设计吸收：Batch C 回交独立复审

日期：2026-09-14。统筹：Kimi Code。

**结论：PASS。契约增量扩展、运行时透传、零破键三项目标全部经独立验证闭环，放行 Batch D。** 登记 4 项非阻断问题（§4），其中 F-6（证据标签过度声称）与本项目真实性主题直接相关，要求在 Batch D 回交前一并修复或单独小批修复。

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：执行方（Gemini）按主方案 §12.3 与交接包 §4 实施的 Batch C 回交，自报 `READY_FOR_REVIEW`，证据 `artifacts/external-absorption/batch-c/BATCH_C_EXECUTION_EVIDENCE.md`。

## 1. 独立核实依据（非转述执行方报告）

- HEAD 保持 `e474c20`，无 commit/push；改动范围与声明一致，无夹带。
- **指纹**：Batch C 10 个文件自报值与统筹实测全部一致（本轮自报诚实）；Batch A/B 关键文件（xydc.mapper.ts、market.service.ts、operation-automation.service.ts/.controller.ts）指纹与各自验收值一致，无回退。
- **契约 diff 逐字审计**：`tool.types.ts` 原字段 success/data/error/traceId/durationMs/cost 零删除零改名，仅增量；`git diff packages/db/prisma/` 为空，skus 与 channel_identities 唯一约束未动；`evidence-contracts.ts`、`approval-contracts.ts` 与主方案 §9.2/§9.3 逐字段一致（含 `observedAt` 允许 null、"严禁填 now()"注释）；`shared/index.ts` 仅增量 re-export。
- **独立复跑**：`pnpm -r typecheck` 10/10 clean；tool-platform 全量 26/26；api 透传集成 3/3；执行方探针 8/8；Batch A 探针 4/4 + 6/6、Batch B 真实库对抗探针 9/9 回归全过；G1 探针 29/29；E01～E15 15/15（真实隔离 PG/Redis）。
- **统筹新增对抗探针**（`artifacts/external-absorption/batch-c/review-kimi/batch-c-probes-r2.cjs`，真实 dist + 真实 tool-center.service 全链路 vm 执行）**4/4 PASS**：旧格式响应兼容无异常；真实工具错误下 errorEnvelope.code 与 error.code 一致；observedAt 如实为 null 未被填 now()；含 NUL 字节/引号/emoji/`<script>` 的嵌套 evidenceMeta 全链路 deepStrictEqual 无损。

## 2. 任务卡逐项核对

| 要求 | 统筹核实 | 结论 |
|---|---|---|
| ToolExecutionResult 增量可选字段 | 仅新增 evidenceMeta?/errorEnvelope?，原字段逐字保留 | ✅ |
| shared 增量导出契约 | EvidenceMeta/EvidenceValueStatus/EvidenceFreshness/ApprovalProof 与 §9 定义一致 | ✅ |
| 真实生产者+消费方运行时透传 | bi-variance-attribute（生产者）→ tool.executor → tool-center（消费方）内存链路无损，单测+对抗探针实证 | ✅ |
| typecheck 全仓 clean | 10/10 workspace 0 errors | ✅ |
| 非目标 | 无破键迁移、schema 零改动；多店归因仅文档建模 | ✅ |

## 3. 边界确认

- DB 持久化链路不携带新字段（resultJson 仅序列化 data/error）——受 Prisma schema 冻结约束，本轮"透传"验收范围为运行时/内存链路，符合任务卡字面与意图；持久化层扩展属未来批次决策。
- catch 分支对旧 error 字段语义的调整（code/retryable/details 从 err 透传）超出"纯增量"但方向更真实，全量回归无破坏，予以接受并记录在案。

## 4. 非阻断问题登记（移交后续）

- **F-6（要求 Batch D 回交前修复）**：`bi-variance-attribute.tool.ts` 的 evidenceMeta 标注自相矛盾——归因值由公式计算得出，`sourceType` 标 DERIVED 而 `valueStatus` 标 KNOWN（按 §9.2 定义应为 DERIVED）；`observedAt: null` 与 `freshness: 'FRESH'` 矛盾（无时间戳应为 UNKNOWN）。值本身真实，但标签精度违反本轮契约自身的语义定义。
- **F-7**：tool.executor catch 分支 `err.errorEnvelope || {...}` 整体回退，工具抛出 error 与 errorEnvelope 不一致的对象时两码冲突（§9.1 明令"不得冲突"），该路径无测试覆盖；通用执行错误默认 category=VALIDATION 语义误标。
- **F-8**：两份 ApprovalProof 契约并存且字段松紧不一（shared 版 actionId/payloadHash 必填 vs Batch B 本地版可选），后续整合时需裁决归一。
- **F-9**：成功路径 evidenceMeta 在顶层与 data 内各存一份，单边修改会产生分歧源，后续统一读取口。

## 5. 裁定与下一步

**Batch C：PASS。** 主方案文档顶部裁定与 `docs/HANDOFF.md` 已同步更新。

**放行 Batch D**（端到端样本收敛与既有自动化对接，任务卡见主方案 §12.4），执行提示词见交接包 §5。Batch E 继续不放行（条件触发）；Batch D 回交后按交接包 §5.1 复审。

全部改动仍保留在未提交工作区；commit/push 待最终验收（交接包 §7）后由用户决定。
