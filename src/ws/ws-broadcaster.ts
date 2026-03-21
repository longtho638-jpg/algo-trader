// Bridges the internal EventBus to WebSocket channels
// Listens to system events and broadcasts them to subscribed WS clients
// Also exposes direct broadcast methods for typed event payloads
import type { EventBus } from '../events/event-bus.js';
import type { TradeResult, PnlSnapshot } from '../core/types.js';
import type { WsServerHandle } from './ws-server.js';

/** Orderbook snapshot shape for broadcastOrderbook */
export interface OrderbookData {
  marketId: string;
  bids: Array<[string, string]>; // [price, size]
  asks: Array<[string, string]>;
  timestamp: number;
}

/** Strategy status payload for broadcastStrategyStatus */
export interface StrategyStatus {
  name: string;
  event: 'started' | 'stopped' | 'error';
  detail?: string;
}

/** Standard broadcast envelope */
interface BroadcastEnvelope {
  type: 'trade' | 'pnl' | 'strategy' | 'orderbook';
  data: unknown;
  timestamp: string;
}

function envelope(type: BroadcastEnvelope['type'], data: unknown): BroadcastEnvelope {
  return { type, data, timestamp: new Date().toISOString() };
}

/**
 * WsBroadcaster wires EventBus events to WebSocket channels.
 * Also exposes typed direct-broadcast methods for imperative use.
 * Call wireEventBus() to activate. Call dispose() to remove all listeners.
 */
export class WsBroadcaster {
  private bus: EventBus | null = null;
  private wsServer: WsServerHandle | null = null;

  // Keep handler refs so we can remove them on dispose
  private readonly handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];

  /**
   * Connects the EventBus to the WS server.
   * Safe to call multiple times — previous wiring is disposed first.
   */
  wireEventBus(bus: EventBus, wsServer: WsServerHandle): void {
    this.dispose();
    this.bus = bus;
    this.wsServer = wsServer;
    this.registerHandlers();
  }

  /** Remove all event listeners registered by this broadcaster. */
  dispose(): void {
    if (this.bus) {
      for (const { event, fn } of this.handlers) {
        this.bus.removeListener(event, fn);
      }
    }
    this.handlers.length = 0;
    this.bus = null;
    this.wsServer = null;
  }

  // ---------------------------------------------------------------------------
  // Direct broadcast methods — usable without EventBus wiring
  // ---------------------------------------------------------------------------

  /** Broadcast a real-time trade execution update to 'trades' channel. */
  broadcastTrade(trade: TradeResult): void {
    this.wsServer?.broadcast('trades', envelope('trade', trade));
  }

  /** Broadcast a P&L change to 'pnl' channel. */
  broadcastPnl(pnlUpdate: PnlSnapshot): void {
    this.wsServer?.broadcast('pnl', envelope('pnl', pnlUpdate));
  }

  /** Broadcast a strategy start/stop/error event to 'strategies' channel. */
  broadcastStrategyStatus(status: StrategyStatus): void {
    this.wsServer?.broadcast('strategies', envelope('strategy', status));
  }

  /** Broadcast an orderbook snapshot to 'orderbook' channel. */
  broadcastOrderbook(orderbookData: OrderbookData): void {
    this.wsServer?.broadcast('orderbook', envelope('orderbook', orderbookData));
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private registerHandlers(): void {
    this.addHandler('trade.executed', (data) => {
      const d = data as { trade: TradeResult };
      this.broadcastTrade(d.trade);
    });

    this.addHandler('pnl.snapshot', (data) => {
      const d = data as { snapshot: PnlSnapshot };
      this.broadcastPnl(d.snapshot);
    });

    this.addHandler('alert.triggered', (data) => {
      this.wsServer!.broadcast('alerts', data);
    });

    this.addHandler('strategy.started', (data) => {
      const d = data as { name: string };
      this.broadcastStrategyStatus({ name: d.name, event: 'started' });
    });

    this.addHandler('strategy.stopped', (data) => {
      const d = data as { name: string; reason: string };
      this.broadcastStrategyStatus({ name: d.name, event: 'stopped', detail: d.reason });
    });

    this.addHandler('strategy.error', (data) => {
      const d = data as { name: string; error: string };
      this.broadcastStrategyStatus({ name: d.name, event: 'error', detail: d.error });
    });

    this.addHandler('system.startup', (data) => {
      this.wsServer!.broadcast('system', { event: 'startup', ...toRecord(data) });
    });

    this.addHandler('system.shutdown', (data) => {
      this.wsServer!.broadcast('system', { event: 'shutdown', ...toRecord(data) });
    });
  }

  private addHandler(event: string, fn: (data: unknown) => void): void {
    const handler = fn as (...args: unknown[]) => void;
    (this.bus! as import('../events/event-bus.js').EventBus).on(
      event as import('../events/event-types.js').SystemEventName,
      handler as never,
    );
    this.handlers.push({ event, fn: handler });
  }
}

/** Safely spread an unknown value into a plain object. */
function toRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { payload: value };
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Creates a WsBroadcaster and immediately wires it to the provided bus + server.
 * Returns the broadcaster so callers can dispose() it when shutting down.
 */
export function wireEventBus(bus: EventBus, wsServer: WsServerHandle): WsBroadcaster {
  const broadcaster = new WsBroadcaster();
  broadcaster.wireEventBus(bus, wsServer);
  return broadcaster;
}
