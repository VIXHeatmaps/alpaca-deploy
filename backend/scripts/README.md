# Database Scripts

## Backup Production Database

Run this **before any major changes** to production:

```bash
cd backend
DATABASE_PUBLIC_URL="postgresql://postgres:xxx@nozomi.proxy.rlwy.net:46451/railway" ./scripts/backup-database.sh
```

Get `DATABASE_PUBLIC_URL` from:
1. Railway dashboard → PostgreSQL service → Variables tab
2. Look for `DATABASE_PUBLIC_URL` variable

## Restore from Backup

If something goes wrong:

```bash
# List available backups
ls -lh backend/backups/

# Restore specific backup
gunzip -c backend/backups/alpaca_backup_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_PUBLIC_URL
```

## Run Production Migration

**ALWAYS backup first!**

```bash
cd backend
DATABASE_URL="$DATABASE_PUBLIC_URL" npx ts-node node_modules/.bin/knex migrate:latest
```

## Check Migration Status

```bash
cd backend
DATABASE_URL="$DATABASE_PUBLIC_URL" npx knex migrate:status
```

## Rollback Last Migration (DANGEROUS)

Only use if you just ran a bad migration:

```bash
cd backend
DATABASE_URL="$DATABASE_PUBLIC_URL" npx ts-node node_modules/.bin/knex migrate:rollback
```

## Safety Checklist

Before running migrations on production:

1. ✅ Backup database first
2. ✅ Test migration on local database
3. ✅ Review migration code (no DELETE/DROP statements)
4. ✅ Verify it's the correct DATABASE_URL
5. ✅ Have rollback plan ready
