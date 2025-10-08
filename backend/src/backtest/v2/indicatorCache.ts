/**
 * V2 Indicator Cache
 *
 * Manages caching and computation of technical indicators with:
 * - Redis caching (Decision #1)
 * - Parallel API calls to indicator service (Decision #4)
 * - T-2 caching rule (Decision #7)
 */

import axios from 'axios';
import * as cache from './cacheService';

const INDICATOR_SERVICE_URL = process.env.INDICATOR_SERVICE_URL || 'http://localhost:8001';

interface IndicatorRequest {
  ticker: string;
  indicator: string;
  period: number;
}

interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface PriceData {
  [ticker: string]: {
    [date: string]: Bar;
  };
}

interface IndicatorValues {
  [key: string]: {  // key = "ticker|indicator|period"
    [date: string]: number;
  };
}

/**
 * Fetch and cache indicator values
 *
 * Implementation (Decision #4 - parallel calls to existing endpoint):
 * 1. Parse strategy to extract unique indicators
 * 2. Check Redis cache for all indicator/date combinations
 * 3. Identify cache misses
 * 4. Compute missing indicators using Promise.all (parallel)
 * 5. Cache computed indicators (T-2+ only)
 * 6. Return indicator lookup map
 */
export async function fetchIndicators(
  requiredIndicators: IndicatorRequest[],
  priceData: PriceData
): Promise<IndicatorValues> {
  console.log(`\n[INDICATOR CACHE] Fetching ${requiredIndicators.length} unique indicators`);

  const result: IndicatorValues = {};

  // Initialize result structure
  for (const req of requiredIndicators) {
    const key = createIndicatorKey(req);
    result[key] = {};
  }

  // Step 1: Check cache for all indicator/date combinations
  console.log('[INDICATOR CACHE] Step 1: Checking cache...');
  const cacheKeys: string[] = [];
  const cacheKeyMap = new Map<string, { indKey: string; date: string }>();

  // Build list of all possible cache keys
  for (const req of requiredIndicators) {
    const indKey = createIndicatorKey(req);
    const tickerData = priceData[req.ticker];
    if (!tickerData) continue;

    const dates = Object.keys(tickerData).sort();
    for (const date of dates) {
      const cacheKey = `indicator:${req.ticker}:${req.indicator}:${req.period}:${date}`;
      cacheKeys.push(cacheKey);
      cacheKeyMap.set(cacheKey, { indKey, date });
    }
  }

  // Batch check cache
  const cachedData = await cache.mget(cacheKeys);
  let cacheHits = 0;
  let cacheMisses = 0;

  // Process cached data
  for (const [key, value] of cachedData.entries()) {
    const info = cacheKeyMap.get(key)!;
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      result[info.indKey][info.date] = numValue;
      cacheHits++;
    }
  }

  // Identify cache misses (indicators that need computation)
  const missedKeys = cacheKeys.filter(k => !cachedData.has(k));
  cacheMisses = missedKeys.length;

  console.log(`[INDICATOR CACHE] Cache hits: ${cacheHits}, Cache misses: ${cacheMisses}`);
  if (cacheKeys.length > 0) {
    console.log(`[INDICATOR CACHE] Cache hit rate: ${((cacheHits / cacheKeys.length) * 100).toFixed(1)}%`);
  }

  // Step 2: If we have cache misses, compute indicators
  if (cacheMisses > 0) {
    console.log(`[INDICATOR CACHE] Step 2: Computing ${cacheMisses} missing indicator values...`);

    // Group by indicator (not by date) to minimize API calls
    const indicatorsToCompute = new Map<string, IndicatorRequest>();
    for (const req of requiredIndicators) {
      const key = createIndicatorKey(req);
      indicatorsToCompute.set(key, req);
    }

    console.log(`[INDICATOR CACHE] Computing ${indicatorsToCompute.size} unique indicators in parallel...`);

    // Compute all indicators in parallel (Decision #4)
    const computePromises = Array.from(indicatorsToCompute.values()).map(async (req) => {
      return computeIndicator(req, priceData);
    });

    const computedResults = await Promise.all(computePromises);

    // Step 3: Cache computed indicators and merge into result
    console.log('[INDICATOR CACHE] Step 3: Caching computed indicators...');
    const itemsToCache: Array<{ key: string; value: string }> = [];

    for (const computed of computedResults) {
      const indKey = computed.key;
      for (const [date, value] of Object.entries(computed.values)) {
        // Add to result
        result[indKey][date] = value;

        // Cache if T-2 or older (Decision #7)
        if (cache.shouldCache(date)) {
          const req = indicatorsToCompute.get(indKey)!;
          const cacheKey = `indicator:${req.ticker}:${req.indicator}:${req.period}:${date}`;
          itemsToCache.push({
            key: cacheKey,
            value: value.toString(),
          });
        }
      }
    }

    // Batch cache write
    if (itemsToCache.length > 0) {
      await cache.mset(itemsToCache);
      console.log(`[INDICATOR CACHE] Cached ${itemsToCache.length} indicator values (T-2+ only)`);
    }

    const notCached = cacheMisses - itemsToCache.length;
    if (notCached > 0) {
      console.log(`[INDICATOR CACHE] Skipped caching ${notCached} recent indicator values (T-1, T-0)`);
    }
  }

  console.log('[INDICATOR CACHE] ✓ Indicator fetch complete\n');
  return result;
}

/**
 * Compute a single indicator by calling indicator service
 */
async function computeIndicator(
  req: IndicatorRequest,
  priceData: PriceData
): Promise<{ key: string; values: { [date: string]: number } }> {
  const key = createIndicatorKey(req);
  const values: { [date: string]: number } = {};

  try {
    const tickerData = priceData[req.ticker];
    if (!tickerData) {
      console.warn(`[INDICATOR] No price data for ${req.ticker}`);
      return { key, values };
    }

    // Extract price arrays in chronological order
    const dates = Object.keys(tickerData).sort();
    const bars = dates.map(d => tickerData[d]);

    const closes = bars.map(b => b.c);
    const highs = bars.map(b => b.h);
    const lows = bars.map(b => b.l);
    const volumes = bars.map(b => b.v);

    // Build payload based on indicator type
    let payload: any = {
      indicator: req.indicator,
      params: { period: req.period },
    };

    // Add appropriate data based on indicator type
    if (req.indicator === 'RSI' || req.indicator === 'SMA' || req.indicator === 'EMA') {
      payload.close = closes;
      payload.prices = closes;
    } else if (req.indicator === 'ATR' || req.indicator === 'ADX') {
      payload.high = highs;
      payload.low = lows;
      payload.close = closes;
    } else if (req.indicator === 'MFI') {
      payload.high = highs;
      payload.low = lows;
      payload.close = closes;
      payload.volume = volumes;
    } else {
      payload.close = closes;
      payload.prices = closes;
    }

    // Call indicator service
    const response = await axios.post(`${INDICATOR_SERVICE_URL}/indicator`, payload, {
      timeout: 30000,
    });

    const resultValues = response.data.values || [];

    // Map values to dates
    for (let i = 0; i < dates.length; i++) {
      const v = resultValues[i];
      if (typeof v === 'number' && isFinite(v)) {
        values[dates[i]] = v;
      }
    }

    console.log(`[INDICATOR] Computed ${req.indicator}(${req.period}) for ${req.ticker}: ${Object.keys(values).length} values`);
  } catch (err: any) {
    console.error(`[INDICATOR] Error computing ${req.indicator} for ${req.ticker}:`, err.message);
  }

  return { key, values };
}

/**
 * Create indicator key for lookup
 * Format: "ticker|indicator|period"
 */
function createIndicatorKey(req: IndicatorRequest): string {
  return `${req.ticker}|${req.indicator}|${req.period}`;
}

/**
 * Extract required indicators from strategy elements
 */
export function collectRequiredIndicators(elements: any[]): IndicatorRequest[] {
  const indicators = new Set<string>();
  const result: IndicatorRequest[] = [];

  function traverse(els: any[]): void {
    for (const el of els) {
      // Check for indicator references in conditions
      if (el.type === 'condition' && el.field) {
        const field = el.field;
        // Parse field like "AAPL:SMA:50"
        const parts = field.split(':');
        if (parts.length === 3) {
          const ticker = parts[0];
          const indicator = parts[1];
          const period = parseInt(parts[2]) || 14;

          const key = `${ticker}|${indicator}|${period}`;
          if (!indicators.has(key)) {
            indicators.add(key);
            result.push({ ticker, indicator, period });
          }
        }
      }

      // Traverse children
      if (el.children) traverse(el.children);
      if (el.thenChildren) traverse(el.thenChildren);
      if (el.elseChildren) traverse(el.elseChildren);
    }
  }

  traverse(elements);
  return result;
}
