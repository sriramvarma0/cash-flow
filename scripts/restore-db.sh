#!/bin/bash
set -e

# Configurations
DB_PATH=${CASHFLOW_DB_PATH:-"/var/lib/cashflow/cashflow.db"}
BUCKET=${S3_BACKUP_BUCKET}
TEMP_DIR="/tmp/cashflow-restores"
HEALTH_CHECK_URL="http://localhost:4000/api/users/me"

echo "=== CashFlow Database Restore (Disaster Recovery) ==="
echo "Target Production DB: $DB_PATH"

if [ -z "$BUCKET" ]; then
  echo "Error: S3_BACKUP_BUCKET environment variable is not defined."
  exit 1
fi

# 1. Require explicit selection of a backup
if [ -z "$1" ]; then
  echo "Error: Please specify the backup filename to restore."
  echo "Usage: ./restore-db.sh <backup-filename-in-s3>"
  echo "Example: ./restore-db.sh daily/cashflow-backup-2026-08-13-120000.db"
  exit 1
fi

BACKUP_S3_KEY="$1"
BACKUP_FILENAME=$(basename "$BACKUP_S3_KEY")
DOWNLOADED_BACKUP_PATH="$TEMP_DIR/$BACKUP_FILENAME"

# Ensure local temp directory exists
mkdir -p "$TEMP_DIR"

# 2. Download the selected backup from S3
echo "Downloading backup s3://$BUCKET/$BACKUP_S3_KEY..."
if aws s3 cp "s3://$BUCKET/$BACKUP_S3_KEY" "$DOWNLOADED_BACKUP_PATH"; then
  echo "Backup downloaded successfully to $DOWNLOADED_BACKUP_PATH"
else
  echo "Error: Failed to download backup from S3"
  exit 1
fi

# 3. Validate the downloaded SQLite database
echo "Validating downloaded backup database integrity..."
if [ ! -f "$DOWNLOADED_BACKUP_PATH" ]; then
  echo "Error: Downloaded file not found"
  exit 1
fi

INTEGRITY=$(sqlite3 "$DOWNLOADED_BACKUP_PATH" "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
  echo "Error: Downloaded SQLite database integrity check failed! Result: $INTEGRITY"
  rm -f "$DOWNLOADED_BACKUP_PATH"
  exit 1
fi
echo "Downloaded backup integrity verified successfully!"

# 5. Create a safety copy of the current production database first before replacing it
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
SAFETY_COPY_PATH="$DB_PATH.safety-$TIMESTAMP"
echo "Creating active production database safety copy at $SAFETY_COPY_PATH..."
if [ -f "$DB_PATH" ]; then
  # Use safe copy
  sqlite3 "$DB_PATH" ".backup '$SAFETY_COPY_PATH'"
  echo "Safety copy created successfully."
else
  echo "No active production database found at $DB_PATH. Skipping safety copy."
fi

# 4. Stop the application
echo "Stopping PM2 application services..."
pm2 stop ecosystem.config.js || echo "Warning: PM2 services were not running."

# 6. Replace the production database only after validation
echo "Replacing production database..."
# Create directory for production DB if it doesn't exist
mkdir -p "$(dirname "$DB_PATH")"
cp "$DOWNLOADED_BACKUP_PATH" "$DB_PATH"

# 7. Apply correct file ownership/permissions
echo "Applying file permissions..."
chmod 600 "$DB_PATH"
# If running as root, chown to user running the app (usually ubuntu)
if [ "$EUID" -eq 0 ]; then
  chown ubuntu:ubuntu "$DB_PATH" || echo "Warning: Could not chown to ubuntu:ubuntu"
fi

# 8. Restart the application
echo "Starting PM2 application services..."
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

# 9. Perform a health check
echo "Running application health check..."
sleep 3
if curl -s -f "$HEALTH_CHECK_URL" > /dev/null; then
  echo "✅ Restore succeeded! Application is healthy."
else
  echo "⚠️ Warning: Health check failed on $HEALTH_CHECK_URL after database restore!"
  echo "Please check PM2 logs immediately: pm2 logs"
  exit 1
fi

# Clean up downloaded temp backup
rm -f "$DOWNLOADED_BACKUP_PATH"
echo "Disaster recovery completed."
