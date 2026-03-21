// Barrel export for CEX module
// Factory: use createCexClient() to get a pre-wired ExchangeClient + MarketData + OrderExecutor

export { ExchangeClient, createExchange, isLiveTradingEnabled } from './exchange-client.js';
export { OrderExecutor } from './order-executor.js';
export { MarketData } from './market-data.js';

export type { SupportedExchange, ExchangeConfig, Ticker, Orderbook, Balance } from './exchange-client.js';
export type { PlaceOrderParams, TrackedOrder, OrderType } from './order-executor.js';
export type { OHLCVCandle, FundingRate, CrossExchangePrice, PriceSpread } from './market-data.js';

import { ExchangeClient } from './exchange-client.js';
import { MarketData } from './market-data.js';
import { OrderExecutor } from './order-executor.js';
import type { ExchangeConfig, SupportedExchange } from './exchange-client.js';

export interface CexClient {
  exchangeClient: ExchangeClient;
  marketData: MarketData;
  orderExecutor: OrderExecutor;
}

/**
 * Factory: create a fully-wired CEX client for a given exchange.
 *
 * @example
 * const { marketData, orderExecutor } = createCexClient('binance', {
 *   apiKey: '...', apiSecret: '...',
 * });
 *
 * Paper mode is active by default. Set LIVE_TRADING=true env var to enable live execution.
 */
export function createCexClient(
  exchangeId: SupportedExchange,
  config: ExchangeConfig,
): CexClient {
  const exchangeClient = new ExchangeClient();
  exchangeClient.connect(exchangeId, config);

  const marketData = new MarketData(exchangeClient);
  const orderExecutor = new OrderExecutor(exchangeClient);

  return { exchangeClient, marketData, orderExecutor };
}
