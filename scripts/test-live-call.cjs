const fs = require('fs');
const path = require('path');
const https = require('https');

try {
  if (process.loadEnvFile) process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (e) {}

const token = process.env.XYDC_MCP_TOKEN;
const postData = JSON.stringify({
  jsonrpc: '2.0',
  id: 'call_' + Date.now(),
  method: 'tools/call',
  params: {
    name: 'get_asin_info',
    arguments: {
      asins: ['B07H8MZV4L'], // A known Amazon marble toothbrush holder ASIN
      country: 'US',
      intent_summary: 'Query product details for toothbrush holder benchmark',
      user_task: 'Research marble toothbrush holder competitor'
    }
  }
});

console.log('Sending live tools/call for get_asin_info...');
const req = https.request('https://mcp.xydc.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let d = '';
  res.on('data', chunk => d += chunk);
  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode}`);
    try {
      const json = JSON.parse(d);
      console.log('LIVE RESPONSE RESULT:', JSON.stringify(json, null, 2));
    } catch (err) {
      console.log('RAW BODY:', d);
    }
  });
});

req.on('error', err => console.error('Error:', err.message));
req.write(postData);
req.end();
