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
    // Check both legacy file storage and database strategies
    const { getAllActiveStrategies } = await import('../db/activeStrategiesDb');
    const dbStrategies = await getAllActiveStrategies();

    // Also check legacy file storage
    const legacyStrategy = await getActiveStrategy();

    const strategiesToCheck = [];

    // Add database strategies with pending orders
    for (const dbStrategy of dbStrategies) {
      const pendingOrders = Array.isArray(dbStrategy.pending_orders) ? dbStrategy.pending_orders : [];
      if (pendingOrders.length > 0) {
        strategiesToCheck.push({ type: 'db', strategy: dbStrategy, id: dbStrategy.id });
      }
    }

    // Add legacy strategy if it has pending orders
    if (legacyStrategy?.pendingOrders && legacyStrategy.pendingOrders.length > 0) {
      strategiesToCheck.push({ type: 'legacy', strategy: legacyStrategy, id: legacyStrategy.id });
    }

    if (strategiesToCheck.length === 0) {
      return; // No pending orders to check
    }

    console.log(`\n📋 [FILL CHECK] Checking ${strategiesToCheck.length} strategies with pending orders...`);

    for (const { type, strategy, id } of strategiesToCheck) {
      await checkStrategyOrders(type, strategy, id);
    }
  } catch (err: any) {
    console.error('[FILL CHECKER] Error checking pending orders:', err.message);
  }
}

/**
 * Check pending orders for a single strategy
 */
async function checkStrategyOrders(type: 'db' | 'legacy', strategy: any, strategyId: number | string) {
  try {
    const pendingOrders = type === 'db' ? (strategy.pending_orders || []) : (strategy.pendingOrders || []);

    if (pendingOrders.length === 0) return;

    console.log(`\n📋 [FILL CHECK] Strategy #${strategyId} (${strategy.name}): Checking ${pendingOrders.length} pending orders...`);

    let anyFilled = false;
    let filledCount = 0;
    let canceledCount = 0;
    const stillPending = [];
    let totalProceeds = 0;

    const holdings = Array.isArray(strategy.holdings) ? [...strategy.holdings] : [];

    for (const pendingOrder of pendingOrders) {
      try {
        const order = await checkOrderStatus(pendingOrder.orderId, apiKey, apiSecret);

        if (order.status === 'filled' || order.status === 'partially_filled') {
          console.log(`[FILL CHECKER] Order ${pendingOrder.orderId} filled: ${order.filled_qty} ${pendingOrder.symbol} @ ${order.filled_avg_price}`);
          anyFilled = true;
          filledCount++;

          const filledQty = parseFloat(order.filled_qty);
          const avgPrice = parseFloat(order.filled_avg_price || '0');

          // Update holdings based on order side
          if (pendingOrder.side === 'sell') {
            // Remove sold shares from holdings
            const holdingIndex = holdings.findIndex(h => h.symbol === pendingOrder.symbol);
            if (holdingIndex >= 0) {
              holdings.splice(holdingIndex, 1);
            }
            totalProceeds += filledQty * avgPrice;
          } else {
            // Add bought shares to holdings
            const holdingIndex = holdings.findIndex(h => h.symbol === pendingOrder.symbol);
            if (holdingIndex >= 0) {
              holdings[holdingIndex].qty = filledQty;
            } else {
              holdings.push({ symbol: pendingOrder.symbol, qty: filledQty });
            }
          }
        } else if (order.status === 'new' || order.status === 'accepted' || order.status === 'pending_new') {
          // Still pending
          stillPending.push(pendingOrder);
        } else if (order.status === 'canceled' || order.status === 'expired' || order.status === 'rejected') {
          console.warn(`[FILL CHECKER] Order ${pendingOrder.orderId} ${order.status} - removing from pending`);
          anyFilled = true;
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

      if (type === 'db') {
        const { updateActiveStrategy, getActiveStrategyById } = await import('../db/activeStrategiesDb');
        const currentStrategy = await getActiveStrategyById(strategyId as number);

        // Check if this is a liquidating strategy
        if (currentStrategy?.status === 'liquidating') {
          if (stillPending.length === 0) {
            // All liquidation orders filled - complete the liquidation
            console.log('[FILL CHECKER] Liquidation complete - all sell orders filled');

            const { upsertSnapshot } = await import('../db/activeStrategySnapshotsDb');
            const { getMarketDateToday } = await import('../utils/marketTime');
            const { removeStrategyFromAttribution } = await import('./positionAttribution');

            // Create final snapshot
            await upsertSnapshot({
              active_strategy_id: strategyId as number,
              snapshot_date: getMarketDateToday(),
              equity: totalProceeds,
              holdings: [],
              cumulative_return: (totalProceeds - parseFloat(currentStrategy.initial_capital)) / parseFloat(currentStrategy.initial_capital),
              total_return: totalProceeds - parseFloat(currentStrategy.initial_capital),
              rebalance_type: 'liquidation',
            });

            // Stop the strategy
            await updateActiveStrategy(strategyId as number, {
              status: 'stopped',
              stopped_at: new Date().toISOString(),
              current_capital: totalProceeds,
              holdings: [],
              pending_orders: [],
            });

            // Remove from attribution
            await removeStrategyFromAttribution(strategyId as number);

            console.log(`✓ [FILL CHECK] Strategy #${strategyId} liquidation complete - proceeds: $${totalProceeds.toFixed(2)}`);
          } else {
            // Still waiting for more orders to fill
            await updateActiveStrategy(strategyId as number, {
              holdings,
              pending_orders: stillPending,
            });
            console.log(`✓ [FILL CHECK] ${filledCount} filled, ${canceledCount} canceled, ${stillPending.length} still pending`);
          }
        } else {
          // Normal rebalance orders
          const positions = await getAlpacaPositions(apiKey, apiSecret);
          const currentValue = positions.reduce((sum, pos) => sum + pos.market_value, 0);

          await updateActiveStrategy(strategyId as number, {
            holdings,
            current_capital: currentValue,
            pending_orders: stillPending.length > 0 ? stillPending : [],
          });

          console.log(`✓ [FILL CHECK] ${filledCount} filled, ${canceledCount} canceled, ${stillPending.length} still pending`);
          console.log(`  → Portfolio value: $${currentValue.toFixed(2)}`);
        }
      } else {
        // Legacy file storage
        const positions = await getAlpacaPositions(apiKey, apiSecret);
        const currentValue = positions.reduce((sum, pos) => sum + pos.market_value, 0);

        await setActiveStrategy({
          ...strategy,
          holdings,
          currentValue,
          pendingOrders: stillPending.length > 0 ? stillPending : undefined,
        });

        console.log(`✓ [FILL CHECK] ${filledCount} filled, ${canceledCount} canceled, ${stillPending.length} still pending`);
        console.log(`  → Portfolio value: $${currentValue.toFixed(2)}`);
      }
    } else {
      console.log(`✓ [FILL CHECK] No fills - ${stillPending.length} orders still pending`);
    }
  } catch (err: any) {
    console.error(`[FILL CHECKER] Error checking strategy #${strategyId}:`, err.message);
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
