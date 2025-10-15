/**
 * V2 BACKTEST ENGINE
 *
 * New Redis-cached backtest implementation.
 * All new development happens here.
 */

import { Request, Response } from 'express';
import * as cache from './cacheService';
import { fetchPriceData } from './dataFetcher';
import { collectRequiredIndicators, fetchIndicators } from './indicatorCache';
import { runSimulation } from './simulation';
import { getMarketDateToday } from '../../utils/marketTime';
import { paramsToPeriodString } from '../../utils/indicatorKeys';

/**
 * Calculate warmup days needed for indicators
 */
function calculateWarmupDays(indicators: Array<{ ticker: string; indicator: string; period: number }>): number {
  if (indicators.length === 0) return 0;

  let maxWarmup = 0;

  for (const ind of indicators) {
    const indicator = ind.indicator.toUpperCase();
    let warmup = 0;

    // Multi-parameter indicators
    if (indicator === 'MACD' || indicator === 'MACD_LINE' || indicator === 'MACD_SIGNAL' || indicator === 'MACD_HIST') {
      warmup = 26 + 9; // slow(26) + signal(9) = 35
    } else if (indicator === 'PPO_LINE') {
      warmup = 26; // slow period
    } else if (indicator === 'PPO_SIGNAL' || indicator === 'PPO_HIST') {
      warmup = 26 + 9;
    } else if (indicator.startsWith('BBANDS')) {
      warmup = 20 + 2; // period + stddev buffer
    } else if (indicator === 'STOCH_K') {
      warmup = 14 + 3; // fastk + slowk
    } else if (indicator === 'VOLATILITY') {
      warmup = 20;
    } else if (indicator === 'ATR' || indicator === 'ADX' || indicator === 'RSI' || indicator === 'MFI') {
      warmup = ind.period || 14;
    } else if (indicator === 'SMA' || indicator === 'EMA') {
      warmup = ind.period || 14;
    } else if (indicator.startsWith('AROON')) {
      warmup = (ind.period || 14) * 2; // AROON needs 2x period for stability
    } else {
      // Default: use period or 0
      warmup = ind.period || 0;
    }

    if (warmup > maxWarmup) maxWarmup = warmup;
  }

  // Add extra buffer for safety (indicators need data to stabilize)
  return maxWarmup + 10;
}

/**
 * Calculate the cumulative warmup needed for nested Sort elements
 *
 * For nested Sorts, warmup periods are CUMULATIVE because each level depends on the previous:
 * - Leaf level: base indicator warmup (e.g., RSI 14 days)
 * - Level 1 Sort: must simulate children, then accumulate indicator period (e.g., +100 days for RETURN(100))
 * - Level 2 Sort: must wait for Level 1, then accumulate its period (e.g., +200 days for RETURN(200))
 *
 * Example:
 *   Sort1(RETURN 200)
 *     └─ Sort2(RETURN 100)
 *          └─ Ticker(RSI 14)
 *
 * Total warmup = 14 (RSI) + 100 (Sort2 needs 100 days of simulated data) + 200 (Sort1 needs 200 days) = 314 days
 */
function calculateNestedSortWarmup(elements: any[]): number {
  /**
   * Extract the maximum period from an indicator configuration
   */
  const extractIndicatorPeriod = (indicator: string, params?: any, period?: string): number => {
    const periodKey = paramsToPeriodString(indicator, params) || period || '';
    const parts = periodKey
      .split('-')
      .map((part: string) => parseInt(part, 10))
      .filter((value: number) => Number.isFinite(value));
    return parts.length ? Math.max(...parts) : 0;
  };

  /**
   * Get the maximum indicator period used in this element's conditions/config
   */
  const getElementIndicatorPeriod = (el: any): number => {
    let maxPeriod = 0;

    // Gate conditions
    if (el.type === 'gate' && Array.isArray(el.conditions)) {
      for (const cond of el.conditions) {
        if (cond.indicator) {
          const period = extractIndicatorPeriod(cond.indicator, cond.params, cond.period);
          if (period > maxPeriod) maxPeriod = period;
        }
        if (cond.rightIndicator) {
          const period = extractIndicatorPeriod(cond.rightIndicator, cond.rightParams, cond.rightPeriod);
          if (period > maxPeriod) maxPeriod = period;
        }
      }
    }

    // Scale config
    if (el.type === 'scale' && el.config?.indicator) {
      const period = extractIndicatorPeriod(el.config.indicator, el.config.params, el.config.period);
      if (period > maxPeriod) maxPeriod = period;
    }

    return maxPeriod;
  };

  /**
   * Traverse recursively and return the cumulative warmup at each level
   * Returns: warmup days needed for this subtree
   */
  const traverse = (els: any[], depth = 0): number => {
    let maxWarmup = 0;
    const indent = '  '.repeat(depth);

    for (const el of els || []) {
      if (!el || typeof el !== 'object') continue;

      if (el.type === 'sort') {
        // Get this Sort's indicator period
        const sortIndicatorPeriod = extractIndicatorPeriod(el.indicator, el.params, el.period);
        console.log(`${indent}[WARMUP] Sort "${el.name || el.id}" needs ${sortIndicatorPeriod} days for ${el.indicator}`);

        // Recursively calculate warmup for children
        const childWarmup = traverse(el.children || [], depth + 1);
        console.log(`${indent}[WARMUP] Sort "${el.name || el.id}" children need ${childWarmup} days`);

        // THIS is the key: cumulative warmup = child warmup + this Sort's period
        const cumulativeWarmup = childWarmup + sortIndicatorPeriod;
        console.log(`${indent}[WARMUP] Sort "${el.name || el.id}" total cumulative: ${cumulativeWarmup} days`);

        if (cumulativeWarmup > maxWarmup) {
          maxWarmup = cumulativeWarmup;
        }

        // Don't traverse children again
        continue;
      }

      // For elements that use indicators (Gate, Scale), add their warmup
      const elementIndicatorPeriod = getElementIndicatorPeriod(el);

      // For non-sort elements, check all child branches
      const childrenArrays = [
        el.children,
        el.thenChildren,
        el.elseChildren,
        el.fromChildren,
        el.toChildren
      ];

      for (const childArray of childrenArrays) {
        if (childArray) {
          const childWarmup = traverse(childArray);
          // For non-Sort elements, warmup is max(child warmup, element's own indicator warmup)
          // not cumulative like Sort
          const totalWarmup = Math.max(childWarmup, elementIndicatorPeriod);
          if (totalWarmup > maxWarmup) {
            maxWarmup = totalWarmup;
          }
        }
      }

      // If element has no children but uses indicators, count its warmup
      if (elementIndicatorPeriod > maxWarmup) {
        maxWarmup = elementIndicatorPeriod;
      }
    }

    return maxWarmup;
  };

  return traverse(elements);
}

function collectSortIndicatorRequests(elements: any[]): Array<{ indicator: string; period: number }> {
  const result: Array<{ indicator: string; period: number }> = [];

  const traverse = (els: any[]) => {
    for (const el of els || []) {
      if (!el || typeof el !== 'object') continue;
      if (el.type === 'sort') {
        const indicator = (el.indicator || '').toUpperCase();
        const periodKey = paramsToPeriodString(el.indicator, el.params) || el.period || '';
        const parts = periodKey
          .split('-')
          .map(part => parseInt(part, 10))
          .filter(value => Number.isFinite(value));
        const effectivePeriod = parts.length ? Math.max(...parts) : 0;
        result.push({ indicator, period: effectivePeriod });
        traverse(el.children || []);
        continue;
      }
      if (el.children) traverse(el.children);
      if (el.thenChildren) traverse(el.thenChildren);
      if (el.elseChildren) traverse(el.elseChildren);
      if (el.fromChildren) traverse(el.fromChildren);
      if (el.toChildren) traverse(el.toChildren);
    }
  };

  traverse(elements);
  return result;
}

function firstAvailableDateForTicker(priceData: Record<string, any>): string | null {
  const dates = Object.keys(priceData || {}).sort();
  return dates.length > 0 ? dates[0] : null;
}

function findLatestTickerStartDate(priceData: Record<string, Record<string, any>>): string | null {
  let latest: string | null = null;
  for (const [ticker, data] of Object.entries(priceData)) {
    const first = firstAvailableDateForTicker(data);
    if (!first) continue;
    if (!latest || first > latest) {
      latest = first;
    }
  }
  return latest;
}

/**
 * Add trading days to a date (approximate - uses calendar days * 1.4)
 */
function addTradingDays(dateStr: string, tradingDays: number): string {
  const date = new Date(dateStr);
  // Rough approximation: 1 trading day ≈ 1.4 calendar days (accounts for weekends)
  const calendarDays = Math.ceil(tradingDays * 1.4);
  date.setDate(date.getDate() + calendarDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Find which logic element (Sort, Gate, Scale) requires the most warmup
 * Returns the name of the element for user notification
 */
function findWarmupCulprit(elements: any[]): string {
  let maxWarmup = 0;
  let culpritElement: string | null = null;

  const checkElement = (el: any, warmup: number) => {
    if (warmup > maxWarmup) {
      maxWarmup = warmup;
      culpritElement = el.name || el.id || el.type;
    }
  };

  const traverse = (els: any[]) => {
    for (const el of els || []) {
      if (!el || typeof el !== 'object') continue;

      if (el.type === 'sort') {
        const periodKey = paramsToPeriodString(el.indicator, el.params) || el.period || '';
        const parts = periodKey
          .split('-')
          .map((part: string) => parseInt(part, 10))
          .filter((value: number) => Number.isFinite(value));
        const period = parts.length ? Math.max(...parts) : 0;
        checkElement(el, period);
        traverse(el.children || []);
      }

      if (el.type === 'gate' && Array.isArray(el.conditions)) {
        for (const cond of el.conditions) {
          if (cond.indicator) {
            const periodKey = paramsToPeriodString(cond.indicator, cond.params) || cond.period || '';
            const parts = periodKey.split('-').map((p: string) => parseInt(p, 10)).filter((v: number) => Number.isFinite(v));
            const period = parts.length ? Math.max(...parts) : 0;
            checkElement(el, period);
          }
        }
      }

      if (el.type === 'scale' && el.config?.indicator) {
        const periodKey = paramsToPeriodString(el.config.indicator, el.config.params) || el.config.period || '';
        const parts = periodKey.split('-').map((p: string) => parseInt(p, 10)).filter((v: number) => Number.isFinite(v));
        const period = parts.length ? Math.max(...parts) : 0;
        checkElement(el, period);
      }

      // Traverse children
      const childrenArrays = [el.children, el.thenChildren, el.elseChildren, el.fromChildren, el.toChildren];
      for (const childArray of childrenArrays) {
        if (childArray) traverse(childArray);
      }
    }
  };

  traverse(elements);
  return culpritElement || 'unknown element';
}

/**
 * V2 backtest engine endpoint handler
 *
 * Complete Redis-cached backtest with simulation
 * Progress:
 * - Phase 1: Request analysis ✓
 * - Phase 2: Redis-cached data fetching ✓
 * - Phase 3: Cached indicator computation ✓
 * - Phase 4: Simulation with benchmark ✓
 */
export async function runV2Backtest(req: Request, res: Response) {
  console.log('\n=== V2 BACKTEST ENGINE ===');

  try {
    const { elements, startDate, endDate, debug = false } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Missing or invalid elements array' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    // Initialize Redis if not already connected
    if (!cache.isCacheAvailable()) {
      console.log('[V2] Initializing Redis...');
      await cache.initRedis();
    }

    // Phase 1: Extract tickers and indicators from strategy
    console.log('\n[V2] === PHASE 1: REQUEST ANALYSIS ===');

    const tickers = new Set<string>();
    function collectTickers(els: any[]): void {
      for (const el of els) {
        if (el.type === 'ticker') tickers.add(el.ticker.toUpperCase());
        if (el.children) collectTickers(el.children);
        if (el.thenChildren) collectTickers(el.thenChildren);
        if (el.elseChildren) collectTickers(el.elseChildren);
        if (el.fromChildren) collectTickers(el.fromChildren);
        if (el.toChildren) collectTickers(el.toChildren);
        if (el.type === 'sort') collectTickers(el.children || []);
      }
    }
    collectTickers(elements);

    // Always include SPY for benchmark
    tickers.add('SPY');

    const requiredIndicators = collectRequiredIndicators(elements);
    const sortIndicatorRequests = collectSortIndicatorRequests(elements).map((req) => ({
      ticker: 'SORT',
      indicator: req.indicator,
      period: req.period,
    }));

    // Add indicator tickers to price data fetch (they need price bars for indicator calculation)
    for (const ind of requiredIndicators) {
      tickers.add(ind.ticker.toUpperCase());
    }

    console.log(`[V2] Tickers: ${Array.from(tickers).join(', ')}`);
    console.log(`[V2] Indicators: ${requiredIndicators.length} unique`);
    for (const ind of requiredIndicators) {
      console.log(`[V2]   - ${ind.ticker}: ${ind.indicator}(${ind.period})`);
    }

    // Handle 'max' startDate (means "as far back as possible")
    const MAX_START = '2013-01-01'; // ~12 years back (Alpaca limit, fetch everything available)
    const userRequestedStart = (startDate && startDate !== 'max') ? startDate : null;
    const reqEndDate = endDate || getMarketDateToday();

    // ALWAYS fetch from MAX_START to get all available data
    // We'll calculate the effective start date AFTER seeing what data is actually available
    console.log(`[V2] User requested start: ${userRequestedStart || 'max'}`);
    console.log(`[V2] Fetching all available data from ${MAX_START} to ${reqEndDate}`);

    // Phase 2: Fetch price data with caching (always fetch from MAX_START)
    console.log('\n[V2] === PHASE 2: PRICE DATA FETCHING ===');
    const priceData = await fetchPriceData(
      Array.from(tickers),
      MAX_START,
      reqEndDate,
      apiKey,
      apiSecret
    );

    // Count data points fetched
    let totalBars = 0;
    for (const ticker of Object.keys(priceData)) {
      const barCount = Object.keys(priceData[ticker]).length;
      const dates = Object.keys(priceData[ticker]).sort();
      totalBars += barCount;
      console.log(`[V2] ${ticker}: ${barCount} bars (${dates[0]} to ${dates[dates.length - 1]})`);
    }

    // Phase 3: Fetch indicators with caching
    console.log('\n[V2] === PHASE 3: INDICATOR COMPUTATION ===');
    const indicatorData = await fetchIndicators(requiredIndicators, priceData);

    // Count indicator values
    let totalIndicatorValues = 0;
    for (const key of Object.keys(indicatorData)) {
      const valueCount = Object.keys(indicatorData[key]).length;
      totalIndicatorValues += valueCount;
      console.log(`[V2] ${key}: ${valueCount} values`);
    }

    // Debug: Check first indicator date
    const indicatorKeys = Object.keys(indicatorData);
    if (indicatorKeys.length > 0) {
      const firstKey = indicatorKeys[0];
      const dates = Object.keys(indicatorData[firstKey]).sort();
      console.log(`[V2] First indicator (${firstKey}) date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }

    // Phase 4: Calculate effective start date based on actual data availability + warmup
    console.log('\n[V2] === PHASE 4: CALCULATE EFFECTIVE START DATE ===');

    // Find the latest ticker start date (most restrictive)
    const tickerStarts: Record<string, string> = {};
    let latestTickerStart: string | null = null;
    let culpritTickers: string[] = [];

    for (const [ticker, data] of Object.entries(priceData)) {
      const dates = Object.keys(data).sort();
      if (dates.length > 0) {
        const firstDate = dates[0];
        tickerStarts[ticker] = firstDate;
        if (!latestTickerStart || firstDate > latestTickerStart) {
          latestTickerStart = firstDate;
          culpritTickers = [ticker];
        } else if (firstDate === latestTickerStart) {
          culpritTickers.push(ticker);
        }
      }
    }

    console.log(`[V2] Ticker data availability:`);
    for (const [ticker, startDate] of Object.entries(tickerStarts)) {
      console.log(`[V2]   ${ticker}: ${startDate}`);
    }
    console.log(`[V2] Latest ticker start: ${latestTickerStart} (${culpritTickers.join(', ')})`);

    // Calculate warmup needed for nested elements
    const nestedWarmup = calculateNestedSortWarmup(elements);
    console.log(`[V2] Nested element warmup: ${nestedWarmup} days`);

    // Calculate the effective start date: latest ticker start + warmup
    const dataBasedStart = latestTickerStart || MAX_START;
    const effectiveStartDate = addTradingDays(dataBasedStart, nestedWarmup);

    console.log(`[V2] Calculated effective start: ${effectiveStartDate}`);
    console.log(`[V2]   = ${dataBasedStart} (data start) + ${nestedWarmup} days (warmup)`);

    // Determine if we need to notify user of adjustment
    let adjustmentReason: string | null = null;
    let adjustedStartDate: string | null = null;

    if (userRequestedStart && effectiveStartDate > userRequestedStart) {
      adjustedStartDate = effectiveStartDate;
      // Determine the culprit
      if (latestTickerStart && latestTickerStart > userRequestedStart) {
        // Ticker availability is the issue
        adjustmentReason = culpritTickers.join(', ');
      } else {
        // Warmup is the issue - find which element needs it
        adjustmentReason = findWarmupCulprit(elements);
      }
      console.log(`[V2] ⚠️  Start date adjusted from ${userRequestedStart} to ${effectiveStartDate}`);
      console.log(`[V2]     Reason: ${adjustmentReason}`);
    } else if (!userRequestedStart) {
      // User requested 'max', so use effective start
      adjustedStartDate = effectiveStartDate;
      console.log(`[V2] Using effective start date: ${effectiveStartDate} (user requested 'max')`);
    }

    const simulationResult = await runSimulation(
      elements,
      priceData,
      indicatorData,
      effectiveStartDate,
      reqEndDate,
      debug
    );

    // Get cache stats
    const stats = await cache.getCacheStats();

    console.log('\n[V2] === SUMMARY ===');
    console.log(`[V2] Price data: ${totalBars} bars across ${tickers.size} tickers`);
    console.log(`[V2] Indicators: ${totalIndicatorValues} values across ${requiredIndicators.length} indicators`);
    console.log(`[V2] Simulation: ${simulationResult.dates.length} days`);
    console.log(`[V2] Final equity: ${simulationResult.equityCurve[simulationResult.equityCurve.length - 1].toFixed(4)}`);
    console.log(`[V2] CAGR: ${(simulationResult.metrics.cagr * 100).toFixed(2)}%`);
    console.log(`[V2] Sharpe: ${simulationResult.metrics.sharpe.toFixed(2)}`);
    console.log(`[V2] Max Drawdown: ${(simulationResult.metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`[V2] Cache: ${stats.keyCount} keys, ${stats.memoryUsage}`);

    // Return real backtest results
    const response: any = {
      dates: simulationResult.dates,
      equityCurve: simulationResult.equityCurve,
      dailyPositions: simulationResult.dailyPositions,
      metrics: simulationResult.metrics,
      benchmark: {
        dates: simulationResult.dates,
        equityCurve: simulationResult.benchmark,
        metrics: simulationResult.benchmarkMetrics,
      },
      // Metadata for debugging
      _v2Metadata: {
        cacheAvailable: cache.isCacheAvailable(),
        cacheStats: stats,
        phase1: {
          tickersFetched: Array.from(tickers),
          indicatorsRequired: requiredIndicators.length,
        },
        phase2: {
          totalBars,
          dateRange: { start: effectiveStartDate, end: reqEndDate },
        },
        phase3: {
          totalIndicatorValues,
        },
        phase4: {
          daysSimulated: simulationResult.dates.length,
        },
      },
    };

    // Add start date adjustment notification if needed
    if (adjustedStartDate && adjustmentReason) {
      response.startDateAdjustment = {
        requestedStart: userRequestedStart,
        adjustedStart: adjustedStartDate,
        reason: adjustmentReason,
      };
    }

    return res.json(response);
  } catch (err: any) {
    console.error('[V2] Error:', err);
    return res.status(500).json({
      error: err.message || 'V2 backtest failed',
      details: err.stack,
    });
  }
}
