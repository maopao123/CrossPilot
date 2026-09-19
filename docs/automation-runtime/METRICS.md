# Runtime Metrics & Prometheus Exposure (Phase 4)

## 一、概述

Phase 4 为 CrossPilot Automation Runtime 建立了统一的、Prometheus 兼容的运行时指标收集与暴露机制（统一前缀 `crosspilot_`）。

本阶段在 **Phase 1（统一错误分类 NormalizedExecutionError）**、**Phase 2（超时、取消与 AbortSignal 传播）** 和 **Phase 3（结构化日志与链路关联 Trace Correlation）** 的稳固基线之上，提供系统级的聚合观测能力，回答以下核心运行态问题：

- 自动化操作的整体成功率、失败率与审批拦截率；
- 各底层 Adapter（Shopify / ERP / Playwright RPA）的调用量、延迟分布与故障错误分类；
- 超时与重试的发生频次与趋势；
- 需人工介入（`NEEDS_ATTENTION`）的根因聚合分布；
- 故障自愈（`automation-recovery`）恢复成功率与每次 Sweep 耗时；
- BullMQ 异步队列的等待排队延迟（Queue Wait Time）。

---

## 二、架构设计与进程拓扑

```
+-------------------------------------------------------------------------+
| CrossPilot Process Topology & Metrics Exposure Architecture             |
+-------------------------------------------------------------------------+

              Prometheus Server / Datadog Agent / OpenTelemetry Collector
                                      |
                 +--------------------+--------------------+
                 | scrape (HTTP GET)                       | scrape (HTTP GET)
                 v                                         v
     [ apps/api Process ]                        [ apps/worker Process ]
  (NestJS HTTP Server on :3001)               (Background Node.js Service)
                 |                                         |
  +------------------------------+            +------------------------------+
  | GET /api/v1/internal/metrics |            | GET :9100/metrics            |
  | (redirect /internal/metrics) |            | (node:http Server)           |
  +------------------------------+            +------------------------------+
                 |                                         |
         [ runtimeMetrics ]                        [ runtimeMetrics ]
    (prom-client Registry A)                  (prom-client Registry B)
                 |                                         |
  - Action Router Dispatch                   - Queue Wait (BullMQ jobs)
  - HTTP ERP Adapter                         - Recovery Sweep Run & Due Ops
  - Shopify GraphQL Transport                - Self-healing Retry / Recovered
  - Playwright RPA Adapter                   - Verify Latency & Mismatch
```

### 1. 为什么采用独立 Registry（Isolated Registry）
- **进程隔离**：`apps/api` 与 `apps/worker` 为独立 Node.js 进程，内存不共享；
- **防全局污染**：不使用 `prom-client` 默认全局注册表，避免第三方库隐式注册无意义指标；
- **测试友好**：测试套件可使用 `createRuntimeMetrics(new Registry())` 创建独立的测试指标实例，测试用例之间无状态污染。

### 2. 双进程 Scrape 拓扑
- **API 进程**：
  - 路由：`GET /api/v1/internal/metrics`
  - 兼容重定向：`GET /internal/metrics` 与 `GET /metrics` 307 重定向至 `/api/v1/internal/metrics`；
  - 控制器：`InternalMetricsController`（`@Public()` 绕过 JWT 鉴权，由专用指标安全机制保护）。
- **Worker 进程**：
  - 服务：`apps/worker/src/worker.service.ts` 内置的 `node:http` 轻量 HTTP 服务；
  - 端口：默认 `9100`（通过 `WORKER_METRICS_PORT` 配置），监听在 `WORKER_METRICS_HOST`；
  - 路由：`GET /metrics` 与 `GET /internal/metrics`；
  - 生命周期：绑定于 `WorkerService.start()` 与 `WorkerService.stop()`，服务关闭时干净释放端口，防止热重启端口占用泄露。

### 3. Web 浏览器包隔离（Client Bundle Tree-shaking）
`prom-client` 包含 Node.js 专有模块（`fs`, `v8`, `cluster` 等）。在 `apps/web/next.config.mjs` 中通过 Webpack `resolve.alias['prom-client'] = false` 与 `resolve.fallback` 将其在客户端浏览器打包中安全置空，确保 Next.js SSR / Client 生产构建零报错。

---

## 三、指标全景参考表（Metrics Reference）

系统共实现 **14 个** 核心运行时运维指标，所有指标前缀均为 `crosspilot_`：

| 指标名称 | 类型 | 标签 (Labels) | 基数范围 | 说明与语义 |
| :--- | :--- | :--- | :--- | :--- |
| `crosspilot_action_dispatch_total` | Counter | `provider, mode, status` | 极低 (~7×5×4=140) | 动作路由层（ActionRouter）派发总次数，用于统计动作执行吞吐与成功/失败/拦截比例 |
| `crosspilot_action_dispatch_duration_seconds` | Histogram | `provider, mode, status` | 极低 (11 buckets) | 动作派发端到端耗时（秒），观测 P50/P90/P99 延迟 |
| `crosspilot_adapter_requests_total` | Counter | `provider, status, error_class` | 极低 (~7×4×14=392) | 外部适配器（Shopify / ERP / RPA）实际 HTTP/GraphQL/自动化请求总数与错误分类分布 |
| `crosspilot_adapter_request_duration_seconds` | Histogram | `provider, status` | 极低 (11 buckets) | 各外部 Adapter 底层实际请求延迟（秒） |
| `crosspilot_automation_retry_total` | Counter | `provider, error_class` | 极低 (~7×14=98) | 自动化操作因特定错误发起的重试总次数 |
| `crosspilot_automation_timeout_total` | Counter | `provider` | 极低 (~7) | 操作执行或 Adapter 请求发生超时的总次数 |
| `crosspilot_automation_needs_attention_total` | Counter | `provider, reason` | 极低 (~7×6=42) | 进入 `NEEDS_ATTENTION` 人工干预状态的操作总数及收敛根因 |
| `crosspilot_automation_recovered_total` | Counter | `provider, strategy` | 极低 (~7×3=21) | 故障恢复 Worker 成功自愈收敛至 `COMPLETED/APPLIED` 的操作总数 |
| `crosspilot_recovery_sweep_total` | Counter | `result` | 极低 (3: completed, aborted, failed) | 故障恢复周期扫描（Sweep）执行总次数 |
| `crosspilot_recovery_sweep_duration_seconds` | Histogram | 无 | 极低 (8 buckets) | 单次恢复扫描执行耗时（秒） |
| `crosspilot_recovery_due_operations` | Gauge | 无 | 1 (当前值) | 最近一次扫描发现的待恢复过期/超时操作数量（瞬时水位） |
| `crosspilot_queue_wait_seconds` | Histogram | `queue` | 极低 (6 queues, 10 buckets) | BullMQ 任务从入队（`job.timestamp`）到 Worker 开始处理的排队等待时长 |
| `crosspilot_verify_total` | Counter | `provider, result` | 极低 (~7×4=28) | 远端状态反查校验（Verify）总次数 |
| `crosspilot_verify_duration_seconds` | Histogram | `provider, result` | 极低 (7 buckets) | 远端状态反查校验执行耗时（秒） |

---

## 四、严格的低基数标签规范（Strict Low Cardinality Guard）

Prometheus 时序数据库在标签基数过大时会发生内存膨胀甚至 OOM。因此 CrossPilot 在 `@crosspilot/shared` 中内置了强类型标签规范与白名单校验清洗函数：

### 1. 绝对红线：禁止在标签中出现的内容
- ❌ 严禁 `traceId` / `operationId` / `actionId` / `jobId`
- ❌ 严禁 `workspaceId` / `userId`
- ❌ 严禁 `SKU` / `orderId` / `externalId`
- ❌ 严禁 原始 Error Message 或 Stack Trace
- ❌ 严禁 任意动态 URL / 查询参数

### 2. 白名单取值规范
- **`provider`**: `shopify` \| `erp` \| `playwright-rpa` \| `simulator` \| `human-gate` \| `other` \| `unknown`
- **`mode`**: `live` \| `simulated` \| `dry_run` \| `mock` \| `unknown`
- **`status` (dispatch)**: `succeeded` \| `failed` \| `waiting_approval` \| `blocked`
- **`status` (adapter)**: `success` \| `failed` \| `timeout` \| `cancelled`
- **`error_class`**: 标准 `ExecutionErrorClass`（`TRANSIENT`、`RATE_LIMIT`、`TIMEOUT`、`AUTH`、`PERMISSION`、`VALIDATION`、`CONFLICT`、`NOT_FOUND`、`PROVIDER_ERROR`、`RPA_SELECTOR`、`RPA_NAVIGATION`、`VERIFY_MISMATCH`、`UNKNOWN`）及 `none`
- **`reason`**: `retry_exhausted` \| `auth_required` \| `verify_mismatch` \| `remote_conflict` \| `manual_required` \| `unknown`
- **`strategy`**: `query` \| `retry` \| `verify`
- **`result` (verify)**: `verified` \| `mismatch` \| `timeout` \| `failed`
- **`queue`**: `automation-recovery` \| `tasks` \| `closed-loop` \| `simulator` \| `outcome` \| `other`

---

## 五、单点记账与不变量原则（Single-Accounting Invariant）

为了避免早期退出（Early Exit）、异常抛出或多分支导致指标漏计或重计，所有埋点遵循以下原则：

1. **单点记账**：在入口与出口（例如 `ActionRouter.dispatch` 或 Adapter 的 try-finally / wrapper）计算总耗时并统一调用 `recordActionDispatch` 或 `recordAdapterRequest`，确保每次操作无论成功、超时还是失败，计数与直方图观测恰好发生一次；
2. **容错安全（Fail-Safe）**：`RuntimeMetrics` 所有公开记账方法（`record*`、`observe*`、`set*`）内部均包含全面的异常捕获，即使传入异常类型或 Prometheus 底层报错，也绝不中断核心业务流程或抛出异常。

---

## 六、安全与配置（Security & Configuration）

生产环境下，指标端点默认关闭，需显式开启并可配置 Token 保护：

| 环境变量 | 默认值 | 作用域 | 说明 |
| :--- | :--- | :--- | :--- |
| `METRICS_ENABLED` | `false` | API 进程 | 是否开启 API 指标暴露接口。未开启时请求返回 `404 Not Found` |
| `METRICS_BEARER_TOKEN` | 无 (可选) | API / Worker | 若配置，请求必须携带 `Authorization: Bearer <TOKEN>`，否则返回 `401 Unauthorized` |
| `WORKER_METRICS_ENABLED` | `false` | Worker 进程 | 是否启动 Worker 独立指标 HTTP 服务 |
| `WORKER_METRICS_PORT` | `9100` | Worker 进程 | Worker 指标服务监听端口 |
| `WORKER_METRICS_HOST` | `0.0.0.0` | Worker 进程 | Worker 指标服务监听地址 |
| `WORKER_METRICS_TOKEN` | 同 `METRICS_BEARER_TOKEN` | Worker 进程 | Worker 专用 Bearer Token（优先于通用 Token） |

---

## 七、Prometheus 抓取配置示例（prometheus.yml）

```yaml
scrape_configs:
  - job_name: 'crosspilot-api'
    metrics_path: '/api/v1/internal/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
    bearer_token: '${METRICS_BEARER_TOKEN}'
    static_configs:
      - targets: ['api.crosspilot.internal:3001']

  - job_name: 'crosspilot-worker'
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
    bearer_token: '${WORKER_METRICS_TOKEN}'
    static_configs:
      - targets: ['worker.crosspilot.internal:9100']
```

---

## 八、指标边界声明（What Metrics Are NOT）

1. **非业务 BI 统计**：本指标体系不记录 GMV、采购订单总金额、店铺销量等业务分析数据（此类由专门的 Data Pipeline / OLAP 负责）；
2. **非分布式追踪替代品**：指标用于聚合统计（Rate, Errors, Duration），单个具体任务的上下文请参考 Phase 3 结构化日志中的 `traceId` 与 `operationId`；
3. **内存型 Registry 声明**：指标保存在单进程内存中，Pod / 进程重启后计数器重置为 0（符合 Prometheus Counter 设计哲学，Prometheus `rate()` 与 `increase()` 算子原生支持 counter reset）。
