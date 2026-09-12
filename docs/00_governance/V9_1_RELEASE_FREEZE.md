# CrossPilot V9.1 Release Freeze

**Date:** 2026-09-12  
**Document level:** LEVEL 1 — CURRENT SOURCE OF TRUTH  
**This phase is not a development phase.** No feature work. No Epic 4. No V9.2. No Known Gap implementation.

---

## 1. Release Identity

```text
Release:
CrossPilot V9.1

Status:
RELEASE VERIFIED & FROZEN

Tag:
v9.1.0
```

| 项 | 值 |
| :--- | :--- |
| Product | CrossPilot |
| Release | V9.1 |
| Git tag | `v9.1.0` |
| Tag target | `b3d5607` |
| Remote runtime | `116.198.230.217` |
| Public Web | `http://116.198.230.217:2222` |

---

## 2. Release Commit / Deployment SHA

These two SHAs are not interchangeable.

```text
V9.1 主体 commit:
c4704fd

Browser Acceptance hotfix:
7c81411

Final acceptance report:
b3d5607

Deployed application SHA during final acceptance:
7c81411

Release documentation baseline:
b3d5607
```

| SHA | Full | Role |
| :--- | :--- | :--- |
| `c4704fd` | `c4704fd60e2066fb44e5cfe480c004c96d163c6c` | V9.1 主体：Epic 3 + Phase 1 / 2 / 2.1 / 2.2 / 3 |
| `1ab969d` | `1ab969d` (parent of hotfix) | BA-001 bcrypt import + BA-002 初版 SKU FK 守卫 |
| `7c81411` | `7c814118609e32c420ad1bef6f66d12b422918de` | 验收时已部署应用 SHA（`activeSkuId` TS 修正） |
| `b3d5607` | `b3d56079066526ba05146417ea60955e9a4321af` | Release documentation baseline；`v9.1.0` 指向此 commit |

**Git 核验（Freeze 当日）：**

```text
git diff --name-only 7c81411..b3d5607
docs/00_governance/V9_1_FINAL_BROWSER_ACCEPTANCE_REPORT.md
```

`7c81411 → b3d5607` 仅为最终浏览器验收报告。无业务代码、无 Epic 4、无 V9.2、无冻结算法变化。因此以 `b3d5607` 作为 V9.1 release baseline，并创建 annotated tag `v9.1.0`。

本 Freeze 文档及其配套治理更新提交在 `v9.1.0` **之后**，只记录冻结事实，不改 tagged baseline 的应用代码。

---

## 3. Release Decision

```text
Final Browser Acceptance:
PASSED

Release Decision:
FROZEN

Current Release:
CrossPilot V9.1

Release Status:
RELEASE VERIFIED & FROZEN
```

判定依据：`docs/00_governance/V9_1_FINAL_BROWSER_ACCEPTANCE_REPORT.md`。  
人工已批准执行 Release Freeze。本文件是冻结声明，不是新的产品开发。

---

## 4. Completed V9.1 Phases

| Phase | 名称 | 状态 | 权威报告 |
| :--- | :--- | :--- | :--- |
| Audit | Full Product Bug Audit | COMPLETED | `V9_1_FULL_PRODUCT_BUG_AUDIT.md` |
| Phase 1 | P0/P1 Production Bug Fix | COMPLETED & VERIFIED | `V9_1_PHASE1_P0_P1_FIX_REPORT.md` |
| Phase 2 | Stability Fix | COMPLETED & VERIFIED | `V9_1_PHASE2_STABILITY_FIX_REPORT.md` |
| Phase 2.1 | Persistent Idempotency Hardening | COMPLETED & VERIFIED | `V9_1_PHASE2_1_IDEMPOTENCY_HARDENING_REPORT.md` |
| Phase 2.2 | XYDC Review Count Adjudication | COMPLETED & VERIFIED | `V9_1_PHASE2_2_XYDC_REVIEW_COUNT_ADJUDICATION.md` |
| Phase 3 | UX / Governance Polish | COMPLETED & VERIFIED | `V9_1_PHASE3_UX_GOVERNANCE_POLISH_REPORT.md` |
| Final | Browser Acceptance | PASSED | `V9_1_FINAL_BROWSER_ACCEPTANCE_REPORT.md` |
| Freeze | Release Freeze | **THIS DOCUMENT** | `V9_1_RELEASE_FREEZE.md` |

```text
Epic 1: FROZEN
Epic 2: FROZEN
Epic 3: FROZEN

Epic 4:
SUSPENDED / NOT STARTED

V9.2:
NOT STARTED
```

---

## 5. Final Browser Acceptance

Final Browser Acceptance passed against the defined release acceptance matrix.

Some non-blocking routes were verified through HTTP/API contract plus prior regression suites rather than exhaustive manual click-through.

| 项 | 事实 |
| :--- | :--- |
| Runtime | `root@116.198.230.217` `/root/zls/project/CrossPilot` |
| Web | `http://116.198.230.217:2222` |
| Acceptance application SHA | `7c81411` |
| Health | 200 |
| PostgreSQL | UP |
| Redis | UP |
| Milvus | UP |
| Remote API Contract | 26/26 PASS |
| Browser Acceptance | PASSED |
| Windows 本机产品栈 | 未作为运行环境 |

核心已验证路径：登录、Workspace A/B 隔离、SKU UUID 上下文、Operations Today REST + SSE、HITL 批准、OCC 409、VIEWER 403、Tool Center 28 tools、主要业务页 HTTP 200、Honest Overview。

---

## 6. Blocking Bugs Resolved

验收期间发现并热修两个 P0。均已重验。无剩余 Release Blocker。

### BA-001

```text
bcrypt.default.compare runtime failure
→ fixed using correct bcrypt import

FIXED
RE-VERIFIED
NO REMAINING BLOCKER
```

- 现象：`POST /auth/login` 500；编译后 `bcrypt.default.compare` 为 undefined  
- 修复：`apps/api/src/modules/auth/auth.service.ts` 使用 `import * as bcrypt from 'bcrypt'`  
- Commit：`1ab969d`（含入验收部署 `7c81411`）

### BA-002

```text
Scenario SKU code incorrectly persisted as activeSkuId
→ non-UUID SKU code no longer written into UUID FK

FIXED
RE-VERIFIED
NO REMAINING BLOCKER
```

- 现象：WF-05 把场景 SKU code（如 `MTH-WHITE-001`）写入 `AgentTask.activeSkuId`，触发 Prisma P2003，诊断无法 COMPLETED  
- 修复：`packages/domain/src/operations/workflow/workflow-checkpoint.store.ts` 非 UUID 不写 FK（缺省用 `undefined` 而非 `null`）  
- Commits：`1ab969d` / `7c81411`

未改 Sku360、异常检测、诊断/推荐打分、WF-05 DAG、补货/利润/方差公式、OCC `updateMany`、Provider Framework、XYDC Mapper。

---

## 7. Quality Gates

Freeze 阶段**没有**重跑测试套件。下列门禁是既有阶段的已记录证据，不是本阶段新跑结果。

| 门禁 | 证据来源 | 结果 |
| :--- | :--- | :--- |
| Typecheck 10/10 | Phase 3 | PASS（当时） |
| API Jest 88 | Phase 3 | PASS（当时） |
| Domain Jest 228 | Phase 3 | PASS（当时） |
| Web contracts 29 | Phase 3 | PASS（当时） |
| Evals 9/9 | Phase 3 | PASS（当时） |
| Next.js production build 23/23 | Phase 3 + 远程部署 | PASS |
| 远程 health | Final Browser Acceptance | 200 |
| 远程 API contract | Final Browser Acceptance | 26/26 PASS |
| 本机 `pnpm -r test` | Final Browser Acceptance | **NOT RUN**（指令禁止在 Windows 起产品栈） |
| Integrations LIVE `5151 ≠ 5147` | Phase 2.2 | KNOWN ENVIRONMENT-DEPENDENT TEST；NOT RELEASE BLOCKER |

---

## 8. Frozen Architecture

V9.1 冻结后，下列资产保持 Epic 3 / V9.1 已验证边界。禁止为了品味或 Known Gap 去改。

```text
[FROZEN ASSETS]
├── Sku360 context loader
├── Operation anomaly detector
├── Cross-domain diagnosis
├── Action recommendation scoring
├── WF-05 9-step DAG
├── Postgres workflow checkpoint + OCC updateMany
├── WorkflowIdempotency (workspaceId + scope + key)
├── Daily diagnosis REST / SSE
├── operation.daily.* tools
├── Operations Today HITL / OCC UX
├── Provider Framework / XYDC Mapper
└── Opportunity Score v1.0.0
```

验收热修仅触及：

- `apps/api/src/modules/auth/auth.service.ts`
- `packages/domain/src/operations/workflow/workflow-checkpoint.store.ts`

---

## 9. Accepted Verification Limitations

Final Browser Acceptance passed against the defined release acceptance matrix.

Some non-blocking routes were verified through HTTP/API contract plus prior regression suites rather than exhaustive manual click-through.

诚实限制（**不是** Release Blocker）：

- Analyst SSE 没有单独浏览器验证（waterfall REST 200；Phase 2 已改 authenticated SSE）
- Orders / Inventory / Profit / Reviews 没有全部逐页人工点完（页面 HTTP 200 + 对应 API 200）
- Accessibility 不是完整 WCAG audit（Dialog a11y 以 Phase 3 合同与源码为准）
- 本机 `pnpm -r test` 未在 Freeze 当日重跑
- 采购单非法状态 409 以 API / Phase 2 合同为准，未在远程浏览器逐个点开 Receive CTA

禁止把上述限制写成 “Everything manually browser tested”。

---

## 10. Known Gaps

下列项保持诚实状态。它们**不是** V9.1 Release Blocker，也**不得**在 Freeze 后顺手实现。

| Known Gap | 状态 | 说明 |
| :--- | :--- | :--- |
| Epic 4 / Amazon SP-API | SUSPENDED / NOT STARTED | 无真实店铺接入 |
| Approval ≠ Execute | INVARIANT | 批准不等于采购 / 改广告 / 发布 / 调价 |
| WF-03 | PARTIAL | 补货计算真实；无独立长链路 DAG / ERP |
| WF-04 | PARTIAL | 方差账真实；问答层模版插值 |
| Launch Center | MISSING | 仅有 `LaunchPlan` schema 占位 |
| Scheduler | MISSING | 无定时触发生产调度器 |
| Creative Mock | MOCK 生图 | 固定 Unsplash，非真实生图管线 |
| Reviews / VOC | PARTIAL | 退款流水真实；页面 VOC 卡片硬编码 |
| 独立 Knowledge Base 管理台 | MISSING | Milvus RAG 真实；无独立 KB 控制台 |
| Agent Trace / Eval 独立大屏 | MISSING | 轨迹落库真实；无独立 APM / Eval Dashboard |

REAL / PARTIAL / MISSING 的定义不因 Freeze 改写。见 `V9_PRODUCT_CAPABILITY_MATRIX.md`。

---

## 11. XYDC Adjudication

Phase 2.2 裁决冻结，Freeze 不得改写。

```text
5147 = deterministic fixture snapshot
5151 = mutable XYDC LIVE value

NOT PRODUCT BUG
NOT V9.1 REGRESSION
```

禁止为了 release freeze 修改：

```text
5147 → 5151
```

禁止改 Provider Framework / XYDC Mapper / 测试期待以“刷绿” LIVE 评价数。

---

## 12. Epic 4 Status

```text
Epic 4
SUSPENDED / NOT STARTED
```

未启动 Amazon SP-API、Ads 真执行、Listing 真发布、ERP、真实店铺数据地基。

---

## 13. Post-V9.1 Boundary

Freeze 完成后，禁止修改 V9.1 release baseline（tag `v9.1.0` / commit `b3d5607`）来顺手：

- 修 P3 小问题
- 做 UI 改色
- 加功能
- 做 Epic 4
- 做 Scheduler
- 做 Launch Center
- 做 Amazon integration
- 做 V9.2
- 修 Known Gap

新的修改必须进入：

```text
post-V9.1 backlog
```

或者未来明确批准的新版本。不得把新业务代码 amend / retag 进 `v9.1.0`。

---

## 14. Release Freeze Declaration

经权威输入核验、git 范围核验、Final Browser Acceptance PASSED，正式冻结：

```text
CrossPilot V9.1
RELEASE VERIFIED & FROZEN
```

```text
Epic 4
SUSPENDED / NOT STARTED

V9.2
NOT STARTED
```

等待人工决定下一产品阶段。
