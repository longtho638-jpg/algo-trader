import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderManager } from '../../src/polymarket/order-manager.js';
import type { ClobClient } from '../../src/polymarket/clob-client.js';
import type { Order } from '../../src/core/types.js';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: `order-${Math.random().toString(36).slice(2, 8)}`,
    marketId: 'market-1',
    side: 'buy',
    price: '0.60',
    size: '100',
    status: 'open',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeMockClient(): ClobClient {
  return {
    isPaperMode: false,
    postOrder: vi.fn().mockImplementation(async () => makeOrder()),
    cancelOrder: vi.fn().mockResolvedValue(true),
    getPrice: vi.fn().mockResolvedValue({ mid: '0.60', bid: '0.59', ask: '0.61' }),
    getOrderBook: vi.fn().mockResolvedValue({ bids: [], asks: [], market: '', asset_id: '', hash: '' }),
    getMarkets: vi.fn().mockResolvedValue([]),
  } as unknown as ClobClient;
}

describe('OrderManager — cancelAllOpen', () => {
  let client: ClobClient;
  let manager: OrderManager;

  beforeEach(() => {
    client = makeMockClient();
    manager = new OrderManager(client);
  });

  it('returns 0 when no open orders', async () => {
    const count = await manager.cancelAllOpen();
    expect(count).toBe(0);
  });

  it('cancels all open orders across multiple markets', async () => {
    // Place 3 orders on different markets
    const order1 = makeOrder({ id: 'o1', marketId: 'market-a' });
    const order2 = makeOrder({ id: 'o2', marketId: 'market-b' });
    const order3 = makeOrder({ id: 'o3', marketId: 'market-c' });

    (client.postOrder as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(order1)
      .mockResolvedValueOnce(order2)
      .mockResolvedValueOnce(order3);

    await manager.placeOrder({ tokenId: 't1', price: '0.5', size: '50', side: 'buy' });
    await manager.placeOrder({ tokenId: 't2', price: '0.6', size: '30', side: 'sell' });
    await manager.placeOrder({ tokenId: 't3', price: '0.7', size: '20', side: 'buy' });

    expect(manager.getOpenOrders()).toHaveLength(3);

    const cancelled = await manager.cancelAllOpen();
    expect(cancelled).toBe(3);
    expect(manager.getOpenOrders()).toHaveLength(0);
  });

  it('skips already filled orders', async () => {
    const order1 = makeOrder({ id: 'o1' });
    const order2 = makeOrder({ id: 'o2' });

    (client.postOrder as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(order1)
      .mockResolvedValueOnce(order2);

    await manager.placeOrder({ tokenId: 't1', price: '0.5', size: '50', side: 'buy' });
    await manager.placeOrder({ tokenId: 't2', price: '0.6', size: '30', side: 'sell' });

    // Fill the first order
    manager.updateStatus('o1', 'filled', '50');

    const cancelled = await manager.cancelAllOpen();
    expect(cancelled).toBe(1); // only o2 was open
  });

  it('handles partial cancel failures gracefully', async () => {
    const order1 = makeOrder({ id: 'o1' });
    const order2 = makeOrder({ id: 'o2' });
    const order3 = makeOrder({ id: 'o3' });

    (client.postOrder as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(order1)
      .mockResolvedValueOnce(order2)
      .mockResolvedValueOnce(order3);

    await manager.placeOrder({ tokenId: 't1', price: '0.5', size: '50', side: 'buy' });
    await manager.placeOrder({ tokenId: 't2', price: '0.6', size: '30', side: 'sell' });
    await manager.placeOrder({ tokenId: 't3', price: '0.7', size: '20', side: 'buy' });

    // Second cancel throws
    (client.cancelOrder as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(true);

    const cancelled = await manager.cancelAllOpen();
    // o1 cancelled, o2 threw, o3 cancelled = 2
    expect(cancelled).toBe(2);
  });

  it('skips cancelled orders', async () => {
    const order1 = makeOrder({ id: 'o1' });

    (client.postOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(order1);
    await manager.placeOrder({ tokenId: 't1', price: '0.5', size: '50', side: 'buy' });

    // Cancel it manually first
    await manager.cancelOrder('o1');

    const cancelled = await manager.cancelAllOpen();
    expect(cancelled).toBe(0);
  });
});
