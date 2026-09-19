# Automation Runtime — Execution Evidence, Artifact Integrity & Redaction (Phase 7 & Phase 7.1)

## 1. 目标与架构定位

CrossPilot Automation Runtime 在经历了 Error Classification (Phase 1)、Timeout/Cancellation (Phase 2)、Structured Logging (Phase 3)、Metrics (Phase 4)、ExecutionAttempt (Phase 5) 与 Human Audit Trail (Phase 6) 之后，建立起了对自动化操作全生命周期的可观测性与控制力。

Phase 7 / 7.1 的核心目标：
> **统一 Automation Runtime Execution Evidence 的结构、持久化安全、Artifact 引用安全、Verify 证据和完整性校验。**

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

  // Phase 7 / 7.1 类型化证据段
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

export type ExecutionArtifactSensitivity = 'INTERNAL' | 'SENSITIVE';

export interface ExecutionEvidenceArtifact {
  ref: string;                          // 逻辑安全引用，如 "rpa/job_123/screenshot-after.png"
  kind: ExecutionArtifactKind;
  mimeType: string;
  sizeBytes?: number;                   // 字节大小
  sha256?: string;                      // 64 位十六进制 SHA-256 哈希
  capturedAt: string;                   // ISO 8601 时间戳
  sensitivity?: ExecutionArtifactSensitivity; // 'INTERNAL' | 'SENSITIVE'
  metadata?: Record<string, unknown>;   // 脱敏后的扩展元数据
}
```

- **敏感度默认分类**：
  - `SCREENSHOT_BEFORE`, `SCREENSHOT_AFTER`, `SCREENSHOT_FAILURE`, `DOM_SNAPSHOT`, `PAYLOAD_DUMP` 默认为 `SENSITIVE`。
  - `NETWORK_HAR`, `PLAYWRIGHT_TRACE`, `LOG_CHUNK`, `OTHER` 默认为 `INTERNAL`。

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
export type RemoteSideEffectState = 'CONFIRMED_APPLIED' | 'CONFIRMED_NOT_APPLIED' | 'UNKNOWN';

export interface ExecutionSideEffectEvidence {
  confirmed: boolean;
  writeExecuted?: boolean;
  remoteState?: RemoteSideEffectState;  // 显式远端副作用终态
  occurredAt?: string;
  resourceType?: string;                // e.g. 'LISTING', 'PURCHASE_ORDER'
  resourceId?: string;
  details?: Record<string, unknown>;
}
```

---

## 3. 安全防护与完整性机制 (Phase 7.1 Hardening)

### 3.1 Fail-Closed Artifact 路径校验与防宿主逃逸

1. **零文件系统接触 Fail-Closed 防御**：
   - `buildEvidenceArtifact(hostFilePath, baseDir, kind, mimeType)` 在调用任何 `fs.statSync` 或 `fs.readFileSync` 之前，必须对宿主路径进行严格的根目录包含性检查 (`path.resolve(hostFilePath).startsWith(path.resolve(baseDir) + path.sep)`)。
   - 若检测到根目录逃逸（例如 `/etc/passwd`、`../../.env`）或非法路径遍历，立即返回 `null`，**严禁对非法路径进行任何文件系统元数据读取或内容读取**。
   - 记录警告日志时，**绝不记录宿主绝对路径**，仅输出 `{ kind, reason, ref }`，避免宿主路径信息泄露。

2. **安全逻辑引用 (Logical Ref Architecture)**：
   - 数据库中的 `artifacts[].ref` 严禁记录 `/Users/alice/...`、`/app/evidence/...` 等本地/容器绝对路径。
   - 必须通过 `toSafeEvidenceRef(path, baseDir)` 转化为相对于 Runtime Evidence Root 的安全逻辑路径（如 `rpa/job_123/screenshot.png`）。
   - 包含 `..` 的路径段（如 `../../etc/passwd` 或 `rpa/job/../../secret`）立即抛出 `PATH_TRAVERSAL` 异常。
   - 包含 Windows 盘符（`C:\...`）或超出安全根目录的绝对路径抛出 `HOST_PATH_ESCAPE` 异常。

3. **Legacy `evidenceRef` 安全收敛**：
   - 历史旧字段 `evidenceRef` 经清洗时，若不满足 `isSafeEvidenceRef(ref)`，则**直接丢弃 (omitted)**，严禁回退存储清洗后的宿主路径。

### 3.2 最小权限保证 (POSIX File & Directory Permissions)

- **证据目录创建**：`ensureSafeEvidenceDirectory(dirPath)` 默认使用 `0o700`（仅允许当前用户读写执行）。
- **产物文件落盘**：`setSafeFilePermissions(filePath)` 默认使用 `0o600`（仅允许当前用户读写）。
- 跨平台兼容：在不支持 POSIX 权限模式的文件系统（如部分 Windows 环境）上，捕获异常并静默降级，确保不破坏主执行流程。

### 3.3 失败降级策略 (Fail-Safe Artifact Hashing)

- 当计算产物的 `sizeBytes` 或 `sha256` 失败时（如文件被占锁、写入未完成或磁盘 I/O 错误）：
  1. 记录结构化警告日志 `RuntimeEvents.EXECUTION_EVIDENCE_ARTIFACT_FAILED`。
  2. 生成并返回降级的 `ExecutionEvidenceArtifact`（保留 `ref`, `kind`, `mimeType`, `capturedAt`，但将 `sizeBytes` 与 `sha256` 置为 undefined）。
  3. **铁律：绝不因为哈希计算失败而抛出异常，绝不改变或阻断已发生的真实业务执行状态（Runtime Truth）。**

### 3.4 严格 64KB Hard Limit (UTF-8 字节长度控制)

- 数据库持久化前由 `sanitizeExecutionEvidenceForPersistence` 执行深度脱敏与尺寸控制。
- **Hard Limit 计量**：采用 `Buffer.byteLength(JSON.stringify(evidence), 'utf8') <= 65536` 进行严格衡量，防御多字节 UTF-8 字符（如中文日志）造成的 JSON 字段膨胀。
- **9 级递进修剪 (Progressive Pruning)**：
  1. 截断 `normalizedError.message` 至 200 字符。
  2. 丢弃 `conflictDetails`。
  3. 丢弃 `manualResolution` 非关键元数据。
  4. 截断 `verification.details`。
  5. 丢弃 `verification.assertionResults` 消息细节。
  6. 截断 `sideEffect.details`。
  7. 丢弃所有非错误类截图 Artifact。
  8. 仅保留最新的 1 个失败截图 Artifact。
  9. 清空所有 Artifact 扩展元数据并彻底丢弃非关键描述。
- **Core Runtime Truth 校验**：核心状态字段（`mode`, `phase`, `effect`, `recovery`, `provider`, `operationId`）若非法或缺失，清洗器坚决抛出 `INVALID_EVIDENCE` 异常，防止脏数据注入。

---

## 4. Truth & Side-Effect 语义矩阵 (Execution Truth Matrix)

| 场景 | `effect` | `verification.status` | `verification.matched` | `sideEffect.writeExecuted` | `sideEffect.remoteState` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **已回查确认成功 (Verified Success)** | `APPLIED` | `VERIFIED` | `true` | `true` | `CONFIRMED_APPLIED` |
| **未回查 LIVE 写入成功 (Unverified LIVE)** | `UNKNOWN` | `INCONCLUSIVE` | - | `true` | `UNKNOWN` |
| **写操作后超时 (Post-Write Timeout)** | `UNKNOWN` | `INCONCLUSIVE` | - | `true` | `UNKNOWN` |
| **写操作前取消 (Pre-Write Cancel)** | `NOT_APPLIED` | `PENDING` | - | `false` | `CONFIRMED_NOT_APPLIED` |
| **回查确认不存在 (Recovery Definite NOT_FOUND)**| `NOT_APPLIED` | `VERIFIED` | `false` | `false` | `CONFIRMED_NOT_APPLIED` |
| **回查超时 / 网络异常 / 鉴权失效** | 原 `effect` | `INCONCLUSIVE` | - | 原 `writeExecuted` | `UNKNOWN` |

---

## 5. 持久化统一收口 (Single Point of Persistence)

所有向数据库写入 `evidence` 的途径必须统一经过 `sanitizeExecutionEvidenceForPersistence`：
1. `AutomationOperationStore.createOrReplay()`：创建操作或重放时，对 `initialEvidence` 进行规范化清洗。
2. `AutomationOperationStore.recordEvidence()`：更新执行证据时，先通过持久化清洗器，再执行 OCC 乐观锁更新。
3. `ExecutionAttemptStore.finishAttempt()`：记录 Attempt 终态时，对传入的 `evidence` 调用持久化清洗器。

---

## 6. 验收与质量门禁

| 验收项 | 规范要求 | 状态 |
| :--- | :--- | :--- |
| **0 数据库迁移** | 零 Schema 变更，无需迁移文件，纯 JSON 合约升级 | 达成 |
| **P0 错误剥离** | `cause`, `stack`, `rawRequest` 彻底不进入数据库 | 达成 |
| **Fail-Closed Artifact** | 宿主根逃逸路径立即返回 null，零 fs 接触，无宿主路径告警泄露 | 达成 |
| **Legacy evidenceRef 安全** | 非法引用直接丢弃，不保留原始未受信宿主路径 | 达成 |
| **严格 64KB 限制** | 依据 UTF-8 字节长度精确计量，支持多字节中文字符与 9 级递进修剪 | 达成 |
| **Core Truth 校验** | 核心状态字段非法时强制抛出 `INVALID_EVIDENCE` 异常 | 达成 |
| **Artifact 敏感度与白名单**| 严格白名单校验并赋予 `INTERNAL` 或 `SENSITIVE` 敏感度 | 达成 |
| **Truth & Side-Effect** | 完整覆盖 Verified Success、Unverified LIVE、Timeout、Cancel 与 Recovery 矩阵 | 达成 |
| **测试套件** | `packages/actions/test/execution-evidence.spec.ts` 27 项全过 | 达成 |
