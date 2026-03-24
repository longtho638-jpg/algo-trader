import { describe, it, expect, beforeEach } from 'vitest';
import { EventClusterAgent } from '../../src/agents/event-cluster-agent.js';
import { createTask } from '../../src/agents/agent-base.js';

describe('EventClusterAgent', () => {
  let agent: EventClusterAgent;

  beforeEach(() => {
    agent = new EventClusterAgent();
  });

  it('validates task type matching', () => {
    const task = createTask('event-cluster', {});
    expect(agent.canHandle(task)).toBe(true);

    const otherTask = createTask('volume-alert', {});
    expect(agent.canHandle(otherTask)).toBe(false);
  });

  it('agent has correct metadata', () => {
    expect(agent.name).toBe('event-cluster');
    expect(agent.description).toContain('correlation');
    expect(agent.taskTypes).toContain('event-cluster');
  });

  it('returns valid result structure', async () => {
    const task = createTask('event-cluster', { minMarkets: 3, minPriceDiff: 0.10, limit: 30 });
    const result = await agent.execute(task);

    expect(result.success).toBeDefined();
    expect(result.agentName).toBe('event-cluster');
    expect(result.taskId).toBe(task.id);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('result data includes required fields', async () => {
    const task = createTask('event-cluster', { minMarkets: 3, minPriceDiff: 0.10, limit: 30 });
    const result = await agent.execute(task);

    expect(result.data).toHaveProperty('scanned');
    expect(result.data).toHaveProperty('clustersFound');
    expect(result.data).toHaveProperty('results');
    expect(result.data).toHaveProperty('note');
  });

  it('accepts custom parameters', async () => {
    const task = createTask('event-cluster', { minMarkets: 2, minPriceDiff: 0.20, limit: 50 });
    const result = await agent.execute(task);

    expect(result.taskId).toBe(task.id);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('measures execution time', async () => {
    const task = createTask('event-cluster', { minMarkets: 3, minPriceDiff: 0.10, limit: 30 });
    const result = await agent.execute(task);

    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('task type is in supported task types', () => {
    expect(agent.taskTypes).toContain('event-cluster');
  });

  it('can handle multiple consecutive executions', async () => {
    const task1 = createTask('event-cluster', { minMarkets: 3, minPriceDiff: 0.10, limit: 30 });
    const result1 = await agent.execute(task1);
    expect(result1.success).toBeDefined();

    const task2 = createTask('event-cluster', { minMarkets: 2, minPriceDiff: 0.20, limit: 50 });
    const result2 = await agent.execute(task2);
    expect(result2.success).toBeDefined();

    expect(result1.taskId).not.toBe(result2.taskId);
  });

  it('returns consistent agent name', async () => {
    const task = createTask('event-cluster', { minMarkets: 3, minPriceDiff: 0.10, limit: 30 });
    const result = await agent.execute(task);

    expect(result.agentName).toBe(agent.name);
  });

  it('handles default parameters', async () => {
    const task = createTask('event-cluster', {});
    const result = await agent.execute(task);

    expect(result.success).toBeDefined();
    expect(result.data).toHaveProperty('scanned');
  });
});
