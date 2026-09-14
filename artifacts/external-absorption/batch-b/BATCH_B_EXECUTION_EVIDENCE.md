# CrossPilot External Design Absorption - Batch B 实施与验证证据报告 (R1)

> **当前门禁状态**：`READY_FOR_REVIEW`（执行方自报，已完成 Batch B 入口矩阵与可信审批加固全部工作及全量门禁回归，未提交、未推送、未部署，提请统筹 AI 进行独立复验）  
> **执行批次**：Batch B（入口矩阵与可信审批加固）  
> **Git Base HEAD**：`e474c20882094d2d34ed0da52591319a077319a8`（未提交工作区）  
> **依据文件**：`docs/00_governance/more/CrossPilot_External_Design_Absorption_Plan.md` §12.2、§3.3 及 `docs/00_governance/more/EXTERNAL_ABSORPTION_HANDOFF_PACKAGE_20260914.md` §3  
> **统筹独立探针验证**：`batch-b-probes.cjs` **5 / 5 PASS**

---

## 1. 任务完成与改动说明

按照权威任务卡，本次仅实施以下三项审批加固，不扩批次，不改动业务通用包与底层模型：

### 1.1 定义局部 `ApprovalProof` 契约
- **文件**：`apps/api/src/modules/operation-automation/approval-proof.types.ts`
- **说明**：在模块内部独立定义 `ApprovalProof` 强类型接口（包含 `approvalId`, `workspaceId`, `actionType`, `targetId`, `targetType`, `approvedBy`, `approvedAt`, `expiresAt`），严禁通用包 `@crosspilot/actions` 反向依赖 Prisma。

### 1.2 `approveAndExecute` 原子 CAS 与强契约校验重构
- **文件**：`apps/api/src/modules/operation-automation/operation-automation.service.ts`、`operation-automation.controller.ts`
- **说明**：
  1. **状态变更前强校验**：
     - `actionType` 严格限定为 `LISTING_PUBLISH`，与传入的执行参数一致，不匹配直接阻断并抛出 `400 BadRequestException`；
     - `targetId` 必须存在且非空，严格比对工作流运行中 `skuCode` 及审批请求 payload 中的 `skuCode`，不匹配直接抛出 `400 BadRequestException`；
  2. **单条原子 CAS 更新**：
     - 废除“先查后改”的竞态逻辑，使用 `prisma.approval.updateMany({ where: { id, workspaceId, status: 'PENDING' }, data: { status: 'APPROVED', ... } })`；
     - 检查影响行数 `updateResult.count === 0`，对并发竞争失败者及已处理的重复请求一律抛出 `409 ConflictException`；
  3. **控制器层支持可选执行参数**：
     - `POST /api/v1/operations/approve/:approvalId` 支持可选 `@Body() body?: { actionType?: string; targetId?: string }`，在审批执行前交叉比对。

### 1.3 批准后派发前崩溃的恢复追踪机制
- **文件**：`apps/api/src/modules/operation-automation/operation-automation.service.ts`、`operation-automation.controller.ts`
- **说明**：
  1. **预写待派发状态**：在单条 CAS 语句置 `status: 'APPROVED'` 的同时，在数据库持久化字段 `comment` 中写入 `dispatchStatus: 'PENDING_DISPATCH'` 及关联的 `ApprovalProof`；
  2. **派发完成后更新状态**：`executePublishRpa` 成功或失败后，将 `comment` 原子更新为 `DISPATCHED_RUNNING` / `DISPATCHED_SUCCEEDED` / `DISPATCHED_FAILED`；
  3. **崩溃恢复可查**：若进程在更新为 APPROVED 之后、dispatch 完成之前意外崩溃，审批单在数据库中具备确凿且可查的 `PENDING_DISPATCH` 状态，杜绝丢单；
  4. **提供恢复查询接口**：Service 增补 `listPendingDispatches(workspaceId)`，Controller 增补 `GET /api/v1/operations/pending-dispatches` 供运维和恢复处理器巡检。

---

## 2. 失败复现与修后通过对照

在修改业务代码前，编写专项测试 `apps/api/test/operation-automation-approval-hardening.spec.ts` 并在未修复代码上运行，7 项测试 100% 复现失败；实施修复后 7 项全部通过：

| 验证场景 | 探针/用例 | 修前结果（复现失败） | 修后结果（已通过） |
|:---|:---|:---|:---|
| **actionType 不匹配拦截** | `rejects approval with 400 when approval actionType does not match workflow` | **FAILED**（修前未校验，直接放行成功） | **PASS**（抛出 400 `APPROVAL_ACTION_TYPE_MISMATCH`） |
| **targetId 不匹配拦截** | `rejects approval with 400 when approval targetId does not match workflow SKU` | **FAILED**（修前未校验，直接放行成功） | **PASS**（抛出 400 `APPROVAL_TARGET_MISMATCH`） |
| **请求体参数不匹配拦截** | `rejects approval with 400 when caller passes mismatched execution parameters in body` | **FAILED**（修前未接收/校验参数） | **PASS**（抛出 400 `APPROVAL_ACTION_TYPE_MISMATCH`） |
| **并发竞争原子 CAS** | `ensures only 1 request succeeds among concurrent requests, others get 409 Conflict` | **FAILED**（5 次并发全部成功，Received: 5 fulfilled） | **PASS**（恰好 1 次成功，其余 4 次抛出 409 `ConflictException`） |
| **重复审批拦截** | `rejects repeated approval requests with 409 Conflict when already approved` | **FAILED**（修前抛出 400 而非 409） | **PASS**（抛出 409 `ConflictException`） |
| **派发前崩溃追踪** | `persists PENDING_DISPATCH recovery state in approval comment before dispatch completes` | **FAILED**（`inDb.comment` 为 `undefined`，无追踪） | **PASS**（CAS 时写入 `PENDING_DISPATCH`，数据库真实可查） |
| **待派发审批单查询** | `allows querying pending dispatch recovery records` | **FAILED**（方法未实现） | **PASS**（成功筛选包含 `PENDING_DISPATCH` 的审批记录） |
| **统筹对抗探针** | `batch-b-probes.cjs` (5 项独立场景) | 未执行 | **5 / 5 PASS**（B-ACTION-TYPE-MISMATCH、B-TARGET-ID-MISMATCH、B-CONCURRENT-CAS-409、B-CRASH-RECOVERY-TRACKING、B-MOCK-RPA-ISOLATION） |

---

## 3. 全量测试命令与退出码

所有命令均使用当前源码构建产物实际运行，退出码严格为 0：

1. **Batch B 专项测试**：
   - 命令：`pnpm --filter @crosspilot/api test apps/api/test/operation-automation-approval-hardening.spec.ts`
   - 退出码：`0`（7 / 7 PASS）
2. **Batch B 独立探针**：
   - 命令：`node artifacts/external-absorption/batch-b/batch-b-probes.cjs`
   - 退出码：`0`（5 / 5 PASS）
3. **相关发布与审批回归测试**：
   - 命令：`pnpm --filter @crosspilot/api test apps/api/test/automation-publish-truth.spec.ts apps/api/test/v9-upgrade.integration.spec.ts`
   - 退出码：`0`（10 / 10 PASS）
4. **Batch A 成果防回退验证**：
   - `node artifacts/external-absorption/batch-a/review-codex/batch-a-probes.cjs` -> 退出码：`0`（4 / 4 PASS）
   - `pnpm --filter @crosspilot/api test apps/api/test/legacy-reset-disabled.spec.ts apps/api/test/simulator.spec.ts apps/api/test/market-service-snapshot-truthfulness.spec.ts` -> 退出码：`0`（11 / 11 PASS）
   - `node packages/integrations/test/xydc-market-overview-truthfulness.test.cjs` -> 退出码：`0`（6 / 6 PASS）
   - `node --test apps/web/test/market-overview-truth.test.cjs` -> 退出码：`0`（3 / 3 PASS）
5. **G1 两轮探针独立验证**：
   - `node artifacts/automation-v1/g1-review/review-probes.cjs` -> 退出码：`0`（10 / 10 PASS）
   - `node artifacts/automation-v1/g1-review-round2/review-probes.cjs` -> 退出码：`0`（10 / 10 PASS）
   - `node artifacts/automation-v1/g1-review-round2/remaining-probes.cjs` -> 退出码：`0`（9 / 9 PASS）
6. **Monorepo 类型检查**：
   - 命令：`pnpm -r typecheck`
   - 退出码：`0`（10 / 10 workspaces CLEAN, 0 errors）
7. **Next.js Web 生产构建**：
   - 命令：`pnpm --filter @crosspilot/web build`
   - 退出码：`0`（24 / 24 pages compiled）
8. **全链路自动化回归验收（E01～E15）**：
   - 命令：`node scripts/run-automation-acceptance.cjs`
   - 退出码：`0`（15 / 15 PASS, 35s）

---

## 4. 文件变更清单与 Git SHA-256 指纹

### 4.1 Batch B 改动与新增文件

| 文件路径 | SHA-256 指纹 | 状态说明 |
|:---|:---|:---|
| `apps/api/src/modules/operation-automation/approval-proof.types.ts` | `F5264DA1C42C3175B86704B60BEB444AB355699858D00DA441D02BF85DAFAED7` | 新增局部 ApprovalProof 契约 |
| `apps/api/src/modules/operation-automation/operation-automation.service.ts` | `D03FEA2028BF69876F772AFC9F1E4B6F12AF406B3A0BDCE0CE8A2136B055165F` | 审批强校验、单条 CAS、崩溃恢复状态写入 |
| `apps/api/src/modules/operation-automation/operation-automation.controller.ts` | `B86EDCF037F4D2D4BC26F414A4FE586992815E28E8F119E5E4731031FFF75FDE` | 扩展 body 校验与 pending-dispatches 路由 |
| `apps/api/test/operation-automation-approval-hardening.spec.ts` | `1977D9F02A4529501809666768C7503BDE0D5585EDF5BAAFD3880E88B4D6A34C` | Batch B 失败复现与验收测试套件 |
| `artifacts/external-absorption/batch-b/batch-b-probes.cjs` | `F25412B5C8AFA895519D6992D1A11EB80AA95ABC708120B0246B58572E8A73DE` | Batch B 独立对抗审查探针 |
| `apps/api/test/v9-upgrade.integration.spec.ts` | `985232B987C91FCCCB8621A7198C0D0AA7669F22FBA8240B6129A7357A71E0BB` | 补齐 mockPrisma 中的 actionType/targetId |

### 4.2 Batch A 关键安全与真实性文件指纹保持（严格无变动）

| 文件路径 | SHA-256 指纹 | 与 Batch A 终审对比 |
|:---|:---|:---:|
| `apps/api/src/modules/simulator/simulator.service.ts` | `610B324CE4621B553701CE2F649677BD3057733BC50E533C6C907DFA7BDF9166` | **严格一致** |
| `apps/api/test/simulator.spec.ts` | `DFB23B9D4E24EF484E62A037447B3EFE716D3AF0CF4513AAC302F191C6527949` | **严格一致** |
| `packages/db/src/commerce/simulator-adapter.ts` | `0883B228F725B8F8AAA772CABC50E8E679513F88BB212F35D8D7856EFDBB042B` | **严格一致** |
| `apps/api/test/legacy-reset-disabled.spec.ts` | `4428C03483D6CC58D67C535B25F224F1ACC948604D977BC14AC8E452E254C4C6` | **严格一致** |
| `apps/api/src/modules/market/market.service.ts` | `4F0CD70DA1C735C5C8035426706A2377B17559DC9451A9C1BDA018F72B2ED841` | **严格一致** |
| `packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts` | `0E3EDAD17E4C170C7228737B0BF8372CA3D9E2507CF72080EB5C280D99C59351` | **严格一致** |
| `packages/shared/src/contracts/research-contracts.ts` | `DBC174FDB06DC7136546CCEDC502A35E06571265D390099EAF39E7121D292006` | **严格一致** |
| `apps/web/src/app/app/market-research/page.tsx` | `7F556EBDB12EE27D7F68CFD566D46307710F29177842E90F5481978B8E12F0EF` | **严格一致** |

---

## 5. 未验证项与纪律声明

1. **未启动批次**：Batch C～E（全仓契约增量导出、多店归因文档建模、端到端 ERP 超时自愈等）严格保持未开始（NOT_STARTED），等待统筹独立复验放行。
2. **模式隔离保持**：该 RPA 发布链路继续严格保持 `executionMode: 'MOCK'` 与 `providerId: 'mock-rpa'`，绝无调用外部真实 Amazon SP-API 或 ERP。
3. **未提交/未推送/未部署**：代码严格保留在未提交工作区，Git HEAD 保持为 `e474c20882094d2d34ed0da52591319a077319a8`。
4. **门禁声明**：自报 **`READY_FOR_REVIEW`**，停止操作，等待统筹 AI 执行独立复验。
