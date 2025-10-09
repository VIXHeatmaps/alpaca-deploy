# Multi-User Isolation - Deployment Notes

**Date**: October 9, 2025
**Status**: ✅ Complete and Deployed

## Summary

Successfully implemented multi-user isolation for the Alpaca trading strategy app. Each user now has their own isolated data for strategies, variables, batch tests, and active strategies.

## What Was Implemented

### 1. Database Changes
- **Migration**: `20251009000006_add_user_id_columns.ts`
- Added `user_id` column to:
  - `strategies`
  - `variable_lists`
  - `batch_jobs`
  - `active_strategies`
- All columns are nullable for backward compatibility
- Added indexes on `user_id` for query performance

### 2. Backend Updates
- Updated all database helper functions to filter by `user_id`:
  - `strategiesDb.ts` - Added `getStrategiesByUserId()`
  - `variableListsDb.ts` - Added `getVariableListsByUserId()`
  - `batchJobsDb.ts` - Added `getBatchJobsByUserId()`
  - `activeStrategiesDb.ts` - Added `getActiveStrategiesByUserId()`
- Added `requireAuth` middleware to all API endpoints
- All create/update operations now include `user_id` from authenticated user
- Variable name uniqueness now scoped per-user (not global)

### 3. Frontend Updates
- Added `credentials: 'include'` to all fetch() API calls
- Ensures auth cookies are sent with requests
- Files updated:
  - `src/api/strategies.ts`
  - `src/api/variables.ts`
  - `src/components/InvestModal.tsx`

### 4. Infrastructure Setup
- Created PostgreSQL database on Railway
- Linked database to backend service via `DATABASE_URL` variable
- Ran all migrations on production database
- Fixed TypeScript build issue by moving `knexfile.ts` to `src/db/`

## Production Deployment

### Services
- **Frontend**: Vercel (https://alpaca-deploy-production.vercel.app)
- **Backend**: Railway (https://alpaca-deploy-production.up.railway.app)
- **Database**: PostgreSQL on Railway
- **Indicator Service**: Railway

### Deployment Process
1. Code pushed to GitHub `main` branch
2. Vercel auto-deploys frontend (~1 min)
3. Railway auto-deploys backend (~2 min)
4. Database migrations run manually when schema changes

## Testing Results

### ✅ Verified Working
- User authentication via Discord OAuth
- Library tab loads user's strategies only
- Variables tab loads user's variables only
- Can create variables with same names as other users
- Deploy strategy saves with correct user_id
- Batch backtests isolated per user
- Active strategies isolated per user

### 🐛 Issues Fixed
1. **Auth cookies not sent**: Added `credentials: 'include'` to all fetch calls
2. **TypeScript build failure**: Moved `knexfile.ts` into `src/db/` directory
3. **Variable name collision**: Changed uniqueness check from global to per-user

## Local Development Notes

### What Works Locally
- ✅ Builder UI and strategy design
- ✅ Batch backtests (historical data)
- ✅ Saving strategies to local database
- ✅ Creating variables

### What to Avoid Locally
- ⚠️ **Don't deploy strategies locally** - use production only
- Local and production use separate databases
- Deploying from both would conflict on shared Alpaca account

## Database Migration Commands

### Run Migration Locally
```bash
cd backend
npx knex migrate:latest
```

### Run Migration on Production
```bash
# Option 1: From local machine
DATABASE_URL="<production-database-url>" npx knex migrate:latest

# Option 2: Via Railway CLI
railway run npx knex migrate:latest
```

### Rollback Migration (if needed)
```bash
npx knex migrate:rollback
```

## Key Files Changed

### Backend
- `backend/src/db/migrations/20251009000006_add_user_id_columns.ts` (NEW)
- `backend/src/db/strategiesDb.ts`
- `backend/src/db/variableListsDb.ts`
- `backend/src/db/batchJobsDb.ts`
- `backend/src/db/activeStrategiesDb.ts`
- `backend/src/db/migrateJsonToDb.ts`
- `backend/src/db/knexfile.ts` (moved to src/db/)
- `backend/src/db/connection.ts` (updated import path)
- `backend/src/index.ts` (added requireAuth to all endpoints)
- `backend/tsconfig.json` (added include/exclude)

### Frontend
- `frontend/src/api/strategies.ts`
- `frontend/src/api/variables.ts`
- `frontend/src/components/InvestModal.tsx`

### Documentation
- `README.md` (updated with multi-user info and Railway deployment)

## Git Commits
1. `9b3133a` - Implement multi-user isolation with user_id columns
2. `d577c34` - Fix: Move knexfile.ts into src/db to fix Railway build
3. `beadba3` - Fix: Variable name uniqueness should be per-user, not global
4. `1d71d1c` - docs: Update README with multi-user isolation and Railway deployment info

## Security Considerations

- All API endpoints require Discord authentication
- JWT tokens stored in httpOnly cookies
- User data isolated by `user_id` in database queries
- No user can access another user's data
- Variable names unique per-user (prevents naming conflicts)

## Future Enhancements

Potential improvements for consideration:
- [ ] Admin panel to view all users and their data
- [ ] User settings/preferences
- [ ] Data export functionality per user
- [ ] Usage analytics per user
- [ ] Rate limiting per user
- [ ] Shared/public strategies feature (opt-in)

## Production URLs

- **Frontend**: https://alpaca-deploy-production.vercel.app (or your Vercel domain)
- **Backend**: https://alpaca-deploy-production.up.railway.app
- **Railway Dashboard**: https://railway.app/dashboard

## Support

For issues or questions:
- Check Railway deployment logs for backend errors
- Check Vercel deployment logs for frontend errors
- Database issues: Check Railway PostgreSQL logs
- Local development: See `README-LOCAL-DEV.md`
