# Alpaca Deploy - Project Snapshot

## Overview
Alpaca Deploy is a production trading strategy application for Alpaca that allows users to:
- View their Alpaca account info, current strategy, and snapshots (Dashboard)
- Build and backtest trading strategies using a visual flow-based UI (Strategy Builder)

## Architecture

### Three-Service Architecture
```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   Frontend      │◄────►│    Backend       │◄────►│ Indicator Service   │
│   (Vercel)      │      │   (Railway)      │      │    (Railway)        │
│   React/Vite    │      │  Node/Express    │      │   Python/FastAPI    │
└─────────────────┘      └──────────────────┘      └─────────────────────┘
                                 │
                                 ▼
                         ┌──────────────┐
                         │ Alpaca API   │
                         └──────────────┘
```

### Frontend (`/frontend`)
- **Tech Stack**: React 19, Vite 7, TypeScript, TailwindCSS 4
- **Key Libraries**:
  - ReactFlow 11 - Visual flow builder for strategies
  - Recharts 3 - Data visualization
  - Chart.js 4 - Additional charting
  - Axios - HTTP client
  - Framer Motion - Animations
- **Main Components**:
  - `App.tsx` - Root component with auth, tab navigation between Dashboard and Strategy Builder
  - `Dashboard.tsx` - Shows Alpaca account info, current strategy, snapshots
  - `VerticalUI2.tsx` - Visual flow-based strategy builder
  - `BatchTestsTab.tsx` - Batch backtesting interface
  - `VariablesTab.tsx` - Variable management for batch tests
- **Environment**:
  - `VITE_BACKEND_URL` - Backend API URL
  - `VITE_INDICATOR_URL` - Indicator service URL (optional, uses backend by default)

### Backend (`/backend`)
- **Tech Stack**: Node.js, Express 4, TypeScript, ts-node-dev
- **Key Dependencies**:
  - Passport.js with Discord OAuth strategy
  - JWT for authentication tokens
  - Axios for Alpaca API and indicator service calls
  - Cookie-parser for session management
- **File Structure**:
  ```
  backend/src/
  ├── index.ts                 # Main server file (~3300 lines)
  ├── execution/
  │   ├── executor.ts          # Strategy execution engine
  │   ├── test-executor.ts     # Backtesting executor
  │   ├── indicators.ts        # Indicator data fetching
  │   ├── validator.ts         # Strategy validation
  │   ├── types.ts             # Type definitions
  │   └── index.ts             # Exports
  ├── services/
  │   ├── rebalance.ts         # Portfolio rebalancing
  │   ├── scheduler.ts         # Strategy scheduling
  │   ├── fillChecker.ts       # Order fill monitoring
  │   ├── orders.ts            # Order management
  │   ├── clock.ts             # Market hours tracking
  │   └── flowEval.ts          # Flow evaluation utilities
  ├── storage/
  │   ├── activeStrategy.ts    # Current strategy persistence
  │   ├── strategySnapshots.ts # Historical snapshots
  │   └── testStorage.ts       # Test data storage
  └── utils/
      └── id.ts                # ID generation
  ```
- **Data Storage**: Local JSON files in `backend/data/`
  - `activeStrategy.json` - Current active strategy
  - `snapshots/` - Strategy snapshots by date
- **Environment Variables**:
  - `PORT` - Server port (default 4000)
  - `NODE_ENV` - Environment (production/development)
  - `FRONTEND_URL` - Frontend URL for CORS
  - `INDICATOR_SERVICE_URL` - Python indicator service URL
  - `ALPACA_FEED` - Alpaca data feed (sip/iex)
  - `JWT_SECRET` - JWT signing secret
  - `DISCORD_CLIENT_ID` - Discord OAuth app ID
  - `DISCORD_CLIENT_SECRET` - Discord OAuth secret
  - `DISCORD_CALLBACK_URL` - OAuth callback URL
  - `DISCORD_ALLOWED_USER_IDS` - Comma-separated Discord user IDs
  - `DISCORD_ALLOWED_EMAILS` - Comma-separated allowed emails
  - `DISCORD_ALLOWED_EMAIL_DOMAINS` - Comma-separated email domains

### Indicator Service (`/indicator-service`)
- **Tech Stack**: Python, FastAPI, TA-Lib, QuantStats
- **Purpose**: Calculate technical indicators and backtest metrics
- **Key File**: `app.py` (~600 lines)
- **Key Features**:
  - Point-in-time correct indicators (no forward-looking bias)
  - Supports TA-Lib indicators: RSI, SMA, EMA, MACD, etc.
  - Custom indicators: VOLATILITY, CUMULATIVE_RETURN
  - QuantStats metrics for backtesting performance
- **Endpoints**:
  - `POST /indicator` - Calculate indicators
  - `POST /metrics/quantstats` - Calculate performance metrics
- **Dependencies**: numpy, pandas, talib, quantstats, fastapi, uvicorn
- **Environment**: `PORT` (default 8001)

## Authentication & Authorization

### Discord OAuth Flow
1. User clicks "Sign in with Discord" on frontend
2. Frontend redirects to `{backend}/auth/discord`
3. Backend uses Passport.js Discord strategy
4. Discord redirects back to `{backend}/auth/discord/callback`
5. Backend validates user against whitelist (if configured)
6. Backend creates JWT token and sets it as httpOnly cookie
7. Backend redirects to frontend with success/error

### Whitelist System
The backend supports three whitelist modes:
- **User IDs**: `DISCORD_ALLOWED_USER_IDS` - specific Discord user IDs
- **Emails**: `DISCORD_ALLOWED_EMAILS` - specific verified emails
- **Email Domains**: `DISCORD_ALLOWED_EMAIL_DOMAINS` - entire email domains

If any whitelist is configured, only matching users can authenticate. If no whitelists are set, all Discord users can sign in.

### JWT Authentication
- Tokens stored in httpOnly cookies for security
- Cookie name: `authToken`
- Default expiration: 30 days (`JWT_EXPIRES_IN`)
- Protected routes check for valid JWT via `requireAuth` middleware

## Strategy System

### Strategy Structure
Strategies are defined as visual flows with three main element types:

1. **Ticker Elements** (Leaf nodes)
   - Represent individual stocks/assets
   - Example: `{ type: "ticker", ticker: "AAPL" }`

2. **Weight Elements** (Branch nodes)
   - Split capital between child branches
   - Example: `{ type: "weight", weights: [0.6, 0.4], children: [...] }`

3. **Gate Elements** (Conditional nodes)
   - Route to different branches based on indicator conditions
   - Example:
     ```json
     {
       "type": "gate",
       "conditions": [
         {
           "ticker": "SPY",
           "indicator": "RSI",
           "period": 14,
           "operator": "gt",
           "compareTo": "threshold",
           "threshold": "50"
         }
       ],
       "trueChild": {...},
       "falseChild": {...}
     }
     ```

### Flow Globals
Each strategy flow includes global settings:
```typescript
{
  startDate: string,        // Backtest start (YYYY-MM-DD)
  endDate: string,          // Backtest end (YYYY-MM-DD)
  rebalance: string,        // daily/weekly/monthly
  rebalanceHour: number,    // Hour of day to rebalance (0-23)
  rebalanceMinute: number,  // Minute of hour (0-59)
  equity: number,           // Initial capital
  feed: string,             // Data feed (sip/iex)
  commission: number        // Commission per trade
}
```

### Strategy Execution
- **Executor** (`backend/src/execution/executor.ts`): Evaluates strategy tree, resolves gates, calculates positions
- **Test Executor** (`backend/src/execution/test-executor.ts`): Runs historical backtests
- **Validator** (`backend/src/execution/validator.ts`): Validates strategy structure before execution

### Batch Backtesting
Users can test multiple parameter combinations:
1. Define variables with multiple values (e.g., RSI period: 10, 14, 20)
2. System generates all combinations
3. Runs backtests in sequence
4. Returns aggregated results with performance metrics

## API Endpoints

### Authentication
- `GET /auth/discord` - Start Discord OAuth flow
- `GET /auth/discord/callback` - OAuth callback handler
- `GET /auth/user` - Get current user info (requires auth)
- `POST /auth/logout` - Clear auth token

### Alpaca Account
- `GET /api/account` - Get Alpaca account info (requires API key/secret)
- `GET /api/portfolio_history` - Get portfolio history
- `POST /api/liquidate` - Liquidate all positions

### Strategy Management
- `GET /api/strategy` - Get active strategy
- `POST /api/strategy` - Save/update active strategy
- `GET /api/strategy/snapshots` - List all strategy snapshots
- `GET /api/strategy/snapshots/:date` - Get specific snapshot
- `POST /api/strategy/snapshots` - Create snapshot

### Backtesting
- `POST /api/backtest_strategy` - Run single backtest
- `POST /api/batch_backtest_strategy` - Start batch backtest job
- `GET /api/batch_backtest_strategy/:id` - Get batch job status/results
- `DELETE /api/batch_backtest_strategy/:id` - Cancel/delete batch job
- `GET /api/batch_backtest/:jobId/csv` - Download batch results as CSV

### Indicators (proxied to Python service)
- `POST /api/indicator` - Calculate indicator values

## Deployment

### Railway (Backend + Indicator Service)
Both backend and indicator service deploy to Railway with:
- Builder: NIXPACKS
- Start command: `npm run start` (backend) / `python app.py` (indicator)
- Restart policy: ON_FAILURE with max 10 retries

### Vercel (Frontend)
Frontend deploys to Vercel with standard Vite/React build.

## Key Technical Details

### Indicator Point-in-Time Correctness
The indicator service implements strict point-in-time correctness to avoid forward-looking bias:
- Rule: Indicator at index `i` only uses data from `0` to `i-1`
- TA-Lib indicators (RSI, SMA, EMA) are already correct
- Custom indicators manually lag by 1 day
- This ensures backtest decisions use only data available at decision time

### Session Management Migration
Recent change (commit 1911d29): Migrated from Express sessions to JWT tokens for serverless compatibility. This allows the backend to scale horizontally without session store.

### CORS Configuration
Backend allows credentials from `FRONTEND_URL` environment variable, enabling secure cookie-based authentication across domains.

### Data Persistence
Currently uses local JSON files for simplicity:
- Active strategy stored in `backend/data/activeStrategy.json`
- Snapshots in `backend/data/snapshots/YYYY-MM-DD.json`
- This works on Railway with persistent volumes, but won't work with true serverless

## Recent Changes (from git history)

1. **Discord Whitelist** (commit 28c8116) - Added whitelist system for Discord OAuth
2. **axios withCredentials** (commit e54d5fb) - Send auth cookies with requests
3. **JWT Migration** (commit 1911d29) - Replaced sessions with JWT for serverless
4. **Discord OAuth UI** (commit b17b76e) - Implemented login screen
5. **Discord Backend** (commit 05c9697) - Implemented Discord authentication

## Common Development Tasks

### Local Development
```bash
# Backend
cd backend
npm install
npm run dev  # Runs on port 4000

# Frontend
cd frontend
npm install
npm run dev  # Runs on port 3000

# Indicator Service
cd indicator-service
pip install -r requirements.txt
python app.py  # Runs on port 8001
```

### Adding New Indicators
1. Add indicator calculation to `indicator-service/app.py`
2. Ensure point-in-time correctness (lag by 1 day if needed)
3. Update frontend to support new indicator in UI

### Modifying Strategy Flow
1. Update types in `backend/src/execution/types.ts`
2. Update executor logic in `backend/src/execution/executor.ts`
3. Update frontend ReactFlow components in `frontend/src/components/VerticalUI2.tsx`

## Important Notes

- **No Database**: Uses local JSON files, suitable for single-instance deployment
- **Backtesting**: All backtests run synchronously in-memory (no job queue)
- **Batch Jobs**: Stored in-memory Map (lost on server restart)
- **Market Hours**: Backend tracks market hours for scheduling (EST/EDT aware)

### API Key Handling (Current Implementation)

**How it works:**
1. User enters Alpaca API key/secret in Dashboard UI text inputs
2. Stored in React `useState` (browser memory only) - **NOT** localStorage or sessionStorage
3. Sent as HTTP headers with every backend request:
   - `APCA-API-KEY-ID: pk_xxx...`
   - `APCA-API-SECRET-KEY: sk_xxx...`
4. Backend reads from request headers, uses immediately to call Alpaca API
5. Backend **never stores keys to disk** (verified: not in `activeStrategy.json` or anywhere)
6. Keys lost on page refresh - user must re-enter them

**Why this design:**
- ✅ Maximum security: no persistent storage of credentials anywhere
- ✅ Simple: no database or encryption complexity needed
- ✅ Appropriate for current development stage + small group testing
- ⚠️ User must re-enter keys on every page refresh (acceptable for now)
- 📅 Future: Will migrate to server-side encrypted storage tied to Discord users when scaling to wider audience

## Strategic Roadmap (Based on Clarifications)

### ✅ **Answered Questions**

1. **Production Scale** → **YES, eventually multiple users**
   - **Action Required:** Migrate to PostgreSQL/database (near-future priority)
   - Even single user will generate thousands of strategies/batch jobs
   - Database needed before wider release

2. **API Key Storage** → **Current approach fine for now**
   - Will scale later when onboarding more users
   - Server-side encrypted storage tied to Discord users

3. **Batch Job Persistence** → **YES, needed soon**
   - **Action Required:** Save to database (part of #1)
   - Critical for recovery from crashes
   - Enable resuming partial batches

4. **Real Trading** → **Eventually real, paper for now**
   - Paper trading for foreseeable future
   - Real trading planned but not immediate

5. **User Management** → **Later**
   - Discord OAuth sufficient for now
   - Profiles/permissions when scaling

6. **Strategy Snapshots** → **What are these?**
   - **Clarification Needed:** Current implementation stores daily portfolio snapshots (equity, holdings, returns)
   - Located: `backend/data/snapshots/{strategyId}.json`
   - Tracked per strategy after each rebalance
   - **Question:** Is this what you meant, or something else?

7. **Performance** → **CRITICAL PRIORITY**
   - **Action Required:** Batch backtests are slow and getting slower
   - Can be VERY complex (many tickers, indicators, gates)
   - Batch tests can be very large (hundreds/thousands of combos)
   - **See: `.claude/PERFORMANCE_ANALYSIS.md`** for detailed optimization plan
   - **Quick win:** Parallel processing = 10x speedup with ~4 hours work

8. **Indicator Service Separation** → **Unknown reason**
   - Originally set up separated, no clear reason
   - **Could consolidate** to simplify deployment
   - Would reduce network round-trips
   - Consider merging during database migration

---

### 🎯 **Priority Order (Next Steps)**

#### **Priority 1: PERFORMANCE (URGENT)** 🔥
See [PERFORMANCE_ANALYSIS.md](.claude/PERFORMANCE_ANALYSIS.md) for full details.

**SCALE REQUIREMENTS UPDATED:**
- Typical batch: 600-14,000 combos
- Maximum batch: 50,000-200,000 combos
- Acceptable runtime: Up to 12 hours (overnight batches normal)

**CRITICAL FINDING:** Current sequential approach cannot handle this scale.
- 14,000 combos = 19.4 hours (too slow)
- 200,000 combos = 277 hours (impossible)

**Phase 1 (Immediate - 1-2 days):**
- Implement parallel batch processing (20x speedup)
- Add price data caching (additional 30-50% speedup)
- **Impact:**
  - 14,000 combos: 19.4 hours → ~1 hour ✅
  - 200,000 combos: 277 hours → ~14 hours ⚠️ (still tight)

**Phase 2 (REQUIRED for production - 1 week):**
- Worker queue architecture with PostgreSQL
- Multiple worker processes (5-10 instances)
- Distributed job processing
- **Impact:**
  - 14,000 combos: ~12 minutes ✅
  - 200,000 combos: ~2.8 hours ✅

#### **Priority 2: DATABASE MIGRATION (Near-future, before wider release)** 📊
**Why:** Support multiple users, persist thousands of strategies/jobs

**Actions:**
- Set up PostgreSQL on Railway
- Migrate strategies from JSON files → database
- Persist batch jobs (enable resume on restart)
- Store user preferences tied to Discord ID

**Timeline:** ~1 week

#### **Priority 3: API KEY STORAGE (When scaling)** 🔑
**After** database migration, store encrypted Alpaca keys server-side

#### **Priority 4: ARCHITECTURE CLEANUP (Optional)** 🏗️
- Consider merging indicator service into backend
- Reduce deployment complexity
- Eliminate network latency

---

## Open Questions

1. **Strategy Snapshots:** Need clarification on what you're referring to (see #6 above)

2. **Performance specifics** (for optimization planning):
   - What's your typical batch size? (10, 100, 1000+ combos?)
   - How complex are strategies? (ticker count, indicator count, gate depth?)
   - What's acceptable batch completion time? (1 min, 5 min, 10 min?)
   - Hitting any Alpaca API rate limits currently?
