# CrossPilot 外部设计吸收 Batch D（端到端样本收敛与既有自动化对接）实施实证

- **实施阶段**：外部设计吸收 Batch D（End-to-End Alignment）+ 复审缺陷 D-R1 闭环修复
- **任务依据**：`docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md` §12.4；复审报告见 `docs/00_governance/more/EXTERNAL_ABSORPTION_BATCH_D_REVIEW_20260914.md` §2。
- **状态声明**：**执行方自报 READY_FOR_REVIEW**（等待统筹独立复验；严禁自行标 PASS；不提交、不推送、不部署）
- **基线 Git HEAD**：`e474c20882094d2d34ed0da52591319a077319a8`
- **验证时间**：2026-09-14

---

## 1. 核心任务闭环清单

| 任务项 | 权威依据 | 实施要点 | 验证结果 |
| :--- | :--- | :--- | :--- |
| **1. 失败复现先行 (Timeout Fault Injection)** | 方案 §12.4；任务卡 §5 | 在真实 PG + Loopback HTTP 环境中主动注入 ERP PO 创建网络超时/连接中断，断言系统**绝对不标永久 FAILED**，而是进入 `phase: 'SUBMITTED', effect: 'UNKNOWN', recovery: 'QUERY'` 恢复队列，`PlannedAction` 维持 `status: 'EXECUTING'`。 | ✅ 单测断言通过，无假失败 |
| **2. Worker 远端反查自愈与内容防伪验真 (D-R1 闭环)** | 方案 §12.4；复审报告 §2 | 远端已成功建单时，`AutomationRecoveryProcessor` 定时反查远端 ERP。在收敛 `APPLIED` 之前**强校验供应商标识、总金额与明细数量**：若不一致立即置 `phase: 'NEEDS_ATTENTION', effect: 'NOT_APPLIED', recovery: 'MANUAL', errorCode: 'REMOTE_PAYLOAD_MISMATCH'`，拦截假收敛；核验一致且本地单据同步成功后，收敛至 `COMPLETED / APPLIED`，更新动作状态为 `SUCCESS`。 | ✅ 真实 PG 闭环单测 6/6 PASS，对抗探针 6/6 PASS，0 重复建单 |
| **3. 本地单据同步隐患闭环 (D-R1 关联)** | 复审报告 §2 第 4 条 | 废除 `syncLocalPurchaseOrder` 静默 `console.warn` 吞异常机制。远端已 APPLIED 但本地 DB 同步失败时，记录 `phase: 'NEEDS_ATTENTION', effect: 'APPLIED', recovery: 'MANUAL', errorCode: 'LOCAL_SYNC_FAILED'`，持久化 `syncError`，动作置 `FAILED`，绝不静默放行。 | ✅ 专项对抗变体 P-6 PASS |
| **4. Worker 幂等重试自愈 (Case 2: 远端不存在)** | 方案 §12.4；架构协议 §3 | 远端确认未收到订单（404 NOT_FOUND）时，Worker 将状态平滑流转为 `phase: 'READY', recovery: 'RETRY', effect: 'NOT_APPLIED'`，后续轮次通过 `createPurchaseOrder` 幂等重建成功，同步本地单据并收敛至 `COMPLETED / APPLIED`。 | ✅ 真实 PG 闭环单测通过，状态机流转严密 |
| **5. 前端凭据如实渲染** | 方案 §12.4；UI 协议 | 前端 `action-detail-drawer.tsx` 读取 `_evidence`，真实渲染 `phase`, `effect`, `externalId`, `verifiedAt`，对 `NEEDS_ATTENTION` 呈现警示，绝无编造假成功或隐藏恢复中状态。 | ✅ 契约兼容测试通过 |
| **6. 采购审批硬约束守护** | 方案 §11 禁令第 4 条 | `CREATE_PURCHASE_ORDER` 动作严格保持 `needApproval: true` 与 `riskLevel: 'high'`。未通过审批的动作调用 `execute` 时由 `ActionLayerService` 硬阻断并报错（`/only APPROVED actions can execute/`）。 | ✅ 守护单测通过，防篡改成立 |
| **7. 零平行系统与模式防篡改** | 方案 §11 禁令第 1、2、3 条 | 100% 复用既有 `AutomationOperation` 与 `AutomationRecoveryProcessor`，无第二套队列或 Worker；`git diff packages/db/prisma/` 严格为空。 | ✅ 模式零篡改，队列唯一定位 |
| **8. Batch C 复审遗留 F-6 修正** | Batch C 复审报告 §4 | `bi-variance-attribute.tool.ts` 消除 `evidenceMeta` 语义矛盾：`valueStatus` 更正为 `'DERIVED'`，无时间戳时 `freshness` 更正为 `'UNKNOWN'`。 | ✅ Batch C 原生探针 (8/8) + Kimi R2 对抗探针 (4/4) 全绿 |

---

## 2. 失败复现与自愈修复对比表（含 D-R1 复现与对抗变体）

| 场景 | 历史隐患 / 未对齐表现 | Batch D 规范落地与自愈表现 | 验证依据文件与单测 |
| :--- | :--- | :--- | :--- |
| **ERP 网络抖动 / 提交超时** | 传统脆弱实现常将网络超时直接判定为永久执行失败（`FAILED`），导致运维人员盲目重复人工下单，引发物理采购双倍重单风险。 | 严格记录 `effect: 'UNKNOWN'`, `recovery: 'QUERY'`, `phase: 'SUBMITTED'`，动作保持 `status: 'EXECUTING'`，清晰标注“远端状态未知，已置入 QUERY 恢复队列等待 Worker 自愈”。 | `apps/api/test/automation-batch-d-alignment.spec.ts` (Test 1) |
| **远端实际已建单 (Case 1)** | 恢复时盲目重发 POST 请求，导致 ERP 系统产生两笔完全相同的采购单据。 | Worker 优先执行 `adapter.getPurchaseOrder({ operationId })`。核验远端单据内容（供应商、总金额、数量）一致后采纳外部实体单号（`externalId`），收敛至 `APPLIED`，**向外部 ERP 发送的 POST 计数保持为 0**。 | `apps/api/test/automation-batch-d-alignment.spec.ts` (Test 2 & Test 4) |
| **D-R1: 远端单据内容不符 (假收敛对抗 P-3)** | 仅按 `operationId` 命中即采纳单据，远端返回串单、供应商或金额全错时盲目收敛至 `APPLIED`，绕过人工审查。 | **反查内容强校验**：比对供应商、总金额、明细数量。若有不符，置 `phase: 'NEEDS_ATTENTION', effect: 'NOT_APPLIED', recovery: 'MANUAL', errorCode: 'REMOTE_PAYLOAD_MISMATCH'`，持久化 `conflictDetails`，动作置 `FAILED`。 | `apps/api/test/review-batch-d-adversarial.spec.ts` (P-3 红转绿) |
| **D-R1 变体 A: 金额一致但供应商不同 (P-4)** | 仅比对金额总和，可能漏过供应商篡改/串单。 | 供应商严格相等校验：`localSupplierId !== remoteSupplierId` 触发拦截，进入 `NEEDS_ATTENTION`。 | `apps/api/test/review-batch-d-adversarial.spec.ts` (P-4) |
| **D-R1 变体 B: 供应商与金额一致但明细数量不同 (P-5)** | 总金额被单价调配掩盖，明细件数不一致可能导致仓库超收或少收。 | 明细总件数强校验：`localTotalQty !== remoteTotalQty` 触发拦截，进入 `NEEDS_ATTENTION`。 | `apps/api/test/review-batch-d-adversarial.spec.ts` (P-5) |
| **D-R1 关联隐患: 本地单据同步失败 (P-6)** | `syncLocalPurchaseOrder` 遇外键缺失或 DB 异常仅 `console.warn`，动作标成功但本地单据丢失。 | 捕获同步结果，若失败记录 `phase: 'NEEDS_ATTENTION', effect: 'APPLIED', recovery: 'MANUAL', errorCode: 'LOCAL_SYNC_FAILED'`，持久化 `syncError`，动作置 `FAILED`。 | `apps/api/test/review-batch-d-adversarial.spec.ts` (P-6) |
| **远端确未接收 (Case 2)** | 404 错误被当成不可恢复异常直接丢弃或未正确重置状态。 | Worker 区分 404 与超时，确凿不存在后置为 `phase: 'READY', recovery: 'RETRY'`，在下一周期幂等重新建单，建单成功后在本地 DB 同步确认 `PurchaseOrder` 并置动作 `SUCCESS`。 | `apps/api/test/automation-batch-d-alignment.spec.ts` (Test 3) |
| **未经审批执行绕过** | 自动化脚本或直调可能绕过人工审批直接向 ERP 下发采购。 | 动作层执行入口强制校验 `row.status === 'APPROVED'` 与审批元数据（`_approval` 防重放哈希），非法绕过直接拒绝执行。 | `apps/api/test/automation-batch-d-alignment.spec.ts` (Test 5) |
| **前端执行凭据展示** | 前端静态 mock 或仅显示简单的成功/失败二元标签。 | 抽屉组件完整解析 `executionEvidence`，分阶段高亮展示执行阶段（SUBMITTED/COMPLETED）、生效判定（UNKNOWN/APPLIED）、外部实体单号与验证时间戳。 | `apps/api/test/automation-batch-d-alignment.spec.ts` (Test 6) |

---

## 3. 验证套件运行证据

### 3.1 统筹对抗探针集与 D-R1 修复验证 (6/6 PASS，含 P-3 红转绿与 P-4/P-5/P-6 新增对抗)
```bash
$ pnpm --filter @crosspilot/api test apps/api/test/review-batch-d-adversarial.spec.ts
PASS test/review-batch-d-adversarial.spec.ts
  Review Batch D: adversarial probes (real PG + loopback ERP)
    √ P-1: 超时但远端已落单 —— worker 恢复后不重复 POST，收敛 COMPLETED/APPLIED，单号对齐 (71 ms)
    √ P-2: 双重恢复并发扫描同一 UNKNOWN/QUERY 操作 —— 不重复建单、不竞态 (51 ms)
    √ P-3: 假收敛对抗 —— 远端按 operationId 返回内容不符单据，不得盲目采纳为 APPLIED (17 ms)
    √ P-4: 假收敛对抗变体 A —— 金额完全一致但供应商不同，必须拦截并置 NEEDS_ATTENTION (13 ms)
    √ P-5: 假收敛对抗变体 B —— 供应商与总金额均一致但明细数量不一致，必须拦截并置 NEEDS_ATTENTION (12 ms)
    √ P-6: 关联隐患防护 —— 本地 PurchaseOrder 同步失败绝不静默，必须落证据并置 NEEDS_ATTENTION (32 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        4.388 s
```

### 3.2 Batch D 专项端到端单测 (6/6 PASS)
```bash
$ pnpm --filter @crosspilot/api test apps/api/test/automation-batch-d-alignment.spec.ts
PASS test/automation-batch-d-alignment.spec.ts
  Batch D: End-to-End Alignment on Procurement Recovery & Truthfulness
    √ 1. Failure Reproduction: Injects ERP network/timeout fault -> records UNKNOWN/QUERY without permanent FAILED (52 ms)
    √ 2. Worker Convergence (Case 1): Remote order pre-exists -> Worker queries, verifies, and converges to COMPLETED / APPLIED (34 ms)
    √ 3. Worker Convergence (Case 2): Remote order confirmed NOT_FOUND -> transitions to READY/RETRY -> recreates order to COMPLETED / APPLIED (50 ms)
    √ 4. Adversarial & Idempotency: Remote exists never causes duplicate order creation (18 ms)
    √ 5. Anti-Tamper & Guard: CREATE_PURCHASE_ORDER requires human approval and rejects unapproved execution (28 ms)
    √ 6. Frontend ActionDetailDrawer Evidence Contract Compatibility (1 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        4.012 s
```

### 3.3 Batch D 独立探针 (8/8 PASS)
```bash
$ node artifacts/external-absorption/batch-d/batch-d-probes.cjs
====================================================
Running Batch D Verification Probes
====================================================
[PASS] D-NO-PARALLEL-SYSTEMS: Reuses canonical AutomationRecoveryProcessor and single queue crosspilot-automation-recovery
[PASS] D-APPROVAL-HARD-GUARD: Purchase actions strictly require human approval and unapproved execution is blocked
[PASS] D-TIMEOUT-FAILURE-MAPPING: Timeout / network errors map to SUBMITTED / UNKNOWN / QUERY and keep status EXECUTING
[PASS] D-WORKER-CONVERGENCE-LOGIC: Recovery Worker handles Case 1, Case 2, and enforces D-R1 payload verification & local sync error tracking
[PASS] D-FRONTEND-EVIDENCE-TRUTHFULNESS: ActionDetailDrawer renders faithful execution evidence and warns on NEEDS_ATTENTION
[PASS] D-SCHEMA-INTEGRITY: git diff packages/db/prisma/ is strictly empty, zero database drift
[PASS] D-E2E-SPEC-EXISTS: Dedicated E2E alignment spec exists in apps/api/test/automation-batch-d-alignment.spec.ts
[PASS] D-E2E-COVERAGE: Spec covers failure reproduction, Case 1 exists, Case 2 retry, idempotency, approval guard, drawer contract
====================================================
Batch D Probes Summary: 8 PASSED, 0 FAILED
====================================================
```

### 3.4 全量批次回归验证矩阵

| 验证项 | 执行命令 | 预期状态 | 实际结果 |
| :--- | :--- | :--- | :--- |
| **Batch A 原生探针** | `node artifacts/external-absorption/batch-a/review-codex/batch-a-probes.cjs` | 4/4 PASS | ✅ 4/4 PASS |
| **Batch A R2 探针** | `node artifacts/external-absorption/batch-a/review-kimi/batch-a-probes-r2.cjs` | 6/6 PASS | ✅ 6/6 PASS |
| **Batch B 探针** | `node artifacts/external-absorption/batch-b/batch-b-probes.cjs` | 5/5 PASS | ✅ 5/5 PASS |
| **Batch B 对抗单测** | `pnpm --filter @crosspilot/api test apps/api/test/review-batch-b-adversarial.spec.ts` | 9/9 PASS | ✅ 9/9 PASS |
| **Batch C 原生探针 (含 F-6)** | `node artifacts/external-absorption/batch-c/batch-c-probes.cjs` | 8/8 PASS | ✅ 8/8 PASS |
| **Batch C R2 对抗探针 (含 F-6)** | `node artifacts/external-absorption/batch-c/review-kimi/batch-c-probes-r2.cjs` | 4/4 PASS | ✅ 4/4 PASS |
| **Batch D 专项探针** | `node artifacts/external-absorption/batch-d/batch-d-probes.cjs` | 8/8 PASS | ✅ 8/8 PASS |
| **Batch D 对抗单测** | `pnpm --filter @crosspilot/api test apps/api/test/review-batch-d-adversarial.spec.ts` | 6/6 PASS | ✅ 6/6 PASS |
| **G1 统筹全量 29 探针** | `review-probes.cjs` + `remaining-probes.cjs` + r1 probes | 29/29 PASS | ✅ 29/29 PASS |
| **Automation 验收 (E01～E15)** | `node scripts/run-automation-acceptance.cjs` | 15/15 PASS | ✅ 15/15 PASS (27s) |
| **全仓类型检查** | `pnpm -r typecheck` | 10/10 clean | ✅ 10/10 workspaces 0 errors |
| **前端应用构建** | `pnpm --filter @crosspilot/web build` | 24/24 static | ✅ 编译成功，0 错误 |

---

## 4. 涉及文件与 SHA-256 校验和指纹表

```
Algorithm Hash                                                             Path
--------- ----                                                             ----
SHA256    D0B95B3F83C40786D323FACE0AA777523102DEE602430649EF94863EB02AB4AA apps/worker/src/processors/automation-recovery.processor.ts
SHA256    FE1270A32D7A0B36F031D4F9A12A42841CAF92DBA003B038CAC427964E626078 apps/api/test/automation-batch-d-alignment.spec.ts
SHA256    8689ED482A13A193728FA63AC40C3404754B873A635BD7651440AC6D67EE81E9 apps/api/test/review-batch-d-adversarial.spec.ts
SHA256    86A17B01CEB82E0A1AA6A69C4085BF55BB506854CBF4FE5BC959265F83486C18 artifacts/external-absorption/batch-d/batch-d-probes.cjs
SHA256    E62DEC3C8C17DF582070E5F0D21BBF3A4E2784BB3227EDEF548D88A9A8BABBCC apps/api/test/automation-recovery-postgres.spec.ts
SHA256    B1BD05308DB168978AB24F56972C024715AB20011962FAE8127B2BBBD432DFE2 packages/tool-platform/src/tools/bi-variance-attribute.tool.ts
SHA256    EBE59694040C1697C492EF1483F392DA77C1FF8E09A47E8480006EA1CD58AF71 apps/web/src/app/app/operations/today/components/action-detail-drawer.tsx
```

---

## 5. 纪律约束与状态声明

1. **状态严格声明为 `READY_FOR_REVIEW`**：外部吸收四个实施批次（Batch A、Batch B、Batch C、Batch D）已全部自测与回归通过，D-R1 缺陷闭环并完成 3 项对抗变体扩展。本报告绝不自封 PASS，提请统筹 AI 执行独立终验。
2. **零提交、零推送、零部署**：全程严格执行工作区纯代码修改，`git log -1` 确认为 `e474c20882094d2d34ed0da52591319a077319a8`，所有变更均停留在本地工作区，未向远端仓库 `origin/master` 发起推送，未向生产服务器 `116.198.230.217` 执行任何部署或连接。
3. **数据库模式零侵入**：`packages/db/prisma/` 目录严格保持 0 diff，未执行任何 migration，核心表结构与唯一键完全完好。
