/**
 * Database service for strategies
 *
 * Provides CRUD operations for the strategies table.
 */

import db from './connection';

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
  created_at: Date;
  updated_at: Date;
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
  created_at?: string; // Optional - preserve original creation time if provided
}

export interface UpdateStrategyInput {
  name?: string;
  versioning_enabled?: boolean;
  version_major?: number;
  version_minor?: number;
  version_patch?: number;
  version_fork?: string;
  elements?: any;
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
    const [updated] = await db('strategies')
      .where({ id: existing.id })
      .update({
        versioning_enabled: input.versioning_enabled,
        elements: JSON.stringify(input.elements),
        updated_at: db.fn.now(),
      })
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
    };

    // Preserve original created_at if provided (for importing old strategies)
    if (input.created_at) {
      strategyData.created_at = input.created_at;
    }

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
