import { describe, it, expect, vi } from 'vitest';
import { createPolymarketArbTick, type PolymarketArbDeps } from '../../src/strategies/polymarket-arb-strategy.js';

function makeDeps(overrides: Partial<PolymarketArbDeps> = {}): PolymarketArbDeps {
  return {
    scanner: {
      scan: vi.fn().mockResolvedValue({
        activeMarkets: 10,
        opportunities: [
          {
            conditionId: 'cond-1',
            score: 0.1,
            priceSumDelta: -0.05,
            yesTokenId: 'yes-1',
            noTokenId: 'no-1',
            yesMidPrice: 0.45,
            noMidPrice: 0.55,
          },
        ],
      }),
    } as any,
    orderManager: {
      placeOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as any,
    eventBus: { emit: vi.fn() } as any,
    ...overrides,
  };
}

describe('createPolymarketArbTick', () => {
  it('should return a function', () => {
    const tick = createPolymarketArbTick(makeDeps());
    expect(typeof tick).toBe('function');
  });

  it('should place orders for qualifying opportunities', async () => {
    const deps = makeDeps();
    const tick = createPolymarketArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('should emit trade.executed for placed orders', async () => {
    const deps = makeDeps();
    const tick = createPolymarketArbTick(deps);
    await tick();
    expect(deps.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({
      trade: expect.objectContaining({ strategy: 'polymarket-arb' }),
    }));
  });

  it('should skip opportunities below score threshold', async () => {
    const deps = makeDeps({ scoreThreshold: 0.5 });
    const tick = createPolymarketArbTick(deps);
    await tick();
    // Score is 0.1, threshold is 0.5 → no orders
    expect(deps.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('should buy NO token when priceSumDelta > 0', async () => {
    const deps = makeDeps({
      scanner: {
        scan: vi.fn().mockResolvedValue({
          activeMarkets: 5,
          opportunities: [{
            conditionId: 'cond-2', score: 0.2, priceSumDelta: 0.03,
            yesTokenId: 'yes-2', noTokenId: 'no-2', yesMidPrice: 0.6, noMidPrice: 0.4,
          }],
        }),
      } as any,
    });
    const tick = createPolymarketArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 'no-2' }));
  });

  it('should use Kelly sizer when available', async () => {
    const deps = makeDeps({
      kellySizer: { getSize: vi.fn().mockReturnValue({ size: 75 }) } as any,
    });
    const tick = createPolymarketArbTick(deps);
    await tick();
    expect(deps.orderManager.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ size: '75' }));
  });

  it('should not throw on no opportunities', async () => {
    const deps = makeDeps({
      scanner: { scan: vi.fn().mockResolvedValue({ activeMarkets: 0, opportunities: [] }) } as any,
    });
    const tick = createPolymarketArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });

  it('should handle scanner errors gracefully', async () => {
    const deps = makeDeps({
      scanner: { scan: vi.fn().mockRejectedValue(new Error('API down')) } as any,
    });
    const tick = createPolymarketArbTick(deps);
    await expect(tick()).resolves.toBeUndefined();
  });
});
