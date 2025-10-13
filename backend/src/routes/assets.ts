import { Router, Request, Response } from 'express';

import { requireAuth } from '../auth/jwt';
import { getTickerMetadata, forceRefreshTickerMetadata } from '../services/tickerMetadata';

const assetsRouter = Router();

assetsRouter.get('/tickers/meta', requireAuth, async (req: Request, res: Response) => {
  try {
    const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : undefined;
    const symbolList = symbolsParam ? symbolsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const includeAll = req.query.all === 'true';
    const forceRefresh = req.query.refresh === 'true';

    const { assets, lastFetched } = await getTickerMetadata({
      symbols: symbolList,
      includeAll,
      forceRefresh,
    });

    return res.json({
      lastFetched,
      count: assets.length,
      assets,
    });
  } catch (err: any) {
    console.error('GET /api/tickers/meta error:', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Failed to load ticker metadata' });
  }
});

assetsRouter.post('/tickers/meta/refresh', requireAuth, async (_req: Request, res: Response) => {
  try {
    const { assets, lastFetched } = await forceRefreshTickerMetadata();
    return res.json({
      lastFetched,
      count: assets.length,
      assets,
    });
  } catch (err: any) {
    console.error('POST /api/tickers/meta/refresh error:', err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? 'Failed to refresh ticker metadata' });
  }
});

export default assetsRouter;
