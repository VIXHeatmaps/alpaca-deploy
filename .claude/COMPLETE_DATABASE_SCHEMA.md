# Complete Database Schema - Alpaca Trading Platform

## Overview

This database will store:
- **A. Strategies**: User-created trading strategies (VerticalUI2 elements)
- **B. Active Strategy Results**: Live/paper trading execution results
- **C. Batch Test Results**: Batch backtest jobs and their results
- **D. Users**: User accounts (Discord OAuth)
- **E. Backtest History**: Individual backtest results for comparison
- **F. Variable Lists**: Saved variable definitions for batch testing

---

## Core Tables

### 1. `users`

Stores user accounts from Discord OAuth.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,

  -- Discord OAuth
  discord_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  discriminator VARCHAR(10),
  email VARCHAR(255),
  avatar_url TEXT,

  -- Alpaca API credentials (encrypted)
  alpaca_api_key_encrypted TEXT,
  alpaca_api_secret_encrypted TEXT,

  -- Preferences
  preferences JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);

CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_email ON users(email);
```

---

### 2. `strategies` (A. Strategies)

Stores user-created trading strategies.

```sql
CREATE TABLE strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Strategy metadata
  name VARCHAR(500) NOT NULL,
  description TEXT,

  -- Strategy definition (VerticalUI2 elements array)
  -- Example: [{"type": "ticker", "ticker": "SPY", "weight": "1"}, ...]
  elements JSONB NOT NULL DEFAULT '[]',

  -- Backtest configuration
  benchmark_symbol VARCHAR(50) DEFAULT 'SPY',
  start_date DATE,
  end_date DATE,

  -- Tags/categorization
  tags VARCHAR(255)[],

  -- Sharing/visibility
  is_public BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_strategies_user_id ON strategies(user_id);
CREATE INDEX idx_strategies_created_at ON strategies(created_at DESC);
CREATE INDEX idx_strategies_is_public ON strategies(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_strategies_tags ON strategies USING GIN(tags);
```

---

### 3. `backtest_results` (Individual backtest history)

Stores individual backtest results for a strategy.

```sql
CREATE TABLE backtest_results (
  id SERIAL PRIMARY KEY,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Backtest configuration
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  benchmark_symbol VARCHAR(50),

  -- Strategy snapshot (in case strategy was modified later)
  strategy_elements JSONB NOT NULL,

  -- Results
  metrics JSONB NOT NULL,
  -- Example: {"total_return": 0.45, "sharpe": 1.2, "max_drawdown": -0.15, ...}

  equity_curve JSONB,
  -- Example: [{"date": "2020-01-01", "value": 100000}, ...]

  positions JSONB,
  -- Example: [{"date": "2020-01-01", "ticker": "SPY", "weight": 0.5}, ...]

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backtest_results_user_id ON backtest_results(user_id);
CREATE INDEX idx_backtest_results_strategy_id ON backtest_results(strategy_id);
CREATE INDEX idx_backtest_results_created_at ON backtest_results(created_at DESC);
```

---

### 4. `batch_jobs` (C. Batch Test Results)

Stores batch backtest jobs and their results.

```sql
CREATE TABLE batch_jobs (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,

  -- Job metadata
  name VARCHAR(500) NOT NULL,
  kind VARCHAR(50) NOT NULL DEFAULT 'server',  -- 'server' or 'local'
  status VARCHAR(50) NOT NULL,  -- 'queued', 'running', 'finished', 'failed'

  -- Progress tracking
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- Error tracking
  error TEXT,
  truncated BOOLEAN NOT NULL DEFAULT FALSE,

  -- Variable definitions
  -- Example: [{"name": "ticker", "values": ["SPY", "QQQ"], "count": 2}]
  variables JSONB NOT NULL DEFAULT '[]',

  -- Strategy definition (base strategy before variable substitution)
  strategy_elements JSONB NOT NULL,

  -- Backtest configuration
  start_date DATE,
  end_date DATE,
  benchmark_symbol VARCHAR(50),

  -- Assignment preview (first 25 for UI display)
  assignments_preview JSONB,

  -- Results summary
  -- Example: {
  --   "best": {"vars": {...}, "total_return": 0.5},
  --   "worst": {"vars": {...}, "total_return": -0.1},
  --   "avg_return": 0.2
  -- }
  summary JSONB
);

CREATE INDEX idx_batch_jobs_user_id ON batch_jobs(user_id);
CREATE INDEX idx_batch_jobs_strategy_id ON batch_jobs(strategy_id);
CREATE INDEX idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX idx_batch_jobs_created_at ON batch_jobs(created_at DESC);
```

---

### 5. `batch_job_runs`

Stores individual runs within a batch job (normalized for queryability).

```sql
CREATE TABLE batch_job_runs (
  id SERIAL PRIMARY KEY,
  batch_job_id VARCHAR(255) NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,

  -- Run identification
  run_index INTEGER NOT NULL,

  -- Variable assignments for this run
  -- Example: {"ticker": "SPY", "period": "14"}
  variables JSONB NOT NULL,

  -- Metrics for this run
  -- Example: {"total_return": 0.35, "sharpe": 1.1, ...}
  metrics JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(batch_job_id, run_index)
);

CREATE INDEX idx_batch_job_runs_batch_job_id ON batch_job_runs(batch_job_id);
CREATE INDEX idx_batch_job_runs_metrics ON batch_job_runs USING GIN(metrics);
```

**Why separate runs table?**
- Enables SQL queries like "find all runs where total_return > 0.5"
- Better than storing 10,000 runs in a single JSONB column
- Can add indexes on specific metrics if needed

---

### 6. `active_strategies` (B. Active Strategy Results)

Tracks strategies that are actively trading (live or paper).

```sql
CREATE TABLE active_strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

  -- Execution mode
  mode VARCHAR(50) NOT NULL,  -- 'paper' or 'live'

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'paused', 'stopped'

  -- Capital allocation
  initial_capital DECIMAL(15, 2) NOT NULL,
  current_capital DECIMAL(15, 2),

  -- Timestamps
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stopped_at TIMESTAMP,
  last_rebalance_at TIMESTAMP,

  -- Rebalancing schedule
  rebalance_frequency VARCHAR(50),  -- 'daily', 'weekly', 'monthly'
  rebalance_time TIME,  -- e.g., '15:45:00' for 3:45 PM

  UNIQUE(user_id, strategy_id, mode)
);

CREATE INDEX idx_active_strategies_user_id ON active_strategies(user_id);
CREATE INDEX idx_active_strategies_status ON active_strategies(status);
```

---

### 7. `active_strategy_snapshots`

Stores daily snapshots of active strategy performance.

```sql
CREATE TABLE active_strategy_snapshots (
  id SERIAL PRIMARY KEY,
  active_strategy_id INTEGER NOT NULL REFERENCES active_strategies(id) ON DELETE CASCADE,

  -- Snapshot data
  snapshot_date DATE NOT NULL,
  equity DECIMAL(15, 2) NOT NULL,

  -- Holdings at this snapshot
  -- Example: [{"ticker": "SPY", "shares": 10, "value": 4500}, ...]
  holdings JSONB,

  -- Daily metrics
  daily_return DECIMAL(10, 6),
  cumulative_return DECIMAL(10, 6),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(active_strategy_id, snapshot_date)
);

CREATE INDEX idx_active_strategy_snapshots_active_strategy_id ON active_strategy_snapshots(active_strategy_id);
CREATE INDEX idx_active_strategy_snapshots_date ON active_strategy_snapshots(snapshot_date DESC);
```

---

### 8. `variable_lists` (F. Variable Lists)

Stores saved variable lists for batch testing.

```sql
CREATE TABLE variable_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Variable definition
  name VARCHAR(255) NOT NULL,  -- e.g., "tech_tickers", "rsi_periods"
  type VARCHAR(50) NOT NULL,   -- 'ticker', 'number', 'date'

  -- Values
  -- Example: ["SPY", "QQQ", "AAPL"] or ["10", "14", "20"]
  values JSONB NOT NULL DEFAULT '[]',

  -- Metadata
  description TEXT,
  is_shared BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, name)
);

CREATE INDEX idx_variable_lists_user_id ON variable_lists(user_id);
```

---

### 9. `execution_orders` (Trade execution tracking)

Tracks actual orders placed for active strategies.

```sql
CREATE TABLE execution_orders (
  id SERIAL PRIMARY KEY,
  active_strategy_id INTEGER NOT NULL REFERENCES active_strategies(id) ON DELETE CASCADE,

  -- Alpaca order details
  alpaca_order_id VARCHAR(255) UNIQUE,
  symbol VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL,  -- 'buy' or 'sell'
  quantity DECIMAL(15, 6) NOT NULL,

  -- Order type and status
  order_type VARCHAR(50),  -- 'market', 'limit', etc.
  status VARCHAR(50),  -- 'pending', 'filled', 'cancelled', 'rejected'

  -- Pricing
  limit_price DECIMAL(15, 6),
  filled_price DECIMAL(15, 6),
  filled_quantity DECIMAL(15, 6),

  -- Timestamps
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  filled_at TIMESTAMP,

  -- Error tracking
  error_message TEXT
);

CREATE INDEX idx_execution_orders_active_strategy_id ON execution_orders(active_strategy_id);
CREATE INDEX idx_execution_orders_alpaca_order_id ON execution_orders(alpaca_order_id);
CREATE INDEX idx_execution_orders_submitted_at ON execution_orders(submitted_at DESC);
```

---

## Additional Tables (Future)

### 10. `api_usage_logs`

Track API usage for rate limiting and analytics.

```sql
CREATE TABLE api_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,

  -- Timing
  duration_ms INTEGER,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
```

---

## Database Functions & Triggers

### Auto-update `updated_at` timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batch_jobs_updated_at BEFORE UPDATE ON batch_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variable_lists_updated_at BEFORE UPDATE ON variable_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Migration Order

1. `users` (no dependencies)
2. `strategies` (depends on users)
3. `backtest_results` (depends on users, strategies)
4. `batch_jobs` (depends on users, strategies)
5. `batch_job_runs` (depends on batch_jobs)
6. `active_strategies` (depends on users, strategies)
7. `active_strategy_snapshots` (depends on active_strategies)
8. `variable_lists` (depends on users)
9. `execution_orders` (depends on active_strategies)

---

## Summary

**Tables**: 9 core tables
**Purpose**:
- User management (Discord OAuth)
- Strategy storage and versioning
- Backtest history
- Batch testing with queryable results
- Active strategy tracking (paper/live trading)
- Variable list management
- Trade execution tracking

**Storage Estimate**:
- 1,000 users × 10 strategies = 10K strategies (~1MB)
- 100 batch jobs × 1,000 runs = 100K runs (~50MB)
- 10 active strategies × 365 daily snapshots = 3.6K snapshots (~1MB)
- Total: ~100MB for first year (very manageable)

**Next Steps**:
1. Create Docker Compose file
2. Install Knex.js
3. Generate migrations for all tables
4. Update backend to use database
