# Backtest V2 Implementation Roadmap

## Current State → Target State

**Current System:**
- No caching (re-fetches all data every backtest)
- Individual API calls (500+ per backtest)
- Sequential batch processing
- Single backtest: ~30 seconds
- Batch of 8: ~4 minutes
- Flat SPY benchmark bug
- Starting capital: $1 (should be $100,000)

**Target System:**
- Redis caching (95%+ hit rate after warmup)
- Batch API calls (5-10 per backtest)
- Parallel batch processing (chunked)
- Single backtest: ~3-5 seconds (6-10x faster)
- Batch of 8: ~20 seconds (12x faster)
- Fixed SPY benchmark
- Starting capital: $100,000

---

## Implementation Strategy

**Approach:** Build new system in parallel (`v2/` folder), keep old system (`legacy/`) as fallback

**File Structure:**
```
backend/src/
├── index.ts                    # Router - toggles between legacy/v2
├── backtest/
│   ├── legacy/                 # OLD SYSTEM - Don't touch after initial move
│   │   ├── engine.ts           # Current backtest code
│   │   ├── dataFetcher.ts      # Current Alpaca fetching
│   │   └── simulation.ts       # Current simulation logic
│   └── v2/                     # NEW SYSTEM - All new development here
│       ├── engine.ts           # New backtest orchestrator
│       ├── cacheService.ts     # Redis cache management
│       ├── dataFetcher.ts      # Batch API calls to Alpaca
│       ├── indicatorCache.ts   # Indicator caching logic
│       └── simulation.ts       # Optimized simulation
```

**Toggle Mechanism:**
```bash
# Use old system (default)
USE_NEW_ENGINE=false npm run dev

# Use new system (testing)
USE_NEW_ENGINE=true npm run dev
```

---

## Week-by-Week Roadmap

### WEEK 0: Preparation (This Week)

**Goal:** Set up parallel system structure, isolate old code

#### Day 1: Archive Current System
- [ ] Create `backend/src/backtest/legacy/` folder
- [ ] Move current backtest code into `legacy/` folder
- [ ] Extract current backtest logic from `index.ts` into `legacy/engine.ts`
- [ ] Test that old system still works after move
- [ ] Commit: "Archive legacy backtest system"

#### Day 2: Set Up V2 Structure
- [ ] Create `backend/src/backtest/v2/` folder structure
- [ ] Create empty placeholder files:
  - `v2/engine.ts`
  - `v2/cacheService.ts`
  - `v2/dataFetcher.ts`
  - `v2/indicatorCache.ts`
  - `v2/simulation.ts`
- [ ] Add router toggle in `index.ts` (USE_NEW_ENGINE env var)
- [ ] Create stub v2 engine that returns mock data
- [ ] Test toggle works: `USE_NEW_ENGINE=true` returns mock, `false` uses legacy
- [ ] Commit: "Set up v2 backtest structure with toggle"

#### Day 3: Install Redis
- [ ] Install Redis: `brew install redis`
- [ ] Start Redis server: `redis-server`
- [ ] Install Redis client: `npm install redis`
- [ ] Create `v2/cacheService.ts` with basic connection test
- [ ] Test Redis connection in v2 engine
- [ ] Commit: "Add Redis infrastructure"

---

### WEEK 1: Core Caching Infrastructure

**Goal:** Price data caching with Redis

#### Day 1: Cache Service Layer
- [ ] Implement `v2/cacheService.ts`:
  - Connect to Redis
  - `get(key)` and `set(key, value, ttl)`
  - `mget(keys)` for batch retrieval
  - `mset(keyValuePairs)` for batch storage
  - `shouldCache(date)` - only cache T-2 or older
  - Connection error handling (log and continue)
- [ ] Add console logging for cache hits/misses (Decision #9)
- [ ] Unit test cache service
- [ ] Commit: "Implement Redis cache service layer"

#### Day 2: Cache Purge Scheduler
- [ ] Add purge scheduler to `cacheService.ts`:
  - Schedule purge at 4:00 PM ET
  - Schedule purge at 8:00 PM ET
  - Use `node-cron` or similar
- [ ] Test purge triggers (mock time or wait for actual time)
- [ ] Add logging: "Cache purged at 4:00 PM ET"
- [ ] Commit: "Add cache purge scheduler (4pm & 8pm ET)"

#### Day 3: Data Fetcher - Cache Integration
- [ ] Implement `v2/dataFetcher.ts`:
  - Parse date range and tickers from request
  - Check Redis cache for all date/ticker combinations
  - Identify cache misses
  - For now: fetch misses individually (optimize later)
  - Store fetched data in Redis (if T-2 or older)
  - Return combined cached + fresh data
- [ ] Test with single ticker, small date range
- [ ] Verify cache persistence (restart server, check cache still has data)
- [ ] Commit: "Add price data caching with Redis"

#### Day 4: Batch API Calls to Alpaca
- [ ] Update `v2/dataFetcher.ts`:
  - Group cache misses by date range
  - Use Alpaca multi-symbol endpoint: `/v2/stocks/bars?symbols=AAPL,MSFT,SPY`
  - Single API call for all tickers in date range
  - Parse response and store in cache
- [ ] Add retry logic with exponential backoff
- [ ] Test with 5 tickers, 1 year range
- [ ] Log: "Fetched 3 tickers in 1 API call (was 252 calls)"
- [ ] Commit: "Implement batch API calls to Alpaca"

#### Day 5: Testing & Verification
- [ ] Test cache hit rate (run same backtest twice, second should be ~100% cached)
- [ ] Test cache purge (manually trigger, verify cache cleared)
- [ ] Test T-1/T-0 not cached (run backtest with recent dates, verify fresh fetch)
- [ ] Compare data from legacy vs v2 (should be identical)
- [ ] Commit: "Verify price caching works correctly"

---

### WEEK 2: Indicators & Simulation

**Goal:** Indicator caching and complete simulation pipeline

#### Day 1: Indicator Cache Layer
- [ ] Implement `v2/indicatorCache.ts`:
  - Parse strategy to extract unique indicators
  - Check Redis for cached indicator values
  - Key format: `indicator:{ticker}:{type}:{params}:{date}`
  - Identify indicator cache misses
  - Return cached + missing indicator list
- [ ] Test with SMA and RSI indicators
- [ ] Commit: "Add indicator cache checking"

#### Day 2: Indicator Computation with Parallel Calls
- [ ] Update `v2/indicatorCache.ts`:
  - For each missing indicator, call `/indicator` endpoint
  - Use `Promise.all()` for parallel calls (Decision #4)
  - Store computed indicators in Redis (T-2+ only)
  - Return indicator lookup Map for simulation
- [ ] Test with 3 indicators on 1 ticker
- [ ] Verify indicators cached correctly
- [ ] Commit: "Implement parallel indicator computation"

#### Day 3: Simulation Engine - Part 1
- [ ] Implement `v2/simulation.ts`:
  - Initialize portfolio with $100,000 (Decision #6 - fix from $1)
  - Pre-fetch all price and indicator data (from cache)
  - Day-by-day loop structure
  - Evaluate position conditions using indicator lookups
  - Execute trades (buy/sell logic)
  - Track cash and positions
- [ ] Test with simple strategy (1 position, SMA crossover)
- [ ] Commit: "Implement basic simulation loop"

#### Day 4: Simulation Engine - Part 2 (Benchmark)
- [ ] Add benchmark calculation to `v2/simulation.ts`:
  - Always include SPY in data fetch (Phase 1)
  - Calculate SPY buy-and-hold in same loop (Decision #2)
  - `benchmarkValue = 100000 * (currentSpyPrice / initialSpyPrice)`
  - Assert benchmark has variance > 0
  - Log warning if benchmark appears flat
- [ ] Calculate equity curve
- [ ] Return results (equity, benchmark, metrics)
- [ ] Test benchmark calculation with known date range
- [ ] Commit: "Add benchmark calculation to simulation"

#### Day 5: End-to-End V2 Engine
- [ ] Implement `v2/engine.ts`:
  - Orchestrate full flow: Analysis → Data → Indicators → Simulation
  - Add performance logging (Decision #9):
    - Total time
    - Cache hit rate
    - API calls count
    - Breakdown by phase
  - Error handling (fall back to legacy if v2 fails)
- [ ] Test complete backtest with `USE_NEW_ENGINE=true`
- [ ] Compare results with legacy system (should match)
- [ ] Commit: "Complete v2 backtest engine"

---

### WEEK 3: Batch Backtests & Bug Fixes

**Goal:** Parallel batch processing and fix critical bugs

#### Day 1: Fix Critical Bugs
- [ ] Fix starting capital bug in legacy system:
  - Find initialization: `cash: 1`
  - Change to: `cash: 100000`
  - Test legacy system still works
- [ ] Debug flat SPY benchmark in legacy:
  - Check SPY data fetching
  - Verify SPY prices not all zero
  - Check initial SPY price calculation
  - Fix if broken, document if working correctly
- [ ] Commit: "Fix starting capital and investigate SPY benchmark bug"

#### Day 2: Batch Engine - Chunked Parallelization
- [ ] Create `v2/batchEngine.ts`:
  - Parse batch request (8 variants of same strategy)
  - Single data fetch for ALL variants
  - Single indicator computation for ALL variants
  - Chunk variants into groups of 4 (Decision #10)
  - Run each chunk with `Promise.all()`
  - Sequential chunks: chunk1 → chunk2
- [ ] Test with 8 position size variants
- [ ] Verify memory usage stays reasonable
- [ ] Commit: "Implement chunked parallel batch processing"

#### Day 3: Progressive Result Streaming
- [ ] Update batch job status as each backtest completes
- [ ] Store partial results in job object
- [ ] Frontend can poll and see completed results
- [ ] Mark overall batch status: "Partial" vs "Final" (Decision #12)
- [ ] Test streaming with 8-item batch
- [ ] Commit: "Add progressive result streaming for batches"

#### Day 4: Progressive Polling Intervals
- [ ] Update `frontend/src/components/BuilderWrapper.tsx`:
  - Track elapsed time since job started
  - Calculate polling interval based on elapsed time:
    - 0-30s: 1 second
    - 30-60s: 2 seconds
    - 60-120s: 5 seconds
    - 120-300s: 10 seconds
    - 300-600s: 30 seconds
    - 600s+: 60 seconds
  - Adjust interval dynamically
- [ ] Test with long-running batch job
- [ ] Commit: "Implement progressive polling intervals"

#### Day 5: Partial vs Final Results UI
- [ ] Update `frontend/src/components/BatchTestsTab.tsx`:
  - Show "Partial Results (3/8 complete)" header
  - Disable sorting while partial
  - Disable download while partial
  - Show "Running..." for incomplete items
  - When all complete: "Final Results" header
  - Enable sorting and download
- [ ] Test UI with progressive batch completion
- [ ] Commit: "Add Partial vs Final results UI"

---

### WEEK 4: Testing & Migration

**Goal:** Verify correctness, performance testing, prepare for cutover

#### Day 1: Correctness Testing
- [ ] Run same backtest on legacy and v2
- [ ] Compare equity curves (should match within floating point tolerance)
- [ ] Compare metrics (CAGR, Sharpe, max drawdown)
- [ ] Test with 10 different strategies
- [ ] Document any discrepancies
- [ ] Fix discrepancies if found
- [ ] Commit: "Verify v2 matches legacy results"

#### Day 2: Performance Testing
- [ ] Test single backtest speed (target: 3-5 seconds)
- [ ] Test batch backtest speed (target: ~20 seconds for 8 variants)
- [ ] Test cache hit rate (target: 95%+ after warmup)
- [ ] Test with 1 year, 3 year, 5 year backtests
- [ ] Test with 1 ticker, 5 tickers, 10 tickers
- [ ] Document performance metrics
- [ ] Commit: "Performance benchmarking results"

#### Day 3: Load Testing
- [ ] Test large batch (50 backtests)
- [ ] Monitor memory usage
- [ ] Monitor Redis cache size
- [ ] Test cache persistence across server restart
- [ ] Test concurrent users (simulate 3 users running backtests)
- [ ] Verify no race conditions or cache corruption
- [ ] Commit: "Load testing and stability verification"

#### Day 4: Edge Cases & Error Handling
- [ ] Test with invalid ticker (should error gracefully)
- [ ] Test with date range before ticker existed
- [ ] Test with Redis down (should fall back or error cleanly)
- [ ] Test with Alpaca API rate limit
- [ ] Test with network timeout
- [ ] Verify all errors logged properly
- [ ] Commit: "Edge case and error handling tests"

#### Day 5: Documentation & Cutover Prep
- [ ] Update README with Redis setup instructions
- [ ] Document environment variables (USE_NEW_ENGINE)
- [ ] Document cache purge schedule
- [ ] Create migration checklist
- [ ] Plan cutover announcement
- [ ] Commit: "Documentation for v2 system"

---

### WEEK 5: Cutover & Monitoring

**Goal:** Make v2 the default, monitor for issues

#### Day 1: Staged Rollout
- [ ] Change default: `USE_NEW_ENGINE=true` for your local testing
- [ ] Monitor for 24 hours (check logs, Redis cache, errors)
- [ ] Run multiple backtests, verify all work
- [ ] Check cache purge happened at 4pm and 8pm
- [ ] Verify no memory leaks

#### Day 2: Full Cutover
- [ ] Deploy with `USE_NEW_ENGINE=true` as default
- [ ] Keep legacy code available (just in case)
- [ ] Monitor cache hit rates
- [ ] Monitor performance metrics
- [ ] Watch for any user-reported issues

#### Day 3-5: Monitoring & Optimization
- [ ] Collect performance logs for 3 days
- [ ] Analyze cache hit rates
- [ ] Identify any slow queries
- [ ] Optimize if needed
- [ ] Document actual performance gains

---

### WEEK 6: Cleanup

**Goal:** Remove legacy code, finalize v2

#### Day 1: Verify V2 Stable
- [ ] Review 1 week of logs
- [ ] Confirm no critical issues
- [ ] Confirm performance targets met
- [ ] Get user feedback (if applicable)

#### Day 2: Remove Legacy System
- [ ] Delete `backend/src/backtest/legacy/` folder
- [ ] Remove `USE_NEW_ENGINE` toggle from `index.ts`
- [ ] Update imports to point directly to v2
- [ ] Remove environment variable from docs
- [ ] Commit: "Remove legacy backtest system"

#### Day 3: Rename V2 to Main
- [ ] Rename `backend/src/backtest/v2/` → `backend/src/backtest/`
- [ ] Update all imports
- [ ] Clean up any temporary code
- [ ] Commit: "Promote v2 to main backtest system"

#### Day 4-5: Final Polish
- [ ] Add any missing tests
- [ ] Optimize cache keys if needed
- [ ] Add cache size monitoring
- [ ] Consider adding optional dashboard (Decision #9 - future)
- [ ] Final documentation updates
- [ ] Commit: "Backtest v2 complete and production-ready"

---

## Success Metrics

Track these throughout implementation:

| Metric | Current | Target | Actual (Week 4) |
|--------|---------|--------|-----------------|
| Single backtest (1 year) | 30s | 3-5s | ___ |
| Batch backtest (8 variants) | 4min | ~20s | ___ |
| Cache hit rate (after warmup) | 0% | 95%+ | ___ |
| API calls per backtest | 500+ | 5-10 | ___ |
| Starting capital | $1 | $100,000 | ___ |
| SPY benchmark | Flat (broken) | Working | ___ |

---

## Rollback Plan

If v2 has critical issues:

1. **Immediate:** Set `USE_NEW_ENGINE=false` (reverts to legacy)
2. **Investigation:** Check logs, identify issue
3. **Fix:** Debug v2 issue offline
4. **Retry:** Once fixed, set `USE_NEW_ENGINE=true` again

Legacy system remains available until Week 6, providing safety net.

---

## Key Decision References

All decisions documented in [BACKTEST_ARCHITECTURE.md](.claude/BACKTEST_ARCHITECTURE.md):

- Decision #1: Use Redis
- Decision #2: Remove Phase 5 (benchmark in Phase 4)
- Decision #3: Skip pre-loading
- Decision #4: Parallel calls to existing indicator endpoint
- Decision #5: Don't cache results
- Decision #6: Fix starting capital $1 → $100,000
- Decision #7: Cache purge at 4pm & 8pm ET
- Decision #8: Always fetch full range
- Decision #9: Console logging only
- Decision #10: Chunked parallelization (4 at a time)
- Decision #11: Shared cache, isolated results
- Decision #12: Partial vs Final results UI
- Decision #13: Progressive polling intervals

---

## Notes

- **Don't touch legacy code after Week 0** - All work happens in `v2/` folder
- **Test frequently** - Run backtests after each day's work
- **Compare with legacy** - Verify results match throughout development
- **Monitor Redis** - Check cache size, hit rates, purge schedule
- **Log everything** - Console logging helps debug issues (Decision #9)
