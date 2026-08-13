#!/bin/bash
set -e

APP_DIR=${CASHFLOW_APP_DIR:-"/opt/cashflow"}
HEALTH_CHECK_URL="http://localhost:4000/api/users/me"

echo "=== CashFlow Production Deployment ==="

# Determine scripts directory path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# 1. Pull code
echo "1. Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "2. Installing application dependencies..."
npm install

# 3. Build / Test
echo "3. Building application components..."
npm run build

# 4 & 5. Create verified SQLite backup and upload/verify S3 backup
echo "4 & 5. Performing mandatory pre-migration backup..."
if "$SCRIPT_DIR/pre-migration-backup.sh"; then
  echo "✅ Pre-migration backup successfully created, verified, and uploaded to S3."
else
  echo "❌ Error: Pre-migration backup failed! Deployment aborted before database migration."
  exit 1
fi

# 6. Run database migration (safe deployment only)
echo "6. Running database migrations..."
cd "$ROOT_DIR/backend"
npx prisma generate
npx prisma migrate deploy
cd "$ROOT_DIR"

# 7. Restart PM2 services
echo "7. Restarting PM2 services..."
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

# 8. Health check
echo "8. Performing application health check..."
sleep 3
if curl -s -f "$HEALTH_CHECK_URL" > /dev/null; then
  echo "✅ Deployment succeeded! Application is live and healthy."
else
  echo "❌ Error: Application health check failed after reload!"
  echo "Deployment failed. DO NOT automatically restore database. Report failure for manual investigation."
  exit 1
fi
