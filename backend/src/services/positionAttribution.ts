/**
 * Position Attribution Service
 *
 * Manages virtual position ownership across multiple strategies.
 * Ensures sum of virtual holdings = actual Alpaca positions.
 */

import { getAllActiveStrategies, updateActiveStrategy, ActiveStrategyDb } from '../db/activeStrategiesDb';

export type PositionAttribution = {
  [symbol: string]: {
    qty: number;              // Virtual quantity owned by this strategy
    allocation_pct: number;   // % of total Alpaca position (0.0 to 1.0)
  };
};

export type StrategyHolding = {
  symbol: string;
  qty: number;
  entry_price?: number;
};

/**
 * Calculate attribution for a new strategy deployment
 * Updates all existing strategies that share symbols
 */
export async function calculateAttributionOnDeploy(
  newStrategyId: number,
  newHoldings: StrategyHolding[]
): Promise<void> {
  console.log('[ATTRIBUTION] Calculating attribution for new strategy deployment...');

  // Get all active strategies (excluding the new one)
  const allStrategies = await getAllActiveStrategies();
  const existingStrategies = allStrategies.filter(s => s.id !== newStrategyId);
  const newStrategy = allStrategies.find(s => s.id === newStrategyId);

  if (!newStrategy) {
    throw new Error(`Strategy ${newStrategyId} not found`);
  }

  // Build a map of symbol → total quantity across all strategies
  const symbolTotals: Record<string, number> = {};
  const strategyHoldingsMap: Record<number, StrategyHolding[]> = {};

  // Add holdings from existing strategies
  for (const strategy of existingStrategies) {
    const holdings = Array.isArray(strategy.holdings) ? strategy.holdings : [];
    strategyHoldingsMap[strategy.id] = holdings;

    for (const holding of holdings) {
      symbolTotals[holding.symbol] = (symbolTotals[holding.symbol] || 0) + holding.qty;
    }
  }

  // Add holdings from new strategy
  strategyHoldingsMap[newStrategyId] = newHoldings;
  for (const holding of newHoldings) {
    symbolTotals[holding.symbol] = (symbolTotals[holding.symbol] || 0) + holding.qty;
  }

  console.log('[ATTRIBUTION] Symbol totals:', symbolTotals);

  // Calculate attribution for each strategy
  for (const strategy of allStrategies) {
    const holdings = strategyHoldingsMap[strategy.id] || [];
    const attribution: PositionAttribution = {};

    for (const holding of holdings) {
      const totalQty = symbolTotals[holding.symbol] || 0;
      const allocationPct = totalQty > 0 ? holding.qty / totalQty : 1.0;

      attribution[holding.symbol] = {
        qty: holding.qty,
        allocation_pct: allocationPct,
      };
    }

    // Update strategy in database
    await updateActiveStrategy(strategy.id, {
      position_attribution: attribution,
    });

    console.log(`[ATTRIBUTION] Updated strategy ${strategy.id} attribution:`, attribution);
  }

  console.log('[ATTRIBUTION] ✓ Attribution calculation complete');
}

/**
 * Recalculate attribution after a strategy rebalances
 * Called after selling/buying to update all affected strategies
 */
export async function recalculateAttributionAfterRebalance(
  rebalancedStrategyId: number,
  newHoldings: StrategyHolding[]
): Promise<void> {
  console.log(`[ATTRIBUTION] Recalculating attribution after strategy ${rebalancedStrategyId} rebalanced...`);

  // Same logic as deploy - recalculate for all strategies
  await calculateAttributionOnDeploy(rebalancedStrategyId, newHoldings);
}

/**
 * Remove a strategy from attribution calculations (when liquidated)
 * Redistributes its positions to remaining strategies
 */
export async function removeStrategyFromAttribution(
  liquidatedStrategyId: number
): Promise<void> {
  console.log(`[ATTRIBUTION] Removing strategy ${liquidatedStrategyId} from attribution...`);

  // Get all remaining active strategies
  const allStrategies = await getAllActiveStrategies();
  const remainingStrategies = allStrategies.filter(s => s.id !== liquidatedStrategyId);

  if (remainingStrategies.length === 0) {
    console.log('[ATTRIBUTION] No remaining strategies - nothing to update');
    return;
  }

  // Recalculate totals without the liquidated strategy
  const symbolTotals: Record<string, number> = {};
  const strategyHoldingsMap: Record<number, StrategyHolding[]> = {};

  for (const strategy of remainingStrategies) {
    const holdings = Array.isArray(strategy.holdings) ? strategy.holdings : [];
    strategyHoldingsMap[strategy.id] = holdings;

    for (const holding of holdings) {
      symbolTotals[holding.symbol] = (symbolTotals[holding.symbol] || 0) + holding.qty;
    }
  }

  // Update attribution for remaining strategies
  for (const strategy of remainingStrategies) {
    const holdings = strategyHoldingsMap[strategy.id] || [];
    const attribution: PositionAttribution = {};

    for (const holding of holdings) {
      const totalQty = symbolTotals[holding.symbol] || 0;
      const allocationPct = totalQty > 0 ? holding.qty / totalQty : 1.0;

      attribution[holding.symbol] = {
        qty: holding.qty,
        allocation_pct: allocationPct,
      };
    }

    await updateActiveStrategy(strategy.id, {
      position_attribution: attribution,
    });

    console.log(`[ATTRIBUTION] Updated strategy ${strategy.id} after removal:`, attribution);
  }

  console.log('[ATTRIBUTION] ✓ Strategy removed from attribution');
}

/**
 * Get virtual holdings for a strategy based on current Alpaca positions
 * Uses attribution percentages to calculate strategy's share
 */
export function calculateVirtualHoldings(
  alpacaPositions: Array<{ symbol: string; qty: number; market_value: number }>,
  attribution: PositionAttribution | null
): Array<{ symbol: string; qty: number; marketValue: number }> {
  if (!attribution) {
    return [];
  }

  const virtualHoldings: Array<{ symbol: string; qty: number; marketValue: number }> = [];

  for (const [symbol, attr] of Object.entries(attribution)) {
    const alpacaPos = alpacaPositions.find(p => p.symbol === symbol);

    if (alpacaPos) {
      // Calculate virtual quantity using allocation percentage
      const virtualQty = alpacaPos.qty * attr.allocation_pct;
      const virtualValue = alpacaPos.market_value * attr.allocation_pct;

      virtualHoldings.push({
        symbol,
        qty: virtualQty,
        marketValue: virtualValue,
      });
    } else {
      // Position exists in attribution but not in Alpaca (was sold)
      virtualHoldings.push({
        symbol,
        qty: 0,
        marketValue: 0,
      });
    }
  }

  return virtualHoldings;
}

/**
 * Validate attribution integrity across all strategies
 * Ensures sum of allocation_pct = 1.0 for each symbol
 */
export async function validateAttribution(): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const allStrategies = await getAllActiveStrategies();

  // Group by symbol
  const symbolAllocations: Record<string, Array<{ strategyId: number; pct: number }>> = {};

  for (const strategy of allStrategies) {
    const attribution = strategy.position_attribution || {};

    for (const [symbol, attr] of Object.entries(attribution as PositionAttribution)) {
      if (!symbolAllocations[symbol]) {
        symbolAllocations[symbol] = [];
      }
      symbolAllocations[symbol].push({
        strategyId: strategy.id,
        pct: attr.allocation_pct,
      });
    }
  }

  // Check each symbol sums to 1.0 (with small tolerance for floating point)
  for (const [symbol, allocations] of Object.entries(symbolAllocations)) {
    const sum = allocations.reduce((acc, a) => acc + a.pct, 0);
    const tolerance = 0.001; // 0.1% tolerance

    if (Math.abs(sum - 1.0) > tolerance) {
      errors.push(
        `Symbol ${symbol}: allocation sum = ${sum.toFixed(4)} (expected 1.0). ` +
        `Strategies: ${allocations.map(a => `#${a.strategyId}: ${(a.pct * 100).toFixed(2)}%`).join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
