// Pure helpers for order-executor: type definitions, status mapping, CCXT→TrackedOrder mapping,
// and paper fill simulation. Kept separate to keep order-executor.ts under 200 lines.

import type * as ccxt from 'ccxt';
import type { Order, OrderSide, StrategyName } from '../core/types.js';
import { generateId } from '../core/utils.js';
import type { SupportedExchange } from './exchange-client.js';

export type OrderType = 'market' | 'limit' | 'stop-loss';

export interface PlaceOrderParams {
  exchange: SupportedExchange;
  symbol: string;
  side: OrderSide;
  amount: number;
  /** Required for limit and stop-loss orders */
  price?: number;
  /** Trigger price for stop-loss orders */
  stopPrice?: number;
  strategy: StrategyName;
  type?: OrderType;
  /** 'swap' for perpetual futures, 'spot' default */
  marketType?: 'spot' | 'swap';
}

export interface TrackedOrder extends Order {
  exchange: SupportedExchange;
  strategy: StrategyName;
  /** Slippage applied in paper mode (decimal string, e.g. "0.0500%") */
  slippage?: string;
  paperFill?: boolean;
}

/** Simulated slippage for paper trades: 0.05% */
export const PAPER_SLIPPAGE = 0.0005;

/** Map CCXT order status string to core OrderStatus */
export function mapStatus(ccxtStatus: string): Order['status'] {
  switch (ccxtStatus) {
    case 'open':      return 'open';
    case 'closed':    return 'filled';
    case 'canceled':
    case 'cancelled': return 'cancelled';
    case 'rejected':  return 'rejected';
    case 'expired':   return 'cancelled';
    default:          return 'pending';
  }
}

/** Map a raw CCXT Order to a TrackedOrder */
export function mapOrder(
  raw: ccxt.Order,
  meta: { side: OrderSide; price: number; amount: number; exchange: SupportedExchange; strategy: StrategyName },
): TrackedOrder {
  return {
    id: raw.id ?? generateId('ord'),
    marketId: raw.symbol,
    side: meta.side,
    price: String(raw.price ?? meta.price),
    size: String(raw.amount ?? meta.amount),
    status: mapStatus(raw.status ?? 'open'),
    type: (raw.type === 'market' ? 'market' : 'limit') as Order['type'],
    createdAt: raw.timestamp ?? Date.now(),
    ...(raw.lastTradeTimestamp ? { filledAt: raw.lastTradeTimestamp } : {}),
    exchange: meta.exchange,
    strategy: meta.strategy,
    paperFill: false,
  };
}

/**
 * Simulate a paper fill with realistic slippage.
 * Buys incur positive slippage (pay more), sells incur negative (receive less).
 */
export function simulatePaperFill(params: PlaceOrderParams, referencePrice: number): TrackedOrder {
  const slippageFactor = params.side === 'buy'
    ? 1 + PAPER_SLIPPAGE
    : 1 - PAPER_SLIPPAGE;

  const fillPrice = referencePrice * slippageFactor;
  const now = Date.now();

  return {
    id: generateId('paper'),
    marketId: params.symbol,
    side: params.side,
    price: fillPrice.toFixed(8),
    size: String(params.amount),
    status: 'filled',
    type: params.type === 'limit' ? 'limit' : 'market',
    createdAt: now,
    filledAt: now,
    exchange: params.exchange,
    strategy: params.strategy,
    slippage: (PAPER_SLIPPAGE * 100).toFixed(4) + '%',
    paperFill: true,
  };
}
