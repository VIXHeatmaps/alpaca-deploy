# Security Measures

## Data Protection

### 1. Database Constraints (ACTIVE)
- **NOT NULL user_id constraints** on all tables (strategies, variable_lists, batch_jobs, active_strategies)
- Prevents orphaned data without ownership
- Database will reject any INSERT/UPDATE without user_id
- Migration: `20251009235046_add_user_id_not_null_constraints.ts`

### 2. API-Level Authorization (ACTIVE)
- All DELETE endpoints verify ownership before deletion
- Users can only delete their own strategies, variables, batch jobs
- `requireAuth` middleware on all protected endpoints
- User ID extracted from Discord OAuth JWT token

### 3. Multi-User Isolation (ACTIVE)
- All queries filtered by user_id
- Users can only see their own data
- Implemented in all database helper functions:
  - `getStrategiesByUserId()`
  - `getVariableListsByUserId()`
  - `getBatchJobsByUserId()`
  - `getActiveStrategiesByUserId()`

## Database Backups

### Manual Backup
```bash
cd backend
DATABASE_PUBLIC_URL="postgresql://..." ./scripts/backup-database.sh
```

This will:
- Create timestamped backup in `backend/backups/`
- Compress with gzip
- Keep only last 7 backups

### Restore from Backup
```bash
gunzip -c backend/backups/alpaca_backup_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_PUBLIC_URL
```

### Recommended Backup Schedule
- **Before major migrations**: Always backup first
- **Weekly**: Run manual backup every Sunday
- **Before deployments**: Backup production before pushing breaking changes

## Railway PostgreSQL Backups

Railway does not provide automatic backups on free/hobby tiers. Consider:

1. **Upgrade to Pro plan** for automatic daily backups
2. **Manual weekly backups** using the script above
3. **GitHub Actions** for automated backups (future enhancement)

## IMPORTANT: Do NOT run these commands

**NEVER run raw SQL deletion commands against production:**
```sql
-- ❌ DANGEROUS - Never run
DELETE FROM strategies WHERE user_id IS NULL;
DELETE FROM variable_lists WHERE user_id IS NULL;
```

**NEVER create cleanup scripts that delete production data**

All data deletion should happen through the API endpoints which have proper authorization checks.

## Security Audit Trail

### 2025-10-10: Data Loss Incident
- **What happened**: All production data (strategies, variables, active_strategies) was deleted
- **Cause**: Records had `user_id = NULL` after migration, likely deleted by cleanup script
- **Resolution**:
  - Added NOT NULL constraints to prevent future NULL user_ids
  - Deleted all cleanup scripts from repository
  - Created backup script for manual backups
  - Documented security measures
- **Prevention**: Database now rejects any data without user_id

## Code Review Checklist

Before deploying database changes:

- [ ] Backup production database
- [ ] Test migration on local database first
- [ ] Verify migration doesn't delete data
- [ ] Check all INSERT/UPDATE statements include user_id
- [ ] Ensure proper error handling for user_id validation
- [ ] Review DELETE endpoints have ownership verification

## Access Control

### Discord OAuth Whitelist
Configure in Railway environment variables:
- `DISCORD_ALLOWED_USER_IDS` - Comma-separated Discord user IDs
- `DISCORD_ALLOWED_EMAILS` - Comma-separated email addresses
- `DISCORD_ALLOWED_EMAIL_DOMAINS` - Comma-separated domains (e.g., "yourcompany.com")

Only whitelisted users can access the application.

## Production Environment Variables

Required for security:
- `SESSION_SECRET` - Random string for session encryption
- `JWT_SECRET` - Random string for JWT token signing
- `DISCORD_CLIENT_ID` - Discord OAuth app ID
- `DISCORD_CLIENT_SECRET` - Discord OAuth secret (NEVER commit to git)
- `DATABASE_URL` - PostgreSQL connection string (NEVER commit to git)

## Future Enhancements

- [ ] Automated daily backups via GitHub Actions
- [ ] Database audit logging (track all deletions)
- [ ] Soft deletes (mark as deleted instead of hard delete)
- [ ] Rate limiting on DELETE endpoints
- [ ] Admin dashboard for data recovery
