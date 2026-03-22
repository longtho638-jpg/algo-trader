// Tests for wireOpenClawAi — verifies AI module hooks are wired correctly
// and that the function is opt-in via OPENCLAW_AI_TRADING env var

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted — must be before imports of the modules under test)
// ---------------------------------------------------------------------------

vi.mock('../../src/openclaw/ai-strategy-selector.js', () => ({
  selectStrategies: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/openclaw/ai-risk-adjuster.js', () => ({
  adjustRisk: vi.fn().mockResolvedValue({
    maxPositionSize: 0.1,
    stopLossPercent: 0.02,
    takeProfitPercent: 0.04,
    maxLeverage: 1,
    confidence: 1.0,
    reasoning: 'mock',
  }),
}));

vi.mock('../../src/openclaw/ai-trade-reviewer.js', () => ({
  reviewTrade: vi.fn().mockResolvedValue({
    score: 75,
    insights: ['mock insight'],
    suggestions: ['mock suggestion'],
    confidence: 0.9,
  }),
}));

vi.mock('../../src/core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after vi.mock() so mocked modules are in scope
// ---------------------------------------------------------------------------

import { wireOpenClawAi } from '../../src/wiring/openclaw-wiring.js';
import { selectStrategies } from '../../src/openclaw/ai-strategy-selector.js';
import { adjustRisk } from '../../src/openclaw/ai-risk-adjuster.js';
import { reviewTrade } from '../../src/openclaw/ai-trade-reviewer.js';
import type { StrategyOrchestrator, RiskManagerHook } from '../../src/wiring/openclaw-wiring.js';
import type { AiRouter } from '../../src/openclaw/ai-router.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRouter(): AiRouter {
  return { chat: vi.fn() } as unknown as AiRouter;
}

function makeOrchestrator(): StrategyOrchestrator {
  return {};
}

function makeRiskManager(): RiskManagerHook {
  return {};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wireOpenClawAi', () => {
  const originalEnv = process.env.OPENCLAW_AI_TRADING;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENCLAW_AI_TRADING;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OPENCLAW_AI_TRADING;
    } else {
      process.env.OPENCLAW_AI_TRADING = originalEnv;
    }
  });

  // -------------------------------------------------------------------------
  // Default disabled behavior
  // -------------------------------------------------------------------------

  describe('disabled by default', () => {
    it('does not attach hooks when OPENCLAW_AI_TRADING is unset', () => {
      const orchestrator = makeOrchestrator();
      const riskManager = makeRiskManager();

      wireOpenClawAi(makeRouter(), orchestrator, riskManager);

      expect(orchestrator.onStrategySelect).toBeUndefined();
      expect(riskManager.onRiskAdjust).toBeUndefined();
      expect(riskManager.onTradeComplete).toBeUndefined();
    });

    it('does not attach hooks when OPENCLAW_AI_TRADING=false', () => {
      process.env.OPENCLAW_AI_TRADING = 'false';
      const orchestrator = makeOrchestrator();
      const riskManager = makeRiskManager();

      wireOpenClawAi(makeRouter(), orchestrator, riskManager);

      expect(orchestrator.onStrategySelect).toBeUndefined();
      expect(riskManager.onRiskAdjust).toBeUndefined();
      expect(riskManager.onTradeComplete).toBeUndefined();
    });

    it('returns without error when disabled', () => {
      expect(() => {
        wireOpenClawAi(makeRouter(), makeOrchestrator(), makeRiskManager());
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Enabled behavior
  // -------------------------------------------------------------------------

  describe('enabled via OPENCLAW_AI_TRADING=true', () => {
    beforeEach(() => {
      process.env.OPENCLAW_AI_TRADING = 'true';
    });

    it('attaches onStrategySelect hook to orchestrator', () => {
      const orchestrator = makeOrchestrator();

      wireOpenClawAi(makeRouter(), orchestrator, makeRiskManager());

      expect(typeof orchestrator.onStrategySelect).toBe('function');
    });

    it('attaches onRiskAdjust hook to riskManager', () => {
      const riskManager = makeRiskManager();

      wireOpenClawAi(makeRouter(), makeOrchestrator(), riskManager);

      expect(typeof riskManager.onRiskAdjust).toBe('function');
    });

    it('attaches onTradeComplete hook to riskManager', () => {
      const riskManager = makeRiskManager();

      wireOpenClawAi(makeRouter(), makeOrchestrator(), riskManager);

      expect(typeof riskManager.onTradeComplete).toBe('function');
    });

    it('onStrategySelect calls selectStrategies with router', async () => {
      const router = makeRouter();
      const orchestrator = makeOrchestrator();
      wireOpenClawAi(router, orchestrator, makeRiskManager());

      const conditions = { volatility: 0.3, trend: 'bullish' as const, volumeRatio: 1.2 };
      const strategies = [{ name: 'grid-trading', enabled: true } as any];

      await orchestrator.onStrategySelect!(conditions, strategies);

      expect(selectStrategies).toHaveBeenCalledWith(conditions, strategies, router);
    });

    it('onRiskAdjust calls adjustRisk with router', async () => {
      const router = makeRouter();
      const riskManager = makeRiskManager();
      wireOpenClawAi(router, makeOrchestrator(), riskManager);

      const baseRisk = {
        maxPositionSize: 0.1,
        stopLossPercent: 0.02,
        takeProfitPercent: 0.04,
        maxLeverage: 2,
      };

      await riskManager.onRiskAdjust!(baseRisk, 'neutral', 0.005);

      expect(adjustRisk).toHaveBeenCalledWith(baseRisk, 'neutral', 0.005, router);
    });

    it('onTradeComplete calls reviewTrade with router', async () => {
      const router = makeRouter();
      const riskManager = makeRiskManager();
      wireOpenClawAi(router, makeOrchestrator(), riskManager);

      const trade = {
        id: 'trade-001',
        market: 'BTC-USD',
        side: 'buy' as const,
        strategy: 'grid-trading' as const,
        entryPrice: 50000,
        exitPrice: 51000,
        size: 0.1,
        pnl: 100,
        durationMs: 60000,
        timestamp: Date.now(),
      };

      await riskManager.onTradeComplete!(trade);

      expect(reviewTrade).toHaveBeenCalledWith(trade, router);
    });

    it('returns results from selectStrategies unchanged', async () => {
      const mockResult = [{ strategy: { name: 'grid-trading' } as any, confidence: 0.9, action: 'activate' as const, reasoning: 'ok' }];
      vi.mocked(selectStrategies).mockResolvedValueOnce(mockResult);

      const orchestrator = makeOrchestrator();
      wireOpenClawAi(makeRouter(), orchestrator, makeRiskManager());

      const result = await orchestrator.onStrategySelect!(
        { volatility: 0.2, trend: 'sideways', volumeRatio: 1.0 },
        [],
      );

      expect(result).toBe(mockResult);
    });

    it('returns results from adjustRisk unchanged', async () => {
      const mockResult = {
        maxPositionSize: 0.05,
        stopLossPercent: 0.01,
        takeProfitPercent: 0.02,
        maxLeverage: 1,
        confidence: 0.8,
        reasoning: 'reduced risk',
      };
      vi.mocked(adjustRisk).mockResolvedValueOnce(mockResult);

      const riskManager = makeRiskManager();
      wireOpenClawAi(makeRouter(), makeOrchestrator(), riskManager);

      const result = await riskManager.onRiskAdjust!(
        { maxPositionSize: 0.1, stopLossPercent: 0.02, takeProfitPercent: 0.04, maxLeverage: 2 },
        'bearish',
        -0.01,
      );

      expect(result).toBe(mockResult);
    });

    it('does not throw when called multiple times', () => {
      process.env.OPENCLAW_AI_TRADING = 'true';

      expect(() => {
        wireOpenClawAi(makeRouter(), makeOrchestrator(), makeRiskManager());
        wireOpenClawAi(makeRouter(), makeOrchestrator(), makeRiskManager());
      }).not.toThrow();
    });
  });
});
