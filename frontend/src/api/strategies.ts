/**
 * API client for strategies
 */

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:4000';

export interface Strategy {
  id: number;
  name: string;
  versioning_enabled: boolean;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_fork: string;
  elements: any[]; // The strategy element tree
  created_at: string;
  updated_at: string;
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
}

/**
 * Get all strategies
 */
export async function getAllStrategies(): Promise<Strategy[]> {
  const response = await fetch(`${API_BASE}/api/strategies`);

  if (!response.ok) {
    throw new Error(`Failed to fetch strategies: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get strategy by ID
 */
export async function getStrategyById(id: number): Promise<Strategy> {
  const response = await fetch(`${API_BASE}/api/strategies/${id}`);

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
  });

  if (!response.ok) {
    throw new Error(`Failed to delete strategy: ${response.statusText}`);
  }
}
