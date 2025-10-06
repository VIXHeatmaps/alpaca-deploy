/**
 * Alpaca Market Clock Service
 * Checks if market is open, pre-market, or closed
 */

export type MarketState = 'open' | 'premarket' | 'closed';

type AlpacaClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

/**
 * Get current market state from Alpaca
 */
export async function getMarketState(
  apiKey: string,
  apiSecret: string
): Promise<MarketState> {
  const url = 'https://paper-api.alpaca.markets/v2/clock';

  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca clock API error: ${response.statusText}`);
  }

  const clock: AlpacaClock = await response.json();

  if (clock.is_open) {
    return 'open';
  }

  // Check if we're in pre-market (4:00 AM - 9:30 AM ET)
  const now = new Date(clock.timestamp);
  const nextOpen = new Date(clock.next_open);

  // If within 5.5 hours before market open, consider it pre-market
  const hoursUntilOpen = (nextOpen.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilOpen > 0 && hoursUntilOpen <= 5.5) {
    return 'premarket';
  }

  return 'closed';
}

/**
 * Check if we should attempt to fill orders (market open or pre-market)
 */
export async function canTradeNow(
  apiKey: string,
  apiSecret: string
): Promise<boolean> {
  const state = await getMarketState(apiKey, apiSecret);
  return state === 'open' || state === 'premarket';
}
