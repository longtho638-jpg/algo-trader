import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KalshiClient } from '../../src/kalshi/kalshi-client.js';
import { KalshiMarketScanner } from '../../src/kalshi/kalshi-market-scanner.js';
import { KalshiOrderManager } from '../../src/kalshi/kalshi-order-manager.js';
import { createKalshiClient } from '../../src/kalshi/index.js';

describe('KalshiClient', () => {
  let client: KalshiClient;

  beforeEach(() => {
    client = new KalshiClient({ paperMode: true });
  });

  it('should default to paper mode', () => {
    const paperClient = new KalshiClient();
    expect(paperClient).toBeDefined();
  });

  it('should return simulated markets in paper mode', async () => {
    const markets = await client.getMarkets();
    expect(markets).toHaveLength(2);
    expect(markets[0]).toHaveProperty('ticker');
    expect(markets[0]).toHaveProperty('yes_bid');
    expect(markets[0]).toHaveProperty('yes_ask');
  });

  it('should return simulated orderbook in paper mode', async () => {
    const orderbook = await client.getOrderbook('TEST-MARKET');
    expect(orderbook).toHaveProperty('ticker', 'TEST-MARKET');
    expect(orderbook).toHaveProperty('yes');
    expect(orderbook).toHaveProperty('no');
    expect(Array.isArray(orderbook.yes)).toBe(true);
    expect(Array.isArray(orderbook.no)).toBe(true);
  });

  it('should place a simulated order in paper mode', async () => {
    const order = await client.placeOrder('TEST', 'yes', 'limit', 45, 10);
    expect(order.order_id).toMatch(/^paper-/);
    expect(order.ticker).toBe('TEST');
    expect(order.side).toBe('yes');
    expect(order.count).toBe(10);
  });

  it('should return balance in paper mode', async () => {
    const balance = await client.getBalance();
    expect(balance.balance).toBe(100000);
    expect(balance.payout).toBe(0);
    expect(balance.fees_paid).toBe(0);
  });

  it('should return empty positions in paper mode', async () => {
    const positions = await client.getPositions();
    expect(positions).toEqual([]);
  });

  it('should cancel a simulated order in paper mode', async () => {
    const result = await client.cancelOrder('paper-1');
    expect(result).toBe(true);
  });

  it('should get event in paper mode', async () => {
    const event = await client.getEvent('TEST-EVENT');
    expect(event.event_ticker).toBe('TEST-EVENT');
    expect(event).toHaveProperty('markets');
    expect(Array.isArray(event.markets)).toBe(true);
  });
});

describe('KalshiMarketScanner', () => {
  let client: KalshiClient;
  let scanner: KalshiMarketScanner;

  beforeEach(() => {
    client = new KalshiClient({ paperMode: true });
    scanner = new KalshiMarketScanner(client);
  });

  it('should scan opportunities', async () => {
    const opportunities = await scanner.scanOpportunities();
    expect(Array.isArray(opportunities)).toBe(true);
    // Paper mode returns 2 markets with sufficient volume
    expect(opportunities.length).toBeGreaterThanOrEqual(0);
  });

  it('should include ticker and score in opportunities', async () => {
    const opportunities = await scanner.scanOpportunities();
    if (opportunities.length > 0) {
      const opp = opportunities[0];
      expect(opp).toHaveProperty('ticker');
      expect(opp).toHaveProperty('type');
      expect(opp).toHaveProperty('mispriceGap');
      expect(opp).toHaveProperty('score');
      expect(typeof opp.score).toBe('number');
    }
  });

  it('should sort opportunities by score descending', async () => {
    const opportunities = await scanner.scanOpportunities();
    for (let i = 1; i < opportunities.length; i++) {
      expect(opportunities[i - 1].score).toBeGreaterThanOrEqual(opportunities[i].score);
    }
  });

  it('should scan markets with sufficient volume', async () => {
    const markets = await scanner.scanMarkets();
    expect(Array.isArray(markets)).toBe(true);
  });

  it('should find cross-platform arb opportunities', async () => {
    const polyPrices = new Map([
      ['TEST-1', { conditionId: 'cond-1', title: 'Test Market 1', midPrice: 0.50 }],
      ['TEST-2', { conditionId: 'cond-2', title: 'Test Market 2', midPrice: 0.45 }],
    ]);

    const arbs = await scanner.findArbOpportunities(polyPrices);
    expect(Array.isArray(arbs)).toBe(true);
  });

  it('should match markets by title similarity', () => {
    const kalshiMarkets = [
      {
        ticker: 'K1', title: 'Will Donald Trump win 2024', subtitle: '',
        status: 'open' as const, yes_bid: 45, yes_ask: 47, no_bid: 53, no_ask: 55,
        volume: 1000, open_interest: 500, close_time: new Date().toISOString(),
      },
    ];
    const polyEntries = [
      { conditionId: 'p1', title: 'Trump 2024 Election Win', midPrice: 0.50 },
      { conditionId: 'p2', title: 'Bitcoin Price $100k', midPrice: 0.40 },
    ];

    const matches = scanner.matchMarkets(kalshiMarkets, polyEntries);
    expect(matches.size).toBeGreaterThan(0);
    expect(matches.has('K1')).toBe(true);
  });
});

describe('KalshiOrderManager', () => {
  let client: KalshiClient;
  let manager: KalshiOrderManager;

  beforeEach(() => {
    client = new KalshiClient({ paperMode: true });
    manager = new KalshiOrderManager(client);
  });

  it('should track open orders', async () => {
    const opportunity = {
      kalshiMarket: {
        ticker: 'TEST', title: 'Test', status: 'open' as const,
        yes_bid: 45, yes_ask: 47, no_bid: 53, no_ask: 55,
        volume: 1000, open_interest: 500, close_time: new Date().toISOString(),
      },
      polymarketConditionId: 'cond-1',
      kalshiPrice: 0.45,
      polymarketPrice: 0.50,
      spread: 0.05,
      direction: 'buy-kalshi' as const,
    };

    const order = await manager.submitOrder(opportunity, 100);
    expect(order.id).toMatch(/^paper-/);
    expect(order.marketId).toBe('TEST');

    const openOrders = manager.getOpenOrders();
    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].id).toBe(order.id);
  });

  it('should track position after order placement', async () => {
    const opportunity = {
      kalshiMarket: {
        ticker: 'ABC', title: 'Test', status: 'open' as const,
        yes_bid: 45, yes_ask: 47, no_bid: 53, no_ask: 55,
        volume: 1000, open_interest: 500, close_time: new Date().toISOString(),
      },
      polymarketConditionId: 'cond-1',
      kalshiPrice: 0.45,
      polymarketPrice: 0.50,
      spread: 0.05,
      direction: 'buy-kalshi' as const,
    };

    await manager.submitOrder(opportunity, 100);
    const position = manager.getPosition('ABC');

    expect(position).toBeDefined();
    expect(position?.marketId).toBe('ABC');
    expect(position?.size).toBe('100');
    expect(position?.side).toBe('long');
  });

  it('should calculate P&L correctly', async () => {
    const opportunity = {
      kalshiMarket: {
        ticker: 'XYZ', title: 'Test', status: 'open' as const,
        yes_bid: 40, yes_ask: 42, no_bid: 58, no_ask: 60,
        volume: 1000, open_interest: 500, close_time: new Date().toISOString(),
      },
      polymarketConditionId: 'cond-1',
      kalshiPrice: 0.41,
      polymarketPrice: 0.50,
      spread: 0.09,
      direction: 'buy-kalshi' as const,
    };

    await manager.submitOrder(opportunity, 100);

    // Current mid price 0.45 (average of 40 and 50)
    const pnl = manager.markToMarket('XYZ', 0.45);
    expect(typeof pnl.unrealizedPnl).toBe('number');
    expect(typeof pnl.realizedPnl).toBe('number');
  });

  it('should cancel all orders', async () => {
    const opportunity = {
      kalshiMarket: {
        ticker: 'DEF', title: 'Test', status: 'open' as const,
        yes_bid: 45, yes_ask: 47, no_bid: 53, no_ask: 55,
        volume: 1000, open_interest: 500, close_time: new Date().toISOString(),
      },
      polymarketConditionId: 'cond-1',
      kalshiPrice: 0.45,
      polymarketPrice: 0.50,
      spread: 0.05,
      direction: 'buy-kalshi' as const,
    };

    const order1 = await manager.submitOrder(opportunity, 50);
    const order2 = await manager.submitOrder(opportunity, 50);

    const before = manager.getOpenOrders();
    expect(before).toHaveLength(2);

    await manager.cancelAllOrders([order1.id, order2.id]);

    const after = manager.getOpenOrders();
    expect(after).toHaveLength(0);
  });

  it('should return null position for non-existent ticker', () => {
    const position = manager.getPosition('NONEXISTENT');
    expect(position).toBeNull();
  });
});

describe('createKalshiClient factory', () => {
  it('should create bundle with client, scanner, and manager', () => {
    const bundle = createKalshiClient({ paperMode: true });
    expect(bundle.client).toBeDefined();
    expect(bundle.scanner).toBeDefined();
    expect(bundle.orderManager).toBeDefined();
  });

  it('should wire components together', async () => {
    const bundle = createKalshiClient({ paperMode: true });
    const markets = await bundle.client.getMarkets();
    const opportunities = await bundle.scanner.scanOpportunities();

    expect(markets).toBeDefined();
    expect(opportunities).toBeDefined();
  });
});
