# Automation Runtime — Execution Evidence, Artifact Integrity & Redaction (Phase 7)

## 1. 目标与架构定位

CrossPilot Automation Runtime 在经历了 Error Classification (Phase 1)、Timeout/Cancellation (Phase 2)、Structured Logging (Phase 3)、Metrics (Phase 4)、ExecutionAttempt (Phase 5) 与 Human Audit Trail (Phase 6) 之后，建立起了对自动化操作全生命周期的可观测性与控制力。

Phase 7 的核心目标：
> **统一 Automation Runtime Execution Evidence 的结构、持久化安全、Artifact 引用、Verify 证据和完整性校验。**

### 业务研究领域 vs 自动化执行领域的严格边界

CrossPilot 内部存在两类完全不同的证据概念，禁止混淆：
1. **业务研究证据 (Research Evidence)**：
   - 载体：`EvidenceMeta`, `CommerceFact`, `EvidenceItem`, `ProductDiscoveryEvidence` 等。
   - 作用：支持 AI 商业决策、竞品分析、市场洞察、选品推演等，包含证据置信度、来源时效性等维度。
2. **执行真实性证据 (Execution Evidence)**：
   - 载体：`ExecutionEvidence`, `ExecutionEvidenceArtifact`, `ExecutionVerificationEvidence`, `ExecutionSideEffectEvidence`。
   - 作用：记录自动化写操作的技术执行凭证（如 Seller Central RPA 回查截图、Playwright trace、ERP 查询返回的远端单据状态及关键内容哈希）。

---

## 2. V2 Execution Evidence 核心契约

完整定义位于 `packages/shared/src/contracts/automation-contracts.ts` 与 `packages/shared/src/contracts/evidence-sanitizer.ts`。

```ts
export interface ExecutionEvidence {
  schemaVersion?: 2;
  mode: AutomationMode;                 // 'MOCK' | 'SIMULATOR' | 'LIVE'
  provider: string;                     // e.g. 'playwright-rpa', 'erp-purchase-order'
  operationId: string;
  phase: AutomationPhase;               // 'READY' | 'SUBMITTED' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'NEEDS_ATTENTION'
  effect: AutomationEffect;             // 'APPLIED' | 'NOT_APPLIED' | 'PARTIALLY_APPLIED' | 'UNKNOWN'
  recovery: RecoveryAction;             // 'NONE' | 'RETRY' | 'QUERY' | 'REAUTHORIZE' | 'MANUAL'

  traceId?: string;
  errorCode?: string;
  errorClass?: ExecutionErrorClass;
  normalizedError?: PersistedExecutionError;

  externalId?: string;
  requestId?: string;
  verifiedAt?: string;
  evidenceRef?: string;

  conflictDetails?: Record<string, unknown>;
  syncError?: string;
  manualResolution?: Record<string, unknown>;

  // Phase 7 新增类型化证据段
  verification?: ExecutionVerificationEvidence;
  sideEffect?: ExecutionSideEffectEvidence;
  artifacts?: ExecutionEvidenceArtifact[];
}
```

### 2.1 PersistedExecutionError (P0 剥离规则)

为防止将敏感内部堆栈、网络底层句柄或未脱敏的上游原始请求泄露到数据库持久层，`PersistedExecutionError` 实行强制清洗：
```ts
export interface PersistedExecutionError {
  class: string;
  code: string;
  message: string;                      // 已脱敏，最大截断至 1000 字符
  retryable: boolean;
  provider?: string;
  originalStatus?: number;
}
```
**不可妥协的铁律**：
- `cause` 字段**绝对禁止**保存至数据库（既不能保存原始对象，也不能保存 `cause: "[REDACTED]"`，键必须彻底不存在）。
- `stack` 与原始请求/响应对象（如 `rawRequest`, `socket` 等）在入库时被彻底剥离。

### 2.2 ExecutionEvidenceArtifact (产物引用与完整性)

```ts
export type ExecutionArtifactKind =
  | 'SCREENSHOT_BEFORE'
  | 'SCREENSHOT_AFTER'
  | 'SCREENSHOT_FAILURE'
  | 'DOM_SNAPSHOT'
  | 'NETWORK_HAR'
  | 'PLAYWRIGHT_TRACE'
  | 'LOG_CHUNK'
  | 'PAYLOAD_DUMP'
  | 'OTHER';

export interface ExecutionEvidenceArtifact {
  ref: string;                          // 逻辑安全引用，如 "rpa/job_123/screenshot-after.png"
  kind: ExecutionArtifactKind;
  mimeType: string;
  sizeBytes?: number;                   // 字节大小
  sha256?: string;                      // 64 位十六进制 SHA-256 哈希
  capturedAt: string;                   // ISO 8601 时间戳
  metadata?: Record<string, unknown>;   // 脱敏后的扩展元数据
}
```

### 2.3 ExecutionVerificationEvidence (回查证据)

```ts
export type VerificationStatus = 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE' | 'PENDING';
export type VerificationMethod = 'REMOTE_QUERY' | 'DOM_ASSERTION' | 'WEBHOOK' | 'RECONCILIATION';

export interface ExecutionVerificationEvidence {
  status: VerificationStatus;
  method: VerificationMethod;
  targetId?: string;
  matched?: boolean;
  queryLatencyMs?: number;
  remoteState?: Record<string, unknown>;
  assertionResults?: Array<{ assertion: string; passed: boolean; message?: string }>;
  details?: Record<string, unknown>;
}
```

### 2.4 ExecutionSideEffectEvidence (副作用凭证)

```ts
export interface ExecutionSideEffectEvidence {
  confirmed: boolean;
  occurredAt?: string;
  resourceType?: string;                // e.g. 'LISTING', 'PURCHASE_ORDER'
  resourceId?: string;
  details?: Record<string, unknown>;
}
```

---

## 3. 安全防护与完整性机制

### 3.1 逻辑引用路径与防路径遍历 (Path Traversal Defense)

1. **禁止存储宿主绝对路径**：
   - 数据库中的 `artifacts[].ref` 严禁记录 `/Users/alice/...`、`/app/evidence/...` 等本地/容器绝对路径。
   - 必须通过 `toSafeEvidenceRef(path, baseDir)` 转化为相对于 Runtime Evidence Root 的安全逻辑路径（如 `rpa/job_123/screenshot.png`）。
2. **Fail-Closed 路径校验**：
   - 包含 `..` 的路径段（如 `../../etc/passwd` 或 `rpa/job/../../secret`）立即抛出 `PATH_TRAVERSAL` 异常。
   - 包含 Windows 盘符（`C:\...`）或超出安全根目录的绝对路径抛出 `HOST_PATH_ESCAPE` 异常。
   - 绝对路径中如包含 `.runtime-evidence/` 或 `runtime-evidence/`，自动提取内部相对路径；若无匹配且以 `/` 开头，坚决拦截。
3. **安全路径反解**：
   - `resolveEvidenceArtifactPath(ref, baseEvidenceDir)` 验证 `ref` 并确保其在目标根目录下，防止越权访问。

### 3.2 最小权限保证 (POSIX File & Directory Permissions)

- **证据目录创建**：`ensureSafeEvidenceDirectory(dirPath)` 默认使用 `0o700`（仅允许当前用户读写执行）。
- **产物文件落盘**：`setSafeFilePermissions(filePath)` 默认使用 `0o600`（仅允许当前用户读写）。
- 跨平台兼容：在不支持 POSIX 权限模式的文件系统（如部分 Windows 环境）上，捕获异常并静默降级，确保不破坏主执行流程。

### 3.3 失败降级策略 (Fail-Safe Artifact Hashing)

- 当计算产物的 `sizeBytes` 或 `sha256` 失败时（如文件被占锁、写入未完成或磁盘 I/O 错误）：
  1. 记录结构化警告日志 `RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED`。
  2. 生成并返回降级的 `ExecutionEvidenceArtifact`（保留 `ref`, `kind`, `mimeType`, `capturedAt`，但将 `sizeBytes` 与 `sha256` 置为 undefined）。
  3. **铁律：绝不因为哈希计算失败而抛出异常，绝不改变或阻断已发生的真实业务执行状态（Runtime Truth）。**

### 3.4 敏感信息脱敏 (Redaction)

- 数据库持久化前由 `sanitizeExecutionEvidenceForPersistence` 执行深度脱敏：
  - Bearer Token: `Bearer [REDACTED]`
  - Shopify Access Token: `[REDACTED]`
  - 数据库连接串中的密码: `postgres://user:[REDACTED]@host:5432/db`
  - 嵌套对象中的敏感键名 (`password`, `secret`, `token`, `authorization`, `cookie`, `apiKey` 等): 值替换为 `[REDACTED]`。
- **Payload 尺寸熔断保护**：限制单个 Evidence 对象的最大体积不超过 64KB，超限时自动丢弃非关键调试堆叠与冗长快照，防止 PostgreSQL JSON 字段爆炸。

---

## 4. 持久化统一收口 (Single Point of Persistence)

所有向数据库写入 `evidence` 的途径必须统一经过 `sanitizeExecutionEvidenceForPersistence`：
1. `AutomationOperationStore.createOrReplay()`：创建操作或重放时，对 `initialEvidence` 进行规范化清洗。
2. `AutomationOperationStore.recordEvidence()`：更新执行证据时，先通过持久化清洗器，再执行 OCC 乐观锁更新。
3. `ExecutionAttemptStore.finishAttempt()`：记录 Attempt 终态时，对传入的 `evidence` 调用持久化清洗器。

---

## 5. 验收与质量门禁

| 验收项 | 规范要求 | 状态 |
| :--- | :--- | :--- |
| **0 数据库迁移** | 零 Schema 变更，无需迁移文件，纯 JSON 合约升级 | 达成 |
| **P0 错误剥离** | `cause`, `stack`, `rawRequest` 彻底不进入数据库 | 达成 |
| **脱敏覆盖** | Bearer, Shopify Token, DB 连接串, 敏感键名全量清洗 | 达成 |
| **路径遍历防御** | `..` 与宿主逃逸拦截，强制使用逻辑安全引用 | 达成 |
| **哈希降级安全** | 产物计算失败时记录告警并安全降级，不阻断业务执行 | 达成 |
| **权限控制** | 目录 0700、文件 0600 POSIX 最小权限防护 | 达成 |
| **RPA 产物联动** | Playwright 工作流生成强类型 artifacts 并回传 ActionRouter | 达成 |
| **Recovery 回查联动** | Recovery Processor 的 QUERY 链路生成回查与副作用证据 | 达成 |
| **测试套件** | `packages/actions/test/execution-evidence.spec.ts` 16 项全过 | 达成 |
