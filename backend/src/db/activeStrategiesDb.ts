/**
 * Database service for active_strategies
 *
 * Provides CRUD operations for managing active trading strategies
 */

import db from './connection';

export interface ActiveStrategyDb {
  id: number;
  strategy_id: number | null;
  name: string;
  flow_data: any; // JSONB - Flow nodes/edges/globals
  mode: 'paper' | 'live';
  status: 'active' | 'paused' | 'stopped' | 'liquidating';
  initial_capital: string; // DECIMAL stored as string
  current_capital: string | null;
  position_attribution: any | null; // JSONB - { symbol: { qty, allocation_pct }}
  holdings: any; // JSONB - [{ symbol, qty, entry_price }]
  pending_orders: any | null; // JSONB
  user_id: string | null;
  started_at: Date;
  stopped_at: Date | null;
  last_rebalance_at: Date | null;
  rebalance_frequency: string;
  rebalance_time: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateActiveStrategyInput {
  strategy_id?: number | null;
  name: string;
  flow_data: any;
  mode?: 'paper' | 'live';
  initial_capital: number;
  current_capital?: number | null;
  position_attribution?: any;
  holdings?: any[];
  pending_orders?: any[];
  user_id: string;
  rebalance_frequency?: string;
  rebalance_time?: string;
}

export interface UpdateActiveStrategyInput {
  status?: 'active' | 'paused' | 'stopped' | 'liquidating';
  current_capital?: number;
  position_attribution?: any;
  holdings?: any[];
  pending_orders?: any[];
  stopped_at?: string | null;
  last_rebalance_at?: string;
}

/**
 * Create a new active strategy
 */
export async function createActiveStrategy(input: CreateActiveStrategyInput): Promise<ActiveStrategyDb> {
  const strategyData: any = {
    strategy_id: input.strategy_id || null,
    name: input.name,
    flow_data: JSON.stringify(input.flow_data),
    mode: input.mode || 'paper',
    initial_capital: input.initial_capital,
    current_capital: input.current_capital ?? null,
    position_attribution: input.position_attribution ? JSON.stringify(input.position_attribution) : null,
    holdings: JSON.stringify(input.holdings || []),
    pending_orders: input.pending_orders ? JSON.stringify(input.pending_orders) : null,
    user_id: input.user_id,
    rebalance_frequency: input.rebalance_frequency || 'daily',
    rebalance_time: input.rebalance_time || '15:50:00',
  };

  const [created] = await db('active_strategies')
    .insert(strategyData)
    .returning('*');

  return parseActiveStrategy(created);
}

/**
 * Get active strategy by ID
 */
export async function getActiveStrategyById(id: number): Promise<ActiveStrategyDb | null> {
  const strategy = await db('active_strategies').where({ id }).first();
  if (!strategy) return null;
  return parseActiveStrategy(strategy);
}

/**
 * Get all active strategies (active, paused, liquidating - excludes stopped)
 */
export async function getAllActiveStrategies(): Promise<ActiveStrategyDb[]> {
  const strategies = await db('active_strategies')
    .whereIn('status', ['active', 'paused', 'liquidating'])
    .orderBy('started_at', 'desc');

  return strategies.map(parseActiveStrategy);
}

/**
 * Get all active strategies for a specific user (active, paused, liquidating - excludes stopped)
 */
export async function getActiveStrategiesByUserId(userId: string): Promise<ActiveStrategyDb[]> {
  const strategies = await db('active_strategies')
    .where({ user_id: userId })
    .whereIn('status', ['active', 'paused', 'liquidating'])
    .orderBy('started_at', 'desc');

  return strategies.map(parseActiveStrategy);
}

/**
 * Update active strategy
 */
export async function updateActiveStrategy(
  id: number,
  input: UpdateActiveStrategyInput
): Promise<ActiveStrategyDb | null> {
  const updateData: any = {};

  if (input.status !== undefined) updateData.status = input.status;
  if (input.current_capital !== undefined) updateData.current_capital = input.current_capital;
  if (input.position_attribution !== undefined) {
    updateData.position_attribution = JSON.stringify(input.position_attribution);
  }
  if (input.holdings !== undefined) {
    updateData.holdings = JSON.stringify(input.holdings);
  }
  if (input.pending_orders !== undefined) {
    updateData.pending_orders = input.pending_orders ? JSON.stringify(input.pending_orders) : null;
  }
  if (input.stopped_at !== undefined) updateData.stopped_at = input.stopped_at;
  if (input.last_rebalance_at !== undefined) updateData.last_rebalance_at = input.last_rebalance_at;

  const [updated] = await db('active_strategies')
    .where({ id })
    .update(updateData)
    .returning('*');

  return updated ? parseActiveStrategy(updated) : null;
}

/**
 * Delete active strategy (stop and mark as stopped)
 */
export async function stopActiveStrategy(id: number): Promise<boolean> {
  const result = await db('active_strategies')
    .where({ id })
    .update({
      status: 'stopped',
      stopped_at: db.fn.now(),
    });

  return result > 0;
}

/**
 * Hard delete active strategy
 */
export async function deleteActiveStrategy(id: number): Promise<boolean> {
  const deleted = await db('active_strategies').where({ id }).del();
  return deleted > 0;
}

/**
 * Check if any active strategies exist (active, paused, liquidating - excludes stopped)
 */
export async function hasActiveStrategies(): Promise<boolean> {
  const count = await db('active_strategies')
    .whereIn('status', ['active', 'paused', 'liquidating'])
    .count('* as count')
    .first();

  return parseInt(count?.count as string || '0') > 0;
}

/**
 * Parse JSONB fields from database
 */
function parseActiveStrategy(raw: any): ActiveStrategyDb {
  return {
    ...raw,
    flow_data: typeof raw.flow_data === 'string' ? JSON.parse(raw.flow_data) : raw.flow_data,
    position_attribution: raw.position_attribution && typeof raw.position_attribution === 'string'
      ? JSON.parse(raw.position_attribution)
      : raw.position_attribution,
    holdings: typeof raw.holdings === 'string' ? JSON.parse(raw.holdings) : raw.holdings,
    pending_orders: raw.pending_orders && typeof raw.pending_orders === 'string'
      ? JSON.parse(raw.pending_orders)
      : raw.pending_orders,
  };
}
