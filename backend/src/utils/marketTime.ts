/**
 * Market time utilities
 *
 * All dates in the app should use US Eastern Time (market time)
 * This ensures consistency regardless of server timezone
 */

/**
 * Get current date in market timezone (US Eastern) as YYYY-MM-DD
 */
export function getMarketDateToday(): string {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-').replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$3-$2');
}

/**
 * Get current timestamp in market timezone (US Eastern) as ISO string
 */
export function getMarketTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/, '$3-$1-$2T$4:$5:$6');
}

/**
 * Get N trading days ago in market timezone
 * Note: This is an approximation - doesn't account for market holidays
 */
export function getMarketDateNDaysAgo(days: number): string {
  const date = new Date();
  // Convert to ET
  const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  etDate.setDate(etDate.getDate() - days);

  return etDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-').replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$3-$2');
}
