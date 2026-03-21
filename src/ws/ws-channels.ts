// WebSocket channel definitions and per-channel subscription management
// Defines available channels, message shapes, validation, and broadcast utilities
import { WebSocket } from 'ws';

/** All available streaming channels */
export type WsChannel =
  | 'trades'
  | 'orderbook'
  | 'pnl'
  | 'alerts'
  | 'strategies'
  | 'system';

/** Message envelope sent to WebSocket clients */
export interface ChannelMessage {
  channel: WsChannel;
  data: unknown;
  timestamp: number;
}

/** Human-readable description of each channel for discovery */
export const CHANNEL_DESCRIPTIONS: Record<WsChannel, string> = {
  trades: 'Real-time executed trade notifications',
  orderbook: 'Live order book depth updates',
  pnl: 'Portfolio P&L snapshots at regular intervals',
  alerts: 'Risk and threshold alert notifications',
  strategies: 'Strategy lifecycle events (start/stop/error)',
  system: 'System-level events (startup/shutdown)',
};

/** Set of all valid channel names for O(1) lookup */
const VALID_CHANNELS = new Set<string>(Object.keys(CHANNEL_DESCRIPTIONS));

/**
 * Returns true if the given string is a recognized WsChannel.
 */
export function validateChannel(name: string): name is WsChannel {
  return VALID_CHANNELS.has(name);
}

/**
 * Wraps arbitrary data in a ChannelMessage envelope with current timestamp.
 */
export function formatMessage(channel: WsChannel, data: unknown): ChannelMessage {
  return {
    channel,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Serializes a ChannelMessage to a JSON string ready to send over WebSocket.
 */
export function serializeMessage(msg: ChannelMessage): string {
  return JSON.stringify(msg);
}

// ---------------------------------------------------------------------------
// Channel subscription manager — tracks which clients subscribed to what
// ---------------------------------------------------------------------------

/**
 * Manages per-channel subscriber sets.
 * Used by ws-server to route broadcasts to only subscribed clients.
 */
export class ChannelManager {
  private readonly channels = new Map<WsChannel, Set<WebSocket>>();

  constructor() {
    // Pre-initialize all channels so getSubscribers never returns undefined
    for (const ch of Object.keys(CHANNEL_DESCRIPTIONS) as WsChannel[]) {
      this.channels.set(ch, new Set());
    }
  }

  /** Add a client to a channel's subscriber set. */
  subscribe(ws: WebSocket, channel: WsChannel): void {
    this.channels.get(channel)!.add(ws);
  }

  /** Remove a client from a channel's subscriber set. */
  unsubscribe(ws: WebSocket, channel: WsChannel): void {
    this.channels.get(channel)!.delete(ws);
  }

  /** Remove a client from ALL channels (called on disconnect). */
  unsubscribeAll(ws: WebSocket): void {
    for (const set of this.channels.values()) {
      set.delete(ws);
    }
  }

  /** Returns the set of WebSocket clients subscribed to the given channel. */
  getSubscribers(channel: WsChannel): Set<WebSocket> {
    return this.channels.get(channel) ?? new Set();
  }

  /**
   * Serialize and send data to all open clients subscribed to the channel.
   * Skips clients whose socket is not in OPEN state.
   */
  broadcastToChannel(channel: WsChannel, data: unknown): void {
    const payload = serializeMessage(formatMessage(channel, data));
    for (const ws of this.getSubscribers(channel)) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
