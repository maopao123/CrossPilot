# CrossPilot 交接

**日期：** 2026-09-12  
**本文件：** 当前会话结束后的唯一项目交接入口。下一会话先读这里，再读治理文档。  
**不要把本文件当成 V9.1 Freeze 替代件。** Freeze 真相源仍是 `00_governance/V9_1_RELEASE_FREEZE.md`。

---

## 0. 现在停在哪

```text
CrossPilot V9.1
RELEASE VERIFIED & FROZEN

Epic 4
CODE COMPLETE (read-only store foundation) — not tagged, not deployed

V9.2
NOT STARTED

Live code (cloud):
e457d5a   post-V9.1 visual system (frontend only)
Local uncommitted:
Epic 4 Amazon Provider + commerce APIs (see EPIC4_IMPLEMENTATION_EVIDENCE.md)
```

**下一产品阶段等人工拍板。** 不要自动开 Epic 4、V9.2、Scheduler、Launch Center、Amazon SP-API，也不要为了刷绿把 XYDC `5147` 改成 `5151`。

Windows 本机 **只做开发**。不要在本机起 Postgres / API / Web / 浏览器验收。真实运行时是云机。

---

## 1. 必须先读

按这个顺序：

1. 本文件 `docs/HANDOFF.md`
2. `docs/00_governance/V9_1_RELEASE_FREEZE.md`
3. `docs/00_governance/CURRENT_SYSTEM_AUDIT_BASELINE.md`
4. `docs/00_governance/V9_PRODUCT_CAPABILITY_MATRIX.md`
5. `docs/00_governance/V9_1_FINAL_BROWSER_ACCEPTANCE_REPORT.md`

`docs/00_governance/临时命令.txt` 顶部已是 Freeze 完成横幅。下方 Browser Acceptance 正文是历史，**不要再执行一遍**。

---

## 2. SHA 不要混

| 角色 | SHA | 说明 |
| :--- | :--- | :--- |
| V9.1 主体 | `c4704fd` | Epic 3 + Phase 1 / 2 / 2.1 / 2.2 / 3 |
| 验收时已部署应用 | `7c81411` | Final Browser Acceptance 热修后的运行代码 |
| Release documentation baseline / tag `v9.1.0` | `b3d5607` | `7c81411 → b3d5607` 只有验收报告 |
| Freeze 声明提交 | `87d4eb2` | 治理文档；不改 tagged 应用基线 |
| **当前 origin/master 与云机 HEAD** | **`e457d5a`** | post-V9.1 视觉系统；前端 only |

```text
Tag v9.1.0  →  b3d5607     不要 retag，不要 force-push
Live web    →  e457d5a     已部署到 2222
```

`git diff --name-only 7c81411..b3d5607` = `docs/00_governance/V9_1_FINAL_BROWSER_ACCEPTANCE_REPORT.md`。

---

## 3. 运行时

| 项 | 值 |
| :--- | :--- |
| Host | `root@116.198.230.217`（hostname `lavm-kx3e35xpar`） |
| 代码 | `/root/zls/project/CrossPilot` |
| Git | `origin https://gitee.com/zhang-liangshan/CrossPilot.git`，分支 `master` |
| 公网 | http://116.198.230.217:2222 |
| PM2 | `crosspilot-api`（Nest `dist/main.js` :3001）/ `crosspilot-web`（`next start -p 2222`）/ `crosspilot-worker` |
| API 前缀 | `/api/v1`；Next rewrite `/api/:path*` → `127.0.0.1:3001` |
| 数据 | PostgreSQL / Redis / Milvus 只听 `127.0.0.1`，不公网直连 |
| 部署铁律 | 保留远程 `.env` 与未跟踪的 `ecosystem.config.cjs`；**不要 commit 密钥** |

SSH：

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=10 root@116.198.230.217
```

Demo：`POST /api/v1/auth/demo-login`；`demo@crosspilot.com` / `crosspilot123`。  
VIEWER：`viewer@crosspilot.com`（云库已 seed，不要在本机再造租户）。

登录后落地：**`/app/operations/today`**（`e457d5a` 起；V9.1 验收时落地 Overview）。

---

## 4. 本会话做了什么

一次会话里连续四段，都已完成。

### 4.1 远程 Final Browser Acceptance（上一压缩段收口）

- 本机不跑产品栈。本地 V9.1 推 Gitee，云机部署，对 `2222` 验收。
- 远程 API 合同 **26/26 PASS**。浏览器：登录 → Overview（当时）→ Operations Today。
- 验收热修两个 P0，均 FIXED / RE-VERIFIED：
  - **BA-001** `bcrypt.default.compare` 运行时失败 → `import * as bcrypt from 'bcrypt'`
  - **BA-002** 场景 SKU code 写入 `activeSkuId` UUID FK → 非 UUID 不写 FK
- 结论当时：`PASSED` / `READY TO FREEZE`。未进 Epic 4。

权威报告：`00_governance/V9_1_FINAL_BROWSER_ACCEPTANCE_REPORT.md`

### 4.2 V9.1 Release Freeze

- 不是开发阶段。无新 Feature、无 Epic 4、无 V9.2、无顺手修 Known Gap。
- 确认 `7c81411 → b3d5607` 仅文档后，以 `b3d5607` 为 release baseline，annotated tag **`v9.1.0`**（已推 Gitee，未强推已有 tag）。
- 新增 `00_governance/V9_1_RELEASE_FREEZE.md`；更新 Baseline / Capability Matrix / Authority Map。
- REAL / PARTIAL / MISSING **未改写**。XYDC 裁决保持：`5147` fixture / `5151` LIVE mutable。
- Freeze 文档提交 `87d4eb2`。当时云机应用仍是 `7c81411`（Freeze 当日未 redeploy）。

### 4.3 UI / UX 全站审计（只读，无代码）

按 redesign-existing-projects + Taste（运营舱拨档：Variance 3–4 / Motion 3–4 / Density 7–8）。

判断：深色优先 Tailwind Admin + 亮色 CSS 补丁；侧栏是 PRD 目录不是早晨工作流。

P0：IA、首页主 CTA 是重置演示、无 Design System、字体无层次、等宽 KPI 卡墙。

### 4.4 按审计实施视觉系统，并部署

Commit **`e457d5a`**（前端 only）。云机 `pnpm install` + shared/web build + `pm2 reload crosspilot-web`。`.env` / `ecosystem.config.cjs` 已保留。

部署核验（远程）：

- HEAD `e457d5a`
- Next **23/23**
- health **200**
- `/login` **200**（本机公网与机内均 200）
- `/app/operations/today` 机内 **200**

本地自检（改视觉时，未起产品栈）：

- web typecheck 通过
- web contract tests **29/29**
- web build 23/23
- `next lint` **未配置**，未强行初始化 ESLint

未改：后端、Prisma、冻结算法、Provider / XYDC、OCC `updateMany`。

---

## 5. `e457d5a` 视觉落地摘要

已做：

- Geist + Geist Mono；暖灰纸色 + 深青绿 accent；圆角 6/8/12；去掉紫蓝渐变 / glow
- 侧栏分组：今日 / 经营 / 商品与流量 / 履约 / 更多；去掉 01–16 与英文副标题
- Copilot 仍显示 **Coming Later**（V91-027 合同）
- 登录与 `/` → Operations Today
- `< lg` 侧栏抽屉；SKU 选择器小屏可见
- 公共组件：`AppShell`、`Button` / `Input` / `Card` / `Table` / `Tabs` / `PageHeader` / `Skeleton`
- Overview 指标带 + 主 CTA「处理今日待办」；Reset 降为 ghost
- Today 健康改指标带；`alert()` 改页内错误
- Listing 只留一个实心主按钮
- 经营分析去掉硬编码 `-$2,280`；评论假 4.7 改为 N/A

有意没做（下一步视觉，不是 Release Blocker）：

- Market Research 整页拆卡（文件过大）
- Inventory / Profit / Ads 的 KPI 卡墙（全局 token 已降噪）
- 换 Lucide
- Ads 横幅 / Creative Unsplash 假数据
- 部署后没有再跑一轮完整 Browser Acceptance

---

## 6. 冻结架构（禁止顺手改）

```text
Sku360 / 异常检测 / 诊断 / 推荐打分
WF-05 9-step DAG
OCC updateMany
WorkflowIdempotency
Provider Framework / XYDC Mapper
Opportunity Score v1.0.0
Approval ≠ Execute
```

验收热修只动过：

- `apps/api/src/modules/auth/auth.service.ts`
- `packages/domain/src/operations/workflow/workflow-checkpoint.store.ts`

---

## 7. Known Gaps（不是 V9.1 Blocker，不要当 Bug 修）

- Epic 4 / Amazon SP-API：SUSPENDED / NOT STARTED
- Approval ≠ Execute
- WF-03 PARTIAL、WF-04 PARTIAL
- Launch Center MISSING、Scheduler MISSING
- Creative Mock 生图
- Reviews / VOC PARTIAL
- 独立 KB 管理台 MISSING
- Agent Trace / Eval 独立大屏 MISSING
- XYDC：`5147` = fixture snapshot；`5151` = LIVE mutable。NOT PRODUCT BUG。禁止 `5147 → 5151`

新工作进 **post-V9.1 backlog** 或明确批准的新版本。不要 amend / retag `v9.1.0`。

---

## 8. 验收诚实限制（不要写成“全部点过”）

Final Browser Acceptance 通过的是**当时定义的验收矩阵**，不是全站人工逐页：

- Analyst SSE 未单独浏览器验证
- Orders / Inventory / Profit / Reviews 未全部点完（HTTP/API + 既有合同）
- a11y 不是完整 WCAG
- 本机 `pnpm -r test` 按指令未跑（integrations LIVE `5151≠5147` 按 Phase 2.2）

视觉改版 `e457d5a` 部署后：**没有**再做 26/26 API + 浏览器矩阵。health / login / today 页面 HTTP 200 已核。若要宣布“视觉版也验收通过”，需要新的远程验收轮。

---

## 9. 部署怎么做（下次）

1. 本机 commit + `git push origin master`（Gitee）
2. SSH 云机，**先备份** `packages/db/.env` `apps/api/.env` `apps/web/.env` `ecosystem.config.cjs`
3. `git fetch` + `git checkout -B master origin/master`，再拷回 env
4. `pnpm install`；按改动范围 build（这次只 reload 了 `crosspilot-web`）
5. `pm2 reload <app> --update-env`
6. `curl` health + `/login`

不要 commit：`.runtime-pg/`、`docs/_ops_*`、`.env`、`ecosystem.config.cjs`。

---

## 10. 工作区脏文件（不要入库）

本机未跟踪，保持忽略：

- `.runtime-pg/`（禁止本机起库时留下的嵌入式 Postgres）
- `docs/_ops_*.sh/.cjs/.py`（远程部署/验收探针，含 demo 口令哈希，不进 git）

---

## 11. 下一会话建议（等人工选）

可选，不要自己开：

1. 对 `e457d5a` 做一轮远程 Browser Acceptance（视觉版）
2. 继续视觉：Market Research 减噪、履约页 KPI 卡墙、假数据文案
3. 明确批准后的新版本 / Epic 4
4. 提交本交接文件（当前尚未 commit）

默认：**停住，问人。**

---

## 12. 状态块（复制用）

```text
CrossPilot V9.1
RELEASE VERIFIED & FROZEN
tag v9.1.0 = b3d5607

Live:
e457d5a @ http://116.198.230.217:2222
health 200

Epic 4  SUSPENDED / NOT STARTED
V9.2    NOT STARTED
```
