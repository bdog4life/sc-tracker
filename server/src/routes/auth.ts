import { Router, Request, Response } from 'express';
import https from 'https';
import { pool } from '../db/client';
import { generateToken, verifyToken } from '../auth/tokens';

export const authRouter = Router();

const DISCORD_API = 'https://discord.com/api/v10';
const CLIENT_ID = process.env['DISCORD_CLIENT_ID']!;
const CLIENT_SECRET = process.env['DISCORD_CLIENT_SECRET']!;
const REDIRECT_URI = process.env['DISCORD_REDIRECT_URI']!;

/** Minimal HTTPS POST/GET helper to avoid ESM/CJS issues with node-fetch v3. */
function httpsRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
    };
    const req = https.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch {
          reject(new Error('Failed to parse response JSON'));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Step 1 — redirect to Discord OAuth
authRouter.get('/discord', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

// Step 2 — Discord redirects here with code
authRouter.get('/discord/callback', async (req: Request, res: Response) => {
  const code = req.query['code'] as string | undefined;
  if (!code) return res.status(400).send('Missing code');

  // Exchange code for access token
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  }).toString();

  const tokenData = await httpsRequest(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }) as { access_token?: string };

  if (!tokenData.access_token) return res.status(400).send('OAuth failed');

  // Fetch Discord user
  const user = await httpsRequest(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  }) as { id: string; username: string; avatar?: string };

  // Upsert user in DB
  const agentToken = generateToken(user.id);
  await pool.query(
    `INSERT INTO sc_tracker.users (discord_id, discord_username, discord_avatar, token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE
       SET discord_username = EXCLUDED.discord_username,
           discord_avatar   = EXCLUDED.discord_avatar,
           token            = EXCLUDED.token,
           updated_at       = NOW()`,
    [user.id, user.username, user.avatar ?? null, agentToken]
  );

  // Show setup code to user
  res.send(`
    <html><body style="font-family:monospace;padding:2rem">
      <h2>SC Tracker Connected!</h2>
      <p>Welcome, <b>${user.username}</b>. Your agent token:</p>
      <pre style="background:#eee;padding:1rem;font-size:1.2rem">${agentToken}</pre>
      <p>Paste this into your agent when prompted, or the agent will pick it up automatically if you started auth from the app.</p>
    </body></html>
  `);
});

// Agent calls this to verify its token
authRouter.get('/verify', async (req: Request, res: Response) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  const result = await pool.query(
    'SELECT id, discord_username FROM sc_tracker.users WHERE discord_id = $1',
    [payload.discordId]
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'User not found' });
  res.json({ userId: result.rows[0].id, username: result.rows[0].discord_username });
});
