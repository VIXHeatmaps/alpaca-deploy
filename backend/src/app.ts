import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import passport from 'passport';

import { FRONTEND_URL } from './config/constants';
import authRouter from './routes/auth';
import feedbackRouter from './routes/feedback';
import systemRouter from './routes/system';
import { configureDiscordStrategy } from './auth/discord';
import { ensureJwtSecret } from './auth/jwt';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: FRONTEND_URL,
      credentials: true,
    })
  );
  app.use(bodyParser.json());
  app.use(cookieParser());

  ensureJwtSecret();
  configureDiscordStrategy(passport);
  app.use(passport.initialize());

  app.use('/auth', authRouter);
  app.use('/api', feedbackRouter);
  app.use(systemRouter);

  return app;
};
