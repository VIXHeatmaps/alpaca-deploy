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
 * Subtract trading days from a date (approximate - uses calendar days * 1.4)
 */
function subtractTradingDays(dateStr: string, tradingDays: number): string {
  const date = new Date(dateStr);
  // Rough approximation: 1 trading day ≈ 1.4 calendar days (accounts for weekends)
  const calendarDays = Math.ceil(tradingDays * 1.4);
  date.setDate(date.getDate() - calendarDays);
  return date.toISOString().slice(0, 10);
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
    const { elements, startDate, endDate } = req.body;

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
      }
    }
    collectTickers(elements);

    // Always include SPY for benchmark
    tickers.add('SPY');

    const requiredIndicators = collectRequiredIndicators(elements);

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
    const MAX_START = '2015-01-01'; // 10 years back (Alpaca doesn't have data before ~2015)
    const reqStartDate = (startDate && startDate !== 'max') ? startDate : MAX_START;
    const reqEndDate = endDate || new Date().toISOString().slice(0, 10);

    // Calculate warmup period needed for indicators
    const warmupDays = calculateWarmupDays(requiredIndicators);
    console.log(`[V2] Warmup needed: ${warmupDays} trading days`);

    // Extend start date backwards for indicator warmup
    const dataStartDate = subtractTradingDays(reqStartDate, warmupDays);
    console.log(`[V2] Fetching data from ${dataStartDate} (${warmupDays}d warmup) to ${reqEndDate}`);

    // Phase 2: Fetch price data with caching (extended range for warmup)
    console.log('\n[V2] === PHASE 2: PRICE DATA FETCHING ===');
    const priceData = await fetchPriceData(
      Array.from(tickers),
      dataStartDate,
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

    // Phase 4: Run simulation with pre-fetched data
    console.log('\n[V2] === PHASE 4: SIMULATION ===');
    const simulationResult = await runSimulation(
      elements,
      priceData,
      indicatorData,
      reqStartDate,
      reqEndDate
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
    return res.json({
      dates: simulationResult.dates,
      equityCurve: simulationResult.equityCurve,
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
          dateRange: { start: reqStartDate, end: reqEndDate },
        },
        phase3: {
          totalIndicatorValues,
        },
        phase4: {
          daysSimulated: simulationResult.dates.length,
        },
      },
    });
  } catch (err: any) {
    console.error('[V2] Error:', err);
    return res.status(500).json({
      error: err.message || 'V2 backtest failed',
      details: err.stack,
    });
  }
}
