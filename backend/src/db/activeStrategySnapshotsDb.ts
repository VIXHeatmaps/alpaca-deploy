/**
 * Database service for active_strategy_snapshots
 *
 * Provides CRUD operations for strategy performance snapshots
 */

import db from './connection';

export interface ActiveStrategySnapshotDb {
  id: number;
  active_strategy_id: number;
  snapshot_date: string; // Date stored as string
  equity: string; // DECIMAL stored as string
  holdings: any | null; // JSONB
  daily_return: string | null; // DECIMAL
  cumulative_return: string | null; // DECIMAL
  total_return: string | null; // DECIMAL
  rebalance_type: 'initial' | 'daily' | 'liquidation' | null;
  created_at: Date;
}

export interface CreateSnapshotInput {
  active_strategy_id: number;
  snapshot_date: string; // YYYY-MM-DD
  equity: number;
  holdings?: Array<{
    symbol: string;
    qty: number;
    price: number;
    value: number;
  }>;
  daily_return?: number;
  cumulative_return?: number;
  total_return?: number;
  rebalance_type?: 'initial' | 'daily' | 'liquidation';
}

/**
 * Create a new snapshot
 */
export async function createSnapshot(input: CreateSnapshotInput): Promise<ActiveStrategySnapshotDb> {
  const snapshotData: any = {
    active_strategy_id: input.active_strategy_id,
    snapshot_date: input.snapshot_date,
    equity: input.equity,
    holdings: input.holdings ? JSON.stringify(input.holdings) : null,
    daily_return: input.daily_return ?? null,
    cumulative_return: input.cumulative_return ?? null,
    total_return: input.total_return ?? null,
    rebalance_type: input.rebalance_type || null,
  };

  const [created] = await db('active_strategy_snapshots')
    .insert(snapshotData)
    .returning('*');

  return parseSnapshot(created);
}

/**
 * Get all snapshots for a strategy
 */
export async function getSnapshotsByStrategyId(
  activeStrategyId: number
): Promise<ActiveStrategySnapshotDb[]> {
  const snapshots = await db('active_strategy_snapshots')
    .where({ active_strategy_id: activeStrategyId })
    .orderBy('snapshot_date', 'asc');

  return snapshots.map(parseSnapshot);
}

/**
 * Get latest snapshot for a strategy
 */
export async function getLatestSnapshot(
  activeStrategyId: number
): Promise<ActiveStrategySnapshotDb | null> {
  const snapshot = await db('active_strategy_snapshots')
    .where({ active_strategy_id: activeStrategyId })
    .orderBy('snapshot_date', 'desc')
    .first();

  return snapshot ? parseSnapshot(snapshot) : null;
}

/**
 * Get snapshot for specific date
 */
export async function getSnapshotByDate(
  activeStrategyId: number,
  snapshotDate: string
): Promise<ActiveStrategySnapshotDb | null> {
  const snapshot = await db('active_strategy_snapshots')
    .where({
      active_strategy_id: activeStrategyId,
      snapshot_date: snapshotDate,
    })
    .first();

  return snapshot ? parseSnapshot(snapshot) : null;
}

/**
 * Update or create snapshot (upsert)
 */
export async function upsertSnapshot(input: CreateSnapshotInput): Promise<ActiveStrategySnapshotDb> {
  const existing = await getSnapshotByDate(input.active_strategy_id, input.snapshot_date);

  if (existing) {
    // Update existing
    const updateData: any = {
      equity: input.equity,
      holdings: input.holdings ? JSON.stringify(input.holdings) : null,
      daily_return: input.daily_return ?? null,
      cumulative_return: input.cumulative_return ?? null,
      total_return: input.total_return ?? null,
      rebalance_type: input.rebalance_type || null,
    };

    const [updated] = await db('active_strategy_snapshots')
      .where({ id: existing.id })
      .update(updateData)
      .returning('*');

    return parseSnapshot(updated);
  } else {
    // Create new
    return createSnapshot(input);
  }
}

/**
 * Delete all snapshots for a strategy
 */
export async function deleteSnapshotsByStrategyId(activeStrategyId: number): Promise<number> {
  return db('active_strategy_snapshots')
    .where({ active_strategy_id: activeStrategyId })
    .del();
}

/**
 * Parse JSONB fields from database
 */
function parseSnapshot(raw: any): ActiveStrategySnapshotDb {
  return {
    ...raw,
    holdings: raw.holdings && typeof raw.holdings === 'string'
      ? JSON.parse(raw.holdings)
      : raw.holdings,
  };
}
