import type { Knex } from "knex";

/**
 * Migration: Update active_strategies status enum
 *
 * Changes status from ('active', 'paused', 'stopped') to ('pending', 'active', 'liquidating', 'stopped')
 *
 * Status meanings:
 * - pending: Strategy created but hasn't executed first rebalance yet
 * - active: Strategy actively trading (has completed at least one rebalance)
 * - liquidating: Strategy closing out positions
 * - stopped: Strategy fully closed (filtered out of active lists)
 */

export async function up(knex: Knex): Promise<void> {
  // Update existing records:
  // - 'active' → check if they've traded (last_rebalance_at IS NOT NULL) → 'active', else 'pending'
  // - 'paused' → 'pending' (treat as not actively trading)
  // - 'stopped' → 'stopped' (keep as-is)

  // First, update 'active' records that haven't traded yet to 'pending'
  await knex('active_strategies')
    .where('status', 'active')
    .whereNull('last_rebalance_at')
    .update({ status: 'pending' });

  // Update 'paused' to 'pending'
  await knex('active_strategies')
    .where('status', 'paused')
    .update({ status: 'pending' });

  console.log('✓ Updated active_strategies status values');
}

export async function down(knex: Knex): Promise<void> {
  // Revert changes
  await knex('active_strategies')
    .where('status', 'pending')
    .update({ status: 'active' });

  await knex('active_strategies')
    .where('status', 'liquidating')
    .update({ status: 'active' });

  console.log('✓ Reverted active_strategies status values');
}
