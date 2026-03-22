import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DecisionStore, type DecisionRow } from '../../src/openclaw/decision-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let store: DecisionStore;
let tmpDir: string;

function makeRow(overrides: Partial<DecisionRow> = {}): DecisionRow {
  return {
    id: `d-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type: 'analysis',
    input_summary: 'test input',
    output_summary: 'test output',
    model: 'llama3.1:8b',
    tokens: 100,
    latency_ms: 50,
    applied: 1,
    confidence: 0.85,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ds-test-'));
  store = new DecisionStore(join(tmpDir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('DecisionStore', () => {
  it('should save and query a decision', () => {
    const row = makeRow({ id: 'save-1' });
    store.saveDecision(row);
    const results = store.queryDecisions({ limit: 10 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('save-1');
  });

  it('should upsert on duplicate id', () => {
    store.saveDecision(makeRow({ id: 'dup-1', confidence: 0.5 }));
    store.saveDecision(makeRow({ id: 'dup-1', confidence: 0.9 }));
    const results = store.queryDecisions();
    expect(results.length).toBe(1);
    expect(results[0].confidence).toBe(0.9);
  });

  it('should filter by type', () => {
    store.saveDecision(makeRow({ type: 'analysis' }));
    store.saveDecision(makeRow({ type: 'tuning' }));
    store.saveDecision(makeRow({ type: 'analysis' }));
    const results = store.queryDecisions({ type: 'tuning' });
    expect(results.length).toBe(1);
  });

  it('should filter by model', () => {
    store.saveDecision(makeRow({ model: 'llama3.1:8b' }));
    store.saveDecision(makeRow({ model: 'deepseek-r1:32b' }));
    const results = store.queryDecisions({ model: 'deepseek-r1:32b' });
    expect(results.length).toBe(1);
  });

  it('should filter by timestamp range', () => {
    store.saveDecision(makeRow({ timestamp: 1000 }));
    store.saveDecision(makeRow({ timestamp: 2000 }));
    store.saveDecision(makeRow({ timestamp: 3000 }));
    const results = store.queryDecisions({ fromTs: 1500, toTs: 2500 });
    expect(results.length).toBe(1);
    expect(results[0].timestamp).toBe(2000);
  });

  it('should filter by applied flag', () => {
    store.saveDecision(makeRow({ applied: 1 }));
    store.saveDecision(makeRow({ applied: 0 }));
    const applied = store.queryDecisions({ applied: true });
    expect(applied.length).toBe(1);
    expect(applied[0].applied).toBe(1);
  });

  it('should get decision stats', () => {
    store.saveDecision(makeRow({ type: 'analysis', confidence: 0.8, latency_ms: 100, timestamp: Date.now() }));
    store.saveDecision(makeRow({ type: 'analysis', confidence: 0.6, latency_ms: 200, timestamp: Date.now() }));
    store.saveDecision(makeRow({ type: 'tuning', confidence: 0.9, latency_ms: 50, timestamp: Date.now() }));
    const stats = store.getDecisionStats(60_000);
    expect(stats.total).toBe(3);
    expect(stats.byType['analysis']).toBe(2);
    expect(stats.byType['tuning']).toBe(1);
    expect(stats.avgConfidence).toBeCloseTo(0.767, 1);
  });

  it('should export decisions by timestamp range', () => {
    store.saveDecision(makeRow({ timestamp: 100 }));
    store.saveDecision(makeRow({ timestamp: 200 }));
    store.saveDecision(makeRow({ timestamp: 300 }));
    const exported = store.exportDecisions(150, 250);
    expect(exported.length).toBe(1);
    expect(exported[0].timestamp).toBe(200);
  });

  it('should respect limit', () => {
    for (let i = 0; i < 10; i++) store.saveDecision(makeRow());
    const results = store.queryDecisions({ limit: 3 });
    expect(results.length).toBe(3);
  });
});
