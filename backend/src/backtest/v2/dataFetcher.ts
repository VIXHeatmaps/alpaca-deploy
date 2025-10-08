/**
 * V2 Data Fetcher
 *
 * Fetches price data from Alpaca with:
 * - Redis caching (Decision #1)
 * - Batch API calls (multiple symbols in one request)
 * - T-2 caching rule (Decision #7)
 */

import axios from 'axios';
import * as cache from './cacheService';

const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

interface Bar {
  t: string;  // timestamp
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

interface PriceData {
  [ticker: string]: {
    [date: string]: Bar;
  };
}

/**
 * Fetch price data for multiple tickers with caching
 *
 * Implementation:
 * 1. Check cache for all ticker/date combinations
 * 2. Identify cache misses
 * 3. Batch fetch missing data from Alpaca (multi-symbol endpoint)
 * 4. Cache fetched data (T-2+ only)
 * 5. Return combined cached + fresh data
 */
export async function fetchPriceData(
  tickers: string[],
  startDate: string,
  endDate: string,
  apiKey: string,
  apiSecret: string
): Promise<PriceData> {
  console.log(`\n[DATA FETCHER] Fetching data for ${tickers.length} tickers: ${tickers.join(', ')}`);
  console.log(`[DATA FETCHER] Date range: ${startDate} → ${endDate}`);

  const result: PriceData = {};

  // Initialize result structure
  for (const ticker of tickers) {
    result[ticker] = {};
  }

  // Step 1: Check cache for all ticker/date combinations
  console.log('[DATA FETCHER] Step 1: Checking cache...');
  const cacheKeys: string[] = [];
  const cacheKeyMap = new Map<string, { ticker: string; date: string }>();

  // Build list of all possible cache keys
  const dates = getDateRange(startDate, endDate);
  for (const ticker of tickers) {
    for (const date of dates) {
      const key = `price:${ticker}:${date}`;
      cacheKeys.push(key);
      cacheKeyMap.set(key, { ticker, date });
    }
  }

  // Batch check cache
  const cachedData = await cache.mget(cacheKeys);
  let cacheHits = 0;
  let cacheMisses = 0;

  // Process cached data
  for (const [key, value] of cachedData.entries()) {
    const info = cacheKeyMap.get(key)!;
    const bar: Bar = JSON.parse(value);
    result[info.ticker][info.date] = bar;
    cacheHits++;
  }

  // Identify cache misses
  const missedKeys = cacheKeys.filter(k => !cachedData.has(k));
  cacheMisses = missedKeys.length;

  console.log(`[DATA FETCHER] Cache hits: ${cacheHits}, Cache misses: ${cacheMisses}`);
  console.log(`[DATA FETCHER] Cache hit rate: ${((cacheHits / cacheKeys.length) * 100).toFixed(1)}%`);

  // Step 2: If we have cache misses, fetch from Alpaca
  if (cacheMisses > 0) {
    console.log(`[DATA FETCHER] Step 2: Fetching ${cacheMisses} missing data points from Alpaca...`);

    // Group misses by ticker for batch fetching
    const tickersToFetch = new Set<string>();
    for (const key of missedKeys) {
      const info = cacheKeyMap.get(key)!;
      tickersToFetch.add(info.ticker);
    }

    console.log(`[DATA FETCHER] Fetching ${tickersToFetch.size} tickers in batch: ${Array.from(tickersToFetch).join(', ')}`);

    // Fetch data using Alpaca multi-symbol endpoint
    const freshData = await fetchBarsFromAlpaca(
      Array.from(tickersToFetch),
      startDate,
      endDate,
      apiKey,
      apiSecret
    );

    // Step 3: Cache fresh data (only T-2+) and merge into result
    console.log('[DATA FETCHER] Step 3: Caching fresh data...');
    const itemsToCache: Array<{ key: string; value: string }> = [];

    for (const [ticker, bars] of Object.entries(freshData)) {
      for (const [date, bar] of Object.entries(bars)) {
        // Add to result
        result[ticker][date] = bar;

        // Cache if T-2 or older (Decision #7)
        if (cache.shouldCache(date)) {
          const key = `price:${ticker}:${date}`;
          itemsToCache.push({
            key,
            value: JSON.stringify(bar),
          });
        }
      }
    }

    // Batch cache write
    if (itemsToCache.length > 0) {
      await cache.mset(itemsToCache);
      console.log(`[DATA FETCHER] Cached ${itemsToCache.length} data points (T-2+ only)`);
    }

    const notCached = cacheMisses - itemsToCache.length;
    if (notCached > 0) {
      console.log(`[DATA FETCHER] Skipped caching ${notCached} recent data points (T-1, T-0)`);
    }
  }

  console.log('[DATA FETCHER] ✓ Data fetch complete\n');
  return result;
}

/**
 * Fetch bars from Alpaca using multi-symbol endpoint
 * Uses /v2/stocks/bars with symbols parameter for batch fetching
 */
async function fetchBarsFromAlpaca(
  symbols: string[],
  start: string,
  end: string,
  apiKey: string,
  apiSecret: string
): Promise<PriceData> {
  const result: PriceData = {};

  // Initialize result structure
  for (const symbol of symbols) {
    result[symbol] = {};
  }

  try {
    // Alpaca multi-symbol endpoint
    const url = `${ALPACA_DATA_URL}/v2/stocks/bars`;
    const params = {
      symbols: symbols.join(','),
      start,
      end,
      timeframe: '1Day',
      adjustment: 'all',
      feed: 'sip',
      limit: 10000,
    };

    console.log(`[ALPACA API] Calling multi-symbol endpoint: ${symbols.length} symbols`);

    const response = await axios.get(url, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      params,
      timeout: 30000,
    });

    const bars = response.data.bars || {};

    // Parse response
    for (const [symbol, symbolBars] of Object.entries(bars)) {
      if (!Array.isArray(symbolBars)) continue;

      for (const bar of symbolBars as any[]) {
        const date = bar.t.slice(0, 10); // Extract YYYY-MM-DD
        result[symbol][date] = {
          t: bar.t,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v,
        };
      }

      console.log(`[ALPACA API] Fetched ${symbolBars.length} bars for ${symbol}`);
    }

    console.log(`[ALPACA API] ✓ Batch fetch complete (1 API call for ${symbols.length} symbols)`);
  } catch (err: any) {
    console.error('[ALPACA API] Error fetching bars:', err.message);
    if (err.response) {
      console.error('[ALPACA API] Response:', err.response.status, err.response.data);
    }
    throw new Error(`Failed to fetch bars from Alpaca: ${err.message}`);
  }

  return result;
}

/**
 * Generate array of dates between start and end (inclusive)
 * Returns YYYY-MM-DD strings
 */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);

  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Convert PriceData to legacy SimpleBar[] format for compatibility
 */
export function priceDataToBars(priceData: PriceData, ticker: string): Bar[] {
  const bars: Bar[] = [];
  const tickerData = priceData[ticker] || {};

  const dates = Object.keys(tickerData).sort();
  for (const date of dates) {
    bars.push(tickerData[date]);
  }

  return bars;
}
