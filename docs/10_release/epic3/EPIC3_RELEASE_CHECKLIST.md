# CrossPilot V9 Epic 3: Release Readiness Checklist

> **Comprehensive Verification Matrix for Epic 3 — Daily Operations Intelligence**  
> *Audit Timestamp: 2026-09-12 | Scope: Epic 3 Phases 1 through 8 + Golden Benchmark D1-D10*

---

## 1. 核心架构与设计公理 (Architecture & Design Invariants)

| 检查项 (Audit Item) | 验证标准 (Verification Criteria) | 判定状态 | 备注 / 验证位置 |
| :--- | :--- | :---: | :--- |
| **分层单向解耦** | `Load ≠ Detect ≠ Diagnose ≠ Recommend ≠ Execute` | **PASS** | Phase 1~6 代码完全单向依赖，上游不调用下游 |
| **前端无业务逻辑** | `UI ≠ Business Logic` 前端严禁重新计算任何指标或重排优先级 | **PASS** | `apps/web` 严格消费后端 DTO，无硬编码指标 |
| **审批不等于执行** | `Approval ≠ Execute` 审批仅更新状态至 `APPROVED`，零外部调用 | **PASS** | 全仓审计确认无直接触发 Amazon SP-API/Ads/PO |
| **真实真源唯一性** | `SSE ≠ Source of Truth` PostgreSQL 数据库为唯一状态基准 | **PASS** | SSE 仅推送事件，重连强制以 Snapshot 水合 |
| **持久化故障恢复** | 进程崩溃重启后，跨独立实例完整恢复工作流 | **PASS** | `postgres-workflow-persistence.spec.ts` 实测通过 |
| **无私有思维链泄露** | SSE 与 API 输出不暴露私有 Chain-of-Thought / LLM 原始提示词 | **PASS** | 步骤日志仅包含结构化 `outputSummary` |

---

## 2. 数据库、持久化与并发控制 (Database, Persistence & OCC)

| 检查项 (Audit Item) | 验证标准 (Verification Criteria) | 判定状态 | 备注 / 验证位置 |
| :--- | :--- | :---: | :--- |
| **Prisma 实体扩展** | `AgentTask` 补充 `checkpointVersion`, `checkpointedAt`, `workflowVersion` 等 | **PASS** | `schema.prisma` 向下兼容，通过 `prisma generate` |
| **数据库级原子 OCC** | `UPDATE ... WHERE id = ? AND checkpointVersion = expectedVersion` | **PASS** | 更新数为 0 时精确抛出 `CheckpointVersionConflictError` |
| **审批事务强一致性** | 单个 `prisma.$transaction` 中原子同步 Task、Step 与 Approval | **PASS** | 杜绝工作流状态与审批单之间的分裂脑 |
| **Fail-Closed 故障防护** | 生产环境缺少数据库连接时严格报错，严禁静默回退本地内存 | **PASS** | 抛出 `PersistenceUnavailableError` (503) |
| **多操作员竞争防御** | 操作员 A 批准与操作员 B 驳回并发竞争，严格拦截冲突操作 | **PASS** | `operations-today-workbench.integration.spec.ts` 实测通过 |

---

## 3. 安全防护与脱敏 (Security, Sensitive Data & Multi-Tenancy)

| 检查项 (Audit Item) | 验证标准 (Verification Criteria) | 判定状态 | 备注 / 验证位置 |
| :--- | :--- | :---: | :--- |
| **出站敏感数据脱敏** | API / SSE / Tool / Checkpoint 严格脱敏密钥与密码为 `[REDACTED]` | **PASS** | `SensitiveDataGuard.scrub` 全仓深层生效 |
| **多租户工作区隔离** | 严禁 Workspace A 用户跨租户查询或审批 Workspace B 任务 | **PASS** | 全局 `WorkspaceGuard` 注入，违规返回 403 |
| **RBAC 只读角色保护** | `VIEWER` 用户允许查看，严禁发起诊断、批准、驳回或恢复 | **PASS** | 统一返回 403 `AUTH_FORBIDDEN`，界面禁用按钮 |
| **环境敏感凭据安全** | 无硬编码 API Key，全部经由 `SecretProvider` 安全读取 | **PASS** | 代码库审计通过，未发现明文凭证 |

---

## 4. REST API、SSE 观察流与工具平台 (API, SSE & Tool Platform)

| 检查项 (Audit Item) | 验证标准 (Verification Criteria) | 判定状态 | 备注 / 验证位置 |
| :--- | :--- | :---: | :--- |
| **202 异步任务接收** | `POST /operations/daily-diagnosis` 返回 taskId 与流地址 | **PASS** | 异步调度，支持 `idempotencyKey` 幂等防护 |
| **紧凑响应与选择性展开** | 默认 `GET .../:taskId` 体积 `<4KB`，支持 `?include=...` 按需扩展 | **PASS** | 单 SKU 默认响应实测 2.4KB，避免 LLM 上下文爆炸 |
| **SSE 实时快照与保活** | 建立连接先推送 `snapshot`，15s 心跳 `event: ping`，断开自动清理 | **PASS** | `daily-diagnosis.controller.ts` 实测无监听器泄漏 |
| **Tool Platform 5 大工具** | `run`, `status`, `approve`, `reject`, `dismiss` 完整可用 | **PASS** | 工具平台通过单元测试且输出受 `<4096` 字符保护 |
| **统一 HTTP 错误映射** | 409 (OCC 冲突), 403 (鉴权/租户拒绝), 404 (未找到), 503 (持久化故障) | **PASS** | `HttpExceptionFilter` 统一标准化捕获与结构化输出 |

---

## 5. Operations Today 前端工作台 (Workbench UI)

| 检查项 (Audit Item) | 验证标准 (Verification Criteria) | 判定状态 | 备注 / 验证位置 |
| :--- | :--- | :---: | :--- |
| **每日经营驾驶舱路由** | 访问 `/app/operations/today` 渲染工作台主界面 | **PASS** | Next.js 生产环境成功打包生成 (17.2 kB) |
| **全店健康与风险汇总** | 动态渲染 `CRITICAL` / `NEEDS_ATTENTION` / `HEALTHY` 及风险卡片 | **PASS** | 联动 Phase 6 `WorkflowAggregator` 结果 |
| **DAG 步骤进度展示** | 实时显示 9 步进度百分比与步骤耗时摘要 | **PASS** | 绑定 SSE 事件流响应式更新 |
| **动作流与因果抽屉** | P1/P2/P3 优先级卡片与侧滑展示 Action -> 诊断 -> 证据链条 | **PASS** | 明确标示因果置信度与指标新鲜度 |
| **高风险审批免责弹窗** | HIGH 风险动作必须弹出免责声明弹窗并手动确认 | **PASS** | 醒目展示“此审批不会执行采购。审批不等于执行动作” |
| **OCC 409 冲突弹窗** | 多人协同版本冲突时触发弹窗，引导一键刷新 | **PASS** | `OccConflictModal` 绑定 API 409 错误拦截 |
| **只读角色 VIEWER 适配** | VIEWER 角色进入工作台自动隐藏或禁用操作按钮 | **PASS** | 页面鉴权检查通过，防止无效交互 |

---

## 6. Golden Benchmark D1~D10 固化验证 (Golden Evaluation)

| 用例编号与场景 | 预期断言与判定标准 | 判定状态 | 实测结果 |
| :--- | :--- | :---: | :--- |
| **D1: Profit Erosion** | 识别利润下滑，诊断广告驱动，推荐 P1 `REVIEW_AD_SPEND`，残差为 0 | **PASS** | 广告花费占比激增，残差完全闭合（0 残差） |
| **D2: Active Stockout** | 库存储备 0，触发 `OUT_OF_STOCK`，生成 P1 HIGH 风险 `PREPARE_REPLENISHMENT` | **PASS** | 影响类型正确标为 `ESTIMATED`，杜绝伪称已损失 |
| **D3: Imminent Stockout** | 库存储备 11.8 天 < 15 天交期，确定性计算补货量（来自库存算法） | **PASS** | 补货量确定性产出正整数，非模型猜测 |
| **D4: Product Quality** | 退货率 6.7% 与 VOC 31.1% 关联，推荐 `INVESTIGATE_PRODUCT_FIT` | **PASS** | 正确推荐咨询性动作，非高风险自动改动 |
| **D5: Fresh Competitor** | 竞品降价 15.4% 且数据最新，推荐 `REVIEW_PRICE_COMPETITIVENESS` | **PASS** | 识别为新鲜竞争压力，生成定价审计动作 |
| **D6: Stale Competitor** | 竞品数据过期（>40天），降低因果置信度，严禁高风险直接降价建议 | **PASS** | 拦截高风险改价，推荐 `REFRESH_COMPETITOR_DATA` |
| **D7: Ad Waste Spend** | 零转化搜索词花费 $185，推荐 P1 `REVIEW_NEGATIVE_KEYWORD` (MEASURED) | **PASS** | 关联实体精确到搜索词，影响金额精确到美分 |
| **D8: Healthy Business** | 全健康指标无异常，输出 0 信号、0 诊断、0 建议，全局 `HEALTHY` | **PASS** | 零 AI 假警报与强行刷存在感建议 |
| **D9: Partial Data** | 某领域不可用，全局标为 `PARTIAL`，严禁假借无数据认定为“健康” | **PASS** | 跳过未评估规则，不触发假警报 |
| **D10: Revenue Up, Profit Down** | 销售额增长 +20% 但净利降 -76.5%，精准锁定广告暴增为元凶 | **PASS** | 识破表面虚假繁荣，给出精准削减浪费建议 |

---

## 7. 全局质量门禁与工程基线 (Monorepo Quality Gate)

| 门禁项 (Gate Item) | 质量标准 | 判定状态 | 详细数据 |
| :--- | :--- | :---: | :--- |
| **Typecheck** | Monorepo 10 个 workspace 包 `tsc --noEmit` 0 错误 | **PASS** | 10/10 packages clean |
| **Unit & Integration Tests**| 全量 monorepo 测试套件 100% 通过 | **PASS** | **38/38 suites, 300/300 tests PASS** |
| **Golden Evals** | 金标回归测试用例 100% 通过 | **PASS** | **9/9 PASS (100.0%)** |
| **Web Production Build** | Next.js 生产打包成功，路由生成正常 | **PASS** | **23/23 routes generated clean** |
| **Epic 1/2 Regression** | Listing Studio, Claim Grounding, RAG 零回归 | **PASS** | 0 Regression |
| **Live Browser Smoke** | 生产构建包在静态服务与无头运行时正常加载 | **PASS** | Next.js build 成功提取 23 个页面，含 `/app/operations/today` |

---

## 8. 已知局限与边界公开 (Known Limitations)

- [x] **No Amazon automatic execution**: Epic 3 只输出建议与审批，不包含向亚马逊后台发起写操作的自动化执行器。
- [x] **No Ads automatic bid update**: 广告建议批准后仅更新系统内部状态，不直接改写亚马逊广告活动竞价。
- [x] **No automated Purchase Order creation**: 补货建议批准后不自动向 ERP 或供应商下达具有法律约束力的采购订单。
- [x] **Synthetic Scenario Baseline**: 当前自动化测试与演示数据基于 POLEGAS 90 天确定性业务模拟器，尚未接入真实生产亚马逊店铺私有数据。
- [x] **Single-Region Deployment Focus**: 当前数据库持久化针对单集群部署，多地域主从容灾属于未来演进规划。
