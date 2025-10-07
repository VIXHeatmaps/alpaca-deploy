# Batch Backtest Performance Analysis & Optimization

## 🎯 **SCALE REQUIREMENTS**
- **Typical batch size:** 600 - 14,000 combos
- **Maximum batch size:** 50,000 - 200,000 combos
- **Acceptable runtime:** Up to 12 hours (overnight batches are normal)
- **Strategy complexity:** Very high (see shared strategy example)

## Current Implementation

### How Batch Backtests Work (Lines 236-301 in index.ts)

```typescript
async function startBatchJob(job, assignments) {
  for (let idx = 0; idx < combos.length; idx++) {
    // For each parameter combination:
    // 1. Apply variables to flow nodes
    // 2. Make HTTP request to /api/backtest_flow
    // 3. Wait for response
    // 4. Store result
    // 5. Increment counter
  }
}
```

**This is FULLY SEQUENTIAL** - each backtest must complete before the next one starts.

### Backtest Flow Performance (Lines 1895-2100+)

Each individual `/api/backtest_flow` call:
1. **Fetches ALL price bars** for all tickers from Alpaca API (1900-01-01 to end date)
2. **Calculates ALL indicators** by calling Python indicator service
3. **Evaluates strategy** day-by-day through entire date range
4. **Computes metrics** including QuantStats

### Performance Bottlenecks

#### 🔴 **Critical Bottleneck: Sequential Processing**
```
Batch with 100 combinations × 5 seconds per backtest = 500 seconds (8+ minutes)
Batch with 1000 combinations × 5 seconds = 5000 seconds (83 minutes!)
```

Current code (line 258-289):
```typescript
for (let idx = 0; idx < combos.length; idx++) {
  await axios.post(...)  // ← BLOCKING!
}
```

#### 🟡 **Major Bottleneck: Redundant Data Fetching**
Every backtest in a batch fetches the SAME price data:
- If testing 100 RSI period combinations on SPY
- ALL 100 backtests fetch identical SPY price bars
- No caching between backtests

#### 🟡 **Major Bottleneck: Redundant Indicator Calculations**
Similar indicators recalculated unnecessarily:
- Testing RSI(10), RSI(14), RSI(20) on SPY
- All fetch same price data
- Could calculate all periods in single indicator service call

#### 🟠 **Moderate Bottleneck: Python Service Round-Trips**
Each backtest makes multiple HTTP calls to indicator service:
- One per unique indicator/ticker combination
- Network latency adds up
- Could batch indicator requests

#### 🟠 **Moderate Bottleneck: In-Memory Only**
- No job persistence (lost on server restart)
- No progress checkpointing
- Can't resume failed batches
- Results lost if browser closes

## Optimization Options

### ⚡ **Option 1: Parallel Processing (EASIEST, BIGGEST IMPACT)**

**Current:**
```typescript
for (let idx = 0; idx < combos.length; idx++) {
  await runBacktest(combos[idx]);  // Sequential
}
```

**Optimized:**
```typescript
const CONCURRENCY = 10;
await Promise.all(
  chunks(combos, CONCURRENCY).map(chunk =>
    Promise.all(chunk.map(combo => runBacktest(combo)))
  )
);
```

**Impact:**
- **10x speedup** with concurrency=10
- 100 combos: 500s → 50s (8 min → 50 sec)
- 1000 combos: 5000s → 500s (83 min → 8 min)

**Effort:** Low (1-2 hours)
**Risk:** Low (just need rate limiting)

---

### ⚡ **Option 2: Price Data Caching (HIGH IMPACT)**

**Implementation:**
```typescript
const barsCache = new Map<string, bars>();

async function getBarsWithCache(ticker, start, end) {
  const key = `${ticker}:${start}:${end}`;
  if (!barsCache.has(key)) {
    barsCache.set(key, await fetchBarsFromAlpaca(ticker, start, end));
  }
  return barsCache.get(key);
}
```

**Impact:**
- First backtest: normal speed
- Subsequent backtests: **skip Alpaca API calls** (1-2s saved per backtest)
- 100 combos same ticker: ~200s savings

**Effort:** Medium (4-6 hours, need to refactor data fetching)
**Risk:** Low (just caching, can clear on error)

---

### ⚡ **Option 3: Batch Indicator Calculations**

**Current:** Each backtest calls indicator service separately
```typescript
// Backtest 1: POST /indicator { RSI, period: 10 }
// Backtest 2: POST /indicator { RSI, period: 14 }
// Backtest 3: POST /indicator { RSI, period: 20 }
```

**Optimized:**
```typescript
// Single call: POST /indicator/batch {
//   indicators: [
//     { type: RSI, period: 10 },
//     { type: RSI, period: 14 },
//     { type: RSI, period: 20 }
//   ]
// }
```

**Impact:**
- Reduce network round-trips
- ~0.5-1s saved per backtest

**Effort:** High (need to modify indicator service)
**Risk:** Medium (changes Python service)

---

### ⚡ **Option 4: Job Queue with Workers (SCALABILITY)**

**Implementation:**
- Move batch processing to background worker
- Use job queue (BullMQ, pg-boss, etc)
- Multiple worker instances can process in parallel
- Persist jobs to database

**Impact:**
- **Unlimited parallelism** (scale workers independently)
- Jobs survive server restarts
- Can prioritize/cancel jobs
- Progress tracking

**Effort:** Very High (2-3 days, infrastructure change)
**Risk:** High (new dependencies, deployment complexity)

---

### ⚡ **Option 5: Database for Job Persistence**

**Current:** Jobs stored in-memory Map (lost on restart)

**Optimized:** PostgreSQL/MongoDB/SQLite
```typescript
await db.saveBatchJob(job);
await db.updateJobProgress(jobId, completed);
```

**Impact:**
- Jobs persist across restarts
- Can resume partial batches
- Better monitoring/debugging
- Necessary for multi-user scale

**Effort:** High (1-2 days)
**Risk:** Medium (deployment complexity)

---

## Recommended Roadmap

### ⚠️ **CRITICAL FINDING:**
At 14,000-200,000 combo scale, **Phase 1 alone is NOT sufficient**. You MUST implement worker queue architecture for acceptable performance.

---

### 🚀 **Phase 1: Quick Wins (1-2 days)**
**Priority: IMMEDIATE - Do this FIRST to get baseline improvement**

1. **Parallel Processing** (Option 1)
   - Add concurrency control to `startBatchJob()`
   - Set concurrency=20-50 (test Alpaca rate limits)
   - **Expected: 10-20x speedup**

2. **Price Data Caching** (Option 2)
   - Add in-memory cache for bars
   - Cache per batch job (clear after completion)
   - **Expected: 30-50% additional speedup**

**Combined Impact:**
- 14,000 combos: 19.4 hours → ~1 hour ✅
- 200,000 combos: 277 hours → ~14 hours ⚠️ (still tight)

**Status:** This buys you time but isn't the final solution.

---

### 🎯 **Phase 2: Worker Queue Architecture (1 week)**
**Priority: REQUIRED for 50k-200k batches**

This is **NOT optional** at your scale. Sequential processing cannot handle 200k combos in reasonable time.

**Architecture:**
```
Frontend → Backend API → PostgreSQL Job Queue → Multiple Worker Processes
                              ↓
                         [Worker 1] [Worker 2] [Worker 3] [Worker 4] [Worker 5]
                         Each running 20 backtests in parallel
                         = 100 concurrent backtests total
```

**Implementation:**
1. **Database:** PostgreSQL on Railway
   - Job queue table
   - Results table
   - Worker status tracking

2. **Job Queue:** pg-boss or BullMQ
   - Handles job distribution
   - Retry logic
   - Priority queuing

3. **Worker Processes:** Separate Node.js processes
   - Can run on same Railway instance or separate instances
   - Each worker polls queue, processes jobs
   - Auto-scale worker count based on load

4. **Monitoring:**
   - Real-time progress tracking
   - Worker health checks
   - Queue depth monitoring

**Impact:**
- 14,000 combos: ~12 minutes ✅
- 200,000 combos: ~2.8 hours ✅
- Can scale workers indefinitely
- Jobs persist, can resume on crash
- Multiple users can submit jobs simultaneously

**Complexity:** HIGH, but necessary

---

### 🔮 **Phase 3: Advanced Optimizations (1-2 weeks)**
**Priority: NICE-TO-HAVE, implement after Phase 2**

1. **Distributed Caching** (Redis)
   - Share price data cache across workers
   - Prevents redundant Alpaca API calls
   - **Expected:** Additional 2-3x speedup

2. **Batch Indicator Calculations**
   - Modify Python service to calculate multiple indicator periods in one call
   - **Expected:** 20-30% speedup

3. **Horizontal Scaling**
   - Deploy workers on separate Railway instances
   - Scale to 10-20 worker instances
   - **Expected:** Linear scaling (10 workers = 10x throughput)

4. **Smart Caching Strategy**
   - Pre-fetch common ticker data
   - Cache indicator results (not just price data)
   - LRU eviction policy

**Combined Impact:**
- 200,000 combos: ~1.4 hours ✅ EXCELLENT

---

## ⚡ **IMMEDIATE ACTION: What to Do Right Now**

Given your scale (14k-200k combos), here's the reality check:

### **Phase 1 (Parallel + Cache) = REQUIRED FIRST STEP**
- **Timeline:** 1-2 days
- **Gets you:** 14k combos in ~1 hour (vs 19 hours)
- **Allows:** Continued development while planning Phase 2
- **Cost:** $0 (no infrastructure changes)

### **Phase 2 (Worker Queue) = REQUIRED FOR PRODUCTION**
- **Timeline:** 1 week
- **Gets you:** 200k combos in ~3 hours (vs impossible)
- **Allows:** Production use at scale
- **Cost:** ~$20/month (Railway PostgreSQL + extra worker instances)

### **Decision Point:**
1. **If you need 200k batches SOON (next 2-4 weeks):**
   - Start Phase 2 immediately
   - Skip Phase 1 as temporary fix
   - Go straight to proper architecture

2. **If you have 1-2 months:**
   - Implement Phase 1 this week (buys time)
   - Plan Phase 2 properly
   - Migrate when ready

### **My Recommendation:**
**Start Phase 1 NOW** because:
- 1-2 days of work gets you 10-20x speedup
- Proves the concept with minimal risk
- Gives you real performance data to plan Phase 2
- Code from Phase 1 carries over to Phase 2 (not wasted effort)

**Then immediately plan Phase 2** because:
- Phase 1 maxes out around 50k combos
- Worker queue is inevitable at your scale
- Better to build it right than hack around limits

---

## Code Changes Needed

### Phase 1: Parallel Processing

**File:** `backend/src/index.ts`

```typescript
// Add helper for chunked parallel execution
async function runInParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

// Modify startBatchJob (line 236)
async function startBatchJob(job: BatchJobRecord, assignments: Array<Record<string, string>>) {
  let combos = assignments.length ? assignments : generateAllAssignments(job.variables);
  // ... existing setup code ...

  const CONCURRENCY = 10; // Configurable
  const runs: BatchJobResult['runs'] = [];

  // Process in parallel chunks
  for (let i = 0; i < combos.length; i += CONCURRENCY) {
    const chunk = combos.slice(i, Math.min(i + CONCURRENCY, combos.length));

    const chunkResults = await Promise.allSettled(
      chunk.map(async (assignment, localIdx) => {
        const globalIdx = i + localIdx;
        const mutatedNodes = applyVariablesToNodes(job.flow.nodes, assignment);
        const payload = {
          globals: job.flow.globals,
          nodes: mutatedNodes,
          edges: job.flow.edges,
        };

        const response = await axios.post(
          `${INTERNAL_API_BASE}/api/backtest_flow`,
          payload,
          {
            headers: {
              'APCA-API-KEY-ID': job.flow.apiKey,
              'APCA-API-SECRET-KEY': job.flow.apiSecret,
            },
            timeout: 60000, // 60s timeout
          }
        );

        const resp = response?.data || {};
        const metricsRaw = resp.metrics || {};

        return {
          variables: assignment,
          metrics: normalizeMetrics(metricsRaw),
        };
      })
    );

    // Process results
    for (let j = 0; j < chunkResults.length; j++) {
      const result = chunkResults[j];
      if (result.status === 'fulfilled') {
        runs.push(result.value);
      } else {
        // Handle failure
        job.status = 'failed';
        job.error = result.reason?.message || 'Backtest failed';
        job.updatedAt = new Date().toISOString();
        return;
      }
    }

    // Update progress after each chunk
    job.completed = i + chunk.length;
    job.updatedAt = new Date().toISOString();
  }

  // ... existing completion code ...
}
```

### Phase 1: Price Data Caching

**File:** `backend/src/index.ts` (add near top)

```typescript
// Simple in-memory cache for price bars
const barsCache = new Map<string, SimpleBar[]>();
const CACHE_TTL = 3600000; // 1 hour

function getCacheKey(ticker: string, start: string, end: string, timeframe: string): string {
  return `${ticker}:${start}:${end}:${timeframe}`;
}

async function fetchBarsWithCache(
  ticker: string,
  start: string,
  end: string,
  timeframe: string,
  apiKey: string,
  apiSecret: string
): Promise<SimpleBar[]> {
  const cacheKey = getCacheKey(ticker, start, end, timeframe);

  if (barsCache.has(cacheKey)) {
    console.log(`[CACHE HIT] ${cacheKey}`);
    return barsCache.get(cacheKey)!;
  }

  console.log(`[CACHE MISS] ${cacheKey}`);
  const bars = await fetchBarsFromAlpaca(ticker, start, end, timeframe, apiKey, apiSecret);
  barsCache.set(cacheKey, bars);

  // Auto-expire cache entries
  setTimeout(() => barsCache.delete(cacheKey), CACHE_TTL);

  return bars;
}

// Then replace all fetchBarsFromAlpaca calls with fetchBarsWithCache
```

---

## Performance Metrics to Track

Add these to understand bottlenecks:

```typescript
type BatchJobMetrics = {
  totalDuration: number;        // Total batch time (ms)
  avgBacktestTime: number;      // Average per backtest (ms)
  dataFetchTime: number;        // Time fetching from Alpaca (ms)
  indicatorTime: number;        // Time calculating indicators (ms)
  executionTime: number;        // Time running strategy logic (ms)
  cacheHitRate: number;         // % of cache hits
  parallelism: number;          // Actual concurrency achieved
};
```

---

## Expected Performance

### Current (Sequential)
```
100 combos:    ~500 seconds (8 minutes)
600 combos:    ~3000 seconds (50 minutes)
1,000 combos:  ~5000 seconds (83 minutes)
14,000 combos: ~70,000 seconds (19.4 HOURS) ❌ TOO SLOW
50,000 combos: ~250,000 seconds (69 HOURS) ❌ IMPOSSIBLE
200,000 combos: ~1,000,000 seconds (277 HOURS) ❌ IMPOSSIBLE
```

### After Phase 1 (Parallel concurrency=20 + Cache)
```
100 combos:    ~25 seconds
600 combos:    ~150 seconds (2.5 minutes)
1,000 combos:  ~250 seconds (4 minutes)
14,000 combos: ~3,500 seconds (58 minutes) ⚠️ BARELY ACCEPTABLE
50,000 combos: ~12,500 seconds (3.5 hours) ✅ OK
200,000 combos: ~50,000 seconds (13.9 hours) ⚠️ TIGHT
```

### After Phase 2 (Database + Worker Queue + Multiple Workers)
```
With 5 worker instances, concurrency=20 each = 100 parallel backtests:

14,000 combos: ~700 seconds (12 minutes) ✅ GREAT
50,000 combos: ~2,500 seconds (42 minutes) ✅ GREAT
200,000 combos: ~10,000 seconds (2.8 hours) ✅ EXCELLENT
```

### After Phase 3 (All optimizations)
```
With worker scaling + caching + batch indicators:

14,000 combos: ~350 seconds (6 minutes) ✅ EXCELLENT
50,000 combos: ~1,250 seconds (21 minutes) ✅ EXCELLENT
200,000 combos: ~5,000 seconds (1.4 hours) ✅ EXCELLENT
```

---

## Additional Considerations

### Strategy Complexity Impact

**✅ ANALYZED: Real strategies from Composer/QuantMage**

See [STRATEGY_COMPLEXITY_ANALYSIS.md](STRATEGY_COMPLEXITY_ANALYSIS.md) for full analysis.

**Example: "Anansi" Strategy (Real Production Strategy)**
- 3,752 total nodes (very complex tree)
- 46 levels deep
- 948 conditional branches (if-then-else gates)
- 19 unique tickers (leveraged ETFs, sector funds, volatility products)
- Daily rebalance frequency

**Performance Impact:**
- Each backtest day: 948 conditional evaluations
- 5-year backtest (1,260 days): 1.2 million conditionals evaluated
- With 14,000 batch combos: 16.8 BILLION total evaluations
- **Key Finding:** Tree evaluation is fast, but fetching 19 tickers × years of data from Alpaca is the real bottleneck

**Revised Time Estimates (with real complexity):**
- Per backtest (cold start): ~10-15 seconds (fetching all ticker data)
- Per backtest (warm cache): ~5-8 seconds (data already cached)
- Average with good caching: ~6-7 seconds per backtest

### Alpaca API Rate Limits ⚠️ CRITICAL

With high parallelism AND complex strategies (19 tickers), you WILL hit rate limits:

**Limits:**
- **Paper trading:** 200 requests/minute
- **Live trading:** Varies by plan

**The Problem:**
- 100 parallel backtests × 19 tickers = 1,900 requests at start
- Even with caching, initial data fetch will hit limit
- Will cause backtest failures and delays

**Mitigation (MUST IMPLEMENT):**
1. **Rate limiter with queue** (PRIORITY 1)
   - Queue all Alpaca API calls
   - Throttle to 180 req/min (leave buffer)
   - Automatic retry on 429 errors

2. **Smart batching**
   - Fetch unique ticker data once, share across backtests
   - Don't let each backtest fetch independently

3. **Consider Alpaca plan upgrade**
   - Higher rate limits available on paid plans

### Progress Monitoring

Current implementation updates `job.completed`, but:
- Frontend needs to poll for updates
- Consider WebSocket for real-time progress
- Add estimated completion time

### Cost Implications

**Phase 1:** $0 (uses existing infrastructure)

**Phase 2:**
- PostgreSQL (Railway): $5-10/month
- Extra worker instances: $5-10/month each
- Total: ~$20-50/month for production scale

**Phase 3:**
- Redis cache: $5-10/month
- Additional workers: Scale as needed
- Total: ~$50-100/month at high scale

---

## Next Steps - ACTION ITEMS

### 1. **✅ COMPLETED: Analyzed real strategy complexity**
   - Anansi strategy: 3,752 nodes, 948 conditionals, 19 tickers
   - Confirmed data fetching is the bottleneck
   - See [STRATEGY_COMPLEXITY_ANALYSIS.md](STRATEGY_COMPLEXITY_ANALYSIS.md)

### 2. **CRITICAL: Implement rate limiter (BEFORE heavy testing)**
   - Must do this before running large batches
   - Will hit 200 req/min limit with 100 parallel backtests
   - 2-3 hours of work

### 3. **Test current performance baseline**
   - Run a 100-combo batch with YOUR typical strategy
   - Measure actual times (cold vs cached)
   - Verify rate limits are being hit

### 4. **Decide implementation timeline:**
   - **Need 200k batches soon (<2 weeks)?** → Start Phase 2 immediately
   - **Have 1-2 months?** → Phase 1 first (buys time), then Phase 2

### 5. **Ready to implement when you are:**
   - Phase 1: I can have parallel processing + caching working in ~4-6 hours
   - Rate limiter: 2-3 hours
   - Want to start today?
