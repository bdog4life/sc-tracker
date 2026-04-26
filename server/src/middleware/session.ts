import session from 'express-session';
import pgSimple from 'connect-pg-simple';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/client';

declare module 'express-session' {
  interface SessionData {
    userId: number;
    discordId: string;
    username: string;
    avatar: string | null;
    theme: 'dark-purple' | 'dark-amber';
  }
}

const PgSession = pgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    createTableIfMissing: true,
  }),
  secret: process.env['SESSION_SECRET']!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.redirect('/auth/discord?dashboard=1');
    return;
  }
  next();
}
