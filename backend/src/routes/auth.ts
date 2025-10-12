import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { FRONTEND_URL } from '../config/constants';
import { generateToken, verifyToken } from '../auth/jwt';

const router = Router();

router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('discord', { session: false }, (err, user, info) => {
    if (err) {
      console.error('[AUTH] Discord callback error:', err);
      const redirectUrl = new URL(FRONTEND_URL);
      redirectUrl.searchParams.set('authError', 'auth_internal_error');
      return res.redirect(redirectUrl.toString());
    }

    if (!user) {
      const redirectUrl = new URL(FRONTEND_URL);
      const errorCode = typeof info?.message === 'string' ? info.message : 'auth_failed';
      redirectUrl.searchParams.set('authError', errorCode);
      if (info?.detail && typeof info.detail === 'string') {
        redirectUrl.searchParams.set('authErrorDetail', info.detail);
      }
      return res.redirect(redirectUrl.toString());
    }

    const token = generateToken(user);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(FRONTEND_URL);
  })(req, res, next);
});

router.get('/user', (req: Request, res: Response) => {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  res.json({ user });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ success: true });
});

export default router;
