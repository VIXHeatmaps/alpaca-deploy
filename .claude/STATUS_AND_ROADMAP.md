# System Status & Roadmap
*Generated: 2025-10-10*

---

## 1. CURRENT SYSTEM STATUS

### Deployment Architecture
- **Railway (Backend):** alpaca-deploy service (Pro plan, 32GB RAM available)
- **Railway (Services):** happy-achievement (indicator service), PostgreSQL, Redis
- **Vercel:** Frontend React app
- **Environment:** Production, Paper Trading credentials configured

### Performance Metrics
- **Batch Concurrency:** 16x (optimized after testing 4x/16x/32x/64x)
- **Backtest Speed:** 8.6 backtests/second
- **200k Batch Estimate:** ~6.5 hours
- **Memory Usage:** ~475MB peak at 16x concurrency
- **CPU Usage:** <1.0 vCPU (not CPU-bound)
- **Cache Hit Rate:** 98%+ (Redis working excellently)

### Active Features
- ✅ V2 Backtest Engine (4-phase: Request → Price → Indicator → Simulation)
- ✅ Redis Caching (permanent for T-2+ data, purges at 4pm/8pm ET)
- ✅ Chunked Parallelization (16 concurrent backtests)
- ✅ Batch Backtesting (tested up to 260, ready for 200k+)
- ✅ Active Strategy Trading (T-10 rebalancing at 3:50pm ET daily)
- ✅ Fill Checker (monitors pending orders every 5 minutes)
- ✅ Daily Snapshots (captures performance at 4:05pm ET)
- ✅ Reduced Logging (avoids Railway 500 logs/sec limit)
- ✅ Summary Trade Logs (clear markers for monitoring)

### Recent Optimizations
1. Removed verbose batch worker logs (per-backtest details)
2. Removed gate execution logs for batch runs (debug flag)
3. Added milestone logging (every 100 backtests)
4. Added trade window summary logs ([TRADE WINDOW START/END])
5. Optimized concurrency (16x proven optimal through testing)

### Known Limitations
- Railway log retention limited (older logs get truncated)
- Single-user credentials (multi-user requires per-user encrypted credentials)
- No job queue system yet (needed for multi-user)
- Backtest speed limited by I/O bottlenecks (see optimization plans below)

### Infrastructure Costs
- Railway Pro: ~$20/month
- Vercel: Free tier (frontend only)

---

## 2. PERFORMANCE OPTIMIZATION ROADMAP

### Current Bottleneck Analysis

At 16x concurrency with 8.6 backtests/sec, we're **I/O bound**, not CPU bound. The bottlenecks are:
1. **Indicator Service HTTP calls** (network latency)
2. **Redis round-trips** (even with 98% hit rate)
3. **Database writes** (each backtest saves to Postgres)
4. **Memory allocation per simulation** (creating indicator maps, position arrays)

### Optimization Options (Ranked by Impact)

#### **Option 1: Batch Database Writes (HIGH IMPACT, MEDIUM EFFORT)**
**Current:** Each backtest writes to DB individually (260 writes)
**Proposed:** Batch 50-100 inserts at once

**Implementation:**
- Accumulate backtest results in memory
- Insert in batches using `INSERT INTO ... VALUES (...), (...), (...)`
- Only wait for DB on batch completion

**Expected Gain:** +20-30% speed (10-11 backtests/sec)
**Time to Implement:** 2-4 hours
**Risk:** Low (existing transactions already handle failures)

---

#### **Option 2: Embed Indicator Service (HIGH IMPACT, HIGH EFFORT)**
**Current:** Indicator computation happens in separate Python service via HTTP
**Proposed:** Import indicator computation into Node.js directly

**Implementation:**
- Use `technicalindicators` npm package (JavaScript TA-Lib equivalent)
- Compute indicators in-process (no network calls)
- Keep Python service for complex indicators if needed

**Expected Gain:** +40-60% speed (12-14 backtests/sec, ~4 hours for 200k)
**Time to Implement:** 1-2 days
**Risk:** Medium (need to verify indicator calculations match Python exactly)

---

#### **Option 3: Pre-compute Common Indicators (MEDIUM IMPACT, LOW EFFORT)**
**Current:** Cache indicators on-demand as backtests request them
**Proposed:** Pre-compute indicators for common tickers during off-hours

**Implementation:**
- Nightly job computes RSI, SMA, EMA, STOCH for top 200 tickers
- Store in Redis with long TTL
- Backtests get instant cache hits

**Expected Gain:** +10-15% speed (9-10 backtests/sec)
**Time to Implement:** 4-8 hours
**Risk:** Low (just adds warmup job)

---

#### **Option 4: Redis Pipelining (MEDIUM IMPACT, LOW EFFORT)**
**Current:** Individual Redis MGET calls per indicator fetch
**Proposed:** Pipeline multiple Redis operations into single round-trip

**Implementation:**
- Use Redis pipeline API to batch multiple gets
- Reduces network round-trips from N to 1

**Expected Gain:** +15-20% speed (10-11 backtests/sec)
**Time to Implement:** 2-4 hours
**Risk:** Low (Redis supports pipelining natively)

---

#### **Option 5: Horizontal Scaling with Worker Services (VERY HIGH IMPACT, HIGH EFFORT)**
**Current:** Single Railway service processes all batches
**Proposed:** Multiple worker services process jobs from queue

**Implementation:**
- Main API service accepts batch jobs, adds to Redis queue
- 2-4 worker services pull jobs and process independently
- Each worker runs 16x concurrency = 32-64x total

**Expected Gain:** +200-400% speed (linear scaling, 2-3 hours for 200k)
**Time to Implement:** 2-3 days
**Risk:** Medium (requires job queue, worker orchestration)
**Cost:** +$20-40/month per worker

---

### Recommended Phased Approach

**Phase 1 (Quick Wins - 1 week):**
1. Batch database writes (+20-30%)
2. Redis pipelining (+15-20%)
3. Pre-compute common indicators (+10-15%)

**Combined Expected:** ~14-16 backtests/sec = **3.5-4 hours for 200k**

**Phase 2 (Major Refactor - 2-3 weeks):**
4. Embed indicator service (+40-60% on top of Phase 1)

**Combined Expected:** ~20-24 backtests/sec = **2-2.5 hours for 200k**

**Phase 3 (Horizontal Scaling - when multi-user ready):**
5. Worker services (2-4x multiplier)

**Combined Expected:** ~40-96 backtests/sec = **35 minutes - 1.5 hours for 200k**

---

## 3. POLYGON HISTORICAL DATA INTEGRATION

### Current State
- **Alpaca Data:** Limited to 2016+ for most tickers
- **User Need:** Backtest strategies from earlier dates (2000s, 1990s, etc.)
- **Solution:** Polygon historical data (downloadable bulk files)

### Architecture: Separate Data Source Toggle (RECOMMENDED)

**UI:** Dropdown in backtest settings: "Data Source: [Alpaca | Polygon]"

**Advantages:**
- Clean separation (no stitching complexity)
- User controls which dataset for each backtest
- Can compare same strategy on different data sources
- No data consistency issues

**Implementation:**
```typescript
interface BacktestRequest {
  dataSource: 'alpaca' | 'polygon';
  startDate: string;
  endDate: string;
  // ...
}
```

**Data Flow:**
1. User selects "Polygon" + date range (e.g., 2005-2010)
2. Backend checks if Polygon data exists in DB/cache
3. If not: Load from Polygon CSV files, store in separate cache namespace
4. Run backtest with Polygon data
5. Results labeled "Data Source: Polygon"

**Storage:**
- Store Polygon data in separate Redis namespace: `polygon:TICKER:YYYY-MM-DD`
- Or separate Postgres table: `polygon_price_data`
- Keep Alpaca and Polygon completely isolated

---

### Why NOT Auto-Stitching

**Concept:** Automatically use Polygon for pre-2016, Alpaca for 2016+

**Problems:**
- Data inconsistencies at stitch point (different sources = different prices)
- Confusing for users (which data did backtest actually use?)
- Hard to debug issues
- Violates principle of data transparency

---

### Implementation Steps

**Step 1: Polygon Data Ingestion**
- Download Polygon historical CSV files (one-time or periodic)
- Parse and load into database or Redis
- Index by ticker + date for fast lookup

**Step 2: Extend DataFetcher**
```typescript
async function fetchPriceData(
  tickers: string[],
  startDate: string,
  endDate: string,
  dataSource: 'alpaca' | 'polygon'
): Promise<PriceData> {
  if (dataSource === 'polygon') {
    return fetchPolygonData(tickers, startDate, endDate);
  }
  return fetchAlpacaData(tickers, startDate, endDate);
}
```

**Step 3: UI Updates**
- Add data source selector to backtest form
- Show data source in backtest results
- Disable invalid date ranges (e.g., Alpaca before 2016 warns user)

**Step 4: Cache Strategy**
- Polygon data is static (never changes), cache permanently
- Separate Redis namespace prevents conflicts
- Consider pre-loading common tickers

---

### Considerations

**Data Quality:**
- Polygon data might have different bar timestamps than Alpaca
- Adjust/close prices may differ (splits, dividends handled differently)
- Test strategies on both sources to verify consistency

**Storage:**
- Polygon historical data for 200 tickers × 20 years = ~50-100GB
- Store in Postgres or S3, not Redis
- Cache recently-used data in Redis for speed

**Cost:**
- Polygon API access if downloading programmatically
- Or one-time CSV purchase/download
- Storage costs (minimal on Railway)

---

## 4. QUANTSTATS INTEGRATION PLAN

### Current State

**What Exists:**
- `fetchQuantStatsMetrics()` function in [index.ts:2393](backend/src/index.ts:2393)
- Calls Python indicator service at `/metrics/quantstats` endpoint
- Used in **legacy backtest engine only**
- Returns metrics: Sharpe, Sortino, Calmar, Omega, etc.
- **NOT used in V2 engine** - V2 calculates basic metrics only

**What V2 Engine Currently Calculates:**
- Total Return
- CAGR
- Volatility / Annual Volatility
- Sharpe Ratio
- Sortino Ratio
- Max Drawdown

**Missing from V2 (that QuantStats provides):**
- Calmar Ratio
- Omega Ratio
- Value at Risk (VaR)
- Conditional VaR (CVaR)
- Win Rate
- Best/Worst Day
- Consecutive Wins/Losses
- Tail Ratio
- Common Sense Ratio
- Kelly Criterion
- Payoff Ratio
- Profit Factor
- And 20+ more advanced metrics

---

### Platform-Wide Integration Plan

#### **Phase 1: Add QuantStats to V2 Backtest Engine**

**Implementation:**
1. Import `fetchQuantStatsMetrics()` into V2 simulation
2. Calculate daily returns from equity curve
3. Call QuantStats service with returns
4. Merge QuantStats metrics with existing metrics
5. Return enriched metrics object

**Code Changes:**
```typescript
// In simulation.ts
const dailyReturns = calculateDailyReturns(equityCurve);
const { fetchQuantStatsMetrics } = await import('../../index'); // Or refactor to shared module
const quantMetrics = await fetchQuantStatsMetrics(dailyReturns);
const metrics = { ...basicMetrics, ...quantMetrics };
```

**Timeline:** 2-4 hours
**Risk:** Low (QuantStats service already exists)

---

#### **Phase 2: Add QuantStats to Batch Backtests**

**Current Issue:** Batch backtests return individual results - no aggregate metrics across all runs

**Opportunity:**
- Calculate QuantStats for each individual backtest run
- Add aggregate metrics across the entire batch
- Example: "Best run had Sharpe 2.5, worst had -0.3, average 1.2"

**Implementation:**
- Each batch run gets full QuantStats metrics
- UI shows sortable table with all metrics
- Helps identify which variable combinations perform best

**Timeline:** 4-6 hours (includes UI updates)

---

#### **Phase 3: Add QuantStats to Active Strategy Snapshots**

**Current:** Snapshots just store holdings and equity value
**Proposed:** Calculate daily QuantStats metrics for live strategy

**Implementation:**
```typescript
// In snapshotScheduler.ts or snapshot creation
const snapshots = await getAllSnapshots(strategyId);
const equityCurve = snapshots.map(s => s.totalValue);
const dates = snapshots.map(s => s.timestamp);
const dailyReturns = calculateDailyReturns(equityCurve);
const metrics = await fetchQuantStatsMetrics(dailyReturns);

// Store in snapshot or strategy record
await updateStrategyMetrics(strategyId, metrics);
```

**Use Case:**
- Dashboard shows live Sharpe, Sortino, Max DD for active strategies
- Historical performance view with rich metrics
- Compare backtest metrics vs live performance

**Timeline:** 6-8 hours (includes database schema, UI)

---

#### **Phase 4: Advanced QuantStats Features**

**Option A: Tearsheet Generation**
- QuantStats can generate full HTML tearsheets
- Include in backtest results as downloadable report
- Shows charts, metrics, analysis

**Option B: Comparative Analysis**
- Compare multiple strategies side-by-side
- Statistical significance tests
- Correlation analysis

**Option C: Rolling Metrics**
- 30-day rolling Sharpe
- 90-day rolling volatility
- Identify regime changes

**Timeline:** 1-2 weeks per feature

---

### Recommended Rollout

**Week 1:**
- Phase 1: V2 engine integration
- Test with existing backtests
- Verify metrics match Python output

**Week 2:**
- Phase 2: Batch backtest metrics
- UI updates to display rich metrics
- Sortable/filterable results table

**Week 3:**
- Phase 3: Active strategy snapshots
- Dashboard metrics display
- Historical performance charts

**Future:**
- Phase 4 features as needed
- Consider moving QuantStats to Node.js for speed (eliminates HTTP call)

---

### Alternative: Embed QuantStats in Node.js

**Current:** Python service calculates metrics (network overhead)
**Alternative:** Use JavaScript financial libraries

**Libraries:**
- `financial` npm package (basic metrics)
- `simple-statistics` (statistical functions)
- Custom implementation of QuantStats formulas

**Pros:**
- No network calls = faster
- One less service dependency
- Can run metrics inline during backtest

**Cons:**
- Need to reimplement/verify formulas
- Python QuantStats is battle-tested
- Risk of calculation differences

**Recommendation:** Keep Python QuantStats for now, consider Node.js port later if speed becomes critical

---

## 5. MULTI-USER ARCHITECTURE (FUTURE)

### Current Limitations
- Single set of Alpaca credentials (environment variables)
- All users share the same trading account
- No per-user resource limits
- No job queue for fair scheduling

### Required Changes

**1. Database Schema**
- Add `users` table with Discord ID
- Add `encrypted_api_key` and `encrypted_api_secret` columns
- Link active strategies to user IDs

**2. Encryption Layer**
- Use `crypto` (Node.js built-in) for credential encryption
- Store encryption key in Railway env vars

**3. Authentication Updates**
- Fetch user credentials for all Alpaca API calls
- Decrypt on-the-fly for each request

**4. Job Queue System**
- Use Bull/BullMQ with Redis
- Queue all batch requests
- Process X jobs at a time across all users
- Fair scheduling with queue visibility

**5. Per-User Limits**
- Free tier: 1 batch at a time, lower concurrency
- Paid tier: Higher concurrency, queue priority

**Estimated Effort:** 2-4 days of development

---

## Next Steps & Priorities

### Immediate (This Week)
1. Monitor active strategy trading at next 3:50pm ET window
2. Verify all schedulers running correctly
3. Test batch backtest with new logging (verify no rate limits)

### Short Term (1-2 Weeks)
1. Implement Phase 1 Performance Optimizations (batch DB writes, Redis pipelining)
2. Add QuantStats to V2 engine
3. Test on larger batch (1000+ backtests)

### Medium Term (1 Month)
1. Complete remaining performance optimizations
2. QuantStats integration across platform
3. Begin Polygon data integration planning

### Long Term (2-3 Months)
1. Multi-user architecture
2. Job queue system
3. Horizontal scaling with workers

---

*Document maintained in `.claude/STATUS_AND_ROADMAP.md`*
*Last updated: 2025-10-10*
