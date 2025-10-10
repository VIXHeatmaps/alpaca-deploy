/**
 * Pending Order Fill Checker
 *
 * Periodically checks if pending orders have filled and updates the strategy
 */

import { getActiveStrategy, setActiveStrategy } from '../storage/activeStrategy';
import { getAlpacaPositions } from './orders';
import axios from 'axios';

type AlpacaOrder = {
  id: string;
  status: string;
  filled_qty: string;
  filled_avg_price: string | null;
};

let fillCheckerInterval: NodeJS.Timeout | null = null;
let apiKey: string = '';
let apiSecret: string = '';

/**
 * Check a single order status
 */
async function checkOrderStatus(orderId: string, key: string, secret: string): Promise<AlpacaOrder> {
  const response = await axios.get(`https://paper-api.alpaca.markets/v2/orders/${orderId}`, {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
    timeout: 5000,
  });

  return response.data;
}

/**
 * Check all pending orders and update strategy if any have filled
 */
async function checkPendingOrders() {
  try {
    const strategy = await getActiveStrategy();

    if (!strategy || !strategy.pendingOrders || strategy.pendingOrders.length === 0) {
      return; // No pending orders to check
    }

    console.log(`\n📋 [FILL CHECK] Checking ${strategy.pendingOrders.length} pending orders...`);

    let anyFilled = false;
    let filledCount = 0;
    let canceledCount = 0;
    const stillPending = [];

    for (const pendingOrder of strategy.pendingOrders) {
      try {
        const order = await checkOrderStatus(pendingOrder.orderId, apiKey, apiSecret);

        if (order.status === 'filled' || order.status === 'partially_filled') {
          console.log(`[FILL CHECKER] Order ${pendingOrder.orderId} filled: ${order.filled_qty} ${pendingOrder.symbol} @ ${order.filled_avg_price}`);
          anyFilled = true;
          filledCount++;

          // Update holdings with filled quantity
          const filledQty = parseFloat(order.filled_qty);
          const holdingIndex = strategy.holdings.findIndex(h => h.symbol === pendingOrder.symbol);

          if (holdingIndex >= 0) {
            strategy.holdings[holdingIndex].qty = filledQty;
          } else {
            strategy.holdings.push({ symbol: pendingOrder.symbol, qty: filledQty });
          }
        } else if (order.status === 'new' || order.status === 'accepted' || order.status === 'pending_new') {
          // Still pending
          stillPending.push(pendingOrder);
        } else if (order.status === 'canceled' || order.status === 'expired' || order.status === 'rejected') {
          console.warn(`[FILL CHECKER] Order ${pendingOrder.orderId} ${order.status} - removing from pending`);
          anyFilled = true; // Need to update strategy
          canceledCount++;
        } else {
          // Unknown status, keep it pending
          console.warn(`[FILL CHECKER] Order ${pendingOrder.orderId} has unknown status: ${order.status}`);
          stillPending.push(pendingOrder);
        }
      } catch (err: any) {
        console.error(`[FILL CHECKER] Error checking order ${pendingOrder.orderId}:`, err.message);
        stillPending.push(pendingOrder); // Keep in pending list on error
      }
    }

    // If any orders filled, update the strategy
    if (anyFilled) {
      console.log('[FILL CHECKER] Orders filled - updating strategy...');

      // Get current positions to calculate value
      const positions = await getAlpacaPositions(apiKey, apiSecret);
      const currentValue = positions.reduce((sum, pos) => sum + pos.market_value, 0);

      await setActiveStrategy({
        ...strategy,
        holdings: strategy.holdings,
        currentValue,
        pendingOrders: stillPending.length > 0 ? stillPending : undefined,
      });

      console.log(`✓ [FILL CHECK] ${filledCount} filled, ${canceledCount} canceled, ${stillPending.length} still pending`);
      console.log(`  → Portfolio value: $${currentValue.toFixed(2)}`);

      // Create initial snapshot if all orders are now filled and no snapshot exists yet
      if (stillPending.length === 0) {
        console.log('[FILL CHECKER] All orders filled - creating initial snapshot...');
        const { getLatestSnapshot, createSnapshot } = await import('../storage/strategySnapshots');

        const latestSnapshot = await getLatestSnapshot(strategy.id);
        if (!latestSnapshot) {
          // Get prices for snapshot
          const { getCurrentPrice } = await import('./orders');
          const holdingsWithPrices = await Promise.all(
            strategy.holdings.map(async h => ({
              symbol: h.symbol,
              qty: h.qty,
              price: await getCurrentPrice(h.symbol, apiKey, apiSecret),
            }))
          );

          await createSnapshot(
            strategy.id,
            strategy.investAmount,
            holdingsWithPrices,
            'initial'
          );
          console.log('[FILL CHECKER] Initial snapshot created');
        }
      }
    } else {
      console.log(`✓ [FILL CHECK] No fills - ${stillPending.length} orders still pending`);
    }
  } catch (err: any) {
    console.error('[FILL CHECKER] Error checking pending orders:', err.message);
  }
}

/**
 * Start the fill checker (checks every 5 minutes during market hours)
 */
export function startFillChecker(key: string, secret: string) {
  apiKey = key;
  apiSecret = secret;

  console.log('[FILL CHECKER] Starting pending order fill checker...');
  console.log('[FILL CHECKER] Will check pending orders every 5 minutes');

  // Check immediately
  checkPendingOrders();

  // Then check every 5 minutes
  fillCheckerInterval = setInterval(checkPendingOrders, 5 * 60 * 1000);
}

/**
 * Stop the fill checker
 */
export function stopFillChecker() {
  if (fillCheckerInterval) {
    clearInterval(fillCheckerInterval);
    fillCheckerInterval = null;
    console.log('[FILL CHECKER] Fill checker stopped');
  }
}
