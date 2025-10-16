/**
 * Daily Snapshot Scheduler
 *
 * Creates end-of-day snapshots for all active strategies at 4:05pm ET
 * Records equity, holdings, and returns for performance tracking
 */

import { getAllActiveStrategies } from '../db/activeStrategiesDb';
import { upsertSnapshot } from '../db/activeStrategySnapshotsDb';
import axios from 'axios';

type AlpacaClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

let snapshotInterval: NodeJS.Timeout | null = null;
let apiKey: string = '';
let apiSecret: string = '';

/**
 * Get market clock from Alpaca
 */
async function getMarketClock(key: string, secret: string): Promise<AlpacaClock> {
  const response = await fetch('https://paper-api.alpaca.markets/v2/clock', {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca clock API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current price for a symbol
 */
async function getCurrentPrice(symbol: string, key: string, secret: string): Promise<number> {
  const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars/latest`;
  const response = await axios.get(url, {
    params: { feed: 'iex' },
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
    timeout: 10000,
  });

  return response.data?.bar?.c || 0;
}

/**
 * Calculate milliseconds until 4:05pm ET (5 minutes after market close)
 */
async function getMillisecondsUntilSnapshot(key: string, secret: string): Promise<number> {
  const clock = await getMarketClock(key, secret);
  const now = new Date(clock.timestamp);
  const nextClose = new Date(clock.next_close);

  // Snapshot time is 5 minutes after close (4:05pm ET)
  const snapshotTime = new Date(nextClose.getTime() + 5 * 60 * 1000);

  // If snapshot time has already passed today, schedule for tomorrow
  if (now >= snapshotTime) {
    console.log('[SNAPSHOT] Snapshot time already passed for today, will check again in 1 hour');
    return 60 * 60 * 1000; // 1 hour
  }

  const msUntilSnapshot = snapshotTime.getTime() - now.getTime();
  console.log(`[SNAPSHOT] Next snapshot scheduled for: ${snapshotTime.toISOString()} (in ${(msUntilSnapshot / 1000 / 60).toFixed(1)} minutes)`);

  return msUntilSnapshot;
}

/**
 * Create snapshots for all active strategies
 */
async function createDailySnapshots() {
  try {
    console.log('\n[SNAPSHOT] Creating daily snapshots...');

    const strategies = await getAllActiveStrategies();

    if (strategies.length === 0) {
      console.log('[SNAPSHOT] No active strategies - skipping snapshots');
      return;
    }

    console.log(`[SNAPSHOT] Found ${strategies.length} active strategies`);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    for (const strategy of strategies) {
      try {
        console.log(`[SNAPSHOT] Creating snapshot for strategy ${strategy.id}: ${strategy.name}`);

        const holdings = strategy.holdings || [];

        if (holdings.length === 0) {
          console.log(`[SNAPSHOT]   No holdings yet - skipping snapshot`);
          continue;
        }

        // Calculate total equity from holdings using CURRENT market prices
        let totalEquity = 0;
        const holdingsWithPrices = [];

        for (const holding of holdings) {
          // Always use current price for daily snapshots (not entry price)
          const price = await getCurrentPrice(holding.symbol, apiKey, apiSecret);
          const value = holding.qty * price;
          totalEquity += value;

          holdingsWithPrices.push({
            symbol: holding.symbol,
            qty: holding.qty,
            price,
            value,
          });
        }

        // Calculate returns
        const initialCapital = parseFloat(strategy.initial_capital);
        const totalReturn = totalEquity - initialCapital;
        const cumulativeReturn = initialCapital > 0 ? totalReturn / initialCapital : 0;

        // TODO: Calculate daily return by comparing to previous snapshot
        const dailyReturn = null; // Will implement in next iteration

        console.log(`[SNAPSHOT]   Equity: $${totalEquity.toFixed(2)}`);
        console.log(`[SNAPSHOT]   Return: ${(cumulativeReturn * 100).toFixed(2)}%`);

        // Save snapshot
        await upsertSnapshot({
          active_strategy_id: strategy.id,
          snapshot_date: today,
          equity: totalEquity,
          holdings: holdingsWithPrices,
          daily_return: dailyReturn,
          cumulative_return: cumulativeReturn,
          total_return: totalReturn,
          rebalance_type: 'daily',
        });

        console.log(`[SNAPSHOT]   ✓ Snapshot saved`);

      } catch (err: any) {
        console.error(`[SNAPSHOT] Error creating snapshot for strategy ${strategy.id}:`, err.message);
      }
    }

    console.log('[SNAPSHOT] Daily snapshots completed\n');

  } catch (err: any) {
    console.error('[SNAPSHOT] Snapshot creation failed:', err.message);
  } finally {
    // Schedule next snapshot
    scheduleNextSnapshot();
  }
}

/**
 * Schedule the next daily snapshot
 */
async function scheduleNextSnapshot() {
  try {
    const msUntilSnapshot = await getMillisecondsUntilSnapshot(apiKey, apiSecret);

    // Clear existing timeout
    if (snapshotInterval) {
      clearTimeout(snapshotInterval);
    }

    // Schedule next snapshot
    snapshotInterval = setTimeout(createDailySnapshots, msUntilSnapshot);
  } catch (err: any) {
    console.error('[SNAPSHOT] Error scheduling next snapshot:', err.message);
    // Retry in 10 minutes
    snapshotInterval = setTimeout(scheduleNextSnapshot, 10 * 60 * 1000);
  }
}

/**
 * Start the daily snapshot scheduler
 */
export async function startSnapshotScheduler(key: string, secret: string) {
  apiKey = key;
  apiSecret = secret;

  console.log('[SNAPSHOT] Starting daily snapshot scheduler...');

  // Schedule first snapshot
  await scheduleNextSnapshot();

  console.log('[SNAPSHOT] Snapshot scheduler started successfully');
}

/**
 * Stop the daily snapshot scheduler
 */
export function stopSnapshotScheduler() {
  if (snapshotInterval) {
    clearTimeout(snapshotInterval);
    snapshotInterval = null;
    console.log('[SNAPSHOT] Snapshot scheduler stopped');
  }
}

/**
 * Manually trigger snapshot creation (for testing)
 */
export async function createSnapshotsNow(key: string, secret: string) {
  apiKey = key;
  apiSecret = secret;
  await createDailySnapshots();
}
