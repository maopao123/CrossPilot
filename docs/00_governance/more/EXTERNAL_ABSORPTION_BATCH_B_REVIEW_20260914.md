# 外部设计吸收：Batch B 回交独立复审

日期：2026-09-14。统筹：Kimi Code。

**结论：PASS。审批加固三项要求（强校验、原子 CAS、崩溃恢复追踪）全部经独立对抗验证闭环，放行 Batch C。** 遗留 1 项流程警示与 3 项非阻断技术债（见 §4、§5），不阻塞放行。

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：执行方（Gemini）按主方案 §12.2 与交接包 §3 实施的 Batch B 回交，自报 `READY_FOR_REVIEW`，证据 `artifacts/external-absorption/batch-b/BATCH_B_EXECUTION_EVIDENCE.md`。

## 1. 独立核实依据（非转述执行方报告）

- HEAD 保持 `e474c20`，无 commit/push；业务代码改动仅 operation-automation 模块 2 文件 + 新增类型/测试，无夹带（4 个 `artifacts/automation-v1/*.json` 变动为探针复跑的时间戳副产物）。
- Batch B 6 个文件自报指纹与统筹实测全部一致。
- **独立复跑**：加固 spec 7/7、执行方探针 5/5、publish-truth + v9 集成 10/10、G1 探针 29/29、E01～E15 15/15（真实隔离 PG/Redis）、typecheck 10/10，全部退出码 0。
- **Batch A 无回退**：首轮统筹探针 4/4、R2 对抗探针 6/6 复跑通过；xydc.mapper.ts 与 market.service.ts 实测指纹与 R2 验收值完全一致。
- **统筹新增真实库对抗探针**（`apps/api/test/review-batch-b-adversarial.spec.ts`，真实隔离库 crosspilot_test，结果索引 `artifacts/external-absorption/batch-b/review-kimi/batch-b-probes-r2-results.json`）**9/9 PASS**：
  - P-1 真实库并发 ×4 审批同一单：恰好 1 成功、3×409（DB 原子性实证，执行方的并发"证明"只跑在 Map mock 上）；
  - P-2a/2c 客户端 body 自报 actionType/targetId 与服务端记录不符：400 拒绝，状态保持 PENDING（**循环校验不成立**，body 从不作为校验基准）；
  - P-2b 无 body 时服务端 payload 与记录不匹配：400；
  - P-3 targetId 差一个字符（两个变体）：均 400；
  - P-1c 崩溃窗口 PENDING_DISPATCH 悬挂单持久化可查且 workspace 隔离；P-2d 跨 workspace 访问 404。

## 2. 任务卡逐项核对

| 要求 | 统筹核实 | 结论 |
|---|---|---|
| 局部 ApprovalProof 类型，不反向依赖未导出包 | approval-proof.types.ts 位于模块内部，无跨包反向依赖 | ✅ |
| 原子 CAS | service.ts:226-252 单条 `updateMany({ where: { id, workspaceId, status: 'PENDING' } })`，count=0 → 409；前置 findFirst 仅为友好预检，权威翻转只走 CAS，无 TOCTOU 残留；真实库并发实证 | ✅ |
| actionType/targetId 强校验 | 校验全部在 CAS 之前，基准均为服务端数据（DB 记录对常量、body 对 DB 记录、run.skuCode 对 DB 记录、requestedPayload 对 DB 记录）；不匹配 400、并发/重复 409 | ✅ |
| 崩溃恢复追踪 | PENDING_DISPATCH 在 CAS 同一原子写入中落库（dispatch 前），dispatch 后更新，重启后 listPendingDispatches 可查悬挂单 | ✅ |
| 非目标 | @crosspilot/actions 无 Prisma 反向依赖；Amazon Write 冻结接口未触碰；MOCK/mock-rpa 隔离保持（isMock: true、文案带"模拟演示"） | ✅ |
| v9 spec 适配 | diff 仅 5 行 mock 形状适配，无断言削弱 | ✅ |

## 3. 流程警示（必须纠正，不阻塞本次放行）

执行方 Batch B 报告 §4 声称 xydc.mapper.ts / market.service.ts "Batch A 基线无漂移"，但给出的哈希（3E97F563…/F25B5C1B…）与当前实测值、R2 验收值都对不上，且非行尾差异可解释——**文件实际无漂移（哈希 + 行为探针双重证实），但报告数据失真**。自报证据的可靠性一律以统筹实测为准；后续批次回交中任何无法被统筹复现的指纹/数字，视同未提供。

## 4. 非阻断技术债（登记，移交后续批次）

- **F-3**：审批状态机复用 `Approval.comment` 字段存储 PENDING_DISPATCH/proof——dispatch 会覆写人工评论、JSON 解析失败回退子串匹配可能误报、dispatch 后更新的 `.catch(() => {})` 静默失败。功能正确，建议后续迁独立字段/表。
- **F-4**：controller `user.sub` → `user?.sub` 的静默降级（缺 sub 时 approvedBy 落为 'OPERATOR'），轻微放宽，后续收紧。
- **F-5**：mock 发布流 `parsedPayload.price || 29.99` 常数兜底（mock 语境）；listPendingDispatches 对 workspace 内 Viewer 返回含内嵌 proof 的完整审批行（低危）。

## 5. 裁定与下一步

**Batch B：PASS。** 主方案文档顶部裁定与 `docs/HANDOFF.md` 已同步更新。

**放行 Batch C**（契约增量扩展与多店归因分析，任务卡见主方案 §12.3），执行提示词见交接包 §4。Batch D～E 继续不放行；Batch C 回交后按交接包 §4.1 复审。

全部改动仍保留在未提交工作区；commit/push 待最终验收（交接包 §7）后由用户决定。
