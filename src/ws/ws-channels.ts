// WebSocket channel definitions for algo-trade real-time streaming
// Defines available channels, message shapes, and validation utilities

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
