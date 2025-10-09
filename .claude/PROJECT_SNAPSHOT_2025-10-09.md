# Alpaca Deploy - Project Snapshot

**Timestamp:** 2025-10-09 10:00:09 JST
**Git Commit:** 8fdc594d3847a1816fefa6bee49a8eb07d6331bf
**Commit Message:** Fix multi-parameter indicators (STOCH_K, AROON, etc) with centralized conversion
**Total Source Files:** 77

---

## Project Overview

Alpaca Deploy is a full-stack trading strategy backtesting and deployment platform with Discord authentication, real-time data caching (Redis), and PostgreSQL database for batch job storage.

### Tech Stack
- **Frontend:** React + TypeScript (Vite)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (via Knex.js)
- **Cache:** Redis
- **Auth:** Discord OAuth
- **Data Source:** Alpaca Markets API
- **Indicators:** Python service (port 8001)

---

## Recent Session Work (2025-10-09)

### Issues Fixed

1. **Batch Backtests Credentials Issue** ✅
   - Problem: Batch backtests weren't getting Alpaca API credentials
   - Root Cause: `startBatchStrategyJob()` function required credentials but wasn't receiving them
   - Fix: Added `apiKey` and `apiSecret` parameters to function call
   - File: `backend/src/index.ts:1178`

2. **Batch Jobs Not Appearing in Library Tab** ✅
   - Problem: Jobs created in Builder tab didn't show in Library > Batch Tests
   - Root Cause: BuilderWrapper only loaded jobs on mount, not when switching tabs
   - Fix: Reload jobs from IndexedDB when view changes to "library"
   - File: `frontend/src/components/BuilderWrapper.tsx:20-28`

3. **View Button Black Screen** ✅
   - Problem: Clicking "View" on finished batch jobs showed black screen
   - Root Causes:
     - BuilderWrapper didn't render results viewer modal
     - Backend sent `vars` but frontend expected `variables`
   - Fixes:
     - Added batch results viewer modal to BuilderWrapper
     - Changed backend API response property name
   - Files:
     - `frontend/src/components/BuilderWrapper.tsx:183-321`
     - `backend/src/index.ts:1257`

4. **Credentials Persistence Feature** ✅
   - Feature: Added "Save locally" checkbox to persist credentials in localStorage
   - Implementation: Auto-save/load with user control via checkbox
   - File: `frontend/src/App.tsx`

### Current Status
- ✅ Batch backtests working with user-entered credentials
- ✅ Jobs persist across tab switches
- ✅ View/Download CSV functionality working
- ✅ Credentials can be saved locally for convenience

---

## Architecture

### Frontend Structure
```
frontend/src/
├── App.tsx                    # Main app, auth, credentials UI
├── components/
│   ├── BuilderWrapper.tsx     # Wrapper for Builder/Library views
│   ├── VerticalUI2.tsx        # Strategy builder UI
│   ├── LibraryView.tsx        # Library tab (strategies, variables, batch tests)
│   ├── BatchTestsTab.tsx      # Batch tests table view
│   ├── Dashboard.tsx          # Dashboard with active strategy
│   └── VariablesTab.tsx       # Variable management
├── storage/
│   └── batchJobsStore.ts      # IndexedDB for batch jobs
├── types/
│   ├── indicators.ts          # Indicator definitions
│   ├── batchJobs.ts          # Batch job types
│   └── variables.ts          # Variable types
└── utils/
    ├── validation.ts          # Strategy validation
    └── verticalVariables.ts  # Variable extraction/substitution
```

### Backend Structure
```
backend/src/
├── index.ts                   # Main Express server, all routes
├── backtest/
│   └── v2/
│       └── engine.ts          # V2 backtest engine
├── db/
│   ├── batchJobs.ts          # Database service for batch jobs
│   └── migrations/           # Database migrations
├── execution.ts              # Strategy execution logic
└── services/
    └── rebalance.ts          # Rebalancing service
```

### Key Routes

**Authentication:**
- `GET /auth/discord` - Discord OAuth login
- `GET /auth/discord/callback` - OAuth callback
- `GET /auth/user` - Get current user
- `POST /auth/logout` - Logout

**Alpaca API:**
- `GET /api/account` - Validate Alpaca credentials
- `GET /api/bars` - Fetch historical price data

**Backtesting:**
- `POST /api/backtest_flow` - Single backtest (flow-based)
- `POST /api/backtest_strategy` - Single backtest (strategy-based)
- `POST /api/batch_backtest` - Batch backtest (in-memory, deprecated)
- `POST /api/batch_backtest_strategy` - Batch backtest (DB-backed) ⭐
- `GET /api/batch_backtest_strategy/:id` - Get batch job status
- `GET /api/batch_backtest_strategy/:id/view` - Get batch job results
- `GET /api/batch_backtest_strategy/:id/results.csv` - Download CSV
- `POST /api/batch_backtest_strategy/:id/cancel` - Cancel batch job

**Live Trading:**
- `POST /api/invest` - Deploy strategy with capital
- `POST /api/rebalance` - Manual rebalance
- `POST /api/liquidate` - Liquidate all positions

---

## Database Schema

### Tables

**batch_jobs**
```sql
- id (uuid, PK)
- name (text)
- kind (text) - 'server' for DB-backed jobs
- status (text) - 'queued', 'running', 'finished', 'failed'
- total (integer) - Total runs
- completed (integer) - Completed runs
- truncated (boolean)
- error (text, nullable)
- variables (jsonb) - Variable definitions
- strategy_elements (jsonb) - Strategy configuration
- start_date (date, nullable)
- end_date (date, nullable)
- benchmark_symbol (text)
- assignments_preview (jsonb)
- summary (jsonb, nullable) - Aggregate metrics
- created_at (timestamp)
- updated_at (timestamp)
- completed_at (timestamp, nullable)
```

**batch_runs**
```sql
- id (uuid, PK)
- batch_job_id (uuid, FK -> batch_jobs)
- variables (jsonb) - Variable assignments for this run
- metrics (jsonb) - Backtest results
- created_at (timestamp)
```

---

## Data Flow

### Batch Backtest Flow
1. User creates strategy in VerticalUI2 (Builder tab)
2. User defines variables (e.g., `$ticker` = XLK, XLE, XLP)
3. User clicks "Batch Backtest"
4. Frontend generates all variable combinations
5. Frontend sends request to `/api/batch_backtest_strategy` with:
   - Credentials (headers)
   - Strategy elements
   - Variable assignments
6. Backend creates job in database
7. Backend starts `startBatchStrategyJob()` worker with credentials
8. Worker runs backtest for each variable combination
9. Worker stores results in `batch_runs` table
10. Worker updates job status and summary
11. Frontend polls job status every 2 seconds
12. User clicks "View" to see results modal
13. Frontend fetches `/api/batch_backtest_strategy/:id/view`
14. Results displayed with summary stats and table

### Credentials Flow
1. User enters credentials in App.tsx dropdown
2. Credentials stored in React state
3. If "Save locally" checked, stored in localStorage
4. Credentials passed as props to BuilderWrapper → VerticalUI2
5. Credentials sent as HTTP headers for all API calls
6. Backend extracts from headers or falls back to `.env`

---

## Configuration Files

### Environment Variables

**Backend (.env):**
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
INDICATOR_SERVICE_URL=http://127.0.0.1:8001
ALPACA_FEED=sip
JWT_SECRET=local-dev-secret-change-in-production
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_CALLBACK_URL=http://localhost:4000/auth/discord/callback
USE_NEW_ENGINE=true

# Optional - can be provided via headers
ALPACA_API_KEY=
ALPACA_API_SECRET=

# Database
DATABASE_URL=postgresql://alpaca:dev_password_change_in_production@localhost:5432/alpaca_dev

# Redis
REDIS_URL=redis://localhost:6379
```

**Frontend (.env):**
```env
VITE_API_BASE=http://127.0.0.1:4000
```

### Docker Services

**docker-compose.yml:**
- PostgreSQL 15 (port 5432)
- Redis (port 6379)

---

## Key Features

### 1. Strategy Builder (VerticalUI2)
- Visual strategy creation with "elements" (buy/sell/gate)
- Support for multiple tickers and indicators
- Variable substitution (e.g., `$ticker`, `$period`)
- Real-time validation
- Save/load strategies to localStorage

### 2. Batch Backtesting
- Test strategies across multiple variable combinations
- Parallel execution with progress tracking
- Results viewer with sortable metrics table
- CSV export
- Database persistence with resume capability

### 3. Indicator System
- 50+ technical indicators
- Multi-parameter support (e.g., STOCH_K, AROON)
- Centralized parameter conversion
- Redis caching for performance
- Python service for calculations

### 4. V2 Backtest Engine
- 4-phase execution:
  1. Request Analysis
  2. Price Data Fetching (with caching)
  3. Indicator Computation (with caching)
  4. Simulation
- Daily rebalancing
- Benchmark comparison (vs SPY)
- Comprehensive metrics (CAGR, Sharpe, Max Drawdown)

### 5. Live Trading
- Deploy strategies with real capital
- Automatic rebalancing
- Position tracking
- Manual liquidation

### 6. Authentication
- Discord OAuth integration
- Whitelist support (user IDs, emails, domains)
- Session management

---

## Known Issues & Limitations

### Current Limitations
1. **No strategy persistence in DB** - Strategies only in browser localStorage
2. **Single-user assumption** - No multi-tenancy for active strategies
3. **In-memory active strategy** - Lost on server restart
4. **No backtest history** - Only batch jobs are persisted
5. **No position history** - Live trading positions not logged

### Security Considerations
1. Credentials in localStorage (dev convenience, not production-ready)
2. No credential encryption
3. Redis cache has no authentication in dev setup

### Performance Notes
- Redis caching provides ~30-60% hit rate on repeat backtests
- Batch backtests are sequential (no parallel worker pool)
- Large batch jobs (>100 runs) can take several minutes

---

## File Tree (Key Files)

```
alpaca-deploy/
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Main server (2600+ lines)
│   │   ├── backtest/v2/engine.ts       # V2 backtest engine
│   │   ├── db/
│   │   │   ├── batchJobs.ts           # Batch jobs DB service
│   │   │   └── migrations/
│   │   ├── execution.ts                # Live execution logic
│   │   └── services/
│   │       └── rebalance.ts
│   ├── knexfile.ts                     # Database configuration
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # Main app component
│   │   ├── components/
│   │   │   ├── BuilderWrapper.tsx      # Builder/Library wrapper
│   │   │   ├── VerticalUI2.tsx         # Strategy builder (4300+ lines)
│   │   │   ├── LibraryView.tsx
│   │   │   ├── BatchTestsTab.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── VariablesTab.tsx
│   │   ├── storage/
│   │   │   └── batchJobsStore.ts       # IndexedDB
│   │   ├── types/
│   │   │   ├── indicators.ts
│   │   │   ├── batchJobs.ts
│   │   │   └── variables.ts
│   │   └── utils/
│   │       ├── validation.ts
│   │       └── verticalVariables.ts
│   ├── package.json
│   └── .env
├── docker-compose.yml                   # PostgreSQL + Redis
├── .env.example
└── .claude/
    ├── PROJECT_SNAPSHOT_2025-10-09.md  # This file
    ├── COMPLETE_DATABASE_SCHEMA.md
    ├── DATABASE_SCHEMA.md
    └── INDICATOR_AUDIT.md
```

---

## Git Status

```
Modified files:
 M backend/package-lock.json
 M backend/package.json
 M backend/src/backtest/v2/engine.ts
 M backend/src/index.ts
 M frontend/src/components/BuilderWrapper.tsx
 M frontend/src/components/VerticalUI2.tsx
 M frontend/src/utils/validation.ts

Untracked files:
?? .claude/COMPLETE_DATABASE_SCHEMA.md
?? .claude/DATABASE_SCHEMA.md
?? .claude/INDICATOR_AUDIT.md
?? .env.example
?? backend/knexfile.ts
?? backend/show-logs.sh
?? backend/src/db/
?? docker-compose.yml
```

---

## Next Steps / Future Improvements

### Recommended Enhancements
1. **Strategy Library DB Migration**
   - Move strategies from localStorage to PostgreSQL
   - Add user ownership and sharing
   - Version control for strategies

2. **Multi-User Support**
   - User-scoped batch jobs
   - User-scoped active strategies
   - Strategy sharing and templates

3. **Improved Batch Processing**
   - Worker pool for parallel execution
   - Job queue with priority
   - Resume failed jobs

4. **Trading History**
   - Log all trades to database
   - Performance tracking over time
   - Position history

5. **Enhanced Security**
   - Encrypt credentials at rest
   - API key rotation
   - Redis authentication
   - Rate limiting

6. **Monitoring & Observability**
   - Structured logging
   - Error tracking (Sentry)
   - Performance metrics
   - Health checks

7. **Testing**
   - Unit tests for backtest engine
   - Integration tests for API
   - E2E tests for critical flows

---

## Development Commands

```bash
# Backend
cd backend
npm install
npm run dev              # Start dev server (port 4000)
npm run build            # Build for production
npx knex migrate:latest  # Run database migrations

# Frontend
cd frontend
npm install
npm run dev              # Start dev server (port 5173)
npm run build            # Build for production

# Docker
docker-compose up -d     # Start PostgreSQL + Redis
docker-compose down      # Stop services
docker ps                # Check running containers

# Database
docker exec -it alpaca-postgres psql -U alpaca -d alpaca_dev
```

---

## Support & Documentation

- **Alpaca API Docs:** https://alpaca.markets/docs/
- **Discord OAuth:** https://discord.com/developers/docs/topics/oauth2
- **Knex.js:** http://knexjs.org/
- **Redis:** https://redis.io/docs/

---

**End of Snapshot**
