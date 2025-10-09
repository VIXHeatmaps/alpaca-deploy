/**
 * Migration utility: JSON → PostgreSQL
 *
 * Migrates active strategy from activeStrategy.json to database
 */

import { getActiveStrategy } from '../storage/activeStrategy';
import { createActiveStrategy } from './activeStrategiesDb';
import { createSnapshot, upsertSnapshot } from './activeStrategySnapshotsDb';
import { getSnapshots } from '../storage/strategySnapshots';

export async function migrateJsonStrategyToDatabase(): Promise<number | null> {
  console.log('[MIGRATION] Checking for JSON strategy to migrate...');

  // Get existing JSON strategy
  const jsonStrategy = await getActiveStrategy();

  if (!jsonStrategy) {
    console.log('[MIGRATION] No JSON strategy found - nothing to migrate');
    return null;
  }

  console.log(`[MIGRATION] Found JSON strategy: ${jsonStrategy.name}`);
  console.log(`[MIGRATION] Initial investment: $${jsonStrategy.investAmount}`);
  console.log(`[MIGRATION] Current holdings:`, jsonStrategy.holdings);

  // Create active strategy in database
  const dbStrategy = await createActiveStrategy({
    name: jsonStrategy.name,
    flow_data: jsonStrategy.flowData,
    mode: 'paper', // Assume paper trading for migration
    initial_capital: jsonStrategy.investAmount,
    current_capital: jsonStrategy.currentValue || 0,
    holdings: jsonStrategy.holdings || [],
    pending_orders: jsonStrategy.pendingOrders || undefined,
  });

  console.log(`[MIGRATION] Created active_strategy with ID: ${dbStrategy.id}`);

  // Migrate snapshots
  try {
    const jsonSnapshots = await getSnapshots(jsonStrategy.id);
    console.log(`[MIGRATION] Found ${jsonSnapshots.length} snapshots to migrate`);

    for (const snap of jsonSnapshots) {
      await upsertSnapshot({
        active_strategy_id: dbStrategy.id,
        snapshot_date: snap.date,
        equity: snap.portfolioValue,
        holdings: snap.holdings,
        daily_return: null, // Not tracked in JSON version
        cumulative_return: snap.totalReturnPct / 100, // Convert % to decimal
        total_return: snap.totalReturn,
        rebalance_type: snap.rebalanceType || 'daily',
      });
    }

    console.log(`[MIGRATION] Migrated ${jsonSnapshots.length} snapshots`);
  } catch (err: any) {
    console.warn('[MIGRATION] Failed to migrate snapshots:', err.message);
  }

  console.log('[MIGRATION] ✓ Migration complete');
  console.log('[MIGRATION] You can now safely delete backend/data/activeStrategy.json');

  return dbStrategy.id;
}

/**
 * Run migration if needed
 */
export async function runMigrationIfNeeded(): Promise<void> {
  try {
    const migratedId = await migrateJsonStrategyToDatabase();
    if (migratedId) {
      console.log(`[MIGRATION] Strategy migrated to database with ID: ${migratedId}`);
    }
  } catch (err: any) {
    console.error('[MIGRATION] Migration failed:', err.message);
  }
}
