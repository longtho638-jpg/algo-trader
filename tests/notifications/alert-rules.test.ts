import { describe, it, expect } from 'vitest';
import { AlertManager, builtInRules, type AlertData } from '../../src/notifications/alert-rules.js';
import type { TradeResult, PnlSnapshot } from '../../src/core/types.js';

const makeTrade = (overrides?: Partial<TradeResult>): TradeResult => ({
  orderId: 'order-1',
  marketId: 'BTC-USD',
  side: 'buy',
  fillPrice: '50000',
  fillSize: '0.1',
  fees: '0.5',
  timestamp: Date.now(),
  strategy: 'grid-trading',
  ...overrides,
});

const makePnl = (overrides?: Partial<PnlSnapshot>): PnlSnapshot => ({
  timestamp: Date.now(),
  equity: '10000',
  peakEquity: '12000',
  drawdown: 0.05,
  realizedPnl: '500',
  unrealizedPnl: '100',
  tradeCount: 42,
  winCount: 30,
  ...overrides,
});

describe('AlertManager', () => {
  it('should register built-in rules by default', () => {
    const mgr = new AlertManager();
    const names = mgr.getRuleNames();
    expect(names).toContain('tradeExecuted');
    expect(names).toContain('drawdownThreshold');
    expect(names).toContain('errorOccurred');
    expect(names).toContain('dailySummary');
  });

  it('should skip built-in rules when registerDefaults=false', () => {
    const mgr = new AlertManager(false);
    expect(mgr.getRuleNames()).toEqual([]);
  });

  it('tradeExecuted always fires', () => {
    const mgr = new AlertManager();
    const trade = makeTrade();
    expect(mgr.shouldAlert('tradeExecuted', trade)).toBe(true);
    // No cooldown — fires again immediately
    expect(mgr.shouldAlert('tradeExecuted', trade)).toBe(true);
  });

  it('tradeExecuted message includes trade details', () => {
    const mgr = new AlertManager();
    const trade = makeTrade({ side: 'sell', fillSize: '2.5', fillPrice: '60000', marketId: 'ETH-USD' });
    const msg = mgr.getMessage('tradeExecuted', trade);
    expect(msg).toContain('SELL');
    expect(msg).toContain('2.5');
    expect(msg).toContain('60000');
    expect(msg).toContain('ETH-USD');
  });

  it('drawdownThreshold fires when drawdown >= 15%', () => {
    const mgr = new AlertManager();
    expect(mgr.shouldAlert('drawdownThreshold', makePnl({ drawdown: 0.10 }))).toBe(false);
    expect(mgr.shouldAlert('drawdownThreshold', makePnl({ drawdown: 0.15 }))).toBe(true);
    expect(mgr.shouldAlert('drawdownThreshold', makePnl({ drawdown: 0.25 }))).toBe(false); // cooldown
  });

  it('drawdownThreshold message includes percentage', () => {
    const mgr = new AlertManager();
    const msg = mgr.getMessage('drawdownThreshold', makePnl({ drawdown: 0.20 }));
    expect(msg).toContain('20.00%');
  });

  it('errorOccurred fires with string data', () => {
    const mgr = new AlertManager();
    expect(mgr.shouldAlert('errorOccurred', 'Connection timeout')).toBe(true);
    const msg = mgr.getMessage('errorOccurred', 'Connection timeout');
    expect(msg).toContain('Connection timeout');
  });

  it('errorOccurred respects 1-minute cooldown', () => {
    const mgr = new AlertManager();
    expect(mgr.shouldAlert('errorOccurred', 'err1')).toBe(true);
    expect(mgr.shouldAlert('errorOccurred', 'err2')).toBe(false); // within 1min cooldown
  });

  it('dailySummary message includes equity and trade count', () => {
    const mgr = new AlertManager();
    const pnl = makePnl({ equity: '25000', realizedPnl: '1500', tradeCount: 100 });
    const msg = mgr.getMessage('dailySummary', pnl);
    expect(msg).toContain('25000');
    expect(msg).toContain('1500');
    expect(msg).toContain('100');
  });

  it('should return false for unknown rule name', () => {
    const mgr = new AlertManager();
    expect(mgr.shouldAlert('nonexistent', 'data')).toBe(false);
  });

  it('getMessage returns null for unknown rule', () => {
    const mgr = new AlertManager();
    expect(mgr.getMessage('nonexistent', 'data')).toBeNull();
  });

  it('should register custom rules', () => {
    const mgr = new AlertManager(false);
    mgr.register({
      name: 'customRule',
      condition: (data: AlertData) => (data as number) > 100,
      message: (data: AlertData) => `Value exceeded: ${data as number}`,
      cooldownMs: 0,
    });
    expect(mgr.shouldAlert('customRule', 150)).toBe(true);
    expect(mgr.shouldAlert('customRule', 50)).toBe(false);
    expect(mgr.getMessage('customRule', 200)).toBe('Value exceeded: 200');
  });

  it('builtInRules has expected length', () => {
    expect(builtInRules.length).toBe(4);
  });
});
