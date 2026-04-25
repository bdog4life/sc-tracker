import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { migrate } from './db/migrate';
import { authRouter } from './routes/auth';
import { trackerRouter } from './routes/tracker';
import { attachWebSocket } from './ws/handler';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

async function main(): Promise<void> {
  await migrate();

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/api/tracker', trackerRouter);

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/agent' });
  attachWebSocket(wss);

  server.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
