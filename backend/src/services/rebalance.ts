/**
 * Rebalancing Service
 *
 * Handles portfolio rebalancing by comparing current holdings to target allocation
 * and executing sell/buy orders to match the target
 */

import { getActiveStrategy, setActiveStrategy } from '../storage/activeStrategy';
import { evaluateFlowWithCurrentPrices } from './flowEval';
import { placeMarketOrder, waitForFill, getAlpacaPositions } from './orders';

type RebalanceResult = {
  soldSymbols: string[];
  boughtSymbols: string[];
  updatedHoldings: Array<{ symbol: string; qty: number }>;
  cashRemaining: number;
};

/**
 * Calculate the difference between current and target allocations
 * Returns symbols to sell and target dollar amounts to buy
 */
function calculateRebalanceOrders(
  currentHoldings: Array<{ symbol: string; qty: number; marketValue: number }>,
  targetAllocation: Record<string, number>, // e.g., { IBIT: 0.6, GLD: 0.4 }
  totalValue: number
): {
  toSell: Array<{ symbol: string; qty: number }>;
  toBuy: Array<{ symbol: string; targetDollars: number }>;
} {
  const toSell: Array<{ symbol: string; qty: number }> = [];
  const toBuy: Array<{ symbol: string; targetDollars: number }> = [];

  // Find what to sell (holdings not in target or with 0% allocation)
  for (const holding of currentHoldings) {
    const targetPct = targetAllocation[holding.symbol] || 0;

    if (targetPct === 0 && holding.qty > 0) {
      // Not in target portfolio - sell everything
      toSell.push({ symbol: holding.symbol, qty: holding.qty });
    }
  }

  // Find what to buy (target positions)
  for (const [symbol, pct] of Object.entries(targetAllocation)) {
    if (pct > 0) {
      const targetDollars = totalValue * pct;

      // Check if we already have this position
      const currentHolding = currentHoldings.find(h => h.symbol === symbol);

      if (!currentHolding || currentHolding.marketValue === 0) {
        // Don't have it - need to buy full amount
        toBuy.push({ symbol, targetDollars });
      } else {
        // Have it - check if we need to adjust
        const difference = targetDollars - currentHolding.marketValue;

        if (difference > 1) {
          // Need to buy more (allow $1 tolerance)
          toBuy.push({ symbol, targetDollars: difference });
        } else if (difference < -1) {
          // Need to sell some (but for MVP, we either sell all or keep)
          // For now, skip partial sells - only do full position changes
        }
      }
    }
  }

  return { toSell, toBuy };
}

/**
 * Execute rebalance: sell current holdings, then buy target allocation
 * As sells complete, progressively place buy orders with available cash
 */
async function executeRebalance(
  toSell: Array<{ symbol: string; qty: number }>,
  toBuy: Array<{ symbol: string; targetDollars: number }>,
  apiKey: string,
  apiSecret: string
): Promise<{ newHoldings: Array<{ symbol: string; qty: number; price: number }>; cashRemaining: number }> {
  let availableCash = 0;
  const newHoldings: Array<{ symbol: string; qty: number; price: number }> = [];

  // Step 1: Sell all positions that need to be sold
  console.log(`Selling ${toSell.length} positions...`);
  for (const { symbol, qty } of toSell) {
    try {
      console.log(`  Selling ${qty.toFixed(4)} ${symbol}...`);
      const order = await placeMarketOrder(symbol, qty, 'sell', apiKey, apiSecret);
      const { filledQty, avgPrice } = await waitForFill(order.id, apiKey, apiSecret);

      const proceeds = filledQty * avgPrice;
      availableCash += proceeds;
      console.log(`  Sold ${filledQty} @ $${avgPrice.toFixed(2)} = $${proceeds.toFixed(2)}`);
    } catch (err: any) {
      console.error(`  Failed to sell ${symbol}:`, err.message);
      throw err;
    }
  }

  console.log(`Available cash after sells: $${availableCash.toFixed(2)}`);

  // Step 2: Buy target positions with available cash
  console.log(`Buying ${toBuy.length} positions...`);
  for (const { symbol, targetDollars } of toBuy) {
    try {
      // Use available cash (might be less than target if sells didn't fill at expected prices)
      const dollarsToSpend = Math.min(targetDollars, availableCash);

      if (dollarsToSpend < 1) {
        console.log(`  Skipping ${symbol} - insufficient cash ($${availableCash.toFixed(2)} available)`);
        continue;
      }

      // Get current price to calculate quantity
      const { getCurrentPrice } = await import('./orders');
      const price = await getCurrentPrice(symbol, apiKey, apiSecret);
      const qty = dollarsToSpend / price;

      console.log(`  Buying ${qty.toFixed(4)} ${symbol} @ $${price.toFixed(2)} = $${dollarsToSpend.toFixed(2)}`);

      const order = await placeMarketOrder(symbol, qty, 'buy', apiKey, apiSecret);
      const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

      if (pending) {
        console.log(`  Buy order pending (market closed) for ${symbol}`);
        newHoldings.push({ symbol, qty: 0, price: 0 }); // Will fill later
      } else {
        const spent = filledQty * avgPrice;
        availableCash -= spent;
        newHoldings.push({ symbol, qty: filledQty, price: avgPrice });
        console.log(`  Bought ${filledQty} @ $${avgPrice.toFixed(2)}, cash remaining: $${availableCash.toFixed(2)}`);
      }
    } catch (err: any) {
      console.error(`  Failed to buy ${symbol}:`, err.message);
      // Continue with other buys
    }
  }

  return { newHoldings, cashRemaining: availableCash };
}

/**
 * Main rebalancing function
 * Called daily at T-10 to rebalance the active strategy
 */
export async function rebalanceActiveStrategy(
  apiKey: string,
  apiSecret: string
): Promise<RebalanceResult> {
  const startTime = Date.now();
  console.log('\n🔄 [TRADE WINDOW START] === STARTING REBALANCE ===');

  // Get active strategy
  const strategy = await getActiveStrategy();
  if (!strategy) {
    console.log('✗ [TRADE WINDOW END] No active strategy to rebalance');
    throw new Error('No active strategy to rebalance');
  }

  console.log(`Rebalancing strategy: ${strategy.name}`);

  // Get current positions from Alpaca
  const positions = await getAlpacaPositions(apiKey, apiSecret);
  const currentHoldings = strategy.holdings.map(h => {
    const pos = positions.find(p => p.symbol === h.symbol);
    return {
      symbol: h.symbol,
      qty: pos?.qty || h.qty,
      marketValue: pos?.market_value || 0,
    };
  });

  const totalValue = currentHoldings.reduce((sum, h) => sum + h.marketValue, 0);
  console.log(`Current portfolio value: $${totalValue.toFixed(2)}`);

  // Evaluate Flow with current prices to get target allocation
  const targetAllocation = await evaluateFlowWithCurrentPrices(
    strategy.flowData,
    apiKey,
    apiSecret
  );

  console.log('Target allocation:', targetAllocation);

  // Calculate what needs to change
  const { toSell, toBuy } = calculateRebalanceOrders(currentHoldings, targetAllocation, totalValue);

  console.log(`To sell: ${toSell.length} positions`);
  console.log(`To buy: ${toBuy.length} positions`);

  // Check if rebalance is needed
  if (toSell.length === 0 && toBuy.length === 0) {
    console.log('No rebalancing needed - portfolio already matches target');

    // Still create snapshot with current holdings
    const { getCurrentPrice } = await import('./orders');
    const holdingsWithPrices = await Promise.all(
      strategy.holdings.map(async h => ({
        symbol: h.symbol,
        qty: h.qty,
        price: await getCurrentPrice(h.symbol, apiKey, apiSecret),
      }))
    );

    const { createSnapshot } = await import('../storage/strategySnapshots');
    await createSnapshot(
      strategy.id,
      strategy.investAmount,
      holdingsWithPrices,
      'daily'
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ [TRADE WINDOW END] Rebalance complete in ${duration}s - No changes needed`);
    console.log('=== REBALANCE COMPLETE (NO CHANGES) ===\n');
    return {
      soldSymbols: [],
      boughtSymbols: [],
      updatedHoldings: strategy.holdings,
      cashRemaining: 0,
    };
  }

  // Execute rebalance
  const { newHoldings, cashRemaining } = await executeRebalance(toSell, toBuy, apiKey, apiSecret);

  // Update strategy storage
  const newValue = newHoldings.reduce((sum, h) => sum + (h.qty * h.price), cashRemaining);

  await setActiveStrategy({
    ...strategy,
    holdings: newHoldings.map(h => ({ symbol: h.symbol, qty: h.qty })),
    currentValue: newValue,
    lastRebalance: new Date().toISOString(),
  });

  // Create snapshot with actual filled prices
  const { createSnapshot } = await import('../storage/strategySnapshots');
  await createSnapshot(
    strategy.id,
    strategy.investAmount,
    newHoldings,
    'daily'
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const soldSymbols = toSell.map(s => s.symbol);
  const boughtSymbols = toBuy.map(b => b.symbol);
  console.log(`✓ [TRADE WINDOW END] Rebalance complete in ${duration}s`);
  console.log(`  → Sold: ${soldSymbols.length} positions ${soldSymbols.length > 0 ? `(${soldSymbols.join(', ')})` : ''}`);
  console.log(`  → Bought: ${boughtSymbols.length} positions ${boughtSymbols.length > 0 ? `(${boughtSymbols.join(', ')})` : ''}`);
  console.log(`  → Cash remaining: $${cashRemaining.toFixed(2)}`);
  console.log('=== REBALANCE COMPLETE ===\n');

  return {
    soldSymbols,
    boughtSymbols,
    updatedHoldings: newHoldings.map(h => ({ symbol: h.symbol, qty: h.qty })),
    cashRemaining,
  };
}
