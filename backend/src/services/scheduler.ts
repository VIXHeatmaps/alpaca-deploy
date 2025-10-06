/**
 * T-10 Rebalancing Scheduler
 *
 * Schedules automatic portfolio rebalancing at T-10 (10 minutes before market close)
 * Uses Alpaca clock API to determine market hours
 */

import { rebalanceActiveStrategy } from './rebalance';
import { hasActiveStrategy } from '../storage/activeStrategy';

type AlpacaClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

let schedulerInterval: NodeJS.Timeout | null = null;
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
 * Calculate milliseconds until T-10 (10 minutes before next market close)
 */
async function getMillisecondsUntilT10(key: string, secret: string): Promise<number> {
  const clock = await getMarketClock(key, secret);
  const now = new Date(clock.timestamp);
  const nextClose = new Date(clock.next_close);

  // T-10 is 10 minutes before close
  const t10Time = new Date(nextClose.getTime() - 10 * 60 * 1000);

  // If T-10 has already passed today, use tomorrow's T-10
  if (now >= t10Time) {
    // Market closes today, next T-10 will be tomorrow
    // For simplicity, check again in 1 hour
    console.log('T-10 already passed for today, will check again in 1 hour');
    return 60 * 60 * 1000; // 1 hour
  }

  const msUntilT10 = t10Time.getTime() - now.getTime();
  console.log(`Next T-10 rebalance scheduled for: ${t10Time.toISOString()} (in ${(msUntilT10 / 1000 / 60).toFixed(1)} minutes)`);

  return msUntilT10;
}

/**
 * Execute T-10 rebalance if there's an active strategy
 */
async function executeT10Rebalance() {
  try {
    console.log('\n[T-10 SCHEDULER] Checking for active strategy...');

    if (!await hasActiveStrategy()) {
      console.log('[T-10 SCHEDULER] No active strategy - skipping rebalance');
      return;
    }

    console.log('[T-10 SCHEDULER] Active strategy found - starting rebalance');
    const result = await rebalanceActiveStrategy(apiKey, apiSecret);

    console.log('[T-10 SCHEDULER] Rebalance completed:');
    console.log(`  Sold: ${result.soldSymbols.join(', ') || 'none'}`);
    console.log(`  Bought: ${result.boughtSymbols.join(', ') || 'none'}`);
    console.log(`  Cash remaining: $${result.cashRemaining.toFixed(2)}`);
  } catch (err: any) {
    console.error('[T-10 SCHEDULER] Rebalance failed:', err.message);
  } finally {
    // Schedule next rebalance
    scheduleNextRebalance();
  }
}

/**
 * Schedule the next T-10 rebalance
 */
async function scheduleNextRebalance() {
  try {
    const msUntilT10 = await getMillisecondsUntilT10(apiKey, apiSecret);

    // Clear existing timeout
    if (schedulerInterval) {
      clearTimeout(schedulerInterval);
    }

    // Schedule next rebalance
    schedulerInterval = setTimeout(executeT10Rebalance, msUntilT10);
  } catch (err: any) {
    console.error('[T-10 SCHEDULER] Error scheduling next rebalance:', err.message);
    // Retry in 10 minutes
    schedulerInterval = setTimeout(scheduleNextRebalance, 10 * 60 * 1000);
  }
}

/**
 * Start the T-10 rebalancing scheduler
 */
export async function startT10Scheduler(key: string, secret: string) {
  apiKey = key;
  apiSecret = secret;

  console.log('[T-10 SCHEDULER] Starting automatic rebalancing scheduler...');

  // Schedule first rebalance
  await scheduleNextRebalance();

  console.log('[T-10 SCHEDULER] Scheduler started successfully');
}

/**
 * Stop the T-10 rebalancing scheduler
 */
export function stopT10Scheduler() {
  if (schedulerInterval) {
    clearTimeout(schedulerInterval);
    schedulerInterval = null;
    console.log('[T-10 SCHEDULER] Scheduler stopped');
  }
}
