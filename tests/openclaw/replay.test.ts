import { describe, it, expect } from 'vitest';
import { replayDecision, replayBatch, calculateAccuracy, type ReplayResult } from '../../src/openclaw/replay.js';
import type { AiDecision } from '../../src/openclaw/decision-logger.js';

function makeDecision(overrides: Partial<AiDecision> = {}): AiDecision {
  return {
    id: `d-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    type: 'analysis',
    input: 'test input data',
    output: '[replay:analysis] confidence=0.800 input_len=15',
    model: 'llama3.1:8b',
    tokensUsed: 100,
    latencyMs: 50,
    applied: true,
    confidence: 0.8,
    ...overrides,
  };
}

describe('replayDecision', () => {
  it('should return a ReplayResult', async () => {
    const result = await replayDecision(makeDecision(), { price: 50000 });
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('simulatedOutput');
    expect(result).toHaveProperty('simulatedConfidence');
    expect(result).toHaveProperty('match');
  });

  it('should produce deterministic output for same input', async () => {
    const decision = makeDecision({ id: 'det-1' });
    const data = { price: 100 };
    const r1 = await replayDecision(decision, data);
    const r2 = await replayDecision(decision, data);
    expect(r1.simulatedOutput).toBe(r2.simulatedOutput);
    expect(r1.simulatedConfidence).toBe(r2.simulatedConfidence);
  });

  it('should clamp confidence between 0 and 1', async () => {
    const result = await replayDecision(makeDecision({ confidence: 0.99 }), {});
    expect(result.simulatedConfidence).toBeGreaterThanOrEqual(0);
    expect(result.simulatedConfidence).toBeLessThanOrEqual(1);
  });
});

describe('replayBatch', () => {
  it('should replay all decisions', async () => {
    const decisions = [makeDecision(), makeDecision(), makeDecision()];
    const results = await replayBatch(decisions, { price: 50000 });
    expect(results).toHaveLength(3);
  });

  it('should return empty array for empty input', async () => {
    const results = await replayBatch([], {});
    expect(results).toEqual([]);
  });
});

describe('calculateAccuracy', () => {
  it('should return zero for empty results', () => {
    const report = calculateAccuracy([]);
    expect(report.total).toBe(0);
    expect(report.accuracyPct).toBe(0);
  });

  it('should calculate accuracy percentage', () => {
    const results: ReplayResult[] = [
      { decision: makeDecision(), simulatedOutput: 'x', simulatedConfidence: 0.8, match: true },
      { decision: makeDecision(), simulatedOutput: 'y', simulatedConfidence: 0.7, match: false },
      { decision: makeDecision(), simulatedOutput: 'z', simulatedConfidence: 0.9, match: true },
    ];
    const report = calculateAccuracy(results);
    expect(report.total).toBe(3);
    expect(report.matched).toBe(2);
    expect(report.accuracyPct).toBeCloseTo(66.67, 0);
  });

  it('should break down by type', () => {
    const results: ReplayResult[] = [
      { decision: makeDecision({ type: 'analysis' }), simulatedOutput: '', simulatedConfidence: 0.8, match: true },
      { decision: makeDecision({ type: 'tuning' }), simulatedOutput: '', simulatedConfidence: 0.7, match: false },
      { decision: makeDecision({ type: 'analysis' }), simulatedOutput: '', simulatedConfidence: 0.9, match: true },
    ];
    const report = calculateAccuracy(results);
    expect(report.byType['analysis']?.total).toBe(2);
    expect(report.byType['analysis']?.matched).toBe(2);
    expect(report.byType['tuning']?.matched).toBe(0);
  });

  it('should compute average confidence delta', () => {
    const results: ReplayResult[] = [
      { decision: makeDecision({ confidence: 0.8 }), simulatedOutput: '', simulatedConfidence: 0.9, match: true },
      { decision: makeDecision({ confidence: 0.7 }), simulatedOutput: '', simulatedConfidence: 0.6, match: false },
    ];
    const report = calculateAccuracy(results);
    // (0.9-0.8 + 0.6-0.7) / 2 = (0.1 + -0.1) / 2 = 0
    expect(report.avgConfidenceDelta).toBeCloseTo(0, 5);
  });
});
