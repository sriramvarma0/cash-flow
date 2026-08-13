#!/bin/bash
set -e

# Force prefix to pre-migration
export S3_BACKUP_PREFIX="pre-migration"

echo "=== Running Mandatory Pre-Migration Backup ==="

# Determine scripts directory path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Execute the backup script
if "$SCRIPT_DIR/backup-db.sh"; then
  echo "✅ Pre-migration backup succeeded. Proceeding."
  exit 0
else
  echo "❌ Error: Pre-migration backup failed! Deployment must halt immediately."
  exit 1
fi
