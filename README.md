# Alpaca Strategy App - Production

Clean production deployment of the Alpaca trading strategy app with multi-strategy support.

## Features

- **Dashboard**: View Alpaca account info, active strategies, and performance snapshots
- **Strategy Builder**: Build and backtest trading strategies with visual flow-based UI
- **Multi-Strategy Support**: Run multiple strategies simultaneously with position attribution
- **Live Trading**: Deploy strategies with automatic rebalancing (T-10, 3:50pm ET)
- **Daily Snapshots**: Track daily performance at 4:05pm ET using actual trade prices
- **Bug Reporting**: Built-in feedback system for alpha testers
- **Discord Authentication**: Whitelist-based user access control
- **Multi-User Isolation**: Each user has their own strategies, variables, batch tests, and active strategies

## Structure

```
├── backend/          # Node.js/Express backend API
├── frontend/         # React/Vite frontend UI
└── indicator-service/ # Python FastAPI indicator calculations
```

## Required Environment Variables

### Backend (Railway)
```
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
INDICATOR_SERVICE_URL=https://your-indicator.up.railway.app
ALPACA_FEED=sip
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key

# Discord OAuth (optional - for authentication)
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_CALLBACK_URL=https://your-backend.up.railway.app/auth/discord/callback

# Discord Whitelist (optional - comma separated)
DISCORD_ALLOWED_USER_IDS=123456789,987654321
DISCORD_ALLOWED_EMAILS=user@example.com
DISCORD_ALLOWED_EMAIL_DOMAINS=example.com
```

### Frontend (Vercel)
```
VITE_API_BASE=https://your-backend.up.railway.app
```

### Indicator Service (Railway)
```
PORT=8001
```

## Deployment

### Services
1. **Backend**: Railway (auto-deploys from GitHub main branch)
2. **Indicator Service**: Railway (auto-deploys from GitHub main branch)
3. **Frontend**: Vercel (auto-deploys from GitHub main branch)
4. **Database**: PostgreSQL on Railway

### Initial Setup

1. **Create PostgreSQL database on Railway**:
   - Add PostgreSQL service to your Railway project
   - Railway will auto-generate `DATABASE_URL` variable

2. **Link database to backend**:
   - In backend service Variables, add: `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
   - Backend will restart automatically

3. **Run migrations**:
   - From local machine: `DATABASE_URL="<production-url>" npx knex migrate:latest`
   - Or use Railway CLI: `railway run npx knex migrate:latest`

### Continuous Deployment
- Push to `main` branch triggers automatic deployment on Railway and Vercel
- Backend and indicator service rebuild and redeploy (~2 minutes)
- Frontend rebuilds and redeploys (~1 minute)

## Database Setup

The app uses PostgreSQL for strategy and snapshot storage. Run migrations:

```bash
cd backend
npx knex migrate:latest
```

**Tables:**
- `active_strategies` - Live trading strategies (user-isolated via `user_id`)
- `active_strategy_snapshots` - Daily performance snapshots
- `position_attribution` - Multi-strategy position ownership tracking
- `strategies` - Saved strategy library (user-isolated via `user_id`)
- `batch_jobs` - Batch backtest jobs (user-isolated via `user_id`)
- `batch_job_runs` - Individual batch test runs
- `variable_lists` - Parameter lists for batch testing (user-isolated via `user_id`)

## API Endpoints

**Backend:**

*Authentication:*
- `GET /auth/discord` - Discord OAuth login
- `GET /auth/discord/callback` - OAuth callback
- `GET /auth/user` - Get current user
- `POST /auth/logout` - Logout

*Account & Trading:*
- `GET /api/account` - Get Alpaca account info
- `GET /api/active-strategies` - Get all active strategies
- `GET /api/active-strategies/:id/snapshots` - Get strategy snapshots
- `POST /api/invest` - Deploy new strategy
- `POST /api/invest/preview` - Preview strategy positions
- `POST /api/strategy/:id/liquidate` - Liquidate specific strategy
- `POST /api/strategy/:id/sync-holdings` - Sync holdings from Alpaca

*Backtesting:*
- `POST /api/backtest/v2` - Run backtest (V2 engine with cached data)
- `POST /api/batch_backtest_strategy` - Start batch backtest
- `GET /api/batch_backtest_strategy/:id` - Get batch status

*Strategy Library:*
- `GET /api/strategies` - List saved strategies
- `POST /api/strategies` - Save strategy
- `PUT /api/strategies/:id` - Update strategy
- `DELETE /api/strategies/:id` - Delete strategy

*Feedback System:*
- `POST /api/feedback` - Submit bug/feature report
- `GET /api/feedback` - View all feedback
- `GET /api/feedback/:id/screenshot` - Get screenshot

**Indicator Service:**
- `POST /indicator` - Calculate indicators
- `POST /metrics/quantstats` - Calculate QuantStats metrics

## Key Features

### Multi-Strategy Support
- Run multiple strategies simultaneously
- Position attribution tracks ownership across strategies
- Each strategy has independent capital allocation
- Shared positions are split proportionally

### Daily Snapshots
- Automatic snapshots at 4:05pm ET (after market close)
- Uses actual fill prices from trades (not re-fetched prices)
- Tracks cumulative returns, daily returns, and holdings
- Snapshot types: `initial`, `daily`, `liquidation`

### Live Trading Schedule
- **T-10 Rebalancing**: 3:50pm ET daily (10 minutes before close)
- **End-of-Day Snapshots**: 4:05pm ET daily (5 minutes after close)
- Market orders executed immediately or queued for market open

### Feedback System
- Bug reports and feature requests
- Screenshot upload capability
- Stored as JSON files in `backend/feedback/`
- All users can view all feedback (collaborative alpha testing)

### Multi-User Isolation
- Each user authenticated via Discord OAuth
- All strategies, variables, batch jobs, and active strategies are isolated by `user_id`
- Users can only view and modify their own data
- Variable names are unique per-user (multiple users can have variables with same names)
- All API endpoints require authentication and filter data by user
