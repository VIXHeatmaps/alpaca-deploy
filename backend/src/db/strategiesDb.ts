/**
 * Database service for strategies
 *
 * Provides CRUD operations for the strategies table.
 */

import db from './connection';

export type StrategyStatus = 'DRAFT' | 'LIVE' | 'LIQUIDATED';

export interface StrategyDb {
  id: number;
  name: string;
  versioning_enabled: boolean;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_fork: string;
  elements: any; // JSONB - the entire strategy element tree
  user_id: string | null;
  status: StrategyStatus;
  created_at: Date;
  updated_at: Date;
  note: string | null; // Short description (single line)
  description: string | null; // Long-form markdown description
  deployed_at: Date | null; // When went LIVE
  liquidated_at: Date | null; // When liquidated
  name_bar_expanded: boolean; // UI state: is name bar expanded?
}

export interface CreateStrategyInput {
  name: string;
  versioning_enabled: boolean;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_fork: string;
  elements: any;
  user_id: string;
  status?: StrategyStatus; // Optional - defaults to DRAFT
  created_at?: string; // Optional - preserve original creation time if provided
  note?: string | null; // Optional short description
  description?: string | null; // Optional long description
  name_bar_expanded?: boolean; // Optional UI state
}

export interface UpdateStrategyInput {
  name?: string;
  versioning_enabled?: boolean;
  version_major?: number;
  version_minor?: number;
  version_patch?: number;
  version_fork?: string;
  elements?: any;
  status?: StrategyStatus;
  note?: string | null;
  description?: string | null;
  name_bar_expanded?: boolean;
  deployed_at?: Date | null;
  liquidated_at?: Date | null;
}

/**
 * Create a new strategy or update if name+version already exists (upsert)
 */
export async function saveStrategy(input: CreateStrategyInput): Promise<StrategyDb> {
  // Check if strategy with same name, version, AND user_id exists
  const existing = await db('strategies')
    .where({
      name: input.name,
      version_major: input.version_major,
      version_minor: input.version_minor,
      version_patch: input.version_patch,
      version_fork: input.version_fork,
      user_id: input.user_id,
    })
    .first();

  if (existing) {
    // Update existing strategy
    const updateData: any = {
      versioning_enabled: input.versioning_enabled,
      elements: JSON.stringify(input.elements),
      updated_at: db.fn.now(),
    };

    // Include optional metadata fields if provided
    if (input.note !== undefined) updateData.note = input.note;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.name_bar_expanded !== undefined) updateData.name_bar_expanded = input.name_bar_expanded;

    const [updated] = await db('strategies')
      .where({ id: existing.id })
      .update(updateData)
      .returning('*');

    // Parse JSONB fields
    if (typeof updated.elements === 'string') {
      updated.elements = JSON.parse(updated.elements);
    }
    return updated;
  } else {
    // Create new strategy
    const strategyData: any = {
      name: input.name,
      versioning_enabled: input.versioning_enabled,
      version_major: input.version_major,
      version_minor: input.version_minor,
      version_patch: input.version_patch,
      version_fork: input.version_fork,
      elements: JSON.stringify(input.elements),
      user_id: input.user_id,
      status: input.status || 'DRAFT',
    };

    // Preserve original created_at if provided (for importing old strategies)
    if (input.created_at) {
      strategyData.created_at = input.created_at;
    }

    // Include optional metadata fields if provided
    if (input.note !== undefined) strategyData.note = input.note;
    if (input.description !== undefined) strategyData.description = input.description;
    if (input.name_bar_expanded !== undefined) strategyData.name_bar_expanded = input.name_bar_expanded;

    const [created] = await db('strategies')
      .insert(strategyData)
      .returning('*');

    // Parse JSONB fields
    if (typeof created.elements === 'string') {
      created.elements = JSON.parse(created.elements);
    }
    return created;
  }
}

/**
 * Get strategy by ID
 */
export async function getStrategyById(id: number): Promise<StrategyDb | null> {
  const strategy = await db('strategies').where({ id }).first();
  if (!strategy) return null;

  // Parse JSONB fields
  if (typeof strategy.elements === 'string') {
    strategy.elements = JSON.parse(strategy.elements);
  }
  return strategy;
}

/**
 * Get all strategies, ordered by updated_at DESC
 */
export async function getAllStrategies(): Promise<StrategyDb[]> {
  const strategies = await db('strategies').orderBy('updated_at', 'desc');

  // Parse JSONB fields
  return strategies.map(s => {
    if (typeof s.elements === 'string') {
      s.elements = JSON.parse(s.elements);
    }
    return s;
  });
}

/**
 * Get all strategies for a specific user, ordered by updated_at DESC
 */
export async function getStrategiesByUserId(userId: string): Promise<StrategyDb[]> {
  const strategies = await db('strategies')
    .where({ user_id: userId })
    .orderBy('updated_at', 'desc');

  // Parse JSONB fields
  return strategies.map(s => {
    if (typeof s.elements === 'string') {
      s.elements = JSON.parse(s.elements);
    }
    return s;
  });
}

/**
 * Delete strategy by ID
 */
export async function deleteStrategy(id: number): Promise<boolean> {
  const deleted = await db('strategies').where({ id }).del();
  return deleted > 0;
}

/**
 * Get strategies by name (all versions of a strategy)
 */
export async function getStrategiesByName(name: string): Promise<StrategyDb[]> {
  const strategies = await db('strategies')
    .where({ name })
    .orderBy('updated_at', 'desc');

  // Parse JSONB fields
  return strategies.map(s => {
    if (typeof s.elements === 'string') {
      s.elements = JSON.parse(s.elements);
    }
    return s;
  });
}

/**
 * Check if a LIVE strategy with the given name already exists for this user
 */
export async function hasLiveStrategyWithName(name: string, userId: string): Promise<boolean> {
  const existing = await db('strategies')
    .where({ name, user_id: userId, status: 'LIVE' })
    .first();
  return !!existing;
}

/**
 * Update strategy by ID
 */
export async function updateStrategy(id: number, input: UpdateStrategyInput): Promise<StrategyDb | null> {
  const updates: any = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.versioning_enabled !== undefined) updates.versioning_enabled = input.versioning_enabled;
  if (input.version_major !== undefined) updates.version_major = input.version_major;
  if (input.version_minor !== undefined) updates.version_minor = input.version_minor;
  if (input.version_patch !== undefined) updates.version_patch = input.version_patch;
  if (input.version_fork !== undefined) updates.version_fork = input.version_fork;
  if (input.status !== undefined) updates.status = input.status;
  if (input.elements !== undefined) updates.elements = JSON.stringify(input.elements);

  if (Object.keys(updates).length === 0) {
    return getStrategyById(id);
  }

  const [updated] = await db('strategies')
    .where({ id })
    .update(updates)
    .returning('*');

  if (!updated) return null;

  // Parse JSONB fields
  if (typeof updated.elements === 'string') {
    updated.elements = JSON.parse(updated.elements);
  }
  return updated;
}
