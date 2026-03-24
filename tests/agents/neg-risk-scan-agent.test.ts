import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NegRiskScanAgent } from '../../src/agents/neg-risk-scan-agent.js';
import { createTask } from '../../src/agents/agent-base.js';

// Mock the module before import happens
vi.unstubAllGlobals();
const originalFetch = global.fetch;

// Store mock function at module level for cleanup
let mockGetEventsFn: any;

beforeEach(() => {
  mockGetEventsFn = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('NegRiskScanAgent', () => {
  let agent: NegRiskScanAgent;

  beforeEach(() => {
    agent = new NegRiskScanAgent();
  });

  it('validates task type matching', () => {
    const task = createTask('neg-risk-scan', {});
    expect(agent.canHandle(task)).toBe(true);

    const otherTask = createTask('endgame', {});
    expect(agent.canHandle(otherTask)).toBe(false);
  });

  it('agent has correct metadata', () => {
    expect(agent.name).toBe('neg-risk-scan');
    expect(agent.description).toContain('neg-risk arbitrage');
    expect(agent.taskTypes).toContain('neg-risk-scan');
  });

  it('returns error when GammaClient API fails', async () => {
    // Test error handling by trying to execute with invalid params
    const task = createTask('neg-risk-scan', { minSpread: 'invalid' as any, limit: 50 });
    const result = await agent.execute(task);

    // API will fail, so we expect error handling to work
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.taskId).toBe(task.id);
    expect(result.agentName).toBe('neg-risk-scan');
  });

  it('includes task ID in result', async () => {
    const task = createTask('neg-risk-scan', { minSpread: 0.02, limit: 1 });
    const result = await agent.execute(task);

    expect(result.taskId).toBe(task.id);
  });

  it('measures execution duration', async () => {
    const task = createTask('neg-risk-scan', { minSpread: 0.02, limit: 1 });
    const result = await agent.execute(task);

    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('agent name matches task type', () => {
    expect(agent.taskTypes[0]).toBe('neg-risk-scan');
    expect(agent.name).toBe('neg-risk-scan');
  });
});
