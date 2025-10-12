import { Router, Request, Response } from 'express';
import axios from 'axios';
import { FEED, PORT, INDICATOR_SERVICE_URL } from '../config/constants';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, service: 'api', port: PORT }));
router.get('/api/health', (_req: Request, res: Response) => res.json({ status: 'ok', port: PORT }));

router.get('/indicators/health', async (_req, res) => {
  try {
    const r = await axios.get(`${INDICATOR_SERVICE_URL}/health`).catch((err) =>
      err.response ? err.response : Promise.reject(err)
    );
    return res.json({ ok: true, reachable: true, status: r.status, upstream: r.data ?? null });
  } catch (err: any) {
    return res.status(502).json({ ok: false, reachable: false, error: err.message });
  }
});

router.get('/api/debug/env', (req: Request, res: Response) => {
  res.json({
    hasKey: !!process.env.ALPACA_API_KEY,
    hasSecret: !!process.env.ALPACA_API_SECRET,
    headerKey: !!req.header('APCA-API-KEY-ID'),
    headerSecret: !!req.header('APCA-API-SECRET-KEY'),
    feed: FEED,
    indicatorAdjustment: 'split',
    returnsAdjustment: 'all',
  });
});

router.get('/api/account', async (req: Request, res: Response) => {
  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Missing Alpaca API credentials' });
  }

  try {
    const response = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 10000,
    });

    return res.json(response.data);
  } catch (err: any) {
    console.error('GET /api/account error:', err?.response?.data || err?.message);
    return res.status(err?.response?.status || 500).json({
      error: err?.response?.data?.message || err?.message || 'Failed to fetch account information',
    });
  }
});

router.get('/api/positions', async (req: Request, res: Response) => {
  const apiKey = (req.header('APCA-API-KEY-ID') || process.env.ALPACA_API_KEY || '').trim();
  const apiSecret = (req.header('APCA-API-SECRET-KEY') || process.env.ALPACA_API_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Missing Alpaca API credentials' });
  }

  try {
    const response = await axios.get('https://paper-api.alpaca.markets/v2/positions', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      timeout: 10000,
    });

    const positions = response.data.map((pos: any) => ({
      symbol: pos.symbol,
      qty: parseFloat(pos.qty),
      avgEntryPrice: parseFloat(pos.avg_entry_price),
      currentPrice: parseFloat(pos.current_price),
      marketValue: parseFloat(pos.market_value),
      costBasis: parseFloat(pos.cost_basis),
      unrealizedPl: parseFloat(pos.unrealized_pl),
      unrealizedPlpc: parseFloat(pos.unrealized_plpc),
      side: pos.side,
    }));

    return res.json({ positions });
  } catch (err: any) {
    console.error('GET /api/positions error:', err?.response?.data || err?.message);
    return res.status(err?.response?.status || 500).json({
      error: err?.response?.data?.message || err?.message || 'Failed to fetch positions',
    });
  }
});

export default router;
