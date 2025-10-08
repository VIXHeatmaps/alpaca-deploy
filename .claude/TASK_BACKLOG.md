# Project Task Backlog

## Overview
This document maintains a comprehensive list of tasks, features, and improvements for the Alpaca Deploy project. Tasks are organized by category and include detailed breakdowns, questions for clarification, and implementation notes.

---

## 1. Dashboard - Multi-Strategy Performance Tracking

### Current State
- Dashboard displays account info, attempts to track active strategy (but fails)
- Shows 0 every day (equity/returns not tracking)
- Snapshots stored in `backend/data/snapshots/{strategyId}.json`
- Currently designed for single strategy, needs multi-strategy support

### Requirements (CRITICAL)
- [ ] **Support multiple distinct active strategies** running simultaneously
  - Each strategy has its own flow, rebalance schedule, equity allocation
  - E.g., "SPY Momentum" + "Bond Rotation" + "Sector Rotation" all live
- [ ] **Display holdings per strategy** (virtual division of real portfolio)
  - Show Strategy 1 holdings: [AAPL: 10 shares, MSFT: 5 shares]
  - Show Strategy 2 holdings: [TLT: 20 shares, GLD: 15 shares]
  - Show AGGREGATE holdings: Total portfolio position summary
- [ ] **Equity curve chart** for entire portfolio
- [ ] **Real-time updates** (live tracking)
- [ ] **Performance metrics** per strategy and aggregate
- [ ] **Export performance data** (CSV/Excel)

### Implementation Notes
- Strategy holdings are "virtual divisions" - all positions actually held in one Alpaca account
- Need to track which positions belong to which strategy (metadata tracking)
- Aggregate view sums all positions across strategies
- Each strategy tracks its own P&L independently

### Deferred Details
- Specific dashboard UI/UX design (to be discussed later)
- Error handling for failed tracking

---

## 2. Save Strategies in Database

### Current State
- Strategies stored as JSON in `backend/data/activeStrategy.json`
- No versioning, no multi-user support
- Lost if file corrupted or server restart without volume

### Implementation Plan

**Database Schema (PostgreSQL):**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  discord_id VARCHAR(255) UNIQUE NOT NULL,
  discord_username VARCHAR(255),
  discord_email VARCHAR(255),
  alpaca_api_key_encrypted TEXT,  -- For future
  alpaca_api_secret_encrypted TEXT,  -- For future
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  flow_data JSONB NOT NULL,  -- Complete flow structure
  globals JSONB,  -- Global settings (rebalance, equity, etc)
  is_active BOOLEAN DEFAULT false,
  invest_amount NUMERIC(12, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deployed_at TIMESTAMP,  -- When set to active
  UNIQUE(user_id, is_active)  -- Only one active per user
);

CREATE INDEX idx_strategies_user_active ON strategies(user_id, is_active);

CREATE TABLE strategy_snapshots (
  id SERIAL PRIMARY KEY,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  portfolio_value NUMERIC(12, 2),
  holdings JSONB,  -- Array of {symbol, qty, price, value}
  total_return NUMERIC(12, 4),
  total_return_pct NUMERIC(8, 4),
  rebalance_type VARCHAR(50),  -- 'initial', 'daily', 'liquidation'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(strategy_id, snapshot_date)
);

CREATE INDEX idx_snapshots_strategy_date ON strategy_snapshots(strategy_id, snapshot_date);
```

### Migration Steps
1. [ ] Set up PostgreSQL on Railway
2. [ ] Create migration scripts
3. [ ] Implement ORM/query layer (use `pg` or Prisma)
4. [ ] Migrate existing JSON data to DB
5. [ ] Update API endpoints to use DB
6. [ ] Add user_id association (tie to Discord OAuth)
7. [ ] Test multi-user isolation
8. [ ] Deploy with rollback plan

### Clarifications
- **Multi-strategy:** Users will have 100+ active strategies (QuantMage scale) + thousands saved
- **Scale expectation:** Each user might run 10-100+ strategies simultaneously
- Database must handle millions of strategies and batch results
- User model: Discord ID for now, Alpaca keys later
- Strategy versioning: Just current version for now
- Sharing: Yes, export to JSON (already partially implemented)
- Soft delete: Not critical yet

---

## 3. UI and CSS Improvements

### Current State
- Clean, minimal UI with TailwindCSS 4
- 3-tier navigation: Dashboard | Library (Strategies/Variables/Batch Tests) | Builder
- Variables tab redesigned with minimal style (Jan 2025)
- Builder now uses full browser width (Jan 2025)

### Recent Completions (Jan 2025)
- [✓] **Variables tab redesign** - Clean, minimal style with improved UX
- [✓] **Batch Tests simplification** - Removed "In Progress"/"Complete" tabs, unified list
- [✓] **Navigation restructure** - 3 top-level tabs with clear hierarchy
- [✓] **Tab styling** - Centered top-level tabs, minimal subtabs
- [✓] **Builder width** - Removed max-width constraint to use full browser space
- [✓] **Authentication separation** - Discord only gates live trading, not backtesting

### Improvement Areas

**Need Clarification - Which areas need most work?**

#### A. Dashboard UI
- [ ] Better layout/spacing
- [ ] Responsive design (mobile/tablet)
- [ ] Loading states/skeletons
- [ ] Error states (clear messages)
- [ ] Empty states (no strategies yet)
- [X] Chart visualizations (equity curve, allocation pie chart)
- [X] Dark mode?

#### B. Strategy Builder (VerticalUI2)
- [ ] **FIX: Logic blocks don't stack and align correctly** (CRITICAL UI issue)
  - Details to be discussed later
- [ ] Node styling (clearer gate/portfolio/ticker nodes)
- [ ] Better flow layout (auto-arrange?)
- [ ] Zoom/pan controls
- [ ] Node validation indicators (red border if invalid)
- [ ] Drag-and-drop improvements
- [ ] Mini-map for large strategies
- [✓] Undo/redo buttons (already implemented)
- [✓] Copy/paste nodes (already implemented)
- [✓] Builder uses full browser width (Jan 2025)
- [ ] **Copy/paste across strategy tabs** (should work seamlessly)
- [ ] Generate a FLOW-CHART version of the strategy

#### C. Batch Tests UI (PARTIALLY COMPLETE)
- [✓] **Unified job list** - Removed "In Progress"/"Complete" tabs (Jan 2025)
- [✓] **In-progress jobs at top** - Auto-sorted by status then date (Jan 2025)
- [ ] Progress bar with estimated time remaining
- [ ] Cancel button
- [ ] Pause button
- [ ] Results table: sortable columns
- [ ] Filters (min/max return, Sharpe, etc)
- [ ] Export results (CSV, charts)
- [ ] Compare multiple batch results
- [X] Heatmap visualization (2D parameter sweep) <-- Yes and I already built a tool that does this separately>

#### D. General Polish
- [ ] Consistent color palette
- [ ] Better typography
- [ ] Icons (lucide-react already installed)
- [ ] Tooltips/help text
- [ ] Keyboard shortcuts
- [ ] Animations (framer-motion already installed)
- [ ] Toast notifications for success/error

### Requirements
1. **Logic blocks alignment issue** - CRITICAL bug to fix (details later)
2. **Mobile support** - Yes, needed
3. **Design approach** - Clean/minimal AND feature-rich (not mutually exclusive)
4. **Color scheme** - More color, customization options, dark mode support 

---

## 4. Simplify Tabs (MOSTLY COMPLETE - Jan 2025)

### Current State (Updated Jan 2025)
- [✓] **3-tier navigation implemented:** Dashboard | Library | Builder
- [✓] **Library subtabs:** Strategies (placeholder) | Variables | Batch Tests
- [✓] **Builder:** Shows strategy editor with open strategy tabs (KMLM ×, Vix Pop ×, etc.)
- [✓] **Batch Tests:** Single unified list (removed "In Progress"/"Complete" tabs)
- [✓] **Tab hierarchy:** Centered top-level tabs, minimal subtabs
- [✓] **Full-width Builder:** Removed max-width constraints

### Remaining Work
**Target Structure (Original Goal):**
```
Dashboard | Variables | Batch Tests | Strategy 1 | Strategy 2 | Strategy 3 | +
```

**What's Different from Current Implementation:**
- [ ] **Variables as top-level tab** (currently in Library subtab)
- [ ] **Batch Tests as top-level tab** (currently in Library subtab)
- [ ] **Strategy tabs at top level** (currently nested in Builder)
- [ ] **"+" button** for new strategy tab (not implemented)

**Current Implementation Works Because:**
- Only one level of nesting (top-level → subtabs)
- Clear visual hierarchy (centered/large top vs minimal subtabs)
- Builder uses full width when active
- May not need to flatten further unless vertical space becomes critical

### Constraints
- **Vertical space is premium** - Only ONE level of nested tabs acceptable
- **Dashboard and Builder separate** - Confirmed requirement ✓
- No persistent sidebar (rejected)
- No breadcrumb navigation (not applicable)
- No quick-switch dropdown (not needed)

---

## 5. Add More Logic Types

### Current State
- **Gate nodes:** Conditional if-then-else (compare indicators)
- **Portfolio nodes:** Hold weighted tickers
- **Weight nodes:** (Not explicitly mentioned - do these exist?)

### Requested Logic Types

#### A. SCALE Logic (Mixed/Scaled - CRITICAL)

**Confirmed Behavior:** Linear interpolation between strategies based on indicator value

**Example Use Case:**
```
Indicator: RSI(SPY, 10d)
Range: 75 → 85

When RSI = 75: 100% [LONG EQUITY STRATEGY], 0% UVXY
When RSI = 80: 50% [LONG EQUITY STRATEGY], 50% UVXY
When RSI = 85: 0% [LONG EQUITY STRATEGY], 100% UVXY
```

**Implementation Notes:**
- Linear interpolation across indicator range
- Scales allocation between TWO child strategies/portfolios
- As indicator moves from min→max, allocation shifts from child A→B
- Can be chained/nested with other logic types

**Potential Node Structure:**
```typescript
{
  type: "scale",
  indicator: { symbol: "SPY", type: "RSI", params: { timeperiod: 10 } },
  range: { min: 75, max: 85 },
  children: [
    { id: "child-a", strategy: {...} },  // 100% at min
    { id: "child-b", strategy: {...} }   // 100% at max
  ]
}
```

**Questions for Later:**
- Can scale across MORE than 2 children? (3-way, 4-way scale)
- Multiple indicators? (weighted average of RSI + VIX)
- Non-linear interpolation? (exponential, logarithmic)

#### B. SORT Logic (Sorter/Filter - CRITICAL)

**Confirmed Behavior:**
- User selects ticker pool (any size)
- Define sorting criteria (by indicator value)
- Pick top N tickers
- Sorted every time strategy runs/rebalances

**Example Use Case:**
```
Ticker pool: [AAPL, MSFT, GOOGL, AMZN, NVDA, TSLA, META, NFLX]
Sort by: RSI (descending)
Filter: RSI > 50
Take: Top 3
Result: Hold top 3 highest-RSI tickers above 50
```

**Potential Node Structure:**
```typescript
{
  type: "sort",
  tickerPool: ["AAPL", "MSFT", "GOOGL", ...],  // User-defined
  filters: [  // Optional pre-filtering
    { indicator: "RSI", operator: "gt", value: 50 }
  ],
  sortBy: { indicator: "RSI", order: "desc" },
  take: 3,  // Top N tickers
  allocation: "equal" | "weighted"  // Equal or proportional to rank
}
```

**Questions for Later:**
- Should FILTER be separate node from SORT, or combined?
- Where to define ticker pool? (in node vs global pool vs separate node type)
- After sorting, can tickers go to another logic node (gate, scale)?
- Composite sorting (sort by RSI, then by Volume as tiebreaker)?

#### C. Other Logic Types (Lower Priority)
- [ ] **Ranking systems:** Composite scores from multiple indicators (interesting, consider later)
- [ ] **Rebalance triggers:** Drift-based rebalancing (future - not important now)
- [ ] **Stop loss/Take profit:** Enter/exit logic (might add eventually, not now)
- [ ] **Mean reversion:** Already inherent in strategies
- [ ] **Trailing stops:** See above
- [ ] **Sector rotation:** Already possible with existing editor
- [ ] **Volatility targeting:** Not needed

### Priority Order (CONFIRMED)
1. **SCALE logic** - First priority
2. **SORT logic** - Second priority
3. Other logic types - Future consideration

### Deferred Questions
- UI representation in flow builder (discuss later)
- Multi-way scale (3+, children)
- Composite sorting
- Filter as separate node vs combined with SORT

---

## 6. Save Batch Tests to Database

### Current State
- Batch jobs stored in-memory Map (`batchJobs`)
- Lost on server restart
- Results not persisted
- Can't resume partial batches

### Database Schema

```sql
CREATE TABLE batch_jobs (
  id UUID PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(255),
  status VARCHAR(50) NOT NULL,  -- 'queued', 'running', 'finished', 'failed', 'cancelled'
  total INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  variables JSONB,  -- Array of {name, values}
  assignments JSONB,  -- Full assignment list if truncated
  truncated BOOLEAN DEFAULT false,
  flow JSONB NOT NULL,  -- Complete flow + globals + API keys
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error TEXT,
  CONSTRAINT valid_status CHECK (status IN ('queued', 'running', 'finished', 'failed', 'cancelled'))
);

CREATE INDEX idx_batch_jobs_user_status ON batch_jobs(user_id, status);
CREATE INDEX idx_batch_jobs_created ON batch_jobs(created_at DESC);

CREATE TABLE batch_results (
  id SERIAL PRIMARY KEY,
  batch_job_id UUID REFERENCES batch_jobs(id) ON DELETE CASCADE,
  run_index INTEGER NOT NULL,  -- 0 to N-1
  variables JSONB NOT NULL,  -- {period: "14", threshold: "50"}
  metrics JSONB NOT NULL,  -- {totalReturn: 0.45, sharpe: 1.2, ...}
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(batch_job_id, run_index)
);

CREATE INDEX idx_batch_results_job ON batch_results(batch_job_id);
CREATE INDEX idx_batch_results_metrics ON batch_results USING GIN (metrics);  -- For JSON queries
```

### Migration Steps
1. [ ] Add tables to schema
2. [ ] Update batch job creation to save to DB
3. [ ] Add checkpointing (save progress every N results)
4. [ ] Implement resume logic (check DB for incomplete jobs on restart)
5. [ ] Update GET endpoint to query DB
6. [ ] Add pagination for large result sets
7. [ ] Implement CSV export from DB (not in-memory)
8. [ ] Clean up old jobs (archive after 30 days?)

### Features Enabled by DB Persistence
- [ ] Resume incomplete batches after crash/restart
- [ ] View historical batch results
- [ ] Compare multiple batch runs
- [ ] Share batch results (URL with job ID)
- [ ] Analytics: most common parameter ranges, success rates
- [ ] Job queue priority (user-specified)

### Scale Considerations (CRITICAL)
- **Expected volume:** 1.5 million batch runs per month (per user at scale)
- **Storage implications:** Millions of batch results = large database
- **Retention policy:** TBD (30/60/90 days? Archive strategy?)
- **Compression:** May need to compress metrics JSON for large batches
- **Pagination:** Must paginate results (can't load 200k rows at once)
- **Job cancellation:** Yes, users should be able to cancel running jobs

### Questions Deferred
- Exact retention policy
- Compression strategy
- API keys storage location

---

## 7. Batch Test Performance Optimizations

### Already Documented
See detailed plans in:
- [PERFORMANCE_ANALYSIS.md](.claude/PERFORMANCE_ANALYSIS.md)
- [STRATEGY_COMPLEXITY_ANALYSIS.md](.claude/STRATEGY_COMPLEXITY_ANALYSIS.md)

### Summary of Phases

**Phase 1: Parallel Processing + Caching (1-2 days)**
- Implement concurrent batch execution (20-50 parallel)
- Add in-memory price data cache
- Add rate limiter for Alpaca API
- Impact: 14k combos in ~70 minutes (vs 19 hours)

**Phase 2: Worker Queue Architecture (1 week)**
- PostgreSQL job queue
- Multiple worker processes (5-10)
- Distributed processing
- Impact: 200k combos in ~3 hours (vs impossible)

**Phase 3: Advanced Optimizations (optional)**
- Redis distributed cache
- Batch indicator calculations
- Horizontal worker scaling
- Impact: 200k combos in ~1.4 hours

### Checklist
- [ ] **CRITICAL:** Implement rate limiter (before Phase 1)
- [ ] Phase 1: Parallel execution
- [ ] Phase 1: Price data caching
- [ ] Test with real batch (100-600 combos)
- [ ] Phase 2: Set up PostgreSQL
- [ ] Phase 2: Implement job queue (pg-boss or BullMQ)
- [ ] Phase 2: Deploy worker processes
- [ ] Phase 2: Monitor and tune concurrency
- [ ] Phase 3: Redis cache (if needed)
- [ ] Phase 3: Scale workers (if needed)

---

## 8. Additional Suggestions

### A. Authentication & Security
- [ ] **API Key Storage:** Encrypt and store user Alpaca keys in DB (per roadmap - later)
- [ ] **Session management:** Add "remember me" or extend JWT expiration
- [ ] **Audit logging:** Track who deployed/modified strategies
- [ ] **Role-based access:** Admin vs regular user permissions
- [ ] **Rate limiting:** Prevent abuse (limit batch jobs per user/day)
  - NOTE: Not important during testing phase when not overloading API

### B. Strategy Management
- [ ] **Cloning:** Copy/paste should work across strategy tabs (CRITICAL for workflow)
- [ ] **Validation:** Comprehensive pre-deploy checks (already in progress)
- [ ] **Versioning:** Robust version history (already built)
- [ ] **Templates/Examples:** Not important yet
- [ ] **Dry run:** Not needed
- [ ] **Scheduling:** Additional trade windows later (not priority - all T-10 close for now) 

### C. Backtesting Enhancements
- [ ] **Correlation analysis:** Correlation matrix (HIGH PRIORITY - want this feature)
- [ ] **Transaction costs:** Add slippage (bps) to backtest modeling (yes, needed)
- [ ] **Monte Carlo simulation:** Advanced backtest/overfitting measurements (future project)
- [ ] **Benchmark comparison:** Flexible benchmarks (any ticker OR any strategy - not just SPY)
- [ ] **Risk metrics:** Using Alpaca/QuantStats metrics (already covered)
- [ ] **Walk-forward analysis:** Rolling window backtests (not clear on this yet)

### D. Monitoring & Alerts
- [ ] **Health checks:** Monitor if strategy is executing properly (YES - priority)
- [ ] **Logs viewer:** See rebalance history, order fills, errors (yes - needed)
- [ ] **Email/Discord notifications:** Strategy deployed, rebalance executed, errors (yes for users)
- [ ] **Performance alerts:** Drawdown exceeds X%, returns below benchmark (not priority)

### E. Data & Analytics
- [ ] **Attribution analysis:** Which positions contributed most to returns (YES - want this)
- [ ] **Indicator charts:** Visualize indicator values over time (YES - want this)
- [ ] **Holdings history:** Track position changes over time (OK)
- [ ] **Trade history:** View all executed trades (OK)
- [ ] **Correlation heatmap:** Ticker correlations (eventually)
- [ ] **LONGER BACKTEST DATA:** Beyond Alpaca's 10-year limit
  - Possibly download Polygon flat data pack for historical backtests
  - Future project 

### F. Integration & Export
- [ ] **Import strategies:** Load from Composer/QuantMage format (YES - ideally want this)
- [✓] **Export strategies:** JSON format for sharing/backup (partially implemented)
- [ ] **API endpoints:** Not yet
- [ ] **Webhooks:** Not now
- [ ] **Data export:** TBD (GDPR compliance)

### G. Developer Experience
- [ ] **Documentation:** API docs, strategy builder guide
- [ ] **Error handling:** Better error messages, logging
- [ ] **Testing:** Unit tests, integration tests, E2E tests
- [ ] **CI/CD:** Automated testing and deployment
- [ ] **Monitoring:** Application performance monitoring (APM)
- [ ] **Feature flags:** Enable/disable features without deployment

### H. Infrastructure
- [ ] **Database backups:** Automated daily backups
- [ ] **Disaster recovery:** Restore from backup plan
- [ ] **Scaling:** Auto-scale workers based on queue depth
- [ ] **CDN:** Serve frontend assets faster
- [ ] **Caching layers:** Redis for session/data caching
- [ ] **Logging:** Centralized logging (Datadog, LogRocket, etc.)

---

## Questions for Overall Prioritization

### Timeline
1. **Target for first external users:** No specific timeline
2. **Current blockers:**
   - Active strategies not hooked up to Alpaca trading in VerticalUI2
   - (Used to work in old Flow UI)
   - Need SCALE and SORT logic to match pro platforms
   - Need to verify flow logic matches Composer/QuantMage patterns
3. **Demo features to impress:** Live trading strategy WITH variables (details later)

### Use Cases
1. **Primary use case:** Advanced backtesting leading to REAL MONEY trading strategies
2. **Typical workflow:** Build → backtest → optimize → deploy (yes, standard)
3. **Biggest pain point:** Gaps between current app and platforms we're emulating
   - (Though we have some non-redundant advantages)

### Scale Expectations (CRITICAL CONTEXT)
1. **User count:** Unknown (monetization not worked out yet)
2. **Strategies per user at scale:**
   - You personally: 100+ LIVE strategies at QuantMage, thousands saved
   - Expected per user: 10-100+ active strategies
3. **Batch test volume:**
   - Your usage: ~1.5 million runs per month at Exahub
   - This is the scale we need to support

### Technical Context
1. **Development bandwidth:** Full-time (as of now)
2. **Budget for infrastructure:** More than $200/month (sufficient for scale)
3. **Tech stack:** Current stack OK (Node/React/Python), open to changes with good reason

---

## CONFIRMED PRIORITIZATION

### 🔴 **CRITICAL (Do First - Blockers for Real Use)**

#### 1. Multi-Strategy Dashboard
- Track multiple distinct active strategies simultaneously
- Show per-strategy holdings + aggregate portfolio holdings
- Live tracking of strategy performance
- Equity curve for entire portfolio
- **Blocking:** Can't test with real users without this

#### 2. Database Migration
- PostgreSQL for strategies and batch tests
- Must support 100+ strategies per user, millions of batch results
- Enable multi-user isolation
- Persist batch jobs across restarts
- **Blocking:** Current JSON storage won't scale

#### 3. Strategy Builder UI Fixes
- Fix logic blocks stacking/alignment issue (CRITICAL bug)
- Simplify to single tab bar (vertical space premium)
- Tab structure: Dashboard | Variables | Batch Tests | Strategy 1 | Strategy 2 | +
- Each strategy tab is full builder
- Copy/paste across tabs
- **Blocking:** Unusable for complex strategies without fixes

#### 4. Additional Logic Types
- **SCALE logic** (Priority 1): Linear interpolation between strategies based on indicator
- **SORT logic** (Priority 2): Rank/filter tickers from pool, take top N
- **Blocking:** Need to match existing platforms (Composer, QuantMage)

---

### 🟠 **HIGH (After Critical Items)**

#### 5. Batch Test Performance - Phase 1
- Parallel processing (20-50 concurrent)
- Price data caching
- Impact: 14k combos in ~70 minutes (vs 19 hours)
- **Note:** Rate limiter NOT priority during testing (not overloading API yet)

#### 6. Batch Test Results UI
- Single unified job list (remove "In Progress"/"Completed" tabs)
- Sortable columns, filters
- Progress bar with ETA
- Cancel/pause buttons
- Export CSV

---

### 🟡 **MEDIUM (1-2 Months)**

#### 7. Batch Test Performance - Phase 2
- Worker queue architecture (PostgreSQL + pg-boss/BullMQ)
- Multiple worker processes (5-10)
- Impact: 200k combos in ~3 hours
- **Required for:** 1.5M runs/month scale

#### 8. API Key Storage
- Encrypt Alpaca keys in database
- Tie to user accounts
- Remove need for manual entry each session

#### 9. Analytics & Monitoring
- Correlation matrix (HIGH want)
- Attribution analysis (which positions contributed to returns)
- Indicator charts over time
- Health checks for strategy execution
- Logs viewer (rebalance history, order fills, errors)

---

### 🟢 **LOW (Nice to Have / Future)**

#### 10. Advanced Features
- Import from Composer/QuantMage format
- Walk-forward analysis
- Monte Carlo simulation
- Longer backtest data (Polygon integration for >10 years)
- Email/Discord notifications
- Templates and examples

---

---

## Summary: Key Clarifications

### Architecture
- **Multi-strategy at scale:** 100+ live strategies per user, thousands saved
- **Virtual holdings:** Each strategy tracks its own positions within single Alpaca account
- **Batch volume:** 1.5M runs/month expected at scale
- **Database:** PostgreSQL must handle millions of strategies + batch results

### Navigation
- **Single tab bar** (vertical space premium)
- **Each strategy = separate tab** with full builder
- **Variables = global library** available to all strategies
- **No nested tabs** (current In Progress/Completed subtabs → unified list)

### Logic Types
- **SCALE:** Linear interpolation between 2 strategies based on indicator range
- **SORT:** User-defined ticker pool → filter → sort → take top N
- **Priority:** SCALE first, then SORT

### Current Blockers
1. Dashboard not tracking active strategies
2. Strategy builder alignment bugs
3. Missing SCALE and SORT logic (needed to match existing platforms)
4. Active strategies not connected to Alpaca trading in VerticalUI2

---

## Next Steps

**Document updated with all clarifications. Ready to create detailed implementation plans.**

Which critical item should we start with first?
1. Multi-strategy dashboard
2. Database migration
3. Strategy builder UI fixes
4. SCALE logic implementation
5. SORT logic implementation

Or would you like me to plan out ALL critical items before starting implementation?
