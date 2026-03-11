/**
 * Base Agent Tests
 */

import { describe, expect, test } from '@jest/globals';
import { BaseAgent, TradingEvent, ActionPlan, ExecutionResult, VerificationResult } from './base-agent';
import { AgentEventBus } from '../a2ui/agent-event-bus';
import { AutonomyLevel } from '../a2ui/types';

/** Test agent implementation */
class TestAgent extends BaseAgent {
  async plan(event: TradingEvent): Promise<ActionPlan> {
    return {
      agentId: this.agentId,
      actions: [{ type: 'ANALYZE', description: 'Test action', params: {} }],
      confidence: 0.9,
      rationale: 'Test rationale',
    };
  }

  async execute(plan: ActionPlan, event?: TradingEvent): Promise<ExecutionResult> {
    return {
      success: true,
      output: { test: 'result' },
      duration: 100,
    };
  }

  async verify(result: ExecutionResult): Promise<VerificationResult> {
    return {
      passed: result.success,
      score: result.success ? 0.9 : 0,
      findings: result.success ? ['Test passed'] : ['Test failed'],
      recommendations: [],
    };
  }
}

describe('BaseAgent', () => {
  test('creates agent with correct id', () => {
    const eventBus = AgentEventBus.getInstance();
    const agent = new TestAgent('test-agent', eventBus);
    expect(agent.getId()).toBe('test-agent');
  });

  test('sets initial autonomy level', () => {
    const eventBus = AgentEventBus.getInstance();
    const agent = new TestAgent('test-agent', eventBus, AutonomyLevel.PLAN);
    expect(agent.getAutonomyLevel()).toBe(AutonomyLevel.PLAN);
  });

  test('updates autonomy level', () => {
    const eventBus = AgentEventBus.getInstance();
    const agent = new TestAgent('test-agent', eventBus);
    agent.setAutonomyLevel(AutonomyLevel.AUTONOMOUS);
    expect(agent.getAutonomyLevel()).toBe(AutonomyLevel.AUTONOMOUS);
  });

  test('processes event through Plan-Execute-Verify pipeline', async () => {
    const eventBus = AgentEventBus.getInstance();
    const agent = new TestAgent('test-agent', eventBus);

    const event: TradingEvent = {
      type: 'MARKET_DATA',
      symbol: 'BTC/USD',
      timestamp: Date.now(),
      data: { price: 50000 },
      tenantId: 'test-tenant',
    };

    const result = await agent.process(event);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.findings).toContain('Test passed');
  });

  test('handles process errors gracefully', async () => {
    const eventBus = AgentEventBus.getInstance();

    class FailingAgent extends BaseAgent {
      async plan(): Promise<ActionPlan> {
        throw new Error('Intentional test failure');
      }

      async execute(): Promise<ExecutionResult> {
        return { success: true, output: {}, duration: 0 };
      }

      async verify(): Promise<VerificationResult> {
        return { passed: true, score: 1, findings: [], recommendations: [] };
      }
    }

    const agent = new FailingAgent('failing-agent', eventBus);

    const event: TradingEvent = {
      type: 'MARKET_DATA',
      symbol: 'BTC/USD',
      timestamp: Date.now(),
      data: {},
      tenantId: 'test-tenant',
    };

    const result = await agent.process(event);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.findings[0]).toContain('Intentional test failure');
  });
});
