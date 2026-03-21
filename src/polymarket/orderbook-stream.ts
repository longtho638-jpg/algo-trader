// WebSocket streaming client for Polymarket CLOB orderbook
// Uses `ws` npm package (Node.js compatible, not browser WebSocket)
// Message parsing delegated to orderbook-message-handler
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../core/logger.js';
import { sleep } from '../core/utils.js';
import {
  applySnapshot,
  applyDelta,
  calcSpread,
  parseMessage,
} from './orderbook-message-handler.js';
import type { OrderBookState, WsSnapshot, WsDelta } from './orderbook-message-handler.js';

export type { OrderBookState } from './orderbook-message-handler.js';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const MAX_RECONNECT_DELAY_MS  = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;
const HEARTBEAT_INTERVAL_MS   = 20_000;

export interface OrderBookUpdate {
  tokenId: string;
  state: OrderBookState;
  spreadChanged: boolean;
  prevSpread: number;
  newSpread: number;
}

// ── OrderBookStream ──────────────────────────────────────────────────────────

export class OrderBookStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private books         = new Map<string, OrderBookState>();
  private reconnectAttempt = 0;
  private stopped          = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  subscribe(tokenId: string): void {
    this.subscriptions.add(tokenId);
    if (this.ws?.readyState === WebSocket.OPEN) this.sendSubscribe([tokenId]);
  }

  unsubscribe(tokenId: string): void {
    this.subscriptions.delete(tokenId);
    this.books.delete(tokenId);
  }

  getBook(tokenId: string): OrderBookState | undefined {
    return this.books.get(tokenId);
  }

  connect(): void {
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  disconnect(): void {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.ws) { this.ws.removeAllListeners(); this.ws.terminate(); this.ws = null; }
  }

  // ── Socket lifecycle ──────────────────────────────────────────────────────

  private openSocket(): void {
    try {
      this.ws = new WebSocket(WS_URL, { handshakeTimeout: 10_000 });
      this.ws.on('open',    ()  => this.onOpen());
      this.ws.on('message', (d) => this.onMessage(d.toString()));
      this.ws.on('error',   (e) => logger.warn('WS error', 'OrderBookStream', { error: e.message }));
      this.ws.on('close',   ()  => this.onClose());
      this.ws.on('pong',    ()  => logger.debug('Pong received', 'OrderBookStream'));
    } catch (err) {
      logger.error('Failed to open WebSocket', 'OrderBookStream', { err: String(err) });
      this.scheduleReconnect();
    }
  }

  private onOpen(): void {
    logger.info('WebSocket connected', 'OrderBookStream');
    this.reconnectAttempt = 0;
    if (this.subscriptions.size > 0) this.sendSubscribe(Array.from(this.subscriptions));
    this.startHeartbeat();
    this.emit('connected');
  }

  private onClose(): void {
    logger.warn('WebSocket disconnected', 'OrderBookStream');
    this.stopHeartbeat();
    this.emit('disconnected');
    if (!this.stopped) this.scheduleReconnect();
  }

  private onMessage(raw: string): void {
    const msg = parseMessage(raw);
    if (!msg) return;
    if (msg.event_type === 'book') {
      const snap = msg as WsSnapshot;
      const prev = this.books.get(snap.asset_id);
      const prevSpread = prev ? calcSpread(prev) : 0;
      const state = applySnapshot(snap, prev);
      this.books.set(snap.asset_id, state);
      this.emitUpdate(snap.asset_id, state, prevSpread, calcSpread(state));
    } else if (msg.event_type === 'price_change') {
      const delta = msg as WsDelta;
      const book  = this.books.get(delta.asset_id);
      if (!book) return;
      const prevSpread = calcSpread(book);
      applyDelta(delta, book);
      this.emitUpdate(delta.asset_id, book, prevSpread, calcSpread(book));
    }
  }

  private sendSubscribe(tokenIds: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'subscribe', channel: 'market', assets_ids: tokenIds }));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private emitUpdate(tokenId: string, state: OrderBookState, prevSpread: number, newSpread: number): void {
    const spreadChanged = Math.abs(newSpread - prevSpread) / (prevSpread || 1) > 0.01;
    const update: OrderBookUpdate = { tokenId, state, spreadChanged, prevSpread, newSpread };
    this.emit('update', update);
    if (spreadChanged) this.emit('spread_change', update);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempt), MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt++;
    logger.info('Reconnecting WebSocket', 'OrderBookStream', { attempt: this.reconnectAttempt, delayMs: delay });
    sleep(delay).then(() => { if (!this.stopped) this.openSocket(); });
  }
}
