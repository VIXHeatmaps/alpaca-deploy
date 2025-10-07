# Strategy Complexity Analysis

## Real-World Strategy Examples

You've provided strategy examples from **Composer** and **QuantMage** platforms to demonstrate the scale and complexity your system needs to handle.

### Example 1: "Anansi" Strategy (Composer Format)

**Source:** `Docs/Anansi Strategy for Claude.json` (459KB file)

**Complexity Metrics:**
- **Total nodes:** 3,752
- **Max tree depth:** 46 levels deep
- **Conditional branches:** 948 if-then-else evaluations
- **Unique assets:** 19 tickers
- **Rebalance frequency:** Daily
- **Node types:**
  - `asset`: 1,222 nodes
  - `wt-cash-equal`: 805 nodes (equal weight allocations)
  - `group`: 748 nodes
  - `if-child`: 632 conditional children
  - `if`: 316 conditional gates
  - `wt-cash-specified`: 28 custom weight nodes

**Sample Assets:**
- Leveraged ETFs (3x bull/bear): TMF, TMV, SPXL, TQQQ
- Anti-beta/market neutral funds
- Currency ETFs (USD, EUR)
- Sector ETFs (Technology, Consumer Staples, Utilities)
- Volatility products (SVXY)

**Performance Implications:**
- **Per-day evaluation:** 948 conditional checks per trading day
- **Backtest over 1 year (252 days):** ~238,000 conditional evaluations
- **Backtest over 5 years:** ~1.2 million conditional evaluations
- **With 14,000 batch combos:** ~16.8 BILLION conditional evaluations total

### Example 2: "HighC" Strategy (QuantMage Format)

**Source:** `Docs/HighC _ v3.1 _ Contest Edition...json` (319KB file)

Different JSON structure (QuantMage's "incantation" format), but similarly complex with nested weighted allocations and conditional logic.

---

## Implications for Your System

### Current Backend Performance

Your current implementation evaluates strategies via:
1. **Tree traversal:** Recursive evaluation of flow nodes
2. **Gate evaluation:** Each gate node checks indicator conditions
3. **Portfolio calculation:** Aggregates positions from leaf nodes

**With these complex strategies:**
- Current tree executor should handle this (good design!)
- Indicator fetching is the bottleneck (Alpaca API + Python service calls)
- 19 unique tickers × historical data = significant API load

### Batch Backtest Impact

**Scenario: 14,000 combo batch with Anansi-level complexity**

Current sequential approach:
```
14,000 combos × 5-10 seconds each = 70,000-140,000 seconds (19-39 hours)
```

With Phase 1 optimization (parallel + cache):
```
14,000 combos ÷ 20 concurrent × 5 seconds = 3,500 seconds (58 minutes)
```

With Phase 2 (worker queue, 5 workers @ 20 concurrent each = 100 parallel):
```
14,000 combos ÷ 100 parallel × 5 seconds = 700 seconds (12 minutes)
```

**BUT:** These estimates assume 5 seconds per backtest. With 948 conditionals and 19 tickers:
- First backtest: ~10-15 seconds (fetching all data)
- Cached subsequent: ~5-8 seconds (using cached price data)
- Average with good caching: ~6-7 seconds

**Revised realistic estimates:**

Phase 1 (parallel=20, with cache):
```
14,000 combos: ~70 minutes (acceptable)
50,000 combos: ~4.2 hours (acceptable)
200,000 combos: ~16.7 hours (over 12-hour target)
```

Phase 2 (100 parallel workers, shared cache):
```
14,000 combos: ~14 minutes ✅
50,000 combos: ~50 minutes ✅
200,000 combos: ~3.3 hours ✅
```

---

## Key Findings

### 1. **Your System Can Handle These Strategies**

The flow-based architecture with gates, portfolios, and conditional logic maps well to these complex strategies. The recursive executor design is solid.

### 2. **Data Fetching is the Real Bottleneck**

Not the tree evaluation itself, but:
- Fetching 19 tickers × years of daily data from Alpaca
- Calculating indicators for each ticker (HTTP calls to Python service)
- **Solution:** Aggressive caching (Phase 1) + distributed caching (Phase 3)

### 3. **Phase 2 (Worker Queue) is NON-NEGOTIABLE at Scale**

With 50k-200k combo batches and complex strategies:
- Single-process parallelism (Phase 1) maxes out around 50k combos in 4 hours
- Need distributed workers to stay under 12-hour target
- **Must implement before production use**

### 4. **Alpaca API Rate Limits Will Be a Concern**

With 100 parallel backtests hitting Alpaca:
- Paper trading: 200 req/min limit
- Each backtest fetches 19 tickers = 19 requests minimum
- 100 backtests starting simultaneously = 1,900 requests
- **Need rate limiter and exponential backoff**

---

## Optimization Priority (Updated)

### **IMMEDIATE (This Week):**

1. **Implement rate limiter for Alpaca API calls**
   - Prevent 429 errors with high parallelism
   - Queue and retry logic

2. **Phase 1: Parallel + Cache**
   - Gets you to 14k in ~70 minutes
   - Buys time for Phase 2

### **NEAR-TERM (Next 2-3 weeks):**

3. **Phase 2: Worker Queue Architecture**
   - Required for 50k+ batches
   - PostgreSQL + pg-boss/BullMQ
   - Deploy 5-10 worker instances

### **FUTURE (After Phase 2):**

4. **Redis for distributed caching**
   - Share price data across workers
   - 2-3x additional speedup

5. **Batch indicator calculations**
   - Reduce Python service round-trips
   - Diminishing returns but helps at extreme scale

---

## Cost Estimates (Updated)

### Phase 1: $0
Uses existing Railway instance, just code changes

### Phase 2: ~$30-50/month
- PostgreSQL (Railway): $10/month
- 5 worker instances: $5-10/month each
- Total: $30-60/month

### Phase 3: ~$60-100/month
- Add Redis cache: $10/month
- Scale to 10 workers if needed: Additional $25-50/month

**Worth it?** Absolutely, if this enables 200k combo batches in 3 hours vs 277 hours impossible.

---

## Next Steps

1. **Implement rate limiter immediately** (before heavy testing)
2. **Start Phase 1 this week** (2 days of work, 10-20x speedup)
3. **Plan Phase 2 architecture** (1 week implementation)
4. **Test with real batch sizes:**
   - Run a 600-combo batch today to get baseline
   - Measure actual per-backtest time with your typical strategies
   - Refine estimates based on real data

---

## Questions Answered

**Q:** Can your system handle Composer/QuantMage-level complexity?
**A:** Yes, the flow-based executor architecture is well-suited for this.

**Q:** Will batch backtests be fast enough?
**A:** Phase 1 gets you close, Phase 2 is required for 50k-200k scale.

**Q:** What's the biggest bottleneck?
**A:** Data fetching from Alpaca + indicator calculations, not tree evaluation.

**Q:** Is 200k combos in 12 hours feasible?
**A:** Yes, with Phase 2 (workers) you can do 200k in ~3 hours.
