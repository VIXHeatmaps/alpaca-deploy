/**
 * API client for variable lists
 */

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';

export type VarType = 'ticker' | 'number' | 'date';

export interface VariableList {
  id: number;
  name: string;
  type: VarType;
  values: string[];
  description?: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateVariableListInput {
  name: string;
  type: VarType;
  values: string[];
  description?: string;
  is_shared?: boolean;
}

export interface UpdateVariableListInput {
  name?: string;
  type?: VarType;
  values?: string[];
  description?: string;
  is_shared?: boolean;
}

/**
 * Get all variable lists
 */
export async function getAllVariableLists(filters?: {
  type?: VarType;
  is_shared?: boolean;
  limit?: number;
}): Promise<VariableList[]> {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.is_shared !== undefined) params.set('is_shared', String(filters.is_shared));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const url = `${API_BASE}/api/variables${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch variable lists: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get variable list by ID
 */
export async function getVariableListById(id: number): Promise<VariableList> {
  const response = await fetch(`${API_BASE}/api/variables/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch variable list: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create new variable list
 */
export async function createVariableList(input: CreateVariableListInput): Promise<VariableList> {
  const response = await fetch(`${API_BASE}/api/variables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to create variable list: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Update variable list
 */
export async function updateVariableList(
  id: number,
  updates: UpdateVariableListInput
): Promise<VariableList> {
  const response = await fetch(`${API_BASE}/api/variables/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to update variable list: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete variable list
 */
export async function deleteVariableList(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/variables/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete variable list: ${response.statusText}`);
  }
}

/**
 * Bulk import variable lists (for migration from localStorage)
 */
export async function bulkImportVariableLists(
  lists: CreateVariableListInput[]
): Promise<{ imported: number; lists: VariableList[] }> {
  const response = await fetch(`${API_BASE}/api/variables/bulk_import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lists }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to import variable lists: ${response.statusText}`);
  }

  return response.json();
}
