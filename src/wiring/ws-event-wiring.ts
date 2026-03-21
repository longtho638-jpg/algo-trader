// Convenience module that wires EventBus events to WebSocket broadcaster.
// Single point where EventBus → WebSocket bridging is configured.
// Used by app.ts to connect the event system to real-time streaming.
import { EventBus } from '../events/event-bus.js';
import { WsBroadcaster, wireEventBus } from '../ws/ws-broadcaster.js';
import type { WsServerHandle } from '../ws/ws-server.js';
import { logger } from '../core/logger.js';

export interface WsEventWiring {
  broadcaster: WsBroadcaster;
  dispose: () => void;
}

export function wireWsEvents(eventBus: EventBus, wsServer: WsServerHandle): WsEventWiring {
  logger.info('Wiring EventBus → WebSocket broadcaster', 'WsEventWiring');
  const broadcaster = wireEventBus(eventBus, wsServer);

  // Log connection stats periodically
  const statsTimer = setInterval(() => {
    logger.debug('WS stats', 'WsEventWiring', { clients: wsServer.getClientCount() });
  }, 60_000);

  return {
    broadcaster,
    dispose() {
      clearInterval(statsTimer);
      broadcaster.dispose();
      logger.info('WS event wiring disposed', 'WsEventWiring');
    },
  };
}
