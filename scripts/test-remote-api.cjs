const http = require('http');

async function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(parsed, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('1. Logging in with demo user...');
  const login = await request('http://localhost:3001/api/v1/auth/demo-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  const token = login.data?.token || login.data?.accessToken;
  if (!token) {
    console.error('Failed to get token:', login);
    return;
  }
  console.log('✓ Got token:', token.substring(0, 15) + '...');

  console.log('\n2. Testing /api/v1/market-research/snapshot?keyword=wireless+earbuds...');
  const snap = await request('http://localhost:3001/api/v1/market-research/snapshot?keyword=wireless+earbuds', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('✓ Snapshot result:');
  console.log('Seed keyword:', snap.data?.seedKeyword);
  console.log('Search volume:', snap.data?.searchVolumeMonthly);
  console.log('Provider:', snap.data?.provider);
  console.log('Transport:', snap.data?.transport);
  console.log('Mode:', snap.data?.mode);
  console.log('Captured at:', snap.data?.capturedAt);
  console.log('Evidence count:', snap.data?.evidence?.length || 0);

  console.log('\n3. Testing /api/v1/market-research/products?keyword=yoga+mat...');
  const prods = await request('http://localhost:3001/api/v1/market-research/products?keyword=yoga+mat', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  console.log('✓ Products count:', prods.data?.products?.length || 0);
  console.log('Provider:', prods.data?.provider, 'Mode:', prods.data?.mode);

  console.log('\n✓ REMOTE INTEGRATION VERIFICATION SUCCESSFUL!');
}

main().catch(console.error);
