import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wireStrategies } from '../../src/wiring/strategy-wiring.js';
import { EventBus } from '../../src/events/event-bus.js';
import { StrategyOrchestrator } from '../../src/strategies/strategy-orchestrator.js';

describe('wireStrategies', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    vi.clearAllMocks();
  });

  it('returns a StrategyOrchestrator instance', () => {
    const result = wireStrategies({ eventBus });
    expect(result).toBeInstanceOf(StrategyOrchestrator);
  });

  it('registers polymarket-arb strategy when scanner + orderManager deps provided', () => {
    const mockScanner = { scanMarkets: vi.fn() };
    const mockOrderManager = { createOrder: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      scanner: mockScanner,
      orderManager: mockOrderManager,
    });

    const status = orc.getStatus();
    const polymarketArb = status.find(s => s.id === 'polymarket-arb');
    expect(polymarketArb).toBeDefined();
    expect(polymarketArb?.name).toBe('Polymarket Arbitrage');
  });

  it('skips polymarket-arb strategy without scanner', () => {
    const mockOrderManager = { createOrder: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      orderManager: mockOrderManager,
    });

    const status = orc.getStatus();
    const polymarketArb = status.find(s => s.id === 'polymarket-arb');
    expect(polymarketArb).toBeUndefined();
  });

  it('skips polymarket-arb strategy without orderManager', () => {
    const mockScanner = { scanMarkets: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      scanner: mockScanner,
    });

    const status = orc.getStatus();
    const polymarketArb = status.find(s => s.id === 'polymarket-arb');
    expect(polymarketArb).toBeUndefined();
  });

  it('registers grid-dca strategy when cexExecutor + cexClient deps provided', () => {
    const mockExecutor = { executeOrder: vi.fn() };
    const mockClient = { getBalance: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      cexExecutor: mockExecutor,
      cexClient: mockClient,
    });

    const status = orc.getStatus();
    const gridDca = status.find(s => s.id === 'grid-dca');
    expect(gridDca).toBeDefined();
    expect(gridDca?.name).toBe('Grid / DCA');
  });

  it('skips grid-dca strategy without cexExecutor', () => {
    const mockClient = { getBalance: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      cexClient: mockClient,
    });

    const status = orc.getStatus();
    const gridDca = status.find(s => s.id === 'grid-dca');
    expect(gridDca).toBeUndefined();
  });

  it('skips grid-dca strategy without cexClient', () => {
    const mockExecutor = { executeOrder: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      cexExecutor: mockExecutor,
    });

    const status = orc.getStatus();
    const gridDca = status.find(s => s.id === 'grid-dca');
    expect(gridDca).toBeUndefined();
  });

  it('registers both strategies when all deps provided', () => {
    const mockScanner = { scanMarkets: vi.fn() };
    const mockOrderManager = { createOrder: vi.fn() };
    const mockExecutor = { executeOrder: vi.fn() };
    const mockClient = { getBalance: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      scanner: mockScanner,
      orderManager: mockOrderManager,
      cexExecutor: mockExecutor,
      cexClient: mockClient,
    });

    const status = orc.getStatus();
    expect(status).toHaveLength(2);
    expect(status.find(s => s.id === 'polymarket-arb')).toBeDefined();
    expect(status.find(s => s.id === 'grid-dca')).toBeDefined();
  });

  it('registers polymarket-arb with enabled=true', () => {
    const mockScanner = { scanMarkets: vi.fn() };
    const mockOrderManager = { createOrder: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      scanner: mockScanner,
      orderManager: mockOrderManager,
    });

    const status = orc.getStatus();
    const polymarketArb = status.find(s => s.id === 'polymarket-arb');
    expect(polymarketArb?.status).toBe('stopped'); // not running yet, but enabled
  });

  it('registers grid-dca with enabled=false', () => {
    const mockExecutor = { executeOrder: vi.fn() };
    const mockClient = { getBalance: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      cexExecutor: mockExecutor,
      cexClient: mockClient,
    });

    const status = orc.getStatus();
    const gridDca = status.find(s => s.id === 'grid-dca');
    expect(gridDca?.status).toBe('stopped');
  });

  it('startAll() starts only enabled strategies', async () => {
    vi.useFakeTimers();

    const mockScanner = { scanMarkets: vi.fn() };
    const mockOrderManager = { createOrder: vi.fn() };
    const mockExecutor = { executeOrder: vi.fn() };
    const mockClient = { getBalance: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      scanner: mockScanner,
      orderManager: mockOrderManager,
      cexExecutor: mockExecutor,
      cexClient: mockClient,
    });

    orc.startAll();

    const status = orc.getStatus();
    const polymarketArb = status.find(s => s.id === 'polymarket-arb');
    const gridDca = status.find(s => s.id === 'grid-dca');

    expect(polymarketArb?.status).toBe('running');
    expect(gridDca?.status).toBe('stopped'); // disabled, so not started

    vi.useRealTimers();
    orc.stopAll();
  });

  it('getStatus() returns correct structure', () => {
    const mockScanner = { scanMarkets: vi.fn() };
    const mockOrderManager = { createOrder: vi.fn() };

    const orc = wireStrategies({
      eventBus,
      scanner: mockScanner,
      orderManager: mockOrderManager,
    });

    const status = orc.getStatus();
    const strategyStatus = status[0];

    expect(strategyStatus).toHaveProperty('id');
    expect(strategyStatus).toHaveProperty('name');
    expect(strategyStatus).toHaveProperty('status');
    expect(strategyStatus).toHaveProperty('lastTick');
    expect(strategyStatus).toHaveProperty('tickCount');
    expect(strategyStatus).toHaveProperty('errorCount');
    expect(strategyStatus).toHaveProperty('lastError');
  });
});
