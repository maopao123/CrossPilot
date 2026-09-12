const fs = require('fs');
const path = require('path');
const https = require('https');

try {
  if (process.loadEnvFile) process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (e) {}

const token = process.env.XYDC_MCP_TOKEN;
const postData = JSON.stringify({
  jsonrpc: '2.0',
  id: 'inspect_all',
  method: 'tools/list',
  params: {}
});

const req = https.request('https://mcp.xydc.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  res.setEncoding('utf8');
  let d = '';
  res.on('data', chunk => d += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(d);
      const tools = json.result?.tools || [];
      console.log(`TOTAL REAL XYDC TOOLS DISCOVERED: ${tools.length}`);
      
      const summary = tools.map((t, idx) => ({
        index: idx + 1,
        name: t.name,
        description: t.description?.split('\n')[0],
        requiredParams: t.inputSchema?.required || [],
        properties: Object.keys(t.inputSchema?.properties || {})
      }));

      console.log(JSON.stringify(summary, null, 2));

      // Save full schema for reference
      fs.writeFileSync(
        path.join(__dirname, '..', 'docs', '30_modules', 'provider', 'XYDC_TOOLS_SCHEMA.json'),
        JSON.stringify(tools, null, 2),
        'utf8'
      );
      console.log('\n[SUCCESS] Full schema saved to docs/30_modules/provider/XYDC_TOOLS_SCHEMA.json');
    } catch (err) {
      console.error('Error parsing response:', err.message);
    }
  });
});

req.on('error', (err) => console.error('Request error:', err.message));
req.write(postData);
req.end();
