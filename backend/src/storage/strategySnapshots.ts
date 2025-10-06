/**
 * Strategy Snapshots Storage
 *
 * Stores daily equity snapshots for each strategy to track performance over time.
 * Snapshots are taken after each rebalance (T-10) with actual filled prices.
 */

import fs from 'fs/promises';
import path from 'path';

const SNAPSHOTS_DIR = path.join(__dirname, '../../data/snapshots');

export type StrategySnapshot = {
  strategyId: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO timestamp
  portfolioValue: number;
  holdings: Array<{
    symbol: string;
    qty: number;
    price: number;
    value: number;
  }>;
  totalReturn: number; // portfolioValue - initialInvestment
  totalReturnPct: number; // (totalReturn / initialInvestment) * 100
  rebalanceType?: 'initial' | 'daily' | 'liquidation';
};

/**
 * Ensure snapshots directory exists
 */
async function ensureSnapshotsDir(): Promise<void> {
  try {
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Get path to snapshot file for a strategy
 */
function getSnapshotFilePath(strategyId: string): string {
  return path.join(SNAPSHOTS_DIR, `${strategyId}.json`);
}

/**
 * Load all snapshots for a strategy
 */
export async function getSnapshots(strategyId: string): Promise<StrategySnapshot[]> {
  try {
    const filePath = getSnapshotFilePath(strategyId);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return []; // No snapshots yet
    }
    throw err;
  }
}

/**
 * Get the latest snapshot for a strategy
 */
export async function getLatestSnapshot(strategyId: string): Promise<StrategySnapshot | null> {
  const snapshots = await getSnapshots(strategyId);
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1];
}

/**
 * Add a new snapshot for a strategy
 */
export async function addSnapshot(snapshot: StrategySnapshot): Promise<void> {
  await ensureSnapshotsDir();

  const filePath = getSnapshotFilePath(snapshot.strategyId);
  const snapshots = await getSnapshots(snapshot.strategyId);

  // Add new snapshot
  snapshots.push(snapshot);

  // Write back to file
  await fs.writeFile(filePath, JSON.stringify(snapshots, null, 2), 'utf-8');
}

/**
 * Create a snapshot from current strategy state
 */
export async function createSnapshot(
  strategyId: string,
  initialInvestment: number,
  holdings: Array<{ symbol: string; qty: number; price: number }>,
  rebalanceType: 'initial' | 'daily' | 'liquidation' = 'daily'
): Promise<StrategySnapshot> {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Calculate portfolio value
  const holdingsWithValue = holdings.map(h => ({
    symbol: h.symbol,
    qty: h.qty,
    price: h.price,
    value: h.qty * h.price,
  }));

  const portfolioValue = holdingsWithValue.reduce((sum, h) => sum + h.value, 0);
  const totalReturn = portfolioValue - initialInvestment;
  const totalReturnPct = initialInvestment > 0 ? (totalReturn / initialInvestment) * 100 : 0;

  const snapshot: StrategySnapshot = {
    strategyId,
    date,
    timestamp: now.toISOString(),
    portfolioValue,
    holdings: holdingsWithValue,
    totalReturn,
    totalReturnPct,
    rebalanceType,
  };

  await addSnapshot(snapshot);

  return snapshot;
}

/**
 * Delete all snapshots for a strategy (e.g., when liquidated)
 */
export async function deleteSnapshots(strategyId: string): Promise<void> {
  try {
    const filePath = getSnapshotFilePath(strategyId);
    await fs.unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    // File doesn't exist, nothing to delete
  }
}

/**
 * Get snapshots within a date range
 */
export async function getSnapshotsByDateRange(
  strategyId: string,
  startDate: string,
  endDate: string
): Promise<StrategySnapshot[]> {
  const snapshots = await getSnapshots(strategyId);
  return snapshots.filter(s => s.date >= startDate && s.date <= endDate);
}
