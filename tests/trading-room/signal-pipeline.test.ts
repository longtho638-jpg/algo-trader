import { describe, it, expect, vi } from 'vitest';
import { SignalPipeline, type TradingSignal } from '../../src/trading-room/signal-pipeline.js';

function makeSignal(overrides: Partial<TradingSignal> = {}): TradingSignal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    source: 'test-strategy',
    symbol: 'BTC/USDT',
    side: 'buy',
    confidence: 0.8,
    size: '100',
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Helper: addSignal then wait for async processing to complete */
async function addAndWait(pipeline: SignalPipeline, signal: TradingSignal, ms = 100): Promise<void> {
  pipeline.addSignal(signal);
  // Wait for the async processSignal to finish (it has a 5ms sleep in execute stage)
  await new Promise(r => setTimeout(r, ms));
}

describe('SignalPipeline', () => {
  it('should process a valid signal through all stages', async () => {
    const pipeline = new SignalPipeline();
    const signal = makeSignal();
    await addAndWait(pipeline, signal);
    const history = pipeline.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].stage).toBe('confirm');
    expect(history[0].notes).toContain('confirmed');
  });

  it('should reject signal with low confidence', async () => {
    const pipeline = new SignalPipeline();
    const signal = makeSignal({ confidence: 0.2 });
    await addAndWait(pipeline, signal);
    const history = pipeline.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].error).toContain('Confidence');
  });

  it('should reject signal missing symbol', async () => {
    const pipeline = new SignalPipeline();
    const signal = makeSignal({ symbol: '' });
    await addAndWait(pipeline, signal);
    const history = pipeline.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].error).toContain('Missing symbol');
  });

  it('should reject oversized signal at risk-check', async () => {
    const pipeline = new SignalPipeline();
    const signal = makeSignal({ size: '999999' });
    await addAndWait(pipeline, signal);
    const history = pipeline.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].error).toContain('risk limit');
  });

  it('should fire stage callbacks', async () => {
    const pipeline = new SignalPipeline();
    const stages: string[] = [];
    pipeline.onStageComplete((record) => stages.push(record.stage));
    await addAndWait(pipeline, makeSignal());
    expect(stages).toEqual(['validate', 'risk-check', 'execute', 'confirm']);
  });

  it('should not duplicate signals with same id', async () => {
    const pipeline = new SignalPipeline();
    const signal = makeSignal({ id: 'dup-1' });
    pipeline.addSignal(signal);
    pipeline.addSignal(signal); // Should warn and skip
    await new Promise(r => setTimeout(r, 100));
    // Only one processed
    expect(pipeline.getHistory().length).toBe(1);
  });

  it('should cap history at 200', async () => {
    const pipeline = new SignalPipeline();
    for (let i = 0; i < 210; i++) {
      await addAndWait(pipeline, makeSignal({ id: `s-${i}` }), 20);
    }
    expect(pipeline.getHistory().length).toBeLessThanOrEqual(200);
  });

  it('should limit history results', async () => {
    const pipeline = new SignalPipeline();
    for (let i = 0; i < 10; i++) {
      await addAndWait(pipeline, makeSignal({ id: `lim-${i}` }), 20);
    }
    expect(pipeline.getHistory(3).length).toBe(3);
  });

  it('should execute with no executor (simulation mode)', async () => {
    const pipeline = new SignalPipeline();
    await addAndWait(pipeline, makeSignal());
    const history = pipeline.getHistory();
    expect(history[0].notes.some(n => n.includes('no executor'))).toBe(true);
  });

  it('should execute with executor in dry-run', async () => {
    const pipeline = new SignalPipeline();
    const executor = {
      execute: vi.fn().mockResolvedValue({ orderId: 'o-1', fillPrice: '50000', fillSize: '0.1' }),
    };
    pipeline.setExecutor(executor as any, true);
    await addAndWait(pipeline, makeSignal());
    expect(executor.execute).toHaveBeenCalled();
  });
});
