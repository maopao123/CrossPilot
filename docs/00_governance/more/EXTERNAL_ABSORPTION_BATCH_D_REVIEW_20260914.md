# 外部设计吸收：Batch D 回交独立复审

日期：2026-09-14。统筹：Kimi Code。

**结论：CHANGES_REQUESTED。Batch D 主体目标（超时→UNKNOWN/QUERY→自愈闭环、404/超时区分、幂等重建、审批约束保持、F-6 修复）全部独立验证通过；但统筹对抗探针实证 1 项阻断缺陷 D-R1（恢复收敛零内容校验，可致错误采购单被标 APPLIED），修复并复审通过前不放行最终验收。**

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：执行方（Gemini）按主方案 §12.4 与交接包 §5 实施的 Batch D 回交，自报 `READY_FOR_REVIEW`。

## 1. 独立核实依据（非转述执行方报告）

- HEAD 保持 `e474c20`，无 commit/push；`git diff packages/db/prisma/` 为空；本轮实质业务代码改动仅 bi-variance-attribute.tool.ts（F-6 修复）+ 新增测试/探针/文档，**恢复链路与 action-layer 均为既有实现，本轮未被改动**，无夹带。
- 6 个自报文件指纹与统筹实测全部一致（连续两轮自报诚实）。
- **独立复跑全过**：Batch D 专项 E2E 6/6（真实 PG + Loopback HTTP）；执行方探针 8/8；Batch A 探针 4/4+6/6、Batch B 真实库探针 9/9、Batch C 探针 8/8+4/4 回归全过；G1 探针 29/29；E01～E15 15/15（29s）；typecheck 10/10。
- **F-6 关闭确认**：bi-variance-attribute.tool.ts 已改 `valueStatus: 'DERIVED'`、`freshness: 'UNKNOWN'`，相关测试断言同步更新。
- **既有实现源码核验**（本轮未改，属 Batch D 验收范围内的既有链路）：
  - 超时分类（action-layer.service.ts:468-509）：TIMEOUT/UNKNOWN_ERROR → SUBMITTED + UNKNOWN + QUERY，动作保持 EXECUTING，不标永久 FAILED ✅
  - QUERY 反查收敛（automation-recovery.processor.ts:98-145）：命中→COMPLETED/APPLIED + 本地 PO 对齐，该路径无任何 POST ✅
  - 404 与超时已真实区分（147-230 行）：NOT_FOUND → READY/RETRY；查询超时 → 保持 UNKNOWN/QUERY ✅
  - 幂等重建复用 idempotencyKey；采购 needApproval/high/未审批强阻断未放宽；无平行执行/恢复系统 ✅

## 2. 阻断缺陷 D-R1：恢复收敛只按 operationId 命中即采纳远端单据，零内容校验

**实证**（统筹对抗探针 P-3，`apps/api/test/review-batch-d-adversarial.spec.ts`，真实 PG + 对抗 ERP fixture）：远端按 operationId 返回一张 supplierId 为 `SUP-WRONG-SUPPLIER`、金额 999999、明细不符的单据，worker **盲目采纳**——action 置 SUCCESS、phase COMPLETED、effect APPLIED，错误单号写入本地 PurchaseOrder，未进入任何人工/冲突态。

**为什么构成阻断**：主方案 §4.2 定义 recovery: QUERY 为"状态未知，禁止盲目重发，**只能反查确认**"——反查的目的是确认"那一单"，不是确认"有任意一单"。采购是资金域；远端数据损坏、串单、fixture 说谎时，当前实现会把错误事实固化为 APPLIED 并绕过人工。这正是本方案全线反对的"无依据断言已生效"。

**修复要求**（最小范围）：
1. QUERY 反查命中后、收敛 APPLIED 之前，比对远端单据关键内容与本地原始请求 payload：至少供应商标识与总金额/明细数量级一致（容差规则明确写出，例如金额严格相等、供应商严格相等）。
2. 不一致时不得收敛 APPLIED：置 NEEDS_ATTENTION + recovery: MANUAL，记录冲突详情（远端值 vs 本地值）供人工对账；前端抽屉已有 NEEDS_ATTENTION 警示渲染，直接复用。
3. 先写失败复现测试（可用统筹的 P-3 场景：`apps/api/test/review-batch-d-adversarial.spec.ts` 中第 3 个用例当前即为失败复现，修复后应转为 PASS；允许将该 spec 收敛为你的正式测试），再实施修复。
4. 顺带修复关联隐患：syncLocalPurchaseOrder 失败目前仅 console.warn 静默吞掉（processor :67），远端已 APPLIED 但本地同步失败时必须落证据并进入可追踪状态，不得静默。
5. 回归：Batch D 专项 6/6、batch-d-probes 8/8、G1 29/29、E01～E15 15/15、typecheck 10/10 保持全过；Batch A/B/C 探针回归全过。

纪律不变：不提交、不推送、不部署；不扩范围。证据写入 `artifacts/external-absorption/batch-d/`，标 READY_FOR_REVIEW 停止。

## 3. 非阻断观察（记录在案）

- 执行方 fixture 的"超时"是建单前断连，非"已落单但响应丢失"真竞态；统筹 P-1 已用真竞态补验通过（远端 postCreateCount 恒为 1，零重复建单）。
- P-2 两轮 worker 并发扫描同一 QUERY 操作：租约防并发有效，零重复收敛。
- 执行方将 Batch D 状态写入了仓库外的 `E:\AiSecondBrain\HANDOFF.md`（项目群交接文件）——位置合法但超出 CrossPilot 仓库边界，请用户知悉并决定是否接受该写动。
- 执行方报告自称 Web Build 24/24，本轮统筹未独立复跑（按惯例以自报为准，最终验收时复验）。

## 4. 修复后复审方式（接任统筹执行）

1. 独立复跑 `review-batch-d-adversarial.spec.ts`（3/3 PASS，含 P-3 转正）与 Batch D 专项、全量回归。
2. 人工抽查 processor 收敛分支：内容比对逻辑、不一致时 MANUAL 落库、本地同步失败的可追踪性。
3. 自写 1 个新变体对抗（例如金额一致但供应商不同、或明细数量不一致），防"只修探针断言点"。
4. PASS 后进入最终验收（交接包 §7）。
