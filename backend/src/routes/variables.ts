import { Router, Request, Response } from 'express';

import { requireAuth } from '../auth/jwt';
import * as variableListsDb from '../db/variableListsDb';

const variablesRouter = Router();

variablesRouter.get('/variables', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const type = req.query.type as variableListsDb.VarType | undefined;
    const is_shared = req.query.is_shared === 'true' ? true : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const lists = await variableListsDb.getVariableListsByUserId(userId, { type, is_shared, limit });
    return res.json(lists);
  } catch (err: any) {
    console.error('GET /api/variables error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch variable lists' });
  }
});

variablesRouter.get('/variables/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const varList = await variableListsDb.getVariableListById(id);
    if (!varList) {
      return res.status(404).json({ error: 'Variable list not found' });
    }

    if (varList.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this variable list' });
    }

    return res.json(varList);
  } catch (err: any) {
    console.error('GET /api/variables/:id error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch variable list' });
  }
});

variablesRouter.post('/variables', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { name, type, values, description, is_shared } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required and must be a string' });
    }

    if (!type || !['ticker', 'number', 'date'].includes(type)) {
      return res.status(400).json({ error: 'Type must be one of: ticker, number, date' });
    }

    if (!Array.isArray(values)) {
      return res.status(400).json({ error: 'Values must be an array' });
    }

    const exists = await variableListsDb.variableListNameExists(name, userId);
    if (exists) {
      return res.status(409).json({ error: 'Variable list with this name already exists' });
    }

    const created = await variableListsDb.createVariableList({
      name,
      type,
      values,
      description,
      is_shared,
      user_id: userId,
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error('POST /api/variables error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create variable list' });
  }
});

variablesRouter.put('/variables/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const existing = await variableListsDb.getVariableListById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Variable list not found' });
    }

    if (existing.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this variable list' });
    }

    const { name, type, values, description, is_shared } = req.body;

    if (type && !['ticker', 'number', 'date'].includes(type)) {
      return res.status(400).json({ error: 'Type must be one of: ticker, number, date' });
    }

    if (values !== undefined && !Array.isArray(values)) {
      return res.status(400).json({ error: 'Values must be an array' });
    }

    if (name) {
      const exists = await variableListsDb.variableListNameExists(name, userId, id);
      if (exists) {
        return res.status(409).json({ error: 'Variable list with this name already exists' });
      }
    }

    const updated = await variableListsDb.updateVariableList(id, {
      name,
      type,
      values,
      description,
      is_shared,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Variable list not found' });
    }

    return res.json(updated);
  } catch (err: any) {
    console.error('PUT /api/variables/:id error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update variable list' });
  }
});

variablesRouter.delete('/variables/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const varList = await variableListsDb.getVariableListById(id);
    if (!varList) {
      return res.status(404).json({ error: 'Variable list not found' });
    }

    if (varList.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this variable list' });
    }

    const deleted = await variableListsDb.deleteVariableList(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Variable list not found' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/variables/:id error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete variable list' });
  }
});

variablesRouter.post('/variables/bulk_import', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { lists } = req.body;

    if (!Array.isArray(lists)) {
      return res.status(400).json({ error: 'Lists must be an array' });
    }

    for (const list of lists) {
      if (!list.name || typeof list.name !== 'string') {
        return res.status(400).json({ error: 'Each list must have a name' });
      }
      if (!list.type || !['ticker', 'number', 'date'].includes(list.type)) {
        return res.status(400).json({ error: 'Each list must have a valid type' });
      }
      if (!Array.isArray(list.values)) {
        return res.status(400).json({ error: 'Each list must have values as an array' });
      }
      list.user_id = userId;
    }

    const imported = await variableListsDb.bulkImportVariableLists(lists);
    return res.json({ imported: imported.length, lists: imported });
  } catch (err: any) {
    console.error('POST /api/variables/bulk_import error:', err);
    return res.status(500).json({ error: err.message || 'Failed to import variable lists' });
  }
});

export default variablesRouter;
