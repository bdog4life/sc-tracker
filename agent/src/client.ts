import WebSocket from 'ws';
import { ParsedEvent, WsServerMessage, WsClientMessage } from '../../shared/types';

const RECONNECT_DELAY_MS = 5000;

export class AgentClient {
  private ws: WebSocket | null = null;
  private authenticated = false;
  private queue: ParsedEvent[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly token: string,
    private readonly onAuthOk?: (userId: number) => void
  ) {}

  connect(): void {
    if (this.ws) return;
    this.ws = new WebSocket(this.serverUrl);

    this.ws.on('open', () => {
      const msg: WsClientMessage = { type: 'auth', token: this.token };
      this.ws!.send(JSON.stringify(msg));
    });

    this.ws.on('message', (raw) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'auth_ok') {
        this.authenticated = true;
        this.onAuthOk?.(msg.userId);
        this.flushQueue();
      } else if (msg.type === 'auth_error') {
        console.error('[client] Auth failed:', msg.message);
        this.ws?.close();
      }
    });

    this.ws.on('close', () => {
      this.ws = null;
      this.authenticated = false;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[client] WebSocket error:', err.message);
    });
  }

  send(event: ParsedEvent): void {
    if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage = { type: 'event', payload: event };
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(event);
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      this.send(event);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
