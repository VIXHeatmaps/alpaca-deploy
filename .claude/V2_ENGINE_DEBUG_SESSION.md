# V2 Backtest Engine Debug Session

## Current Status: BROKEN - Produces flat equity curves (0% positions)

## Root Cause Identified
The `collectRequiredIndicators()` function in `backend/src/backtest/v2/indicatorCache.ts` is **NOT extracting indicators from gate conditions**.

**Evidence:**
- Phase 1 logs show: `Indicators: 0 unique` even when strategy has gates with indicator conditions
- Phase 3 never computes any indicators
- Simulation receives empty `indicatorData` object
- Strategy evaluation fails because no indicators available
- Result: 0 positions on every day = flat equity curve

## The Bug Location

**File:** `backend/src/backtest/v2/indicatorCache.ts`
**Function:** `collectRequiredIndicators(elements: any[]): IndicatorRequest[]`
**Lines:** ~201-300

### What It Should Do:
1. Recursively walk through strategy `elements` tree
2. Find all gates with `conditions` arrays
3. Extract indicator requirements from conditions like:
   ```javascript
   {
     ticker: 'XLK',
     indicator: 'RSI',
     period: '10',
     operator: 'gt',
     compareTo: 'indicator',  // or 'threshold'
     threshold: '80',
     rightTicker: 'KMLM',      // when compareTo='indicator'
     rightIndicator: 'RSI',
     rightPeriod: '10'
   }
   ```
4. Return array of `IndicatorRequest` objects:
   ```typescript
   interface IndicatorRequest {
     ticker: string;
     indicator: string;  // 'RSI', 'SMA', 'EMA', etc.
     period: number;
   }
   ```

### What It's Actually Doing:
**Currently returns empty array `[]` for ALL strategies!**

The function was written to handle the OLD condition format (`field: "AAPL:SMA:50"`), but the ACTUAL strategy format uses gate `conditions` arrays with separate fields for ticker/indicator/period.

## Example Strategy Structure

```javascript
{
  type: 'gate',
  gateName: 'Gate1',
  conditionMode: 'if',
  conditions: [
    {
      ticker: 'XLK',
      indicator: 'RSI',
      period: '10',
      operator: 'gt',
      compareTo: 'indicator',
      rightTicker: 'KMLM',
      rightIndicator: 'RSI',
      rightPeriod: '10'
    }
  ],
  thenChildren: [{ type: 'ticker', ticker: 'TQQQ' }],
  elseChildren: [{ type: 'ticker', ticker: 'BTAL' }]
}
```

**Required indicators from this gate:**
- XLK:RSI:10
- KMLM:RSI:10

## The Fix Needed

Update `collectRequiredIndicators()` to:

1. **Look for `el.type === 'gate'`** instead of `el.type === 'condition'`
2. **Iterate through `el.conditions` array**
3. **Extract both left and right side indicators:**
   ```typescript
   // Left side (always present)
   if (condition.ticker && condition.indicator && condition.period) {
     indicators.add({
       ticker: condition.ticker,
       indicator: condition.indicator,
       period: parseInt(condition.period)
     });
   }

   // Right side (when compareTo === 'indicator')
   if (condition.compareTo === 'indicator' &&
       condition.rightTicker &&
       condition.rightIndicator &&
       condition.rightPeriod) {
     indicators.add({
       ticker: condition.rightTicker,
       indicator: condition.rightIndicator,
       period: parseInt(condition.rightPeriod)
     });
   }
   ```
4. **Recursively check `thenChildren` and `elseChildren`**

## Test Strategy

Use the TQQQ/BTAL strategy with XLK/KMLM RSI gates from the frontend.

**Expected Phase 1 output after fix:**
```
[V2] Tickers: TQQQ, BTAL, SPY, XLK, KMLM
[V2] Indicators: 2 unique
[V2]   - XLK: RSI(10)
[V2]   - KMLM: RSI(10)
```

## Other Issues Fixed in This Session

1. ✅ **Indicator date range mismatch** - Added logic to start simulation from first date where ALL indicators available
2. ✅ **Indicator period type** - Changed from `number` to `string` to match `buildIndicatorMap` expectation
3. ✅ **Redis caching** - Working correctly with T-2 rule
4. ✅ **Batch API calls** - Fetching multiple tickers in single call
5. ✅ **Parallel indicator computation** - Using Promise.all()

## Files Modified (Uncommitted)

- `backend/src/backtest/v2/indicatorCache.ts` - **NEEDS FIX**
- `backend/src/backtest/v2/simulation.ts` - Date range adjustment logic added
- `backend/src/backtest/v2/engine.ts` - Debug logging added

## How to Test After Fix

1. Start V2 engine: `USE_NEW_ENGINE=true npm run dev`
2. Run TQQQ/BTAL strategy from frontend
3. Check logs for:
   - Phase 1: Should show 2 indicators extracted
   - Phase 3: Should compute ~1400 indicator values
   - Phase 4: Should show positions on every day (not 0%)
   - Final: Should show realistic equity curve (not flat)

## Backend Logs Showing the Bug

```
[V2] === PHASE 1: REQUEST ANALYSIS ===
[V2] Tickers: TQQQ, BTAL, SPY, XLK, KMLM
[V2] Indicators: 0 unique   <-- WRONG! Should be 2

[V2] === PHASE 3: INDICATOR COMPUTATION ===
[INDICATOR CACHE] Fetching 0 unique indicators   <-- WRONG!

[V2] === PHASE 4: SIMULATION ===
[SIM DEBUG] Day 1 (2016-01-05):
  Indicators available: 0   <-- WRONG!
  Positions: 0              <-- WRONG! Should always have positions

[SIMULATION] Days with positions: 0/2454 (0.0%)   <-- WRONG! Should be 100%
```

## Next Steps

1. Fix `collectRequiredIndicators()` function
2. Test with simple strategy
3. Compare V2 vs Legacy outputs side-by-side
4. Add Daily Tracking Report to frontend (as user requested)
5. Commit working V2 engine
