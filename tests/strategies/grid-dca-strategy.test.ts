import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGridDcaTick, type GridDcaDeps, type GridParams } from '../../src/strategies/grid-dca-strategy.js';

function makeDeps(overrides: Partial<GridDcaDeps> = {}): GridDcaDeps {
  const params: GridParams = {
    exchange: 'binance',
    symbol: 'BTC/USDT',
    gridSpacing: 0.01,
    numLevels: 3,
    orderSize: 0.1,
  };
  return {
    executor: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'ord-1', price: 50000, size: 0.1 }),
    } as any,
    client: {
      getTicker: vi.fn().mockResolvedValue({ last: '50000' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    params,
    ...overrides,
  };
}

describe('createGridDcaTick', () => {
  it('should return a function', () => {
    const tick = createGridDcaTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('should place buy and sell orders for each level', async () => {
    const deps = makeDeps();
    const tick = createGridDcaTick(deps);
    await tick();

    // 3 levels × 2 sides = 6 orders
    expect(deps.executor.placeOrder).toHaveBeenCalledTimes(6);
  });

  it('should emit trade.executed for each order', async () => {
    const deps = makeDeps();
    const tick = createGridDcaTick(deps);
    await tick();
    expect(deps.eventBus.emit).toHaveBeenCalledTimes(6);
    expect(deps.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({ trade: expect.any(Object) }));
  });

  it('should not duplicate orders on second tick', async () => {
    const deps = makeDeps();
    const tick = createGridDcaTick(deps);
    await tick();
    await tick();
    // Second tick should not place same grid orders again (gridState dedup)
    expect(deps.executor.placeOrder).toHaveBeenCalledTimes(6);
  });

  it('should skip tick when price is 0', async () => {
    const deps = makeDeps({
      client: { getTicker: vi.fn().mockResolvedValue({ last: '0' }) } as any,
    });
    const tick = createGridDcaTick(deps);
    await tick();
    expect(deps.executor.placeOrder).not.toHaveBeenCalled();
  });

  it('should handle executor errors gracefully', async () => {
    const deps = makeDeps({
      executor: { placeOrder: vi.fn().mockRejectedValue(new Error('network error')) } as any,
    });
    const tick = createGridDcaTick(deps);
    // Should not throw
    await expect(tick()).resolves.toBeUndefined();
  });

  it('should handle client errors gracefully', async () => {
    const deps = makeDeps({
      client: { getTicker: vi.fn().mockRejectedValue(new Error('timeout')) } as any,
    });
    const tick = createGridDcaTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });
});
