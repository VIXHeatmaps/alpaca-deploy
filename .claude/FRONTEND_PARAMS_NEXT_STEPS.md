# Frontend Indicator Params - Backend Integration Needed

## What Was Done (Frontend)

### ✅ Completed
1. **Dynamic parameter UI**: Frontend now shows all indicator-specific parameter fields
   - MACD shows: `fastperiod`, `slowperiod`, `signalperiod`
   - BBANDS shows: `period`, `nbdevup`, `nbdevdn`
   - RSI shows: `period`
   - CURRENT_PRICE shows: nothing (no params)
   - See: `IndicatorParams` component in `frontend/src/components/VerticalUI2.tsx`

2. **GateCondition type updated**:
   ```typescript
   interface GateCondition {
     ticker: string;
     indicator: IndicatorName;
     period: string; // Deprecated (kept for backward compat)
     params?: Record<string, string>; // NEW: actual indicator params
     operator: "gt" | "lt";
     compareTo: "threshold" | "indicator";
     threshold: string;
     rightTicker?: string;
     rightIndicator?: IndicatorName;
     rightPeriod?: string; // Deprecated
     rightParams?: Record<string, string>; // NEW: right indicator params
   }
   ```

3. **Condition initialization**: All new conditions include `params: {}` and `rightParams: {}`

4. **Styling**: Parameters displayed as function call syntax: `MACD(12, 26, 9)` with parentheses

## What Needs to Be Done (Backend)

### 🔴 Critical - Backend V2 Changes Needed

Currently the backend **ignores** the `params` object and uses hardcoded defaults. This needs to change:

#### File: `backend/src/backtest/v2/indicatorCache.ts`

**1. Update `collectRequiredIndicators()`** (line ~260-290)

Current code:
```typescript
if (cond.ticker && cond.indicator) {
  const ticker = cond.ticker.toUpperCase();
  const indicator = cond.indicator.toUpperCase();
  const period = getIndicatorPeriod(indicator, cond.period); // ← Uses old period field
```

Should be:
```typescript
if (cond.ticker && cond.indicator) {
  const ticker = cond.ticker.toUpperCase();
  const indicator = cond.indicator.toUpperCase();

  // Use params object if available, otherwise fall back to defaults
  const params = cond.params && Object.keys(cond.params).length > 0
    ? cond.params
    : getDefaultParams(indicator);

  const cacheKey = createCacheKey(ticker, indicator, params);
```

**2. Create new helper functions**:

```typescript
function getDefaultParams(indicator: string): Record<string, string> {
  const ind = indicator.toUpperCase();
  if (ind === 'MACD' || ind.startsWith('MACD_')) {
    return { fastperiod: '12', slowperiod: '26', signalperiod: '9' };
  }
  if (ind.startsWith('BBANDS_')) {
    return { period: '20', nbdevup: '2', nbdevdn: '2', matype: '0' };
  }
  if (ind === 'STOCH_K') {
    return { fastk_period: '14', slowk_period: '3', slowk_matype: '0' };
  }
  if (ind === 'RSI' || ind === 'SMA' || ind === 'EMA') {
    return { period: '14' };
  }
  return {};
}

function createCacheKey(ticker: string, indicator: string, params: Record<string, string>): string {
  // For multi-param indicators, create composite key
  const ind = indicator.toUpperCase();

  if (ind === 'MACD' || ind.startsWith('MACD_')) {
    const f = params.fastperiod || '12';
    const s = params.slowperiod || '26';
    const sig = params.signalperiod || '9';
    return `${ticker}|${indicator}|${f}-${s}-${sig}`;
  }

  if (ind.startsWith('BBANDS_')) {
    const p = params.period || '20';
    const up = params.nbdevup || '2';
    const dn = params.nbdevdn || '2';
    return `${ticker}|${indicator}|${p}-${up}-${dn}`;
  }

  if (ind === 'STOCH_K') {
    const fast = params.fastk_period || '14';
    const slow = params.slowk_period || '3';
    return `${ticker}|${indicator}|${fast}-${slow}`;
  }

  // Single-param indicators
  const period = params.period || '14';
  return `${ticker}|${indicator}|${period}`;
}
```

**3. Update `computeIndicator()`** (line ~195-230)

Change this:
```typescript
const params = getIndicatorParams(req.indicator, req.period);
```

To:
```typescript
const params = parseParamsFromCacheKey(req.period); // Parse the composite key
```

And add:
```typescript
function parseParamsFromCacheKey(cacheKeyPeriod: string): any {
  // If it contains dashes, it's a composite key like "12-26-9"
  if (cacheKeyPeriod.includes('-')) {
    const parts = cacheKeyPeriod.split('-');
    // Determine param structure based on indicator type
    // This is tricky - might need to pass indicator type too
  }
  // Otherwise it's a simple period
  return { period: parseInt(cacheKeyPeriod) || 14 };
}
```

### Alternative Simpler Approach

Instead of parsing cache keys, change the `IndicatorRequest` interface:

```typescript
interface IndicatorRequest {
  ticker: string;
  indicator: string;
  params: Record<string, string>; // Changed from 'period: number'
}
```

Then store the full params object in the cache key as JSON or use the composite format above.

## Current State

- ✅ Frontend sends `params: { fastperiod: '12', slowperiod: '26', signalperiod: '9' }`
- ❌ Backend ignores `params` and uses hardcoded `getIndicatorParams()`
- ❌ Cache keys still use old numeric period format

## Testing Plan

1. Create a MACD condition with **custom params** like `(5, 35, 5)` in frontend
2. Run backtest
3. Check backend logs - should show cache key like `XLK|MACD|5-35-5`
4. Indicator service should receive `{ fastperiod: 5, slowperiod: 35, signalperiod: 5 }`
5. Verify results differ from default MACD(12,26,9)

## Notes

- The execution engine (`backend/src/execution/executor.ts`) was already fixed to handle empty period strings
- The simulation mapping (`backend/src/backtest/v2/simulation.ts`) already handles mapping cache keys back to condition periods
- Main work is in `indicatorCache.ts` to read and use the `params` object

## Files to Modify

1. `backend/src/backtest/v2/indicatorCache.ts` - Main changes needed
2. Possibly `backend/src/backtest/v2/simulation.ts` - Update indicator mapping logic
3. Test with various indicators to ensure backward compatibility with old strategies

## Backward Compatibility

Old strategies without `params` field should still work:
- Check if `cond.params` exists and has keys
- If not, fall back to `getDefaultParams(indicator)`
- This ensures existing saved strategies continue to function
