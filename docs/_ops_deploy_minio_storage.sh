#!/bin/bash
set -eu
REPO=/root/zls/project/CrossPilot
STAMP=$(date +%Y%m%d%H%M)
BACKUP=/root/zls/backup
cd "$REPO"

mkdir -p "$BACKUP/CrossPilot-pre-minio-$STAMP"
git rev-parse HEAD > "$BACKUP/CrossPilot-pre-minio-$STAMP/HEAD"
for f in .env apps/api/.env apps/worker/.env packages/db/.env ecosystem.config.cjs; do
  cp -a "$REPO/$f" "$BACKUP/CrossPilot-pre-minio-$STAMP/$(echo $f | tr '/' '_')" 2>/dev/null || true
  cp -a "$REPO/$f" "/tmp/crosspilot.preserve.$(echo $f | tr '/' '_')" 2>/dev/null || true
done

# Ensure MinIO bucket and download policy
docker exec ragent_minio mc alias set local http://localhost:9000 minioadmin minioadmin 2>/dev/null || true
docker exec ragent_minio mc mb local/crosspilot-assets 2>/dev/null || true
docker exec ragent_minio mc anonymous set download local/crosspilot-assets 2>/dev/null || true

git fetch origin
git checkout -B master origin/master

for f in .env apps/api/.env apps/worker/.env packages/db/.env ecosystem.config.cjs; do
  p="/tmp/crosspilot.preserve.$(echo $f | tr '/' '_')"
  [ -f "$p" ] && cp -a "$p" "$REPO/$f"
done

echo "DEPLOY_HEAD=$(git rev-parse --short HEAD)"

pnpm install --frozen-lockfile
pnpm --filter @crosspilot/db exec prisma generate

for pkg in shared integrations ai domain db tool-platform actions; do
  pnpm --filter @crosspilot/$pkg run build
done
pnpm --filter @crosspilot/api run build
pnpm --filter @crosspilot/worker run build
pnpm --filter @crosspilot/web run build

pm2 reload crosspilot-api --update-env
sleep 3
pm2 reload crosspilot-worker --update-env
sleep 3
pm2 reload crosspilot-web --update-env
sleep 8
pm2 list | grep -E 'crosspilot-(api|worker|web)'
echo "DEPLOY_HEAD_FINAL=$(git rev-parse --short HEAD)"
echo DEPLOY_BUILD_OK
