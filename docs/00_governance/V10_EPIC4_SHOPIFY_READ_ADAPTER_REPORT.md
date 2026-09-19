# V10 Epic 4 · Shopify Read Adapter 交付验收报告

**实施日期：** 2026-09-19  
**实施目标：** 接入真实 Shopify Admin GraphQL API（2026-07），通过 OAuth Client Credentials Grant 实现认证换取 Access Token 与内存缓存刷新，映射到 Canonical Product/Order/Inventory 模型，同时保持写端口 `WRITE_FORBIDDEN`，零回归。

---

## 1. 核心改动文件

| 文件 | 类型 | 职责说明 |
| :--- | :--- | :--- |
| `packages/db/src/commerce/shopify-adapter.ts` | 新增 | 实现 `CommerceAdapter` 接口，支持 GraphQL `2026-07`，Token 内存缓存与 24h 自动刷新，Canonical 映射与 ChannelIdentity 投影 |
| `packages/db/src/commerce/resolve-adapter.ts` | 修改 | 注册 `shopify` 平台解析，`resolveCommerceAdapter(prisma, 'shopify')` 产出 `ShopifyAdapter` |
| `packages/db/src/index.ts` | 修改 | 增量导出 `ShopifyAdapter` 相关类型与实现 |
| `apps/api/test/v10-epic4-shopify-adapter.spec.ts` | 新增 | 14 项完整单元与契约测试（解析、映射、投影、单品读取、订单、库存、AUTH_REQUIRED、401、429、GraphQL 错误、写入阻断、Token 缓存） |
| `apps/api/test/v10-epic2-ports.spec.ts` | 修改 | 更新平台解析断言（`shopify` 平台现已合法解析为 `ShopifyAdapter`，非 `unknown` 抛 `PROVIDER_UNAVAILABLE`） |
| `apps/api/test/v10-epic3-amazon-adapter.spec.ts` | 修改 | 更新平台解析断言 |
| `scripts/verify-shopify-live.cjs` | 新增 | Gate A 真实 Dev Store（`crosspilot-dev`）端到端读链路校验脚本（无硬编码密钥） |

---

## 2. 设计与真理化保证

1. **统一 Commerce Adapter 抽象**：
   - 严格继承 `@crosspilot/domain` 的 `CommerceAdapter`（`CatalogPort`, `OrderPort`, `InventoryPort`, `AdsPort`, `ProfitPort`）；
   - 上层业务代码零 `import` Shopify SDK 或 Shopify 特有类型。
2. **凭证体系与安全隔离**：
   - 复用现有 `CommerceAccount` 与 `ProviderCredential(accountId, kind='SHOPIFY_CLIENT_CREDENTIALS')`；
   - 使用既有 AES-256-GCM 进行密钥加密（`decryptProviderCredential` / `encryptProviderCredential`）；
   - 严禁硬编码 Client ID / Client Secret，日志与文档中坚决脱敏，不输出 Secret。
3. **Token 内存缓存与自动刷新**：
   - 内部维护按 `${shop}:${clientId}` 索引的内存缓存；
   - 识别 24 小时过期并在过期前 5 分钟自动刷新；
   - 暴露 `exchangeToken` seam 便于无副作用单元测试注入。
4. **Canonical 规范映射**：
   - Product GID（`gid://shopify/Product/...`）与 Variant GID（`gid://shopify/ProductVariant/...`）映射到 `CanonicalProduct.identities[]`；
   - 自动投影到数据库 `channel_identities` 表；
   - 坚决杜绝在 `Store` 或 `CanonicalProduct` 上添加 `shopifyId` / `shopifyVariantId` 专有字段。
5. **Fail-Closed 错误显式化**：
   - 无凭证 / 凭证损坏：`AUTH_REQUIRED`；
   - 401 / 403：`AUTH_REQUIRED`；
   - 429 速率限制：`PROVIDER_RATE_LIMIT`，`retryable: true`；
   - GraphQL 结构化错误：`COMMERCE_PORT_ERROR`；
   - 越权 / 跨工作区：`RESOURCE_NOT_FOUND`；
   - 非 Shopify 平台：`PROVIDER_UNAVAILABLE`；
   - 严禁静默吞掉异常或生产自动降级 Mock。
6. **写操作严格阻断**：
   - `updateProduct` 与 `decreaseBid` 统一返回 `{ ok: false, code: 'WRITE_FORBIDDEN', ... }`。

---

## 3. Gate A 验收矩阵

| 验收项 | 要求 | 实测结果 | 判定 |
| :--- | :--- | :--- | :--- |
| **Adapter 注册** | `resolveCommerceAdapter(prisma, 'shopify')` 产出 `ShopifyAdapter` | 产出 `ShopifyAdapter`，平台为 `shopify` | **PASS** |
| **全库类型检查** | `pnpm -r run typecheck` 10 个 workspace 0 错误 | 10/10 workspaces 干净无报错 | **PASS** |
| **Epic 4 单元测试** | `test/v10-epic4-shopify-adapter.spec.ts` 14 项测试 | 14 / 14 全部通过 | **PASS** |
| **平台回归测试** | `v10-epic1-foundation` + `v10-epic2-ports` + `v10-epic3-amazon-adapter` | 37 / 37 全部通过 | **PASS** |
| **真实 Products 验证** | 真实请求 `crosspilot-dev` GraphQL 查询产品 | 成功返回 26 个产品，GID/Variant/SKU 正确投影 | **PASS** |
| **真实 Orders 验证** | 真实请求 `crosspilot-dev` GraphQL 查询订单 | 成功返回 0 个订单，HTTP 200，字段结构对齐 | **PASS** |
| **真实 Inventory 验证** | 真实请求 `crosspilot-dev` GraphQL 查询库存 | 成功返回可用、锁定与在途库存，数据正常 | **PASS** |
| **安全与脱敏要求** | 无 Secret / Access Token 明文存入 git / log / 文档 | 100% 符合脱敏要求 | **PASS** |

---

## 4. 结论与放行

Gate A 验收条件已 **100% 满足**，正式放行进入 **Phase B：Playwright Listing RPA 真执行**。
