/**
 * WebSocket client for real-time signal streaming from the algo-trade server.
 * Supports auto-reconnect with exponential backoff.
 */
import type { SignalEvent, WebSocketMessage } from './sdk-types.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_MAX_RETRIES = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

type SignalCallback = (signal: SignalEvent) => void;
type DisconnectCallback = () => void;

// ─── Class ────────────────────────────────────────────────────────────────────

/**
 * Thin WebSocket wrapper that subscribes to the algo-trade signal stream.
 * Usage:
 *   const ws = new AlgoTradeWsClient();
 *   ws.onSignal(sig => console.log(sig));
 *   ws.connect('ws://localhost:3000/ws/signals');
 */
export class AlgoTradeWsClient {
  private url: string | null = null;
  private ws: WebSocket | null = null;
  private retries = 0;
  private closed = false;
  private signalCb: SignalCallback | null = null;
  private disconnectCb: DisconnectCallback | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Register callback invoked when a SignalEvent arrives */
  onSignal(callback: SignalCallback): void {
    this.signalCb = callback;
  }

  /** Register callback invoked when the connection closes unexpectedly */
  onDisconnect(callback: DisconnectCallback): void {
    this.disconnectCb = callback;
  }

  /** Open a WebSocket connection to `url` and start listening for messages */
  connect(url: string): void {
    this.url = url;
    this.closed = false;
    this.retries = 0;
    this.openSocket();
  }

  /** Permanently close the connection and cancel any pending reconnects */
  close(): void {
    this.closed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private openSocket(): void {
    if (!this.url || this.closed) return;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data as string);
    };

    ws.onclose = () => {
      if (!this.closed) {
        this.disconnectCb?.();
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onerror always followed by onclose — let onclose handle reconnect
      ws.close();
    };
  }

  private handleMessage(raw: string): void {
    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(raw) as WebSocketMessage;
    } catch {
      return; // Ignore malformed frames
    }

    if (msg.type === 'signal' && this.signalCb) {
      this.signalCb(msg.payload as SignalEvent);
    }
    // 'ping' and 'status' frames are silently consumed; 'error' is logged nowhere
    // to keep the client side-effect free — callers use onDisconnect instead.
  }

  private scheduleReconnect(): void {
    if (this.retries >= DEFAULT_MAX_RETRIES || this.closed) return;

    const delay = Math.min(
      DEFAULT_RECONNECT_BASE_MS * 2 ** this.retries,
      DEFAULT_RECONNECT_MAX_MS,
    );
    this.retries += 1;

    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
