import { describe, it, expect } from 'vitest';
import { TradeObserver, type TradeObserverConfig } from '../../src/openclaw/trade-observer.js';
import type { TradeResult } from '../../src/core/types.js';

function makeTrade(overrides: Partial<TradeResult> = {}): TradeResult {
  return {
    orderId: `o-${Math.random().toString(36).slice(2, 6)}`,
    marketId: 'BTC/USDT',
    side: 'buy',
    fillPrice: '50000',
    fillSize: '0.1',
    fees: '0.5',
    timestamp: Date.now(),
    strategy: 'grid-dca',
    ...overrides,
  };
}

function makeEventBus() {
  const handlers = new Map<string, Function[]>();
  return {
    on(event: string, fn: Function) {
      const list = handlers.get(event) ?? [];
      list.push(fn);
      handlers.set(event, list);
    },
    off(event: string, fn: Function) {
      const list = handlers.get(event) ?? [];
      handlers.set(event, list.filter(h => h !== fn));
    },
    emit(event: string, data: any) {
      for (const fn of handlers.get(event) ?? []) fn(data);
    },
  };
}

describe('TradeObserver', () => {
  it('should create with default config', () => {
    const observer = new TradeObserver();
    const snapshot = observer.getSnapshot();
    expect(snapshot.recentTrades).toEqual([]);
    expect(snapshot.winRate).toBe(0);
  });

  it('should collect trades from event bus', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    bus.emit('trade.executed', { trade: makeTrade() });
    bus.emit('trade.executed', { trade: makeTrade() });
    const snapshot = observer.getSnapshot();
    expect(snapshot.recentTrades.length).toBe(2);
  });

  it('should track active strategies', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    bus.emit('strategy.started', { name: 'grid-dca' });
    bus.emit('strategy.started', { name: 'polymarket-arb' });
    const snapshot = observer.getSnapshot();
    expect(snapshot.activeStrategies).toContain('grid-dca');
    expect(snapshot.activeStrategies).toContain('polymarket-arb');
  });

  it('should remove stopped strategies', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    bus.emit('strategy.started', { name: 'grid-dca' });
    bus.emit('strategy.stopped', { name: 'grid-dca' });
    const snapshot = observer.getSnapshot();
    expect(snapshot.activeStrategies).not.toContain('grid-dca');
  });

  it('should stop observing and detach listeners', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    observer.stopObserving();
    bus.emit('trade.executed', { trade: makeTrade() });
    expect(observer.getSnapshot().recentTrades.length).toBe(0);
  });

  it('should calculate win rate', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    bus.emit('trade.executed', { trade: makeTrade({ side: 'buy', fillPrice: '100' }) });
    bus.emit('trade.executed', { trade: makeTrade({ side: 'sell', fillPrice: '0' }) });
    const snapshot = observer.getSnapshot();
    // buy side always counts as win, sell with fillPrice=0 doesn't
    expect(snapshot.winRate).toBeGreaterThan(0);
  });

  it('should compute strategy breakdown', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    bus.emit('trade.executed', { trade: makeTrade({ strategy: 'grid-dca' }) });
    bus.emit('trade.executed', { trade: makeTrade({ strategy: 'grid-dca' }) });
    bus.emit('trade.executed', { trade: makeTrade({ strategy: 'polymarket-arb' }) });
    const breakdown = observer.getStrategyBreakdown();
    expect(breakdown.length).toBe(2);
    const grid = breakdown.find(s => s.name === 'grid-dca');
    expect(grid?.tradeCount).toBe(2);
  });

  it('should alert on low win rate', () => {
    const observer = new TradeObserver({ alertThresholds: { minWinRate: 0.9, maxDrawdown: 0.5, maxTradesPerMinute: 100 } });
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    for (let i = 0; i < 15; i++) {
      bus.emit('trade.executed', { trade: makeTrade({ side: 'sell', fillPrice: '0' }) });
    }
    const snapshot = observer.getSnapshot();
    expect(observer.shouldAlert(snapshot)).toBe(true);
  });

  it('should not alert when thresholds are met', () => {
    const observer = new TradeObserver();
    const snapshot = observer.getSnapshot();
    expect(observer.shouldAlert(snapshot)).toBe(false);
  });

  it('should cap trade buffer at 100', () => {
    const observer = new TradeObserver();
    const bus = makeEventBus();
    observer.startObserving(bus as any);
    for (let i = 0; i < 120; i++) {
      bus.emit('trade.executed', { trade: makeTrade({ timestamp: Date.now() }) });
    }
    const snapshot = observer.getSnapshot();
    expect(snapshot.recentTrades.length).toBeLessThanOrEqual(100);
  });
});
