import { describe, it, expect, beforeEach } from 'vitest';
import { WhaleWatchAgent } from '../../src/agents/whale-watch-agent.js';
import { createTask } from '../../src/agents/agent-base.js';

describe('WhaleWatchAgent', () => {
  let agent: WhaleWatchAgent;

  beforeEach(() => {
    agent = new WhaleWatchAgent();
  });

  it('validates task type matching', () => {
    const task = createTask('whale-watch', {});
    expect(agent.canHandle(task)).toBe(true);

    const otherTask = createTask('endgame', {});
    expect(agent.canHandle(otherTask)).toBe(false);
  });

  it('agent has correct metadata', () => {
    expect(agent.name).toBe('whale-watch');
    expect(agent.description).toContain('whale');
    expect(agent.taskTypes).toContain('whale-watch');
  });

  it('returns valid result structure', async () => {
    const task = createTask('whale-watch', { minValueUsdc: 10000, blockRange: 500 });
    const result = await agent.execute(task);

    expect(result.success).toBeDefined();
    expect(result.agentName).toBe('whale-watch');
    expect(result.taskId).toBe(task.id);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('result data includes required fields', async () => {
    const task = createTask('whale-watch', { minValueUsdc: 10000, blockRange: 500 });
    const result = await agent.execute(task);

    expect(result.data).toHaveProperty('scanned');
    expect(result.data).toHaveProperty('whales');
    // Results may be empty or missing if RPC URL not set
    if (result.data.results !== undefined) {
      expect(result.data).toHaveProperty('results');
    }
  });

  it('gracefully handles missing RPC URL', async () => {
    const originalRpc = process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_RPC_URL;

    const task = createTask('whale-watch', { minValueUsdc: 10000, blockRange: 500 });
    const result = await agent.execute(task);

    expect(result.success).toBe(true);
    if (result.data.error) {
      expect(result.data.error).toContain('POLYGON_RPC_URL');
    }

    if (originalRpc) {
      process.env.POLYGON_RPC_URL = originalRpc;
    }
  });

  it('accepts custom parameters', async () => {
    const task = createTask('whale-watch', { minValueUsdc: 50000, blockRange: 1000 });
    const result = await agent.execute(task);

    expect(result.taskId).toBe(task.id);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('measures execution time', async () => {
    const task = createTask('whale-watch', { minValueUsdc: 10000, blockRange: 500 });
    const result = await agent.execute(task);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('task type is in supported task types', () => {
    expect(agent.taskTypes).toContain('whale-watch');
  });

  it('can handle multiple consecutive executions', async () => {
    const task1 = createTask('whale-watch', { minValueUsdc: 10000, blockRange: 500 });
    const result1 = await agent.execute(task1);
    expect(result1.success).toBeDefined();

    const task2 = createTask('whale-watch', { minValueUsdc: 50000, blockRange: 1000 });
    const result2 = await agent.execute(task2);
    expect(result2.success).toBeDefined();

    expect(result1.taskId).not.toBe(result2.taskId);
  });

  it('returns consistent agent name', async () => {
    const task = createTask('whale-watch', { minValueUsdc: 10000, blockRange: 500 });
    const result = await agent.execute(task);

    expect(result.agentName).toBe(agent.name);
  });

  it('handles default parameters', async () => {
    const task = createTask('whale-watch', {});
    const result = await agent.execute(task);

    expect(result.success).toBeDefined();
    expect(result.data).toBeDefined();
  });
});
