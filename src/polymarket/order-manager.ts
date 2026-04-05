/**
 * Order Manager — type definitions for strategy consumption.
 */

export interface OrderManager {
  placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: number;
    size: number;
  }): Promise<string>;
  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(tokenId?: string): Promise<void>;
  getOpenOrders(tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>>;
}
