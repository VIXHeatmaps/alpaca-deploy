/**
 * Cache Purge Scheduler
 *
 * Schedules automatic cache purges at 4pm and 8pm ET (Decision #7)
 * - 4pm ET: Market close - prepare for new data
 * - 8pm ET: Settlement complete - ensure official data
 */

import * as cron from 'node-cron';
import * as cache from './cacheService';

let purgeScheduler4pm: cron.ScheduledTask | null = null;
let purgeScheduler8pm: cron.ScheduledTask | null = null;

/**
 * Start cache purge scheduler
 *
 * Schedules purges at:
 * - 4:00 PM ET (16:00 Eastern)
 * - 8:00 PM ET (20:00 Eastern)
 */
export async function startCachePurgeScheduler(): Promise<void> {
  console.log('[PURGE SCHEDULER] Initializing cache purge scheduler...');

  // Ensure Redis is initialized
  if (!cache.isCacheAvailable()) {
    console.log('[PURGE SCHEDULER] Redis not available, initializing...');
    await cache.initRedis();
  }

  if (!cache.isCacheAvailable()) {
    console.log('[PURGE SCHEDULER] Redis unavailable - scheduler disabled');
    return;
  }

  // Schedule 4pm ET purge
  // Cron format: minute hour * * *
  // ET is UTC-5 (standard) or UTC-4 (daylight)
  // For simplicity, using America/New_York timezone
  purgeScheduler4pm = cron.schedule(
    '0 16 * * *', // 4:00 PM every day
    async () => {
      console.log('\n[PURGE SCHEDULER] ⏰ 4:00 PM ET - Market close - Purging cache...');
      const success = await cache.flushAll();
      if (success) {
        console.log('[PURGE SCHEDULER] ✓ Cache purged successfully at 4pm ET');
      } else {
        console.error('[PURGE SCHEDULER] ✗ Failed to purge cache at 4pm ET');
      }
    },
    {
      timezone: 'America/New_York',
    }
  );

  // Schedule 8pm ET purge
  purgeScheduler8pm = cron.schedule(
    '0 20 * * *', // 8:00 PM every day
    async () => {
      console.log('\n[PURGE SCHEDULER] ⏰ 8:00 PM ET - Settlement complete - Purging cache...');
      const success = await cache.flushAll();
      if (success) {
        console.log('[PURGE SCHEDULER] ✓ Cache purged successfully at 8pm ET');
      } else {
        console.error('[PURGE SCHEDULER] ✗ Failed to purge cache at 8pm ET');
      }
    },
    {
      timezone: 'America/New_York',
    }
  );

  console.log('[PURGE SCHEDULER] ✓ Cache purge scheduler started');
  console.log('[PURGE SCHEDULER] → Daily purges scheduled:');
  console.log('[PURGE SCHEDULER]   • 4:00 PM ET (market close)');
  console.log('[PURGE SCHEDULER]   • 8:00 PM ET (settlement complete)');
  console.log('[PURGE SCHEDULER]   Timezone: America/New_York');
}

/**
 * Stop cache purge scheduler (for graceful shutdown)
 */
export function stopCachePurgeScheduler(): void {
  console.log('[PURGE SCHEDULER] Stopping cache purge scheduler...');

  if (purgeScheduler4pm) {
    purgeScheduler4pm.stop();
    purgeScheduler4pm = null;
    console.log('[PURGE SCHEDULER] Stopped 4pm ET purge schedule');
  }

  if (purgeScheduler8pm) {
    purgeScheduler8pm.stop();
    purgeScheduler8pm = null;
    console.log('[PURGE SCHEDULER] Stopped 8pm ET purge schedule');
  }

  console.log('[PURGE SCHEDULER] ✓ Scheduler stopped');
}

/**
 * Manually trigger cache purge (for testing)
 */
export async function manualPurge(): Promise<boolean> {
  console.log('[PURGE SCHEDULER] Manual cache purge triggered');
  const success = await cache.flushAll();
  if (success) {
    console.log('[PURGE SCHEDULER] ✓ Manual purge successful');
  } else {
    console.error('[PURGE SCHEDULER] ✗ Manual purge failed');
  }
  return success;
}

/**
 * Get next scheduled purge times
 */
export function getNextPurgeTimes(): {
  next4pmET: string | null;
  next8pmET: string | null;
} {
  const now = new Date();
  const todayET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  // Calculate next 4pm ET
  const next4pm = new Date(todayET);
  next4pm.setHours(16, 0, 0, 0);
  if (next4pm <= todayET) {
    next4pm.setDate(next4pm.getDate() + 1);
  }

  // Calculate next 8pm ET
  const next8pm = new Date(todayET);
  next8pm.setHours(20, 0, 0, 0);
  if (next8pm <= todayET) {
    next8pm.setDate(next8pm.getDate() + 1);
  }

  return {
    next4pmET: next4pm.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    next8pmET: next8pm.toLocaleString('en-US', { timeZone: 'America/New_York' }),
  };
}
