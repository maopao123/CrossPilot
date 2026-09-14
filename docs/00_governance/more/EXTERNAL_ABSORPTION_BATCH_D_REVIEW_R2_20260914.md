# 外部设计吸收：Batch D 修复回交二次独立复审（R2）

日期：2026-09-14。统筹：Kimi Code。

**结论：PASS。D-R1（恢复收敛零内容校验）经真实库对抗探针实证关闭，Batch D 验收通过。**

项目根目录：`E:/AiSecondBrain/vault/Work/Projects/CrossPilot`。
审核对象：执行方按 [EXTERNAL_ABSORPTION_BATCH_D_REVIEW_20260914.md](./EXTERNAL_ABSORPTION_BATCH_D_REVIEW_20260914.md) §2 实施的 D-R1 修复回交。

## 1. 独立核实依据

- HEAD 保持 `e474c20`，无 commit/push；prisma diff 为空；改动范围无夹带。
- 9 个自报文件指纹与统筹实测全部一致。
- **D-R1 关闭实证**：
  - 统筹首轮对抗探针 `review-batch-d-adversarial.spec.ts` 独立复跑 **6/6 PASS**（P-3 红转绿；执行方新增 P-4 供应商不符/P-5 明细数量不符/P-6 本地同步失败，全拦截）；
  - 统筹新增第二轮对抗变体 `review-batch-d-adversarial-r2.spec.ts`（真实 PG + 对抗 fixture）**3/3 PASS**：P-7 NEEDS_ATTENTION 两轮复扫不回弹、不重复建单；P-8 金额差 1 分严格拦截（无容差）；P-9 内容全一致正常收敛 COMPLETED/APPLIED（非一刀切拦截）。
- **源码核验**：比对数据源为服务端存储的原始请求 payload（processor 117-160 行）；不一致 → NEEDS_ATTENTION + NOT_APPLIED + MANUAL + REMOTE_PAYLOAD_MISMATCH + conflictDetails 双值落库；syncLocalPurchaseOrder 改返回 LocalSyncResult，失败落 LOCAL_SYNC_FAILED 可追踪，静默吞掉已根除。
- **红旗排除**：`automation-recovery-postgres.spec.ts` 的修改仅 +9 行补建供应商 fixture（适配新防护），**零断言删除/放宽**；`action-detail-drawer.tsx` 本轮实际零改动（执行方声明清单此项不属实，记录在案，不影响代码结论）。
- **回归全绿**：Batch D 专项 6/6 + recovery-postgres 10/10、batch-d-probes 8/8；Batch A 4/4+6/6、Batch B 5/5+9/9、Batch C 8/8+4/4 回归；G1 29/29；E01～E15 15/15；typecheck 10/10。

## 2. 非阻断观察（登记）

- **F-10**：供应商比对在本地 supplierId 为空时短路与跳过、金额比对在远端无金额字段时跳过——当前有其他字段兜底，但存在"校验静默退化"路径，后续补强。
- **F-11**：NEEDS_ATTENTION 操作不再被 listDue 扫描，且未见人工处理后的恢复入口，可能"只进不出"，需补运维路径或人工复核 API。
- 执行方两轮声明清单出现不实项（Batch B 基线指纹、本轮 drawer 改动），代码结论均以统筹实测为准，未受影响。

## 3. 裁定

**Batch D：PASS。** 进入最终验收，结论见 [EXTERNAL_ABSORPTION_FINAL_ACCEPTANCE_20260914.md](./EXTERNAL_ABSORPTION_FINAL_ACCEPTANCE_20260914.md)。
