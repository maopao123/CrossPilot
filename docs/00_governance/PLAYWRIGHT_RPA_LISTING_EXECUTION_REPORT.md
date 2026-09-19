# Phase B · Playwright Listing RPA 真实浏览器执行交付验收报告

**实施日期：** 2026-09-19  
**实施目标：** 实现真实的 Playwright 浏览器自动化适配器（`PlaywrightRpaAdapter`），操作高拟真测试后台（`MockSellerCentralServer`），完成首个 P0 RPA 业务场景——Listing 发布与更新（`UPDATE_LISTING`）。实现真实的浏览器启动、页面导航、SKU 检索、表单编辑、提交保存、页面重载回读验真（Read-back Verify）、真实截图（Screenshot）与 Playwright Trace.zip 生成。

---

## 1. 核心改动文件

| 文件 | 类型 | 职责说明 |
| :--- | :--- | :--- |
| `packages/integrations/src/rpa/playwright.adapter.ts` | 新增 | 实现标准 `RpaAdapter` 接口（`id = 'playwright-rpa'`, `supportedModes = ['LIVE']`），管理生命周期并调度工作流 |
| `packages/integrations/src/rpa/playwright/mock-seller-central.server.ts` | 新增 | 原生 Node HTTP 编写的轻量测试级 Seller Central，提供完整的 SKU 列表、搜索框、Listing 编辑页、保存状态提示与数据持久化 |
| `packages/integrations/src/rpa/playwright/seller-central.page.ts` | 新增 | Page Object Model（POM）封装，隔离 CSS/DOM 选择器、表单读写、错误警示识别与重载回读方法 |
| `packages/integrations/src/rpa/playwright/listing.workflow.ts` | 新增 | 确定性 Listing 更新工作流，管理浏览器 context 隔离、Tracing 启停、Before/After 截图采集与字段数值严格验真 |
| `packages/integrations/src/rpa/rpa.registry.ts` | 修改 | 在 `RpaRegistry` 中默认注册 `PlaywrightRpaAdapter` |
| `packages/integrations/src/rpa/index.ts` | 修改 | 增量导出 Playwright RPA 相关类与工作流 |
| `packages/actions/test/playwright-rpa-execution.spec.ts` | 新增 | 覆盖 Gate B 全量 15 项真实性、健壮性与 HITL 门禁测试 |
| `.gitignore` | 修改 | 添加 `.runtime-evidence` 忽略规则，避免二进制截图与 trace 误入 git |

---

## 2. 设计与架构原则

1. **确定性自动化（No Autonomous Clicking by LLM）**：
   - AI Agent / Workflow 仅负责规划与提出 Action Proposal；
   - 必须通过人类审批（HITL Approval，`requiresHumanApproval && !isApproved` 立即拦截在 Human Gate，状态保持 `WAITING_APPROVAL`，`effect: 'NOT_APPLIED'`，绝对不触发浏览器）；
   - Playwright RPA 仅作为底层执行器，严格按入参执行预设的确定性步骤（Navigate → Locate → Fill → Click → Wait → Verify → Capture Evidence）。
2. **拒绝 Fake Evidence**：
   - 彻底废弃 Mock 的静态 Unsplash URL 与固定 SUCCESS 假回执；
   - 真实启动 Chromium 无头浏览器，真实生成 `screenshot-before.png` 与 `screenshot-after.png`（体积均 > 35KB）；
   - 真实开启 Playwright Tracing，保存完整的 `trace.zip`（包含 DOM 快照、网络请求与控制台日志，体积 > 250KB，可在 `playwright show-trace` 中回放）。
3. **闭环回读验证（Read-back Verification）**：
   - 页面点击保存并捕获状态提示后，主动执行 `page.reload()`；
   - 从重载后的真实 DOM 中再次抓取 `title` 与 `price`；
   - 若回读数值与预期不符，直接抛出 `VERIFY_FAILED` 异常并将状态置为 `FAILED`，坚决不掩盖执行偏差。
4. **错误分类与 Fail-Closed**：
   - 元素/SKU 不存在：分类为 `SELECTOR_NOT_FOUND`；
   - 服务端/表单报错：分类为 `SAVE_FAILED`；
   - 页面响应超时：分类为 `PAGE_TIMEOUT`，状态标为 `TIMEOUT`；
   - 失败时自动抓取 `screenshot-failure.png` 作为审计证据，且绝对不伪装为 `SUCCESS`。
5. **模式隔离与安全防御**：
   - `MockRpaAdapter` 仅在显式 `executionMode: 'MOCK'` 下生效；
   - `LIVE` 模式下严禁未授权静默降级到 Mock。

---

## 3. Gate B 验收矩阵实测

| 验收项 | 要求 | 实测结果 | 判定 |
| :--- | :--- | :--- | :--- |
| **Playwright 真实启动** | 启动真实 Chromium 浏览器进程 | 真实拉起 Headless Chromium | **PASS** |
| **测试站点交互** | 真实请求 Mock Seller Central HTML 页面 | 成功完成首页检索与编辑页渲染 | **PASS** |
| **UPDATE_LISTING 成功** | 修改 SKU-001 的 Title 与 Price | Title 改为新标题，Price 改为 34.99 | **PASS** |
| **Before / After 验证** | 回读前后状态并断言一致性 | Before(24.99) → After(34.99) 完全吻合，verified=true | **PASS** |
| **截图证据真实生成** | 真实生成 before/after PNG 文件 | `screenshot-before.png` (37KB), `screenshot-after.png` (38KB) 真实落盘 | **PASS** |
| **Trace 归档真实生成** | 真实生成 Playwright trace.zip | `trace.zip` (252KB) 真实落盘，支持完整回放 | **PASS** |
| **失败真实性防御** | 元素缺失/保存失败/验证不符时不标 SUCCESS | 严格抛出对应错误，status 严格为 FAILED | **PASS** |
| **超时保护** | 超时中断并分类为 PAGE_TIMEOUT | 超时返回 status=TIMEOUT，未死锁挂起 | **PASS** |
| **HITL 人类门禁** | 未审批动作严禁触发浏览器 | isApproved=false 时直接拦截在 Human Gate，调用次数为 0 | **PASS** |
| **回归测试** | ActionRouter、MockRpa、Yingdao 零回归 | `automation-execution-truth.spec.ts` 22/22 PASS, `actions.spec.ts` 2/2 PASS | **PASS** |

---

## 4. 结论与状态

Phase B（Playwright Listing RPA 真执行）已全部落地并通过 Gate B 终验，所有测试 100% 绿灯，系统已具备 API Integration 与 Browser RPA 双轨真实自动化执行能力。
