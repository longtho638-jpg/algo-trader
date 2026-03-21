// Wiring layer barrel export
// Connects all algo-trade modules via event bus, strategy runner, and API routes
export {
  wireTradeEvents,
  wireStrategyEvents,
  wireSystemEvents,
} from './event-wiring.js';
export type {
  TradeEventDeps,
  StrategyEventDeps,
  SystemEventDeps,
} from './event-wiring.js';

export {
  wirePolymarketStrategies,
  wireCexDexStrategies,
  wireAllStrategies,
} from './strategy-wiring.js';
export type {
  PolymarketDeps,
  CexDexDeps,
  AllStrategyDeps,
} from './strategy-wiring.js';

export {
  wireApiRoutes,
  createRequestHandler,
} from './api-wiring.js';
export type { ApiDependencies } from './api-wiring.js';
