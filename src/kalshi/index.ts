// Kalshi module — prediction market API integration
// Factory: createKalshiClient(config) for convenient setup
export { KalshiClient } from './kalshi-client.js';
export type {
  KalshiMarket,
  KalshiEvent,
  KalshiOrderbook,
  KalshiOrderbookLevel,
  KalshiOrder,
  KalshiBalance,
  KalshiPosition,
  KalshiClientConfig,
} from './kalshi-client.js';

export { KalshiMarketScanner } from './kalshi-market-scanner.js';
export type {
  KalshiOpportunity,
  CrossPlatformOpportunity,
  PolymarketPriceMap,
} from './kalshi-market-scanner.js';

export { KalshiOrderManager } from './kalshi-order-manager.js';

// --- Factory ---

import { KalshiClient, type KalshiClientConfig } from './kalshi-client.js';
import { KalshiMarketScanner } from './kalshi-market-scanner.js';
import { KalshiOrderManager } from './kalshi-order-manager.js';

export interface KalshiBundle {
  client: KalshiClient;
  scanner: KalshiMarketScanner;
  orderManager: KalshiOrderManager;
}

/**
 * Create a fully wired Kalshi client bundle.
 * Defaults to paper mode unless config.paperMode=false AND LIVE_TRADING=true.
 */
export function createKalshiClient(config?: KalshiClientConfig): KalshiBundle {
  const client = new KalshiClient(config);
  const scanner = new KalshiMarketScanner(client);
  const orderManager = new KalshiOrderManager(client);
  return { client, scanner, orderManager };
}
