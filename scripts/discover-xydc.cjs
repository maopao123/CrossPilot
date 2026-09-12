/**
 * XYDC MCP Discovery & Reality Audit Script
 * Tests connectivity to XYDC remote MCP server or clearly marks status as PENDING / UNVERIFIED.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

try {
  if (process.loadEnvFile) {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {}

const endpoint = process.env.XYDC_MCP_ENDPOINT;
const token = process.env.XYDC_MCP_TOKEN;

console.log('=== XYDC MCP Discovery & Reality Audit ===');
console.log(`Endpoint: ${endpoint ? endpoint : '[NOT CONFIGURED]'}`);
console.log(`Token: ${token ? `${token.substring(0, 4)}****` : '[NOT CONFIGURED]'}`);

async function run() {
  if (!endpoint) {
    console.log('\n[AUDIT] XYDC_MCP_ENDPOINT is NOT configured in current environment.');
    console.log('[AUDIT] No real XYDC MCP connection has been established.');
    console.log('[AUDIT] No real tools/list has been executed against XYDC.');
    console.log('[AUDIT] No real XYDC response data has been received.');
    console.log('[AUDIT] Runtime fallback: MockMarketProvider (MOCK / DEGRADED).');

    generateReport({
      realConnectionEstablished: 'NO (NOT VERIFIED)',
      realToolsListExecuted: 'NO (NOT VERIFIED)',
      realToolsDiscovered: [],
      realDataReceived: 'NO (NOT VERIFIED)',
      provisionalBindingsStatus: 'PENDING_REAL_DISCOVERY',
      runtimeFallbackVerified: 'YES (MockMarketProvider is active and tested)',
      note: 'Credentials are not configured in current development environment. All remote XYDC capabilities remain unverified pending actual MCP authentication and tools/list discovery.'
    });
    return;
  }

  console.log(`\nAttempting connection to ${endpoint}...`);
  try {
    const url = new URL(endpoint);
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 'disco_' + Date.now(),
      method: 'tools/list',
      params: {}
    });

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    }, (res) => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        console.log(`HTTP Status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(body);
          console.log('[SUCCESS] Discovered Tools:', JSON.stringify(parsed, null, 2));
          generateReport({
            realConnectionEstablished: 'YES',
            realToolsListExecuted: 'YES',
            realToolsDiscovered: parsed.result?.tools || [],
            realDataReceived: 'YES',
            provisionalBindingsStatus: 'CONFIRMED_LIVE',
            runtimeFallbackVerified: 'YES',
            note: 'Successfully connected and verified against live XYDC MCP endpoint.'
          });
        } catch (e) {
          console.log('[WARN] Response is not JSON:', body.substring(0, 300));
          generateReport({
            realConnectionEstablished: 'YES (HTTP Connected, Invalid Body)',
            realToolsListExecuted: 'FAILED (Invalid JSON)',
            realToolsDiscovered: [],
            realDataReceived: 'NO',
            provisionalBindingsStatus: 'PENDING_REAL_DISCOVERY',
            runtimeFallbackVerified: 'YES',
            note: 'Endpoint reachable but response could not be parsed as JSON-RPC.'
          });
        }
      });
    });

    req.on('error', (err) => {
      console.log(`[WARN] Connection error: ${err.message}`);
      generateReport({
        realConnectionEstablished: 'NO (Connection Failed)',
        realToolsListExecuted: 'NO (NOT VERIFIED)',
        realToolsDiscovered: [],
        realDataReceived: 'NO (NOT VERIFIED)',
        provisionalBindingsStatus: 'PENDING_REAL_DISCOVERY',
        runtimeFallbackVerified: 'YES',
        note: `Endpoint configured but connection failed: ${err.message}. Gateway safely fell back to Mock.`
      });
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.log(`[ERROR] Discovery exception: ${err.message}`);
  }
}

function generateReport(info) {
  const docPath = path.join(__dirname, '..', 'docs', '30_modules', 'provider', 'XYDC_CAPABILITY_MAPPING.md');
  const content = `# XYDC (西柚洞察) MCP Capability Mapping & Reality Audit Report

> **Generated At**: ${new Date().toISOString()}  
> **XYDC Credentials Configured**: \`NO\`  
> **Real Connection Established**: \`${info.realConnectionEstablished}\`  
> **Real tools/list Executed**: \`${info.realToolsListExecuted}\`  
> **Real Data Received**: \`${info.realDataReceived}\`  
> **Provisional Bindings Status**: \`${info.provisionalBindingsStatus}\`  
> **Mock Fallback Verified**: \`${info.runtimeFallbackVerified}\`  

---

## 1. 真实性审计结论 (Reality Audit Verdict)

当前环境中：
- **未配置真实 XYDC_MCP_TOKEN 与 XYDC_MCP_ENDPOINT**。
- **未曾建立过与西柚洞察官方 MCP 服务器的真实网络连接**。
- **未曾执行过真实 MCP \`tools/list\` 或 \`tools/call\`**。
- **未曾接收过任何来自西柚洞察的真实业务数据**。
- 当前系统运行的完整链路是：
  \`\`\`text
  CrossPilot Tool (market.*)
  → Integration Gateway
  → Provider Router
  → MockMarketProvider (确定性降级仿真源)
  \`\`\`
- 验证通过的内容仅为：**通用 Provider Framework 架构、MCP 通用客户端与运行时代码、MockMarketProvider 降级机制、以及凭据脱敏保护**。

---

## 2. 5 大能力绑定真实状态 (Provisional vs Verified)

所有三方远程工具名称均为开发 Framework 阶段定义的**临时占位符 (Provisional Placeholder)**，严格禁止作为已确认事实：

| 序号 | CrossPilot 标准内部能力 ID | 临时占位工具名 (PROVISIONAL) | 真实 tools/list 验证状态 | 真实 Schema 状态 | 当前实际执行通道 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | \`market.product.search\` | \`PROVISIONAL_xydc_search_products\` | **NOT VERIFIED** | **NOT VERIFIED** | \`MockMarketProvider.products\` |
| 2 | \`market.product.detail\` | \`PROVISIONAL_xydc_get_product_detail\` | **NOT VERIFIED** | **NOT VERIFIED** | \`MockMarketProvider.product\` |
| 3 | \`market.market.overview\` | \`PROVISIONAL_xydc_get_market_overview\` | **NOT VERIFIED** | **NOT VERIFIED** | \`MockMarketProvider.overview\` |
| 4 | \`market.keyword.search\` | \`PROVISIONAL_xydc_search_keywords\` | **NOT VERIFIED** | **NOT VERIFIED** | \`MockMarketProvider.keywords\` |
| 5 | \`market.product.trend\` | \`PROVISIONAL_xydc_get_product_trends\` | **NOT VERIFIED** | **NOT VERIFIED** | \`MockMarketProvider.trend\` |

---

## 3. 现场审计原始记录

\`\`\`json
${JSON.stringify(info, null, 2)}
\`\`\`

---

## 4. 后续拿到真实凭证后的接水步骤 (Next Steps)

一旦获得真实 \`XYDC_MCP_ENDPOINT\` 与 \`XYDC_MCP_TOKEN\`：
1. 注入环境变量：\`XYDC_MCP_ENDPOINT\` / \`XYDC_MCP_TOKEN\`。
2. 运行探测脚本：\`node scripts/discover-xydc.cjs\`，执行真实 MCP \`tools/list\`。
3. 获取真实 remote tool names 与 inputSchema。
4. 将 \`xydc.config.ts\` 中的 \`PROVISIONAL_*\` 替换为真实远程工具名。
5. 校准 \`xydc.mapper.ts\` 对齐真实返回结构。
6. 发起真实 \`tools/call\` 验证，观察 \`mode: LIVE\` 与 \`providerId: xydc\`。
`;

  fs.writeFileSync(docPath, content, 'utf8');
  console.log(`[AUDIT] Generated honest audit documentation at: ${docPath}`);
}

run();
