# Backtest Architecture Schematic

## Overview

This document outlines the proposed architecture for optimizing backtest performance through intelligent caching, batch API calls, and smart data processing.

## Architecture Decisions

All decisions have been finalized. This section documents the choices made:

| # | Decision Point | Choice | Rationale |
|---|---------------|--------|-----------|
| 1 | **Cache System** | Redis | Production-ready, survives restarts, multi-user support |
| 2 | **Phase 5 Benchmark** | Remove (duplicate) | Already handled in Phase 4 simulation loop |
| 3 | **Pre-loading Strategy** | Skip for now | Simpler, add later if needed |
| 4 | **Indicator Batching** | Parallel calls to existing endpoint | No new Python code, still fast |
| 5 | **Result Caching** | Don't cache results | Only cache raw data/indicators, always fresh |
| 6 | **Account Caching** | Remove | Unnecessary for backtests |
| 7 | **Cache TTL** | Dual purge: 4pm & 8pm ET | Aligns with market close and settlement |
| 8 | **Incremental Updates** | Always fetch full range | Simpler, guaranteed correct |
| 9 | **Monitoring** | Console logging only | Dashboard later if needed |
| 10 | **Batch Parallelization** | Chunked (4 at a time) | Prevents memory overflow |
| 11 | **Multi-User Cache** | Shared data, isolated results | Efficient + private |
| 12 | **Batch Results UI** | Partial vs Final views | Clear UX, prevents confusion |
| 13 | **Polling Strategy** | Progressive intervals | Responsive early, efficient later |

### Key Implementation Notes

**Starting Capital:** $100,000 (was $1 - needs fixing)

**Cache Purge Schedule:**
- 4:00 PM ET - Market close, invalidate cache
- 8:00 PM ET - Settlement complete, invalidate cache
- Historical data (T-2+) - Never expires
- Recent data (T-1, T-0) - Never cached (always fetch fresh)

**Progressive Polling Intervals:**
- 0-30s: 1 second
- 30-60s: 2 seconds
- 60-120s: 5 seconds
- 120-300s: 10 seconds
- 300-600s: 30 seconds
- 600s+: 60 seconds

**Batch Parallel Limit:** 4 concurrent backtests per chunk

## Current Problems

1. **Too many individual API calls** - Each ticker/date fetched separately
2. **No caching** - Re-fetches same data every time
3. **Redundant indicator calculations** - Recalculating common indicators across strategies
4. **Slow batch backtests** - Sequential processing of multiple backtests
5. **Flat SPY benchmark bug** - Benchmark showing as zero (needs investigation)

## Proposed Architecture

### Phase 1: REQUEST ANALYSIS

**Goal:** Intelligently determine minimum data requirements before fetching anything

**When:** Triggered on backtest button click (pre-loading skipped for now - Decision #3)

```
1. Parse strategy JSON
   └─> Extract all tickers from positions array
   └─> Extract all indicators from each position
   └─> Build unique set of required indicators
   └─> ALWAYS include SPY for benchmark

2. Calculate minimum lookback period
   └─> Scan all indicators for max lookback (e.g., SMA(200) needs 200 days)
   └─> Add buffer for indicator warmup (20-50 days)
   └─> Determine effectiveStartDate = requestedStartDate - lookbackPeriod
   └─> ALWAYS fetch full range including lookback (Decision #8)

3. Create data request manifest
   {
     tickers: ['AAPL', 'MSFT', 'SPY'],  // SPY always included
     indicators: [
       { type: 'SMA', params: { period: 50 }, lookback: 50 },
       { type: 'RSI', params: { period: 14 }, lookback: 14 }
     ],
     dateRange: { start: '2023-01-01', end: '2024-01-01' },
     effectiveStart: '2022-10-01' // includes lookback buffer
   }
```

### Phase 2: SMART DATA LAYER

**Goal:** Cache-first architecture with intelligent batch fetching using Redis (Decision #1)

```
REQUEST FLOW:

1. Check Redis cache first
   └─> Key format: `price:{ticker}:{date}`
   └─> Batch check: MGET price:AAPL:2023-01-01, price:AAPL:2023-01-02, ...
   └─> Skip cache for T-1 and T-0 (always fetch fresh - Decision #7)

2. Identify cache misses
   └─> Group by ticker
   └─> Identify date ranges with gaps

3. Batch fetch missing data from Alpaca
   └─> Use multi-symbol endpoint: /v2/stocks/bars?symbols=AAPL,MSFT,SPY
   └─> Request by date range, not individual days
   └─> Single API call for all tickers

4. Store in Redis with smart TTL
   └─> MSET price:AAPL:2023-01-01 {...}, price:AAPL:2023-01-02 {...}
   └─> Historical (T-2+): Never expires
   └─> Recent (T-1, T-0): Don't cache
   └─> Cache purges at 4pm ET and 8pm ET (Decision #7)

5. Return combined cached + fresh data
```

**Cache Strategy:**

```javascript
// Redis cache structure (Decision #1: Use Redis)
// Decision #5: Don't cache full backtest results
// Decision #6: Account caching removed (unnecessary for backtests)
{
  // Historical price data (T-2 or older) - NEVER expires
  "price:AAPL:2023-01-01": { open: 130.28, high: 131.15, low: 130.00, close: 130.73, volume: 112117500 },
  "price:MSFT:2023-01-01": { ... },

  // Historical indicators (T-2 or older) - NEVER expires
  "indicator:AAPL:SMA:50:2023-01-01": 128.45,
  "indicator:AAPL:RSI:14:2023-01-01": 62.3,

  // Recent data (T-1, T-0) - NOT CACHED
  // Always fetch fresh to ensure accuracy
}

// Cache purge schedule (Decision #7)
function scheduleCachePurge() {
  // Purge entire cache at:
  // 1. 4:00 PM ET - Market close (prepare for new data)
  // 2. 8:00 PM ET - Settlement complete (ensure official data)

  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const nextPurge4pm = new Date(etNow).setHours(16, 0, 0, 0);
  const nextPurge8pm = new Date(etNow).setHours(20, 0, 0, 0);

  // Schedule purges
  scheduleAt(nextPurge4pm, () => redis.flushdb());
  scheduleAt(nextPurge8pm, () => redis.flushdb());
}

// Cache TTL function
function shouldCache(date) {
  const targetDate = new Date(date);
  const now = new Date();

  // Only cache historical data (T-2 or older)
  // Never cache recent data (T-1, T-0)
  const daysDiff = Math.floor((now - targetDate) / (1000 * 60 * 60 * 24));

  if (daysDiff >= 2) {
    return true; // Cache with no expiration
  }

  return false; // Don't cache
}

// Market Timeline (US Eastern Time):
// 9:30 AM ET - Market open
// 4:00 PM ET - Market close → Cache purge #1
// 4:00-8:00 PM ET - After-hours trading, settlement processing
// 8:00 PM ET - Settlement complete → Cache purge #2
```

### Phase 3: INDICATOR COMPUTATION

**Goal:** Never compute the same indicator twice

**Decision #4:** Use existing `/indicator` endpoint with parallel calls (no batch endpoint needed)

```
INDICATOR CACHE FLOW:

1. Extract unique indicators needed
   └─> Parse strategy to identify all indicators
   └─> Deduplicate (if multiple positions use SMA(50) on AAPL, compute once)

2. Check indicator cache in Redis
   └─> Key: `indicator:{ticker}:{type}:{params}:{date}`
   └─> Batch check: MGET indicator:AAPL:SMA:50:2023-01-01, indicator:AAPL:SMA:50:2023-01-02, ...
   └─> Skip cache for T-1 and T-0 (same as price data)

3. Compute cache misses using parallel calls (Decision #4)
   └─> For each unique indicator that's missing:
       await Promise.all([
         axios.post('/indicator', { indicator: 'SMA', prices: [...], params: {period: 50} }),
         axios.post('/indicator', { indicator: 'RSI', prices: [...], params: {period: 14} }),
         ...
       ])
   └─> No batch endpoint needed - parallel calls are fast enough

4. Store computed indicators in Redis
   └─> Only cache historical (T-2+) indicators
   └─> Set no expiration (permanent cache)

5. Return indicator lookups
   └─> Return hash map for O(1) lookups during backtest simulation
```

**Full Range Fetching (Decision #8):**

```
User runs backtest 2023-01-01 to 2024-01-01:
  └─> Calculate lookback: Need data from 2022-10-01 (for SMA 200)
  └─> Fetch full range: 2022-10-01 to 2024-01-01
  └─> Cache hits: 2022-10-01 to 2023-12-30 (instant)
  └─> Cache misses: 2023-12-31 to 2024-01-01 (compute)
  └─> Always guaranteed correct because lookback is included
```

### Phase 4: BACKTEST SIMULATION

**Goal:** Streamlined simulation with pre-fetched data

**NOTE:** Phase 5 removed - benchmark calculation happens here (Decision #2)

```
SIMULATION FLOW:

1. Pre-fetch ALL required data (now instant from cache)
   └─> prices: Map<ticker, Map<date, OHLCV>>
   └─> indicators: Map<indicatorKey, Map<date, value>>
   └─> SPY prices for benchmark (always included - Phase 1)

2. Initialize portfolio state (Decision #6: Starting capital fixed)
   {
     cash: 100000,        // Fixed from $1 → $100,000
     positions: {},
     equity: [],
     benchmark: []
   }

3. Day-by-day simulation (single loop, no API calls)
   FOR EACH trading day:
     ├─> Evaluate each position condition
     │   └─> Lookup indicators from pre-fetched Map (O(1))
     │   └─> Evaluate buy/sell/hold logic
     ├─> Execute trades if conditions met
     │   └─> Update cash and positions
     ├─> Calculate portfolio value
     │   └─> Lookup current prices from Map (O(1))
     │   └─> equity.push({ date, value: cash + positionValue })
     └─> Calculate benchmark (Decision #2: Merged into Phase 4)
         └─> SPY buy-and-hold calculation:
             initialSpyPrice = prices['SPY'][startDate].close
             currentSpyPrice = prices['SPY'][date].close
             benchmarkValue = 100000 * (currentSpyPrice / initialSpyPrice)
             benchmark.push({ date, value: benchmarkValue })

4. Verify benchmark is not flat
   └─> Assert benchmark has variance > 0
   └─> Log warning if benchmark appears broken

5. Return equity curve and metrics
   └─> No caching of results (Decision #5)
   └─> Always compute fresh (data is cached, so still fast)
```

**Bug Investigation - Flat SPY Benchmark:**
- Check if SPY data is being fetched correctly
- Verify SPY prices are not all zero
- Ensure initial SPY price is non-zero
- Confirm date range includes valid trading days

### Phase 5: BATCH BACKTEST OPTIMIZATION

**Goal:** Parallel processing with shared cache

**Decision #10:** Chunked parallelization (4 at a time) to prevent memory overflow

**Decision #12:** Partial vs Final results view for progressive display

**Decision #13:** Progressive polling intervals for efficient status updates

```
BATCH BACKTEST FLOW:

Example: Run 8 backtests with different position sizes (10%, 20%, 30%, ... 80%)

1. Single data fetch for ALL backtests
   └─> All 8 backtests use same strategy, just different params
   └─> Fetch price data once
   └─> Compute indicators once
   └─> Share Redis cache across all 8 backtests (Decision #11)

2. Run simulations in parallel chunks (Decision #10)
   └─> Chunk into groups of 4:
       Chunk 1: await Promise.all([ backtest1, backtest2, backtest3, backtest4 ])
       Chunk 2: await Promise.all([ backtest5, backtest6, backtest7, backtest8 ])
   └─> Each simulation is independent (no API calls)
   └─> All read from shared cached data
   └─> Prevents memory overflow on large batches (50+ backtests)

3. Stream results as they complete (Decision #12)
   └─> Frontend shows "Partial Results (3/8 complete)"
   └─> Completed backtests immediately viewable
   └─> Running backtests show "Running..."
   └─> When all complete: "Final Results" - enable sorting/download

4. Progressive polling (Decision #13)
   └─> 0-30s: poll every 1s (responsive for fast backtests)
   └─> 30-60s: poll every 2s
   └─> 60-120s: poll every 5s
   └─> 120-300s: poll every 10s
   └─> 300-600s: poll every 30s
   └─> 600s+: poll every 60s (reduces load for long batches)

5. Aggregate results
   └─> Collect all 8 result sets
   └─> Return as batch response

Expected Performance:
  └─> Current: 8 backtests * 30 seconds = 4 minutes
  └─> New: 5 seconds fetch + (4 backtests * 2s) + (4 backtests * 2s) = ~21 seconds
  └─> 10x+ speedup
```

## Implementation Phases

Based on finalized decisions, here's the recommended implementation order:

### Phase 1: Core Infrastructure (Week 1)
- [ ] Install and configure Redis server (Decision #1)
- [ ] Create Redis cache service layer in backend
- [ ] Implement cache purge schedule (4pm & 8pm ET) (Decision #7)
- [ ] Add console logging for cache hits/misses (Decision #9)

### Phase 2: Price Data Optimization (Week 1)
- [ ] Rewrite price fetching to use multi-symbol endpoint
- [ ] Implement Redis caching for historical price data (T-2+)
- [ ] Skip caching for recent data (T-1, T-0)
- [ ] Add retry logic for failed API calls

### Phase 3: Indicator Optimization (Week 2)
- [ ] Implement Redis caching for indicators
- [ ] Use parallel calls to existing `/indicator` endpoint (Decision #4)
- [ ] Always fetch full date range with lookback (Decision #8)
- [ ] Share cache across users (Decision #11)

### Phase 4: Fix Critical Bugs (Week 2)
- [ ] Fix starting capital: $1 → $100,000 (Decision #6)
- [ ] Debug and fix flat SPY benchmark bug
- [ ] Verify benchmark calculation in Phase 4 loop (Decision #2)
- [ ] Add benchmark variance assertion

### Phase 5: Batch Backtest Enhancement (Week 2-3)
- [ ] Implement chunked parallelization (4 at a time) (Decision #10)
- [ ] Add progressive polling intervals (Decision #13)
- [ ] Implement "Partial Results" vs "Final Results" UI (Decision #12)
- [ ] Stream results as they complete

### Phase 6: Testing & Refinement (Week 3)
- [ ] Load testing with large batches (50+ backtests)
- [ ] Verify cache persistence across server restarts
- [ ] Measure and log performance improvements
- [ ] Document cache architecture for team

## Expected Performance Improvements

| Metric | Current | Proposed | Improvement |
|--------|---------|----------|-------------|
| Single backtest (1 year) | 30s | 3-5s | 6-10x faster |
| Batch backtest (8 variants) | 4min | 20s | 12x faster |
| Re-run same backtest | 30s | <1s | 30x faster |
| API calls per backtest | 500+ | 5-10 | 50-100x reduction |
| Cache hit rate (after warmup) | 0% | 95%+ | N/A |

## Data Flow Diagram

```
┌─────────────────┐
│  User Request   │
│  "Backtest XYZ" │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Phase 1: Analysis          │
│  • Parse strategy           │
│  • Calculate lookback       │
│  • Build data manifest      │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Phase 2: Data Layer        │
│  • Check Redis cache        │
│  • Batch fetch misses       │
│  • Store in cache           │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Phase 3: Indicators        │
│  • Check indicator cache    │
│  • Batch compute misses     │
│  • Store in cache           │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Phase 4: Simulation        │
│  • Day-by-day loop          │
│  • All data from cache      │
│  • No API calls             │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Phase 5: Benchmark         │
│  • SPY buy-and-hold         │
│  • Parallel calculation     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Results & Metrics          │
│  • QuantStats analysis      │
│  • Return to frontend       │
└─────────────────────────────┘
```

## Cache Invalidation Strategy

**Simplified based on finalized decisions:**

**Historical data (T-2 or older - price, indicators):**
- Never invalidate (finalized data is immutable)
- TTL: None (permanent)
- Rationale: Once settlement completes, historical data never changes

**Recent data (T-1, T-0 - price, indicators):**
- NOT CACHED (Decision #7)
- Always fetch fresh from Alpaca API
- Rationale: Avoids complexity of settlement timing, ensures accuracy

**Full cache purges:**
- 4:00 PM ET - Market close (prepare for new data)
- 8:00 PM ET - Settlement complete (ensure official data)
- Rationale: Forces refresh after new trading day, incorporates settled data

**Account data:**
- REMOVED (Decision #6)
- Not needed for backtests

**Strategy results:**
- NOT CACHED (Decision #5)
- Always recompute (fast because data/indicators are cached)
- Rationale: Simpler, always fresh, no risk of stale results

**Market Timeline (US Eastern Time):**
- 9:30 AM - Market open
- 4:00 PM - Market close → **Cache purge #1**
- 4:00-8:00 PM - After-hours trading, settlement processing
- 8:00 PM - Settlement complete → **Cache purge #2**

## Error Handling

1. **Cache failures:**
   - Fall back to direct API calls
   - Log cache errors
   - Continue operation (degraded mode)

2. **Partial cache hits:**
   - Fetch only missing data
   - Merge cached + fresh data
   - Backfill cache with fresh data

3. **Batch API failures:**
   - Retry with exponential backoff
   - Fall back to individual requests if batch fails
   - Return partial results if some succeed

## Monitoring & Metrics

**Decision #9:** Console logging only (no dashboard initially)

```javascript
// Log performance metrics to console
console.log({
  requestId: 'uuid',
  totalTime: 3200,  // ms
  breakdown: {
    analysis: 50,
    dataFetch: 1200,
    indicators: 800,
    simulation: 1000,
  },
  cache: {
    hits: 245,
    misses: 12,
    hitRate: 0.953
  },
  apiCalls: 3,  // vs 500+ before
});

// Example output:
// Backtest complete in 3.2s (95% cache hit rate, 3 API calls)
```

**Future Enhancement:** Visual dashboard can be added later if needed for monitoring cache performance.

## Open Questions

**Resolved:**
- ~~Multi-user cache~~ → **Decision #11:** Shared price/indicator data, isolated results
- ~~Benchmark bug~~ → To be investigated in Phase 4 implementation

**Remaining:**
1. **Redis hosting:** Start with local Redis (`brew install redis`), migrate to managed service (AWS ElastiCache) for production if needed
2. **Cache size limits:** Monitor in production. Estimate: 1000 tickers * 5 years * 365 days * 500 bytes ≈ 900 MB. Redis can handle 10GB+ easily. Add eviction policy if needed later.

## Notes

- The 1900-01-01 MAX_START logic is CORRECT - don't change it
- It fetches all available data, then calculates effective start based on lookbacks
- Focus on caching and batching, not changing date logic
