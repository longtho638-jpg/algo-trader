// WebSocket server for algo-trade real-time streaming
// Manages client connections, channel subscriptions, heartbeat, and message dispatch
import { WebSocketServer, WebSocket } from 'ws';
import { validateChannel, serializeMessage, formatMessage, ChannelManager } from './ws-channels.js';
import type { WsChannel } from './ws-channels.js';

/** Internal state per connected client */
interface WsClient {
  socket: WebSocket;
  /** Last pong received timestamp for heartbeat tracking */
  lastPong: number;
}

/** Inbound message from client */
interface ClientMessage {
  action: 'subscribe' | 'unsubscribe';
  channel: string;
}

/** Handle returned by createWsServer for lifecycle control */
export interface WsServerHandle {
  /** Broadcast data to all clients subscribed to the given channel */
  broadcast(channel: WsChannel, data: unknown): void;
  /** Returns current number of connected clients */
  getClientCount(): number;
  /** Gracefully close all connections and stop the server */
  shutdown(): Promise<void>;
}

// Ping every 30s; close client if no pong received within 10s after ping
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

/**
 * Creates and starts a WebSocket server on the given port.
 * Returns a handle for broadcasting, client count, and graceful shutdown.
 */
export function createWsServer(port: number): WsServerHandle {
  const wss = new WebSocketServer({ port });
  const clients = new Map<WebSocket, WsClient>();
  const channelManager = new ChannelManager();

  // --- Heartbeat timer: ping all clients every 30s ---
  const heartbeatTimer = setInterval(() => {
    const deadline = Date.now() - PING_INTERVAL_MS - PONG_TIMEOUT_MS;
    for (const [socket, client] of clients) {
      if (client.lastPong < deadline) {
        // No pong within allowed window — terminate stale connection
        socket.terminate();
        channelManager.unsubscribeAll(socket);
        clients.delete(socket);
        continue;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }, PING_INTERVAL_MS);

  // --- Connection handler ---
  wss.on('connection', (socket: WebSocket) => {
    const client: WsClient = { socket, lastPong: Date.now() };
    clients.set(socket, client);

    // Send welcome message with available channels
    const welcomeMsg = formatMessage('system', {
      type: 'connected',
      channels: Object.keys(
        Object.fromEntries(
          ['trades', 'orderbook', 'pnl', 'alerts', 'strategies', 'system'].map((k) => [k, k]),
        ),
      ),
    });
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serializeMessage(welcomeMsg));
    }

    socket.on('pong', () => {
      const c = clients.get(socket);
      if (c) c.lastPong = Date.now();
    });

    socket.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        handleClientMessage(socket, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      channelManager.unsubscribeAll(socket);
      clients.delete(socket);
    });

    socket.on('error', () => {
      channelManager.unsubscribeAll(socket);
      clients.delete(socket);
    });
  });

  // --- Subscription message handler ---
  function handleClientMessage(socket: WebSocket, msg: ClientMessage): void {
    if (!msg.action || !msg.channel) return;
    if (!validateChannel(msg.channel)) return;

    const ch = msg.channel as WsChannel;

    if (msg.action === 'subscribe') {
      channelManager.subscribe(socket, ch);
      const ack = formatMessage('system', { type: 'subscribed', channel: ch });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serializeMessage(ack));
      }
    } else if (msg.action === 'unsubscribe') {
      channelManager.unsubscribe(socket, ch);
      const ack = formatMessage('system', { type: 'unsubscribed', channel: ch });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serializeMessage(ack));
      }
    }
  }

  // --- Public handle ---
  return {
    broadcast(channel: WsChannel, data: unknown): void {
      channelManager.broadcastToChannel(channel, data);
    },

    getClientCount(): number {
      return clients.size;
    },

    shutdown(): Promise<void> {
      clearInterval(heartbeatTimer);
      for (const [socket] of clients) {
        socket.close(1001, 'Server shutting down');
      }
      clients.clear();
      return new Promise((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
