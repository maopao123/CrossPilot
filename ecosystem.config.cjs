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

const rootEnv = loadEnv(path.join(__dirname, '.env'));
const apiEnv = loadEnv(path.join(__dirname, 'apps/api/.env'));
const workerEnv = loadEnv(path.join(__dirname, 'apps/worker/.env'));

module.exports = {
  apps: [
    {
      name: 'crosspilot-api',
      cwd: '/root/zls/project/CrossPilot/apps/api',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ...rootEnv,
        ...apiEnv,
        ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
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
        REDIS_HOST: process.env.REDIS_HOST || workerEnv.REDIS_HOST || apiEnv.REDIS_HOST || rootEnv.REDIS_HOST || '127.0.0.1',
        REDIS_PORT: Number(process.env.REDIS_PORT || workerEnv.REDIS_PORT || apiEnv.REDIS_PORT || rootEnv.REDIS_PORT || 6379),
        MILVUS_HOST: process.env.MILVUS_HOST || workerEnv.MILVUS_HOST || apiEnv.MILVUS_HOST || rootEnv.MILVUS_HOST || '127.0.0.1',
        MILVUS_PORT: Number(process.env.MILVUS_PORT || workerEnv.MILVUS_PORT || apiEnv.MILVUS_PORT || rootEnv.MILVUS_PORT || 19530),
        ...rootEnv,
        ...workerEnv,
        ...(process.env.DATABASE_URL || workerEnv.DATABASE_URL || apiEnv.DATABASE_URL || rootEnv.DATABASE_URL
          ? { DATABASE_URL: process.env.DATABASE_URL || workerEnv.DATABASE_URL || apiEnv.DATABASE_URL || rootEnv.DATABASE_URL }
          : {}),
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
