/**
 * Rebalancing Service
 *
 * Handles portfolio rebalancing by comparing current holdings to target allocation
 * and executing sell/buy orders to match the target
 */

import { getActiveStrategy, setActiveStrategy } from '../storage/activeStrategy';
import { placeMarketOrder, waitForFill, getAlpacaPositions } from './orders';
import { collectRequiredIndicators, executeStrategy, buildIndicatorMap } from '../execution';
import { fetchPriceData } from '../backtest/v2/dataFetcher';
import { fetchIndicators } from '../backtest/v2/indicatorCache';
import { getMarketDateToday } from '../utils/marketTime';
import {
  precomputeSortIndicators,
  collectIndicatorValuesForDate,
  buildIndicatorLookupMap,
} from '../execution/sortRuntime';
import { TradeExecutionLogger } from './tradeExecutionLogger';

type RebalanceResult = {
  soldSymbols: string[];
  boughtSymbols: string[];
  updatedHoldings: Array<{ symbol: string; qty: number }>;
  cashRemaining: number;
};

/**
 * Helper: Collect tickers from elements
 */
function collectTickersFromElements(elements: any[]): Set<string> {
  const tickers = new Set<string>();

  const traverse = (els: any[]) => {
    for (const el of els || []) {
      if (el.type === 'ticker' && el.ticker) {
        tickers.add(String(el.ticker).toUpperCase());
      }
      if (el.type === 'gate' && el.conditions) {
        for (const cond of el.conditions) {
          if (cond.ticker) tickers.add(String(cond.ticker).toUpperCase());
          if (cond.rightTicker) tickers.add(String(cond.rightTicker).toUpperCase());
        }
      }
      if (el.type === 'scale' && el.config && el.config.ticker) {
        tickers.add(String(el.config.ticker).toUpperCase());
      }
      if (el.children) traverse(el.children);
      if (el.thenChildren) traverse(el.thenChildren);
      if (el.elseChildren) traverse(el.elseChildren);
      if (el.fromChildren) traverse(el.fromChildren);
      if (el.toChildren) traverse(el.toChildren);
    }
  };

  traverse(elements);
  return tickers;
}

/**
 * Helper: Calculate warmup days needed for indicators
 */
function calculateWarmupDays(indicators: Array<{ ticker: string; indicator: string; period: string; params?: Record<string, string> }>): number {
  if (indicators.length === 0) return 0;

  let maxWarmup = 0;
  for (const ind of indicators) {
    const indicator = ind.indicator.toUpperCase();
    const periodNum = parseInt(ind.period, 10) || 14;
    let warmup = 0;

    if (indicator === 'MACD' || indicator === 'MACD_LINE' || indicator === 'MACD_SIGNAL' || indicator === 'MACD_HIST') {
      warmup = 26 + 9;
    } else if (indicator === 'PPO_LINE') {
      warmup = 26;
    } else if (indicator === 'PPO_SIGNAL' || indicator === 'PPO_HIST') {
      warmup = 26 + 9;
    } else if (indicator.startsWith('BBANDS')) {
      warmup = 20 + 2;
    } else if (indicator === 'STOCH_K') {
      warmup = 14 + 3;
    } else if (indicator === 'VOLATILITY') {
      warmup = 20;
    } else if (indicator === 'ATR' || indicator === 'ADX' || indicator === 'RSI' || indicator === 'MFI') {
      warmup = periodNum;
    } else if (indicator === 'SMA' || indicator === 'EMA') {
      warmup = periodNum;
    } else if (indicator.startsWith('AROON')) {
      warmup = periodNum * 2;
    } else {
      warmup = periodNum;
    }

    if (warmup > maxWarmup) maxWarmup = warmup;
  }

  return maxWarmup + 10;
}

/**
 * Helper: Subtract trading days from a date
 */
function subtractTradingDays(dateStr: string, tradingDays: number): string {
  const date = new Date(dateStr);
  const calendarDays = Math.ceil(tradingDays * 1.4);
  date.setDate(date.getDate() - calendarDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Evaluate strategy elements to get target allocation
 * Uses the same logic as deployment
 */
async function evaluateStrategyAllocation(
  elements: any[],
  apiKey: string,
  apiSecret: string
): Promise<Record<string, number>> {
  console.log('[REBALANCE] Evaluating strategy with elements-based executor...');

  const tickers = collectTickersFromElements(elements);
  tickers.add('SPY');

  const requiredIndicators = collectRequiredIndicators(elements);
  const warmupDays = calculateWarmupDays(requiredIndicators);
  const endDate = getMarketDateToday();
  const startDate = subtractTradingDays(endDate, warmupDays + 10);

  console.log(`[REBALANCE] Fetching price data for ${tickers.size} tickers from ${startDate} to ${endDate}`);
  const priceData = await fetchPriceData(Array.from(tickers), startDate, endDate, apiKey, apiSecret);

  const referenceTicker = tickers.has('SPY') ? 'SPY' : Array.from(tickers)[0];
  const referenceData = priceData[referenceTicker];
  if (!referenceData) {
    throw new Error(`Unable to fetch price data for reference ticker ${referenceTicker}`);
  }

  let dateGrid = Object.keys(referenceData).sort();
  if (dateGrid.length < 2) {
    throw new Error('Insufficient price data to evaluate strategy');
  }

  console.log(`[REBALANCE] Fetching indicators...`);

  // Convert period from string to number for fetchIndicators
  const indicatorRequests = requiredIndicators.map(ind => ({
    ticker: ind.ticker,
    indicator: ind.indicator,
    period: parseInt(ind.period, 10) || 14,
    params: ind.params,
  }));

  const indicatorData = await fetchIndicators(indicatorRequests, priceData);

  console.log(`[REBALANCE] Precomputing Sort indicators if needed...`);
  const sortStartDate = await precomputeSortIndicators({
    elements,
    priceData,
    indicatorData,
    dateGrid,
    executeStrategy,
    buildIndicatorMap,
    debug: false,
  });

  let effectiveDateGrid = dateGrid;
  if (sortStartDate) {
    const filtered = dateGrid.filter(d => d >= sortStartDate);
    if (filtered.length < 2) {
      throw new Error(`Insufficient price data after sort warmup`);
    }
    effectiveDateGrid = filtered;
  }

  // Use T-1 decision date (yesterday's close) for T-10 execution
  const decisionIndex = effectiveDateGrid.length - 2;
  const decisionDate = effectiveDateGrid[decisionIndex];

  console.log(`[REBALANCE] Using decision date: ${decisionDate}`);

  const indicatorLookup = buildIndicatorLookupMap(elements);
  const { values: indicatorValuesForDate } = collectIndicatorValuesForDate(
    indicatorLookup,
    indicatorData,
    decisionDate
  );

  const indicatorMap = buildIndicatorMap(indicatorValuesForDate);

  console.log('[REBALANCE] Executing strategy to get target positions...');
  const evaluation = executeStrategy(elements, indicatorMap, false);

  if (!evaluation.positions || evaluation.positions.length === 0) {
    console.error('[REBALANCE] Strategy produced no positions!');
    throw new Error('Strategy evaluation produced no positions');
  }

  console.log(`[REBALANCE] Strategy produced ${evaluation.positions.length} positions`);

  // Convert positions to allocation percentages
  const totalWeight = evaluation.positions.reduce((sum, p) => sum + p.weight, 0);
  const allocation: Record<string, number> = {};

  for (const pos of evaluation.positions) {
    const weightPct = (pos.weight / totalWeight);
    allocation[pos.ticker] = weightPct;
    console.log(`[REBALANCE]   ${pos.ticker}: ${(weightPct * 100).toFixed(2)}%`);
  }

  return allocation;
}

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
  apiSecret: string,
  logger: TradeExecutionLogger,
  strategyId?: number
): Promise<{ newHoldings: Array<{ symbol: string; qty: number; price: number }>; cashRemaining: number }> {
  let availableCash = 0;
  const newHoldings: Array<{ symbol: string; qty: number; price: number }> = [];

  // Step 1: Sell all positions that need to be sold
  console.log(`Selling ${toSell.length} positions...`);
  for (const { symbol, qty } of toSell) {
    try {
      console.log(`  Selling ${qty.toFixed(4)} ${symbol}...`);
      const order = await placeMarketOrder(symbol, qty, 'sell', apiKey, apiSecret, strategyId);
      logger.logPlacedOrder(order.id, symbol, qty, 'sell');

      const { filledQty, avgPrice } = await waitForFill(order.id, apiKey, apiSecret);

      const proceeds = filledQty * avgPrice;
      availableCash += proceeds;
      logger.logFilledOrder(order.id, symbol, filledQty, avgPrice);
      console.log(`  Sold ${filledQty} @ $${avgPrice.toFixed(2)} = $${proceeds.toFixed(2)}`);
    } catch (err: any) {
      console.error(`  Failed to sell ${symbol}:`, err.message);
      logger.logFailedOrder(symbol, 'sell', err.message);
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

      logger.logPlannedOrder(symbol, 'buy', dollarsToSpend);

      // Get current price to calculate quantity
      const { getCurrentPrice } = await import('./orders');
      const price = await getCurrentPrice(symbol, apiKey, apiSecret);
      const qty = dollarsToSpend / price;

      console.log(`  Buying ${qty.toFixed(4)} ${symbol} @ $${price.toFixed(2)} = $${dollarsToSpend.toFixed(2)}`);

      const order = await placeMarketOrder(symbol, qty, 'buy', apiKey, apiSecret, strategyId);
      logger.logPlacedOrder(order.id, symbol, qty, 'buy');

      const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

      if (pending) {
        console.log(`  Buy order pending (market closed) for ${symbol}`);
        newHoldings.push({ symbol, qty: 0, price: 0 }); // Will fill later
      } else {
        const spent = filledQty * avgPrice;
        availableCash -= spent;
        newHoldings.push({ symbol, qty: filledQty, price: avgPrice });
        logger.logFilledOrder(order.id, symbol, filledQty, avgPrice);
        console.log(`  Bought ${filledQty} @ $${avgPrice.toFixed(2)}, cash remaining: $${availableCash.toFixed(2)}`);
      }
    } catch (err: any) {
      console.error(`  Failed to buy ${symbol}:`, err.message);
      logger.logFailedOrder(symbol, 'buy', err.message);
      // Continue with other buys
    }
  }

  return { newHoldings, cashRemaining: availableCash };
}

/**
 * Main rebalancing function
 * Called daily at T-10 to rebalance active strategies
 */
export async function rebalanceActiveStrategy(
  apiKey: string,
  apiSecret: string,
  strategyId?: number
): Promise<RebalanceResult> {
  const startTime = Date.now();
  console.log('\n🔄 [TRADE WINDOW START] === STARTING REBALANCE ===');

  // Get active strategy (legacy file-based or database-based)
  let strategy: any;

  if (strategyId) {
    // Database version - get specific strategy by ID
    const { getActiveStrategyById } = await import('../db/activeStrategiesDb');
    const dbStrategy = await getActiveStrategyById(strategyId);

    if (!dbStrategy) {
      console.log(`✗ [TRADE WINDOW END] Strategy #${strategyId} not found`);
      throw new Error(`Strategy #${strategyId} not found`);
    }

    // Convert database format to legacy format for compatibility
    strategy = {
      id: dbStrategy.id.toString(),
      name: dbStrategy.name,
      investAmount: parseFloat(dbStrategy.initial_capital),
      currentValue: dbStrategy.current_capital ? parseFloat(dbStrategy.current_capital) : parseFloat(dbStrategy.initial_capital),
      flowData: typeof dbStrategy.flow_data === 'string' ? JSON.parse(dbStrategy.flow_data) : dbStrategy.flow_data,
      holdings: typeof dbStrategy.holdings === 'string' ? JSON.parse(dbStrategy.holdings) : (dbStrategy.holdings || []),
      pendingOrders: dbStrategy.pending_orders ? (typeof dbStrategy.pending_orders === 'string' ? JSON.parse(dbStrategy.pending_orders) : dbStrategy.pending_orders) : undefined,
      createdAt: dbStrategy.started_at.toISOString(),
      lastRebalance: dbStrategy.last_rebalance_at?.toISOString() || null,
    };
  } else {
    // Legacy file-based version
    strategy = await getActiveStrategy();
    if (!strategy) {
      console.log('✗ [TRADE WINDOW END] No active strategy to rebalance');
      throw new Error('No active strategy to rebalance');
    }
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

  // Initialize execution logger
  const logger = new TradeExecutionLogger(strategyId || parseInt(strategy.id), 'rebalance');
  const { getActiveStrategyById } = await import('../db/activeStrategiesDb');
  const dbStrategy = strategyId ? await getActiveStrategyById(strategyId) : null;
  const attributionBefore = dbStrategy?.position_attribution || {};
  await logger.start(strategy.holdings, totalValue, attributionBefore);

  // Extract elements from flowData
  const elements = strategy.flowData.elements || [];
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new Error('Invalid strategy: flowData.elements is missing or empty');
  }

  console.log(`[REBALANCE] Strategy has ${elements.length} elements`);

  // Evaluate strategy with elements-based executor to get target allocation
  const targetAllocation = await evaluateStrategyAllocation(
    elements,
    apiKey,
    apiSecret
  );

  console.log('[REBALANCE] Target allocation:', targetAllocation);
  logger.logTargetAllocation(targetAllocation);

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
  const { newHoldings, cashRemaining } = await executeRebalance(toSell, toBuy, apiKey, apiSecret, logger, strategyId);

  // Update strategy storage
  const newValue = newHoldings.reduce((sum, h) => sum + (h.qty * h.price), cashRemaining);

  if (strategyId) {
    // Update database strategy
    const { updateActiveStrategy } = await import('../db/activeStrategiesDb');
    await updateActiveStrategy(strategyId, {
      holdings: newHoldings.map(h => ({ symbol: h.symbol, qty: h.qty })),
      current_capital: newValue,
      last_rebalance_at: new Date().toISOString(),
    });
  } else {
    // Update legacy file-based strategy
    await setActiveStrategy({
      ...strategy,
      holdings: newHoldings.map(h => ({ symbol: h.symbol, qty: h.qty })),
      currentValue: newValue,
      lastRebalance: new Date().toISOString(),
    });
  }

  // Create snapshot with actual filled prices
  const { createSnapshot } = await import('../storage/strategySnapshots');
  await createSnapshot(
    strategy.id,
    strategy.investAmount,
    newHoldings,
    'daily'
  );

  // Get updated attribution after rebalance
  const updatedStrategy = strategyId ? await getActiveStrategyById(strategyId) : null;
  const attributionAfter = updatedStrategy?.position_attribution || {};

  // Finish execution logging
  await logger.finish(
    true,
    newHoldings.map(h => ({ symbol: h.symbol, qty: h.qty })),
    newValue,
    attributionAfter,
    apiKey,
    apiSecret
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
