// Bridges the internal EventBus to WebSocket channels
// Listens to system events and broadcasts them to subscribed WS clients
import type { EventBus } from '../events/event-bus.js';
import type { WsServerHandle } from './ws-server.js';

/**
 * WsBroadcaster wires EventBus events to WebSocket channels.
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
  // Private
  // ---------------------------------------------------------------------------

  private registerHandlers(): void {
    // trade.executed → 'trades' channel
    this.addHandler('trade.executed', (data) => {
      this.wsServer!.broadcast('trades', data);
    });

    // pnl.snapshot → 'pnl' channel
    this.addHandler('pnl.snapshot', (data) => {
      this.wsServer!.broadcast('pnl', data);
    });

    // alert.triggered → 'alerts' channel
    this.addHandler('alert.triggered', (data) => {
      this.wsServer!.broadcast('alerts', data);
    });

    // strategy.started → 'strategies' channel
    this.addHandler('strategy.started', (data) => {
      this.wsServer!.broadcast('strategies', { event: 'started', ...toRecord(data) });
    });

    // strategy.stopped → 'strategies' channel
    this.addHandler('strategy.stopped', (data) => {
      this.wsServer!.broadcast('strategies', { event: 'stopped', ...toRecord(data) });
    });

    // strategy.error → 'strategies' channel
    this.addHandler('strategy.error', (data) => {
      this.wsServer!.broadcast('strategies', { event: 'error', ...toRecord(data) });
    });

    // system.startup / system.shutdown → 'system' channel
    this.addHandler('system.startup', (data) => {
      this.wsServer!.broadcast('system', { event: 'startup', ...toRecord(data) });
    });

    this.addHandler('system.shutdown', (data) => {
      this.wsServer!.broadcast('system', { event: 'shutdown', ...toRecord(data) });
    });
  }

  /**
   * Register a typed handler on the bus and track it for cleanup.
   * EventBus uses string event names at runtime; we cast to satisfy the
   * generic overloads while keeping this file free of `any`.
   */
  private addHandler(event: string, fn: (data: unknown) => void): void {
    const handler = fn as (...args: unknown[]) => void;
    // Cast event name to satisfy EventBus generic overloads at runtime
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
