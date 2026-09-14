# CrossPilot External Design Absorption - Batch A 实施与验收证据报告

> **状态**：`READY_FOR_REVIEW`（待评审，未提交/未推送/未部署）  
> **执行批次**：Batch A（A-1 停用不安全 Legacy Reset + A-2 修复 XYDC 市场概览数据真实性）  
> **Git Base HEAD**：`e474c20882094d2d34ed0da52591319a077319a8`  
> **执行环境**：Windows 11 / Node.js / pnpm / PostgreSQL 127.0.0.1:5432 (Isolated Test DB)  
> **依据规范**：`docs/00_governance/more/EXTERNAL_ABSORPTION_BATCH_A_HANDOFF_20260914.md`

---

## 1. 实施范围与目标对齐

本批次严格限定于交接文件选定的范围，仅执行两项闭环任务，未启动 Batch B～E，未修改业务代码外的全局模型，未迁移数据库 Schema，未安装外部 Skill，未执行 git commit / push / deploy。

### 1.1 A-1：停用不安全 Legacy Reset
- **封闭入口**：
  - `apps/api/src/modules/simulator/simulator.service.ts`: `reset()` 方法在执行任何 DB 查询或 fixture 写入前，直接抛出 `BadRequestException('LEGACY_RESET_DISABLED: 传统模拟器重置已停用以保护未经验证的工作区数据。请创建并使用新的 v2 闭环模拟 Run。')`。
  - `packages/db/src/commerce/simulator-adapter.ts`: `reset()` 抛出相同语义的 `LEGACY_RESET_DISABLED` 异常，彻底切断底层 `SimulatorPersistence.resetWorld` 调用路径。
- **保护保证**：
  - 不以“没有 store”、“名称以 SIM 开头”或前端布尔标志作为删除判断依据。
  - 拒绝在有真实店铺或混合数据的工作区执行任何写操作（零写入、零删除、零重建）。
  - 保留 v2 dedicated workspace 的 `ConflictException: RESET_REQUIRES_NEW_RUN` 保护机制。
  - 保留 v2 创建并推进闭环模拟 Run 的全部正常生命周期。

### 1.2 A-2：修复 XYDC 市场概览数据真实性与消费链闭环
- **映射修正** (`packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts`):
  - 移除 `toMarketOverview` 中所有伪造默认常量（`48500`, `30.5`, `4.42`, `1120`, `12`, `8.8`, `6.5`, `'Home & Kitchen > Bath'`）。
  - 实现 `pickFiniteNumber(primary, fallback)` 强校验，严格保护合法 `0`（`0` 不被 `||` 覆盖为假常数）。
  - 字段优先级明确：主字段为 `0` 时绝不被别名字段的非零值覆盖；主字段缺失且别名存在时合法继承别名值。
  - 修正证据摘要生成：缺失字段显示为 `'未提供'`，严禁将缺失转换为 `'0'` 或 `'$0'`；真实 `0` 如实展示为 `'0'` / `'$0'`。
- **契约定义扩展** (`packages/shared/src/contracts/research-contracts.ts`):
  - `MarketOverviewSnapshot` 中数值字段 (`searchVolumeMonthly`, `avgPrice`, `avgRating`, `avgReviewCount`, `competitorCount`, `opportunityScore`, `competitionScore`) 及 `category` 类型由非空改为允许 `null`。
- **前端消费者闭环** (`apps/web/src/app/app/market-research/page.tsx`):
  - 移除前端大盘卡片中的 `|| 48500`、`|| 8.8`、`|| 6.5` 假兜底。
  - 使用 `!= null ? val : '—'` 进行空安全格式化：数据缺失时显示占位符 `'—'`，真实 `0` 如实显示为 `'0'`、`'0 / 10'`。

---

## 2. 测试驱动（TDD）与失败复现记录

按照规范“先写断言正确行为的失败测试，修前失败、修后通过”执行。

### 2.1 A-1 失败复现
- **复现测试**：`apps/api/test/legacy-reset-disabled.spec.ts`
- **修前行为**：调用 `simulatorService.reset(wsId)` 会调用 `persistence.resetWorld`，在数据库中执行级联删除与种子重建。
- **修后断言**：调用 `reset` 立即被拒绝并抛出 `LEGACY_RESET_DISABLED`，Prisma 的 `deleteMany`、`create` 均未被调用（调用次数严格为 0）。

### 2.2 A-2 失败复现
- **复现测试**：`packages/integrations/test/xydc-market-overview-truthfulness.test.cjs`
- **修前运行结果（失败复现）**：
  ```text
  [TEST] Running XYDC Market Overview Truthfulness Acceptance Tests...
  --- Case 1: All metrics missing (keyword only) ---
  AssertionError [ERR_ASSERTION]: Missing search volume must be null, not 48500
      at Object.<anonymous> (packages/integrations/test/xydc-market-overview-truthfulness.test.cjs:25:8)
  ```
- **修后运行结果**：5/5 测试用例全部通过（详见后文）。

---

## 3. 测试验证与回归证据

### 3.1 单元与集成测试结果

| 序号 | 测试套件 / 探针文件 | 测试项数 | 结果 | 重点覆盖说明 |
|:---|:---|:---:|:---:|:---|
| 1 | `apps/api/test/legacy-reset-disabled.spec.ts` | 3 / 3 | **PASS** | Case 1: 真实/未验证工作区拒绝且 0 写入；Case 2: Controller 入口拦截；Case 3: v2 Run 工作区保留 409 契约 |
| 2 | `apps/api/test/simulator.spec.ts` | 6 / 6 | **PASS** | 模拟器全套单元测试（含 legacy reset 拒绝、7天推进、幂等性、409防并发、权限校验） |
| 3 | `apps/api/test/closed-loop-v2-compat.spec.ts` | 8 / 8 | **PASS** | v2 闭环模拟模型路由、Run 创建、幂等重放、v2 工作区隔离保护与租户隔离 |
| 4 | `packages/integrations/test/xydc-market-overview-truthfulness.test.cjs` | 5 / 5 | **PASS** | Case 1: 全缺失返回 null 与摘要「未提供」；Case 2: 合法 0 严格保留；Case 3: 主字段 0 优于别名非零；Case 4: 别名兜底；Case 5: 正常非零值完整映射 |
| 5 | `apps/web/test/market-overview-truth.test.cjs` | 2 / 2 | **PASS** | 前端组件源码无假常量回退；格式化器对合法 0、null、正常值准确呈现 |
| 6 | `apps/web/test/automation-page-truth.test.cjs` | 3 / 3 | **PASS** | 前端 G1-R05 真实性回归测试 |
| 7 | `artifacts/automation-v1/g1-review/review-probes.cjs` | 10 / 10 | **PASS** | G1 第一轮 10 项探针（执行模式隔离、非终态拦截、缓存约束等） |
| 8 | `artifacts/automation-v1/g1-review-round2/review-probes.cjs` | 10 / 10 | **PASS** | G1 第二轮 10 项探针（外部单号真实性、缓存强约束等） |
| 9 | `scripts/run-automation-acceptance.cjs` (E01～E15) | 15 / 15 | **PASS** | 全链路自动化回归（OCC租约防重、ERP HTTP联调、ROP补货流、多批次收货对账、自愈接管） |

### 3.2 Monorepo 类型检查与前端编译

- **`pnpm -r typecheck`**：
  - 作用范围：全部 10 个 TypeScript 项目（`@crosspilot/shared`, `@crosspilot/integrations`, `@crosspilot/web`, `@crosspilot/actions`, `@crosspilot/ai`, `@crosspilot/domain`, `@crosspilot/db`, `@crosspilot/tool-platform`, `@crosspilot/worker`, `@crosspilot/api`）
  - 结果：**10 / 10 Done, 0 errors**。
- **`pnpm --filter @crosspilot/web build`**：
  - 结果：Next.js 14.2.35 生产构建编译成功（24 个静态/动态页面全部生成，类型检查通过）。

---

## 4. 变更文件清单与 SHA-256 指纹

### 4.1 修改的文件（Modified）

| 文件路径 | SHA-256 指纹 | 变更说明 |
|:---|:---|:---|
| `apps/api/src/modules/simulator/simulator.service.ts` | `610B324CE4621B553701CE2F649677BD3057733BC50E533C6C907DFA7BDF9166` | 在 `reset()` 入口增加 `LEGACY_RESET_DISABLED` 拦截，杜绝数据重置风险 |
| `apps/api/test/simulator.spec.ts` | `DFB23B9D4E24EF484E62A037447B3EFE716D3AF0CF4513AAC302F191C6527949` | 适配 reset 禁用断言；后续 mock 状态测试使用 `initSimState` |
| `apps/web/src/app/app/market-research/page.tsx` | `BE666B9498581EF9799CE12E4C5BC049F8E8496D32C17ECDB251BBF30D01D91B` | `MarketSnapshot` 字段增加 `null` 兼容；移除 `|| 48500` 等伪造常数 |
| `packages/db/src/commerce/simulator-adapter.ts` | `0883B228F725B8F8AAA772CABC50E8E679513F88BB212F35D8D7856EFDBB042B` | `SimulatorAdapter.reset()` 同步抛出 `LEGACY_RESET_DISABLED` |
| `packages/integrations/src/provider-framework/providers/xydc/xydc.mapper.ts` | `122C94C4C249F2F22543D044684E8582A8F6E3A0E87B1F5A2491C0C17D69B484` | 移除 `toMarketOverview` 假默认值；增加 `pickFiniteNumber` 保护真实 0 |
| `packages/shared/src/contracts/research-contracts.ts` | `AEA737F6AB149DA773FC715C26EF7A0A85D661566B3CF34CEBA92C2A46A5193E` | `MarketOverviewSnapshot` 数值指标及 category 允许为 `null` |

### 4.2 新增的测试文件（Untracked Tests）

| 文件路径 | SHA-256 指纹 | 说明 |
|:---|:---|:---|
| `apps/api/test/legacy-reset-disabled.spec.ts` | `4428C03483D6CC58D67C535B25F224F1ACC948604D977BC14AC8E452E254C4C6` | A-1 专项验收测试（0 写入断言、Controller 抛错、v2 保留） |
| `apps/web/test/market-overview-truth.test.cjs` | `381B028B461B41885D799C34AA3E4D9B19323C38C360D50C0F79A375370D7889` | A-2 前端消费展示专项验收测试 |
| `packages/integrations/test/xydc-market-overview-truthfulness.test.cjs` | `1DCB356FE02BFF0080DBA1058138A2B1936354C44FCDD3D0F0D8AE8110F96831` | A-2 数据映射真实性专项验收测试（覆盖缺失、合法0、别名优先级等） |

---

## 5. 验收边界与风险说明

1. **已接受的产品代价**：
   - 传统模拟器重置（Legacy Reset）当前已被明确关闭。在未来实施租户安全隔离或来源迁移之前，任何针对传统工作区的 reset 请求均将返回中文友好的 `LEGACY_RESET_DISABLED` 提示，引导用户创建 v2 Run。
   - 不在报告中虚称“已实现混合数据安全清理”。
2. **生产与发布状态**：
   - 本地未执行 `git commit`、未执行 `git push`、未执行任何部署操作。
   - 当前分支严格停留在 `origin/master`，处于待人工代码复审状态（`READY_FOR_REVIEW`）。
