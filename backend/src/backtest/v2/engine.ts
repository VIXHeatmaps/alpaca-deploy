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

    console.log(`[V2] Tickers: ${Array.from(tickers).join(', ')}`);
    console.log(`[V2] Indicators: ${requiredIndicators.length} unique`);
    for (const ind of requiredIndicators) {
      console.log(`[V2]   - ${ind.ticker}: ${ind.indicator}(${ind.period})`);
    }

    const reqStartDate = startDate || '2024-01-01';
    const reqEndDate = endDate || '2024-12-31';

    // Phase 2: Fetch price data with caching
    console.log('\n[V2] === PHASE 2: PRICE DATA FETCHING ===');
    const priceData = await fetchPriceData(
      Array.from(tickers),
      reqStartDate,
      reqEndDate,
      apiKey,
      apiSecret
    );

    // Count data points fetched
    let totalBars = 0;
    for (const ticker of Object.keys(priceData)) {
      const barCount = Object.keys(priceData[ticker]).length;
      totalBars += barCount;
      console.log(`[V2] ${ticker}: ${barCount} bars`);
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
