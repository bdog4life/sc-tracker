import { Router, Request, Response } from 'express';
import { pool } from '../db/client';
import { verifyToken } from '../auth/tokens';

export const trackerRouter = Router();

trackerRouter.get('/sessions', async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const user = await pool.query(
    'SELECT id FROM sc_tracker.users WHERE discord_id = $1',
    [payload.discordId]
  );
  if (!user.rows[0]) return res.status(401).json({ error: 'User not found' });
  const userId = user.rows[0].id;

  const sessions = await pool.query(
    `SELECT id, character_name, game_version, game_branch, started_at, ended_at, duration_secs
     FROM sc_tracker.sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50`,
    [userId]
  );
  res.json(sessions.rows);
});

trackerRouter.get('/stats', async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const user = await pool.query(
    'SELECT id FROM sc_tracker.users WHERE discord_id = $1',
    [payload.discordId]
  );
  if (!user.rows[0]) return res.status(401).json({ error: 'User not found' });
  const userId = user.rows[0].id;

  const [eventCounts, shipClaims, sessionTotal] = await Promise.all([
    pool.query(
      `SELECT event_type, COUNT(*) as count FROM sc_tracker.events
       WHERE user_id = $1 GROUP BY event_type ORDER BY count DESC`,
      [userId]
    ),
    pool.query(
      `SELECT entitlement_urn, display_name, claims_count, last_claimed_at
       FROM sc_tracker.ships WHERE user_id = $1 ORDER BY claims_count DESC`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) as sessions, COALESCE(SUM(duration_secs), 0) as total_secs
       FROM sc_tracker.sessions WHERE user_id = $1`,
      [userId]
    ),
  ]);

  res.json({
    eventCounts: eventCounts.rows,
    ships: shipClaims.rows,
    sessions: sessionTotal.rows[0],
  });
});
