/**
 * Database service for variable lists
 *
 * Provides CRUD operations for variable_lists table.
 */

import db from './connection';

export type VarType = 'ticker' | 'number' | 'date';

export interface VariableListDb {
  id: number;
  name: string;
  type: VarType;
  values: string[]; // JSONB array
  description: string | null;
  is_shared: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVariableListInput {
  name: string;
  type: VarType;
  values: string[];
  description?: string;
  is_shared?: boolean;
  user_id: string;
}

export interface UpdateVariableListInput {
  name?: string;
  type?: VarType;
  values?: string[];
  description?: string;
  is_shared?: boolean;
}

/**
 * Create a new variable list
 */
export async function createVariableList(input: CreateVariableListInput): Promise<VariableListDb> {
  // Manually stringify JSONB fields for pg driver
  const data: any = { ...input };
  data.values = JSON.stringify(input.values);

  const [created] = await db('variable_lists')
    .insert(data)
    .returning('*');

  // Parse JSONB back to array
  if (typeof created.values === 'string') {
    created.values = JSON.parse(created.values);
  }

  return created;
}

/**
 * Get variable list by ID
 */
export async function getVariableListById(id: number): Promise<VariableListDb | null> {
  const varList = await db('variable_lists').where({ id }).first();

  if (!varList) return null;

  // Parse JSONB if it's a string
  if (typeof varList.values === 'string') {
    varList.values = JSON.parse(varList.values);
  }

  return varList;
}

/**
 * Get variable list by name
 */
export async function getVariableListByName(name: string): Promise<VariableListDb | null> {
  const varList = await db('variable_lists').where({ name }).first();

  if (!varList) return null;

  // Parse JSONB if it's a string
  if (typeof varList.values === 'string') {
    varList.values = JSON.parse(varList.values);
  }

  return varList;
}

/**
 * Get all variable lists
 */
export async function getAllVariableLists(filters?: {
  type?: VarType;
  is_shared?: boolean;
  limit?: number;
}): Promise<VariableListDb[]> {
  let query = db('variable_lists').orderBy('created_at', 'desc');

  if (filters?.type) {
    query = query.where({ type: filters.type });
  }

  if (filters?.is_shared !== undefined) {
    query = query.where({ is_shared: filters.is_shared });
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const results = await query;

  // Parse JSONB values
  return results.map((varList) => {
    if (typeof varList.values === 'string') {
      varList.values = JSON.parse(varList.values);
    }
    return varList;
  });
}

/**
 * Get all variable lists for a specific user
 */
export async function getVariableListsByUserId(
  userId: string,
  filters?: {
    type?: VarType;
    is_shared?: boolean;
    limit?: number;
  }
): Promise<VariableListDb[]> {
  let query = db('variable_lists')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc');

  if (filters?.type) {
    query = query.where({ type: filters.type });
  }

  if (filters?.is_shared !== undefined) {
    query = query.where({ is_shared: filters.is_shared });
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const results = await query;

  // Parse JSONB values
  return results.map((varList) => {
    if (typeof varList.values === 'string') {
      varList.values = JSON.parse(varList.values);
    }
    return varList;
  });
}

/**
 * Update variable list
 */
export async function updateVariableList(
  id: number,
  updates: UpdateVariableListInput
): Promise<VariableListDb | null> {
  const data: any = { ...updates };

  // Stringify JSONB if values are being updated
  if (updates.values) {
    data.values = JSON.stringify(updates.values);
  }

  const [updated] = await db('variable_lists')
    .where({ id })
    .update({
      ...data,
      updated_at: db.fn.now(),
    })
    .returning('*');

  if (!updated) return null;

  // Parse JSONB back
  if (typeof updated.values === 'string') {
    updated.values = JSON.parse(updated.values);
  }

  return updated;
}

/**
 * Delete variable list
 */
export async function deleteVariableList(id: number): Promise<boolean> {
  const deleted = await db('variable_lists').where({ id }).del();
  return deleted > 0;
}

/**
 * Check if a variable list name already exists
 */
export async function variableListNameExists(name: string, excludeId?: number): Promise<boolean> {
  let query = db('variable_lists').where({ name });

  if (excludeId !== undefined) {
    query = query.whereNot({ id: excludeId });
  }

  const result = await query.first();
  return !!result;
}

/**
 * Bulk import variable lists (for migration from localStorage)
 */
export async function bulkImportVariableLists(
  lists: CreateVariableListInput[]
): Promise<VariableListDb[]> {
  if (lists.length === 0) return [];

  // Stringify JSONB values
  const data = lists.map((list) => ({
    ...list,
    values: JSON.stringify(list.values),
  }));

  const created = await db('variable_lists')
    .insert(data)
    .returning('*');

  // Parse JSONB back
  return created.map((varList) => {
    if (typeof varList.values === 'string') {
      varList.values = JSON.parse(varList.values);
    }
    return varList;
  });
}
