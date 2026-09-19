# CrossPilot Automation Runtime: Structured Logging & Trace Correlation

本文档定义 CrossPilot 自动化运行时（Automation Runtime）的统一结构化日志（Structured Logging）与全链路链路追踪（Trace Correlation）规范。作为 Phase 3 的核心交付，本文档明确了运行时日志标准、事件命名空间、上下文透传规则、P0 凭据脱敏防线以及与执行状态机、错误分类（Phase 1）、超时与取消（Phase 2）的协同机制。

> [!IMPORTANT]
> **核心原则：观测不改变执行真理，脱敏不留死角，日志绝不阻断业务**
> 
> 1. **日志从属于运行时**：结构化日志是对执行状态机与证据链（Evidence Truth）的如实记录，严禁因为打印日志而吞没、伪造或改变 `ActionExecutionResult`。
> 2. **P0 双重脱敏防线**：所有日志必须通过 Pino 字段脱敏与递归 `sanitizeLogData` 双重保护，严禁泄露 Authorization 标头、Access Token、Database 密码与 `payloadEnc`。
> 3. **Error Serialization 严禁透传 `.cause`**：Axios、Fetch 与 Node 原生错误的 `.cause` 极易包含请求配置（含授权头），序列化时严格剥离 `.cause`。
> 4. **Fail-Safe 容错**：任何日志序列化异常或循环引用必须被静默兜底，绝不允许因日志格式问题导致正常执行链路崩溃。

---

## 一、架构与技术选型

运行时日志基于高性能单行 JSON 日志库 `pino` 构建，统一收敛于 `@crosspilot/shared`。

```mermaid
flowchart TD
    subgraph SharedLogging ["@crosspilot/shared/logging"]
        RL[runtimeLogger / createRuntimeLogger]
        SL[StructuredLogger 封装]
        SR[sanitizeLogData 递归脱敏]
        SE[serializeExecutionError 剥离.cause]
        PR[Pino Built-in Redact]
    end

    subgraph CriticalPath ["Automation Runtime Critical Path"]
        AR[ActionRouter]
        HE[HttpERPAdapter]
        SA[ShopifyAdapter]
        PA[PlaywrightAdapter / ListingWorkflow]
        ARP[AutomationRecoveryProcessor]
        WS[WorkerService]
    end

    CriticalPath -->|child context| SL
    SL -->|1. Data Sanitization| SR
    SL -->|2. Safe Error Extract| SE
    SR --> PR
    PR -->|Single-line JSON| STDOUT[(Stdout / Log Pipeline)]
```

### 核心设计考量
1. **轻量与低损耗**：采用 `pino` 实现零阻塞异步/流式写入，对比 `winston` 等多重格式化库大幅降低高频自动化事件对事件循环的压力。
2. **上下文自动继承**：通过 `logger.child({ traceId, operationId, ... })`，派发与适配器各阶段天然继承上一级链路标识，无需手动在每个日志点拼接上下文。
3. **单行 JSON 规范**：所有输出遵循严格单行 JSON，天然适配 ELK、Datadog、Loki 及云原生日志收集器，支持精确字段检索。

---

## 二、标准化事件命名空间（Event Taxonomy）

统一使用小写点号分隔命名法（Dot-notation），明确事件所处生命周期阶段：

| 事件名称 (`RuntimeEvents`) | 阶段 / 组件 | 描述 |
| :--- | :--- | :--- |
| `dispatch.started` | `ActionRouter` | 动作派发开始，记录执行模式、提供商、目标操作 |
| `dispatch.blocked` | `ActionRouter` | 动作派发前拦截（如需要人机审批、幂等性冲突、参数篡改、演示安全阻断） |
| `dispatch.completed` | `ActionRouter` | 动作派发完成，记录耗时与最终状态 |
| `dispatch.failed` | `ActionRouter` | 动作派发失败，记录错误分类与降级恢复策略 |
| `adapter.request.started` | Adapters (Shopify / ERP / RPA) | 底层 HTTP 或 RPA 自动化步骤开始执行 |
| `adapter.request.completed` | Adapters | 底层请求成功返回，记录 HTTP 状态码与耗时 |
| `adapter.request.timeout` | Adapters | 底层请求超时，记录超时阈值与保护动作 |
| `adapter.request.cancelled` | Adapters | 外部或停机信号主动取消底层请求 |
| `adapter.request.failed` | Adapters | 底层调用发生网络或业务异常 |
| `operation.claimed` | `AutomationRecoveryProcessor` | 崩溃恢复轮询成功抢占待恢复操作 |
| `operation.completed` | `AutomationRecoveryProcessor` | 异步操作成功核验并推进为完成 |
| `operation.failed` | `AutomationRecoveryProcessor` | 恢复操作判定为永久失败 |
| `recovery.sweep.started` | `AutomationRecoveryProcessor` | 恢复巡检扫描开始 |
| `recovery.sweep.completed` | `AutomationRecoveryProcessor` | 恢复巡检扫描完成 |
| `worker.started` | `WorkerService` | Worker 宿主进程启动完成 |
| `worker.stopping` | `WorkerService` | Worker 收到退出信号，广播 AbortSignal |
| `worker.stopped` | `WorkerService` | Worker 安全停机完成 |
| `worker.job.completed` | `WorkerService` | 独立队列 Job 执行完成 |
| `worker.job.failed` | `WorkerService` | 独立队列 Job 抛错失败 |
| `step.navigate` | `ListingWorkflow` | RPA 页面导航步骤 |
| `step.submit` | `ListingWorkflow` | RPA 点击保存 / 提交修改步骤 |
| `step.verify` | `ListingWorkflow` | RPA 重新加载并核验远端状态步骤 |

---

## 三、全链路追踪与关联上下文（Trace Correlation）

每个结构化日志均具备统一根上下文结构 `RuntimeLogContext`：

```ts
export interface RuntimeLogContext {
  traceId?: string;           // 全链路唯一跟踪ID (跨 HTTP/Worker/Adapter)
  operationId?: string;       // AutomationOperation 主键
  workspaceId?: string;       // 租户/工作区隔离主键
  actionId?: string;          // Action proposal 唯一标识
  attempt?: number;           // 当前重试轮次 (从 1 开始)
  provider?: string;          // 适配器提供商 (如 'shopify', 'http-erp', 'playwright-rpa')
  executionMode?: string;     // 'DRY_RUN' | 'SIMULATED' | 'MOCK' | 'LIVE'
  service?: string;           // 产生日志的服务/模块名 (如 'action-router', 'worker-service')
  [key: string]: unknown;
}
```

### 级联透传机制
1. **ActionRouter 入口**：提取 `proposal.traceId`（无则沿用或由上层传入），创建绑定上下文的子 logger：
   ```ts
   const opLogger = this.logger.child({
     service: 'action-router',
     traceId: proposal.traceId,
     operationId: proposal.operationId,
     workspaceId: proposal.workspaceId,
     executionMode: proposal.executionMode,
     provider: proposal.provider,
   });
   ```
2. **Adapter 内部**：在执行 `adapter.execute(...)` 时，透传上下文或由适配器基于入参生成 scoped logger，将 `traceId` 沉淀至每次请求与重试日志中。
3. **Worker 恢复线程**：`AutomationRecoveryProcessor` 在轮询抢占操作后，即刻以该操作的 `traceId` 与 `operationId` 初始化子 logger，确保后续的反查与更新日志可全局检索。

---

## 四、P0 凭据脱敏防线（Double-Layer Secret Redaction）

CrossPilot 涉及商户 Shopify Access Token、ERP 签名密钥、数据库连接串及 Playwright 自动化凭据，必须确保任何异常与日志中**零明文泄露**。

### 第一层防线：Pino 内置 Redact 路径拦截
```ts
export const DEFAULT_PINO_REDACT = [
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'cookie',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'clientSecret',
  'client_secret',
  'password',
  'apiKey',
  'api_key',
  'payloadEnc',
  'credential',
  '*.authorization',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.clientSecret',
  '*.client_secret',
  '*.password',
  '*.apiKey',
  '*.api_key',
  '*.payloadEnc',
  '*.credential',
];
```

### 第二层防线：`sanitizeLogData` 递归深度扫描
在数据进入格式化流之前，主动执行深度递归脱敏，覆盖字符串中的隐藏模式：
1. **数据库连接串密码脱敏**：
   - 匹配包含用户名：`postgresql://postgres:p4ssw0rd@127.0.0.1:5432/db` $\rightarrow$ `postgresql://postgres:[REDACTED]@127.0.0.1:5432/db`
   - 匹配无用户名格式（如 Redis）：`redis://:secret@127.0.0.1:6379/0` $\rightarrow$ `redis://:[REDACTED]@127.0.0.1:6379/0`
   - 覆盖协议：`postgres`, `postgresql`, `redis`, `rediss`, `mysql`, `mongodb`, `mongodb+srv`
2. **嵌入式 Token 脱敏**：
   - Bearer Token: `Bearer eyJhbGciOi...` $\rightarrow$ `Bearer [REDACTED]`
   - Basic Auth: `Basic dXNlcjpwYXNz` $\rightarrow$ `Basic [REDACTED]`
   - Shopify Token: `shpat_abcdef123...` $\rightarrow$ `shpat_[REDACTED]`
3. **敏感属性键名拦截**：
   - 包含 `password`, `secret`, `token`, `apikey`, `payloadenc`, `cookie` 等字段名直接替换为 `[REDACTED]`。
   - 智能排除元信息安全字段：`tokenCount`, `tokenType`, `tokensRemaining`, `tokenId`, `tokenStatus` 不受误伤。
   - 容器支持：对于 `credentials` 等对象容器，递归遍历其子属性并精确脱敏内部敏感叶子。

### 载荷安全概览（`summarizePayload`）
为防止未经脱敏的大型业务载荷（如上百个商品变体或 base64 图片）打爆日志或泄露信息，ActionRouter 日志仅记录载荷的安全摘要：
```json
{
  "keys": ["skuCode", "price", "title", "inventoryQuantity"],
  "skuCode": "SKU-DEMO-001",
  "hasPayloadEnc": true
}
```

---

## 五、安全错误序列化与 `.cause` 严格剥离

在 Node.js 与 Axios 等 HTTP 客户端中，`err.cause` 往往保存了整个原始请求上下文（包含完整的 HTTP headers、Authorization 令牌及敏感 payload）。

```ts
export function serializeExecutionError(err: unknown): Record<string, unknown> {
  if (!err) return { message: 'Unknown error' };

  if (err instanceof NormalizedExecutionError) {
    return {
      name: err.name,
      message: sanitizeString(err.message),
      class: err.class,
      code: err.code,
      retryable: err.retryable,
      status: err.status,
      // 绝对不输出 err.cause，彻底杜绝请求对象与凭据泄露
    };
  }

  // 对标准 Error 进行净化提取，生产环境下抑制敏感调用堆栈
  if (err instanceof Error) {
    return {
      name: err.name,
      message: sanitizeString(err.message),
      ...(process.env.NODE_ENV !== 'production' && err.stack
        ? { stack: sanitizeString(err.stack) }
        : {}),
    };
  }

  return { message: sanitizeString(String(err)) };
}
```

---

## 六、关键路径实装清单

本次改造彻底消除了 Critical Path 中的散落 `console.*` 打印，实装组件如下：

1. **`packages/actions/src/action.router.ts`**：
   - 在派发入口注入 `routerLogger.child({ traceId, operationId, workspaceId, ... })`；
   - 记录 `dispatch.started`；
   - 在审批卡点、幂等冲突、参数防篡改（`PAYLOAD_TAMPERED`）、目标不匹配（`TARGET_MISMATCH`）拦截点记录 `dispatch.blocked` 及阻断原因；
   - 在执行成功或失败后记录 `dispatch.completed` / `dispatch.failed`，输出耗时 `durationMs`。
2. **`packages/integrations/src/erp/http-erp.adapter.ts`**：
   - 在 HTTP 请求发起前后记录 `adapter.request.started` 与 `adapter.request.completed`；
   - 在捕获超时或主动取消时记录 `adapter.request.timeout` 与 `adapter.request.cancelled`，关联 `traceId` 与 `endpoint`。
3. **`packages/db/src/commerce/shopify-adapter.ts`**：
   - 在 `HttpShopifyGraphQLTransport.execute` 中记录 GraphQL 调用的开始、成功状态码、耗时与超时情况；
   - 严格隐藏 GraphQL 请求体中可能的敏感入参。
4. **`packages/integrations/src/rpa/playwright.adapter.ts` & `listing.workflow.ts`**：
   - 在 RPA 工作流前置检查取消时记录 `adapter.request.cancelled`；
   - 在各自动化动作前后记录关键步骤：`step.navigate`, `step.submit`, `step.verify`；
   - 在重新核验失败时记录 `AUTOMATION_VERIFY_MISMATCH` 与前后差异。
5. **`apps/worker/src/processors/automation-recovery.processor.ts`**：
   - 彻底移除 `console.log` / `console.error`；
   - 记录恢复巡检周期：`recovery.sweep.started`, `operation.claimed`, `operation.completed`, `operation.failed`, `recovery.sweep.completed`。
6. **`apps/worker/src/worker.service.ts`**：
   - 彻底移除全部 24 处 `console.*`；
   - 记录 Worker 启动、队列加载、优雅停机（`worker.stopping`, `worker.stopped`）及各类定时调度 Job 完成与失败事件。

---

## 七、标准日志输出样例

### 1. 动作派发开始 (`dispatch.started`)
```json
{
  "level": "info",
  "timestamp": "2026-09-19T11:15:53.942Z",
  "service": "action-router",
  "traceId": "tr_99a8b7c6d5e4",
  "operationId": "op_01J8ABCXYZ12345",
  "workspaceId": "ws_enterprise_01",
  "executionMode": "LIVE",
  "provider": "shopify",
  "event": "dispatch.started",
  "actionType": "PUBLISH_LISTING",
  "payloadSummary": {
    "keys": ["skuCode", "price", "title"],
    "skuCode": "SKU-US-4090"
  },
  "message": "Dispatch started for action proposal act_123"
}
```

### 2. 派发前安全阻断 (`dispatch.blocked`)
```json
{
  "level": "warn",
  "timestamp": "2026-09-19T11:15:54.012Z",
  "service": "action-router",
  "traceId": "tr_99a8b7c6d5e4",
  "operationId": "op_01J8ABCXYZ12345",
  "workspaceId": "ws_enterprise_01",
  "event": "dispatch.blocked",
  "reason": "PAYLOAD_TAMPERED",
  "actionType": "PUBLISH_LISTING",
  "message": "Dispatch blocked: payload binding hash mismatch detected"
}
```

### 3. 适配器超时记录 (`adapter.request.timeout`)
```json
{
  "level": "warn",
  "timestamp": "2026-09-19T11:15:54.215Z",
  "service": "http-erp-adapter",
  "traceId": "tr_99a8b7c6d5e4",
  "operationId": "op_01J8ABCXYZ12345",
  "event": "adapter.request.timeout",
  "endpoint": "/api/v1/orders/sync",
  "timeoutMs": 10000,
  "durationMs": 10003,
  "message": "HTTP request timed out after 10000ms"
}
```

### 4. 崩溃恢复周期巡检 (`recovery.sweep.completed`)
```json
{
  "level": "info",
  "timestamp": "2026-09-19T11:15:55.100Z",
  "service": "automation-recovery-processor",
  "event": "recovery.sweep.completed",
  "claimedCount": 3,
  "completedCount": 2,
  "failedCount": 1,
  "message": "Automation recovery sweep completed"
}
```

---

## 八、边界与演进约束（Non-Goals）

1. **不引入指标与采集端点**：Phase 3 严格聚焦于**日志与上下文关联**，严禁新建 Prometheus、`/metrics` 或导出 OpenTelemetry Collector 端点。
2. **零数据库表更动**：所有日志格式化纯粹发生在内存与标准流，不增加任何 Prisma 迁移或数据库日志表。
3. **状态机与重试语义零破坏**：日志组件纯只读观测，严格遵守 Phase 1 错误分类与 Phase 2 超时取消状态转换，`TIMEOUT` 操作维持 `UNKNOWN` / `QUERY`，不破坏任何已验证的恢复语义。
