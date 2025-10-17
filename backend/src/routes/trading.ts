import { Router, Request, Response } from 'express';
import axios from 'axios';

import { requireAuth } from '../auth/jwt';
import { getMarketDateToday } from '../utils/marketTime';
import { paramsToPeriodString } from '../utils/indicatorKeys';
import { fetchPriceData } from '../backtest/v2/dataFetcher';
import { collectRequiredIndicators } from '../execution';
import { fetchIndicators } from '../backtest/v2/indicatorCache';
import {
  precomputeSortIndicators,
  collectIndicatorValuesForDate,
  buildIndicatorLookupMap,
} from '../execution/sortRuntime';
import type { Element as StrategyElement } from '../execution';
import { getActiveStrategy, setActiveStrategy, clearActiveStrategy, hasActiveStrategy } from '../storage/activeStrategy';
import {
  createActiveStrategy,
  getActiveStrategiesByUserId,
  getActiveStrategyById,
  updateActiveStrategy,
} from '../db/activeStrategiesDb';
import { upsertSnapshot } from '../db/activeStrategySnapshotsDb';
import { calculateAttributionOnDeploy, removeStrategyFromAttribution } from '../services/positionAttribution';
import { placeMarketOrder, waitForFill, getCurrentPrice, getAlpacaPositions } from '../services/orders';

const tradingRouter = Router();

const normalizeHoldings = (raw: any[] | undefined | null) => {
  if (!Array.isArray(raw)) return [] as Array<{ symbol: string; qty: number; entry_price?: number }>;

  return raw
    .map((holding) => {
      const qty = Number((holding as any)?.qty ?? (holding as any)?.quantity ?? 0);
      const entryPrice = Number((holding as any)?.entry_price ?? (holding as any)?.price ?? 0);
      return {
        ...holding,
        qty,
        entry_price: entryPrice,
      };
    })
    .filter((holding) => holding.qty > 0);
};

const calculateWarmupDays = (indicators: Array<{ ticker: string; indicator: string; period: number }>): number => {
  if (indicators.length === 0) return 0;

  let maxWarmup = 0;

  for (const ind of indicators) {
    const indicator = ind.indicator.toUpperCase();
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
      warmup = ind.period || 14;
    } else if (indicator === 'SMA' || indicator === 'EMA') {
      warmup = ind.period || 14;
    } else if (indicator.startsWith('AROON')) {
      warmup = (ind.period || 14) * 2;
    } else {
      warmup = ind.period || 0;
    }

    if (warmup > maxWarmup) maxWarmup = warmup;
  }

  return maxWarmup + 10;
};

const collectSortIndicatorRequests = (elements: any[]): Array<{ indicator: string; period: number }> => {
  const result: Array<{ indicator: string; period: number }> = [];

  const traverse = (els: any[]) => {
    for (const el of els || []) {
      if (!el || typeof el !== 'object') continue;
      if (el.type === 'sort') {
        const indicator = (el.indicator || '').toUpperCase();
        const periodKey = paramsToPeriodString(el.indicator, el.params) || el.period || '';
        const parts = periodKey
          .split('-')
          .map(part => parseInt(part, 10))
          .filter(value => Number.isFinite(value));
        const effectivePeriod = parts.length ? Math.max(...parts) : 0;
        result.push({ indicator, period: effectivePeriod });
        traverse(el.children || []);
        continue;
      }
      if (el.children) traverse(el.children);
      if (el.thenChildren) traverse(el.thenChildren);
      if (el.elseChildren) traverse(el.elseChildren);
      if (el.fromChildren) traverse(el.fromChildren);
      if (el.toChildren) traverse(el.toChildren);
    }
  };

  traverse(elements);
  return result;
};

const subtractTradingDays = (dateStr: string, tradingDays: number): string => {
  const date = new Date(dateStr);
  const calendarDays = Math.ceil(tradingDays * 1.4);
  date.setDate(date.getDate() - calendarDays);
  return date.toISOString().slice(0, 10);
};

const collectTickersFromElements = (elements: any[]): Set<string> => {
  const tickers = new Set<string>();

  const traverse = (els: any[]) => {
    for (const el of els || []) {
      if (el.type === 'ticker' && el.ticker) {
        tickers.add(String(el.ticker).toUpperCase());
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
};

const firstAvailableDateForTicker = (priceData: Record<string, any>): string | null => {
  const dates = Object.keys(priceData || {}).sort();
  return dates.length > 0 ? dates[0] : null;
};

const findLatestTickerStartDate = (priceData: Record<string, Record<string, any>>): string | null => {
  let latest: string | null = null;
  for (const data of Object.values(priceData)) {
    const first = firstAvailableDateForTicker(data);
    if (!first) continue;
    if (!latest || first > latest) {
      latest = first;
    }
  }
  return latest;
};

async function prepareStrategyEvaluation(
  elements: StrategyElement[],
  apiKey: string,
  apiSecret: string,
  debug = false
) {
  const tickers = collectTickersFromElements(elements);
  tickers.add('SPY');

  const requiredIndicators: any[] = collectRequiredIndicators(elements);
  const sortIndicatorRequests = collectSortIndicatorRequests(elements).map((req) => ({
    ticker: 'SORT',
    indicator: req.indicator,
    period: req.period,
  }));

  const warmupDays = calculateWarmupDays([...requiredIndicators, ...sortIndicatorRequests]);
  const endDate = getMarketDateToday();
  const startDate = subtractTradingDays(endDate, warmupDays + 10);

  const priceData = await fetchPriceData(Array.from(tickers), startDate, endDate, apiKey, apiSecret);

  const latestTickerStart = findLatestTickerStartDate(priceData);

  const referenceTicker = tickers.has('SPY') ? 'SPY' : Array.from(tickers)[0];
  const referenceData = priceData[referenceTicker];
  if (!referenceData) {
    throw new Error(`Unable to fetch price data for reference ticker ${referenceTicker}`);
  }
  let dateGrid = Object.keys(referenceData).sort();
  if (latestTickerStart) {
    dateGrid = dateGrid.filter((date) => date >= latestTickerStart);
  }
  if (dateGrid.length < 2) {
    throw new Error('Insufficient price data to evaluate strategy');
  }

  const indicatorData = await fetchIndicators(requiredIndicators, priceData);
  const { executeStrategy, buildIndicatorMap } = await import('../execution');

  const sortStartDate = await precomputeSortIndicators({
    elements,
    priceData,
    indicatorData,
    dateGrid,
    executeStrategy,
    buildIndicatorMap,
    debug,
  });

  let effectiveDateGrid = dateGrid;
  if (sortStartDate) {
    const filtered = dateGrid.filter(d => d >= sortStartDate);
    if (filtered.length < 2) {
      throw new Error(`Insufficient price data after sort warmup (${sortStartDate})`);
    }
    effectiveDateGrid = filtered;
  }

  const decisionIndex = effectiveDateGrid.length - 2;
  const decisionDate = effectiveDateGrid[decisionIndex];
  const executionDate = effectiveDateGrid[decisionIndex + 1];

  const indicatorLookup = buildIndicatorLookupMap(elements);
  const { values: indicatorValuesForDate } = collectIndicatorValuesForDate(
    indicatorLookup,
    indicatorData,
    decisionDate
  );

  const indicatorMap = buildIndicatorMap(indicatorValuesForDate);
  const evaluation = executeStrategy(elements, indicatorMap, debug);

  return {
    evaluation,
    decisionDate,
    executionDate,
    priceData,
    indicatorData,
    dateGrid: effectiveDateGrid,
  };
}

tradingRouter.get('/strategy', async (_req: Request, res: Response) => {
  try {
    const strategy = await getActiveStrategy();

    if (!strategy) {
      return res.json({ strategy: null });
    }

    const sanitizedHoldings = normalizeHoldings(strategy.holdings);

    const apiKey = (_req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (_req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.json({
        strategy: {
          ...strategy,
          holdings: sanitizedHoldings,
        },
      });
    }

    const positions = await getAlpacaPositions(apiKey, apiSecret);

    let currentValue = 0;
    const liveHoldings = sanitizedHoldings.map((h) => {
      const pos = positions.find((p) => p.symbol === h.symbol);
      const marketValue = pos?.market_value || 0;
      currentValue += marketValue;
      return {
        symbol: h.symbol,
        qty: pos?.qty || h.qty,
        marketValue,
      };
    });

    const totalReturn = currentValue - strategy.investAmount;
    const totalReturnPct = (totalReturn / strategy.investAmount) * 100;

    return res.json({
      strategy: {
        ...strategy,
        currentValue,
        totalReturn,
        totalReturnPct,
        holdings: liveHoldings,
      },
    });
  } catch (err: any) {
    console.error('GET /api/strategy error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get strategy' });
  }
});

tradingRouter.get('/strategy/snapshots', async (_req: Request, res: Response) => {
  try {
    const strategy = await getActiveStrategy();

    if (!strategy) {
      return res.json({ snapshots: [] });
    }

    const { getSnapshots } = await import('../storage/strategySnapshots');
    const snapshots = await getSnapshots(strategy.id);

    return res.json({ snapshots });
  } catch (err: any) {
    console.error('GET /api/strategy/snapshots error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get snapshots' });
  }
});

tradingRouter.post('/invest/preview', async (req: Request, res: Response) => {
  try {
    const { amount, elements } = req.body;

    if (!amount || !elements) {
      return res.status(400).json({ error: 'Missing required fields: amount, elements' });
    }

    if (!Array.isArray(elements)) {
      return res.status(400).json({ error: 'elements must be an array' });
    }

    const investAmount = parseFloat(amount);
    if (!Number.isFinite(investAmount) || investAmount <= 0) {
      return res.status(400).json({ error: 'Invalid investment amount' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    const { evaluation } = await prepareStrategyEvaluation(elements as StrategyElement[], apiKey, apiSecret, false);
    const result = evaluation;

    if (!result.positions || result.positions.length === 0) {
      return res.status(400).json({ error: 'Strategy did not produce any positions' });
    }

    const totalWeight = result.positions.reduce((sum: number, p: any) => sum + p.weight, 0);
    const allocation = result.positions.map((position: any) => ({
      ticker: position.ticker,
      weightPct: (position.weight / totalWeight) * 100,
    }));

    return res.json({
      success: true,
      allocation,
    });
  } catch (err: any) {
    console.error('POST /api/invest/preview error:', err);
    return res.status(500).json({ error: err.message || 'Failed to preview investment' });
  }
});

tradingRouter.post('/invest', requireAuth, async (req: Request, res: Response) => {
  try {
    const { amount, name, elements } = req.body;
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!amount || !elements || !name) {
      return res.status(400).json({ error: 'Missing required fields: amount, name, elements' });
    }

    if (!Array.isArray(elements)) {
      return res.status(400).json({ error: 'elements must be an array' });
    }

    const investAmount = parseFloat(amount);
    if (!Number.isFinite(investAmount) || investAmount <= 0) {
      return res.status(400).json({ error: 'Invalid investment amount' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    console.log('\n=== STARTING LIVE DEPLOYMENT ===');
    console.log(`Name: ${name}, Amount: $${investAmount.toFixed(2)}`);

    // Check if a LIVE strategy with this name already exists
    const { hasLiveStrategyWithName } = await import('../db/strategiesDb');
    const hasDuplicate = await hasLiveStrategyWithName(name, userId);
    if (hasDuplicate) {
      return res.status(400).json({ error: `A LIVE strategy named "${name}" already exists. Please choose a different name or liquidate the existing strategy first.` });
    }

    console.log('Elements received for deployment:', JSON.stringify(elements, null, 2));

    const { evaluation: executionResult, decisionDate, executionDate, indicatorData } = await prepareStrategyEvaluation(elements as StrategyElement[], apiKey, apiSecret, true);

    console.log('\n=== STRATEGY EVALUATION DEBUG ===');
    console.log('Decision Date:', decisionDate);
    console.log('Execution Date:', executionDate);
    console.log('Indicator Data:', indicatorData);
    console.log('Execution Result:', JSON.stringify(executionResult, null, 2));
    console.log('=================================\n');

    if (!executionResult.positions || executionResult.positions.length === 0) {
      console.error('ERROR: Strategy produced no positions!');
      console.error('Execution errors:', executionResult.errors);
      console.error('Execution path:', executionResult.executionPath);
      return res.status(400).json({
        error: 'Strategy did not produce any positions to trade',
        debug: {
          errors: executionResult.errors,
          executionPath: executionResult.executionPath,
          gateEvaluations: executionResult.gateEvaluations,
        }
      });
    }

    console.log('Strategy produced positions:', JSON.stringify(executionResult.positions, null, 2));
    console.log('Execution path:', executionResult.executionPath);

    const positions = executionResult.positions;
    const totalWeight = positions.reduce((sum: number, pos: any) => sum + pos.weight, 0);
    if (totalWeight <= 0) {
      return res.status(400).json({ error: 'Strategy produced zero total weight' });
    }

    const allocation: Record<string, number> = {};
    for (const pos of positions) {
      const weightPct = (pos.weight / totalWeight) * 100;
      allocation[pos.ticker] = weightPct;
    }

    console.log('Allocation:', allocation);

    // Create strategy first to get ID for order tagging
    const dbStrategy = await createActiveStrategy({
      name,
      flow_data: { elements },
      mode: 'paper',
      initial_capital: investAmount,
      current_capital: 0, // Will update after orders fill
      holdings: [],
      user_id: userId,
    });

    const holdings: Array<{ symbol: string; qty: number; entry_price?: number }> = [];
    const pendingOrders: Array<{ orderId: string; symbol: string; side: 'buy' | 'sell'; qty: number }> = [];
    let totalInvested = 0;

    for (const [symbol, weightPct] of Object.entries(allocation)) {
      const targetDollars = investAmount * (weightPct / 100);
      const price = await getCurrentPrice(symbol, apiKey, apiSecret);
      const qty = targetDollars / price;

      console.log(`Placing market order for ${symbol}: ${qty.toFixed(4)} shares ($${targetDollars.toFixed(2)})`);

      try {
        // Pass strategyId for order tagging
        const order = await placeMarketOrder(symbol, qty, 'buy', apiKey, apiSecret, dbStrategy.id);
        const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

        if (pending) {
          console.log(`Buy order pending (market closed) for ${symbol}`);
          pendingOrders.push({ orderId: order.id, symbol, side: 'buy', qty });
          holdings.push({ symbol, qty: 0, entry_price: 0 });
        } else {
          const spent = filledQty * avgPrice;
          totalInvested += spent;
          holdings.push({ symbol, qty: filledQty, entry_price: avgPrice });
          console.log(`Filled: ${filledQty} @ $${avgPrice.toFixed(2)} = $${spent.toFixed(2)}`);
        }
      } catch (err: any) {
        console.error(`Failed to buy ${symbol}:`, err.message);
      }
    }

    // Update strategy with actual holdings and capital
    await updateActiveStrategy(dbStrategy.id, {
      holdings,
      current_capital: totalInvested,
      pending_orders: pendingOrders.length > 0 ? pendingOrders : undefined,
    });

    if (pendingOrders.length === 0 && holdings.length > 0) {
      const holdingsWithPrices = await Promise.all(
        holdings.map(async (h) => {
          const price = h.entry_price || (await getCurrentPrice(h.symbol, apiKey, apiSecret));
          return {
            symbol: h.symbol,
            qty: h.qty,
            price,
            value: h.qty * price,
          };
        })
      );

      const totalReturn = totalInvested - investAmount;
      const cumulativeReturn = investAmount > 0 ? totalReturn / investAmount : 0;

      await upsertSnapshot({
        active_strategy_id: dbStrategy.id,
        snapshot_date: getMarketDateToday(),
        equity: totalInvested,
        holdings: holdingsWithPrices,
        cumulative_return: cumulativeReturn,
        total_return: totalReturn,
        rebalance_type: 'initial',
      });
    }

    await calculateAttributionOnDeploy(dbStrategy.id, holdings);

    // Auto-save strategy to Library with LIVE status
    console.log('Saving strategy to Library with LIVE status...');
    const { saveStrategy } = await import('../db/strategiesDb');
    try {
      await saveStrategy({
        name,
        versioning_enabled: false,
        version_major: 1,
        version_minor: 0,
        version_patch: 0,
        version_fork: '',
        elements,
        user_id: userId,
        status: 'LIVE',
      });
      console.log('✓ Strategy saved to Library');
    } catch (saveErr: any) {
      console.error('Failed to auto-save strategy to Library:', saveErr.message);
      // Don't fail deployment if auto-save fails
    }

    console.log('=== INVEST COMPLETE ===\n');

    return res.json({
      success: true,
      strategy: {
        id: dbStrategy.id,
        name: dbStrategy.name,
        initial_capital: parseFloat(dbStrategy.initial_capital),
        current_capital: dbStrategy.current_capital ? parseFloat(dbStrategy.current_capital) : 0,
        holdings: normalizeHoldings(dbStrategy.holdings),
        status: dbStrategy.status,
      },
    });
  } catch (err: any) {
    console.error('POST /api/invest error:', err);
    return res.status(500).json({ error: err.message || 'Investment failed' });
  }
});

tradingRouter.get('/active-strategies', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    const strategies = await getActiveStrategiesByUserId(userId);

    // Fetch live Alpaca positions to calculate current values
    let alpacaPositions: Array<{ symbol: string; qty: number; market_value: number; avg_entry_price: number; current_price: number }> = [];
    if (apiKey && apiSecret) {
      try {
        const positionsResponse = await axios.get('https://paper-api.alpaca.markets/v2/positions', {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
          timeout: 10000,
        });
        alpacaPositions = positionsResponse.data.map((pos: any) => ({
          symbol: pos.symbol,
          qty: parseFloat(pos.qty),
          market_value: parseFloat(pos.market_value),
          avg_entry_price: parseFloat(pos.avg_entry_price),
          current_price: parseFloat(pos.current_price),
        }));
      } catch (err: any) {
        console.error('Failed to fetch Alpaca positions for live calculation:', err.message);
      }
    }

    return res.json({
      strategies: strategies.map((s) => {
        const initialCapital = parseFloat(s.initial_capital);
        const attribution = s.position_attribution || {};

        // Calculate current value using attribution and live Alpaca positions
        let currentValue = 0;
        const virtualHoldings: Array<{ symbol: string; qty: number; marketValue: number }> = [];

        for (const [symbol, attr] of Object.entries(attribution as Record<string, any>)) {
          const alpacaPos = alpacaPositions.find((p) => p.symbol === symbol);
          const allocationPct = (attr as any)?.allocation_pct || 0;

          if (alpacaPos) {
            // Calculate virtual holdings based on attribution
            const virtualQty = alpacaPos.qty * allocationPct;
            const virtualValue = alpacaPos.market_value * allocationPct;
            currentValue += virtualValue;

            virtualHoldings.push({
              symbol,
              qty: virtualQty,
              marketValue: virtualValue,
            });
          }
        }

        // Calculate returns
        const totalReturn = currentValue - initialCapital;
        const totalReturnPct = initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0;

        return {
          id: s.id,
          name: s.name,
          status: s.status,
          mode: s.mode,
          initial_capital: initialCapital,
          current_capital: currentValue, // Calculated, not from DB
          totalReturn,
          totalReturnPct,
          holdings: virtualHoldings, // Virtual holdings based on attribution
          pending_orders: s.pending_orders || [],
          started_at: s.started_at,
          last_rebalance_at: s.last_rebalance_at,
          flowData: s.flow_data || null,
        };
      }),
    });
  } catch (err: any) {
    console.error('GET /api/active-strategies error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch active strategies' });
  }
});

tradingRouter.get('/active-strategies/:id/snapshots', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const strategyId = parseInt(req.params.id);

    if (!Number.isFinite(strategyId)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const strategy = await getActiveStrategyById(strategyId);
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    if (strategy.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this strategy' });
    }

    const { getSnapshotsByStrategyId } = await import('../db/activeStrategySnapshotsDb');
    const snapshots = await getSnapshotsByStrategyId(strategyId);

    return res.json({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        date: s.snapshot_date,
        equity: parseFloat(s.equity),
        holdings: s.holdings || [],
        daily_return: s.daily_return ? parseFloat(s.daily_return) : null,
        cumulative_return: s.cumulative_return ? parseFloat(s.cumulative_return) : null,
        total_return: s.total_return ? parseFloat(s.total_return) : null,
        rebalance_type: s.rebalance_type,
      })),
    });
  } catch (err: any) {
    console.error('GET /api/active-strategies/:id/snapshots error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch snapshots' });
  }
});

tradingRouter.post('/create-snapshots', async (req: Request, res: Response) => {
  try {
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    console.log('[API] Manual snapshot creation triggered');

    const { createSnapshotsNow } = await import('../services/snapshotScheduler');
    await createSnapshotsNow(apiKey, apiSecret);

    return res.json({ success: true, message: 'Snapshots created successfully' });
  } catch (err: any) {
    console.error('POST /api/create-snapshots error:', err);
    return res.status(500).json({ error: err.message || 'Snapshot creation failed' });
  }
});

tradingRouter.post('/rebalance', requireAuth, async (req: Request, res: Response) => {
  try {
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    if (!(await hasActiveStrategy())) {
      return res.status(400).json({ error: 'No active strategy to rebalance' });
    }

    console.log('\n=== MANUAL REBALANCE TRIGGERED ===');

    const { rebalanceActiveStrategy } = await import('../services/rebalance');
    const result = await rebalanceActiveStrategy(apiKey, apiSecret);

    return res.json({
      success: true,
      soldSymbols: result.soldSymbols,
      boughtSymbols: result.boughtSymbols,
      cashRemaining: result.cashRemaining,
      holdings: result.updatedHoldings,
    });
  } catch (err: any) {
    console.error('POST /api/rebalance error:', err);
    return res.status(500).json({ error: err.message || 'Rebalance failed' });
  }
});

tradingRouter.post('/liquidate', requireAuth, async (req: Request, res: Response) => {
  try {
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    const strategy = await getActiveStrategy();
    if (!strategy) {
      return res.status(400).json({ error: 'No active strategy to liquidate' });
    }

    console.log(`\n=== LIQUIDATING STRATEGY: ${strategy.name} ===`);

    const soldPositions: Array<{ symbol: string; qty: number; proceeds: number }> = [];
    let totalProceeds = 0;

    for (const holding of strategy.holdings) {
      if (holding.qty <= 0) continue;

      try {
        console.log(`Selling ${holding.qty.toFixed(4)} ${holding.symbol}...`);
        // Note: old /liquidate endpoint doesn't have strategy ID, so no tagging
        const order = await placeMarketOrder(holding.symbol, holding.qty, 'sell', apiKey, apiSecret);
        const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

        if (pending) {
          console.log(`Sell order pending for ${holding.symbol} - will fill when market opens`);
          soldPositions.push({ symbol: holding.symbol, qty: filledQty, proceeds: 0 });
        } else {
          const proceeds = filledQty * avgPrice;
          totalProceeds += proceeds;
          soldPositions.push({ symbol: holding.symbol, qty: filledQty, proceeds });
          console.log(`Sold ${filledQty} ${holding.symbol} @ $${avgPrice.toFixed(2)} = $${proceeds.toFixed(2)}`);
        }
      } catch (err: any) {
        console.error(`Failed to sell ${holding.symbol}:`, err.message);
      }
    }

    if (totalProceeds > 0) {
      console.log('Creating final liquidation snapshot...');
      const { createSnapshot } = await import('../storage/strategySnapshots');
      await createSnapshot(strategy.id, strategy.investAmount, [], 'liquidation');
      console.log('Final snapshot created');
    }

    await clearActiveStrategy();

    console.log('=== LIQUIDATION COMPLETE ===');
    console.log(`Total proceeds: $${totalProceeds.toFixed(2)}`);

    return res.json({
      success: true,
      message: 'Strategy liquidated successfully',
      soldPositions,
      totalProceeds,
    });
  } catch (err: any) {
    console.error('POST /api/liquidate error:', err);
    return res.status(500).json({ error: err.message || 'Liquidation failed' });
  }
});

tradingRouter.post('/strategy/:id/liquidate', requireAuth, async (req: Request, res: Response) => {
  try {
    const strategyId = parseInt(req.params.id);
    if (!Number.isFinite(strategyId)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    const strategy = await getActiveStrategyById(strategyId);
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    console.log(`\n=== LIQUIDATING STRATEGY: ${strategy.name} (ID: ${strategyId}) ===`);

    const holdings = Array.isArray(strategy.holdings) ? strategy.holdings : [];
    if (holdings.length === 0) {
      console.log('No holdings to liquidate. Marking strategy as stopped.');
      await updateActiveStrategy(strategyId, {
        status: 'stopped',
        holdings: [],
        pending_orders: [],
        stopped_at: new Date().toISOString(),
      });
      await removeStrategyFromAttribution(strategyId);
      return res.json({ success: true, message: 'Strategy had no holdings. Marked as stopped.' });
    }

    const soldPositions: Array<{ symbol: string; qty: number; proceeds: number }> = [];
    const pendingOrders: Array<{ orderId: string; symbol: string; qty: number; side: 'buy' | 'sell' }> = [];
    let totalProceeds = 0;
    let hasPendingOrders = false;

    for (const holding of holdings) {
      const qtyToSell = holding.qty || holding.quantity || holding.shares || 0;
      if (qtyToSell <= 0) continue;

      try {
        console.log(`Selling ${qtyToSell} ${holding.symbol}...`);
        // Pass strategyId for order tagging
        const order = await placeMarketOrder(holding.symbol, qtyToSell, 'sell', apiKey, apiSecret, strategyId);
        const { filledQty, avgPrice, pending } = await waitForFill(order.id, apiKey, apiSecret);

        if (pending) {
          console.log(`Sell order pending for ${holding.symbol} - will fill when market opens`);
          soldPositions.push({ symbol: holding.symbol, qty: filledQty, proceeds: 0 });
          pendingOrders.push({ orderId: order.id, symbol: holding.symbol, qty: qtyToSell, side: 'sell' });
          hasPendingOrders = true;
        } else {
          const proceeds = filledQty * avgPrice;
          totalProceeds += proceeds;
          soldPositions.push({ symbol: holding.symbol, qty: filledQty, proceeds });
          console.log(`Sold ${filledQty} ${holding.symbol} @ $${avgPrice.toFixed(2)} = $${proceeds.toFixed(2)}`);
        }
      } catch (err: any) {
        console.error(`Failed to sell ${holding.symbol}:`, err.message);
      }
    }

    if (hasPendingOrders) {
      console.log('=== LIQUIDATION PENDING ===');
      console.log(`${pendingOrders.length} sell orders pending - strategy status set to 'liquidating'`);

      await updateActiveStrategy(strategyId, {
        status: 'liquidating',
        pending_orders: pendingOrders,
      });

      return res.json({
        success: true,
        message: 'Liquidation started - sell orders pending',
        soldPositions,
        pendingOrders: pendingOrders.length,
        totalProceeds: 0,
      });
    }

    console.log('=== LIQUIDATION COMPLETE ===');
    console.log(`Total proceeds: $${totalProceeds.toFixed(2)}`);

    if (totalProceeds > 0) {
      console.log('Creating final liquidation snapshot...');
      await upsertSnapshot({
        active_strategy_id: strategyId,
        snapshot_date: getMarketDateToday(),
        equity: totalProceeds,
        holdings: [],
        cumulative_return:
          (totalProceeds - parseFloat(strategy.initial_capital)) / parseFloat(strategy.initial_capital),
        total_return: totalProceeds - parseFloat(strategy.initial_capital),
        rebalance_type: 'liquidation',
      });
      console.log('Final snapshot created');
    }

    await updateActiveStrategy(strategyId, {
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      current_capital: totalProceeds,
      holdings: [],
      pending_orders: [],
    });

    await removeStrategyFromAttribution(strategyId);

    // Update saved strategy status to LIQUIDATED
    console.log('Updating Library strategy status to LIQUIDATED...');
    const { updateStrategy: updateSavedStrategy } = await import('../db/strategiesDb');
    const { getStrategiesByName } = await import('../db/strategiesDb');
    try {
      const savedStrategies = await getStrategiesByName(strategy.name);
      const liveStrategy = savedStrategies.find((s: any) => s.status === 'LIVE' && s.user_id === (req as any).user?.id);
      if (liveStrategy) {
        await updateSavedStrategy(liveStrategy.id, { status: 'LIQUIDATED' });
        console.log('✓ Library strategy marked as LIQUIDATED');
      }
    } catch (updateErr: any) {
      console.error('Failed to update Library strategy status:', updateErr.message);
      // Don't fail liquidation if status update fails
    }

    return res.json({
      success: true,
      message: 'Strategy liquidated successfully',
      soldPositions,
      totalProceeds,
    });
  } catch (err: any) {
    console.error('POST /api/strategy/:id/liquidate error:', err);
    return res.status(500).json({ error: err.message || 'Liquidation failed' });
  }
});

// Data Debug Endpoint - returns all data sources for debugging live strategies
tradingRouter.get('/debug/data', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[DEBUG DATA] Request received');
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    // 1. Get active_strategies from DB
    const strategies = await getActiveStrategiesByUserId(userId);

    const activeStrategiesData = strategies.map((s) => ({
      id: s.id,
      name: s.name,
      user_id: s.user_id,
      status: s.status,
      mode: s.mode,
      initial_capital: s.initial_capital,
      current_capital: s.current_capital,
      started_at: s.started_at,
      last_rebalance_at: s.last_rebalance_at,
      stopped_at: s.stopped_at,
    }));

    // 2. Get active_strategy_snapshots from DB
    const { getSnapshotsByStrategyId } = await import('../db/activeStrategySnapshotsDb');
    const allSnapshots = [];
    for (const strategy of strategies) {
      const snapshots = await getSnapshotsByStrategyId(strategy.id);
      allSnapshots.push(...snapshots.map((s) => ({
        id: s.id,
        active_strategy_id: s.active_strategy_id,
        snapshot_date: s.snapshot_date,
        equity: s.equity,
        holdings: JSON.stringify(s.holdings),
        daily_return: s.daily_return,
        cumulative_return: s.cumulative_return,
        total_return: s.total_return,
        rebalance_type: s.rebalance_type,
        created_at: s.created_at,
      })));
    }

    // 3. Get Alpaca positions (live) - fetch full data
    const positionsResponse = await axios.get('https://paper-api.alpaca.markets/v2/positions', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 10000,
    });
    const alpacaPositionsData = positionsResponse.data.map((pos: any) => ({
      symbol: pos.symbol,
      qty: parseFloat(pos.qty),
      avg_entry_price: parseFloat(pos.avg_entry_price),
      current_price: parseFloat(pos.current_price),
      market_value: parseFloat(pos.market_value),
      cost_basis: parseFloat(pos.cost_basis),
      unrealized_pl: parseFloat(pos.unrealized_pl),
      unrealized_plpc: parseFloat(pos.unrealized_plpc),
      side: pos.side,
    }));

    // 4. Get Alpaca account (live)
    const accountResponse = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 10000,
    });
    const account = accountResponse.data;
    const alpacaAccountData = [{
      portfolio_value: account.portfolio_value,
      cash: account.cash,
      equity: account.equity,
      long_market_value: account.long_market_value,
      buying_power: account.buying_power,
      last_equity: account.last_equity,
      account_number: account.account_number,
      status: account.status,
    }];

    // 5. Calculate attribution & virtual holdings
    const calculatedAttributionData = [];
    for (const strategy of strategies) {
      const attribution = strategy.position_attribution || {};

      for (const [symbol, attr] of Object.entries(attribution as Record<string, any>)) {
        const alpacaPos = alpacaPositionsData.find((p: any) => p.symbol === symbol);
        const alpacaQty = alpacaPos?.qty || 0;
        const alpacaMarketValue = alpacaPos?.market_value || 0;
        const allocationPct = (attr as any)?.allocation_pct || 0;
        const virtualQty = alpacaQty * allocationPct;
        const virtualMarketValue = alpacaMarketValue * allocationPct;

        calculatedAttributionData.push({
          strategy_id: strategy.id,
          strategy_name: strategy.name,
          symbol,
          attribution_qty: (attr as any)?.qty || 0,
          allocation_pct: allocationPct,
          alpaca_actual_qty: alpacaQty,
          alpaca_market_value: alpacaMarketValue,
          virtual_qty: virtualQty,
          virtual_market_value: virtualMarketValue,
        });
      }
    }

    return res.json({
      active_strategies: activeStrategiesData,
      active_strategy_snapshots: allSnapshots,
      alpaca_positions: alpacaPositionsData,
      alpaca_account: alpacaAccountData,
      calculated_attribution: calculatedAttributionData,
    });
  } catch (err: any) {
    console.error('GET /api/debug/data error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch debug data' });
  }
});

/**
 * GET /api/portfolio/holdings
 * Returns comprehensive portfolio holdings view with attribution breakdown
 */
tradingRouter.get('/portfolio/holdings', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    // Fetch Alpaca positions (source of truth)
    const alpacaPositions = await getAlpacaPositions(apiKey, apiSecret);

    // Fetch Alpaca account for cash balance
    const accountResponse = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 10000,
    });
    const cashBalance = parseFloat(accountResponse.data.cash);

    // Fetch all active strategies with attribution
    const strategies = await getActiveStrategiesByUserId(userId);
    const activeStrategies = strategies.filter(s => s.status === 'active');

    // Calculate strategy portfolio total (sum of all active strategy initial capital)
    const strategyTotalInvested = activeStrategies.reduce((sum, s) => sum + parseFloat(String(s.initial_capital || 0)), 0);

    // Calculate total positions value from Alpaca
    const totalPositionsValue = alpacaPositions.reduce((sum, p) => sum + p.market_value, 0);

    // Cash remainder is the unfilled portion of strategy capital
    const strategyCashRemainder = strategyTotalInvested - totalPositionsValue;

    // Total portfolio value for this view is the strategy total
    const totalPortfolioValue = strategyTotalInvested;

    // Build holdings array with attribution breakdown
    const holdings: Array<{
      symbol: string;
      qty: number;
      marketValue: number;
      weight: number; // % of total portfolio
      strategies: Array<{
        strategyId: number;
        strategyName: string;
        allocationPct: number; // % of this position owned by strategy
        qty: number;
        marketValue: number;
      }>;
    }> = [];

    for (const position of alpacaPositions) {
      const strategiesForSymbol = [];

      for (const strategy of activeStrategies) {
        const attribution = strategy.position_attribution as Record<string, any> || {};
        const attr = attribution[position.symbol];

        if (attr) {
          const virtualQty = position.qty * attr.allocation_pct;
          const virtualValue = position.market_value * attr.allocation_pct;

          strategiesForSymbol.push({
            strategyId: strategy.id,
            strategyName: strategy.name,
            allocationPct: attr.allocation_pct,
            qty: virtualQty,
            marketValue: virtualValue,
          });
        }
      }

      holdings.push({
        symbol: position.symbol,
        qty: position.qty,
        marketValue: position.market_value,
        weight: totalPortfolioValue > 0 ? (position.market_value / totalPortfolioValue) : 0,
        strategies: strategiesForSymbol,
      });
    }

    // Calculate cash remainder (simple version: just use Alpaca cash balance)
    // Future: track orders_placed - orders_filled via client_order_id
    const cashRemainderStrategies = activeStrategies.map(s => ({
      strategyId: s.id,
      strategyName: s.name,
      // For now, cash is unattributed - future enhancement
      cashAmount: 0,
    }));

    return res.json({
      totalPortfolioValue,
      totalPositionsValue,
      cashBalance: strategyCashRemainder,
      holdings,
      cashRemainderStrategies,
    });
  } catch (err: any) {
    console.error('GET /api/portfolio/holdings error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch portfolio holdings' });
  }
});

export default tradingRouter;
