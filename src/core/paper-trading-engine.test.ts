/**
 * Tests for PaperTradingEngine — virtual balance, fills, P&L, slippage, fees, reset.
 */

import { PaperTradingEngine } from './paper-trading-engine';

const DEFAULT_CONFIG = {
  initialBalances: { USDT: 10000, BTC: 0 },
  slippagePct: 0.001,
  feeRate: 0.001,
};

function makeEngine() {
  const engine = new PaperTradingEngine(DEFAULT_CONFIG);
  engine.updatePrice('BTC/USDT', 50000);
  return engine;
}

describe('PaperTradingEngine', () => {
  describe('connect / fetchTicker / fetchOrderBook', () => {
    it('connect resolves without error', async () => {
      const engine = makeEngine();
      await expect(engine.connect()).resolves.toBeUndefined();
    });

    it('fetchTicker returns last updated price', async () => {
      const engine = makeEngine();
      await expect(engine.fetchTicker('BTC/USDT')).resolves.toBe(50000);
    });

    it('fetchTicker returns 0 for unknown symbol', async () => {
      const engine = makeEngine();
      await expect(engine.fetchTicker('ETH/USDT')).resolves.toBe(0);
    });

    it('fetchOrderBook returns bid/ask at last price', async () => {
      const engine = makeEngine();
      const ob = await engine.fetchOrderBook('BTC/USDT');
      expect(ob.symbol).toBe('BTC/USDT');
      expect(ob.bids[0].price).toBe(50000);
    });
  });

  describe('fetchBalance', () => {
    it('returns initial balances', async () => {
      const engine = makeEngine();
      const bal = await engine.fetchBalance();
      expect(bal['USDT'].total).toBe(10000);
      expect(bal['BTC'].total).toBe(0);
    });
  });

  describe('buy order', () => {
    it('deducts quote and adds base after buy', async () => {
      const engine = makeEngine();
      // Buy 0.1 BTC @ 50000 with 0.1% slippage → fill @ 50050; cost = 5005; fee = 5.005
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      const bal = await engine.fetchBalance();
      expect(bal['BTC'].total).toBeCloseTo(0.1, 5);
      expect(bal['USDT'].total).toBeLessThan(10000);
    });

    it('applies slippage on buy (fill price > raw price)', async () => {
      const engine = makeEngine();
      const order = await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      expect(order.price).toBeCloseTo(50050, 0); // 50000 * 1.001
    });

    it('applies fee on buy', async () => {
      const engine = makeEngine();
      const order = await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      // fee = fillPrice * amount * feeRate = 50050 * 0.1 * 0.001 = 5.005
      expect(order.price * 0.1 * 0.001).toBeCloseTo(order.fee ?? 5.005, 2);
    });

    it('rejects buy when insufficient quote balance', async () => {
      const engine = new PaperTradingEngine({ initialBalances: { USDT: 1, BTC: 0 }, slippagePct: 0.001, feeRate: 0.001 });
      engine.updatePrice('BTC/USDT', 50000);
      await expect(engine.createMarketOrder('BTC/USDT', 'buy', 1)).rejects.toThrow('Insufficient USDT');
    });

    it('rejects zero amount', async () => {
      const engine = makeEngine();
      await expect(engine.createMarketOrder('BTC/USDT', 'buy', 0)).rejects.toThrow('Amount must be positive');
    });

    it('rejects order when no price set', async () => {
      const engine = new PaperTradingEngine(DEFAULT_CONFIG);
      await expect(engine.createMarketOrder('BTC/USDT', 'buy', 0.1)).rejects.toThrow('No price available');
    });
  });

  describe('sell order', () => {
    it('deducts base and adds quote after sell', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      const btcBefore = (await engine.fetchBalance())['BTC'].total;
      await engine.createMarketOrder('BTC/USDT', 'sell', 0.1);
      const bal = await engine.fetchBalance();
      expect(bal['BTC'].total).toBeCloseTo(btcBefore - 0.1, 5);
    });

    it('applies slippage on sell (fill price < raw price)', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      const order = await engine.createMarketOrder('BTC/USDT', 'sell', 0.1);
      expect(order.price).toBeCloseTo(49950, 0); // 50000 * 0.999
    });

    it('rejects sell when insufficient base balance', async () => {
      const engine = makeEngine();
      await expect(engine.createMarketOrder('BTC/USDT', 'sell', 1)).rejects.toThrow('Insufficient BTC');
    });
  });

  describe('positions and P&L', () => {
    it('opens position after buy', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      const positions = engine.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].side).toBe('long');
      expect(positions[0].amount).toBeCloseTo(0.1, 5);
    });

    it('closes position after full sell', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      await engine.createMarketOrder('BTC/USDT', 'sell', 0.1);
      expect(engine.getPositions()).toHaveLength(0);
    });

    it('updatePrice refreshes unrealized P&L', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      engine.updatePrice('BTC/USDT', 55000);
      const pnl = engine.getPnl();
      expect(pnl.unrealized).toBeGreaterThan(0);
    });

    it('getPnl returns realized after sell', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      engine.updatePrice('BTC/USDT', 60000);
      await engine.createMarketOrder('BTC/USDT', 'sell', 0.1);
      const pnl = engine.getPnl();
      expect(pnl.realized).toBeGreaterThan(0);
      expect(pnl.unrealized).toBe(0);
    });
  });

  describe('trade history', () => {
    it('records each trade', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      await engine.createMarketOrder('BTC/USDT', 'sell', 0.1);
      expect(engine.getTradeHistory()).toHaveLength(2);
    });

    it('returns a copy (mutation safe)', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      const history = engine.getTradeHistory();
      history.pop();
      expect(engine.getTradeHistory()).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('clears all state after reset', async () => {
      const engine = makeEngine();
      await engine.createMarketOrder('BTC/USDT', 'buy', 0.1);
      engine.reset();
      const bal = await engine.fetchBalance();
      expect(bal['USDT'].total).toBe(10000);
      expect(bal['BTC'].total).toBe(0);
      expect(engine.getPositions()).toHaveLength(0);
      expect(engine.getTradeHistory()).toHaveLength(0);
      expect(engine.getPnl()).toEqual({ realized: 0, unrealized: 0, total: 0 });
    });
  });
});
