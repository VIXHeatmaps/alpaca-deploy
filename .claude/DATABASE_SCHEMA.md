# Database Schema Design

## Batch Jobs Table

### `batch_jobs`

Stores batch backtest job metadata and results.

```sql
CREATE TABLE batch_jobs (
  -- Primary key
  id VARCHAR(255) PRIMARY KEY,

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

  -- URLs for results
  view_url VARCHAR(500),
  csv_url VARCHAR(500),

  -- Variable definitions (JSON)
  -- Example: [{"name": "ticker", "values": ["SPY", "QQQ"], "count": 2}]
  variables JSONB NOT NULL DEFAULT '[]',

  -- Strategy definition (JSON)
  -- Stores the base strategy elements before variable substitution
  strategy JSONB,

  -- Assignment preview (JSON)
  -- First 25 assignments for preview
  assignments_preview JSONB,

  -- Full results (JSON)
  -- Stores all run results: {summary: {...}, runs: [...]}
  results JSONB,

  -- Indexes
  CREATE INDEX idx_batch_jobs_status ON batch_jobs(status);
  CREATE INDEX idx_batch_jobs_created_at ON batch_jobs(created_at DESC);
  CREATE INDEX idx_batch_jobs_kind ON batch_jobs(kind);
);
```

### Why JSONB for complex data?

**Variables, Strategy, Results** are complex nested objects that don't need relational queries. JSONB provides:
- Flexible schema (can evolve without migrations)
- Native JSON support (no serialization needed)
- Indexing support if needed later
- Better than TEXT because PostgreSQL can validate and query JSON

### Alternative: Normalized Schema (Future Enhancement)

If we need to query individual runs, we could add:

```sql
CREATE TABLE batch_job_runs (
  id SERIAL PRIMARY KEY,
  batch_job_id VARCHAR(255) NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
  run_index INTEGER NOT NULL,

  -- Variable assignments for this run (JSON)
  variables JSONB NOT NULL,

  -- Metrics for this run (JSON)
  metrics JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  CREATE INDEX idx_batch_job_runs_job_id ON batch_job_runs(batch_job_id);
  UNIQUE(batch_job_id, run_index)
);
```

But for now, storing runs in the `results` JSONB column is simpler and faster.

---

## Future Tables (Roadmap)

### `users`
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  discord_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `strategies`
```sql
CREATE TABLE strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  description TEXT,

  -- Strategy definition (JSON)
  elements JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  CREATE INDEX idx_strategies_user_id ON strategies(user_id);
);
```

### `backtest_results`
```sql
CREATE TABLE backtest_results (
  id SERIAL PRIMARY KEY,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Backtest configuration
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  benchmark_symbol VARCHAR(50),

  -- Results (JSON)
  metrics JSONB NOT NULL,
  equity_curve JSONB,
  positions JSONB,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  CREATE INDEX idx_backtest_results_user_id ON backtest_results(user_id);
  CREATE INDEX idx_backtest_results_strategy_id ON backtest_results(strategy_id);
  CREATE INDEX idx_backtest_results_created_at ON backtest_results(created_at DESC);
);
```

---

## Technology Stack Options

### Option 1: Raw SQL with `pg` library
**Pros**: Full control, no ORM overhead
**Cons**: Manual query building, no migrations

### Option 2: Prisma ORM
**Pros**: Type-safe, auto-migrations, great DX
**Cons**: Learning curve, adds complexity

### Option 3: Knex.js (Query Builder)
**Pros**: SQL-like syntax, migration support, lighter than Prisma
**Cons**: Not type-safe

### Recommendation: **Knex.js**
- Good balance of power and simplicity
- Built-in migration system
- Works great with TypeScript
- Widely used, stable

---

## Migration Strategy

1. **Install dependencies**: `pg`, `knex`
2. **Create knexfile.ts**: Database configuration
3. **Create first migration**: `batch_jobs` table
4. **Update backend**: Replace `Map` with database queries
5. **Test**: Batch jobs survive backend restarts

---

## Local Development Setup

### Using Docker (Recommended)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: alpaca
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: alpaca_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Manual Setup (macOS)

```bash
# Install PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb alpaca_dev
```

---

## Environment Variables

```bash
# .env
DATABASE_URL=postgresql://alpaca:dev_password@localhost:5432/alpaca_dev
REDIS_URL=redis://localhost:6379
```

---

## Next Steps

1. Choose technology stack (Knex.js recommended)
2. Set up PostgreSQL locally
3. Create database migration for `batch_jobs` table
4. Update backend to use database instead of Map
5. Test batch jobs persist across restarts
