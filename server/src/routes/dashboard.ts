// server/src/routes/dashboard.ts
import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/client';
import { requireAuth } from '../middleware/session';
import { formatDuration, formatRelativeTime, avatarUrl, eventDescription, eventCategory } from '../utils/format';

export const dashboardRouter = Router();

function theme(req: Request): 'dark-purple' | 'dark-amber' {
  return req.session.theme ?? 'dark-purple';
}

// Fix 2: asyncRoute wrapper for unhandled async errors in Express 4
function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
}

// ── GET /tracker ─────────────────────────────────────────────────────────────

dashboardRouter.get('/', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.session.userId!;

  const [aggRow, lastSession, recentEvents, rankRow] = await Promise.all([
    // Aggregate stats
    pool.query<{
      total_playtime_secs: string;
      session_count: string;
      mission_count: string;
      ships_lost: string;
      zones_visited: string;
    }>(`
      SELECT
        (SELECT COALESCE(SUM(duration_secs), 0) FROM sc_tracker.sessions WHERE user_id = $1) AS total_playtime_secs,
        (SELECT COUNT(*) FROM sc_tracker.sessions WHERE user_id = $1) AS session_count,
        (SELECT COUNT(*) FROM sc_tracker.events WHERE user_id = $1 AND event_type = 'MISSION_START') AS mission_count,
        (SELECT COUNT(*) FROM sc_tracker.events WHERE user_id = $1 AND event_type = 'SHIP_CLAIM') AS ships_lost,
        (SELECT COUNT(*) FROM sc_tracker.events WHERE user_id = $1 AND event_type = 'ZONE_ENTERED') AS zones_visited
    `, [userId]),

    // Last session with per-session event counts
    pool.query<{
      id: number; character_name: string; game_version: string | null;
      game_branch: string | null; started_at: Date; duration_secs: number | null;
      zone_count: string; mission_count: string; ships_lost: string; blueprint_count: string;
    }>(`
      SELECT
        s.id, s.character_name, s.game_version, s.game_branch, s.started_at, s.duration_secs,
        COUNT(e.id) FILTER (WHERE e.event_type = 'ZONE_ENTERED') AS zone_count,
        COUNT(e.id) FILTER (WHERE e.event_type = 'MISSION_START') AS mission_count,
        COUNT(e.id) FILTER (WHERE e.event_type = 'SHIP_CLAIM') AS ships_lost,
        COUNT(e.id) FILTER (WHERE e.event_type = 'BLUEPRINT_RECEIVED') AS blueprint_count
      FROM sc_tracker.sessions s
      LEFT JOIN sc_tracker.events e ON e.session_id = s.id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 6
    `, [userId]),

    // Last 10 events across all sessions
    pool.query<{ event_type: string; payload: Record<string, unknown>; occurred_at: Date }>(`
      SELECT event_type, payload, occurred_at
      FROM sc_tracker.events
      WHERE user_id = $1
      ORDER BY occurred_at DESC
      LIMIT 10
    `, [userId]),

    // Leaderboard rank by missions
    pool.query<{ rank: string }>(`
      WITH ranks AS (
        SELECT user_id, RANK() OVER (ORDER BY COUNT(*) DESC) AS rank
        FROM sc_tracker.events
        WHERE event_type = 'MISSION_START'
        GROUP BY user_id
      )
      SELECT rank FROM ranks WHERE user_id = $1
    `, [userId]),
  ]);

  const stats = aggRow.rows[0];
  const sessions = lastSession.rows;
  const heroSession = sessions[0] ?? null;
  const recentSessions = sessions.slice(1);

  res.render('overview', {
    title: 'Overview',
    theme: theme(req),
    user: { username: req.session.username!, avatar: avatarUrl(req.session.discordId!, req.session.avatar ?? null) },
    stats: {
      totalPlaytime: formatDuration(parseInt(stats?.total_playtime_secs ?? '0')),
      sessionCount: parseInt(stats?.session_count ?? '0'),
      missionCount: parseInt(stats?.mission_count ?? '0'),
      shipsLost: parseInt(stats?.ships_lost ?? '0'),
      zonesVisited: parseInt(stats?.zones_visited ?? '0'),
      rank: rankRow.rows[0] ? parseInt(rankRow.rows[0].rank) : null,
    },
    heroSession: heroSession ? {
      ...heroSession,
      durationFormatted: formatDuration(heroSession.duration_secs ?? 0),
      startedAtFormatted: new Date(heroSession.started_at).toLocaleString(),
    } : null,
    recentSessions: recentSessions.map(s => ({
      ...s,
      durationFormatted: formatDuration(s.duration_secs ?? 0),
      startedAtFormatted: new Date(s.started_at).toLocaleDateString(),
    })),
    recentEvents: recentEvents.rows.map(e => ({
      ...e,
      description: eventDescription(e.event_type, e.payload),
      relativeTime: formatRelativeTime(new Date(e.occurred_at)),
    })),
  });
}));

// ── GET /tracker/sessions ─────────────────────────────────────────────────────

dashboardRouter.get('/sessions', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.session.userId!;
  const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10));
  const perPage = 25;
  const offset = (page - 1) * perPage;

  const [totalRow, rows] = await Promise.all([
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM sc_tracker.sessions WHERE user_id = $1`, [userId]),
    pool.query<{
      id: number; started_at: Date; duration_secs: number | null;
      game_version: string | null; game_branch: string | null;
      zone_count: string; mission_count: string; ships_lost: string;
    }>(`
      SELECT
        s.id, s.started_at, s.duration_secs, s.game_version, s.game_branch,
        COUNT(e.id) FILTER (WHERE e.event_type = 'ZONE_ENTERED') AS zone_count,
        COUNT(e.id) FILTER (WHERE e.event_type = 'MISSION_START') AS mission_count,
        COUNT(e.id) FILTER (WHERE e.event_type = 'SHIP_CLAIM') AS ships_lost
      FROM sc_tracker.sessions s
      LEFT JOIN sc_tracker.events e ON e.session_id = s.id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, perPage, offset]),
  ]);

  const total = parseInt(totalRow.rows[0]?.total ?? '0');
  const totalPages = Math.ceil(total / perPage);

  res.render('sessions', {
    title: 'Sessions',
    theme: theme(req),
    user: { username: req.session.username!, avatar: avatarUrl(req.session.discordId!, req.session.avatar ?? null) },
    sessions: rows.rows.map(s => ({
      ...s,
      durationFormatted: formatDuration(s.duration_secs ?? 0),
      startedAtFormatted: new Date(s.started_at).toLocaleString(),
    })),
    page,
    totalPages,
    total,
  });
}));

// ── GET /tracker/sessions/:id ─────────────────────────────────────────────────

dashboardRouter.get('/sessions/:id', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.session.userId!;
  const sessionId = parseInt(req.params['id'], 10);
  if (isNaN(sessionId)) { res.status(404).send('Not found'); return; }

  // Fix 1: sequential queries — check ownership before fetching events (IDOR prevention)
  const sessionRow = await pool.query<{
    id: number; character_name: string; game_version: string | null;
    game_branch: string | null; started_at: Date; duration_secs: number | null;
  }>(`
    SELECT id, character_name, game_version, game_branch, started_at, duration_secs
    FROM sc_tracker.sessions
    WHERE id = $1 AND user_id = $2
  `, [sessionId, userId]);

  if (!sessionRow.rows[0]) { res.status(404).send('Session not found'); return; }
  const s = sessionRow.rows[0];

  const eventsRow = await pool.query<{ event_type: string; payload: Record<string, unknown>; occurred_at: Date }>(`
    SELECT event_type, payload, occurred_at
    FROM sc_tracker.events
    WHERE session_id = $1
    ORDER BY occurred_at ASC
  `, [sessionId]);

  res.render('session-detail', {
    title: 'Session Detail',
    theme: theme(req),
    user: { username: req.session.username!, avatar: avatarUrl(req.session.discordId!, req.session.avatar ?? null) },
    session: {
      ...s,
      durationFormatted: formatDuration(s.duration_secs ?? 0),
      startedAtFormatted: new Date(s.started_at).toLocaleString(),
    },
    events: eventsRow.rows.map(e => ({
      ...e,
      description: eventDescription(e.event_type, e.payload),
      category: eventCategory(e.event_type),
      timeFormatted: new Date(e.occurred_at).toLocaleTimeString(),
      relativeTime: formatRelativeTime(new Date(e.occurred_at)),
    })),
  });
}));

// ── GET /tracker/leaderboard ──────────────────────────────────────────────────

type LeaderboardBy = 'missions' | 'playtime' | 'sessions' | 'ships' | 'zones';

async function leaderboardQuery(by: LeaderboardBy): Promise<Array<{
  discord_id: string; discord_username: string; discord_avatar: string | null; metric: number;
}>> {
  let sql: string;
  switch (by) {
    case 'missions':
      sql = `
        SELECT u.discord_id, u.discord_username, u.discord_avatar,
               COUNT(e.id) AS metric
        FROM sc_tracker.users u
        LEFT JOIN sc_tracker.events e ON e.user_id = u.id AND e.event_type = 'MISSION_START'
        GROUP BY u.id ORDER BY metric DESC LIMIT 100`;
      break;
    case 'playtime':
      sql = `
        SELECT u.discord_id, u.discord_username, u.discord_avatar,
               COALESCE(SUM(s.duration_secs), 0) AS metric
        FROM sc_tracker.users u
        LEFT JOIN sc_tracker.sessions s ON s.user_id = u.id
        GROUP BY u.id ORDER BY metric DESC LIMIT 100`;
      break;
    case 'sessions':
      sql = `
        SELECT u.discord_id, u.discord_username, u.discord_avatar,
               COUNT(s.id) AS metric
        FROM sc_tracker.users u
        LEFT JOIN sc_tracker.sessions s ON s.user_id = u.id
        GROUP BY u.id ORDER BY metric DESC LIMIT 100`;
      break;
    case 'ships':
      sql = `
        SELECT u.discord_id, u.discord_username, u.discord_avatar,
               COUNT(e.id) AS metric
        FROM sc_tracker.users u
        LEFT JOIN sc_tracker.events e ON e.user_id = u.id AND e.event_type = 'SHIP_CLAIM'
        GROUP BY u.id ORDER BY metric DESC LIMIT 100`;
      break;
    case 'zones':
      sql = `
        SELECT u.discord_id, u.discord_username, u.discord_avatar,
               COUNT(e.id) AS metric
        FROM sc_tracker.users u
        LEFT JOIN sc_tracker.events e ON e.user_id = u.id AND e.event_type = 'ZONE_ENTERED'
        GROUP BY u.id ORDER BY metric DESC LIMIT 100`;
      break;
  }
  const result = await pool.query<{
    discord_id: string; discord_username: string; discord_avatar: string | null; metric: number;
  }>(sql);
  return result.rows;
}

dashboardRouter.get('/leaderboard', requireAuth, asyncRoute(async (req, res) => {
  const validBy: LeaderboardBy[] = ['missions', 'playtime', 'sessions', 'ships', 'zones'];
  const by: LeaderboardBy = validBy.includes(req.query['by'] as LeaderboardBy)
    ? (req.query['by'] as LeaderboardBy)
    : 'missions';

  const rows = await leaderboardQuery(by);
  const myDiscordId = req.session.discordId!;

  res.render('leaderboard', {
    title: 'Leaderboard',
    theme: theme(req),
    user: { username: req.session.username!, avatar: avatarUrl(myDiscordId, req.session.avatar ?? null) },
    by,
    rows: rows.map((r, i) => ({
      rank: i + 1,
      discordId: r.discord_id,
      username: r.discord_username,
      avatar: avatarUrl(r.discord_id, r.discord_avatar),
      metric: by === 'playtime' ? formatDuration(r.metric) : r.metric.toString(),
      isMe: r.discord_id === myDiscordId,
    })),
  });
}));

// ── GET /tracker/players/:discordId ───────────────────────────────────────────

dashboardRouter.get('/players/:discordId', requireAuth, asyncRoute(async (req, res) => {
  const targetId = req.params['discordId'];

  // Fix 3: all 3 queries run in parallel
  const [profileRow, recentSessionsRow, rankRow] = await Promise.all([
    pool.query<{
      discord_id: string; discord_username: string; discord_avatar: string | null;
      member_since: Date; missions: string; total_playtime_secs: string;
      sessions: string; ships_lost: string;
    }>(`
      SELECT
        u.discord_id, u.discord_username, u.discord_avatar, u.created_at AS member_since,
        (SELECT COUNT(*) FROM sc_tracker.events WHERE user_id = u.id AND event_type = 'MISSION_START') AS missions,
        (SELECT COALESCE(SUM(duration_secs), 0) FROM sc_tracker.sessions WHERE user_id = u.id) AS total_playtime_secs,
        (SELECT COUNT(*) FROM sc_tracker.sessions WHERE user_id = u.id) AS sessions,
        (SELECT COUNT(*) FROM sc_tracker.events WHERE user_id = u.id AND event_type = 'SHIP_CLAIM') AS ships_lost
      FROM sc_tracker.users u
      WHERE u.discord_id = $1
    `, [targetId]),

    pool.query<{
      id: number; started_at: Date; duration_secs: number | null; mission_count: string;
    }>(`
      SELECT
        s.id, s.started_at, s.duration_secs,
        COUNT(e.id) FILTER (WHERE e.event_type = 'MISSION_START') AS mission_count
      FROM sc_tracker.sessions s
      LEFT JOIN sc_tracker.events e ON e.session_id = s.id
      WHERE s.user_id = (SELECT id FROM sc_tracker.users WHERE discord_id = $1)
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 10
    `, [targetId]),

    pool.query<{ rank: string }>(`
      WITH ranks AS (
        SELECT user_id, RANK() OVER (ORDER BY COUNT(*) DESC) AS rank
        FROM sc_tracker.events WHERE event_type = 'MISSION_START' GROUP BY user_id
      )
      SELECT rank FROM ranks
      WHERE user_id = (SELECT id FROM sc_tracker.users WHERE discord_id = $1)
    `, [targetId]),
  ]);

  if (!profileRow.rows[0]) { res.status(404).send('Player not found'); return; }
  const p = profileRow.rows[0];

  res.render('profile', {
    title: `${p.discord_username}'s Profile`,
    theme: theme(req),
    user: { username: req.session.username!, avatar: avatarUrl(req.session.discordId!, req.session.avatar ?? null) },
    profile: {
      discordId: p.discord_id,
      username: p.discord_username,
      avatar: avatarUrl(p.discord_id, p.discord_avatar),
      memberSince: new Date(p.member_since).toLocaleDateString(),
      rank: rankRow.rows[0] ? parseInt(rankRow.rows[0].rank) : null,
      missions: parseInt(p.missions),
      totalPlaytime: formatDuration(parseInt(p.total_playtime_secs)),
      sessions: parseInt(p.sessions),
      shipsLost: parseInt(p.ships_lost),
    },
    recentSessions: recentSessionsRow.rows.map(s => ({
      ...s,
      durationFormatted: formatDuration(s.duration_secs ?? 0),
      startedAtFormatted: new Date(s.started_at).toLocaleDateString(),
      missionCount: parseInt(s.mission_count),
    })),
  });
}));

// ── POST /tracker/theme ───────────────────────────────────────────────────────

dashboardRouter.post('/theme', requireAuth, (req: Request, res: Response) => {
  const t = req.body['theme'];
  const redirect = req.body['redirect'] as string | undefined;
  if (t === 'dark-purple' || t === 'dark-amber') {
    req.session.theme = t;
  }
  // Validate redirect to prevent open redirect
  const target = redirect?.startsWith('/tracker') ? redirect : '/tracker';
  res.redirect(target);
});
