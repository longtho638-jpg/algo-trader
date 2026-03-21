// Parse and apply raw WebSocket messages to local orderbook state
// Used by OrderBookStream — decoupled for testability
import type { OrderBookLevel } from './clob-client.js';

export interface OrderBookState {
  tokenId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  updatedAt: number;
}

export interface WsSnapshot {
  event_type: 'book';
  asset_id: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface WsDelta {
  event_type: 'price_change';
  asset_id: string;
  changes: Array<{ side: 'BUY' | 'SELL'; price: string; size: string }>;
}

export type WsMessage = WsSnapshot | WsDelta | { event_type: 'pong' | 'heartbeat' };

export function applySnapshot(snap: WsSnapshot, prev: OrderBookState | undefined): OrderBookState {
  return {
    tokenId: snap.asset_id,
    bids: [...snap.bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)),
    asks: [...snap.asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price)),
    updatedAt: Date.now(),
  };
}

export function applyDelta(delta: WsDelta, book: OrderBookState): void {
  for (const change of delta.changes) {
    const side = change.side === 'BUY' ? book.bids : book.asks;
    const idx  = side.findIndex(l => l.price === change.price);
    if (parseFloat(change.size) === 0) {
      if (idx !== -1) side.splice(idx, 1);
    } else if (idx !== -1) {
      side[idx]!.size = change.size;
    } else {
      side.push({ price: change.price, size: change.size });
    }
  }
  book.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  book.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  book.updatedAt = Date.now();
}

export function calcSpread(book: OrderBookState): number {
  const bestBid = book.bids[0] ? parseFloat(book.bids[0].price) : 0;
  const bestAsk = book.asks[0] ? parseFloat(book.asks[0].price) : 0;
  return bestBid > 0 && bestAsk > 0 ? bestAsk - bestBid : 0;
}

export function parseMessage(raw: string): WsMessage | null {
  try {
    return JSON.parse(raw) as WsMessage;
  } catch {
    return null;
  }
}
