import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrategyOrchestrator } from '../../src/strategies/strategy-orchestrator.js';
import { EventBus } from '../../src/events/event-bus.js';

describe('StrategyOrchestrator', () => {
  let orchestrator: StrategyOrchestrator;
  let eventBus: EventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new EventBus();
    orchestrator = new StrategyOrchestrator(eventBus);
  });

  afterEach(() => {
    vi.useRealTimers();
    orchestrator.stopAll();
  });

  // --- Register Tests ---

  it('should register a strategy', () => {
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1',
      name: 'Test Strategy',
      type: 'polymarket-arb' as const,
      enabled: true,
      params: {},
      intervalMs: 1000,
    };

    orchestrator.register(config, tickFn);
    const status = orchestrator.getStrategyStatus('strat-1');

    expect(status).toBeDefined();
    expect(status?.id).toBe('strat-1');
    expect(status?.status).toBe('stopped');
    expect(status?.tickCount).toBe(0);
  });

  // --- Start/Stop Tests ---

  it('should start a strategy and begin interval ticking', async () => {
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1',
      name: 'Test',
      type: 'polymarket-arb' as const,
      enabled: true,
      params: {},
      intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    const started = orchestrator.start('strat-1');
    expect(started).toBe(true);

    const beforeStatus = orchestrator.getStrategyStatus('strat-1');
    expect(beforeStatus?.status).toBe('running');

    // Advance timers by 250ms = 2-3 ticks
    await vi.advanceTimersByTimeAsync(250);

    const afterStatus = orchestrator.getStrategyStatus('strat-1');
    expect(afterStatus?.tickCount).toBeGreaterThanOrEqual(2);
    expect(tickFn).toHaveBeenCalledTimes(afterStatus?.tickCount ?? 0);
  });

  it('should return false when starting an already-running strategy', () => {
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1',
      name: 'Test',
      type: 'polymarket-arb' as const,
      enabled: true,
      params: {},
      intervalMs: 1000,
    };

    orchestrator.register(config, tickFn);
    const first = orchestrator.start('strat-1');
    const second = orchestrator.start('strat-1');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('should stop a running strategy', () => {
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1',
      name: 'Test',
      type: 'polymarket-arb' as const,
      enabled: true,
      params: {},
      intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    const stopped = orchestrator.stop('strat-1');
    expect(stopped).toBe(true);

    const status = orchestrator.getStrategyStatus('strat-1');
    expect(status?.status).toBe('stopped');
  });

  it('should return false when stopping an already-stopped strategy', () => {
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1',
      name: 'Test',
      type: 'polymarket-arb' as const,
      enabled: true,
      params: {},
      intervalMs: 1000,
    };

    orchestrator.register(config, tickFn);
    const stopped = orchestrator.stop('strat-1');
    expect(stopped).toBe(false);
  });

  // --- Batch Operations ---

  it('should startAll() only enabled strategies', async () => {
    const tick1 = vi.fn().mockResolvedValue(undefined);
    const tick2 = vi.fn().mockResolvedValue(undefined);

    orchestrator.register({
      id: 'strat-1', name: 'Strat 1', type: 'polymarket-arb', enabled: true, params: {}, intervalMs: 100,
    }, tick1);
    orchestrator.register({
      id: 'strat-2', name: 'Strat 2', type: 'polymarket-arb', enabled: false, params: {}, intervalMs: 100,
    }, tick2);

    orchestrator.startAll();
    const status1 = orchestrator.getStrategyStatus('strat-1');
    const status2 = orchestrator.getStrategyStatus('strat-2');

    expect(status1?.status).toBe('running');
    expect(status2?.status).toBe('stopped');
  });

  it('should stopAll() running strategies', async () => {
    const tick1 = vi.fn().mockResolvedValue(undefined);
    const tick2 = vi.fn().mockResolvedValue(undefined);

    orchestrator.register({
      id: 'strat-1', name: 'Strat 1', type: 'polymarket-arb', enabled: true, params: {}, intervalMs: 100,
    }, tick1);
    orchestrator.register({
      id: 'strat-2', name: 'Strat 2', type: 'polymarket-arb', enabled: true, params: {}, intervalMs: 100,
    }, tick2);

    orchestrator.startAll();
    orchestrator.stopAll();

    const status1 = orchestrator.getStrategyStatus('strat-1');
    const status2 = orchestrator.getStrategyStatus('strat-2');

    expect(status1?.status).toBe('stopped');
    expect(status2?.status).toBe('stopped');
  });

  // --- Status Tests ---

  it('should return correct status array', () => {
    const tick1 = vi.fn().mockResolvedValue(undefined);
    const tick2 = vi.fn().mockResolvedValue(undefined);

    orchestrator.register({
      id: 'strat-1', name: 'Strat 1', type: 'polymarket-arb', enabled: true, params: {}, intervalMs: 100,
    }, tick1);
    orchestrator.register({
      id: 'strat-2', name: 'Strat 2', type: 'polymarket-arb', enabled: true, params: {}, intervalMs: 100,
    }, tick2);

    const statuses = orchestrator.getStatus();
    expect(statuses).toHaveLength(2);
    expect(statuses[0].id).toBe('strat-1');
    expect(statuses[1].id).toBe('strat-2');
  });

  // --- Health Check ---

  it('should return true from isHealthy() when no errors', async () => {
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1', name: 'Test', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');
    await vi.advanceTimersByTimeAsync(250);

    expect(orchestrator.isHealthy()).toBe(true);
  });

  it('should return false from isHealthy() when strategy in error state', async () => {
    const tickFn = vi.fn().mockRejectedValue(new Error('Tick failed'));
    const config = {
      id: 'strat-1', name: 'Test', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    // Trigger enough errors to hit auto-stop threshold (10 errors)
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(orchestrator.isHealthy()).toBe(false);
  });

  // --- Error Handling ---

  it('should increment error count on tick failure', async () => {
    const tickFn = vi.fn().mockRejectedValue(new Error('Tick error'));
    const config = {
      id: 'strat-1', name: 'Test', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    // Trigger 5 tick failures
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    const status = orchestrator.getStrategyStatus('strat-1');
    expect(status?.errorCount).toBe(5);
    expect(status?.lastError).toBe('Tick error');
  });

  it('should auto-stop strategy after 10 consecutive errors', async () => {
    const tickFn = vi.fn().mockRejectedValue(new Error('Persistent failure'));
    const config = {
      id: 'strat-1', name: 'Test', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    // Trigger 10 errors (should trigger auto-stop)
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    const status = orchestrator.getStrategyStatus('strat-1');
    expect(status?.status).toBe('error');
    expect(status?.errorCount).toBe(10);
  });

  it('should reset error count on successful tick', async () => {
    let shouldFail = true;
    const tickFn = vi.fn(async () => {
      if (shouldFail) throw new Error('Failed');
    });
    const config = {
      id: 'strat-1', name: 'Test', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 100,
    };

    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    // Trigger 3 failures
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    let status = orchestrator.getStrategyStatus('strat-1');
    expect(status?.errorCount).toBe(3);

    // Now succeed
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(100);

    status = orchestrator.getStrategyStatus('strat-1');
    expect(status?.errorCount).toBe(0);
  });

  // --- Event Emission ---

  it('should emit strategy.started event', () => {
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const tickFn = vi.fn().mockResolvedValue(undefined);
    const config = {
      id: 'strat-1', name: 'TestStrat', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 1000,
    };

    orchestrator = new StrategyOrchestrator(eventBus);
    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    expect(emitSpy).toHaveBeenCalledWith('strategy.started', expect.objectContaining({ name: 'TestStrat' }));
  });

  it('should emit strategy.error event', async () => {
    const emitSpy = vi.spyOn(eventBus, 'emit');
    const tickFn = vi.fn().mockRejectedValue(new Error('Test error'));
    const config = {
      id: 'strat-1', name: 'TestStrat', type: 'polymarket-arb' as const, enabled: true, params: {}, intervalMs: 100,
    };

    orchestrator = new StrategyOrchestrator(eventBus);
    orchestrator.register(config, tickFn);
    orchestrator.start('strat-1');

    await vi.advanceTimersByTimeAsync(100);

    expect(emitSpy).toHaveBeenCalledWith('strategy.error', expect.objectContaining({ name: 'TestStrat', error: 'Test error' }));
  });
});
