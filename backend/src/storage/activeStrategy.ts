/**
 * Active Strategy Storage
 *
 * For MVP: Single active strategy stored in a JSON file
 * Persists across server restarts
 */

import fs from 'fs/promises';
import path from 'path';

const STORAGE_FILE = path.join(__dirname, '../../data/activeStrategy.json');

export type ActiveStrategy = {
  id: string;
  name: string;
  investAmount: number;           // Initial investment
  currentValue: number;            // Updated after each rebalance
  flowData: {
    nodes: any[];
    edges: any[];
    globals: any;
  };
  holdings: Array<{
    symbol: string;
    qty: number;
  }>;
  pendingOrders?: Array<{          // Orders waiting to fill
    orderId: string;
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
  }>;
  createdAt: string;
  lastRebalance: string | null;
};

/**
 * Ensure storage directory exists
 */
async function ensureStorageDir() {
  const dir = path.dirname(STORAGE_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.warn('Failed to create storage directory:', err);
  }
}

/**
 * Load active strategy from disk
 */
export async function getActiveStrategy(): Promise<ActiveStrategy | null> {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    const strategy = JSON.parse(data);
    return strategy;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null; // File doesn't exist yet
    }
    console.error('Failed to load active strategy:', err);
    return null;
  }
}

/**
 * Save active strategy to disk
 */
export async function setActiveStrategy(strategy: ActiveStrategy): Promise<void> {
  await ensureStorageDir();
  try {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(strategy, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save active strategy:', err);
    throw err;
  }
}

/**
 * Clear active strategy (delete file)
 */
export async function clearActiveStrategy(): Promise<void> {
  try {
    await fs.unlink(STORAGE_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to clear active strategy:', err);
    }
  }
}

/**
 * Check if an active strategy exists
 */
export async function hasActiveStrategy(): Promise<boolean> {
  const strategy = await getActiveStrategy();
  return strategy !== null;
}
