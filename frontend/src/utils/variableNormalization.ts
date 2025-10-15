/**
 * Variable name normalization utilities
 *
 * Ensures consistent handling of variable names throughout the application.
 * Variables are case-insensitive and stored/compared in lowercase.
 */

/**
 * Normalizes a variable name for storage and comparison
 *
 * Rules:
 * - Removes leading $ if present
 * - Converts to lowercase
 * - Trims whitespace
 *
 * Examples:
 * - "$RISKON" → "riskon"
 * - "SECTOR" → "sector"
 * - " $XLK " → "xlk"
 *
 * @param name - The variable name to normalize
 * @returns Normalized variable name (lowercase, no $, trimmed)
 */
export function normalizeVariableName(name: string): string {
  const trimmed = name.trim();
  const withoutDollar = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  return withoutDollar.toLowerCase();
}

/**
 * Checks if a value is a variable reference (starts with $)
 *
 * @param value - The value to check
 * @returns True if the value is a variable reference
 */
export function isVariableReference(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('$');
}

/**
 * Extracts the normalized variable name from a field value
 * Returns null if the value is not a variable reference
 *
 * @param value - The field value (e.g., "$RISKON", "AAPL")
 * @returns Normalized variable name or null
 */
export function extractVariableName(value: string): string | null {
  if (!isVariableReference(value)) return null;
  return normalizeVariableName(value);
}
