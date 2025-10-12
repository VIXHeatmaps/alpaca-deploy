import { Router, Request, Response } from 'express';
import axios from 'axios';

import { requireAuth } from '../auth/jwt';
import { FEED } from '../config/constants';
import { todayYMD, toRFC3339End, toRFC3339Start } from '../utils/date';
import { getMarketDateToday } from '../utils/marketTime';
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

tradingRouter.get('/strategy', async (_req: Request, res: Response) => {
  try {
    const strategy = await getActiveStrategy();

    if (!strategy) {
      return res.json({ strategy: null });
    }

    const apiKey = (_req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (_req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.json({ strategy });
    }

    const positions = await getAlpacaPositions(apiKey, apiSecret);

    let currentValue = 0;
    const liveHoldings = strategy.holdings.map((h) => {
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

    const { executeStrategy, collectRequiredIndicators, buildIndicatorMap } = await import('../execution');

    const requiredIndicators: any[] = collectRequiredIndicators(elements);

    const indicatorValues: Array<any> = [];
    for (const reqIndicator of requiredIndicators) {
      try {
        const barsUrl = `https://data.alpaca.markets/v2/stocks/${reqIndicator.ticker}/bars`;
        const barsResponse = await axios.get(barsUrl, {
          params: {
            feed: FEED,
            timeframe: '1Day',
            start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            end: todayYMD(),
            adjustment: 'split',
            limit: 500,
          },
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });

        const bars = barsResponse.data.bars || [];
        if (!bars.length) continue;

        let indicatorValue: number;
        if (reqIndicator.indicator === 'PRICE' || reqIndicator.indicator === 'CURRENT_PRICE') {
          indicatorValue = bars[bars.length - 1].c;
        } else {
          const closes = bars.map((b: any) => b.c);
          const highs = bars.map((b: any) => b.h);
          const lows = bars.map((b: any) => b.l);
          const volumes = bars.map((b: any) => b.v);
          const period = parseInt(reqIndicator.period) || 14;

          const payload: any = {
            indicator: reqIndicator.indicator,
            params: (reqIndicator.params as Record<string, unknown>) || { period },
          };

          if (reqIndicator.indicator === 'RSI' || reqIndicator.indicator === 'SMA' || reqIndicator.indicator === 'EMA') {
            payload.close = closes;
            payload.prices = closes;
          } else if (reqIndicator.indicator === 'ATR' || reqIndicator.indicator === 'ADX') {
            payload.high = highs;
            payload.low = lows;
            payload.close = closes;
          } else if (reqIndicator.indicator === 'MFI') {
            payload.high = highs;
            payload.low = lows;
            payload.close = closes;
            payload.volume = volumes;
          } else {
            payload.close = closes;
            payload.prices = closes;
          }

          const indResponse = await axios.post(`${process.env.INDICATOR_SERVICE_URL || 'http://127.0.0.1:8001'}/indicator`, payload, {
            timeout: 10000,
          });
          const values = indResponse.data.values || [];
          indicatorValue = values[values.length - 1];
        }

        indicatorValues.push({
          ticker: reqIndicator.ticker,
          indicator: reqIndicator.indicator,
          period: String(reqIndicator.period ?? ''),
          value: indicatorValue,
        });
      } catch (err: any) {
        console.error(`Error fetching indicator ${reqIndicator.ticker} ${reqIndicator.indicator}:`, err.message);
      }
    }

    const indicatorData = buildIndicatorMap(indicatorValues);
    const result = executeStrategy(elements, indicatorData);

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

    const { executeStrategy, collectRequiredIndicators, buildIndicatorMap } = await import('../execution');

    const requiredIndicators: any[] = collectRequiredIndicators(elements);
    console.log(`Found ${requiredIndicators.length} indicators required`);

    console.log('Fetching latest indicator values...');

    const indicatorPayloads: Array<{ indicator: any; payload: any }> = [];
    const indicatorResponses: Array<any> = [];

    for (const indicator of requiredIndicators) {
      try {
        const barsUrl = `https://data.alpaca.markets/v2/stocks/${indicator.ticker}/bars`;
        const barsResponse = await axios.get(barsUrl, {
          params: {
            feed: FEED,
            timeframe: '1Day',
            start: toRFC3339Start('2000-01-01'),
            end: toRFC3339End(todayYMD()),
            adjustment: 'split',
            limit: 500,
          },
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
          timeout: 10000,
        });

        const bars = barsResponse.data?.bars || [];

        if (bars.length === 0) continue;

        const payload: any = {
          indicator: indicator.indicator,
          params: indicator.params || {},
          close: bars.map((bar: any) => bar.c),
          high: bars.map((bar: any) => bar.h),
          low: bars.map((bar: any) => bar.l),
          volume: bars.map((bar: any) => bar.v),
          prices: bars.map((bar: any) => bar.c),
        };

        indicatorPayloads.push({ indicator, payload });
      } catch (err: any) {
        console.error(`Failed to fetch bars for indicator ${indicator.ticker} ${indicator.indicator}:`, err.message);
      }
    }

    for (const request of indicatorPayloads) {
      try {
        const response = await axios.post(`${process.env.INDICATOR_SERVICE_URL || 'http://127.0.0.1:8001'}/indicator`, request.payload, {
          timeout: 10000,
        });
        indicatorResponses.push({
          indicator: request.indicator,
          response: response.data,
        });
      } catch (err: any) {
        console.error(`Failed to calculate indicator ${request.indicator.ticker} ${request.indicator.indicator}:`, err.message);
      }
    }

    console.log('Indicator values ready, executing strategy...');
    const indicatorDataValues = indicatorResponses.flatMap((item: any) => {
      const values = item.response?.values || [];
      if (!values.length) return [];
      const latest = values[values.length - 1];
      if (latest === null || latest === undefined) return [];
      const periodFromIndicator = item.indicator?.period ?? item.indicator?.params?.period ?? '';
      const numericValue = Number(latest);
      if (!Number.isFinite(numericValue)) return [];
      return [
        {
          ticker: item.indicator.ticker,
          indicator: item.indicator.indicator,
          period: String(periodFromIndicator ?? ''),
          value: numericValue,
        },
      ];
    });

    const indicatorData = buildIndicatorMap(indicatorDataValues as any);

    const executionResult = executeStrategy(elements, indicatorData);

    if (!executionResult.positions || executionResult.positions.length === 0) {
      return res.status(400).json({ error: 'Strategy did not produce any positions to trade' });
    }

    console.log('Strategy produced positions:', executionResult.positions);

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

    const holdings: Array<{ symbol: string; qty: number; entry_price?: number }> = [];
    const pendingOrders: Array<{ orderId: string; symbol: string; side: 'buy' | 'sell'; qty: number }> = [];
    let totalInvested = 0;

    for (const [symbol, weightPct] of Object.entries(allocation)) {
      const targetDollars = investAmount * (weightPct / 100);
      const price = await getCurrentPrice(symbol, apiKey, apiSecret);
      const qty = targetDollars / price;

      console.log(`Placing market order for ${symbol}: ${qty.toFixed(4)} shares ($${targetDollars.toFixed(2)})`);

      try {
        const order = await placeMarketOrder(symbol, qty, 'buy', apiKey, apiSecret);
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

    const dbStrategy = await createActiveStrategy({
      name,
      flow_data: { elements },
      mode: 'paper',
      initial_capital: investAmount,
      current_capital: totalInvested,
      holdings,
      pending_orders: pendingOrders.length > 0 ? pendingOrders : undefined,
      user_id: userId,
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

    console.log('=== INVEST COMPLETE ===\n');

    return res.json({
      success: true,
      strategy: {
        id: dbStrategy.id,
        name: dbStrategy.name,
        initial_capital: parseFloat(dbStrategy.initial_capital),
        current_capital: dbStrategy.current_capital ? parseFloat(dbStrategy.current_capital) : 0,
        holdings: dbStrategy.holdings,
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

    const strategies = await getActiveStrategiesByUserId(userId);

    return res.json({
      strategies: strategies.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        mode: s.mode,
        initial_capital: parseFloat(s.initial_capital),
        current_capital: s.current_capital ? parseFloat(s.current_capital) : null,
        holdings: s.holdings || [],
        pending_orders: s.pending_orders || [],
        started_at: s.started_at,
        last_rebalance_at: s.last_rebalance_at,
      })),
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

tradingRouter.post('/strategy/sync-holdings', async (req: Request, res: Response) => {
  try {
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    const strategy = await getActiveStrategy();
    if (!strategy) {
      return res.status(400).json({ error: 'No active strategy to sync' });
    }

    console.log(`\n=== SYNCING HOLDINGS FOR STRATEGY: ${strategy.name} ===`);

    const positions = await getAlpacaPositions(apiKey, apiSecret);
    console.log(`Found ${positions.length} positions in Alpaca account`);

    const updatedHoldings = positions.map((pos) => ({
      symbol: pos.symbol,
      qty: pos.qty,
    }));

    const currentValue = positions.reduce((sum, pos) => sum + pos.market_value, 0);

    await setActiveStrategy({
      ...strategy,
      holdings: updatedHoldings,
      currentValue,
      pendingOrders: [],
    });

    console.log('Holdings synced successfully');

    return res.json({ success: true, holdings: updatedHoldings, currentValue });
  } catch (err: any) {
    console.error('POST /api/strategy/sync-holdings error:', err);
    return res.status(500).json({ error: err.message || 'Failed to sync holdings' });
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

tradingRouter.post('/strategy/:id/sync-holdings', requireAuth, async (req: Request, res: Response) => {
  try {
    const strategyId = parseInt(req.params.id);
    const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
    const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing Alpaca API credentials' });
    }

    const strategy = await getActiveStrategyById(strategyId);
    if (!strategy) {
      return res.status(404).json({ error: `Strategy ${strategyId} not found` });
    }

    console.log(`\n=== SYNCING HOLDINGS FOR STRATEGY: ${strategy.name} (ID: ${strategyId}) ===`);

    const positions = await getAlpacaPositions(apiKey, apiSecret);
    console.log(`Found ${positions.length} total positions in Alpaca account`);

    const updatedHoldings = positions.map((pos) => ({
      symbol: pos.symbol,
      qty: pos.qty,
      marketValue: pos.market_value,
    }));

    const currentValue = positions.reduce((sum, pos) => sum + pos.market_value, 0);

    await updateActiveStrategy(strategyId, {
      holdings: updatedHoldings,
      current_capital: currentValue,
      pending_orders: [],
    });

    console.log('Holdings synced successfully');

    return res.json({
      success: true,
      holdings: updatedHoldings,
      currentValue,
    });
  } catch (err: any) {
    console.error(`POST /api/strategy/:id/sync-holdings error:`, err);
    return res.status(500).json({ error: err.message || 'Failed to sync holdings' });
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
        const order = await placeMarketOrder(holding.symbol, qtyToSell, 'sell', apiKey, apiSecret);
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

export default tradingRouter;
