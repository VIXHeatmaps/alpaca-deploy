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
  period: number;  // Deprecated: kept for backward compat, now computed from params
  params?: Record<string, string>;  // NEW: actual indicator params from frontend
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

    // Extract the period part from the indicator key (handles composite keys)
    const periodPart = indKey.split('|')[2];

    const dates = Object.keys(tickerData).sort();
    for (const date of dates) {
      const cacheKey = `indicator:${req.ticker}:${req.indicator}:${periodPart}:${date}`;
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
          // Extract the period part from the indicator key (handles composite keys)
          const periodPart = indKey.split('|')[2];
          const cacheKey = `indicator:${req.ticker}:${req.indicator}:${periodPart}:${date}`;
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
    // Use params from request if available, otherwise use defaults
    let params: any;
    if (req.params && Object.keys(req.params).length > 0) {
      // Convert string params to appropriate types (numbers for most params)
      params = {};
      for (const [key, value] of Object.entries(req.params)) {
        // Keep matype as number, convert periods to numbers
        const numValue = parseFloat(value);
        params[key] = isNaN(numValue) ? value : numValue;
      }
      console.log(`[INDICATOR] Using params from request for ${req.ticker} ${req.indicator}:`, JSON.stringify(params));
    } else {
      // Fall back to old behavior for backward compatibility
      params = getIndicatorParams(req.indicator, req.period);
      console.log(`[INDICATOR] Using default params for ${req.ticker} ${req.indicator}:`, JSON.stringify(params));
    }

    let payload: any = {
      indicator: req.indicator,
      params,
    };
    console.log(`[INDICATOR] Full payload for ${req.ticker} ${req.indicator}:`, JSON.stringify(payload));

    // Add appropriate data based on indicator type
    const ind = req.indicator.toUpperCase();
    if (ind === 'RSI' || ind === 'SMA' || ind === 'EMA') {
      payload.close = closes;
      payload.prices = closes;
    } else if (ind === 'ATR' || ind === 'ADX') {
      payload.high = highs;
      payload.low = lows;
      payload.close = closes;
    } else if (ind === 'MFI') {
      payload.high = highs;
      payload.low = lows;
      payload.close = closes;
      payload.volume = volumes;
    } else if (ind.startsWith('MACD') || ind.startsWith('PPO')) {
      // MACD/PPO need close prices
      payload.close = closes;
      payload.prices = closes;
    } else if (ind.startsWith('BBANDS')) {
      // Bollinger Bands need close prices
      payload.close = closes;
      payload.prices = closes;
    } else if (ind === 'STOCH_K') {
      // Stochastic needs high, low, close
      payload.high = highs;
      payload.low = lows;
      payload.close = closes;
    } else if (ind.startsWith('AROON')) {
      // AROON indicators need high, low (close not used but required by API)
      payload.high = highs;
      payload.low = lows;
      payload.close = closes;
    } else {
      payload.close = closes;
      payload.prices = closes;
    }

    // Call indicator service
    console.log(`[INDICATOR] Calling indicator service for ${req.ticker} ${req.indicator}:`);
    console.log(`[INDICATOR]   URL: ${INDICATOR_SERVICE_URL}/indicator`);
    console.log(`[INDICATOR]   Payload keys: ${Object.keys(payload).join(', ')}`);
    console.log(`[INDICATOR]   Data array lengths: high=${payload.high?.length}, low=${payload.low?.length}, close=${payload.close?.length}`);

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
    if (err.response) {
      console.error(`[INDICATOR]   Status: ${err.response.status}`);
      console.error(`[INDICATOR]   Response data:`, JSON.stringify(err.response.data));
    }
  }

  return { key, values };
}

/**
 * Create indicator key for lookup
 * Format: "ticker|indicator|period" or "ticker|indicator|param1-param2-param3"
 */
function createIndicatorKey(req: IndicatorRequest): string {
  // If params are provided, use them to create the key
  if (req.params && Object.keys(req.params).length > 0) {
    return createCacheKey(req.ticker, req.indicator, req.params);
  }

  // Otherwise fall back to period-based key (backward compat)
  return `${req.ticker}|${req.indicator}|${req.period}`;
}

/**
 * Get indicator parameters for API call
 * Returns proper params object for each indicator type
 */
function getIndicatorParams(indicator: string, period: number): any {
  const ind = indicator.toUpperCase();

  // Multi-parameter indicators
  if (ind === 'MACD' || ind === 'MACD_LINE' || ind === 'MACD_SIGNAL' || ind === 'MACD_HIST') {
    return { fastperiod: 12, slowperiod: 26, signalperiod: 9 };
  }
  if (ind === 'PPO_LINE') {
    return { fastperiod: 12, slowperiod: 26, matype: 0 };
  }
  if (ind === 'PPO_SIGNAL' || ind === 'PPO_HIST') {
    return { fastperiod: 12, slowperiod: 26, matype: 0, signalperiod: 9 };
  }
  if (ind === 'BBANDS_UPPER' || ind === 'BBANDS_MIDDLE' || ind === 'BBANDS_LOWER') {
    return { period: 20, nbdevup: 2.0, nbdevdn: 2.0, matype: 0 };
  }
  if (ind === 'STOCH_K') {
    return { fastk_period: 14, slowk_period: 3, slowk_matype: 0 };
  }

  // Standard single-period indicators
  if (ind === 'VOLATILITY') {
    return { period: period || 20, annualize: 1 };
  }

  // No-parameter indicators
  if (ind === 'CURRENT_PRICE' || ind === 'OBV' || ind === 'CUMULATIVE_RETURN') {
    return {};
  }

  // Default: single period parameter
  return { period: period || 14 };
}

/**
 * Get default period for indicator based on type
 * Returns a string representation suitable for cache keys
 */
function getIndicatorPeriod(indicator: string, providedPeriod?: string): number {
  const ind = indicator.toUpperCase();

  // Multi-parameter indicators: ALWAYS use composite defaults (ignore provided period)
  // These indicators need 3+ params that frontend doesn't support yet
  if (ind === 'MACD' || ind === 'MACD_LINE' || ind === 'MACD_SIGNAL' || ind === 'MACD_HIST') {
    return 12269; // Represents 12-26-9 default
  }
  if (ind === 'PPO_LINE' || ind === 'PPO_SIGNAL' || ind === 'PPO_HIST') {
    return 12269; // Same as MACD
  }
  if (ind === 'STOCH_K') {
    return 143; // Represents 14-3 default (fastk_period-slowk_period)
  }

  // Single-period indicators: Use provided period if valid, otherwise default
  if (providedPeriod && providedPeriod.trim() !== '') {
    const parsed = parseInt(providedPeriod);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // Defaults for single-period indicators
  if (ind === 'BBANDS_UPPER' || ind === 'BBANDS_MIDDLE' || ind === 'BBANDS_LOWER') {
    return 20; // BB has other params too, but period is the main one
  }
  if (ind === 'RSI' || ind === 'SMA' || ind === 'EMA') return 14;
  if (ind === 'ATR' || ind === 'ADX' || ind === 'MFI') return 14;
  if (ind === 'AROON_UP' || ind === 'AROON_DOWN' || ind === 'AROONOSC') return 14;
  if (ind === 'VOLATILITY') return 20;

  // No-parameter indicators
  if (ind === 'CURRENT_PRICE' || ind === 'OBV' || ind === 'CUMULATIVE_RETURN') return 0;

  // Default fallback
  return 14;
}

/**
 * Get default params object for an indicator
 * Used when frontend doesn't provide params (backward compatibility)
 */
function getDefaultParams(indicator: string): Record<string, string> {
  const ind = indicator.toUpperCase();

  if (ind === 'MACD' || ind.startsWith('MACD_')) {
    return { fastperiod: '12', slowperiod: '26', signalperiod: '9' };
  }
  if (ind.startsWith('BBANDS_')) {
    return { period: '20', nbdevup: '2', nbdevdn: '2', matype: '0' };
  }
  if (ind === 'STOCH_K') {
    return { fastk_period: '14', slowk_period: '3', slowk_matype: '0', slowd_period: '3', slowd_matype: '0' };
  }
  if (ind === 'PPO_LINE') {
    return { fastperiod: '12', slowperiod: '26', matype: '0' };
  }
  if (ind === 'PPO_SIGNAL' || ind === 'PPO_HIST') {
    return { fastperiod: '12', slowperiod: '26', matype: '0', signalperiod: '9' };
  }
  if (ind === 'RSI' || ind === 'SMA' || ind === 'EMA') {
    return { period: '14' };
  }
  if (ind === 'ATR' || ind === 'ADX' || ind === 'MFI') {
    return { period: '14' };
  }
  if (ind === 'VOLATILITY') {
    return { period: '20' };
  }
  if (ind === 'CURRENT_PRICE' || ind === 'OBV' || ind === 'CUMULATIVE_RETURN') {
    return {};
  }

  // Default: single period parameter
  return { period: '14' };
}

/**
 * Create cache key from ticker, indicator, and params
 * For multi-param indicators, creates composite key like "12-26-9"
 * This allows different param combinations to be cached separately
 */
function createCacheKey(ticker: string, indicator: string, params: Record<string, string>): string {
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
    const fastk = params.fastk_period || '14';
    const slowk = params.slowk_period || '3';
    const slowd = params.slowd_period || '3';
    const slowk_ma = params.slowk_matype || '0';
    const slowd_ma = params.slowd_matype || '0';
    return `${ticker}|${indicator}|${fastk}-${slowk}-${slowd}-${slowk_ma}-${slowd_ma}`;
  }

  if (ind === 'PPO_LINE') {
    const f = params.fastperiod || '12';
    const s = params.slowperiod || '26';
    return `${ticker}|${indicator}|${f}-${s}`;
  }

  if (ind === 'PPO_SIGNAL' || ind === 'PPO_HIST') {
    const f = params.fastperiod || '12';
    const s = params.slowperiod || '26';
    const sig = params.signalperiod || '9';
    return `${ticker}|${indicator}|${f}-${s}-${sig}`;
  }

  // Single-param indicators (or no params)
  if (params.period) {
    return `${ticker}|${indicator}|${params.period}`;
  }

  // No-param indicators (CURRENT_PRICE, etc.)
  return `${ticker}|${indicator}|0`;
}

/**
 * Parse params from a cache key period string
 * Handles both composite keys like "12-26-9" and simple period numbers
 */
function parseParamsFromPeriodKey(indicator: string, periodKey: string): Record<string, string> {
  const ind = indicator.toUpperCase();

  // Multi-param indicators with composite keys
  if (periodKey.includes('-')) {
    const parts = periodKey.split('-');

    if (ind === 'MACD' || ind.startsWith('MACD_')) {
      return {
        fastperiod: parts[0] || '12',
        slowperiod: parts[1] || '26',
        signalperiod: parts[2] || '9',
      };
    }

    if (ind.startsWith('BBANDS_')) {
      return {
        period: parts[0] || '20',
        nbdevup: parts[1] || '2',
        nbdevdn: parts[2] || '2',
      };
    }

    if (ind === 'STOCH_K') {
      return {
        fastk_period: parts[0] || '14',
        slowk_period: parts[1] || '3',
        slowd_period: parts[2] || '3',
        slowk_matype: parts[3] || '0',
        slowd_matype: parts[4] || '0',
      };
    }

    if (ind === 'PPO_LINE') {
      return {
        fastperiod: parts[0] || '12',
        slowperiod: parts[1] || '26',
        matype: '0',
      };
    }

    if (ind === 'PPO_SIGNAL' || ind === 'PPO_HIST') {
      return {
        fastperiod: parts[0] || '12',
        slowperiod: parts[1] || '26',
        matype: '0',
        signalperiod: parts[2] || '9',
      };
    }
  }

  // Single-param indicators
  if (periodKey !== '0') {
    return { period: periodKey };
  }

  // No-param indicators
  return {};
}

/**
 * Extract required indicators from strategy elements
 */
export function collectRequiredIndicators(elements: any[]): IndicatorRequest[] {
  const indicators = new Set<string>();
  const result: IndicatorRequest[] = [];

  function traverse(els: any[]): void {
    for (const el of els) {
      // Check for gate conditions array
      if (el.type === 'gate' && el.conditions && Array.isArray(el.conditions)) {
        for (const cond of el.conditions) {
          // Extract left-side indicator (accept even if period is empty)
          if (cond.ticker && cond.indicator) {
            const ticker = cond.ticker.toUpperCase();
            const indicator = cond.indicator.toUpperCase();

            // Use params object if available, otherwise fall back to defaults
            const params = cond.params && Object.keys(cond.params).length > 0
              ? cond.params
              : getDefaultParams(indicator);

            const key = createCacheKey(ticker, indicator, params);
            if (!indicators.has(key)) {
              indicators.add(key);
              // Period is only used for old cache key format - not needed anymore since we have params
              result.push({ ticker, indicator, period: 0, params });
            }
          }

          // Extract right-side indicator (if comparing two indicators)
          if (cond.compareTo === 'indicator' && cond.rightTicker && cond.rightIndicator) {
            const ticker = cond.rightTicker.toUpperCase();
            const indicator = cond.rightIndicator.toUpperCase();

            // Use rightParams if available, otherwise fall back to defaults
            const params = cond.rightParams && Object.keys(cond.rightParams).length > 0
              ? cond.rightParams
              : getDefaultParams(indicator);

            const key = createCacheKey(ticker, indicator, params);
            if (!indicators.has(key)) {
              indicators.add(key);
              // Period is only used for old cache key format - not needed anymore since we have params
              result.push({ ticker, indicator, period: 0, params });
            }
          }
        }
      }

      // Check for old-style condition with field string (legacy support)
      if (el.type === 'condition' && el.field) {
        const field = el.field;
        // Parse field like "AAPL:SMA:50"
        const parts = field.split(':');
        if (parts.length === 3) {
          const ticker = parts[0].toUpperCase();
          const indicator = parts[1].toUpperCase();
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
