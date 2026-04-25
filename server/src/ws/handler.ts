import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { pool } from '../db/client';
import { verifyToken } from '../auth/tokens';
import { WsClientMessage, WsServerMessage, ParsedEvent } from '../../../shared/types';

interface AuthedSocket {
  ws: WebSocket;
  userId: number;
  sessionId: number | null;
}

const connections = new Map<WebSocket, AuthedSocket>();

export function attachWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let authed: AuthedSocket | null = null;
    let processing = Promise.resolve();

    ws.on('message', (raw) => {
      processing = processing.then(async () => {
        let msg: WsClientMessage;
        try {
          msg = JSON.parse(raw.toString()) as WsClientMessage;
        } catch {
          ws.close(1008, 'Invalid JSON');
          return;
        }

        if (msg.type === 'auth') {
          const payload = verifyToken(msg.token);
          if (!payload) {
            const resp: WsServerMessage = { type: 'auth_error', message: 'Invalid token' };
            ws.send(JSON.stringify(resp));
            ws.close();
            return;
          }
          const result = await pool.query(
            'SELECT id FROM sc_tracker.users WHERE discord_id = $1',
            [payload.discordId]
          );
          if (!result.rows[0]) {
            const resp: WsServerMessage = { type: 'auth_error', message: 'User not found' };
            ws.send(JSON.stringify(resp));
            ws.close();
            return;
          }
          authed = { ws, userId: result.rows[0].id, sessionId: null };
          connections.set(ws, authed);
          const ok: WsServerMessage = { type: 'auth_ok', userId: authed.userId };
          ws.send(JSON.stringify(ok));
          return;
        }

        if (msg.type === 'event') {
          if (!authed) {
            ws.close(1008, 'Not authenticated');
            return;
          }
          const eventId = await storeEvent(authed, msg.payload);
          const ack: WsServerMessage = { type: 'ack', eventId };
          ws.send(JSON.stringify(ack));
        }
      });
    });

    ws.on('close', () => {
      if (authed) connections.delete(ws);
    });
  });
}

async function storeEvent(conn: AuthedSocket, event: ParsedEvent): Promise<number> {
  if (event.type === 'SESSION_START') {
    const p = event.payload as { characterName: string; gameVersion: string; gameBranch: string };
    const result = await pool.query(
      `INSERT INTO sc_tracker.sessions (user_id, character_name, game_version, game_branch, started_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [conn.userId, p.characterName, p.gameVersion, p.gameBranch, event.occurredAt]
    );
    conn.sessionId = result.rows[0].id;
  }

  if (event.type === 'SESSION_END' && conn.sessionId) {
    await pool.query(
      `UPDATE sc_tracker.sessions
       SET ended_at = $1,
           duration_secs = EXTRACT(EPOCH FROM ($1 - started_at))::INTEGER
       WHERE id = $2`,
      [event.occurredAt, conn.sessionId]
    );
  }

  const result = await pool.query(
    `INSERT INTO sc_tracker.events (session_id, user_id, event_type, occurred_at, payload, parser_version)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [conn.sessionId, conn.userId, event.type, event.occurredAt, JSON.stringify(event.payload), event.parserVersion]
  );

  if (event.type === 'SHIP_CLAIM') {
    const p = event.payload as { entitlementUrn: string };
    await pool.query(
      `INSERT INTO sc_tracker.ships (user_id, entitlement_urn, claims_count, last_claimed_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, entitlement_urn) DO UPDATE
         SET claims_count    = sc_tracker.ships.claims_count + 1,
             last_claimed_at = EXCLUDED.last_claimed_at`,
      [conn.userId, p.entitlementUrn, event.occurredAt]
    );
  }

  return result.rows[0].id;
}
