import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { migrate } from './db/migrate';
import { authRouter } from './routes/auth';
import { trackerRouter } from './routes/tracker';
import { dashboardRouter } from './routes/dashboard';
import { sessionMiddleware } from './middleware/session';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

const REQUIRED_ENV = ['SESSION_SECRET', 'JWT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

async function main(): Promise<void> {
  await migrate();

  const app = express();

  // View engine — views are at server/views/ relative to server/src/ or server/dist/
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  // Static assets — public/ is at same level as views/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Session (must come before routes that use req.session)
  app.use(sessionMiddleware);

  // Routes
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/api/tracker', trackerRouter);
  app.use('/tracker', dashboardRouter);

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/agent' });

  const { attachWebSocket } = await import('./ws/handler');
  attachWebSocket(wss);

  server.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
