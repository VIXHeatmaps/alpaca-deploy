import { Router, Request, Response } from 'express';

import { requireAuth } from '../auth/jwt';
import * as strategiesDb from '../db/strategiesDb';

const strategiesRouter = Router();

strategiesRouter.get('/strategies', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const strategies = await strategiesDb.getStrategiesByUserId(userId);
    return res.json(strategies);
  } catch (err: any) {
    console.error('GET /api/strategies error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch strategies' });
  }
});

strategiesRouter.get('/strategies/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const strategy = await strategiesDb.getStrategyById(id);
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    return res.json(strategy);
  } catch (err: any) {
    console.error('GET /api/strategies/:id error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch strategy' });
  }
});

strategiesRouter.post('/strategies', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { name, versioningEnabled, version, elements, createdAt } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required and must be a string' });
    }

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ error: 'Elements is required and must be an array' });
    }

    if (!version || typeof version !== 'object') {
      return res.status(400).json({ error: 'Version is required and must be an object' });
    }

    const { major, minor, patch, fork } = version;
    if (typeof major !== 'number' || typeof minor !== 'number' || typeof patch !== 'number') {
      return res.status(400).json({ error: 'Version must have major, minor, and patch as numbers' });
    }

    const saved = await strategiesDb.saveStrategy({
      name,
      versioning_enabled: versioningEnabled || false,
      version_major: major,
      version_minor: minor,
      version_patch: patch,
      version_fork: fork || '',
      elements,
      created_at: createdAt,
      user_id: userId,
    });

    return res.status(200).json(saved);
  } catch (err: any) {
    console.error('POST /api/strategies error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save strategy' });
  }
});

strategiesRouter.delete('/strategies/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const strategy = await strategiesDb.getStrategyById(id);
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    if (strategy.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this strategy' });
    }

    const deleted = await strategiesDb.deleteStrategy(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/strategies/:id error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete strategy' });
  }
});

export default strategiesRouter;
