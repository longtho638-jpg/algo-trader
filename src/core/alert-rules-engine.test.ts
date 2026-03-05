/**
 * Tests for alert-rules-engine: operator evaluation, cooldown, Zod validation, multi-rule.
 */

import { evaluate, AlertRuleSchema, AlertRule } from './alert-rules-engine';

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return AlertRuleSchema.parse({
    id: 'rule-1',
    metric: 'drawdown_pct',
    operator: 'gt',
    threshold: 10,
    action: 'log',
    cooldownMs: 0,
    ...overrides,
  });
}

describe('alert-rules-engine', () => {
  describe('operator evaluation', () => {
    it('gt: triggers when value > threshold', () => {
      const [result] = evaluate(
        [makeRule({ operator: 'gt', threshold: 10 })],
        { drawdown_pct: 11 },
        new Map(),
      );
      expect(result.triggered).toBe(true);
    });

    it('gt: does not trigger when value === threshold', () => {
      const [result] = evaluate(
        [makeRule({ operator: 'gt', threshold: 10 })],
        { drawdown_pct: 10 },
        new Map(),
      );
      expect(result.triggered).toBe(false);
    });

    it('lt: triggers when value < threshold', () => {
      const [result] = evaluate(
        [makeRule({ operator: 'lt', threshold: 5, metric: 'win_rate' })],
        { win_rate: 4 },
        new Map(),
      );
      expect(result.triggered).toBe(true);
    });

    it('gte: triggers when value === threshold', () => {
      const [result] = evaluate(
        [makeRule({ operator: 'gte', threshold: 10 })],
        { drawdown_pct: 10 },
        new Map(),
      );
      expect(result.triggered).toBe(true);
    });

    it('lte: triggers when value < threshold', () => {
      const [result] = evaluate(
        [makeRule({ operator: 'lte', threshold: 3, metric: 'open_positions' })],
        { open_positions: 2 },
        new Map(),
      );
      expect(result.triggered).toBe(true);
    });

    it('returns value=0 when metric absent from snapshot', () => {
      const [result] = evaluate(
        [makeRule({ operator: 'lt', threshold: 1 })],
        {},
        new Map(),
      );
      expect(result.value).toBe(0);
      expect(result.triggered).toBe(true); // 0 < 1
    });
  });

  describe('cooldown', () => {
    it('does not re-trigger within cooldown window', () => {
      const rule = makeRule({ cooldownMs: 60_000 });
      const cooldownMap = new Map<string, number>();

      const [first] = evaluate([rule], { drawdown_pct: 15 }, cooldownMap);
      expect(first.triggered).toBe(true);

      const [second] = evaluate([rule], { drawdown_pct: 15 }, cooldownMap);
      expect(second.triggered).toBe(false);
    });

    it('re-triggers after cooldown expires', async () => {
      const rule = makeRule({ cooldownMs: 30 });
      const cooldownMap = new Map<string, number>();

      const [first] = evaluate([rule], { drawdown_pct: 15 }, cooldownMap);
      expect(first.triggered).toBe(true);

      await new Promise((r) => setTimeout(r, 50));

      const [second] = evaluate([rule], { drawdown_pct: 15 }, cooldownMap);
      expect(second.triggered).toBe(true);
    });
  });

  describe('Zod schema validation', () => {
    it('accepts a valid rule', () => {
      expect(() => makeRule()).not.toThrow();
    });

    it('rejects missing id', () => {
      expect(() => AlertRuleSchema.parse({ metric: 'drawdown_pct', operator: 'gt', threshold: 5, action: 'log', cooldownMs: 0 })).toThrow();
    });

    it('rejects unknown metric', () => {
      expect(() => makeRule({ metric: 'unknown_metric' as 'drawdown_pct' })).toThrow();
    });

    it('rejects unknown operator', () => {
      expect(() => makeRule({ operator: 'eq' as 'gt' })).toThrow();
    });

    it('rejects negative cooldownMs', () => {
      expect(() => makeRule({ cooldownMs: -1 })).toThrow();
    });
  });

  describe('multiple rules evaluated together', () => {
    it('returns one AlertResult per rule', () => {
      const rules = [
        makeRule({ id: 'r1', metric: 'drawdown_pct', operator: 'gt', threshold: 5 }),
        makeRule({ id: 'r2', metric: 'daily_loss_usd', operator: 'gt', threshold: 100, action: 'webhook' }),
        makeRule({ id: 'r3', metric: 'open_positions', operator: 'lte', threshold: 0, action: 'ws_broadcast' }),
      ];
      const metrics = { drawdown_pct: 10, daily_loss_usd: 50, open_positions: 1 };
      const results = evaluate(rules, metrics, new Map());

      expect(results).toHaveLength(3);
      expect(results[0].triggered).toBe(true);   // 10 > 5
      expect(results[1].triggered).toBe(false);  // 50 not > 100
      expect(results[2].triggered).toBe(false);  // 1 not <= 0
      expect(results[1].action).toBe('webhook');
    });
  });
});
