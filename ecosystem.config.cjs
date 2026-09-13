const path = require('path');
const fs = require('fs');

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const apiEnv = loadEnv(path.join(__dirname, 'apps/api/.env'));

module.exports = {
  apps: [
    {
      name: 'crosspilot-api',
      cwd: '/root/zls/project/CrossPilot/apps/api',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ...apiEnv,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
    },
    {
      name: 'crosspilot-worker',
      cwd: '/root/zls/project/CrossPilot/apps/worker',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:Pgsql456%40@127.0.0.1:5432/crosspilot?schema=public',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        MILVUS_HOST: '127.0.0.1',
        MILVUS_PORT: 19530,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'crosspilot-web',
      cwd: '/root/zls/project/CrossPilot/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 2222',
      env: {
        NODE_ENV: 'production',
        PORT: 2222,
        API_INTERNAL_URL: 'http://127.0.0.1:3001',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
