/**
 * V2 BACKTEST ENGINE
 *
 * New Redis-cached backtest implementation.
 * All new development happens here.
 */

import { Request, Response } from 'express';
import * as cache from './cacheService';
import { fetchPriceData } from './dataFetcher';

/**
 * V2 backtest engine endpoint handler
 *
 * Current: Testing data fetcher with caching
 * TODO: Implement full backtest logic with:
 * - Phase 1: Request analysis
 * - Phase 2: Redis-cached data fetching ← TESTING NOW
 * - Phase 3: Cached indicator computation
 * - Phase 4: Simulation with benchmark
 */
export async function runV2Backtest(req: Request, res: Response) {
  console.log('\n=== V2 BACKTEST ENGINE (TESTING DATA FETCHER) ===');

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

    // Extract tickers from strategy elements
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

    console.log(`[V2] Tickers to fetch: ${Array.from(tickers).join(', ')}`);

    const reqStartDate = startDate || '2024-01-01';
    const reqEndDate = endDate || '2024-12-31';

    // Test data fetcher with caching
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

    // Get cache stats
    const stats = await cache.getCacheStats();

    // Return test data
    return res.json({
      message: 'V2 Engine - Data fetcher test',
      cacheAvailable: cache.isCacheAvailable(),
      cacheStats: stats,
      tickersFetched: Array.from(tickers),
      totalBars,
      dateRange: { start: reqStartDate, end: reqEndDate },
      sampleData: {
        SPY: Object.keys(priceData.SPY || {}).slice(0, 5), // First 5 dates
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
