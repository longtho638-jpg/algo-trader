// Barrel export for WebSocket streaming module
export { createWsServer } from './ws-server.js';
export type { WsServerHandle } from './ws-server.js';

export {
  validateChannel,
  formatMessage,
  serializeMessage,
  CHANNEL_DESCRIPTIONS,
  ChannelManager,
} from './ws-channels.js';
export type { WsChannel, ChannelMessage } from './ws-channels.js';

export { WsBroadcaster, wireEventBus } from './ws-broadcaster.js';
export type { OrderbookData, StrategyStatus } from './ws-broadcaster.js';
