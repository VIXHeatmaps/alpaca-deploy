import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const router = Router();

const feedbackStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, '../feedback_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const feedbackUpload = multer({
  storage: feedbackStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  },
});

router.post('/feedback', feedbackUpload.single('screenshot'), async (req: Request, res: Response) => {
  try {
    const { type, title, description } = req.body;
    const screenshot = req.file;

    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }

    const { createFeedback } = await import('../db/feedbackDb');

    const feedback = await createFeedback({
      id: randomUUID(),
      type,
      title,
      description: description || '',
      screenshot: screenshot ? screenshot.filename : null,
      user_id: (req as any).user?.id || null,
    });

    console.log(`[FEEDBACK] ${type.toUpperCase()} submitted: ${title}`);

    return res.json({ success: true, id: feedback.id });
  } catch (err: any) {
    console.error('POST /api/feedback error:', err);
    return res.status(500).json({ error: err.message || 'Failed to submit feedback' });
  }
});

router.get('/feedback', async (_req: Request, res: Response) => {
  try {
    const { getAllFeedback } = await import('../db/feedbackDb');
    const feedback = await getAllFeedback();

    return res.json({ feedback });
  } catch (err: any) {
    console.error('GET /api/feedback error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch feedback' });
  }
});

router.get('/feedback/:id/screenshot', async (req: Request, res: Response) => {
  try {
    const feedbackId = req.params.id;
    const { getFeedbackById } = await import('../db/feedbackDb');

    const feedback = await getFeedbackById(feedbackId);

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    if (!feedback.screenshot) {
      return res.status(404).json({ error: 'No screenshot attached' });
    }

    const screenshotPath = path.join(__dirname, '../feedback_uploads', feedback.screenshot);

    if (!fs.existsSync(screenshotPath)) {
      return res.status(404).json({ error: 'Screenshot file not found' });
    }

    return res.sendFile(screenshotPath);
  } catch (err: any) {
    console.error('GET /api/feedback/:id/screenshot error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch screenshot' });
  }
});

export default router;
