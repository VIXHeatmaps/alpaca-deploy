/**
 * Redis Cache Service
 *
 * Manages Redis connection and cache operations for backtest data.
 */

import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
  if (redisClient && isConnected) {
    console.log('[CACHE] Redis already connected');
    return;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = createClient({
      url: redisUrl,
    });

    redisClient.on('error', (err) => {
      console.error('[CACHE] Redis error:', err);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('[CACHE] Redis connecting...');
    });

    redisClient.on('ready', () => {
      console.log('[CACHE] Redis connected and ready');
      isConnected = true;
    });

    redisClient.on('end', () => {
      console.log('[CACHE] Redis connection closed');
      isConnected = false;
    });

    await redisClient.connect();

    console.log('[CACHE] Redis initialized successfully');
  } catch (err: any) {
    console.error('[CACHE] Failed to initialize Redis:', err.message);
    console.error('[CACHE] Continuing without cache - will fetch all data fresh');
    isConnected = false;
    redisClient = null;
  }
}

/**
 * Get Redis client (for direct operations)
 */
export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

/**
 * Check if Redis is connected
 */
export function isCacheAvailable(): boolean {
  return isConnected && redisClient !== null;
}

/**
 * Get a single value from cache
 */
export async function get(key: string): Promise<string | null> {
  if (!isCacheAvailable()) {
    return null;
  }

  try {
    const value = await redisClient!.get(key);
    if (value !== null && value !== undefined) {
      console.log(`[CACHE] HIT: ${key}`);
      return value as string;
    } else {
      console.log(`[CACHE] MISS: ${key}`);
      return null;
    }
  } catch (err: any) {
    console.error(`[CACHE] Error getting key ${key}:`, err.message);
    return null;
  }
}

/**
 * Set a single value in cache
 */
export async function set(key: string, value: string, ttl?: number): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false;
  }

  try {
    if (ttl) {
      await redisClient!.setEx(key, ttl, value);
    } else {
      await redisClient!.set(key, value);
    }
    console.log(`[CACHE] SET: ${key}${ttl ? ` (TTL: ${ttl}s)` : ' (permanent)'}`);
    return true;
  } catch (err: any) {
    console.error(`[CACHE] Error setting key ${key}:`, err.message);
    return false;
  }
}

/**
 * Get multiple values from cache (batch operation)
 */
export async function mget(keys: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (!isCacheAvailable() || keys.length === 0) {
    return result;
  }

  try {
    const values = await redisClient!.mGet(keys);

    let hits = 0;
    let misses = 0;

    for (let i = 0; i < keys.length; i++) {
      if (values[i] !== null && values[i] !== undefined) {
        result.set(keys[i], values[i] as string);
        hits++;
      } else {
        misses++;
      }
    }

    console.log(`[CACHE] MGET: ${keys.length} keys → ${hits} hits, ${misses} misses`);
    return result;
  } catch (err: any) {
    console.error('[CACHE] Error in MGET:', err.message);
    return result;
  }
}

/**
 * Set multiple values in cache (batch operation)
 */
export async function mset(keyValuePairs: Array<{ key: string; value: string; ttl?: number }>): Promise<boolean> {
  if (!isCacheAvailable() || keyValuePairs.length === 0) {
    return false;
  }

  try {
    // Separate items with TTL from those without
    const permanentItems: Array<[string, string]> = [];
    const ttlItems: Array<{ key: string; value: string; ttl: number }> = [];

    for (const item of keyValuePairs) {
      if (item.ttl) {
        ttlItems.push({ key: item.key, value: item.value, ttl: item.ttl });
      } else {
        permanentItems.push([item.key, item.value]);
      }
    }

    // Set permanent items in batch
    if (permanentItems.length > 0) {
      await redisClient!.mSet(permanentItems);
    }

    // Set TTL items individually (Redis doesn't support batch SETEX)
    for (const item of ttlItems) {
      await redisClient!.setEx(item.key, item.ttl, item.value);
    }

    console.log(`[CACHE] MSET: ${keyValuePairs.length} keys (${permanentItems.length} permanent, ${ttlItems.length} with TTL)`);
    return true;
  } catch (err: any) {
    console.error('[CACHE] Error in MSET:', err.message);
    return false;
  }
}

/**
 * Check if a date should be cached (T-2 or older only)
 * Decision #7: Don't cache recent data (T-1, T-0)
 */
export function shouldCache(date: string): boolean {
  const targetDate = new Date(date);
  const now = new Date();

  // Calculate days difference
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDiff = Math.floor((now.getTime() - targetDate.getTime()) / msPerDay);

  // Only cache data that's 2+ days old (T-2 or older)
  return daysDiff >= 2;
}

/**
 * Delete a single key from cache
 */
export async function del(key: string): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false;
  }

  try {
    await redisClient!.del(key);
    console.log(`[CACHE] DEL: ${key}`);
    return true;
  } catch (err: any) {
    console.error(`[CACHE] Error deleting key ${key}:`, err.message);
    return false;
  }
}

/**
 * Flush entire cache (purge all data)
 * Used for scheduled cache purges at 4pm and 8pm ET
 */
export async function flushAll(): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false;
  }

  try {
    await redisClient!.flushAll();
    console.log('[CACHE] FLUSH: All cache data purged');
    return true;
  } catch (err: any) {
    console.error('[CACHE] Error flushing cache:', err.message);
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  isConnected: boolean;
  keyCount: number;
  memoryUsage?: string;
}> {
  if (!isCacheAvailable()) {
    return {
      isConnected: false,
      keyCount: 0,
    };
  }

  try {
    const keyCount = await redisClient!.dbSize();
    const info = await redisClient!.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';

    return {
      isConnected: true,
      keyCount,
      memoryUsage,
    };
  } catch (err: any) {
    console.error('[CACHE] Error getting stats:', err.message);
    return {
      isConnected: true,
      keyCount: 0,
    };
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      console.log('[CACHE] Redis connection closed gracefully');
    } catch (err: any) {
      console.error('[CACHE] Error closing Redis:', err.message);
    }
    redisClient = null;
    isConnected = false;
  }
}
