/**
 * Order Execution Service
 *
 * Handles placing orders with Alpaca and waiting for fills
 */

import axios from 'axios';
import { canTradeNow } from './clock';

const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

export type OrderSide = 'buy' | 'sell';

export type AlpacaOrder = {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  replaced_at: string | null;
  replaced_by: string | null;
  replaces: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional: string | null;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  status: string;
  extended_hours: boolean;
  legs: any[] | null;
  trail_percent: string | null;
  trail_price: string | null;
  hwm: string | null;
};

/**
 * Place a market order with Alpaca
 */
export async function placeMarketOrder(
  symbol: string,
  qty: number,
  side: OrderSide,
  apiKey: string,
  apiSecret: string
): Promise<AlpacaOrder> {
  try {
    const response = await axios.post(
      `${ALPACA_TRADING_BASE}/v2/orders`,
      {
        symbol,
        qty: qty.toString(),
        side,
        type: 'market',
        time_in_force: 'day',
      },
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (err: any) {
    console.error(`Failed to place order: ${side} ${qty} ${symbol}`, err?.response?.data || err.message);
    throw new Error(`Order failed: ${err?.response?.data?.message || err.message}`);
  }
}

/**
 * Wait for an order to fill (or fail)
 * Polls order status every 2 seconds, but only when market is open/pre-market
 * Returns immediately if market is closed - caller should retry later
 */
export async function waitForFill(
  orderId: string,
  apiKey: string,
  apiSecret: string,
  timeoutMs: number = 60000
): Promise<{ filledQty: number; avgPrice: number; pending?: boolean }> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    // Check if market is open/pre-market before polling
    const canTrade = await canTradeNow(apiKey, apiSecret);
    if (!canTrade) {
      console.log(`Market closed - order ${orderId} pending, will fill when market opens`);
      return { filledQty: 0, avgPrice: 0, pending: true };
    }

    try {
      const response = await axios.get(`${ALPACA_TRADING_BASE}/v2/orders/${orderId}`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        timeout: 5000,
      });

      const order: AlpacaOrder = response.data;
      const status = order.status;

      if (status === 'filled') {
        const filledQty = parseFloat(order.filled_qty);
        const avgPrice = parseFloat(order.filled_avg_price || '0');
        return { filledQty, avgPrice };
      }

      if (status === 'partially_filled') {
        // For MVP, accept partial fills
        const filledQty = parseFloat(order.filled_qty);
        const avgPrice = parseFloat(order.filled_avg_price || '0');
        console.warn(`Order ${orderId} partially filled: ${filledQty} of ${order.qty}`);
        return { filledQty, avgPrice };
      }

      if (status === 'canceled' || status === 'expired' || status === 'rejected' || status === 'failed') {
        throw new Error(`Order ${orderId} ${status}`);
      }

      // Still pending, wait and retry
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (err: any) {
      if (err.message?.includes('Order')) {
        throw err; // Re-throw order-specific errors
      }
      console.error(`Error polling order ${orderId}:`, err.message);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Order ${orderId} timed out after ${timeoutMs}ms`);
}

/**
 * Get current price for a symbol
 */
export async function getCurrentPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<number> {
  try {
    // Try snapshot first (real-time data)
    const response = await axios.get(`${ALPACA_DATA_BASE}/v2/stocks/${symbol}/snapshot`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 5000,
    });

    // Try latest trade price first, fall back to daily bar close
    const latestTrade = response.data?.latestTrade?.p;
    const dailyClose = response.data?.dailyBar?.c;
    const prevClose = response.data?.prevDailyBar?.c;

    if (latestTrade && Number.isFinite(latestTrade)) {
      return latestTrade;
    }

    if (dailyClose && Number.isFinite(dailyClose)) {
      return dailyClose;
    }

    if (prevClose && Number.isFinite(prevClose)) {
      console.warn(`Using previous close for ${symbol}: ${prevClose}`);
      return prevClose;
    }

    throw new Error(`No valid price found in snapshot for ${symbol}`);
  } catch (err: any) {
    // If snapshot fails (404 or market closed), try latest bars
    console.warn(`Snapshot failed for ${symbol}, trying latest bars...`);

    try {
      const now = new Date();
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      const barsResponse = await axios.get(`${ALPACA_DATA_BASE}/v2/stocks/bars`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        params: {
          symbols: symbol,
          start: start.toISOString(),
          timeframe: '1Day',
          limit: 5,
          feed: 'sip',
          adjustment: 'split',
        },
        timeout: 5000,
      });

      const bars = barsResponse.data?.bars?.[symbol];
      if (bars && bars.length > 0) {
        const latestBar = bars[bars.length - 1];
        const price = latestBar.c;
        console.log(`Using latest bar close for ${symbol}: ${price}`);
        return price;
      }

      throw new Error(`No bars available for ${symbol} (symbol may not be tradeable or available in your account)`);
    } catch (barsErr: any) {
      console.error(`Failed to get price for ${symbol}:`, barsErr?.response?.data || barsErr.message);
      throw new Error(`Price fetch failed for ${symbol}: ${barsErr?.response?.status || barsErr.message}`);
    }
  }
}

/**
 * Get current positions from Alpaca
 */
export async function getAlpacaPositions(
  apiKey: string,
  apiSecret: string
): Promise<Array<{ symbol: string; qty: number; market_value: number }>> {
  try {
    const response = await axios.get(`${ALPACA_TRADING_BASE}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 5000,
    });

    return response.data.map((pos: any) => ({
      symbol: pos.symbol,
      qty: parseFloat(pos.qty),
      market_value: parseFloat(pos.market_value),
    }));
  } catch (err: any) {
    console.error('Failed to get positions:', err?.response?.data || err.message);
    throw new Error(`Positions fetch failed: ${err.message}`);
  }
}
