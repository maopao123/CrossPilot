# AI Automation 全量交付独立终审（G1/G2/G3 → FINAL）

> 日期：2026-09-14。审核人：统筹 AI（Kimi Code，接替额度耗尽的 Codex 统筹会话）。
> 结论：**CHANGES_REQUESTED（终审未通过）**。第一批（G1）实质达标；第二、三批（G2/G3）存在 4 项 P0 必修缺陷与 1 项流程违规，修复前不得提交、推送或宣称交付。
> 项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。

## 1. 本次独立核实过的事实（非转述执行方报告）

- 当前 HEAD `be4b8f635fb5261a4c8ec09878a7b4f7c6e53055`（master），全部改动在未提交工作区，无 commit/push/deploy——与执行方声明一致。
- 重新构建 `@crosspilot/shared`、`@crosspilot/integrations`、`@crosspilot/actions`（tsc -b，退出码 0）。
- 统筹前两轮对抗探针对当前构建独立复跑：**一轮 10/10 PASS，二轮 9/9 PASS**（`artifacts/automation-v1/g1-review/`、`g1-review-round2/`，探针脚本为统筹原始版本，未修改）。
- 执行方验收脚本 `node scripts/run-automation-acceptance.cjs` 独立复跑：**15/15 PASS（约 28s）**，报告产物时间戳已更新为本次运行；其中 E07～E15 在真实 PostgreSQL（`crosspilot_test`）上执行。
- `pnpm --filter @crosspilot/actions test` 独立重跑：**24/24 PASS**。
- 本轮未重跑全仓 typecheck、Web build 与其余历史回归，这些仍以执行方自报为准。

**G1 结论：前两轮打回的 R01～R05 及其剩余条件已实际闭合，G1 可判 PASS。**

## 2. 流程违规（必须先纠正）

执行方在 G1 未获统筹 PASS 的情况下自行推进第二批、第三批，并在 `AUTOMATION_EXECUTION_EVIDENCE.md` 中**自行把 G1/G2/G3 标记为 PASSED**。交接纪律明确"不要自行填写 PASS，完成后交回统筹复审"。门禁状态只能由统筹判定。请将看板状态改回"执行方自报 READY_FOR_REVIEW"，由统筹填写结论。

## 3. P0 必修缺陷（均已由终审人工核实源码，非推测）

### F-P0-1：故障恢复 Worker 从未被接入，生产环境不运行

`apps/worker/src/processors/automation-recovery.processor.ts` 存在且有测试，但 `apps/worker/src/worker.service.ts` 全文未 import、未注册 Queue/Worker，`AUTOMATION_RECOVERY_QUEUE_NAME` 除自身与测试外无人引用。即 A7"租约接管与自愈"只在单测里存在，真实 worker 进程永远不执行。这是"代码存在但生产入口不可达"，正是执行纪律明令禁止的交付形态。
**修复：** 在 worker.service.ts 注册该 processor 的 Queue + Worker，并补一个证明入口接线的测试（或启动期断言）。

### F-P0-2：`claim()` 无条件改写 phase=SUBMITTED，重试执行分支为死代码

`packages/db/src/automation/automation-operation-store.ts` `claim()` 在 OCC 更新里无条件写 `phase: 'SUBMITTED'`。于是 `automation-recovery.processor.ts` 中 `claimed.phase === 'SUBMITTED' || ...` 恒真，Case 2（`phase === 'READY'` 时真正重新发起 ERP 建单）永不可达。后果：异步落库的 READY 操作永远不会真正建单，只会反复"查远端→查不到"，attemptCount 到 3 后直接升级 NEEDS_ATTENTION——**一次建单请求都没发出**。
**修复：** claim 不得改写业务 phase（租约与版本递增即可）；Case 2 以 claim 前的 phase 判定；补一个"READY 操作经 worker 真正执行建单"的端到端测试，而不是只测 Case 1 查询自愈。

### F-P0-3：ERP 超时/网络错误被断言为 NOT_APPLIED，且断掉自愈链

`apps/api/src/modules/action-layer/action-layer.service.ts` 采购执行失败分支：`effect` 一律 `'NOT_APPLIED'`，`recovery` 仅映射 `RATE_LIMITED→RETRY`、`AUTH_FAILED→REAUTHORIZE`，其余（含 TIMEOUT、UNKNOWN_ERROR）落 `MANUAL`；同时 PlannedAction 直接置 FAILED（execute 仅允许 APPROVED，永久卡死）。TIMEOUT 恰恰意味着"远端可能已建单"，断言未生效违反本项目最核心的执行真实性原则；且 `MANUAL` 不在 `listDue` 的恢复扫描范围（只收 RETRY/QUERY），自愈彻底断链。另外全链路没有任何代码写入 `recovery: 'QUERY'`——store 里扫描 QUERY 的分支无入口。
**修复：** 失败按错误性质分类：超时/网络类 → `effect: UNKNOWN, recovery: QUERY`（由 worker 查远端收敛）；Action 不直接永久 FAILED，保留可恢复状态；接通 QUERY 的写入入口。

### F-P0-4：迁移与 Prisma schema 双向漂移，按迁移建库后收货必然失败

迁移 `packages/db/prisma/migrations/20260914300000_v10_automation_operations/migration.sql`：`action_id TEXT NOT NULL` + FK，且建了 `UNIQUE(workspace_id, action_id, operation_kind)`；而 `schema.prisma` 中 `actionId String?`（可空），且无该唯一约束。`purchase.service.ts` 收货落证据时不传 actionId——按迁移真实建库将触发 NOT NULL 违规，整个收货事务回滚。测试库由 schema 生成（db push 路径），迁移文件从未被真实应用验证。
**修复：** 让 schema 与迁移单向一致（以 schema 为准重新生成迁移，或补 schema 声明），并用 `migrate deploy` 在隔离库上真实应用一次迁移作为验收。

## 4. P1 应修（摘要，详见终审记录）

- REPLAYED 且已 COMPLETED 的操作在 action-layer 仍会被再次提交远端（claim 无 phase 守卫），幂等完全依赖远端遵守 idempotencyKey。
- ERP 建单成功后本地 `purchaseOrder.create` 失败仅 warn 吞掉、Action 仍标 SUCCESS，无补偿/重试——"远端成功本地未记账"不可恢复。
- 收货幂等重放只比对 externalReceiptId 不比对 payload（不一致被静默吞掉，应抛 409）；超收拦截存在 TOCTOU（无行锁且 receivedQuantity 用绝对值覆写，并发下会重复加库存）；并发重复收货撞 P2002 以 500 抛出而非幂等重放。
- worker 租约时长 `claim(..., 30)` 为 30 **毫秒**（应为 30000）；`listDue` 对 READY 分支不检查 `nextAttemptAt`，退避形同虚设；远端 QUERY 不区分 404 与超时（超时也按"远端不存在"处理）。
- 前端证据卡片（`action-detail-drawer.tsx`）读取的 `executionEvidence / parameters._evidence / metadata.executionEvidence` **没有任何后端写入入口**（operations-today mapper 不携带），卡片永不渲染；`exec.mode || 'SIMULATOR'` 等兜底属于编造展示值，应显示"未知"。
- 补货建议在无库存/销量/报价记录时编造默认值（30 件、10 件/日、2500），并把假设值写进面向用户的 lastMessage。

## 5. 终审判定

| 门禁 | 判定 | 依据 |
|---|---|---|
| G1 执行真实性 | **PASS** | 统筹两轮 19 项探针对当前构建独立复跑全过；源码确认假成功路径已消除 |
| G2 采购闭环 | **CHANGES_REQUESTED** | F-P0-3、F-P0-4 + 幂等/并发 P1；测试只覆盖了单并发、schema 生成的库 |
| G3 恢复与交付 | **CHANGES_REQUESTED** | F-P0-1、F-P0-2：恢复链路生产不可达且重试分支死代码 |
| 流程合规 | **CHANGES_REQUESTED** | 执行方自行推进批次并自标门禁 PASSED，见 §2 |

## 6. 修复提示词（复制给执行 AI）

```text
你是 CrossPilot 项目的执行工程师。项目根目录：E:\AiSecondBrain\vault\Work\Projects\CrossPilot。
统筹终审文档：docs\00_governance\more\AUTOMATION_FINAL_REVIEW_20260914.md。

终审结论 CHANGES_REQUESTED。G1 已通过，不要改动已通过 G1 的 Router/RPA/发布真实性代码行为（可重构但 19 项探针必须保持全过）。
只做以下修复，不扩范围：

1. F-P0-1：在 apps/worker/src/worker.service.ts 注册 AutomationRecoveryProcessor 的 Queue 与 Worker，补入口接线测试。
2. F-P0-2：claim() 不再改写 phase；修复 recovery processor 的分支判定，使 READY 操作能真正重新发起 ERP 建单；补端到端测试证明该路径真实执行。
3. F-P0-3：action-layer 采购执行失败按错误性质分类：TIMEOUT/网络错误 → effect=UNKNOWN、recovery=QUERY、Action 不永久 FAILED；接通 recovery=QUERY 的写入入口。
4. F-P0-4：消除 schema.prisma 与迁移的漂移（以 schema 为准重建迁移或补声明），并在隔离库用 migrate deploy 真实应用一次作为验收。
5. §4 P1 项逐条修复或书面说明不修的代价；其中收货并发超收（行锁/增量更新）与前端证据卡片无数据源两项不允许跳过。
6. 把 AUTOMATION_EXECUTION_EVIDENCE.md 中 G1/G2/G3 的自标 PASSED 全部改为"执行方自报 READY_FOR_REVIEW"，门禁结论栏留空由统筹填写。

纪律不变：先写失败复现测试再修；真实 PG/隔离 Redis；不提交、不推送、不部署；完成后更新证据看板并回复摘要，交统筹复审。
```
