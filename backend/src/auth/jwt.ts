import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = '7d';

export type AuthenticatedRequest = Request & { user?: any };

let cachedSecret: string | null = null;

const resolveJwtSecret = () => {
  if (cachedSecret) return cachedSecret;
  const secret = (process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT secret is required. Set JWT_SECRET (preferred) or SESSION_SECRET in the environment.');
  }
  cachedSecret = secret;
  return secret;
};

export const ensureJwtSecret = () => resolveJwtSecret();

export const generateToken = (user: any): string => {
  const secret = resolveJwtSecret();
  return jwt.sign(user, secret, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): any | null => {
  try {
    const secret = resolveJwtSecret();
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  (req as AuthenticatedRequest).user = user;
  return next();
};
