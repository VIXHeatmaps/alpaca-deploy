#!/bin/bash

# Database backup script for Railway PostgreSQL
# Usage: ./scripts/backup-database.sh

set -e

# Check if DATABASE_PUBLIC_URL is set
if [ -z "$DATABASE_PUBLIC_URL" ]; then
  echo "Error: DATABASE_PUBLIC_URL environment variable not set"
  echo "Usage: DATABASE_PUBLIC_URL='postgresql://...' ./scripts/backup-database.sh"
  exit 1
fi

# Create backups directory if it doesn't exist
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# Generate timestamp for backup file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/alpaca_backup_$TIMESTAMP.sql"

echo "Starting database backup..."
echo "Backup file: $BACKUP_FILE"

# Use pg_dump to create backup
# Extract connection details from DATABASE_PUBLIC_URL for pg_dump
pg_dump "$DATABASE_PUBLIC_URL" > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"

echo "✓ Backup complete: ${BACKUP_FILE}.gz"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t alpaca_backup_*.sql.gz | tail -n +8 | xargs -r rm
echo "✓ Old backups cleaned up (keeping last 7)"

echo ""
echo "To restore this backup:"
echo "  gunzip -c ${BACKUP_FILE}.gz | psql \$DATABASE_PUBLIC_URL"
