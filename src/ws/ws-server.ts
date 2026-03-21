// WebSocket server for algo-trade real-time streaming
// Manages client connections, subscriptions, heartbeat, and message dispatch
import { WebSocketServer, WebSocket } from 'ws';
import { validateChannel, serializeMessage, formatMessage } from './ws-channels.js';
import type { WsChannel } from './ws-channels.js';

/** Internal state per connected client */
interface WsClient {
  socket: WebSocket;
  subscriptions: Set<WsChannel>;
  /** Last pong received timestamp for heartbeat tracking */
  lastPong: number;
}

/** Inbound message from client */
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  channel: string;
}

/** Handle returned by createWsServer for lifecycle control */
export interface WsServerHandle {
  /** Broadcast data to all clients subscribed to the given channel */
  broadcast(channel: WsChannel, data: unknown): void;
  /** Gracefully close all connections and stop the server */
  shutdown(): Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * Creates and starts a WebSocket server on the given port.
 * Returns a handle for broadcasting and graceful shutdown.
 */
export function createWsServer(port: number): WsServerHandle {
  const wss = new WebSocketServer({ port });
  const clients = new Map<WebSocket, WsClient>();

  // --- Heartbeat timer ---
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [socket, client] of clients) {
      if (now - client.lastPong > HEARTBEAT_TIMEOUT_MS) {
        // Client failed to respond to ping — terminate
        socket.terminate();
        clients.delete(socket);
        continue;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // --- Connection handler ---
  wss.on('connection', (socket: WebSocket) => {
    const client: WsClient = {
      socket,
      subscriptions: new Set(),
      lastPong: Date.now(),
    };
    clients.set(socket, client);

    // Send available channels on connect
    const welcomeMsg = formatMessage('system', {
      type: 'connected',
      channels: Object.keys(validateChannel),
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
        handleClientMessage(client, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });

  // --- Message handler ---
  function handleClientMessage(client: WsClient, msg: ClientMessage): void {
    if (!msg.type || !msg.channel) return;
    if (!validateChannel(msg.channel)) return;

    const ch = msg.channel as WsChannel;
    if (msg.type === 'subscribe') {
      client.subscriptions.add(ch);
      const ack = formatMessage('system', { type: 'subscribed', channel: ch });
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(serializeMessage(ack));
      }
    } else if (msg.type === 'unsubscribe') {
      client.subscriptions.delete(ch);
      const ack = formatMessage('system', { type: 'unsubscribed', channel: ch });
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(serializeMessage(ack));
      }
    }
  }

  // --- Public handle ---
  return {
    broadcast(channel: WsChannel, data: unknown): void {
      const payload = serializeMessage(formatMessage(channel, data));
      for (const [, client] of clients) {
        if (
          client.subscriptions.has(channel) &&
          client.socket.readyState === WebSocket.OPEN
        ) {
          client.socket.send(payload);
        }
      }
    },

    shutdown(): Promise<void> {
      clearInterval(heartbeatTimer);
      // Close all client sockets
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
