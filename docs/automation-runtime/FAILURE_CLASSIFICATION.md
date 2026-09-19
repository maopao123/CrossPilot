# Automation Runtime 错误分类规范 (FAILURE CLASSIFICATION)

> **版本**: v1.0.0 (Phase 1)  
> **基线 Commit**: `ca4a291`  
> **最后更新**: 2026-09-19  
> **状态**: Active / Implemented

---

## 1. 概述与核心原则

在 CrossPilot Automation Runtime 中，外部交互（Shopify、ERP HTTP API、Playwright 浏览器 RPA、自研/外部 Agent 等）可能抛出形形色色的异常：HTTP 状态码、GraphQL 业务错误、浏览器 DOM 定位超时、网络断开或鉴权过期。

为了保证 **执行真实性（Execution Truth）** 与 **确定性恢复状态机**，CrossPilot 将所有散落在各处的错误统一归一化为强类型数据结构：`NormalizedExecutionError`。

### 核心红线与不可变原则

1. **禁止盲目重试非幂等/未知副作用请求**：
   - 任何 `TIMEOUT`（包括 HTTP 408/504、TCP 连接超时、Playwright 等待超时）在重试状态机中**绝不可盲目直接重放写操作**。
   - `TIMEOUT` 统一置为 `recovery: 'QUERY'` / `effect: 'UNKNOWN'`，必须先查询远端状态核实是否已生效。
2. **非重试错误立即升级拦截**：
   - 针对 `AUTH`、`PERMISSION`、`VALIDATION`、`CONFLICT` 等不可重试错误，严禁在 Worker 中盲目消耗 retry 次数；必须立即进入 `NEEDS_ATTENTION` 或根据策略转入 `REAUTHORIZE` / `MANUAL`。
3. **证据链落标完整性**：
   - 任何失败均在 `executionEvidence` 中落盘 `errorClass` 与 `normalizedError`，禁止吞没原始信息或输出无类型字符串。

---

## 2. 强类型模型定义

定义位于 `@crosspilot/shared` (`packages/shared/src/contracts/execution-error.ts` 与 `automation-contracts.ts`)：

```typescript
export type ExecutionErrorClass =
  | 'TRANSIENT'        // 瞬时抖动、网络断开、5xx 网关错误（可退避重试）
  | 'RATE_LIMIT'       // 限流、429、Shopify Throttled（退避重试）
  | 'TIMEOUT'          // 超时、页面等待超时（不可盲目重试，先 QUERY 探活）
  | 'AUTH'             // 401、Token 失效（需 REAUTHORIZE）
  | 'PERMISSION'       // 403、无写入权限、演示模板写保护（需 MANUAL 人工介入）
  | 'VALIDATION'       // 400、参数校验失败、配置缺失（不可重试，MANUAL）
  | 'CONFLICT'         // 409、幂等键冲突、版本并发冲突（不可重试）
  | 'NOT_FOUND'        // 404、目标实体远端不存在（不可直接重试，确认未创建后可安全重试）
  | 'PROVIDER_ERROR'   // 下游系统显式返回但无法继续处理（MANUAL）
  | 'RPA_SELECTOR'     // Playwright 元素定位失败、DOM 变更（需人工核查）
  | 'RPA_NAVIGATION'   // Playwright 页面加载或 URL 路由失败（MANUAL）
  | 'VERIFY_MISMATCH'  // 回读反查校验不匹配、金额/数量不一致（强制 NEEDS_ATTENTION）
  | 'UNKNOWN';         // 未识别异常兜底（MANUAL）

export interface NormalizedExecutionError {
  class: ExecutionErrorClass;
  code: string;
  message: string;
  retryable: boolean;
  provider?: string;
  originalStatus?: number;
  cause?: unknown;
}
```

---

## 3. 错误分类映射矩阵 (Error Mapping Matrix)

| 来源输入类型 | 典型示例 / 状态码 | 统一分类 (`class`) | 可否重试 (`retryable`) | 默认恢复策略 (`recovery`) | 状态机阶段 (`phase`) / 远端效果 (`effect`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HTTP 限流** | HTTP 429, `RATE_LIMITED`, Shopify Throttled | `RATE_LIMIT` | `true` | `RETRY` (指数退避) | `READY` / `NOT_APPLIED` |
| **服务端瞬时异常** | HTTP 500, 502, 503 | `TRANSIENT` | `true` | `RETRY` (指数退避) | `READY` / `NOT_APPLIED` |
| **底层网络重置** | `ECONNRESET`, `ECONNREFUSED`, `fetch failed`, `socket hang up` | `TRANSIENT` | `true` | `RETRY` (指数退避) | `READY` / `NOT_APPLIED` |
| **请求超时** | HTTP 408, 504, `AbortError`, `ETIMEDOUT`, `TIMEOUT` | `TIMEOUT` | `false` | `QUERY` (远端探活) | `SUBMITTED` / `UNKNOWN` |
| **鉴权/令牌失效** | HTTP 401, `AUTH_REQUIRED`, Token Expired | `AUTH` | `false` | `REAUTHORIZE` | `NEEDS_ATTENTION` / `NOT_APPLIED` |
| **越权/写保护** | HTTP 403, `FORBIDDEN`, `WRITE_FORBIDDEN` | `PERMISSION` | `false` | `MANUAL` | `NEEDS_ATTENTION` / `NOT_APPLIED` |
| **参数/配置校验** | HTTP 400, 422, `VALIDATION_ERROR`, `CONFIG_ERROR` | `VALIDATION` | `false` | `MANUAL` | `FAILED` / `NOT_APPLIED` |
| **远端资源不存在** | HTTP 404, `NOT_FOUND` | `NOT_FOUND` | `false` | 查询探活确认未创建则重试，创建则报查无 | `READY` / `NOT_APPLIED` (恢复中) |
| **并发/幂等冲突** | HTTP 409, `CONFLICT`, `IDEMPOTENCY_KEY_IN_PROGRESS` | `CONFLICT` | `false` | `MANUAL` | `NEEDS_ATTENTION` / `NOT_APPLIED` |
| **RPA 元素丢失** | `waiting for locator failed`, `SELECTOR_NOT_FOUND` | `RPA_SELECTOR` | `false` | `MANUAL` | `FAILED` / `UNKNOWN` (如已提交) |
| **RPA 导航故障** | `net::ERR_NAME_NOT_RESOLVED`, `page.goto failed` | `RPA_NAVIGATION` | `false` | `MANUAL` | `FAILED` / `NOT_APPLIED` |
| **内容反查不符** | `REMOTE_PAYLOAD_MISMATCH`, 金额/供应商不一致 | `VERIFY_MISMATCH` | `false` | `MANUAL` (报警核对) | `NEEDS_ATTENTION` / `NOT_APPLIED` |
| **未知/内部故障** | 未捕获运行时错误、本地数据同步失败 | `UNKNOWN` / `PROVIDER_ERROR` | `false` | `MANUAL` | `NEEDS_ATTENTION` / 视断点而定 |

---

## 4. 各执行适配器归一化实现说明

### 4.1 HttpERPAdapter (`packages/integrations/src/erp/http-erp.adapter.ts`)
- **HTTP 响应解析**：
  - HTTP 401 / 403 映射为 `AUTH` / `PERMISSION`，附带 `statusCode` 与原始响应。
  - HTTP 429 映射为 `RATE_LIMIT`，`retryable: true`。
  - HTTP 404 映射为 `NOT_FOUND`，`retryable: false`。
  - HTTP 400 / 422 映射为 `VALIDATION`，`retryable: false`。
  - HTTP 5xx 映射为 `TRANSIENT`，`retryable: true`。
- **底层网络与超时**：
  - `AbortError` 严格映射为 `TIMEOUT`，`retryable: false`。
  - `ECONNREFUSED` / `fetch failed` 映射为 `TRANSIENT`，`retryable: true`。
- 所有 `ErpResult<T>` 均包含可选强类型 `normalizedError?: NormalizedExecutionError`。

### 4.2 Playwright RPA (`packages/integrations/src/rpa/playwright.adapter.ts`)
- **预检配置异常**：缺少或非受信 `baseUrl` 抛出 `CONFIG_ERROR`，归一为 `VALIDATION`，`retryable: false`。
- **页面超时与 DOM 查找**：
  - `page.waitForSelector` 超时归一为 `RPA_SELECTOR` 或 `TIMEOUT`。
  - 页面导航报错归一为 `RPA_NAVIGATION`。
- **回读校验**：表单保存后回读页面值，若与请求 payload 不一致归一为 `VERIFY_MISMATCH`。
- 所有 `RpaExecutionResult` 均包含可选强类型 `normalizedError?: NormalizedExecutionError`。

### 4.3 ActionRouter (`packages/actions/src/action.router.ts`)
- **执行前防御**：
  - 目标实体不匹配 (`TARGET_MISMATCH`)：归一为 `VERIFY_MISMATCH`，`effect: NOT_APPLIED`。
  - 审批后载荷篡改 (`PAYLOAD_TAMPERED`)：归一为 `VALIDATION`，`effect: NOT_APPLIED`。
  - 演示模板保护 (`DEMO_PAYLOAD_FORBIDDEN`)：归一为 `PERMISSION`，`errorCode: WRITE_FORBIDDEN`。
  - 不支持的运行时 (`UNSUPPORTED_RUNTIME`)：归一为 `VALIDATION`。
- **执行结果封装**：
  - `ActionExecutionResult` 与 `ExecutionEvidence` 均附带 `errorClass` 与 `normalizedError`。

---

## 5. Automation Recovery 状态机治理与升级机制

在 `apps/worker/src/processors/automation-recovery.processor.ts` 中：

1. **远端状态探活分支 (Case 1: SUBMITTED / VERIFYING / recovery=QUERY)**：
   - 使用 `checkNormalized = checkRes.normalizedError || normalizeExecutionError(...)`。
   - 若 `checkNormalized.class === 'AUTH'` 或 `'PERMISSION'`：判定凭据已不可用，直接升级为 `NEEDS_ATTENTION`，`recovery: 'REAUTHORIZE'` 或 `'MANUAL'`，不再盲目轮询。
   - 若 `checkNormalized.class === 'NOT_FOUND'`：确认远端未创建，且 `attemptCount < 3`，流转至 `READY` / `recovery: 'RETRY'`。
   - 若查询遭遇 `TIMEOUT` / `TRANSIENT`：因远端状态仍然未知，保持 `SUBMITTED` / `recovery: 'QUERY'`，按指数退避排期下次探活；达到 3 次上限后升级为 `NEEDS_ATTENTION` / `effect: 'UNKNOWN'`。
   - 若反查发现内容不匹配 (`REMOTE_PAYLOAD_MISMATCH`)：归一为 `VERIFY_MISMATCH`，强制置入 `NEEDS_ATTENTION` / `recovery: 'MANUAL'`，绝不自动覆盖。
2. **重试执行分支 (Case 2: READY / recovery=RETRY)**：
   - 执行远端操作并获取 `erpNormalized`。
   - **不可重试错误拦截**：若 `!erpNormalized.retryable && erpNormalized.class !== 'TIMEOUT'`（如 `AUTH`, `PERMISSION`, `VALIDATION`, `CONFLICT`），**立即终止重试循环**，直接置入 `NEEDS_ATTENTION`，避免无效重试导致下游限流或报警风暴。
   - **超时防护**：若重试创建遭遇 `TIMEOUT`，因无法断定远端是否已受理，**严禁再次执行创建**，状态机自动转入 `SUBMITTED` / `recovery: 'QUERY'` 探活分支。
   - **瞬时抖动重试**：`TRANSIENT` / `RATE_LIMIT` 按 `2^attemptCount` 秒指数退避，满 3 次后升级为 `NEEDS_ATTENTION`。

---

## 6. 证据审计落标要求 (Evidence Audit Standards)

所有执行痕迹持久化到 `AutomationOperation.evidence` (JSON) 及 `PlannedAction.parameters._evidence`，必须包含以下字段：

```json
{
  "mode": "LIVE",
  "provider": "erp",
  "operationId": "op_20260919_001",
  "phase": "NEEDS_ATTENTION",
  "effect": "UNKNOWN",
  "recovery": "MANUAL",
  "errorCode": "QUERY_TIMEOUT_MAX",
  "errorClass": "TIMEOUT",
  "normalizedError": {
    "class": "TIMEOUT",
    "code": "QUERY_TIMEOUT_MAX",
    "message": "ERP 远端反查超时",
    "retryable": false,
    "provider": "erp",
    "originalStatus": 504
  },
  "verifiedAt": "2026-09-19T09:28:44.000Z"
}
```

任何人工处理（HITL Resolution）通过在 `evidence` 中追加 `manualResolution` 形成完整闭环追踪。
