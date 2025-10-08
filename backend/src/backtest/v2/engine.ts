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

/**
 * V2 backtest engine endpoint handler
 *
 * Current: Testing indicator caching
 * Progress:
 * - Phase 1: Request analysis ✓
 * - Phase 2: Redis-cached data fetching ✓
 * - Phase 3: Cached indicator computation ← TESTING NOW
 * - Phase 4: Simulation with benchmark (TODO)
 */
export async function runV2Backtest(req: Request, res: Response) {
  console.log('\n=== V2 BACKTEST ENGINE (TESTING INDICATORS) ===');

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

    // Get cache stats
    const stats = await cache.getCacheStats();

    console.log('\n[V2] === SUMMARY ===');
    console.log(`[V2] Price data: ${totalBars} bars across ${tickers.size} tickers`);
    console.log(`[V2] Indicators: ${totalIndicatorValues} values across ${requiredIndicators.length} indicators`);
    console.log(`[V2] Cache: ${stats.keyCount} keys, ${stats.memoryUsage}`);

    // Return test data
    return res.json({
      message: 'V2 Engine - Indicator cache test',
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
        indicatorKeys: Object.keys(indicatorData),
      },
      // Mock backtest results for now
      dates: Object.keys(priceData.SPY || {}).slice(0, 10),
      equityCurve: [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09],
      metrics: {
        totalReturn: 0.09,
        cagr: 0.15,
        volatility: 0.18,
        sharpe: 0.83,
        maxDrawdown: 0.05,
      },
      benchmark: {
        dates: Object.keys(priceData.SPY || {}).slice(0, 10),
        equityCurve: [1.0, 1.005, 1.01, 1.015, 1.02, 1.025, 1.03, 1.035, 1.04, 1.045],
        metrics: {
          totalReturn: 0.045,
          cagr: 0.08,
          volatility: 0.12,
          sharpe: 0.67,
          maxDrawdown: 0.02,
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
