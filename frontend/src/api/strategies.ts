/**
 * API client for strategies
 */

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:4000';

export type StrategyStatus = 'DRAFT' | 'LIVE' | 'LIQUIDATED';

export interface Strategy {
  id: number;
  name: string;
  versioning_enabled: boolean;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_fork: string;
  elements: any[]; // The strategy element tree
  status: StrategyStatus;
  created_at: string;
  updated_at: string;
  note: string | null; // Short description (single line)
  description: string | null; // Long-form markdown description
  deployed_at: string | null; // When went LIVE
  liquidated_at: string | null; // When liquidated
  name_bar_expanded: boolean; // UI state: is name bar expanded?
}

export interface SaveStrategyInput {
  name: string;
  versioningEnabled: boolean;
  version: {
    major: number;
    minor: number;
    patch: number;
    fork: string;
  };
  elements: any[];
  createdAt?: string; // Optional - preserve original creation time
  note?: string | null; // Optional short description
  description?: string | null; // Optional long description
  nameBarExpanded?: boolean; // Optional UI state
}

/**
 * Get all strategies
 */
export async function getAllStrategies(): Promise<Strategy[]> {
  const response = await fetch(`${API_BASE}/api/strategies`, {
    credentials: 'include', // Send cookies for authentication
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch strategies: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get strategy by ID
 */
export async function getStrategyById(id: number): Promise<Strategy> {
  const response = await fetch(`${API_BASE}/api/strategies/${id}`, {
    credentials: 'include', // Send cookies for authentication
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch strategy: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Save strategy (create or update based on name+version)
 */
export async function saveStrategy(input: SaveStrategyInput): Promise<Strategy> {
  const response = await fetch(`${API_BASE}/api/strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send cookies for authentication
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to save strategy: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete strategy by ID
 */
export async function deleteStrategy(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/strategies/${id}`, {
    method: 'DELETE',
    credentials: 'include', // Send cookies for authentication
  });

  if (!response.ok) {
    throw new Error(`Failed to delete strategy: ${response.statusText}`);
  }
}
