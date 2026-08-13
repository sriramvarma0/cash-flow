#!/bin/bash
set -e

# Default configurations
DB_PATH=${CASHFLOW_DB_PATH:-"/var/lib/cashflow/cashflow.db"}
BUCKET=${S3_BACKUP_BUCKET}
PREFIX=${S3_BACKUP_PREFIX:-"daily"}
TEMP_DIR="/tmp/cashflow-backups"

echo "=== CashFlow Database Backup ==="
echo "Target DB: $DB_PATH"

if [ -z "$BUCKET" ]; then
  echo "Error: S3_BACKUP_BUCKET environment variable is not defined."
  exit 1
fi

echo "Target S3: s3://$BUCKET/$PREFIX/"

# Validate database exists
if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file does not exist at $DB_PATH"
  exit 1
fi

# Create local temp directory
mkdir -p "$TEMP_DIR"

# Generate backup file names
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_FILENAME="cashflow-backup-$TIMESTAMP.db"
TEMP_BACKUP_PATH="$TEMP_DIR/$BACKUP_FILENAME"

# 2. Use SQLite's safe backup mechanism
echo "Performing SQLite safe backup..."
sqlite3 "$DB_PATH" ".backup '$TEMP_BACKUP_PATH'"

# 4. Verify that the backup exists and is valid
if [ ! -f "$TEMP_BACKUP_PATH" ]; then
  echo "Error: Backup file was not created successfully"
  exit 1
fi

echo "Verifying backup file integrity..."
INTEGRITY=$(sqlite3 "$TEMP_BACKUP_PATH" "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
  echo "Error: SQLite database backup integrity check failed! Result: $INTEGRITY"
  rm -f "$TEMP_BACKUP_PATH"
  exit 1
fi
echo "Backup integrity verified successfully!"

# 5. Upload it to S3 using AWS CLI
echo "Uploading backup to S3..."
if aws s3 cp "$TEMP_BACKUP_PATH" "s3://$BUCKET/$PREFIX/$BACKUP_FILENAME" --sse AES256; then
  echo "✅ Database backup successfully uploaded to S3: s3://$BUCKET/$PREFIX/$BACKUP_FILENAME"
else
  echo "❌ Error: AWS S3 upload failed!"
  rm -f "$TEMP_BACKUP_PATH"
  exit 1
fi

# 7. Delete temporary local backup files after successful upload
rm -f "$TEMP_BACKUP_PATH"
echo "Temporary local backup file cleaned up."
