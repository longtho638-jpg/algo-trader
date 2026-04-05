/**
 * Polymarket CLOB Client — type definitions for strategy consumption.
 * Full implementation pending Polymarket CLOB API integration.
 */

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface RawOrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface ClobClient {
  getOrderBook(tokenId: string): Promise<RawOrderBook>;
  getPrice(tokenId: string): Promise<number>;
  getMidPrice(tokenId: string): Promise<number>;
}
